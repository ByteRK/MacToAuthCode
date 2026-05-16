from app.repositories.auth_code_repository import AuthCodeRepository


class DashboardService:
    def __init__(self, repository: AuthCodeRepository) -> None:
        self.repository = repository
