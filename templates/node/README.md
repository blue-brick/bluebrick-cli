# {{name}}

Scaffolded with [Blue Brick](https://bluebrick.fun).

Stack: Node.js, Express 5, EJS, Tailwind CSS v4. Every page sits behind an admin password.

## Run it

```bash
npm run dev
```

Open http://localhost:3000. The admin password and session secret are in `.env`, written by `bluebrick create`. Without one, copy `.env.example` to `.env` and replace both placeholders (the app refuses to start on placeholders).

## Production

```bash
npm ci
npm run build:css
NODE_ENV=production npm start
```

Notes:
- Sessions use the default in-memory store, so logins reset on restart and it only suits a single process. Swap in a real store before scaling.
- `NODE_ENV=production` marks the session cookie Secure whenever the request arrives over HTTPS, so login works through an HTTPS reverse proxy and still works over plain HTTP while you test.
- Production mode also trusts the proxy's `X-Forwarded-*` headers. Keep the app's port closed to the internet and reach it only through your proxy.
- Products installed with `bluebrick activate` already have `NODE_ENV=production` in `.env`.

## Modules

Add features with the Blue Brick CLI, from this folder:

    bluebrick add            # list available modules
    bluebrick add sqlite     # SQLite database with migrations

Modules live in `src/modules/<name>/` and are loaded on startup, behind the admin password.

## Admin password

The password in `.env` only seeds `data/auth.json` (a salted hash) on first start. After that, change it in **Settings**, or from the terminal:

    bluebrick password              # prompts for a new password
    bluebrick password --generate   # prints a random one, once

Either way every other session is signed out. Keep `data/` on a persistent disk in production and never commit it.
