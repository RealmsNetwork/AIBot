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

function opaqueThenable(promise) {
  // Expose only a thenable, not a normal Promise object with a constructor chain.
  const then = (onFulfilled, onRejected) => {
    Promise.prototype.then.call(promise, onFulfilled, onRejected);
  };
  Object.setPrototypeOf(then, null);
  Object.setPrototypeOf(promise, null);
  Object.defineProperty(promise, "then", {
    value: then,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return promise;
}

const safeHttpGet = url => {
  if (!workerData.networkEnabled) {
    return opaqueThenable(Promise.reject(new Error("Network access is disabled.")));
  }
  const id = ++requestId;
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    parentPort.postMessage({ type: "network_request", requestId: id, url: String(url) });
  });
  return opaqueThenable(promise);
};
Object.setPrototypeOf(safeHttpGet, null);

async function main() {
  try {
    const { loadPyodide } = await import("pyodide");
    // Pyodide's Python-to-JS bridge sees a null-prototype object containing
    // only the mediated HTTPS helper, never Node's real globalThis/process/fetch.
    const exposedGlobals = Object.create(null);
    exposedGlobals.safeHttpGet = safeHttpGet;
    const pyodide = await loadPyodide({
      jsglobals: exposedGlobals,
      stdout: appendOutput,
      stderr: value => appendOutput(value)
    });

    const realmsnetModule = Object.create(null);
    realmsnetModule.http_get = safeHttpGet;
    pyodide.registerJsModule("realmsnet", realmsnetModule);

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
