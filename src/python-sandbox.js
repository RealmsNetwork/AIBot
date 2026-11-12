"use strict";

const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { lookup } = require("node:dns/promises");
const { isIP } = require("node:net");
const { Agent, fetch } = require("undici");

let activeRuns = 0;
const reputationCache = new Map();

function ipv4ToNumber(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function isPublicIPv4(address) {
  const value = ipv4ToNumber(address);
  if (value === null) return false;
  const blocked = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
  ];
  return !blocked.some(([network, prefix]) => {
    const base = ipv4ToNumber(network);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function validateHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed.");
  if (parsed.username || parsed.password) throw new Error("URLs containing credentials are blocked.");
  if (parsed.port && parsed.port !== "443") throw new Error("Only the standard HTTPS port is allowed.");
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  parsed.hostname = hostname;
  if (!hostname || isIP(hostname) || hostname === "localhost" ||
      hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
      hostname.endsWith(".internal") || hostname.endsWith(".onion")) {
    throw new Error("Local, private, and IP-literal destinations are blocked.");
  }
  parsed.hash = "";
  return parsed;
}

async function checkUrlReputation(parsed, settings) {
  if (!settings.requireWebRisk) return;
  const apiKey = process.env.GOOGLE_WEBRISK_API_KEY;
  if (!apiKey) throw new Error("Network access is locked: configure GOOGLE_WEBRISK_API_KEY to enable URL reputation checks.");

  // Keep the path for threat matching, but never disclose query strings or fragments
  // (which may contain tokens or signed URLs) to the reputation provider.
  const lookupUrl = parsed.origin + parsed.pathname;
  const cached = reputationCache.get(lookupUrl);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.allowed) throw new Error("The destination URL failed its reputation check.");
    return;
  }

  const endpoint = new URL("https://webrisk.googleapis.com/v1/uris:search");
  endpoint.searchParams.set("uri", lookupUrl);
  endpoint.searchParams.append("threatTypes", "MALWARE");
  endpoint.searchParams.append("threatTypes", "SOCIAL_ENGINEERING");
  endpoint.searchParams.append("threatTypes", "UNWANTED_SOFTWARE");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { "accept": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(Math.min(8000, settings.timeoutMs || 8000))
  });
  if (response.status === 429) throw new Error("Google Web Risk quota reached; network access is temporarily blocked.");
  if (!response.ok) throw new Error("Google Web Risk lookup failed (HTTP " + response.status + ").");

  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Google Web Risk returned an invalid response; destination blocked.");
  }
  const threatTypes = body.threat?.threatTypes;
  if (body.threat && (!Array.isArray(threatTypes) || threatTypes.length === 0)) {
    throw new Error("Google Web Risk returned an incomplete threat verdict; destination blocked.");
  }
  const allowed = !Array.isArray(threatTypes) || threatTypes.length === 0;
  const providerExpiry = body.threat?.expireTime ? Date.parse(body.threat.expireTime) : NaN;
  const cacheTtl = Number.isFinite(providerExpiry)
    ? Math.max(60_000, Math.min(24 * 60 * 60_000, providerExpiry - Date.now()))
    : (allowed ? 5 * 60_000 : 60 * 60_000);
  reputationCache.set(lookupUrl, { allowed, expiresAt: Date.now() + cacheTtl });
  while (reputationCache.size > 1024) reputationCache.delete(reputationCache.keys().next().value);
  if (!allowed) throw new Error("Google Web Risk flagged this URL: " + threatTypes.join(", ") + ".");
}

async function resolvePublicIPv4(hostname) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  const publicRecord = records.find(record => record.family === 4 && isPublicIPv4(record.address));
  if (!publicRecord) throw new Error("The destination did not resolve to a public IPv4 address.");
  return publicRecord.address;
}

