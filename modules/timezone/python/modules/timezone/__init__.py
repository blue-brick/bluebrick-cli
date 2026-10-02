import datetime as dt
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, redirect, render_template, request, url_for

# Needs the Settings sections hook (template 0.4.0 or newer). On an older project the module
# stays inactive instead of crashing the server; register() below says so.
try:
    from csrf import csrf_ok, csrf_token
    from settings_sections import add_settings_section

    HAS_SETTINGS = True
except ImportError:
    HAS_SETTINGS = False

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # modules/timezone -> modules -> project root
CONFIG_PATH = ROOT / "data" / "timezone.json"

COUNTRIES = json.loads((HERE / "countries.json").read_text(encoding="utf-8"))
ZONES = {zone for country in COUNTRIES for zone in country["zones"]} | {"UTC"}

# Fixed offsets in minutes from UTC. They never change for daylight saving.
OFFSETS = [
    -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240, 270,
    300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 825, 840,
]

DEFAULT_CONFIG = {"mode": "zone", "country": None, "zone": "UTC", "minutes": 0}


def format_offset(minutes):
    sign = "-" if minutes < 0 else "+"
    hours, mins = divmod(abs(minutes), 60)
    return f"GMT{sign}{hours}" + (f":{mins:02d}" if mins else "")


OFFSET_OPTIONS = [{"minutes": m, "label": format_offset(m)} for m in OFFSETS]


# --- saved choice (data/timezone.json) ---
def get_timezone():
    try:
        saved = json.loads(CONFIG_PATH.read_text())
    except (OSError, ValueError):
        return dict(DEFAULT_CONFIG)
    if saved.get("mode") == "offset" and saved.get("minutes") in OFFSETS:
        return {**DEFAULT_CONFIG, **saved}
    if saved.get("mode") == "zone" and saved.get("zone") in ZONES:
        return {**DEFAULT_CONFIG, **saved}
    return dict(DEFAULT_CONFIG)


def save_timezone(config):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_name(f"{CONFIG_PATH.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(config, indent=2))
    os.replace(tmp, CONFIG_PATH)


def _utc_now():
    return dt.datetime.now(dt.timezone.utc)


# --- offset, abbreviation and daylight saving ---
def describe(config=None, when=None):
    config = config or get_timezone()
    when = when or _utc_now()

    if config["mode"] == "offset":
        minutes = config["minutes"]
        label = format_offset(minutes)
        return {
            "zone": None,
            "abbr": None,
            "offsetMinutes": minutes,
            "offsetLabel": label,
            "dst": False,
            "summary": f"{label} (fixed offset, no daylight saving)",
        }

    local = when.astimezone(ZoneInfo(config["zone"]))
    minutes = int(local.utcoffset().total_seconds() // 60)
    label = format_offset(minutes)
    abbr = local.tzname()
    if abbr and abbr[0] in "+-":  # zones without a real abbreviation report "+0545"
        abbr = None
    dst = bool(local.dst())

    parts = [p for p in (abbr, label) if p]
    if dst:
        parts.append("daylight saving in effect")

    return {
        "zone": config["zone"],
        "abbr": abbr,
        "offsetMinutes": minutes,
        "offsetLabel": label,
        "dst": dst,
        "summary": " · ".join(parts),
    }


def clock_strings(minutes, when=None):
    shifted = (when or _utc_now()) + dt.timedelta(minutes=minutes)
    return shifted.strftime("%H:%M:%S"), shifted.strftime("%a, %d %b %Y")


def format_time(value=None, fmt="%d %b %Y, %H:%M:%S"):
    """For your products: format a datetime, timestamp or ISO string in the chosen time zone.
    Store timestamps in UTC and call this only when showing them."""
    if value is None:
        value = _utc_now()
    elif isinstance(value, (int, float)):
        value = dt.datetime.fromtimestamp(value, dt.timezone.utc)
    elif isinstance(value, str):
        value = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)

    config = get_timezone()
    if config["mode"] == "offset":
        tz = dt.timezone(dt.timedelta(minutes=config["minutes"]))
    else:
        tz = ZoneInfo(config["zone"])
    return value.astimezone(tz).strftime(fmt)


# --- reading what the form or the preview sends; None means invalid ---
def config_from_input(data):
    mode = data.get("mode")

    if mode == "offset":
        try:
            minutes = int(data.get("minutes") or data.get("offset") or "")
        except ValueError:
            return None
        if minutes not in OFFSETS:
            return None
        return {"mode": "offset", "country": None, "zone": None, "minutes": minutes}

    if mode == "zone":
        zone = data.get("zone", "")
        country = data.get("country") or None
        if zone not in ZONES:
            return None
        if country:
            entry = next((c for c in COUNTRIES if c["code"] == country), None)
            if not entry or zone not in entry["zones"]:
                return None
        return {"mode": "zone", "country": country, "zone": zone, "minutes": 0}

    return None


bp = Blueprint("timezone", __name__, template_folder="templates")


@bp.get("/settings/timezone/preview")
def preview():
    config = config_from_input(request.args)
    if config is None:
        return jsonify(ok=False), 400
    return jsonify(ok=True, **describe(config))


@bp.post("/settings/timezone")
def save():
    if not csrf_ok():
        return "Invalid form token. Reload the page and try again.", 403
    config = config_from_input(request.form)
    if config is None:
        return redirect(url_for("settings", tz="error") + "#timezone")
    save_timezone(config)
    return redirect(url_for("settings", tz="saved") + "#timezone")


def render_section():
    config = get_timezone()
    info = describe(config)
    time_text, date_text = clock_strings(info["offsetMinutes"])

    return render_template(
        "timezone/section.html",
        csrf=csrf_token(),
        saved=request.args.get("tz") == "saved",
        error="Pick a country and a time zone, or choose a fixed offset." if request.args.get("tz") == "error" else None,
        preview={**info, "time": time_text, "date": date_text},
        data={"countries": COUNTRIES, "offsets": OFFSET_OPTIONS, "current": config, "preview": info},
    )


def register(app):
    if not HAS_SETTINGS:
        print(
            "[timezone] This project has no Settings sections, so the module is inactive. "
            "Create a fresh project with bluebrick 0.4.0 or later."
        )
        return
    app.register_blueprint(bp)
    add_settings_section("timezone", "Time zone", render_section)
