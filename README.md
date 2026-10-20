# QR-ATT School Event Attendance

QR-ATT is an Expo SDK 54 / React Native application using Expo Router and Supabase Auth/Postgres. Supabase's anon/publishable key is used in the app; authorization is enforced by row-level security and database functions, not by hiding screens.

## Requirements

- Node.js LTS and npm
- Expo Go compatible with Expo SDK 54 (or an EAS development build)
- A Supabase project

## Install and run

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Copy `.env.example` to `.env` and replace both values with the Supabase project URL and anon/publishable key. These are public client configuration values; never put a service-role key in the app.

3. In the Supabase Dashboard, open **SQL Editor**, create a new query, paste the complete contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it as the project owner.

4. Start Expo:

   ```powershell
   npx.cmd expo start
   ```

   In PowerShell on Windows, use the `.cmd` launcher (`npx.cmd` / `npm.cmd`) because the default `npx.ps1` may be blocked by the script execution policy. For web, use `npx.cmd expo start --web --port 8082`. Scan the terminal QR code using Expo Go, or open the printed local URL.

Event codes must be unique. If a code is already in use, the create form asks for a different code and will not display a stale QR.

### Database setup and upgrades

The schema creates `profiles`, `events`, `attendance`, and `audit_log`, enables RLS, installs profile creation and timestamp triggers, and defines attendance/role-management RPCs. It is idempotent for a clean database and uses `create table if not exists`; it does not destructively replace existing tables.

Before running it against an existing project, export a database backup and inspect the existing table definitions. The script adds newer columns such as `events.event_date` to existing tables, adds missing attendance foreign keys to profiles/events, and backfills event dates from `start_time` and attendance timestamps from the legacy `scanned_at` column when available. New foreign keys are initially `NOT VALID` so pre-existing orphan rows do not block setup; new writes are still checked by Postgres. If legacy timestamp values are malformed, correct them before retrying. The script replaces existing RLS policies on its four tables with the policies in the script, so review custom policies before execution. It stops with an actionable error if duplicate attendance rows prevent the uniqueness constraint; reconcile those duplicates and rerun. Do not drop live tables to make the script pass.

If the admin dashboard reports that no relationship exists between `attendance` and `profiles`, run [`supabase/fix-attendance-relationships.sql`](./supabase/fix-attendance-relationships.sql) in the SQL Editor, then refresh the app. To allow attendance for any event whose status is open (including an event before its scheduled start time), run [`supabase/fix-open-event-attendance.sql`](./supabase/fix-open-event-attendance.sql) in the SQL Editor. The event's open/closed status controls availability; its scheduled times remain informational.

New registrations always receive the `student` role. To bootstrap the first administrator, first create and confirm that user's account, then execute this one-time statement in the Supabase SQL Editor as the project owner, replacing the email:

```sql
update public.profiles
set role = 'admin'
where email = 'trusted-admin@school.edu';
```

For the accounts in the provided Supabase Auth screenshot, run [`supabase/assign-screenshot-roles.sql`](./supabase/assign-screenshot-roles.sql) once in the SQL Editor after `schema.sql`. It assigns `administrator@gmail.com` as Administrator, `clintcaserial@gmail.com` as Student, and `teacher@gmail.com` as Teacher, and returns the resulting rows. It fails if any of those Auth users are missing. Re-running it reapplies these exact assignments.

Thereafter, an authenticated administrator can use `admin_set_user_role` to assign `student`, `teacher`, or `admin`. The RPC prevents demoting the last administrator. Never expose a service-role key to the mobile app.

## Implemented flows

- Sign-up stores the name as Auth metadata; the database trigger creates a student profile. A user cannot choose teacher/admin during sign-up.
- Sign-in/session persistence and sign-out use Supabase Auth.
- Profile name editing is constrained by SQL grants and RLS; the role cannot be changed through profile editing.
- Teacher event creation stores the event code, title, description, date/time, venue, status, and creator. The QR contains the exact event code returned from the saved database row, not a student identity. The default start time is five minutes before creation so newly created events can be scanned immediately; selecting a future start time keeps attendance closed until then.
- Attendance calls `record_attendance` with the event code. The database obtains the student ID from `auth.uid()`, checks the student role and open event status, and enforces one attendance row per student/event.
- Attendance history is scoped to the signed-in student. Teachers may read attendance for events they own; administrator reads are permitted by RLS.
- `admin_set_user_role` requires the administrator role and records role changes in `audit_log`.
- `admin_correct_attendance` and `admin_delete_attendance` require the administrator role and audit the previous attendance state before/while making the correction.
- Administrator accounts land on a dedicated dashboard with system totals, user search/role management, event close/reopen controls, and attendance search/correction/deletion actions. The database RPCs re-check administrator privileges for each privileged mutation.
- The role-specific tab bar places Admin before Profile for administrator accounts; Profile remains available for name editing, account details, and sign-out.

