from ipaddress import ip_address, ip_network

from app.config import Settings


class RequestAccessPolicyService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._allowed_entries = tuple(settings.request_ip_whitelist)
        self._allowed_networks = self._parse_allowed_ranges(self._allowed_entries)

    @property
    def is_enabled(self) -> bool:
        return self.settings.request_ip_whitelist_enabled

    @property
    def allowed_entries(self) -> tuple[str, ...]:
        return self._allowed_entries

    def is_allowed(self, client_ip: str | None) -> bool:
        if not self.is_enabled:
            return True
        if not client_ip:
            return False
        try:
            candidate = ip_address(client_ip)
        except ValueError:
            return False
        return any(candidate in network for network in self._allowed_networks)

    def update_policy(self, *, enabled: bool, allowed_entries: tuple[str, ...]) -> None:
        normalized_entries = self.normalize_allowed_entries(allowed_entries)
        self.settings.request_ip_whitelist_enabled = enabled
        self.settings.request_ip_whitelist = normalized_entries
        self._allowed_entries = normalized_entries
        self._allowed_networks = self._parse_allowed_ranges(normalized_entries)

    @staticmethod
    def normalize_allowed_entries(values: tuple[str, ...] | list[str]) -> tuple[str, ...]:
        normalized: list[str] = []
        seen: set[str] = set()
        for value in values:
            item = value.strip()
            if not item:
                continue
            if "/" in item:
                canonical = str(ip_network(item, strict=False))
            else:
                canonical = str(ip_address(item))
            if canonical in seen:
                continue
            seen.add(canonical)
            normalized.append(canonical)
        return tuple(normalized)

    @staticmethod
    def _parse_allowed_ranges(values: tuple[str, ...]) -> tuple:
        networks = []
        for item in RequestAccessPolicyService.normalize_allowed_entries(values):
            if "/" in item:
                networks.append(ip_network(item, strict=False))
            else:
                candidate = ip_address(item)
                prefix = 32 if candidate.version == 4 else 128
                networks.append(ip_network(f"{candidate}/{prefix}", strict=False))
        return tuple(networks)
