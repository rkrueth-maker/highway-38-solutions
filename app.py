import argparse
import sys

from logger import get_logger
from modules import get_module, get_module_menu
from settings import settings

logger = get_logger()


def _mask_setting_value(key, value):
    normalized = key.upper()
    if any(token in normalized for token in {"TOKEN", "SECRET", "PASSWORD", "KEY"}):
        if not value:
            return ""
        return f"<masked:{len(str(value))}>"
    return value


def handle_settings():
    print("\nCurrent settings:")
    for key in sorted(settings._settings):
        masked_value = _mask_setting_value(key, settings._settings[key])
        print(f"- {key} = {masked_value}")

    print("\nType a setting name to update it, or press Enter to cancel.")
    choice = input("Setting name: ").strip()
    if not choice:
        return

    value = input(f"New value for {choice}: ").strip()
    if not value:
        return

    settings.set(choice, value)
    print(f"Updated {choice}.")


def run_choice(choice):
    if choice == "s":
        handle_settings()
        return

    module = get_module(choice)
    if module is None:
        print("Invalid selection.")
        return

    logger.info("Running module %s", module.name)
    module.run()


def parse_args():
    parser = argparse.ArgumentParser(description="Highway 38 Solutions launcher")
    parser.add_argument(
        "--option",
        help="Run a specific module key without entering the interactive menu.",
    )
    parser.add_argument(
        "--setting",
        nargs=2,
        metavar=("NAME", "VALUE"),
        help="Set a configuration variable and persist it to .env.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.setting:
        name, value = args.setting
        settings.set(name, value)
        print(f"Updated {name}.")
        return

    if args.option:
        run_choice(args.option)
        return

    try:
        from shopify.web_dashboard import run as dashboard_run
    except ModuleNotFoundError as exc:
        missing = getattr(exc, "name", "")
        if missing == "flask":
            print("Missing dependency: Flask is required to run the dashboard.")
            print("Install dependencies with: python -m pip install -r requirements.txt")
            sys.exit(1)
        raise

    dashboard_run(host="0.0.0.0")


if __name__ == "__main__":
    main()
