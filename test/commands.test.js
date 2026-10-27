const test = require("node:test");
const assert = require("node:assert/strict");
const commands = require("../src/commands");

test("slash command names are unique", () => {
  const names = commands.map(command => command.name);
  assert.equal(new Set(names).size, names.length);
});

test("core commands are registered", () => {
  const names = new Set(commands.map(command => command.name));
  for (const name of ["chat", "roast", "ping", "health", "clear-chat"]) {
    assert.ok(names.has(name), `Missing /${name}`);
  }
});

test("all command definitions have descriptions", () => {
  for (const command of commands) {
    assert.equal(typeof command.description, "string");
    assert.ok(command.description.length > 0);
  }
});
