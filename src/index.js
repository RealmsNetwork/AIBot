require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType
} = require("discord.js");
const { createAIClient, chat, roast, clearHistory, sessionCount } = require("./ai");

const configPath = path.join(process.cwd(), "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const requiredEnv = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const cooldowns = new Map();
let aiClient;

function log(level, message, details = "") {
  const allowed = ["error", "warn", "info", "debug"];
  const configured = allowed.includes(config.bot.logLevel) ? config.bot.logLevel : "info";
  if (allowed.indexOf(level) <= allowed.indexOf(configured)) {
    console[level === "debug" ? "log" : level](`[${new Date().toISOString()}] [${level}] ${message}`, details);
  }
}

function onCooldown(interaction, command, duration) {
  const now = Date.now();
  if (cooldowns.size > 2000) {
    for (const [key, expiry] of cooldowns) {
      if (expiry <= now) cooldowns.delete(key);
    }
  }
  const key = `${interaction.user.id}:${command}`;
  const until = cooldowns.get(key) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  cooldowns.set(key, now + duration);
  return 0;
}

async function replyError(interaction, error) {
  log("error", `Command failed: /${interaction.commandName}`, error?.message || String(error));
  const content = config.security.hideApiErrors
    ? "Something went wrong while processing that request. Please try again in a moment."
    : `Request failed: ${String(error.message || error).slice(0, 300)}`;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
    } else {
      await interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
    }
  } catch (replyFailure) {
    log("warn", "Could not send command error response", replyFailure.message);
  }
}

function safeOutput(text) {
  return String(text).replace(/@everyone/gi, "@​everyone").replace(/@here/gi, "@​here").slice(0, 1900);
}

client.once(Events.ClientReady, readyClient => {
  readyClient.user.setActivity(config.bot.activity, { type: ActivityType.Listening });
  log("info", `Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.commandName;
  try {
    if (command === "ping") {
      if (!config.features.ping) return interaction.reply({ content: "This command is disabled.", ephemeral: true });
      return interaction.reply({ content: `Pong! Gateway: ${Math.round(client.ws.ping)}ms`, ephemeral: true });
    }

    if (command === "health") {
      if (!config.features.health) return interaction.reply({ content: "This command is disabled.", ephemeral: true });
      const configured = Boolean(process.env.AI_API_KEY);
      return interaction.reply({
        content: `Bot: online\nAI key: ${configured ? "configured" : "missing"}\nAI sessions: ${sessionCount()}`,
        ephemeral: true
      });
    }

    if (command === "clear-chat") {
      clearHistory(interaction);
      return interaction.reply({ content: "Your AI conversation context has been cleared.", ephemeral: true });
    }

    if (command === "chat") {
      if (!config.features.chat) return interaction.reply({ content: "AI chat is disabled.", ephemeral: true });
      const wait = onCooldown(interaction, command, config.chat.cooldownMs);
      if (wait) return interaction.reply({ content: `Slow down a little! Try again in ${wait}s.`, ephemeral: true });
      const message = interaction.options.getString("message", true);
      if (message.length > config.ai.maxInputCharacters) {
        return interaction.reply({ content: `Your message must be ${config.ai.maxInputCharacters} characters or fewer.`, ephemeral: true });
      }
      await interaction.deferReply();
      const answer = await chat(aiClient, config, interaction, message);
      return interaction.editReply({ content: safeOutput(answer), allowedMentions: { parse: [] } });
    }

    if (command === "roast") {
      if (!config.features.roast) return interaction.reply({ content: "AI roasts are disabled.", ephemeral: true });
      const wait = onCooldown(interaction, command, config.roast.cooldownMs);
      if (wait) return interaction.reply({ content: `The roast oven is cooling down. Try again in ${wait}s.`, ephemeral: true });
      const target = interaction.options.getUser("target") || interaction.user;
      const intensity = interaction.options.getInteger("intensity") || config.roast.defaultIntensity;
      await interaction.deferReply();
      const answer = await roast(aiClient, config, target.username, intensity);
      return interaction.editReply({
        content: `🔥 **Roast for ${target.username}**\n${safeOutput(answer)}`,
        allowedMentions: { parse: [] }
      });
    }
  } catch (error) {
    await replyError(interaction, error);
  }
});

client.on(Events.Error, error => log("error", "Discord client error", error.message));
process.on("unhandledRejection", error => log("error", "Unhandled promise rejection", error?.message || String(error)));

async function shutdown(signal) {
  log("info", `Received ${signal}; shutting down`);
  client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

try {
  aiClient = createAIClient(config);
} catch (error) {
  log("warn", "AI provider is not ready; chat and roast will fail until configured", error.message);
  aiClient = null;
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  log("error", "Discord login failed", error.message);
  process.exitCode = 1;
});
