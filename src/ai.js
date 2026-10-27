const { generateText } = require("ai");

const providerModules = {
  openai: async () => import("@ai-sdk/openai"),
  google: async () => import("@ai-sdk/google"),
  xai: async () => import("@ai-sdk/xai"),
  anthropic: async () => import("@ai-sdk/anthropic")
};

function getProviderConfig(config) {
  const name = String(process.env.AI_PROVIDER || config.ai.provider || "openai").toLowerCase();
  const selected = config.providers[name];
  if (!selected && !["openai", "google", "xai", "anthropic"].includes(name)) {
    throw new Error(`Unknown AI provider "${name}". Configure it under config.providers.`);
  }
  const defaults = {
    openai: { apiKeyEnv: "OPENAI_API_KEY", model: "gpt-4o-mini", baseURL: "" },
    google: { apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY", model: "gemini-2.5-flash", baseURL: "" },
    xai: { apiKeyEnv: "XAI_API_KEY", model: "grok-3-mini", baseURL: "" },
    anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", model: "claude-3-5-haiku-latest", baseURL: "" }
  };
  const provider = { ...(defaults[name] || {}), ...(selected || {}) };
  provider.name = name;
  provider.model = process.env.AI_MODEL || config.ai.model || provider.model;
  if (process.env.AI_PROVIDER && !process.env.AI_MODEL && selected?.model) provider.model = selected.model;
  provider.baseURL = process.env.AI_BASE_URL || provider.baseURL || config.ai.baseURL || "";
  return provider;
}

async function resolveModel(config) {
  const provider = getProviderConfig(config);
  const apiKey = process.env[provider.apiKeyEnv] || (provider.apiKeyOptional ? "ollama" : "");
  if (!apiKey) {
    throw new Error(`Missing ${provider.apiKeyEnv}. Set it in .env for provider "${provider.name}".`);
  }

  if (provider.name === "google") {
    const mod = await providerModules.google();
    const factory = mod.createGoogleGenerativeAI || mod.google;
    const instance = mod.createGoogleGenerativeAI
      ? factory({ apiKey, ...(provider.baseURL ? { baseURL: provider.baseURL } : {}) })
      : factory;
    return { model: instance(provider.model), provider };
  }
  if (provider.name === "anthropic") {
    const mod = await providerModules.anthropic();
    const instance = mod.createAnthropic({ apiKey, ...(provider.baseURL ? { baseURL: provider.baseURL } : {}) });
    return { model: instance(provider.model), provider };
  }
  if (provider.name === "xai") {
    const mod = await providerModules.xai();
    const instance = mod.createXai({ apiKey, ...(provider.baseURL ? { baseURL: provider.baseURL } : {}) });
    return { model: instance(provider.model), provider };
  }

  const mod = await providerModules.openai();
  const instance = mod.createOpenAI({
    apiKey,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {})
  });
  return { model: instance.chat(provider.model), provider };
}

async function generateReply(config, messages, mode = "chat") {
  const { model, provider } = await resolveModel(config);
  const system = mode === "roast"
    ? config.roast.systemPrompt
    : config.ai.systemPrompt;
  const result = await generateText({
    model,
    system,
    messages,
    maxOutputTokens: config.ai.maxOutputTokens,
    abortSignal: AbortSignal.timeout(config.ai.requestTimeoutMs)
  });
  if (!result.text || !result.text.trim()) throw new Error("The AI provider returned an empty response.");
  return { text: result.text.trim(), provider: provider.name, model: provider.model };
}

function toModelMessages(discordMessages, config, currentMessage) {
  const chronological = [...discordMessages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const result = [];
  for (const message of chronological) {
    if (!message.content?.trim() && !message.attachments?.size) continue;
    const isAssistant = Boolean(message.author?.bot && message.author.id === currentMessage.client.user.id);
    if (message.author?.bot && !isAssistant) continue;
    const timestamp = new Date(message.createdTimestamp).toISOString();
    const author = message.member?.displayName || message.author?.globalName || message.author?.username || "Unknown";
    const replyTo = message.reference?.messageId ? ` [replying to message ${message.reference.messageId}]` : "";
    const attachmentText = message.attachments?.size
      ? ` [attachments: ${[...message.attachments.values()].map(item => item.name || item.contentType || "file").join(", ")}]`
      : "";
    const datePrefix = config.conversation.includeTimestamps ? `[${timestamp}] ` : "";
    const content = `${datePrefix}${author}${replyTo}: ${message.content || ""}${attachmentText}`.slice(0, config.conversation.maxMessageCharacters);
    result.push({ role: isAssistant ? "assistant" : "user", content });
  }
  return result;
}

module.exports = { generateReply, toModelMessages, getProviderConfig };
