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
- Set `NODE_ENV=production` behind HTTPS so the session cookie is marked secure.
