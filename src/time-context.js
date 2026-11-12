"use strict";

function isTimeQuestion(value) {
  const text = String(value || "").trim();
  return /^(?:hey[,! ]*)?(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?(?:time|date|day|year)(?:\s+is\s+it)?|what\s+(?:time|date|day|year)\s+is\s+it)(?:\s+(?:right\s+now|today|rn))?[?.!]*$/i.test(text);
}

function formatCurrentTime(now = new Date(), timeZone = "UTC") {
  let zone = String(timeZone || "UTC");
  let formatted;
  try {
    formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      dateStyle: "full",
      timeStyle: "long"
    }).format(now);
  } catch {
    zone = "UTC";
    formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      dateStyle: "full",
      timeStyle: "long"
    }).format(now);
  }
  return "It's " + formatted + ".";
}

module.exports = { isTimeQuestion, formatCurrentTime };
