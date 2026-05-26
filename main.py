from waitress import serve

from app import create_app


def main() -> None:
    app = create_app()
    settings = app.config["SETTINGS"]
    dns_server_service = app.extensions["dns_server_service"]
    print(
        f"{settings.app_name} running on http://{settings.host}:{settings.port}",
        flush=True,
    )
    if settings.dns_enabled:
        dns_server_service.start()
        print(
            "DNS server enabled on "
            f"udp://{dns_server_service.listen_host}:{dns_server_service.listen_port} "
            f"-> {dns_server_service.target_ip} "
            f"for {', '.join(dns_server_service.override_domains) or 'no override domains'}",
            flush=True,
        )

    try:
        serve(app, host=settings.host, port=settings.port)
    finally:
        dns_server_service.stop()


if __name__ == "__main__":
    main()