async function fetchApprovedUrl(value, settings, requestCount) {
  const parsed = validateHttpsUrl(value);
  if (requestCount.count >= Math.max(1, Math.min(5, settings.maxRequestsPerRun || 3))) {
    throw new Error("This Python run has reached its network request limit.");
  }
  requestCount.count++;
  await checkUrlReputation(parsed, settings);

  const pinnedAddress = await resolvePublicIPv4(parsed.hostname);
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options && options.all) callback(null, [{ address: pinnedAddress, family: 4 }]);
        else callback(null, pinnedAddress, 4);
      }
    }
  });

  try {
    const response = await fetch(parsed.href, {
      method: "GET",
      redirect: "error",
      dispatcher,
      headers: { "accept": "text/plain, application/json, text/html;q=0.8", "user-agent": "RealmsNetwork-AIBot-Python/1.0" },
      signal: AbortSignal.timeout(Math.min(10000, settings.timeoutMs || 8000))
    });
    const chunks = [];
    let size = 0;
    const maximum = Math.max(1024, Math.min(24_000, settings.maxResponseBytes || 12_000));
    if (response.body) {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maximum) throw new Error("The response exceeded the Python network response limit.");
        chunks.push(chunk);
      }
    }
    return JSON.stringify({
      url: parsed.origin + parsed.pathname,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text: Buffer.concat(chunks).toString("utf8")
    });
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

function runPython(code, config = {}) {
  if (!config.enabled) throw new Error("Python execution is disabled.");
  if (typeof code !== "string" || !code.trim()) throw new Error("Python code cannot be empty.");
  const maxCodeChars = Math.max(500, Math.min(20_000, config.maxCodeChars || 12_000));
  if (code.length > maxCodeChars) throw new Error("Python code exceeds the " + maxCodeChars + " character limit.");
  if (activeRuns >= Math.max(1, Math.min(2, config.maxConcurrentRuns || 1))) {
    throw new Error("The Python sandbox is busy. Try again shortly.");
  }

  activeRuns++;
  const timeoutMs = Math.max(1000, Math.min(15_000, config.maxExecutionMs || 8000));
  const networkSettings = {
    enabled: Boolean(config.network?.enabled),
    requireVirusTotal: config.network?.requireVirusTotal !== false,
    maxRequestsPerRun: config.network?.maxRequestsPerRun || 3,
    maxResponseBytes: config.network?.maxResponseBytes || 12_000,
    timeoutMs: config.network?.timeoutMs || 8000
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let requestCount = { count: 0 };
    const worker = new Worker(path.join(__dirname, "python-worker.js"), {
      workerData: {
        code,
        maxOutputChars: Math.max(500, Math.min(10_000, config.maxOutputChars || 6000)),
        networkEnabled: networkSettings.enabled
      },
      resourceLimits: {
        maxOldGenerationSizeMb: 96,
        maxYoungGenerationSizeMb: 24,
        stackSizeMb: 4
      }
    });

    const finish = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await worker.terminate().catch(() => {});
      activeRuns = Math.max(0, activeRuns - 1);
      if (error) reject(error);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(new Error("Python execution exceeded the " + timeoutMs + " ms time limit and was terminated."));
    }, timeoutMs);
    timer.unref?.();

    worker.on("message", async message => {
      if (message?.type === "result") {
        await finish(null, message.result);
      } else if (message?.type === "error") {
        await finish(new Error(message.error || "Python execution failed."));
      } else if (message?.type === "network_request") {
        try {
          if (!networkSettings.enabled) throw new Error("Network access is disabled for this Python run.");
          const result = await fetchApprovedUrl(message.url, networkSettings, requestCount);
          worker.postMessage({ type: "network_result", requestId: message.requestId, result });
        } catch (error) {
          worker.postMessage({ type: "network_result", requestId: message.requestId, error: error.message });
        }
      }
    });
    worker.on("error", error => finish(new Error("Python sandbox worker failed: " + error.message)));
    worker.on("exit", code => {
      if (!settled) finish(new Error("Python sandbox exited unexpectedly (code " + code + ")."));
    });
  });
}

module.exports = { runPython, isPublicIPv4, validateHttpsUrl };
