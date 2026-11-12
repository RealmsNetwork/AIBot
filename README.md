# RealmsNetwork AIBot

Open-source, automatic channel-based Discord AI. No slash commands and no database: the bot reads recent messages directly from Discord, builds a timestamped conversation, and replies to the message that triggered it.

## Features

- **Automatic chat channel:** eligible new messages in the configured channel trigger AI replies.
- **Automatic roast channel:** optionally configure a separate channel whose messages receive playful roast-style replies.
- **Mention and reply triggers:** @mentions and replies to the bot work outside the dedicated channels (same guild), using chat mode by default.
- **Server and channel awareness:** builds a public channel map (names, types, categories, topics) and can sample recent messages from other public channels for situational context.
- **Discord-native history:** fetches recent messages from the channel each time; human messages become model user turns and the bot own replies become assistant turns.
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
| `perplexity` | `PERPLEXITY_API_KEY` | Perplexity API models |
| `mistral` | `MISTRAL_API_KEY` | Mistral API models |
| `together` | `TOGETHER_API_KEY` | Together AI hosted models |
| `fireworks` | `FIREWORKS_API_KEY` | Fireworks AI hosted models |

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
- Mentions and replies to the bot can trigger chat-mode replies outside the dedicated channels when enabled in `config.triggers`.
- Optional `config.context` settings inject a public guild channel map and sampled messages from other readable public channels (staff/private name patterns are filtered).
- Typing indicators refresh during long requests. Replies are split into Discord-safe chunks.
- Cooldowns and concurrency limits are per shard and held in memory.

## Configuration

See `config.json` for provider models, system prompts, channel IDs, history length, timestamps, typing, roast behavior, and request limits. Environment variables override the main provider and channel settings. Never commit `.env` or API keys.

## Python interpreter and execution safety

The AI can use a Python 3 interpreter for calculations, time/date work, and bounded data processing. It runs in a fresh Pyodide/WebAssembly worker for each execution, not inside the Discord bot's main JavaScript thread. The worker is terminated after the configured time limit; output, source length, concurrent runs, and its V8 heap are bounded. Docker Compose also caps the whole bot container at 1 GiB RAM, 1.5 CPU, and 128 processes. The Python-to-JavaScript bridge exposes only the mediated HTTPS helper through a restricted global object; it does not expose Node's process, filesystem, or native fetch globals. Pyodide does not provide shell commands, host filesystem access, subprocess execution, or native mining binaries.

Network access is not a raw socket or unrestricted internet connection. Python code must use the `realmsnet.http_get(url)` helper, which permits HTTPS GET only, resolves and pins a public IPv4 destination, rejects private/local destinations and redirects, limits response size and request count, throttles reputation lookups, and applies a domain reputation check. Network access is fail-closed unless the reputation service is configured.

Set `VIRUSTOTAL_API_KEY` in `.env` to enable the optional VirusTotal domain reputation lookup. This implementation queries the hostname's existing domain report only; it does not submit or scan the full URL, and it never sends URL paths or query strings to VirusTotal. The hostname itself is disclosed to VirusTotal for the lookup. VirusTotal's public API is limited to 4 requests per minute / 500 per day and must not be integrated into commercial products or services. The code applies a 15-second cooldown per bot process; deployments with multiple shards sharing one key should use a shared rate limiter or a suitable provider with a quota that fits. Review the current [VirusTotal API terms](https://docs.virustotal.com/docs/api-overview) before enabling it. If those terms do not fit your deployment, keep sandbox networking disabled until a suitable reputation provider is configured.

This is defense in depth, not a guarantee that arbitrary code is harmless. Keep the container resource limits enabled, update dependencies, and do not expose secrets to the Python worker.

## Discord context coverage

The bot builds a map of up to 120 readable public channels and samples recent messages from up to 20 other public channels per context refresh (cached for 45 seconds). A channel must be visible to `@everyone` as well as readable by the bot; private channels and private threads are not used, and staff-ish channel/category names are excluded by default. Supported context sources include text channels, announcements, public threads, and embedded text chat in voice/stage channels. It does not join voice calls or receive audio. Discord channel permissions still apply; the bot needs View Channel and Read Message History, plus Connect for voice-channel text chat.

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

MIT. See [LICENSE](LICENSE).
