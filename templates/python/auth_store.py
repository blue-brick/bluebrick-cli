import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AUTH_PATH = ROOT / "data" / "auth.json"

# scrypt parameters. The Node template and `bluebrick password` use the same format,
# so a hash written by any of them is accepted by all of them.
N, R, P, KEYLEN = 16384, 8, 1, 64
MAX_PASSWORD_LENGTH = 256


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=KEYLEN)
    parts = [
        "scrypt",
        str(N),
        str(R),
        str(P),
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    ]
    return "$".join(parts)


def verify_password(password, stored):
    if len(password) > MAX_PASSWORD_LENGTH:
        return False
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode(),
            salt=base64.b64decode(salt_b64),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


def _write(data):
    AUTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = AUTH_PATH.with_name(f"{AUTH_PATH.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, AUTH_PATH)


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def auth_exists():
    return AUTH_PATH.exists()


def get_auth():
    """Read on every call (it is a tiny file) so a change made from the terminal
    takes effect immediately, without restarting the server."""
    try:
        return json.loads(AUTH_PATH.read_text())
    except (OSError, ValueError):
        return {"hash": "", "version": 0, "changedAt": ""}


def ensure_auth(bootstrap_password):
    """First start only: seed the store from the password in .env."""
    if auth_exists():
        return
    _write({"hash": hash_password(bootstrap_password), "version": 1, "changedAt": _now()})


def check_password(password):
    return verify_password(password, get_auth().get("hash", ""))


def set_password(password):
    """Bumping the version signs out every existing session."""
    data = {
        "hash": hash_password(password),
        "version": int(get_auth().get("version", 0)) + 1,
        "changedAt": _now(),
    }
    _write(data)
    return data
