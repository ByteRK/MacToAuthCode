import os

from waitress import serve

from app import create_app
from app.config import load_settings
from app.services.single_instance_service import (
    PortUnavailableError,
    SingleInstanceError,
    SingleInstanceService,
)


def exit_with_message(message: str, exit_code: int = 1) -> None:
    print(message, flush=True)
    _pause_before_exit()
    raise SystemExit(exit_code)


def _pause_before_exit() -> None:
    prompt = "按回车键退出..."
    if os.environ.get("AUTH_PLATFORM_NO_EXIT_PAUSE") == "1":
        print(prompt, flush=True)
        return
    try:
        input(f"{prompt}\n")
    except (EOFError, KeyboardInterrupt):
        print(prompt, flush=True)
        return
    except OSError:
        print(prompt, flush=True)
        return


def main() -> None:
    settings = load_settings()
    lock_path = SingleInstanceService.build_runtime_lock_path(
        settings.app_name,
        settings.port,
    )
    try:
        with SingleInstanceService(lock_path):
            SingleInstanceService.ensure_port_available(settings.host, settings.port)
            app = create_app(settings=settings)
            print(
                f"{settings.app_name}\nrunning on http://{settings.host}:{settings.port}",
                flush=True,
            )
            # print(
            #     f"请勿重复启动 {settings.app_name}；如需同时运行多个实例，请为每个实例配置不同端口。",
            #     flush=True,
            # )
            serve(app, host=settings.host, port=settings.port)
    except SingleInstanceError:
        exit_with_message(
            f"{settings.app_name}\n检测到重复启动：端口 {settings.port} 已有本程序实例运行。请不要重复启动；若需同时运行请改用不同端口。",
        )
    except PortUnavailableError:
        exit_with_message(
            f"{settings.app_name}\n无法启动：端口 {settings.port} 已被其他程序占用。请先释放该端口，或改用不同端口后再启动。",
        )
    except Exception as exc:
        exit_with_message(
            f"{settings.app_name}\n启动失败：{exc}",
        )


if __name__ == "__main__":
    main()
