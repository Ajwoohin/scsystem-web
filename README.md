# SCsystem Website

Static website for SCsystem, connected to the same Supabase project as the Flutter app.

## Quick start

Open the website folder in VS Code and run it with Live Server (or another local web server). Do not open the HTML pages through `file://`, because the site uses JavaScript modules.

## Add the Flutter Android app download

The landing page and dashboard both have a **Download app now!** button. Both buttons download this relative path: `downloads/SCsystem.apk`. The website ZIP does not include an APK because the Flutter project must build the real app first. The download button will work after you copy the built APK into the published website's `downloads` folder. Keep that folder next to `index.html`.

### 1. Build a release APK

Open a terminal in your Flutter app project folder (the folder that contains `pubspec.yaml`). In PowerShell or the VS Code terminal, run:

```powershell
flutter doctor
flutter pub get
flutter build apk --release
```

When the build succeeds, the APK is normally at:

```text
build\app\outputs\flutter-apk\app-release.apk
```

To open that folder and see the generated APK in File Explorer, run this from the Flutter project folder:

```powershell
explorer .\build\app\outputs\flutter-apk\
```

The normal `flutter build apk --release` command makes one APK that supports the common Android architectures. It is usually easier for a direct website download than split APKs. Flutter's official Android release guide: https://docs.flutter.dev/deployment/android

### 2. Copy the APK into the website

Replace the example paths below with the real folders on your computer. `$WebsiteRepo` must be the root folder published by GitHub Pages—the folder that contains `index.html` (not just an outer ZIP extraction folder).

```powershell
$FlutterProject = "C:\path\to\your\flutter-project"
$WebsiteRepo = "C:\path\to\your\website-repository"

New-Item -ItemType Directory -Force "$WebsiteRepo\downloads" | Out-Null
Copy-Item "$FlutterProject\build\app\outputs\flutter-apk\app-release.apk" "$WebsiteRepo\downloads\SCsystem.apk" -Force
```

If the commands are being run from inside the Flutter project, you can still use the absolute `$WebsiteRepo` path as shown. Check that the copied file exists:

```powershell
Get-Item "$WebsiteRepo\downloads\SCsystem.apk" | Select-Object FullName, Length
```

### 3. Test before publishing

1. Start the website locally using VS Code Live Server.
2. Click **Download app now!** on the landing page.
3. Confirm that a file named `SCsystem.apk` downloads and is not a 404 page or an HTML file.
4. On an Android phone, transfer/open the APK and install it. Android may ask permission to install apps from the browser or file manager. Only install APKs you trust.
5. After GitHub Pages deploys, test the button again on the live website URL.

### 4. Commit and push the website change

Open a terminal in the local website Git repository—the folder containing `index.html` and the `.git` folder. Make sure the APK has already been copied into `downloads/SCsystem.apk`. Then run:

```powershell
git status
git add index.html dashboard.html css/style.css css/dashboard.css README.md downloads/README.md downloads/SCsystem.apk
git commit -m "Add SCsystem Android app download"
git push
```

If Git says there is no upstream branch, check your branch with `git branch --show-current`, then push it with `git push -u origin YOUR-BRANCH-NAME` (replace the example name). If GitHub Pages deploys from a particular branch or folder, make sure these files are in that published location. Wait for the Pages deployment to finish, then test the live download URL.

**GitHub file-size note:** GitHub rejects normal Git files larger than 100 MiB. If your APK is bigger than that, use a release/download hosting location and point the button at its public APK URL instead of committing the APK into the website repository.

### Updating the APK later

Rebuild the APK after changing the Flutter app, copy the new `app-release.apk` over `downloads/SCsystem.apk`, and commit/push again using the commands above. Keep the Android application ID and signing key consistent so existing users can install app updates over their current copy.

## Supabase setup

`js/config.js` contains the project's URL and publishable key. Keep this as the public/publishable key; never place a Supabase service-role key in browser code.

The website uses the same tables, storage buckets, and RPC functions referenced by the Flutter source:

- Tables: `students`, `staff`, `buses`, `announcements`, `announcement_reactions`, `announcement_comments`, `quests`, `quest_acceptances`
- Storage buckets: `profile-photos`, `announcement-images`, `quest-proofs`
- RPC functions: `award_points`, `staff_reward_student`, `recompute_quest_completion`

The database policies must allow each signed-in role the same operations it already uses in the mobile app. Realtime must be enabled for the tables whose changes should appear live. The staff registration flow relies on the existing Supabase auth trigger creating a `staff` row with a pending status from user metadata (`role: staff`); student registration similarly relies on the trigger creating the `students` row.

## Accounts

- Student sign-up requires an `@sccpag.edu.ph` email.
- Entering `000` as the EDP number switches sign-up to staff registration; staff accounts require administration approval.
- Administration sign-in accepts the administrator email found in the Flutter app. Supabase Auth validates the password; the password is not hardcoded into the website.

## Main website features

- Sign-up and login using Supabase Auth
- Role-aware home/profile dashboard
- Student bio and profile-photo updates, and student QR display
- Live bus status; administrators can update statuses
- Live announcements with optional images, expiration, reactions, and comments
- Quests, acceptance, image proof submission, and staff/administrator review using the same point-award RPC functions as the app
- Administrator staff-request approval

If an action is denied, check the relevant Supabase RLS or Storage policy before changing the frontend. Do not resolve permission problems by exposing a service-role key.
