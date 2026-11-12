"use strict";

const { parentPort, workerData } = require("node:worker_threads");

let output = "";
let requestId = 0;
const pendingRequests = new Map();
const maxOutputChars = workerData.maxOutputChars || 6000;

function appendOutput(value) {
  const text = String(value ?? "");
  if (output.length < maxOutputChars) {
    output += text.slice(0, maxOutputChars - output.length);
  }
}

parentPort.on("message", message => {
  if (message?.type !== "network_result") return;
  const pending = pendingRequests.get(message.requestId);
  if (!pending) return;
  pendingRequests.delete(message.requestId);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message.result);
});

function safeHttpGet(url) {
  if (!workerData.networkEnabled) return Promise.reject(new Error("Network access is disabled."));
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    parentPort.postMessage({ type: "network_request", requestId: id, url: String(url) });
  });
}

async function main() {
  try {
    const { loadPyodide } = await import("pyodide");
    const exposedGlobals = { safeHttpGet };
    const pyodide = await loadPyodide({
      jsglobals: exposedGlobals,
      stdout: appendOutput,
      stderr: value => appendOutput(value)
    });

    pyodide.registerJsModule("realmsnet", {
      http_get: async url => await safeHttpGet(String(url))
    });

    const result = await pyodide.runPythonAsync(workerData.code);
    let finalValue = "";
    if (result !== undefined && result !== null) {
      try {
        finalValue = String(result);
        result.destroy?.();
      } catch {
        finalValue = "";
      }
    }
    const combined = [output.trim(), finalValue.trim()].filter(Boolean).join("\n");
    parentPort.postMessage({
      type: "result",
      result: (combined || "Python finished without output.").slice(0, maxOutputChars)
    });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      error: (output + "\n" + (error?.message || String(error))).slice(0, maxOutputChars)
    });
  }
}

main();
