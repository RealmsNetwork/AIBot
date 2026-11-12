"use strict";

const UNIT_MS = {
  millisecond: 1, milliseconds: 1, ms: 1,
  second: 1000, seconds: 1000, sec: 1000, secs: 1000, s: 1000,
  minute: 60000, minutes: 60000, min: 60000, mins: 60000, m: 60000,
  hour: 3600000, hours: 3600000, hr: 3600000, hrs: 3600000, h: 3600000,
  day: 86400000, days: 86400000, d: 86400000,
  week: 604800000, weeks: 604800000, wk: 604800000, wks: 604800000,
  year: 31557600000, years: 31557600000, yr: 31557600000, yrs: 31557600000
};

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatter(timeZone, options) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", ...options });
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
  }
}

function formatDateTime(value, timeZone = "UTC") {
  const date = validDate(value);
  if (!date) return "Invalid date.";
  return formatter(timeZone, { dateStyle: "full", timeStyle: "long" }).format(date);
}

function formatCurrentTime(now = new Date(), timeZone = "UTC") {
  const date = validDate(now) || new Date();
  const seconds = Math.floor(date.getTime() / 1000);
  return [
    "Current time: " + formatDateTime(date, timeZone),
    "UTC: " + date.toISOString(),
    "Unix timestamp: " + seconds,
    "Discord full timestamp: <t:" + seconds + ":F>",
    "Discord relative timestamp: <t:" + seconds + ":R>"
  ].join("\n");
}

function isTimeQuestion(value) {
  const text = String(value || "").trim();
  return /^(?:hey[,! ]*)?(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?(?:time|date|day|year)(?:\s+is\s+it)?|what\s+(?:time|date|day|year)\s+is\s+it)(?:\s+(?:right\s+now|today|rn))?[?.!]*$/i.test(text);
}

function parseDuration(text) {
  const matches = [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|wk|years?|yrs?)/gi)];
  if (!matches.length) return null;
  const residue = String(text).replace(/(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|wk|years?|yrs?)/gi, "").replace(/[\s,+and]/gi, "");
  if (residue) return null;
  return matches.reduce((sum, match) => sum + Number(match[1]) * (UNIT_MS[match[2].toLowerCase()] || 0), 0);
}

function zonedWallTimeToUtc(wallTime, timeZone) {
  const normalized = String(wallTime).replace(/\bat\b/gi, " ").replace(/\s+/g, " ").trim();
  const parsed = Date.parse(normalized + " UTC");
  if (!Number.isFinite(parsed)) return null;
  const desired = new Date(parsed);
  const targetAsUtc = Date.UTC(
    desired.getUTCFullYear(), desired.getUTCMonth(), desired.getUTCDate(),
    desired.getUTCHours(), desired.getUTCMinutes(), desired.getUTCSeconds()
  );
  let candidate = targetAsUtc;
  try {
    const partFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    for (let i = 0; i < 4; i++) {
      const parts = Object.fromEntries(partFormatter.formatToParts(new Date(candidate))
        .filter(part => part.type !== "literal")
        .map(part => [part.type, Number(part.value)]));
      const representedAsUtc = Date.UTC(
        parts.year, parts.month - 1, parts.day,
        parts.hour, parts.minute, parts.second
      );
      const correction = targetAsUtc - representedAsUtc;
      candidate += correction;
      if (correction === 0) break;
    }
    return validDate(candidate);
  } catch {
    return null;
  }
}

function parseDateInput(value, timeZone = "UTC") {
  let input = String(value || "").trim().replace(/^(?:on|at)\s+/i, "").replace(/[?.!]+$/, "").trim();
  if (!input) return null;
  const zoneMatch = input.match(/\s+([A-Za-z_]+\/[A-Za-z_]+)$/);
  if (zoneMatch) {
    timeZone = zoneMatch[1];
    input = input.slice(0, zoneMatch.index).trim();
  }
  const epoch = input.match(/^(?:unix\s+)?(?:timestamp\s+)?(-?\d{10}|\d{13})$/i);
  if (epoch) {
    const number = Number(epoch[1]);
    return validDate(Math.abs(number) >= 100000000000 ? number : number * 1000);
  }
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(input)) return validDate(input);
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(input)) {
    const iso = input.includes("T") ? input.replace("T", " ") : input + " 00:00:00";
    return zonedWallTimeToUtc(iso, timeZone);
  }
  return zonedWallTimeToUtc(input, timeZone);
}

function formatTimestampResult(date, timeZone) {
  const seconds = Math.floor(date.getTime() / 1000);
  return [
    "**" + formatDateTime(date, timeZone) + "**",
    "Unix seconds: " + seconds,
    "Unix milliseconds: " + date.getTime(),
    "Discord full: <t:" + seconds + ":F>",
    "Discord relative: <t:" + seconds + ":R>"
  ].join("\n");
}

