const test = require("node:test");
const assert = require("node:assert/strict");
const { toModelMessages, getProviderConfig } = require("../src/ai");

const config = {
  ai: { provider: "openai", model: "gpt-4o-mini" },
  providers: {
    openai: { apiKeyEnv: "OPENAI_API_KEY", model: "gpt-4o-mini", baseURL: "" },
    ollama: { apiKeyEnv: "OLLAMA_API_KEY", apiKeyOptional: true, model: "llama3.2", baseURL: "http://127.0.0.1:11434/v1" }
  },
  conversation: { includeTimestamps: true, maxMessageCharacters: 4000 }
};

function mockMessage({ id, timestamp, authorId, username, bot = false, content, reference = null }) {
  return {
    id,
    createdTimestamp: timestamp,
    author: { id: authorId, username, globalName: username, bot },
    member: { displayName: username },
    content,
    reference,
    attachments: new Map(),
    client: { user: { id: "bot-id" } }
  };
}

test("maps human messages to user turns and bot replies to assistant turns", () => {
  const human = mockMessage({ id: "1", timestamp: 1000, authorId: "human-id", username: "Human", content: "hi" });
  const bot = mockMessage({ id: "2", timestamp: 2000, authorId: "bot-id", username: "AIBot", bot: true, content: "hello" });
  const current = mockMessage({ id: "3", timestamp: 3000, authorId: "human-id", username: "Human", content: "how are you" });
  const result = toModelMessages([current, bot, human], { conversation: config.conversation }, current);
  assert.deepEqual(result.map(item => item.role), ["user", "assistant", "user"]);
  assert.match(result[0].content, /1970-01-01T00:00:01.000Z/);
  assert.match(result[1].content, /AIBot: hello/);
});

test("selects the configured provider and its model", () => {
  const result = getProviderConfig(config);
  assert.equal(result.name, "openai");
  assert.equal(result.model, "gpt-4o-mini");
});

test("uses provider-specific Ollama defaults instead of the OpenAI model", () => {
  const result = getProviderConfig({ ...config, ai: { provider: "ollama", model: "gpt-4o-mini" } });
  assert.equal(result.name, "ollama");
  assert.equal(result.model, "llama3.2");
  assert.equal(result.baseURL, "http://127.0.0.1:11434/v1");
});
