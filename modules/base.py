from abc import ABC, abstractmethod


class BaseModule(ABC):
    key = "0"
    name = "Base Module"
    description = "Base module"

    @abstractmethod
    def run(self):
        raise NotImplementedError
