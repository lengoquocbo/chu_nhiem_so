"""Regression checks for principal/teacher school isolation in the API."""
import os
import sys
import unittest
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from _lib.auth import CurrentUser, require_class_role  # noqa: E402
from _routes.scores import ApproveBody, approve  # noqa: E402
from _routes.accounts import CreateClassBody, admin_create_class  # noqa: E402


class SchoolScopeTests(unittest.TestCase):
    def test_principal_is_not_global(self):
        principal = CurrentUser("principal-a", None, ["principal"], "school-a")
        with patch("_lib.auth.get_class_school_id", return_value="school-b"):
            self.assertFalse(principal.is_principal_for_class("class-b"))
            with self.assertRaises(HTTPException) as denied:
                require_class_role(principal, "class-b", ["homeroom_teacher"])
            self.assertEqual(denied.exception.status_code, 403)

    def test_principal_can_access_own_school(self):
        principal = CurrentUser("principal-a", None, ["principal"], "school-a")
        with patch("_lib.auth.get_class_school_id", return_value="school-a"):
            require_class_role(principal, "class-a", ["homeroom_teacher"])

    def test_teacher_cannot_use_stale_scope_in_another_school(self):
        teacher = CurrentUser("teacher-a", None, ["homeroom_teacher"], "school-a")
        with patch("_lib.auth.get_class_school_id", return_value="school-b"):
            with patch("_lib.auth.get_user_class_scope", return_value=["homeroom_teacher"]):
                with self.assertRaises(HTTPException) as denied:
                    require_class_role(teacher, "class-b", ["homeroom_teacher"])
                self.assertEqual(denied.exception.status_code, 403)

    def test_score_approval_checks_class_before_using_service_key(self):
        principal = CurrentUser("principal-a", None, ["principal"], "school-a")
        with patch("_routes.scores.require_class_role", side_effect=HTTPException(403, "other school")) as gate:
            with patch("_routes.scores.approve_transaction") as write:
                with self.assertRaises(HTTPException):
                    approve(ApproveBody(transaction_id="transaction-b", class_id="class-b"), principal)
                gate.assert_called_once()
                write.assert_not_called()

    def test_admin_cannot_create_class_in_another_school(self):
        principal = CurrentUser("principal-a", None, ["principal"], "school-a")
        body = CreateClassBody(
            name="10A1", grade_block_id="grade-b", school_year_id="year-b", academic_term_id="term-b",
        )
        with patch("_lib.auth.get_year_school_id", return_value="school-b"):
            with patch("_routes.accounts.create_class") as write:
                with self.assertRaises(HTTPException) as denied:
                    admin_create_class(body, principal)
                self.assertEqual(denied.exception.status_code, 403)
                write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
