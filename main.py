from waitress import serve

from app import create_app
from app.config import load_settings
from app.services.single_instance_service import (
    SingleInstanceError,
    SingleInstanceService,
)


def main() -> None:
    settings = load_settings()
    lock_path = SingleInstanceService.build_lock_path(settings.data_dir, settings.port)
    try:
        with SingleInstanceService(lock_path):
            app = create_app(settings=settings)
            print(
                f"{settings.app_name} running on http://{settings.host}:{settings.port}",
                flush=True,
            )
            serve(app, host=settings.host, port=settings.port)
    except SingleInstanceError:
        print(
            f"{settings.app_name} 已在端口 {settings.port} 运行，若需同时运行请改用不同端口。",
            flush=True,
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
