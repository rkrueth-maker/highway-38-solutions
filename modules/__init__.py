import inspect
from importlib import import_module
from pkgutil import iter_modules

from .base import BaseModule


def discover_modules():
    discovered = []
    for _, module_name, _ in iter_modules(__path__):
        if module_name.startswith("_") or module_name in {"base"}:
            continue

        imported = import_module(f"{__name__}.{module_name}")
        for _, obj in inspect.getmembers(imported, inspect.isclass):
            if issubclass(obj, BaseModule) and obj is not BaseModule:
                discovered.append(obj())
                break

    return sorted(discovered, key=lambda module: int(str(module.key)))


MODULES = discover_modules()


def get_module(choice):
    for module in MODULES:
        if str(module.key) == str(choice):
            return module
    return None


def get_module_menu():
    return [(module.key, module.name, module.description) for module in MODULES]
