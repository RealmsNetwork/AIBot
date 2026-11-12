const test = require("node:test");
const assert = require("node:assert/strict");
const { isTimeQuestion, formatCurrentTime } = require("../src/time-context");

test("recognizes direct time and date questions", () => {
  for (const prompt of ["what time is it", "what's the time?", "what is the current date", "what year is it", "hey, what time is it rn"]) {
    assert.equal(isTimeQuestion(prompt), true, prompt);
  }
});

test("does not intercept ordinary conversation containing a time reference", () => {
  assert.equal(isTimeQuestion("I asked what time it was yesterday"), false);
  assert.equal(isTimeQuestion("time to restart the server"), false);
});

test("formats the supplied instant in the configured timezone", () => {
  const instant = new Date("2026-11-12T14:56:00.000Z");
  assert.equal(
    formatCurrentTime(instant, "UTC"),
    "It's Thursday, November 12, 2026 at 2:56:00 PM UTC."
  );
  assert.match(formatCurrentTime(instant, "America/New_York"), /Thursday, November 12, 2026 at 9:56:00 AM EST/);
});

test("falls back to UTC for an invalid timezone", () => {
  assert.match(formatCurrentTime(new Date("2026-11-12T14:56:00.000Z"), "Not/A_Timezone"), /2:56:00 PM UTC/);
});
