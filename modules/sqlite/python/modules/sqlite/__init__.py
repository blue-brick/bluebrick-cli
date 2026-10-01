import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

# modules/sqlite/__init__.py -> project root is three levels up
ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = Path(os.environ.get("SQLITE_PATH") or ROOT / "data" / "app.db")
MIGRATIONS_DIR = ROOT / "migrations"


@contextmanager
def connect():
    """Open a connection: commits on success, rolls back on error, always closes."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def migrate():
    """Apply migrations/*.sql in filename order, once each.

    Write them to be re-runnable (CREATE TABLE IF NOT EXISTS) so a half-finished
    deploy or two workers starting together can't break startup.
    """
    with connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS _migrations "
            "(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        applied = {row["name"] for row in conn.execute("SELECT name FROM _migrations")}

        if not MIGRATIONS_DIR.exists():
            return

        for file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if file.name in applied:
                continue
            conn.executescript(file.read_text())
            conn.execute("INSERT OR IGNORE INTO _migrations (name) VALUES (?)", (file.name,))
            conn.commit()
            print(f"[sqlite] applied {file.name}")


migrate()


def get_setting(key, fallback=None):
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else fallback


def set_setting(key, value):
    with connect() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            (key, str(value)),
        )


def register(app):
    pass
