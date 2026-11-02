# SCsystem Supabase guide (APK-compatible)

This guide reflects the schema SQL the project owner supplied in chat. It confirms the listed tables, columns, primary keys, unique constraints, and foreign keys in that schema snapshot. It does **not** include the live RLS policies, Auth trigger definitions, function bodies/grants, or complete Storage policies. Run the included read-only audit against the actual Supabase project before applying the migration.

## 1. Confirmed existing database structures

The supplied schema already has these important safeguards and fields:

- `students.edp_number` is `text NOT NULL UNIQUE`.
- `students.institutional_email` is `text NOT NULL UNIQUE`.
- `students.qr_code_id` is unique and defaults to `gen_random_uuid()`.
- `students.full_name` already exists and must remain for the APK.
- `students.is_admin` already exists and defaults to `false`.
- `staff.full_name` is `NOT NULL` and must remain for the APK.
- `staff.status` already defaults to `pending`.
- `quest_acceptances` is the existing quest participation table used by the APK.

Do not create another EDP unique index. The supplied schema already enforces EDP uniqueness. Do not add a second institutional-email unique index either.

## 2. Back up before changing anything

Use the Supabase Dashboard's **Database → Backups** page to check available backups. For a self-managed logical backup, use the current Supabase CLI and the database connection string from the Dashboard's **Connect** panel. Keep the connection string and database password private and outside the website repository.

```bash
supabase db dump --db-url "YOUR_CONNECTION_STRING" -f roles.sql --role-only
supabase db dump --db-url "YOUR_CONNECTION_STRING" -f schema.sql
supabase db dump --db-url "YOUR_CONNECTION_STRING" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Save the backup files somewhere outside GitHub. Database backups do not include the actual files stored in Supabase Storage; download important Storage objects separately before changing Storage.

## 3. Run the read-only audit first

1. Open the correct existing Supabase project.
2. Open **SQL Editor → New Query**.
3. Open `supabase/02_schema_audit_queries.sql` from this ZIP.
4. Run the SELECT queries individually and inspect the results.
5. Pay special attention to the RLS policies, Auth triggers, RPC definitions/grants, data types, and Storage buckets.

Before applying the migration, confirm all of the following:

- An existing Auth trigger creates a row in `public.students` for student signups and a row in `public.staff` for teacher/staff signups.
- That profile-creation trigger runs before `zzzzzz_sync_scsystem_signup_profile_fields` (PostgreSQL fires same-event triggers alphabetically by trigger name).
- The existing profile-creation trigger accepts the signup metadata used by the website (`role`, `full_name`, `first_name`, `middle_name`, `last_name`, `course`, and `edp_number`).
- `students.edp_number` is text-compatible and the profile-creation trigger supplies it when inserting a student row, because it is `NOT NULL`.
- `staff.status` can store the value `pending` (it is text in the supplied schema; verify the live schema agrees).
- No conflicting function named `public.lookup_student_by_edp(text)` already exists with a different contract.

If any item is not true or cannot be confirmed, stop and inspect the existing trigger/function definitions before running the migration. Auth trigger failures can prevent new account registration.

## 4. Necessary additive fields for the new registration form

The intended additions are:

```sql
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS course text;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text;
```

The full migration in `supabase/01_additive_registration_and_edp_lookup.sql` includes these columns, an Auth metadata synchronization trigger, and the restricted EDP lookup RPC. Review the audit conditions above and take a backup before running that complete migration.

The migration keeps `full_name` in both tables. That matters because the existing APK reads it. It also keeps the existing `students.qr_code_id`, points tables, quest tables, and existing point RPCs. It does not disable RLS or delete existing tables/columns.

The new website's teacher form validates Gmail in the browser. The shared database does not impose a Gmail-only rule because the existing APK teacher-signup flow accepts other valid email domains. New staff profiles are set to `pending`; the migration does not grant administrator privileges.

## 5. Actual relationships in the supplied schema

These are the foreign keys explicitly present in the SQL provided by the owner. In particular, several transaction and participation IDs reference `auth.users`, not `public.students` or `public.staff` directly.

| Foreign-key column | References |
|---|---|
| `students.id` | `auth.users.id` |
| `staff.id` | `auth.users.id` |
| `point_transactions.student_id` | `auth.users.id` |
| `point_distributions.staff_id` | `auth.users.id` |
| `quest_acceptances.quest_id` | `quests.id` |
| `quest_acceptances.student_id` | `auth.users.id` |
| `announcement_reactions.announcement_id` | `announcements.id` |
| `announcement_reactions.user_id` | `auth.users.id` |
| `announcement_comments.announcement_id` | `announcements.id` |
| `announcement_comments.user_id` | `auth.users.id` |

The supplied schema does **not** declare foreign keys for `quests.posted_by_id`, `quest_history_log.posted_by_id`, or the text name fields in the history/distribution tables. Do not draw or add those as enforced foreign keys unless a live audit confirms otherwise.

## 6. Tables and structures to retain for APK compatibility

Retain all existing tables unless a separate dependency/data review proves a removal is safe:

- `students`
- `staff`
- `point_transactions`
- `point_distributions`
- `quests`
- `quest_acceptances`
- `quest_history_log`
- `announcements`
- `announcement_reactions`
- `announcement_comments`
- `buses`

Do not rename or remove:

- `students.full_name` or `staff.full_name`
- `students.edp_number`, `students.institutional_email`, or `students.qr_code_id`
- `students.sc_points`, `students.profile_photo_url`, `students.bio`, `students.last_active_at`, or `students.is_admin`
- `staff.status` or `staff.sc_points`
- `quest_acceptances`, `point_transactions`, or `point_distributions`
- Existing point-related RPCs called by the APK, including `award_points`, `staff_reward_student`, `transfer_points`, `admin_distribute_points`, and `recompute_quest_completion`

The Android APK uses `students.qr_code_id`. The website's EDP QR/lookup feature is separate; do not replace the APK's QR identifier.

## 7. Security checks still required

The supplied table DDL does not show RLS policies, Auth triggers, function bodies/permissions, or complete Storage policies. Therefore, security cannot be confirmed from the schema alone.

- Keep RLS enabled and review policies for every table accessed from the browser.
- Check that students can access only their own private profile and point data, except for deliberately limited recipient lookup.
- Verify point RPCs enforce roles, amounts, balances, and recipient checks on the database side.
- Verify only approved staff can use staff-only features and that pending teachers cannot gain privileges by editing browser metadata.
- Do not trust user-editable Auth user metadata for administrator authorization.
- Never put a service-role key or database password in browser JavaScript or GitHub.
- Review `storage.objects` policies for the profile-photo, announcement-image, and quest-proof buckets. The supplied table DDL does not prove those bucket names or policies exist in the live project; confirm them with the audit.

## 8. Optional improvements — not needed for this update

Your supplied schema already enforces EDP and institutional-email uniqueness. Do not add duplicate unique indexes. Consider additional indexes only after checking existing indexes and actual query usage. Do not delete `guest_acceptances`, old functions, triggers, columns, or Storage buckets merely because the final website does not use them; first check their data and dependencies.

There is no need to redesign the database just to make the ERD look simpler. Draw the ERD from the live foreign keys and constraints.
