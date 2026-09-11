/**
 * Tests for electron/lib/desktopNotifications.js
 *
 * Covers:
 * - normalizeNotificationsEnabled coercion (default-on preference)
 * - notify() suppression when disabled or unsupported by the OS
 * - notify() wiring: click handler attached, show() called
 * - main.js wiring: tray toggle, preference persistence, update/error/exit call sites
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  NOTIFICATIONS_ENABLED_DEFAULT,
  normalizeNotificationsEnabled,
  notify,
} = require("../../electron/lib/desktopNotifications");

describe("normalizeNotificationsEnabled", () => {
  it("defaults to enabled", () => {
    assert.equal(NOTIFICATIONS_ENABLED_DEFAULT, true);
    assert.equal(normalizeNotificationsEnabled(undefined), true);
  });

  it("only an explicit false (boolean or string) disables it", () => {
    assert.equal(normalizeNotificationsEnabled(false), false);
    assert.equal(normalizeNotificationsEnabled("false"), false);
  });

  it("coerces anything else back to enabled", () => {
    assert.equal(normalizeNotificationsEnabled(true), true);
    assert.equal(normalizeNotificationsEnabled("true"), true);
    assert.equal(normalizeNotificationsEnabled(null), true);
    assert.equal(normalizeNotificationsEnabled("nonsense"), true);
  });
});

describe("notify()", () => {
  function fakeNotification() {
    const calls: { click?: () => void; shown: boolean } = { shown: false };
    return {
      instance: {
        on: (event: string, handler: () => void) => {
          if (event === "click") calls.click = handler;
        },
        show: () => {
          calls.shown = true;
        },
      },
      calls,
    };
  }

  it("suppresses the notification when the preference is disabled", () => {
    let created = false;
    const result = notify({
      enabled: false,
      isSupported: () => true,
      createNotification: () => {
        created = true;
        return fakeNotification().instance;
      },
      title: "t",
      body: "b",
    });
    assert.equal(result, null);
    assert.equal(created, false);
  });

  it("suppresses the notification when the OS/build does not support it", () => {
    let created = false;
    const result = notify({
      enabled: true,
      isSupported: () => false,
      createNotification: () => {
        created = true;
        return fakeNotification().instance;
      },
      title: "t",
      body: "b",
    });
    assert.equal(result, null);
    assert.equal(created, false);
  });

  it("creates, wires the click handler, and shows the notification when allowed", () => {
    const { instance, calls } = fakeNotification();
    let onClickFired = false;
    const result = notify({
      enabled: true,
      isSupported: () => true,
      createNotification: (options: { title: string; body: string }) => {
        assert.deepEqual(options, { title: "Hello", body: "World" });
        return instance;
      },
      title: "Hello",
      body: "World",
      onClick: () => {
        onClickFired = true;
      },
    });
    assert.equal(result, instance);
    assert.equal(calls.shown, true);
    calls.click?.();
    assert.equal(onClickFired, true);
  });

  it("shows the notification even without an onClick handler", () => {
    const { instance, calls } = fakeNotification();
    notify({
      enabled: true,
      isSupported: () => true,
      createNotification: () => instance,
      title: "Hello",
      body: "World",
    });
    assert.equal(calls.shown, true);
    assert.equal(calls.click, undefined);
  });
});

// ─── main.js wiring (static-analysis style, matching the repo's existing
// convention for asserting structure without importing the Electron binary) ───

describe("Electron main.js desktop notifications wiring", () => {
  const mainSrc = readFileSync(join(import.meta.dirname, "../../electron/main.js"), "utf8");

  it("persists the toggle and exposes it as a tray checkbox", () => {
    assert.match(
      mainSrc,
      /writeNotificationsEnabled\(REMOTE_SERVER_PREFS_PATH, notificationsEnabled\)/
    );
    assert.match(mainSrc, /label: "Desktop Notifications"/);
    assert.match(mainSrc, /type: "checkbox"/);
  });

  it("routes the update-downloaded notification through notifyDesktop()", () => {
    assert.match(mainSrc, /notifyDesktop\(\{\s*title: "OmniRoute Update Ready"/);
    assert.doesNotMatch(mainSrc, /new Notification\(\{/);
  });

  it("notifies on a server start failure and an unexpected server exit", () => {
    assert.match(mainSrc, /title: "OmniRoute Server Failed to Start"/);
    const exitStart = mainSrc.indexOf('nextServer.on("exit"');
    const exitHandler = mainSrc.slice(exitStart, exitStart + 800);
    assert.ok(exitHandler.includes("code !== 0 && !isServerStopped"));
    assert.ok(exitHandler.includes("OmniRoute Server Stopped Unexpectedly"));
  });
});
