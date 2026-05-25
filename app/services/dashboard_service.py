from app.repositories.auth_code_repository import AuthCodeRepository


class DashboardService:
    def __init__(self, repository: AuthCodeRepository) -> None:
        self.repository = repository

    def get_overview(self) -> dict:
        summary = self.repository.fetch_summary()
        return {
            "summary": summary,
        }

    def get_allocations(self, *, search: str, page: int, page_size: int) -> dict:
        return self.repository.list_allocations(
            search=search,
            page=page,
            page_size=page_size,
        )

    def get_codes(self, *, status: str, search: str, page: int, page_size: int) -> dict:
        return self.repository.list_codes(
            pid="",
            status=status,
            search=search,
            page=page,
            page_size=page_size,
        )

    def get_codes_by_pid(
        self,
        *,
        pid: str,
        status: str,
        search: str,
        page: int,
        page_size: int,
    ) -> dict:
        return self.repository.list_codes(
            pid=pid,
            status=status,
            search=search,
            page=page,
            page_size=page_size,
        )

    def get_inventory_summary(self, *, search: str, page: int, page_size: int) -> dict:
        return self.repository.summarize_inventory_by_pid(
            search=search,
            page=page,
            page_size=page_size,
        )

    def get_recent_logs(self, *, limit: int, action: str, search: str) -> list[dict]:
        return self.repository.fetch_recent_logs(limit=limit, action=action, search=search)
