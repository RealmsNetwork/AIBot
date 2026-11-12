"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isPublicIPv4, validateHttpsUrl, runPython, getConfiguredReputationProviders } = require("../src/python-sandbox");

test("allows ordinary public IPv4 addresses", () => {
  assert.equal(isPublicIPv4("1.1.1.1"), true);
  assert.equal(isPublicIPv4("8.8.8.8"), true);
});

test("rejects private, loopback, link-local, and reserved IPv4 ranges", () => {
  for (const address of [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "198.18.0.1", "203.0.113.5", "224.0.0.1", "255.255.255.255"
  ]) {
    assert.equal(isPublicIPv4(address), false, address);
  }
});

test("accepts only standard HTTPS URLs", () => {
  assert.equal(validateHttpsUrl("https://example.com/docs").hostname, "example.com");
  assert.throws(() => validateHttpsUrl("http://example.com"), /HTTPS/);
  assert.throws(() => validateHttpsUrl("https://127.0.0.1"), /IP-literal/);
  assert.throws(() => validateHttpsUrl("https://localhost"), /Local/);
  assert.throws(() => validateHttpsUrl("https://user:pass@example.com"), /credentials/);
  assert.throws(() => validateHttpsUrl("https://example.com:8443"), /port/);
});

test("refuses Python execution when disabled", () => {
  assert.throws(() => runPython("print('hello')", { enabled: false }), /disabled/);
});

test("rejects empty and oversized Python input before starting a worker", () => {
  assert.throws(() => runPython("  ", { enabled: true }), /empty/);
  assert.throws(() => runPython("x".repeat(501), { enabled: true, maxCodeChars: 500 }), /character limit/);
});

test("selects only supported URL reputation providers and removes duplicates", () => {
  assert.deepEqual(
    getConfiguredReputationProviders({ providers: ["google-webrisk", "urlhaus", "urlhaus"] }),
    ["google-webrisk", "urlhaus"]
  );
  assert.throws(
    () => getConfiguredReputationProviders({ providers: ["unknown-provider"] }),
    /Unknown URL reputation provider/
  );
});

test("keeps legacy Web Risk configuration working during migration", () => {
  assert.deepEqual(
    getConfiguredReputationProviders({ requireWebRisk: true }),
    ["google-webrisk"]
  );
  assert.deepEqual(getConfiguredReputationProviders({ providers: [] }), []);
});
