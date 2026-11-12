const test = require("node:test");
const assert = require("node:assert/strict");
const { isTimeQuestion, formatCurrentTime, parseDateInput, parseTimeRequest, stripUnrequestedDiscordTimestamps } = require("../src/time-context");

const NOW = new Date("2026-11-12T14:56:00.000Z");

test("recognizes direct time and date questions", () => {
  for (const prompt of ["what time is it", "what's the time?", "what is the current date", "what year is it", "hey, what time is it rn"]) {
    assert.equal(isTimeQuestion(prompt), true, prompt);
    assert.match(parseTimeRequest(prompt, { now: NOW, timeZone: "UTC" }), /November 12, 2026/);
  }
});

test("does not intercept ordinary conversation containing a time reference", () => {
  assert.equal(isTimeQuestion("I asked what time it was yesterday"), false);
  assert.equal(isTimeQuestion("time to restart the server"), false);
  assert.equal(parseTimeRequest("time to restart the server", { now: NOW }), null);
});

test("formats the supplied instant and current Unix/Discord timestamps", () => {
  const answer = formatCurrentTime(NOW, "UTC");
  assert.match(answer, /Thursday, November 12, 2026 at 2:56:00 PM UTC/);
  assert.match(answer, /Unix timestamp: 1794495360/);
  assert.match(answer, /<t:1794495360:F>/);
  assert.match(formatCurrentTime(NOW, "America/New_York"), /Thursday, November 12, 2026 at 9:56:00 AM EST/);
});

test("converts Unix and Discord timestamps without changing the instant", () => {
  const answer = parseTimeRequest("convert 1762950068 to date", { now: NOW, timeZone: "UTC" });
  assert.match(answer, /Wednesday, November 12, 2025 at 12:21:08 PM UTC/);
  assert.match(parseTimeRequest("<t:1762950068:f>", { now: NOW, timeZone: "UTC" }), /Unix seconds: 1762950068/);
});

test("creates Unix and Discord timestamps from explicit dates", () => {
  const answer = parseTimeRequest("unix timestamp for November 12, 2026 at 7:21 AM", { now: NOW, timeZone: "UTC" });
  assert.match(answer, /Unix seconds: 1794468060/);
  assert.match(answer, /<t:1794468060:F>/);
});

test("supports IANA timezone wall-clock interpretation", () => {
  const date = parseDateInput("November 12, 2026 7:21 AM", "America/New_York");
  assert.equal(date.toISOString(), "2026-11-12T12:21:00.000Z");
});

test("calculates relative durations from a fixed current instant", () => {
  const answer = parseTimeRequest("what date will it be in 2 days 3 hours", { now: NOW, timeZone: "UTC" });
  assert.match(answer, /Saturday, November 14, 2026 at 5:56:00 PM UTC/);
  assert.match(answer, /Unix seconds:/);
});

test("adds and subtracts durations from explicit dates", () => {
  const added = parseTimeRequest("add 2 days 3 hours to 2026-11-12T14:56:00Z", { now: NOW, timeZone: "UTC" });
  assert.match(added, /Saturday, November 14, 2026 at 5:56:00 PM UTC/);
  const subtracted = parseTimeRequest("subtract 1 week from 2026-11-12T14:56:00Z", { now: NOW, timeZone: "UTC" });
  assert.match(subtracted, /Thursday, November 5, 2026 at 2:56:00 PM UTC/);
});

test("calculates the difference between two dates", () => {
  const answer = parseTimeRequest("difference between 2026-11-12T14:56:00Z and 2026-11-13T16:01:02Z", { now: NOW, timeZone: "UTC" });
  assert.match(answer, /1 days, 1 hours, 5 minutes, 2 seconds/);
});

test("falls back to UTC for an invalid timezone", () => {
  assert.match(formatCurrentTime(NOW, "Not/A_Timezone"), /2:56:00 PM UTC/);
});

test("supports timezone-specific current clock requests", () => {
  const answer = parseTimeRequest("what time is it in America/New_York", { now: NOW, timeZone: "UTC" });
  assert.match(answer, /9:56:00 AM EST/);
});

test("accepts an IANA timezone on the supplied date and displays that zone", () => {
  const answer = parseTimeRequest("unix timestamp for November 12, 2026 at 7:21 AM America/New_York", { now: NOW, timeZone: "UTC" });
  assert.match(answer, /7:21:00 AM EST/);
  assert.match(answer, /Unix seconds: 1794486060/);
});

test("strips unrequested AI-generated Discord timestamps", () => {
  assert.equal(stripUnrequestedDiscordTimestamps("locked in at <t:1762950068:f> fr", "good work"), "locked in at  fr");
  assert.equal(stripUnrequestedDiscordTimestamps("convert this <t:1762950068:f>", "convert <t:1762950068:f>"), "convert this <t:1762950068:f>");
});

test("converts relative calendar dates with local clock times", () => {
  const tomorrow = parseTimeRequest("unix timestamp for tomorrow at 7:21 AM", { now: NOW, timeZone: "UTC" });
  assert.match(tomorrow, /Friday, November 13, 2026 at 7:21:00 AM UTC/);
  const weekday = parseTimeRequest("unix timestamp for next Monday at 5:00 PM", { now: NOW, timeZone: "UTC" });
  assert.match(weekday, /Monday, November 16, 2026 at 5:00:00 PM UTC/);
});

test("rewrites hallucinated current date/time claims using the live clock", () => {
  const output = stripUnrequestedDiscordTimestamps(
    "it's November 12, 2025 at 10:32 AM, and the clock is cooperating",
    "bro really pulled the vending machine lever",
    NOW,
    "UTC"
  );
  assert.equal(output, "it's Thursday, November 12, 2026 at 2:56:00 PM UTC, and the clock is cooperating");
});

test("does not rewrite historical date/time claims when the user explicitly asks about time", () => {
  const response = "It was November 12, 2025 at 10:32 AM.";
  assert.equal(stripUnrequestedDiscordTimestamps(response, "what time was it on November 12, 2025?"), response);
});

test("removes fabricated Discord tags and corrects current date claims together", () => {
  const output = stripUnrequestedDiscordTimestamps(
    "it's November 12, 2025 at 10:32 AM <t:1762950068:f>",
    "make a roast",
    NOW,
    "UTC"
  );
  assert.equal(output, "it's Thursday, November 12, 2026 at 2:56:00 PM UTC ");
});
