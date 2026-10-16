"""Quản lý tài khoản nhân sự theo trường: liệt kê, đổi MK, thu hồi, xóa."""
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID

from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from _lib.admin_engine import (  # noqa: E402
    delete_teacher_account,
    list_school_staff,
    reset_staff_password,
    revoke_teacher_access,
)
from _lib.auth import CurrentUser  # noqa: E402
from _routes.accounts import admin_list_teachers  # noqa: E402
from _routes.system import system_list_staff  # noqa: E402

SCHOOL = "11111111-1111-1111-1111-111111111111"
OTHER_SCHOOL = "22222222-2222-2222-2222-222222222222"
TEACHER = "33333333-3333-3333-3333-333333333333"


class _Query:
    """Mock builder của supabase-py: mọi chuỗi truy vấn trả về rows đã cấu hình."""

    def __init__(self, rows, name, inserted):
        self._rows = rows
        self._name = name
        self._inserted = inserted

    def insert(self, payload):
        self._inserted.append((self._name, payload))
        return self

    def update(self, payload):
        self._inserted.append((self._name, payload))
        return self

    def delete(self):
        return self

    def __getattr__(self, attribute):
        if attribute == "execute":
            return lambda: SimpleNamespace(data=list(self._rows))
        return lambda *args, **kwargs: self


def make_db(**rows_by_table):
    inserted: list[tuple[str, dict]] = []
    db = MagicMock()
    db.table.side_effect = lambda name: _Query(rows_by_table.get(name, []), name, inserted)
    return db, inserted


def principal(school_id=SCHOOL):
    return CurrentUser("principal-1", "principal@example.com", ["principal"], school_id)


class ListSchoolStaffTests(unittest.TestCase):
    def test_filters_by_role_and_merges_multiple_roles(self):
        db, _ = make_db(
            staff_school_assignments=[
                {"user_id": "user-principal", "profiles": {"id": "user-principal", "full_name": "Trần Hiệu Trưởng"}},
                {"user_id": "user-teacher", "profiles": {"id": "user-teacher", "full_name": "Lê Giáo Viên"}},
            ],
            user_roles=[
                {"user_id": "user-principal", "role": "principal"},
                {"user_id": "user-teacher", "role": "subject_teacher"},
                {"user_id": "user-teacher", "role": "homeroom_teacher"},
            ],
        )
        auth_users = {
            "user-principal": SimpleNamespace(email="ht@example.com", created_at="2026-01-01", last_sign_in_at=None),
            "user-teacher": SimpleNamespace(email="gv@example.com", created_at="2026-01-02", last_sign_in_at="2026-02-02"),
        }
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            with patch("_lib.admin_engine._auth_users_by_id", return_value=auth_users):
                everyone = list_school_staff(SCHOOL)
                only_principals = list_school_staff(SCHOOL, ["principal"])

        self.assertEqual([row["full_name"] for row in everyone], ["Lê Giáo Viên", "Trần Hiệu Trưởng"])
        self.assertEqual([row["email"] for row in everyone], ["gv@example.com", "ht@example.com"])
        # Một người vừa GVCN vừa GVBM phải gộp cả hai vai trò, xếp GVCN trước GVBM.
        self.assertEqual(everyone[0]["roles"], ["homeroom_teacher", "subject_teacher"])
        self.assertEqual([row["user_id"] for row in only_principals], ["user-principal"])

    def test_returns_empty_without_querying_roles_when_school_has_no_staff(self):
        db, _ = make_db()
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            self.assertEqual(list_school_staff(SCHOOL), [])

    def test_principal_lists_staff_of_own_school_only(self):
        with patch("_routes.accounts.list_school_staff", return_value=[]) as listing:
            admin_list_teachers(principal())
        listing.assert_called_once_with(SCHOOL, ["homeroom_teacher", "subject_teacher"])

    def test_principal_without_school_cannot_list_teachers(self):
        with patch("_routes.accounts.list_school_staff") as listing:
            with self.assertRaises(HTTPException) as denied:
                admin_list_teachers(CurrentUser("teacher-1", None, ["homeroom_teacher"], None))
            self.assertEqual(denied.exception.status_code, 403)
            listing.assert_not_called()

    def test_system_admin_can_list_all_staff_of_a_school(self):
        with patch("_routes.system.list_school_staff", return_value=[]) as listing:
            system_list_staff(UUID(SCHOOL), CurrentUser("sa", None, ["system_admin"]))
        listing.assert_called_once_with(SCHOOL)

    def test_principal_cannot_use_system_staff_endpoint(self):
        with patch("_routes.system.list_school_staff") as listing:
            with self.assertRaises(HTTPException) as denied:
                system_list_staff(UUID(SCHOOL), principal())
            self.assertEqual(denied.exception.status_code, 403)
            listing.assert_not_called()


