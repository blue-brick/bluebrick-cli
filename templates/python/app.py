import hashlib
import hmac
import os
import time
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
SESSION_SECRET = os.environ.get("SESSION_SECRET")
IS_PROD = os.environ.get("APP_ENV") == "production"

if not ADMIN_PASSWORD or not SESSION_SECRET:
    raise SystemExit(
        "Missing ADMIN_PASSWORD or SESSION_SECRET. Copy .env.example to .env and fill them in."
    )

app = Flask(__name__)
app.config.update(
    SECRET_KEY=SESSION_SECRET,
    SESSION_COOKIE_NAME="bb.sid",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=IS_PROD,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)

# CloudPanel / nginx sits in front in production
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


def password_matches(value):
    a = hashlib.sha256(value.encode()).digest()
    b = hashlib.sha256(ADMIN_PASSWORD.encode()).digest()
    return hmac.compare_digest(a, b)


# --- everything except login and static files needs the admin session ---
@app.before_request
def require_auth():
    if request.endpoint in ("login", "static") or session.get("is_admin"):
        return None
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("is_admin"):
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

        if not password_matches(request.form.get("password", "")):
            record_failure(ip)
            return (
                render_template("login.html", title="Login", error="Wrong password."),
                401,
            )

        attempts.pop(ip, None)
        session.clear()
        session["is_admin"] = True
        session.permanent = True
        return redirect(url_for("index"))

    return render_template("login.html", title="Login", error=None)


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
def index():
    return render_template("dashboard.html", title="Dashboard")


@app.errorhandler(404)
def not_found(e):
    return render_template("404.html", title="Not found"), 404


@app.errorhandler(500)
def server_error(e):
    return render_template("500.html", title="Server error"), 500
