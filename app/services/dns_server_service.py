import socket
import struct
import threading
from contextlib import suppress
from ipaddress import ip_address

from app.config import Settings


class DnsServerService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._socket: socket.socket | None = None
        self.listen_host = settings.dns_host
        self.listen_port = settings.dns_port
        self.target_ip = settings.dns_target_ip.strip()
        self.override_domains = {
            self._normalize_domain(domain)
            for domain in settings.dns_override_domains
            if self._normalize_domain(domain)
        }

    @property
    def is_enabled(self) -> bool:
        return self.settings.dns_enabled

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if not self.is_enabled or self.is_running:
            return
        if not self.target_ip:
            self.target_ip = self._resolve_target_ip()

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((self.settings.dns_host, self.settings.dns_port))
        except PermissionError as exc:
            raise RuntimeError("DNS 监听 53 端口通常需要管理员或 root 权限") from exc
        except OSError as exc:
            raise RuntimeError(
                f"DNS 服务启动失败：无法绑定 {self.settings.dns_host}:{self.settings.dns_port}"
            ) from exc

        sock.settimeout(0.5)
        self._socket = sock
        self.listen_host, self.listen_port = sock.getsockname()
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._serve_forever,
            name="dns-server-service",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._socket is not None:
            with suppress(OSError):
                self._socket.close()
            self._socket = None
        if self._thread is not None:
            self._thread.join(timeout=1.5)
            self._thread = None

    def process_query(self, packet: bytes) -> bytes:
        parsed = self._parse_query(packet)
        if parsed is None:
            return b""

        domain, qtype, question_bytes, query_flags = parsed
        if domain in self.override_domains and qtype == 1:
            return self._build_a_response(packet, question_bytes, query_flags, self.target_ip)
        if domain in self.override_domains:
            return self._build_empty_response(packet, question_bytes, query_flags)

        upstream_response = self._forward_query(packet)
        if upstream_response:
            return upstream_response
        return self._build_error_response(packet, question_bytes, query_flags, rcode=2)

    def _serve_forever(self) -> None:
        assert self._socket is not None
        while not self._stop_event.is_set():
            try:
                packet, address = self._socket.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                break

            response = self.process_query(packet)
            if not response:
                continue
            with suppress(OSError):
                self._socket.sendto(response, address)

    def _forward_query(self, packet: bytes) -> bytes | None:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as upstream_sock:
                upstream_sock.settimeout(2.0)
                upstream_sock.sendto(
                    packet,
                    (self.settings.dns_upstream_host, self.settings.dns_upstream_port),
                )
                response, _ = upstream_sock.recvfrom(4096)
                return response
        except OSError:
            return None

    def _resolve_target_ip(self) -> str:
        configured_ip = self.settings.dns_target_ip.strip()
        if configured_ip:
            return configured_ip

        if self._is_specific_ipv4(self.settings.host):
            return self.settings.host

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
                probe.connect((self.settings.dns_upstream_host, self.settings.dns_upstream_port))
                candidate = probe.getsockname()[0]
                if self._is_specific_ipv4(candidate):
                    return candidate
        except OSError:
            pass

        with suppress(OSError):
            for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
                candidate = info[4][0]
                if self._is_specific_ipv4(candidate):
                    return candidate
        return "127.0.0.1"

    @staticmethod
    def _is_specific_ipv4(value: str) -> bool:
        with suppress(ValueError):
            candidate = ip_address(value)
            return candidate.version == 4 and not candidate.is_unspecified and not candidate.is_loopback
        return False

    @staticmethod
    def _normalize_domain(domain: str) -> str:
        return domain.strip().rstrip(".").lower()

    @staticmethod
    def _parse_query(packet: bytes) -> tuple[str, int, bytes, int] | None:
        if len(packet) < 17:
            return None
        _, query_flags, qdcount, _, _, _ = struct.unpack("!HHHHHH", packet[:12])
        if qdcount < 1:
            return None

        offset = 12
        labels: list[str] = []
        while offset < len(packet):
            length = packet[offset]
            if length == 0:
                offset += 1
                break
            offset += 1
            if offset + length > len(packet):
                return None
            labels.append(packet[offset : offset + length].decode("ascii", errors="ignore"))
            offset += length

        if offset + 4 > len(packet):
            return None

        qtype, _ = struct.unpack("!HH", packet[offset : offset + 4])
        question_end = offset + 4
        question = packet[12:question_end]
        return DnsServerService._normalize_domain(".".join(labels)), qtype, question, query_flags

    @staticmethod
    def _build_a_response(
        packet: bytes,
        question: bytes,
        query_flags: int,
        ip_value: str,
    ) -> bytes:
        header = DnsServerService._build_header(
            packet=packet,
            answer_count=1,
            flags=0x8000 | 0x0400 | 0x0080 | (query_flags & 0x0100),
        )
        answer = (
            b"\xc0\x0c"
            + struct.pack("!HHIH", 1, 1, 60, 4)
            + socket.inet_aton(ip_value)
        )
        return header + question + answer

    @staticmethod
    def _build_empty_response(packet: bytes, question: bytes, query_flags: int) -> bytes:
        header = DnsServerService._build_header(
            packet=packet,
            answer_count=0,
            flags=0x8000 | 0x0400 | 0x0080 | (query_flags & 0x0100),
        )
        return header + question

    @staticmethod
    def _build_error_response(
        packet: bytes,
        question: bytes,
        query_flags: int,
        *,
        rcode: int,
    ) -> bytes:
        header = DnsServerService._build_header(
            packet=packet,
            answer_count=0,
            flags=0x8000 | 0x0080 | (query_flags & 0x0100) | rcode,
        )
        return header + question

    @staticmethod
    def _build_header(
        *,
        packet: bytes,
        answer_count: int,
        flags: int,
    ) -> bytes:
        request_id = packet[:2]
        return request_id + struct.pack("!HHHHH", flags, 1, answer_count, 0, 0)
