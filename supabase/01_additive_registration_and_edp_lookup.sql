-- SCsystem additive migration
-- Review the live schema and auth.users trigger order with 02_schema_audit_queries.sql first.
-- This script does not rename or delete existing tables/columns and does not disable RLS.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS course text;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Keep the existing profile-creation trigger. This second trigger only copies the
-- new name/course fields after the existing trigger has inserted the profile row.
CREATE OR REPLACE FUNCTION public.sync_scsystem_signup_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  signup_role text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'student');
  signup_full_name text := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(concat_ws(' ',
      NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'middle_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'last_name', '')
    ), '')
  );
  affected_rows integer;
BEGIN
  IF signup_role = 'student' THEN
    UPDATE public.students
    SET
      first_name = NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
      middle_name = NULLIF(NEW.raw_user_meta_data ->> 'middle_name', ''),
      last_name = NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
      course = NULLIF(NEW.raw_user_meta_data ->> 'course', ''),
      edp_number = COALESCE(NULLIF(edp_number, ''), NULLIF(NEW.raw_user_meta_data ->> 'edp_number', '')),
      full_name = COALESCE(signup_full_name, full_name)
    WHERE id = NEW.id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows = 0 THEN
      RAISE EXCEPTION 'SCsystem student profile was not created for new account %', NEW.id;
    END IF;
  ELSIF signup_role = 'staff' THEN
    UPDATE public.staff
    SET
      first_name = NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
      middle_name = NULLIF(NEW.raw_user_meta_data ->> 'middle_name', ''),
      last_name = NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
      full_name = COALESCE(signup_full_name, full_name),
      email = COALESCE(NULLIF(email, ''), NEW.email),
      status = 'pending'
    WHERE id = NEW.id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows = 0 THEN
      RAISE EXCEPTION 'SCsystem staff profile was not created for new account %', NEW.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported SCsystem registration role: %', signup_role;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_scsystem_signup_profile_fields() FROM PUBLIC, anon, authenticated;

-- PostgreSQL fires triggers of the same timing/event in alphabetical name order.
-- Keep this trigger name after the existing profile-creation trigger, and verify
-- that ordering in the audit output before running this migration.
DROP TRIGGER IF EXISTS zzzzzz_sync_scsystem_signup_profile_fields ON auth.users;
CREATE TRIGGER zzzzzz_sync_scsystem_signup_profile_fields
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_scsystem_signup_profile_fields();

-- This RPC returns only the fields needed to identify a point recipient.
-- It does not expose photo URLs, bio, points balance, or other profile columns.
CREATE OR REPLACE FUNCTION public.lookup_student_by_edp(p_edp text)
RETURNS TABLE (
  id uuid,
  full_name text,
  first_name text,
  middle_name text,
  last_name text,
  edp_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to look up a student.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students AS own_student WHERE own_student.id = caller_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.staff AS own_staff
       WHERE own_staff.id = caller_id AND own_staff.status = 'approved'
     ) THEN
    RAISE EXCEPTION 'This account is not allowed to look up students.';
  END IF;

  IF (SELECT count(*) FROM public.students AS duplicate_check
      WHERE duplicate_check.edp_number::text = btrim(p_edp)) > 1 THEN
    RAISE EXCEPTION 'More than one student uses this EDP number. Ask an administrator to resolve the duplicate.';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.full_name::text,
    s.first_name::text,
    s.middle_name::text,
    s.last_name::text,
    s.edp_number::text
  FROM public.students AS s
  WHERE s.edp_number::text = btrim(p_edp)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_student_by_edp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_student_by_edp(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_student_by_edp(text) TO authenticated;
