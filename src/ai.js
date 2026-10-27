const OpenAI = require("openai");

const sessions = new Map();

function createAIClient(config) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY is not configured.");

  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_BASE_URL || config.ai.baseURL,
    timeout: config.ai.requestTimeoutMs,
    maxRetries: 1
  });
}

function sessionKey(interaction) {
  return interaction.guildId
    ? `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}`
    : `dm:${interaction.user.id}`;
}

function getHistory(key, ttlMs) {
  const now = Date.now();
  const current = sessions.get(key);
  if (!current || now - current.updatedAt > ttlMs) {
    sessions.set(key, { updatedAt: now, messages: [] });
  }
  const session = sessions.get(key);
  session.updatedAt = now;
  return session.messages;
}

async function chat(client, config, interaction, input) {
  const maxInput = config.ai.maxInputCharacters;
  const message = String(input || "").trim().slice(0, maxInput);
  if (!message) throw new Error("Please enter a message.");
  const key = sessionKey(interaction);
  const history = getHistory(key, config.chat.sessionTtlMs);
  const prior = history.slice(-(config.chat.historyMessages * 2));
  const response = await client.chat.completions.create({
    model: process.env.AI_MODEL || config.ai.model,
    messages: [
      { role: "system", content: config.ai.systemPrompt },
      ...prior,
      { role: "user", content: message }
    ],
    max_tokens: config.ai.maxOutputTokens
  });
  const answer = response.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("The AI provider returned an empty response.");
  history.push({ role: "user", content: message }, { role: "assistant", content: answer });
  const maxHistory = Math.max(2, config.chat.historyMessages * 2);
  if (history.length > maxHistory) history.splice(0, history.length - maxHistory);
  return answer;
}

async function roast(client, config, targetName, intensity) {
  const level = Math.max(1, Math.min(config.roast.maxIntensity, intensity || config.roast.defaultIntensity));
  const response = await client.chat.completions.create({
    model: process.env.AI_MODEL || config.ai.model,
    messages: [
      { role: "system", content: config.roast.systemPrompt },
      { role: "user", content: `Write one funny Discord roast for ${targetName}. Intensity ${level}/3. Keep it short, original, and non-hateful. Do not make claims about their real life.` }
    ],
    max_tokens: Math.min(220, config.ai.maxOutputTokens)
  });
  const answer = response.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("The AI provider returned an empty response.");
  return answer;
}

function clearHistory(interaction) {
  return sessions.delete(sessionKey(interaction));
}

function sessionCount() {
  return sessions.size;
}

module.exports = { createAIClient, chat, roast, clearHistory, sessionCount };
