import json
import os
import secrets
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RESET_PATH = ROOT / "data" / "reset.json"

TTL_SECONDS = 15 * 60  # a code is valid for 15 minutes
MIN_GAP_SECONDS = 60  # at most one new code per minute
MAX_ATTEMPTS = 5  # wrong guesses before the code is thrown away
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 32 characters, no look-alikes


def _read():
    try:
        return json.loads(RESET_PATH.read_text())
    except (OSError, ValueError):
        return None


def _write(state):
    RESET_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = RESET_PATH.with_name(f"{RESET_PATH.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, RESET_PATH)


def _normalize(value):
    return "".join(ch for ch in str(value).upper() if ch.isalnum())


def clear_reset_code():
    try:
        RESET_PATH.unlink()
    except FileNotFoundError:
        pass


def has_active_code():
    state = _read()
    return bool(state) and time.time() <= state["expiresAt"]


def _new_code():
    # 16 characters x 5 bits = 80 bits, shown as XXXX-XXXX-XXXX-XXXX
    chars = [secrets.choice(ALPHABET) for _ in range(16)]
    return "-".join("".join(chars[i : i + 4]) for i in (0, 4, 8, 12))


def request_reset_code():
    """The code is printed in the server log and saved in data/reset.json,
    so only someone with access to the server can read it. Returns (ok, error)."""
    state = _read()
    if state and time.time() - state["createdAt"] < MIN_GAP_SECONDS:
        return False, "A code was created a moment ago. Wait a minute before asking for another."

    code = _new_code()
    now = time.time()
    _write({"code": code, "createdAt": now, "expiresAt": now + TTL_SECONDS, "attempts": 0})
    print(
        f"\n[bluebrick] Password reset code: {code} (valid 15 minutes, also saved in data/reset.json)\n",
        flush=True,
    )
    return True, None


def consume_reset_code(user_input):
    """Returns (ok, error). A correct code works once, then it is gone."""
    state = _read()
    if not state:
        return False, "No reset code is active. Create a new one."

    if time.time() > state["expiresAt"]:
        clear_reset_code()
        return False, "That code expired. Create a new one."

    sent = _normalize(user_input).encode()
    expected = _normalize(state["code"]).encode()

    if not secrets.compare_digest(sent, expected):
        state["attempts"] += 1
        if state["attempts"] >= MAX_ATTEMPTS:
            clear_reset_code()
            return False, "Too many wrong codes. Create a new one."
        _write(state)
        return False, "Wrong code."

    clear_reset_code()
    return True, None
