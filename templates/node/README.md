# {{name}}

Scaffolded with [Blue Brick](https://bluebrick.fun).

Stack: Node.js, Express 5, EJS, Tailwind CSS v4. Every page sits behind an admin password.

## Run it

```bash
cp .env.example .env     # then edit ADMIN_PASSWORD and SESSION_SECRET
npm run dev
```

Open http://localhost:3000.

## Production

```bash
npm ci
npm run build:css
NODE_ENV=production npm start
```

Notes:
- Sessions use the default in-memory store, so logins reset on restart and it only suits a single process. Swap in a real store before scaling.
- Set `NODE_ENV=production` behind HTTPS so the session cookie is marked secure.
