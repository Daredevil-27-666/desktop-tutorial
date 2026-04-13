# jarvis-bot

Telegram bot that runs prompts through Claude Code on a VPS. Send a message,
it runs `claude -p "<your message>" --dangerously-skip-permissions` in a
fixed working directory and sends the output back.

**Only allowlisted Telegram user IDs can talk to the bot.** Anyone not on
the list is silently ignored.

## What's in the repo

- `install.sh` — one-shot installer for Debian 13 (trixie). Creates the
  `jarvis` user, installs Node/Bun/Claude Code, copies the bot, starts it
  as a systemd service.
- `bot/` — the bot itself, written in TypeScript, run by Bun.
- `systemd/jarvis-bot.service` — the systemd unit.
- `.env.example` — template for the environment variables the bot needs.

## Deploy

You run these commands on the VPS. The repo never sees your secrets.

1. Clone the repo on the VPS:

   ```
   git clone https://github.com/daredevil-27-666/desktop-tutorial.git
   cd desktop-tutorial
   git checkout claude/vps-ssh-access-VnP8b
   ```

2. Create `.env` from the template and fill in your real values:

   ```
   cp .env.example .env
   nano .env
   ```

   You need:
   - `ANTHROPIC_API_KEY` — from https://console.anthropic.com/
   - `TELEGRAM_BOT_TOKEN` — from `@BotFather` on Telegram
   - `TELEGRAM_ALLOWED_USER_IDS` — comma-separated numeric Telegram IDs.
     Get yours from `@userinfobot`.

   `.env` is gitignored. Do not commit it.

3. Run the installer:

   ```
   sudo ./install.sh
   ```

   This installs packages, creates the `jarvis` user, copies the bot to
   `/home/jarvis/bot`, and starts the `jarvis-bot` systemd service.

4. Check it's running:

   ```
   systemctl status jarvis-bot
   journalctl -u jarvis-bot -f
   ```

5. Talk to the bot on Telegram. Send `/start` to your bot.

## Security notes

- The bot runs Claude Code with `--dangerously-skip-permissions`. Whoever
  can talk to the bot effectively has shell access as `jarvis` inside
  `/home/jarvis/workspace`. The **only** thing protecting you is the
  allowlist. Keep `TELEGRAM_ALLOWED_USER_IDS` accurate.
- The `jarvis` user has no sudo. If the bot needs to install packages or
  touch `/etc`, SSH in yourself and do it.
- If you ever leak your bot token, revoke it immediately in `@BotFather`
  (`/mybots` → bot → API Token → Revoke), update `.env` on the VPS, then
  `sudo systemctl restart jarvis-bot`.

## Commands

- `/start` — welcome message
- `/help` — list commands
- `/cwd` — show working directory
- `/status` — show queue status
- any other text — treated as a Claude Code prompt

## Customizing

- Working directory: set `WORK_DIR` in `.env`. Default `/home/jarvis/workspace`.
- Multiple users: add more IDs to `TELEGRAM_ALLOWED_USER_IDS`, comma-separated.
- Extra commands: edit `bot/index.ts` — add handlers with `bot.command(...)`.
