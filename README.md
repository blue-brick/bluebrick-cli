# bluebrick

Blue Brick CLI. Scaffold a new project in seconds.

    npx bluebrick create my-app

Pick a stack (Node or Python) and get a working project with an admin login, a Settings page, custom error pages and Tailwind already set up. A strong `.env` is written for you.

## Commands

| Command | What it does |
| --- | --- |
| `bluebrick create [name]` | Create a new project. Options: `-t, --template <stack>` (node or python), `--no-install`, `--no-git` |
| `bluebrick add [module]` | Add a module to the current project. Run without a name to list the modules |
| `bluebrick password` | Change the admin password of the current project. Use `--generate` for a random one. Works while the server is running |
| `bluebrick reset` | Delete everything in the current project and rebuild it from the clean template. Asks for confirmation first |

## Templates

- `node`: Express + EJS + Tailwind
- `python`: Flask + Jinja + Tailwind

Both include an admin login, a Settings page to change the password, and a forgot-password flow that uses a one-time code read from the server.

## Modules

    cd my-app
    bluebrick add sqlite

- `sqlite`: SQLite database with automatic migrations

## Forgot the admin password?

- In the browser: click **Forgot password?** on the login page, create a reset code, read it from the server log or `data/reset.json`, and set a new password.
- In the terminal: run `bluebrick password` in the project folder. It never asks for the old password.

Built by [Blue Brick](https://bluebrick.fun).
