from waitress import serve

from app import create_app


def main() -> None:
    app = create_app()
    settings = app.config["SETTINGS"]
    print(
        f"{settings.app_name} running on http://{settings.host}:{settings.port}",
        flush=True,
    )
    serve(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
