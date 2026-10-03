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
| `bluebrick activate <key> [folder]` | Activate a license key and download the product it unlocks. Options: `--here` (install into the current empty folder), `--no-install` |
| `bluebrick license` | Show the license of the current product and check it with the license server |
| `bluebrick deactivate` | Free the key so it can be activated on another machine. Option: `-y, --yes` |

## Templates

- `node`: Express + EJS + Tailwind
- `python`: Flask + Jinja + Tailwind

Both include an admin login, a Settings page to change the password, and a forgot-password flow that uses a one-time code read from the server.

## Modules

    cd my-app
    bluebrick add sqlite
    bluebrick add timezone

- `sqlite`: SQLite database with automatic migrations
- `timezone`: choose a country and time zone (or a fixed GMT offset) in Settings, with a live clock. Your code formats times with `formatTime()` (Node) or `format_time()` (Python)

## Licensed products

Products bought from Blue Brick come with a license key that looks like `BB-XXXX-XXXX-XXXX-XXXX`. One key works on one machine.

    npx bluebrick activate BB-XXXX-XXXX-XXXX-XXXX
    cd product-name

Moving to a new server: run `bluebrick deactivate` in the product folder, then activate the key on the new machine. If you no longer have access to the old machine, email hello@bluebrick.fun and the key will be reset.

## Forgot the admin password?

- In the browser: click **Forgot password?** on the login page, create a reset code, read it from the server log or `data/reset.json`, and set a new password.
- In the terminal: run `bluebrick password` in the project folder. It never asks for the old password.

Built by [Blue Brick](https://bluebrick.fun).
