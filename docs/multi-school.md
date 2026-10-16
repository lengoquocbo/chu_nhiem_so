# Multi-school rollout

This change keeps one Supabase project/database and isolates rows by school.
Each principal and teacher has exactly one row in `staff_school_assignments`
(`user_id` is the primary key). A school may have more than one principal.
Parents may have children in different schools; students currently belong to
one school at a time.

## Deployment order

1. Back up the database and deploy migrations `028_schools_and_staff_scope.sql`
   and `029_school_scoped_rls.sql` **before** deploying the updated frontend/API.
   The migration assigns all existing staff, students and school years to
   `legacy-school`. Rename that school's display name to the real school name.
2. Deploy the updated frontend and API together. Do not deploy the API first:
   it requires `staff_school_assignments` and the new `school_id` columns.
3. Apply `030_system_admin_role.sql`, then `031_bootstrap_system_admin.sql`,
   `032_system_admin_grant_guard.sql`, and
   `033_system_admin_acting_school.sql`. The bootstrap migration promotes
   the designated existing Auth account to `system_admin` and removes its
   school-principal assignment. It does not include a password.
4. The system admin signs in at `/system`, creates a school first, then creates
   its principal account. The API writes the Auth user, one school assignment,
   principal role and audit record. School principals can create teachers only
   within their school; they cannot create other principals.
5. A system admin selects a school before entering the principal workspace. The
   selection is sent with each request and grants principal-only access to that
   school; switching schools changes the accessible data. Without a selected
   school, the system admin has no school-scoped data access. On `/system` the
   selected school also lists its full staff — principals and teachers together,
   each with its roles.
6. Verify with two real test accounts before admitting users: both schools can
   use the same year name and each can activate its own year; principal A must
   not read or update B's years/classes/students via either Supabase or API;
   a teacher from A cannot join B's class code or be assigned to B's class.

`subjects`, `event_types`, and null-class `rank_configs` remain shared seed
catalogues; principal client writes to those global rows are intentionally
disabled. School-specific ranking overrides still use `class_id`.

## Staff accounts

Two read paths list accounts per school. Both go through `list_school_staff`
(`api/_lib/admin_engine.py`) so the role column has a single source:

- `GET /api/system/schools/{school_id}/staff` — every staff member of a school
  (principals, homeroom teachers, subject teachers) with their roles. System
  admin only.
- `GET /api/admin/teachers` — the teachers of the acting principal's own school.
  The school comes from the caller's `school_id`, never from the client.

Principal-only management of those teacher accounts:

| Method | Path |
|---|---|
| `PUT` | `/api/admin/teachers/{teacher_id}/password` |
| `POST` | `/api/admin/teachers/{teacher_id}/revoke` |
| `DELETE` | `/api/admin/teachers/{teacher_id}` |

`DELETE` removes the Auth account, so it only succeeds when the teacher has no
`classes.homeroom_teacher_id`, `attendance_sessions.teacher_id`,
`timetable_entries.teacher_id`, `lesson_book_entries.teacher_id` or
`assessment_scores.teacher_id` row. Those columns reference `profiles(id)`
without `ON DELETE CASCADE`, so deleting would otherwise fail on the foreign
key. A teacher who still has teaching history is handled with `revoke` instead:
it drops the teacher roles and the school assignment, keeps `profiles` and all
history intact, and leaves the account unable to reach any feature. `revoke`
refuses while the teacher is still the homeroom teacher of a class
(`classes.homeroom_teacher_id`) — reassign the class first.

All four endpoints write an `audit_logs` row with an explicit `school_id`. The
`set_audit_school()` trigger can only derive that from the actor's own
`staff_school_assignments`, so a system admin acting as a school would otherwise
write a NULL school and the principal could not read the record through RLS.

Changing a student's `school_id` directly is blocked. A future cross-school
transfer needs a dedicated workflow that closes the old enrollment, updates
student ownership, and handles historical access explicitly. Do not manually
change just one of those rows.

No live database migration is performed by editing these files. Run the SQL
against a staging copy first and test row-level security with non-owner roles;
the backend's service key bypasses RLS, so API tests are also required.
