# {{name}}

Scaffolded with [Blue Brick](https://bluebrick.fun).

Stack: Python, Flask, Jinja, Tailwind CSS v4 (built with the Tailwind CLI from npm). Every page sits behind an admin password.

## Run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
npm install              # Tailwind CLI only
npm run dev
```

Open http://localhost:3000. The admin password and session secret are in `.env`, written by `bluebrick create`. Without one, copy `.env.example` to `.env` and replace both placeholders (the app refuses to start on placeholders). Keep the venv active when you run `npm run dev`, since it starts Flask.

## Production

```bash
pip install -r requirements.txt
npm ci && npm run build:css
APP_ENV=production gunicorn -w 2 -b 127.0.0.1:8000 app:app
```

Notes:
- Sessions are signed cookies, so they survive restarts. Keep `SESSION_SECRET` private.
- Set `APP_ENV=production` behind HTTPS so the session cookie is marked secure.
- The login rate limit is per worker process.

## Modules

Add features with the Blue Brick CLI, from this folder:

    bluebrick add            # list available modules
    bluebrick add sqlite     # SQLite database with migrations

Modules live in `modules/<name>/` and are loaded on startup, behind the admin password.
## Admin password

The password in `.env` only seeds `data/auth.json` (a salted hash) on first start. After that, change it in **Settings**, or from the terminal:

    bluebrick password              # prompts for a new password
    bluebrick password --generate   # prints a random one, once

Either way every other session is signed out. Keep `data/` on a persistent disk in production and never commit it.
