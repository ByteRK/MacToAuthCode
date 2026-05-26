from flask import Flask

from app.api.admin import admin_bp
from app.api.device import device_bp
from app.config import Settings, load_settings
from app.database import Database
from app.repositories.auth_code_repository import AuthCodeRepository
from app.services.auth_code_service import AuthCodeService
from app.services.dashboard_service import DashboardService
from app.services.dns_server_service import DnsServerService
from app.services.excel_service import ExcelService


def create_app(settings: Settings | None = None) -> Flask:
    settings = settings or load_settings()
    settings.ensure_directories()

    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static",
    )
    app.secret_key = settings.secret_key
    app.config["SETTINGS"] = settings

    database = Database(settings.db_path)
    database.initialize()

    repository = AuthCodeRepository(database)
    excel_service = ExcelService(repository)
    auth_code_service = AuthCodeService(repository)
    dashboard_service = DashboardService(repository)
    dns_server_service = DnsServerService(settings)

    app.extensions["database"] = database
    app.extensions["auth_code_repository"] = repository
    app.extensions["excel_service"] = excel_service
    app.extensions["auth_code_service"] = auth_code_service
    app.extensions["dashboard_service"] = dashboard_service
    app.extensions["dns_server_service"] = dns_server_service

    app.register_blueprint(device_bp)
    app.register_blueprint(admin_bp)
    return app
