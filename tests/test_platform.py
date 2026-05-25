from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from openpyxl import Workbook

from app import create_app
from app.config import Settings


class PlatformTestCase(TestCase):
    def create_test_app(self, temp_dir: str):
        settings = Settings(
            app_name="Test",
            host="127.0.0.1",
            port=18080,
            admin_username="admin",
            admin_password="password",
            secret_key="test-secret",
            data_dir=Path(temp_dir),
        )
        return create_app(settings=settings)

    def test_distribution_is_scoped_by_pid(self):
        with TemporaryDirectory() as temp_dir:
            app = self.create_test_app(temp_dir)
            repo = app.extensions["auth_code_repository"]
            repo.bulk_insert_codes(
                [
                    {
                        "pid": "P1",
                        "did": "DID-P1-001",
                        "license": "P1-001",
                        "code": "DID-P1-001",
                        "payload_json": "{\"did\": \"DID-P1-001\", \"license\": \"P1-001\"}",
                        "payload_hash": "hash-p1",
                        "source_batch": "B1",
                    },
                    {
                        "pid": "P2",
                        "did": "DID-P2-001",
                        "license": "P2-001",
                        "code": "DID-P2-001",
                        "payload_json": "{\"did\": \"DID-P2-001\", \"license\": \"P2-001\"}",
                        "payload_hash": "hash-p2",
                        "source_batch": "B2",
                    },
                ]
            )
            client = app.test_client()

            first = client.post(
                "/api/device/authorize",
                json={"mac": "AA-BB-CC-11-22-33", "pid": "P1"},
            )
            second = client.post(
                "/api/device/authorize",
                json={"mac": "AA-BB-CC-11-22-33", "pid": "P1"},
            )
            third = client.post(
                "/api/device/authorize",
                json={"mac": "AA-BB-CC-11-22-33", "pid": "P2"},
            )

            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.get_json()["data"]["display_code"], "DID-P1-001")
            self.assertEqual(first.get_json()["data"]["payload"]["license"], "P1-001")
            self.assertEqual(second.get_json()["data"]["mode"], "reused")
            self.assertEqual(third.get_json()["data"]["display_code"], "DID-P2-001")

    def test_excel_import_requires_did_and_license(self):
        with TemporaryDirectory() as temp_dir:
            app = self.create_test_app(temp_dir)
            excel_service = app.extensions["excel_service"]

            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["did", "source_batch"])
            sheet.append(["DID-001", "B1"])
            buffer = BytesIO()
            workbook.save(buffer)
            buffer.seek(0)

            with self.assertRaisesRegex(ValueError, "did 和 license"):
                excel_service.import_codes(buffer, default_pid="PX")

    def test_excel_import_supports_default_pid_and_warns_on_duplicate_did(self):
        with TemporaryDirectory() as temp_dir:
            app = self.create_test_app(temp_dir)
            excel_service = app.extensions["excel_service"]
            repo = app.extensions["auth_code_repository"]

            initial_workbook = Workbook()
            initial_sheet = initial_workbook.active
            initial_sheet.append(["did", "license", "source_batch"])
            initial_sheet.append(["DID-001", "LIC-001", "B1"])
            initial_buffer = BytesIO()
            initial_workbook.save(initial_buffer)
            initial_buffer.seek(0)

            initial_result = excel_service.import_codes(initial_buffer, default_pid="PX")
            self.assertEqual(initial_result["inserted"], 1)

            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["did", "license", "source_batch"])
            sheet.append(["DID-001", "LIC-001-NEW", "B1"])
            sheet.append(["DID-002", "LIC-002", "B1"])
            sheet.append(["DID-002", "LIC-002-DUP", "B1"])
            buffer = BytesIO()
            workbook.save(buffer)
            buffer.seek(0)

            result = excel_service.import_codes(buffer, default_pid="PX")
            self.assertEqual(result["inserted"], 1)
            self.assertEqual(result["skipped"], 2)
            self.assertIn("DID-001", result["duplicate_dids"])
            self.assertIn("DID-002", result["duplicate_dids"])
            self.assertTrue(result["warnings"])

            codes = repo.list_codes(status="all", search="PX", page=1, page_size=10)
            self.assertEqual(len(codes["items"]), 2)
            self.assertEqual(codes["items"][0]["did"][:4], "DID-")

    def test_inventory_summary_is_grouped_by_pid(self):
        with TemporaryDirectory() as temp_dir:
            app = self.create_test_app(temp_dir)
            repo = app.extensions["auth_code_repository"]
            repo.bulk_insert_codes(
                [
                    {
                        "pid": "P1",
                        "did": "DID-SUMMARY-P1-1",
                        "license": "P1-001",
                        "code": "DID-SUMMARY-P1-1",
                        "payload_json": "{\"did\": \"DID-SUMMARY-P1-1\", \"license\": \"P1-001\"}",
                        "payload_hash": "summary-hash-p1-1",
                        "source_batch": "B1",
                    },
                    {
                        "pid": "P1",
                        "did": "DID-SUMMARY-P1-2",
                        "license": "P1-002",
                        "code": "DID-SUMMARY-P1-2",
                        "payload_json": "{\"did\": \"DID-SUMMARY-P1-2\", \"license\": \"P1-002\"}",
                        "payload_hash": "summary-hash-p1-2",
                        "source_batch": "B1",
                    },
                    {
                        "pid": "P2",
                        "did": "DID-SUMMARY-P2-1",
                        "license": "P2-001",
                        "code": "DID-SUMMARY-P2-1",
                        "payload_json": "{\"did\": \"DID-SUMMARY-P2-1\", \"license\": \"P2-001\"}",
                        "payload_hash": "summary-hash-p2-1",
                        "source_batch": "B2",
                    },
                ]
            )

            summary = repo.summarize_inventory_by_pid(page=1, page_size=10)
            self.assertEqual(summary["total"], 2)
            self.assertEqual(summary["items"][0]["pid"], "P1")
            self.assertEqual(summary["items"][0]["total_codes"], 2)
