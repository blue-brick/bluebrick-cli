import hmac
import secrets

from flask import request, session


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(24)
    return session["csrf"]


def csrf_ok():
    sent = request.form.get("_csrf", "")
    expected = session.get("csrf", "")
    return bool(sent) and hmac.compare_digest(sent.encode(), expected.encode())
