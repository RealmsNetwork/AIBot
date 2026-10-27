# RealmsNetwork AIBot

An open-source Discord bot with AI chat, playful AI roasts, slash commands, configurable AI providers, dependency checks, and CI.

## Features

- `/chat` — AI chat with short, per-user conversation context.
- `/roast` — playful AI roasts for yourself or a friend.
- `/clear-chat` — clear your conversation context.
- `/ping` — check Discord gateway latency.
- `/health` — inspect runtime and AI configuration status.
- OpenAI-compatible API endpoint configuration.
- Configurable prompts, cooldowns, model, response limits, and feature toggles.
- Dependency integrity checker and automated CI checks.
- Dockerfile and hardened Docker Compose deployment.
- No privileged Discord gateway intents required for the included commands.

## Requirements

- Node.js 20.18 or newer, or Docker.
- A Discord application and bot token.
- An API key for an OpenAI-compatible AI provider.

## Quick start

1. Clone and install:

   ```bash
   git clone https://github.com/RealmsNetwork/AIBot.git
   cd AIBot
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `AI_API_KEY`. Optionally set `DISCORD_GUILD_ID` to register commands to a test server first.

3. Edit `config.json` to customize the model, prompts, cooldowns, and enabled commands. `AI_BASE_URL` and `AI_MODEL` environment variables override the matching config values.

4. In the Discord Developer Portal, invite the bot with the `bot` and `applications.commands` scopes. The included commands need no privileged gateway intents.

5. Register slash commands and start the bot:

   ```bash
   npm run deploy:commands
   npm start
   ```

For development, run `npm run dev`.

## Docker deployment

Create `.env` using `.env.example`, then register commands once from a local Node.js install with `npm run deploy:commands`. Build and start the container:

```bash
docker compose up -d --build
docker compose logs -f aibot
```

The Compose service uses a read-only root filesystem, drops Linux capabilities, enables `no-new-privileges`, and restarts unless stopped. Keep `.env` private.

## Dependency checker and tests

```bash
npm run check:deps
npm run check
npm test
npm audit --omit=dev
```

Run `npm install` and commit the generated `package-lock.json` to make deployments reproducible and allow CI to use `npm ci`. CI checks dependency integrity, JavaScript syntax, tests, and production dependency advisories.

## Configuration

Never put secrets in `config.json`. Store tokens and provider keys in environment variables, and never commit `.env`.

- `AI_BASE_URL`: OpenAI-compatible API base URL.
- `AI_MODEL`: model identifier supported by your provider.
- `DISCORD_GUILD_ID`: optional test guild for faster command updates.
- `security.adminUserIds`: reserved for future owner-only commands; current commands do not expose privileged admin actions.

## Production notes

- Conversation history is held in process memory and is lost on restart. It is separated by guild, channel, and user.
- Cooldowns are per process. Multi-replica deployments need a shared rate-limit store.
- Keep the bot running under a process manager or container restart policy.
- Review your AI provider's privacy and retention policies before sending user messages to it.
- AI output is untrusted; automatic mention parsing is disabled on generated replies.
- Test in a private development server before inviting the bot elsewhere.

## License

GPL-3.0. See [LICENSE](LICENSE).