## Role-by-role test checklist

Run these against a non-production Supabase project after executing the schema:

### Student

- [ ] Register; verify the profile is automatically created with role `student`.
- [ ] Sign out and back in; verify the session restores and profile data loads.
- [ ] Try editing profile name; verify it succeeds, and direct role updates fail.
- [ ] Scan a valid open event QR during its time window; verify attendance appears once in history.
- [ ] Scan the same QR again; verify duplicate attendance is rejected.
- [ ] Scan an invalid code and a QR for a closed event; verify each is rejected.
- [ ] Attempt direct attendance insert and another student's history query; verify RLS denies them.

### Teacher

- [ ] Promote a test account to teacher through an administrator account.
- [ ] Create an event; verify its QR works for an authorized student.
- [ ] Verify the teacher can read attendance for their own event but cannot edit another teacher's event.
- [ ] Verify the teacher cannot record student attendance through the student RPC.

### Administrator

- [ ] Bootstrap/promote a test administrator using the SQL Editor.
- [ ] Call `admin_set_user_role` to promote/demote a test account; verify `audit_log` records the change.
- [ ] Verify administrator RLS access to profiles, events, attendance, and audit records.
- [ ] Verify non-admin calls to `admin_set_user_role` fail.
- [ ] Search users/events/attendance by name, email, event, date, or status in the administrator dashboard; verify role changes, event close/reopen, and attendance correction/deletion reload the dashboard and are recorded in the audit log.

## Event-driven workflows (Event → Handler → Action → Result)

1. Login button → `handleLogin` → Supabase `signInWithPassword` → session is established and the app enters its authenticated tabs.
2. Registration submitted → `handleRegister` / `signUp` → Supabase creates the Auth user and the database trigger creates a student profile → confirmation or actionable error is shown.
3. QR detected → `handleBarcodeScanned` → QR parser extracts the event code → malformed content is rejected before database submission.
4. Attendance submitted → `registerAttendance` → `record_attendance` verifies session, student role, open event status and uniqueness → success or database rejection is shown.
5. Event submitted → `handleCreateEvent` / `createEvent` → authenticated insert under event RLS → saved event and QR are displayed, or the database error is shown.
6. Administrator closes/reopens an event → event status update under the events RLS policy → status is persisted → attendance RPC immediately honors the updated event state, regardless of scheduled time.
7. Profile opened → `useFocusEffect` loads `getProfile` → profile fields are displayed or an unavailable state appears.
8. Administrator role change → `admin_set_user_role` → database verifies caller role and writes an audit record → role applies to subsequent authorization checks.
9. Sign-out pressed → profile sign-out handler → Supabase clears its session → login screen is displayed on success.
10. History screen focused → `useFocusEffect` reloads attendance/event data → latest authorized records or an empty state are displayed.

## Presentation guide

Explain the flow as three layers: Expo Router captures user actions; typed library functions call Supabase; Postgres constraints, RPC checks, and RLS are the security boundary. Demonstrate a student scan, show the single attendance row and duplicate rejection, then show that registration cannot self-assign a privileged role. Finish by showing teacher ownership restrictions and the administrator role-change audit record. For a live demonstration, create test accounts and events ahead of time and use a test Supabase project.

## Current limitations

- The administrator dashboard includes summary totals, user search and role assignment, event close/reopen, attendance search/filtering by student, event, date, or status, and audited attendance status correction/deletion. It does not yet include full event editing/deletion or downloadable attendance reports.
- Teacher event attendance summaries and student history are implemented; broader report exports and administrator profile/account editing are not.
- RLS and RPC behavior must be verified in the target Supabase project using the checklist above. No live Supabase credentials are included, so remote database behavior cannot be exercised from this repository alone.
- Existing database upgrades need a reviewed migration and backup when current columns differ from this schema.
