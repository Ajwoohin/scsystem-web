-- Read-only SCsystem schema and compatibility audit.
-- Run in Supabase Dashboard > SQL Editor. These statements do not change data.

-- 1. Confirm important table names exist, including the APK's quest_acceptances table.
SELECT
  to_regclass('public.students') AS students,
  to_regclass('public.staff') AS staff,
  to_regclass('public.buses') AS buses,
  to_regclass('public.announcements') AS announcements,
  to_regclass('public.announcement_comments') AS announcement_comments,
  to_regclass('public.announcement_reactions') AS announcement_reactions,
  to_regclass('public.quests') AS quests,
  to_regclass('public.quest_acceptances') AS quest_acceptances,
  to_regclass('public.guest_acceptances') AS guest_acceptances,
  to_regclass('public.point_transactions') AS point_transactions,
  to_regclass('public.point_distributions') AS point_distributions,
  to_regclass('public.quest_history_log') AS quest_history_log;

-- 2. Tables and columns.
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 2a. Enum values (use this if staff.status or quest_acceptances.status is USER-DEFINED).
SELECT
  ns.nspname AS enum_schema,
  t.typname AS enum_type,
  e.enumlabel AS enum_value,
  e.enumsortorder AS enum_order
FROM pg_type AS t
JOIN pg_enum AS e ON e.enumtypid = t.oid
JOIN pg_namespace AS ns ON ns.oid = t.typnamespace
ORDER BY ns.nspname, t.typname, e.enumsortorder;

-- 3. Primary keys, foreign keys, and unique constraints.
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_type,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position;

-- 4. Indexes, including any existing EDP uniqueness rule.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. RLS enabled/forced state.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 6. Existing RLS policies. Do not disable RLS as a workaround.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 7. Auth trigger order and trigger functions. Check this before applying the
-- registration sync trigger in 01_additive_registration_and_edp_lookup.sql.
SELECT
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid, true) AS trigger_definition,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'auth'
  AND c.relname = 'users'
ORDER BY t.tgname;

-- 8. SCsystem RPC definitions and SECURITY DEFINER status.
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'award_points',
    'staff_reward_student',
    'transfer_points',
    'admin_distribute_points',
    'recompute_quest_completion',
    'lookup_student_by_edp'
  )
ORDER BY p.proname;

-- 9. RPC execution grants.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'award_points',
    'staff_reward_student',
    'transfer_points',
    'admin_distribute_points',
    'recompute_quest_completion',
    'lookup_student_by_edp'
  )
ORDER BY routine_name, grantee, privilege_type;

-- 10. Check duplicate EDP values before creating or relying on a unique index.
SELECT edp_number::text AS edp_number, count(*) AS row_count
FROM public.students
WHERE edp_number IS NOT NULL AND btrim(edp_number::text) <> ''
GROUP BY edp_number::text
HAVING count(*) > 1
ORDER BY row_count DESC, edp_number;

-- 11. Tables included in Supabase Realtime publication.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;

-- 12. Storage buckets currently in use.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;
