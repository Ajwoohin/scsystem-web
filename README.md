# SCsystem Website – Version 3

A static GitHub Pages frontend connected to the existing Supabase project. The authenticated dashboard uses small ES-module page classes and the existing `students`, `staff`, buses, announcements, quests, and points structures.

## Run locally

Use VS Code Live Server or another local HTTP server. Do not open the HTML files with `file://`; the website uses JavaScript ES modules.

## Supabase configuration

`js/config.js` contains the existing Supabase project URL and publishable key. Keep the service-role key and database password out of browser code and out of GitHub.

Before database changes, run `supabase/02_schema_audit_queries.sql` in the Supabase SQL Editor and follow `SUPABASE_DATABASE_GUIDE.md`. The additive migration is `supabase/01_additive_registration_and_edp_lookup.sql`. It is not applied automatically. Confirm the existing profile-creation trigger and trigger order before running it.

## Registration

- Student signup collects first name, optional middle name, last name, a fixed course dropdown, EDP number, SCC institutional email, password, confirmation, and Terms acceptance.
- Teacher signup has its own landing-page button and collects separate name fields, personal Gmail, password, confirmation, and Terms acceptance.
- Teacher accounts are tagged as `staff` and set to pending by the optional database trigger until an administrator approves them. The website enforces Gmail in its form; the shared database does not impose that domain globally because the existing APK teacher-signup path allows other valid email domains.
- `full_name` is still sent in signup metadata and must remain in the database for the APK.

## Dashboard features

- Role-aware navigation for students, approved teachers, and administrators
- Student profile, bio, and existing `profile-photos` upload bucket
- EDP QR display and manual EDP recipient lookup for point transfers
- Live bus status and approved teacher/admin bus controls
- Announcements, image uploads, reactions, and comments
- Quests, acceptances, proof uploads, review, rewards, and history
- Student point transfers, teacher rewards, administrator awards, staff distribution, and history
- Teacher approval/decline by an administrator

The web dashboard uses `quest_acceptances`, matching Version 1 and the APK. The APK's own QR flow continues to use its existing `qr_code_id` field; the website's QR display is EDP-based. The website does not add a camera scanner.

## APK download

The Download App Now links open the supplied Google Drive URL in a new tab. No APK binary is included in the website package.

## GitHub Pages

Extract the ZIP and upload the contents of this folder to the GitHub Pages repository root (or the configured publishing folder). The ZIP intentionally excludes `.git`, `.vscode`, `node_modules`, APK binaries, and private database credentials.

See `SUPABASE_DATABASE_GUIDE.md` for backups, audit steps, safe migration instructions, and the structures that should remain untouched for APK compatibility.

## Windows filename compatibility

The dashboard controller and dashboard startup entry point use distinct filenames: `js/DashboardApp.js` and `js/dashboard-entry.js`. Do not rename them to names that differ only by capitalization; Windows filesystems commonly treat those as the same path.
