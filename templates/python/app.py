import os
import time
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, session, url_for
from flask.sessions import SecureCookieSessionInterface
from werkzeug.middleware.proxy_fix import ProxyFix

from auth_store import auth_exists, check_password, ensure_auth, get_auth, set_password
from csrf import csrf_ok, csrf_token
from modules import load_modules
from reset_code import consume_reset_code, has_active_code, request_reset_code
from settings_sections import render_settings_sections

load_dotenv()

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
SESSION_SECRET = os.environ.get("SESSION_SECRET") or ""
IS_PROD = os.environ.get("APP_ENV") == "production"

# Refuse to start with missing or placeholder secrets
PLACEHOLDERS = ("change-me", "change-me-too")
config_errors = []

# ADMIN_PASSWORD only seeds data/auth.json on first start; after that the stored hash wins.
if not auth_exists() and (ADMIN_PASSWORD in PLACEHOLDERS or len(ADMIN_PASSWORD) < 8):
    config_errors.append(
        "ADMIN_PASSWORD must be set to a real password (8+ characters), not the placeholder."
    )
if SESSION_SECRET in PLACEHOLDERS or len(SESSION_SECRET) < 32:
    config_errors.append(
        "SESSION_SECRET must be a random string of 32+ characters. "
        'Generate one with: python3 -c "import secrets; print(secrets.token_hex(32))"'
    )
if config_errors:
    raise SystemExit("\nCannot start, fix your .env:\n- " + "\n- ".join(config_errors) + "\n")

ensure_auth(ADMIN_PASSWORD)


class AutoSecureSessionInterface(SecureCookieSessionInterface):
    """Mark the session cookie Secure only when the request arrived over HTTPS.

    In production a request counts as HTTPS when the reverse proxy says so (ProxyFix reads
    X-Forwarded-Proto). Plain HTTP still works, so a first test on http://ip:port can log in.
    """

    def get_cookie_secure(self, app):
        return IS_PROD and request.is_secure


app = Flask(__name__)
app.config.update(
    SECRET_KEY=SESSION_SECRET,
    SESSION_COOKIE_NAME="bb.sid",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)
app.session_interface = AutoSecureSessionInterface()

# In production a reverse proxy (nginx, Caddy, a control panel) usually sits in front
if IS_PROD:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# --- login rate limiting (per process) ---
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 15 * 60
attempts = {}  # ip -> [count, reset_at]


def is_blocked(ip):
    entry = attempts.get(ip)
    if not entry:
        return False
    if time.time() > entry[1]:
        attempts.pop(ip, None)
        return False
    return entry[0] >= MAX_ATTEMPTS


def record_failure(ip):
    entry = attempts.get(ip)
    if not entry or time.time() > entry[1]:
        attempts[ip] = [1, time.time() + WINDOW_SECONDS]
    else:
        entry[0] += 1


# A session is only valid if it carries the current auth version,
# so changing the password signs out every other session.
def is_authed():
    return bool(session.get("is_admin")) and session.get("auth_version") == get_auth().get("version")


# Login and password recovery are public. Everything else needs the admin session.
PUBLIC_ENDPOINTS = ("login", "static", "forgot", "forgot_request", "forgot_reset")


@app.before_request
def require_auth():
    if request.endpoint in PUBLIC_ENDPOINTS or is_authed():
        return None
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if is_authed():
        return redirect(url_for("index"))

    if request.method == "POST":
        ip = request.remote_addr or "unknown"

        if is_blocked(ip):
            return (
                render_template(
                    "login.html",
                    title="Login",
                    error="Too many attempts. Try again in a few minutes.",
                ),
                429,
            )

        if not check_password(request.form.get("password", "")):
            record_failure(ip)
            return (
                render_template("login.html", title="Login", error="Wrong password."),
                401,
            )

        attempts.pop(ip, None)
        session.clear()
        session["is_admin"] = True
        session["auth_version"] = get_auth().get("version")
        session.permanent = True
        return redirect(url_for("index"))

    notice = "Password changed. Log in with the new one." if request.args.get("reset") == "1" else None
    return render_template("login.html", title="Login", error=None, notice=notice)


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# --- forgot password: prove you own the server with a one-time code ---
def render_forgot(error=None, info=None, status=200):
    return (
        render_template(
            "forgot.html",
            title="Forgot password",
            error=error,
            info=info,
            active=has_active_code(),
        ),
        status,
    )


@app.get("/forgot")
def forgot():
    return render_forgot()


@app.post("/forgot/request")
def forgot_request():
    ok, error = request_reset_code()
    if not ok:
        return render_forgot(error=error, status=429)
    return render_forgot(
        info="Reset code created. Find it in the server log, or run: cat data/reset.json (in the project folder). It is valid for 15 minutes."
    )


@app.post("/forgot/reset")
def forgot_reset():
    ip = request.remote_addr or "unknown"
    if is_blocked(ip):
        return render_forgot(error="Too many attempts. Try again in a few minutes.", status=429)

    code = request.form.get("code", "")
    new = request.form.get("newPassword", "")
    confirm = request.form.get("confirmPassword", "")

    # Check the password first, so a typo doesn't burn the one-time code.
    if len(new) < 8 or len(new) > 128:
        return render_forgot(error="New password must be 8 to 128 characters.", status=400)
    if new != confirm:
        return render_forgot(error="The two passwords do not match.", status=400)

    ok, error = consume_reset_code(code)
    if not ok:
        record_failure(ip)
        return render_forgot(error=error, status=400)

    attempts.pop(ip, None)
    set_password(new)  # bumps the version: every session is signed out
    return redirect(url_for("login", reset=1))


@app.route("/")
def index():
    return render_template("dashboard.html", title="Dashboard")


def render_settings(error=None, status=200):
    return (
        render_template(
            "settings.html",
            title="Settings",
            error=error,
            changed=request.args.get("changed") == "1",
            changed_at=get_auth().get("changedAt", ""),
            csrf=csrf_token(),
            sections=render_settings_sections(),
        ),
        status,
    )


@app.get("/settings")
def settings():
    return render_settings()


@app.post("/settings/password")
def change_password():
    if not csrf_ok():
        return "Invalid form token. Reload the page and try again.", 403

    ip = request.remote_addr or "unknown"
    if is_blocked(ip):
        return render_settings("Too many attempts. Try again in a few minutes.", 429)

    current = request.form.get("currentPassword", "")
    new = request.form.get("newPassword", "")
    confirm = request.form.get("confirmPassword", "")

    if not check_password(current):
        record_failure(ip)
        return render_settings("Current password is wrong.", 401)
    if len(new) < 8 or len(new) > 128:
        return render_settings("New password must be 8 to 128 characters.", 400)
    if new != confirm:
        return render_settings("The two new passwords do not match.", 400)
    if new == current:
        return render_settings("New password must be different from the current one.", 400)

    attempts.pop(ip, None)
    data = set_password(new)

    # Every other session is now invalid; keep this one signed in.
    session.clear()
    session["is_admin"] = True
    session["auth_version"] = data["version"]
    session.permanent = True
    return redirect(url_for("settings", changed=1))


@app.errorhandler(404)
def not_found(e):
    return render_template("404.html", title="Not found"), 404


@app.errorhandler(500)
def server_error(e):
    return render_template("500.html", title="Server error"), 500


# Modules added with `bluebrick add <name>` register here, behind the admin password.
load_modules(app)
