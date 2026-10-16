"""Platform admin can create schools/principals; principals cannot self-elevate."""
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID

from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from _lib.auth import CurrentUser, get_current_user  # noqa: E402
from _lib.admin_engine import create_teacher_account  # noqa: E402
from _lib.system_engine import _school_slug, create_principal_account, create_school  # noqa: E402
from _routes.system import (  # noqa: E402
    CreatePrincipalBody, CreateSchoolBody, system_create_principal, system_create_school,
)


class SystemAdminTests(unittest.TestCase):
    def test_principal_cannot_create_school(self):
        principal = CurrentUser("principal", None, ["principal"], "school-a")
        with patch("_routes.system.create_school") as write:
            with self.assertRaises(HTTPException) as denied:
                system_create_school(CreateSchoolBody(name="Trường A"), principal)
            self.assertEqual(denied.exception.status_code, 403)
            write.assert_not_called()

    def test_principal_cannot_create_principal(self):
        principal = CurrentUser("principal", None, ["principal"], "school-a")
        body = CreatePrincipalBody(email="new@example.com", full_name="New Principal", password="passphrase1234")
        with patch("_routes.system.create_principal_account") as write:
            with self.assertRaises(HTTPException) as denied:
                system_create_principal(UUID("11111111-1111-1111-1111-111111111111"), body, principal)
            self.assertEqual(denied.exception.status_code, 403)
            write.assert_not_called()

    def test_system_admin_can_create_school_without_school_assignment(self):
        admin = CurrentUser("system-admin", None, ["system_admin"])
        with patch("_routes.system.create_school", return_value={"id": "school-a"}) as write:
            result = system_create_school(CreateSchoolBody(name="Trường A"), admin)
            self.assertEqual(result["id"], "school-a")
            write.assert_called_once_with("Trường A", "system-admin")

    def test_system_admin_becomes_principal_only_after_selecting_school(self):
        admin_without_school = CurrentUser("system-admin", None, ["system_admin"])
        admin_in_school = CurrentUser("system-admin", None, ["system_admin"], "school-a")
        self.assertFalse(admin_without_school.is_principal())
        self.assertTrue(admin_in_school.is_principal())

    def test_system_admin_uses_only_the_school_selected_in_request(self):
        school_id = "11111111-1111-1111-1111-111111111111"
        roles = MagicMock()
        roles.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[{"role": "system_admin"}])
        schools = MagicMock()
        schools.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(data=[{"id": school_id}])
        db = MagicMock()
        db.table.side_effect = lambda name: {"user_roles": roles, "schools": schools}[name]
        with patch("_lib.auth._decode_token", return_value={"sub": "system-admin", "email": "admin@example.com"}):
            with patch("_lib.auth.get_supabase", return_value=db):
                admin = get_current_user("Bearer token", school_id)
        self.assertEqual(admin.school_id, school_id)
        self.assertTrue(admin.is_principal())

    def test_school_slug_transliterates_vietnamese_name(self):
        self.assertEqual(_school_slug("  THPT Nguyễn Trãi - Đà Nẵng  "), "thpt-nguyen-trai-da-nang")

    def test_school_slug_rejects_name_without_latin_letters_or_digits(self):
        with patch("_lib.system_engine.get_supabase") as get_db:
            with self.assertRaises(HTTPException) as invalid:
                create_school("---", "system-admin")
            self.assertEqual(invalid.exception.status_code, 422)
            get_db.assert_not_called()

    def test_school_code_is_generated_and_duplicate_gets_numeric_suffix(self):
        class DuplicateSlug(Exception):
            code = "23505"

        schools = MagicMock()
        inserted = []

        def insert_school(data):
            inserted.append(data)
            query = MagicMock()
            if len(inserted) == 1:
                query.execute.side_effect = DuplicateSlug()
            else:
                query.execute.return_value = SimpleNamespace(data=[{"id": "school-2", **data}])
            return query

        schools.insert.side_effect = insert_school
        audit = MagicMock()
        db = MagicMock()
        db.table.side_effect = lambda name: {"schools": schools, "audit_logs": audit}[name]
        with patch("_lib.system_engine.get_supabase", return_value=db):
            result = create_school("THPT Nguyễn Trãi", "system-admin")

        self.assertEqual([row["slug"] for row in inserted], ["thpt-nguyen-trai", "thpt-nguyen-trai-2"])
        self.assertEqual(result["slug"], "thpt-nguyen-trai-2")
        self.assertEqual(audit.insert.call_args.args[0]["after_data"]["slug"], "thpt-nguyen-trai-2")

    def test_school_code_stays_within_80_characters_with_suffix(self):
        self.assertEqual(len(_school_slug("A" * 160)), 80)
        class DuplicateSlug(Exception):
            code = "23505"

        schools = MagicMock()
        inserted = []

        def insert_school(data):
            inserted.append(data)
            query = MagicMock()
            if len(inserted) == 1:
                query.execute.side_effect = DuplicateSlug()
            else:
                query.execute.return_value = SimpleNamespace(data=[{"id": "school-2", **data}])
            return query

        schools.insert.side_effect = insert_school
        db = MagicMock()
        db.table.side_effect = lambda name: {"schools": schools, "audit_logs": MagicMock()}[name]
        with patch("_lib.system_engine.get_supabase", return_value=db):
            result = create_school("A" * 160, "system-admin")
        self.assertEqual(len(result["slug"]), 80)
        self.assertTrue(result["slug"].endswith("-2"))

    def test_principal_cannot_use_teacher_api_to_create_principal(self):
        with self.assertRaises(HTTPException) as denied:
            create_teacher_account("new@example.com", "New Principal", "principal", "actor", "passphrase1234", "school-a")
        self.assertEqual(denied.exception.status_code, 422)

    def test_school_must_exist_before_creating_principal(self):
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(data=[])
        with patch("_lib.system_engine.get_supabase", return_value=db):
            with patch("_lib.system_engine.create_auth_account") as create_auth:
                with self.assertRaises(HTTPException) as missing:
                    create_principal_account("missing", "new@example.com", "New Principal", "passphrase1234", "actor")
                self.assertEqual(missing.exception.status_code, 404)
                create_auth.assert_not_called()

    def test_principal_has_exactly_one_school_assignment(self):
        school_id = "11111111-1111-1111-1111-111111111111"
        tables = {name: MagicMock() for name in ("schools", "staff_school_assignments", "user_roles", "audit_logs")}
        tables["schools"].select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(data=[{"id": school_id}])
        db = MagicMock()
        db.table.side_effect = lambda name: tables[name]
        with patch("_lib.system_engine.get_supabase", return_value=db):
            with patch("_lib.system_engine.create_auth_account", return_value={"user_id": "new-user", "email": "new@example.com", "temporary_password": "passphrase1234"}):
                result = create_principal_account(school_id, "new@example.com", "New Principal", "passphrase1234", "admin")
        tables["staff_school_assignments"].insert.assert_called_once_with({"user_id": "new-user", "school_id": school_id})
        tables["user_roles"].insert.assert_called_once_with({"user_id": "new-user", "role": "principal"})
        self.assertEqual(result, {"user_id": "new-user", "email": "new@example.com"})


if __name__ == "__main__":
    unittest.main()
