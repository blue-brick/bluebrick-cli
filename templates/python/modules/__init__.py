import importlib
import pkgutil


def load_modules(app):
    """Load every package in modules/ that defines register(app).

    `bluebrick add <name>` drops modules in here, so no other file needs editing.
    """
    loaded = []
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        if not info.ispkg:
            continue
        mod = importlib.import_module(f"{__name__}.{info.name}")
        register = getattr(mod, "register", None)
        if callable(register):
            register(app)
            loaded.append(info.name)

    if loaded:
        print(f"Modules loaded: {', '.join(loaded)}")
    return loaded