function parseTimeRequest(value, options = {}) {
  const input = String(value || "").trim();
  const lower = input.toLowerCase();
  const now = validDate(options.now) || new Date();
  const timeZone = options.timeZone || "UTC";
  if (!input) return null;

  if (isTimeQuestion(input) || /^(?:current\s+time|current\s+date|now|today|what(?:'s| is)\s+today)[?.!]*$/i.test(input)) {
    return formatCurrentTime(now, timeZone);
  }

  const zoneQuestion = input.match(/^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:current\s+)?time\s+in\s+([A-Za-z_]+\/[A-Za-z_]+)[?.!]*$/i)
    || input.match(/^what\s+time\s+is\s+it\s+in\s+([A-Za-z_]+\/[A-Za-z_]+)[?.!]*$/i);
  if (zoneQuestion) return formatCurrentTime(now, zoneQuestion[1]);

  const discord = input.match(/<t:(-?\d{9,13})(?::[tTdDfFR])?>/);
  const epoch = discord || input.match(/(?:unix|epoch|timestamp|convert)\D{0,24}(-?\d{9,13})/i);
  if (epoch && (discord || /unix|epoch|timestamp|convert|to date|to time/i.test(lower))) {
    const raw = Number(epoch[1]);
    const date = validDate(Math.abs(raw) >= 100000000000 ? raw : raw * 1000);
    if (!date) return "That timestamp is outside the supported date range.";
    return formatTimestampResult(date, timeZone);
  }

  const dateCommand = input.match(/^(?:make\s+)?(?:a\s+)?(?:unix\s+)?(?:timestamp|epoch|discord\s+timestamp|unix\s+timestamp)\s+(?:for|of|from)\s+(.+)$/i)
    || input.match(/^(?:convert|turn)\s+(.+?)\s+(?:to|into)\s+(?:a\s+)?(?:unix\s+)?(?:timestamp|epoch|discord\s+timestamp)$/i)
    || input.match(/^(.+?)\s+(?:as|to)\s+(?:a\s+)?(?:unix\s+)?(?:timestamp|epoch|discord\s+timestamp)$/i);
  if (dateCommand) {
    const requestedZone = dateCommand[1].match(/\s+([A-Za-z_]+\/[A-Za-z_]+)$/);
    const displayZone = requestedZone ? requestedZone[1] : timeZone;
    const date = parseDateInput(dateCommand[1], displayZone);
    if (!date) return "I couldn't parse that date/time. Include a clear date, time, and timezone, or use an ISO timestamp.";
    return formatTimestampResult(date, displayZone);
  }

  const relative = input.match(/^(?:(?:what\s+(?:date|time)\s+(?:will\s+it\s+be\s+)?|when\s+is\s+)?(?:in\s+)?)(.+?)\s+(ago|from now|from today)$/i)
    || input.match(/^what\s+(?:date|time)\s+will\s+it\s+be\s+in\s+(.+)$/i)
    || input.match(/^what\s+(?:date|time)\s+is\s+it\s+in\s+(.+)$/i)
    || input.match(/^(?:what\s+(?:date|time)\s+(?:is\s+)?(?:in|after)\s+)(.+)$/i)
    || input.match(/^in\s+(.+)$/i);
  if (relative) {
    const amount = parseDuration(relative[1]);
    if (amount !== null) {
      const direction = /\bago$/i.test(input) ? -1 : 1;
      return formatTimestampResult(new Date(now.getTime() + amount * direction), timeZone);
    }
  }

  const arithmetic = input.match(/^(add|plus|subtract|minus)\s+(.+?)\s+(?:to|from)\s+(.+)$/i);
  if (arithmetic) {
    const amount = parseDuration(arithmetic[2]);
    const base = parseDateInput(arithmetic[3], timeZone);
    if (amount !== null && base) {
      const sign = /^(subtract|minus)$/i.test(arithmetic[1]) ? -1 : 1;
      return formatTimestampResult(new Date(base.getTime() + amount * sign), timeZone);
    }
  }

  const difference = input.match(/^(?:difference|time between)\s+(.+?)\s+and\s+(.+)$/i);
  if (difference) {
    const first = parseDateInput(difference[1], timeZone);
    const second = parseDateInput(difference[2], timeZone);
    if (first && second) {
      const delta = Math.abs(second - first);
      const days = Math.floor(delta / 86400000);
      const hours = Math.floor((delta % 86400000) / 3600000);
      const minutes = Math.floor((delta % 3600000) / 60000);
      const seconds = Math.floor((delta % 60000) / 1000);
      return "Time between those dates: **" + days + " days, " + hours + " hours, " + minutes + " minutes, " + seconds + " seconds** (" + delta + " milliseconds).";
    }
  }

  if (/(?:unix|epoch|timestamp|discord\s+time)/i.test(input)) {
    const cleaned = input.replace(/(?:unix|epoch|timestamp|discord\s+time|convert|to|into|please)/gi, " ").trim();
    const date = parseDateInput(cleaned, timeZone);
    if (date) return formatTimestampResult(date, timeZone);
  }
  return null;
}

function stripUnrequestedDiscordTimestamps(response, userMessage) {
  const request = String(userMessage || "");
  const explicitlyRequested = /(?:<t:-?\d{9,13}(?::[tTdDfFR])?>|\b(?:unix|epoch|timestamp|date|time|clock)\b)/i.test(request);
  if (explicitlyRequested) return String(response || "");
  return String(response || "").replace(/<t:-?\d{9,13}(?::[tTdDfFR])?>/gi, "");
}

module.exports = {
  isTimeQuestion,
  formatCurrentTime,
  formatDateTime,
  parseDateInput,
  parseTimeRequest,
  stripUnrequestedDiscordTimestamps
};
