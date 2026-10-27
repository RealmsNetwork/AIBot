require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { Client, Events, GatewayIntentBits, ActivityType } = require("discord.js");
const { generateReply, toModelMessages } = require("./ai");

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf8"));
const chatChannelId = process.env.CHAT_CHANNEL_ID || config.channels.chatChannelId;
const roastChannelId = process.env.ROAST_CHANNEL_ID || config.channels.roastChannelId;
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("[startup] DISCORD_TOKEN is missing.");
  process.exit(1);
}
if (!chatChannelId || chatChannelId === "SET_CHAT_CHANNEL_ID") {
  console.error("[startup] Set channels.chatChannelId in config.json or CHAT_CHANNEL_ID in .env.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  allowedMentions: { parse: [] }
});
const cooldowns = new Map();
let activeRequests = 0;
const inFlight = new Set();

function log(level, message, detail = "") {
  const fn = level === "debug" ? console.log : console[level] || console.log;
  fn(`[${new Date().toISOString()}] [shard ${client.shard?.ids?.join(",") ?? "local"}] [${level}] ${message}`, detail);
}

function getMode(message) {
  const channelId = message.channelId;
  const parentId = message.channel?.isThread?.() ? message.channel.parentId : null;
  const matches = id => channelId === id || (config.channels.replyInThreads && parentId === id);
  if (config.roast.enabled && roastChannelId && matches(roastChannelId)) return "roast";
  if (matches(chatChannelId)) return "chat";
  return null;
}

function splitMessage(text, maxChunks) {
  const normalized = String(text).replace(/@everyone/gi, "@​everyone").replace(/@here/gi, "@​here");
  const chunks = [];
  let remaining = normalized;
  while (remaining.length && chunks.length < maxChunks) {
    if (remaining.length <= 1900) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", 1900);
    if (splitAt < 1000) splitAt = remaining.lastIndexOf(" ", 1900);
    if (splitAt < 1000) splitAt = 1900;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length && chunks.length) {
    const last = chunks.length - 1;
    chunks[last] = chunks[last].slice(0, 1850) + "\n…";
  }
  return chunks;
}

function cooldownRemaining(message) {
  const now = Date.now();
  for (const [key, expiry] of cooldowns) if (expiry <= now) cooldowns.delete(key);
  const key = `${message.channelId}:${message.author.id}`;
  const expiry = cooldowns.get(key) || 0;
  if (expiry > now) return Math.ceil((expiry - now) / 1000);
  cooldowns.set(key, now + config.limits.perUserCooldownMs);
  return 0;
}

async function fetchConversation(message) {
  const limit = Math.max(2, Math.min(100, config.conversation.historyLimit));
  const fetched = await message.channel.messages.fetch({ limit });
  const unique = new Map(fetched.map(item => [item.id, item]));
  unique.set(message.id, message);

  if (config.conversation.includeReplyContext && message.reference?.messageId) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      unique.set(referenced.id, referenced);
    } catch (error) {
      log("debug", "Could not fetch referenced message", error.message);
    }
  }
  return [...unique.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function keepTyping(channel) {
  if (!config.typing.enabled) return () => {};
  let stopped = false;
  const send = () => {
    if (!stopped) channel.sendTyping().catch(error => log("debug", "Typing indicator failed", error.message));
  };
  send();
  const timer = setInterval(send, Math.max(5000, config.typing.refreshIntervalMs));
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function handleMessage(message) {
  if (!message.inGuild() || message.webhookId) return;
  const mode = getMode(message);
  if (!mode) return;
  if (message.author.id === client.user.id) return;
  if (config.channels.ignoreBots && message.author.bot) return;
  if (message.system) return;
  if (inFlight.has(message.id)) return;

  const wait = cooldownRemaining(message);
  if (wait) {
    log("debug", `Ignoring message during per-user cooldown (${wait}s)`);
    return;
  }
  if (activeRequests >= config.limits.maxConcurrentRequestsPerShard) {
    log("warn", "AI request capacity reached; skipping message");
    return;
  }

  inFlight.add(message.id);
  activeRequests++;
  let stopTyping = () => {};
  try {
    stopTyping = await keepTyping(message.channel);
    const history = await fetchConversation(message);
    const messages = toModelMessages(history, config, message);
    if (mode === "roast") {
      const prompt = `Create a playful roast inspired by this Discord message. Keep it light and do not make claims about the author's real life.\n\nLatest message: ${message.content || "[no text]"}`;
      messages.push({ role: "user", content: prompt });
    }
    const result = await generateReply(config, messages, mode);
    const chunks = splitMessage(result.text, config.limits.maxReplyChunks);
    if (!chunks.length) return;
    const replyOptions = { allowedMentions: { parse: [] } };
    if (config.conversation.replyToTriggerMessage) {
      await message.reply({ ...replyOptions, content: chunks[0], failIfNotExists: false });
    } else {
      await message.channel.send({ ...replyOptions, content: chunks[0] });
    }
    for (const chunk of chunks.slice(1)) {
      await message.channel.send({ ...replyOptions, content: chunk });
    }
    log("info", `Replied in ${mode} channel using ${result.provider}/${result.model}`);
  } catch (error) {
    log("error", "Automatic AI reply failed", error?.message || String(error));
    try {
      await message.reply({
        content: "I couldn't generate a reply just now. Please try again in a moment.",
        allowedMentions: { parse: [] },
        failIfNotExists: false
      });
    } catch (replyError) {
      log("warn", "Could not send failure notice", replyError.message);
    }
  } finally {
    stopTyping();
    activeRequests = Math.max(0, activeRequests - 1);
    inFlight.delete(message.id);
  }
}

client.once(Events.ClientReady, ready => {
  ready.user.setActivity(config.bot.activity, { type: ActivityType.Listening });
  log("info", `Ready as ${ready.user.tag}; automatic chat channel=${chatChannelId}; roast channel=${roastChannelId || "disabled"}`);
});

client.on(Events.MessageCreate, message => {
  handleMessage(message).catch(error => log("error", "Unhandled message handler error", error.message));
});
client.on(Events.Error, error => log("error", "Discord client error", error.message));
process.on("unhandledRejection", error => log("error", "Unhandled promise rejection", error?.message || String(error)));

async function shutdown(signal) {
  log("info", `Received ${signal}; shutting down gracefully`);
  client.destroy();
  process.exit(0);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

client.login(token).catch(error => {
  log("error", "Discord login failed", error.message);
  process.exitCode = 1;
});
