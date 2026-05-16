from app.repositories.auth_code_repository import AuthCodeRepository


class AuthCodeService:
    def __init__(self, repository: AuthCodeRepository) -> None:
        self.repository = repository
