# PLANURAK

Free-first Discord server orchestrator. The bot exposes one administrator command:

- `/planurak preview` — shows the safe diff without changing the server
- `/planurak apply` — creates only missing categories, channels, and roles
- `/planurak health` — confirms the bot is connected

PLANURAK never deletes existing Discord resources and never lets AI execute Discord API calls directly. The current starter blueprint is deterministic and can be extended through the typed blueprint module.

## Local run

```bash
corepack enable
pnpm install
DISCORD_TOKEN=... DISCORD_CLIENT_ID=... PORT=8080 \
  pnpm --filter @workspace/api-server run dev
```

Invite the bot with the `bot` and `applications.commands` scopes. The bot needs `Manage Channels` and `Manage Roles` for `apply`; keep the bot role below roles it should not manage.

## Render Free

This repository includes `render.yaml`. In Render:

1. New → Web Service → connect `aulak493-code/planurak`
2. Select the **Free** instance
3. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` as environment variables
4. Deploy

The service exposes `GET /api/healthz` for the Render health check.

### Free-tier limitation

Render Free services can sleep after inactivity. A Discord Gateway bot is a long-running connection, so a sleeping service can disconnect until Render wakes it. This is a platform limitation, not a code failure. For a reliable always-on bot, a continuously running worker is required; the code remains compatible with that upgrade.

No paid database or paid API is required for the current MVP. Runtime state is reconstructed from Discord on startup, so it is safe to restart and does not depend on local files.