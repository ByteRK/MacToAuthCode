from ipaddress import ip_address, ip_network

from app.config import Settings


class RequestAccessPolicyService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._allowed_networks = self._parse_allowed_ranges(settings.request_ip_whitelist)

    @property
    def is_enabled(self) -> bool:
        return self.settings.request_ip_whitelist_enabled

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

    @staticmethod
    def _parse_allowed_ranges(values: tuple[str, ...]) -> tuple:
        networks = []
        for value in values:
            item = value.strip()
            if not item:
                continue
            if "/" in item:
                networks.append(ip_network(item, strict=False))
            else:
                candidate = ip_address(item)
                prefix = 32 if candidate.version == 4 else 128
                networks.append(ip_network(f"{candidate}/{prefix}", strict=False))
        return tuple(networks)
