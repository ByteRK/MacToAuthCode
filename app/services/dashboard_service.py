from app.repositories.auth_code_repository import AuthCodeRepository


class DashboardService:
    def __init__(self, repository: AuthCodeRepository) -> None:
        self.repository = repository

    def get_overview(self) -> dict:
        summary = self.repository.fetch_summary()
        recent_logs = self.repository.fetch_recent_logs()
        return {
            "summary": summary,
            "recent_logs": recent_logs,
        }

    def get_allocations(self, *, search: str, page: int, page_size: int) -> dict:
        return self.repository.list_allocations(
            search=search,
            page=page,
            page_size=page_size,
        )

    def get_codes(self, *, status: str, search: str, page: int, page_size: int) -> dict:
        return self.repository.list_codes(
            status=status,
            search=search,
            page=page,
            page_size=page_size,
        )
