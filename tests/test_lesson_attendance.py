import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from _lib.lesson_book_engine import save_attendance


class LessonAttendanceTests(unittest.TestCase):
    def run_save(self, status, selected=None, old_status=None, old_links=None, criteria=None):
        self.db = MagicMock()
        self.tables = {}
        for name in ["attendance_sessions", "attendance_records", "lesson_individual_criteria", "lesson_book_entries", "competition_week_criteria", "student_class_enrollments", "event_types", "score_transactions", "student_events", "audit_logs"]:
            query = MagicMock()
            for method in ["select", "eq", "is_", "limit", "insert", "update"]:
                getattr(query, method).return_value = query
            self.tables[name] = query
        criterion = {"id": "absent", "code": "ABS", "name": "Vắng không phép", "kind": "DEDUCT", "status": "active"}
        data = {
            "attendance_sessions": [{"id": "session"}],
            "attendance_records": [{"id": "record"}] if old_status else [],
            "lesson_individual_criteria": old_links or [],
            "lesson_book_entries": [{"id": "lesson"}],
            "competition_week_criteria": [{"criteria_id": "absent", "criteria": {"code": "ABS"}}],
            "student_class_enrollments": [{"student_id": "student"}],
            "score_transactions": [{"student_event_id": "event", "status": "SUBMITTED"}],
        }
        for name, query in self.tables.items():
            query.execute.return_value = SimpleNamespace(data=data.get(name, []))
        self.db.table.side_effect = lambda name: self.tables[name]
        detail = {"criteria": criteria if criteria is not None else [criterion], "students": [{"id": "student"}], "records": [{"student_id": "student", "attendance_status": old_status}] if old_status else []}
        lesson = {"id": "lesson", "week_id": "week", "approval_status": "approved", "lesson_date": "2026-10-16", "period": 1, "subject_id": "subject"}
        with patch('_lib.lesson_book_engine.get_supabase', return_value=self.db), patch('_lib.lesson_book_engine._get_lesson', return_value=lesson), patch('_lib.lesson_book_engine._require_open_week'), patch('_lib.lesson_book_engine.attendance_detail', return_value=detail), patch('_lib.lesson_book_engine._audit'), patch('_lib.lesson_book_engine.record_student_event', return_value={"transaction": {"id": "tx"}}) as record:
            self.record = record
            save_attendance('lesson', 'class', 'teacher', [{"student_id": "student", "attendance_status": status, "criteria_ids": selected or []}])

    def test_absent_without_checkbox_creates_event_and_review_link(self):
        self.run_save('unexcused_absent')
        self.record.assert_called_once()
        event = self.record.call_args.args[0]
        self.assertEqual((event.criteria_code, event.lesson_id, event.week_id), ('ABS', 'lesson', 'week'))
        self.assertEqual(self.tables['lesson_individual_criteria'].insert.call_args.args[0]['transaction_id'], 'tx')

    def test_manual_selection_is_not_duplicated(self):
        self.run_save('unexcused_absent', ['absent'])
        self.record.assert_called_once()

    def test_repeated_attendance_does_not_add_points_again(self):
        self.run_save('unexcused_absent', old_status='unexcused_absent', old_links=[{'id': 'link', 'criteria_id': 'absent', 'transaction_id': 'tx'}])
        self.record.assert_not_called()

    def test_correcting_to_present_removes_old_violation(self):
        self.run_save('present', ['absent'], 'unexcused_absent', [{'id': 'link', 'criteria_id': 'absent', 'transaction_id': 'tx'}])
        self.record.assert_not_called()
        self.assertEqual(self.tables['score_transactions'].update.call_args.args[0]['status'], 'REJECTED')
        self.assertEqual(self.tables['student_events'].update.call_args.args[0]['status'], 'void')

    def test_missing_criterion_rejects_before_writes(self):
        with self.assertRaises(HTTPException):
            self.run_save('unexcused_absent', criteria=[])
        self.tables['attendance_records'].insert.assert_not_called()
        self.tables['attendance_records'].update.assert_not_called()

    def test_excused_absence_uses_zero_point_tracking_criterion(self):
        self.run_save('excused_absent', criteria=[{'id': 'absent', 'code': 'TC08', 'name': 'Vắng có phép', 'kind': 'ADD', 'points': 0, 'status': 'active'}])
        self.assertEqual(self.record.call_args.args[0].criteria_code, 'TC08')
