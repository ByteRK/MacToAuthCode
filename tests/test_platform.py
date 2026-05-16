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
                        "code": "P1-001",
                        "payload_json": "{\"license\": \"P1-001\"}",
                        "payload_hash": "hash-p1",
                        "source_batch": "B1",
                    },
                    {
                        "pid": "P2",
                        "code": "P2-001",
                        "payload_json": "{\"license\": \"P2-001\"}",
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
            self.assertEqual(first.get_json()["data"]["display_code"], "P1-001")
            self.assertEqual(first.get_json()["data"]["payload"]["license"], "P1-001")
            self.assertEqual(second.get_json()["data"]["mode"], "reused")
            self.assertEqual(third.get_json()["data"]["display_code"], "P2-001")

    def test_excel_import_supports_default_pid(self):
        with TemporaryDirectory() as temp_dir:
            app = self.create_test_app(temp_dir)
            excel_service = app.extensions["excel_service"]
            repo = app.extensions["auth_code_repository"]

            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["did", "license", "source_batch"])
            sheet.append(["DID-001", "LIC-001", "B1"])
            sheet.append(["DID-002", "LIC-002", "B1"])
            buffer = BytesIO()
            workbook.save(buffer)
            buffer.seek(0)

            result = excel_service.import_codes(buffer, default_pid="PX")
            self.assertEqual(result["inserted"], 2)

            codes = repo.list_codes(status="all", search="PX", page=1, page_size=10)
            self.assertEqual(len(codes["items"]), 2)
            self.assertEqual(codes["items"][0]["payload"]["license"][:4], "LIC-")