class ResetStaffPasswordTests(unittest.TestCase):
    def test_rejects_short_password_before_touching_the_database(self):
        with patch("_lib.admin_engine.get_supabase") as get_db:
            with self.assertRaises(HTTPException) as invalid:
                reset_staff_password(SCHOOL, TEACHER, "short", "principal-1")
            self.assertEqual(invalid.exception.status_code, 422)
            get_db.assert_not_called()

    def test_rejects_teacher_from_another_school(self):
        db, _ = make_db(staff_school_assignments=[])
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            with self.assertRaises(HTTPException) as missing:
                reset_staff_password(OTHER_SCHOOL, TEACHER, "matkhau123", "principal-1")
            self.assertEqual(missing.exception.status_code, 404)
            db.auth.admin.update_user_by_id.assert_not_called()

    def test_updates_password_and_writes_school_scoped_audit(self):
        db, inserted = make_db(
            staff_school_assignments=[{"user_id": TEACHER}],
            user_roles=[{"role": "subject_teacher"}],
        )
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            result = reset_staff_password(SCHOOL, TEACHER, "matkhau123", "principal-1")

        db.auth.admin.update_user_by_id.assert_called_once_with(TEACHER, {"password": "matkhau123"})
        self.assertEqual(result["user_id"], TEACHER)
        audits = [payload for table, payload in inserted if table == "audit_logs"]
        self.assertEqual(audits[0]["school_id"], SCHOOL)
        self.assertEqual(audits[0]["entity_id"], TEACHER)


class DeleteTeacherAccountTests(unittest.TestCase):
    def test_blocked_when_teacher_still_has_teaching_history(self):
        db, _ = make_db(
            staff_school_assignments=[{"user_id": TEACHER}],
            user_roles=[{"role": "subject_teacher"}],
            attendance_sessions=[{"id": "session-1"}],
        )
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            with self.assertRaises(HTTPException) as blocked:
                delete_teacher_account(SCHOOL, TEACHER, "principal-1")

        self.assertEqual(blocked.exception.status_code, 409)
        self.assertIn("phiên điểm danh", blocked.exception.detail)
        self.assertIn("Thu hồi", blocked.exception.detail)
        db.auth.admin.delete_user.assert_not_called()

    def test_refuses_account_that_still_has_another_role(self):
        db, _ = make_db(
            staff_school_assignments=[{"user_id": TEACHER}],
            user_roles=[{"role": "subject_teacher"}, {"role": "principal"}],
        )
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            with self.assertRaises(HTTPException) as blocked:
                delete_teacher_account(SCHOOL, TEACHER, "principal-1")

        self.assertEqual(blocked.exception.status_code, 409)
        db.auth.admin.delete_user.assert_not_called()

    def test_deletes_account_and_audits_when_teacher_has_no_history(self):
        db, inserted = make_db(
            staff_school_assignments=[{"user_id": TEACHER}],
            user_roles=[{"role": "homeroom_teacher"}],
        )
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            result = delete_teacher_account(SCHOOL, TEACHER, "principal-1")

        db.auth.admin.delete_user.assert_called_once_with(TEACHER)
        self.assertTrue(result["success"])
        audits = [payload for table, payload in inserted if table == "audit_logs"]
        self.assertEqual(audits[0]["action"], "DELETE")
        self.assertEqual(audits[0]["school_id"], SCHOOL)


class RevokeTeacherAccessTests(unittest.TestCase):
    def test_blocked_while_teacher_is_still_homeroom_teacher(self):
        db, _ = make_db(
            staff_school_assignments=[{"user_id": TEACHER}],
            user_roles=[{"role": "homeroom_teacher"}],
            school_years=[{"id": "year-1"}],
            classes=[{"id": "class-1", "name": "10A1"}],
        )
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            with self.assertRaises(HTTPException) as blocked:
                revoke_teacher_access(SCHOOL, TEACHER, "principal-1")

        self.assertEqual(blocked.exception.status_code, 409)
        self.assertIn("10A1", blocked.exception.detail)

    def test_removes_teacher_roles_and_school_assignment_but_keeps_profile(self):
        db, inserted = make_db(
            staff_school_assignments=[{"user_id": TEACHER}],
            user_roles=[{"role": "homeroom_teacher"}, {"role": "subject_teacher"}],
            school_years=[{"id": "year-1"}],
        )
        with patch("_lib.admin_engine.get_supabase", return_value=db):
            result = revoke_teacher_access(SCHOOL, TEACHER, "principal-1")

        self.assertEqual(result["removed_roles"], ["homeroom_teacher", "subject_teacher"])
        # Không xóa tài khoản Auth: hồ sơ và lịch sử giảng dạy phải được giữ nguyên.
        db.auth.admin.delete_user.assert_not_called()
        audits = [payload for table, payload in inserted if table == "audit_logs"]
        self.assertEqual(audits[0]["action"], "REVOKE")
        self.assertEqual(audits[0]["school_id"], SCHOOL)


if __name__ == "__main__":
    unittest.main()
