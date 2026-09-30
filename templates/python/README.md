# {{name}}

Scaffolded with [Blue Brick](https://bluebrick.fun).

Stack: Python, Flask, Jinja, Tailwind CSS v4 (built with the Tailwind CLI from npm). Every page sits behind an admin password.

## Run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # then edit ADMIN_PASSWORD and SESSION_SECRET
npm install              # Tailwind CLI only
npm run dev
```

Open http://localhost:3000. Keep the venv active when you run `npm run dev`, since it starts Flask.

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
