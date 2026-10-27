# RealmsNetwork AIBot

Open-source, automatic channel-based Discord AI. No slash commands and no database: the bot reads recent messages directly from Discord, builds a timestamped conversation, and replies to the message that triggered it.

## Features

- **Automatic chat channel:** eligible new messages in the configured channel trigger AI replies.
- **Automatic roast channel:** optionally configure a separate channel whose messages receive playful roast-style replies.
- **Discord-native history:** fetches recent messages from the channel each time; human messages become model user turns and the bot own replies become assistant turns.
- **Dates and times:** includes ISO 8601 UTC timestamps, author names, reply references, and attachment names in context.
- **Typing indicator:** shows and refreshes Discord typing while the model is working.
- **Sharding:** starts Discord.js ShardingManager with automatic shard count by default and worker respawning.
- **Provider adapters:** direct OpenAI, Google Gemini, xAI Grok, Anthropic, and OpenAI-compatible endpoints such as Ollama, OpenRouter, Groq, DeepSeek, and custom providers.
- **AI Gateway:** optional unified model routing through AI SDK Gateway for supported providers and models.
- `.gitignore`, config, dependency checker, CI, Docker, tests, security policy, and contribution guide.

## Requirements

- Node.js 22 or newer.
- Discord bot token.
- API key for the chosen provider, unless using local Ollama.

## Discord setup

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable **Message Content Intent** under the bot privileged gateway intents. The bot needs this to read message text.
3. Invite it with the `bot` scope and permissions to view the selected channel, read message history, send messages, and send messages in threads if needed. It also needs permission to send typing indicators.
4. Copy the channel ID with Discord Developer Mode enabled.

## Install and configure

```bash
git clone https://github.com/RealmsNetwork/AIBot.git
cd AIBot
npm install
cp .env.example .env
```

Set `DISCORD_TOKEN` in `.env`. Set `channels.chatChannelId` in `config.json` or `CHAT_CHANNEL_ID` in `.env`. Optionally set `channels.roastChannelId` or `ROAST_CHANNEL_ID` for a separate automatic roast channel.

Choose a provider in `config.json` at `ai.provider`, or override it with `AI_PROVIDER`. Set that provider API key and choose its model, then start:

```bash
npm start
```

The shard manager starts automatically. No slash commands need to be registered.

## Providers and models

Select a provider and a model ID supported by that provider. Model availability, pricing, and features are controlled by the provider and may change.

| Provider | API key environment variable | Notes |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | OpenAI API models, including GPT models available to your API account |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API models |
| `xai` | `XAI_API_KEY` | Grok API models |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude API models |
| `ollama` | Optional `OLLAMA_API_KEY` | Local Ollama OpenAI-compatible endpoint |
| `openrouter` | `OPENROUTER_API_KEY` | Models available through OpenRouter |
| `groq` | `GROQ_API_KEY` | Models available through Groq |
| `deepseek` | `DEEPSEEK_API_KEY` | DeepSeek API models |
| `custom` | `AI_API_KEY` | Any compatible endpoint you configure |
| `gateway` | `AI_GATEWAY_API_KEY` | AI SDK Gateway model IDs such as `provider/model` |

This supports many model families, not literally every model on the internet. A model must be available through the chosen provider and support text generation. A ChatGPT Free/Plus login is not an API credential; OpenAI API usage requires API access and billing where applicable. Ollama must be reachable from the bot process. Inside Docker, `127.0.0.1` points to the container, so configure the correct host address for Ollama.

## Conversation behavior

- The bot replies automatically to new human messages in the configured chat channel.
- It fetches up to `conversation.historyLimit` recent channel messages for each reply and orders them chronologically.
- Each message includes its timestamp, author, text, and reply reference when available.
- The bot own previous messages are sent as assistant turns; human messages are sent as user turns.
- Conversation state is Discord message history, not a separate database. The history window is bounded to control latency and model context usage.
- The bot can only read messages it has permission to view. Attachments are represented by names and metadata, not full contents.
- Other bots are ignored by default, and the bot never responds to its own messages.
- A separate roast channel uses the roast prompt automatically.
- Typing indicators refresh during long requests. Replies are split into Discord-safe chunks.
- Cooldowns and concurrency limits are per shard and held in memory.

## Configuration

See `config.json` for provider models, system prompts, channel IDs, history length, timestamps, typing, roast behavior, and request limits. Environment variables override the main provider and channel settings. Never commit `.env` or API keys.

## Dependency checks and tests

```bash
npm run check:deps
npm run check
npm test
npm audit --omit=dev
```

Run `npm install` and commit the generated `package-lock.json` for reproducible installs. CI checks dependencies, syntax, tests, and production dependency advisories.

## Docker

Configure `.env`, then run:

```bash
docker compose up -d --build
docker compose logs -f aibot
```

The container uses a read-only root filesystem, drops Linux capabilities, and enables `no-new-privileges`. Ensure the configured AI endpoint is reachable from inside the container.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
