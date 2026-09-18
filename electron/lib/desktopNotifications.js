"use strict";

/**
 * desktopNotifications.js — pure, dependency-injected wrapper around Electron's
 * cross-platform `Notification` API (native Notification Center on macOS, libnotify
 * on Linux, toast notifications on Windows — the same surface `terminal-notifier`
 * covers on macOS alone, but already OS-native on every platform OmniRoute ships).
 *
 * Kept dependency-injectable (no direct `require("electron")`) so the decision logic
 * — whether to fire, based on the persisted preference and OS support — is unit
 * testable without an Electron runtime.
 */

/** Persisted preference default: notifications are on unless explicitly disabled. */
const NOTIFICATIONS_ENABLED_DEFAULT = true;

/** Coerce a persisted/incoming value to a strict boolean, defaulting to enabled. */
function normalizeNotificationsEnabled(value) {
  if (value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  return NOTIFICATIONS_ENABLED_DEFAULT;
}

/**
 * Show a native desktop notification if the user preference allows it and the
 * current OS/build supports it. No-op (returns null) otherwise — callers never
 * need their own enabled/support checks.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled - current `notificationsEnabled` preference
 * @param {() => boolean} opts.isSupported - e.g. `Notification.isSupported`
 * @param {(options: {title: string, body: string}) => object} opts.createNotification
 *   - e.g. `(options) => new Notification(options)`
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {() => void} [opts.onClick]
 * @returns {object|null} the created notification instance, or null if suppressed
 */
function notify({ enabled, isSupported, createNotification, title, body, onClick }) {
  if (!enabled || !isSupported()) return null;

  const notification = createNotification({ title, body });
  if (onClick) {
    notification.on("click", onClick);
  }
  notification.show();
  return notification;
}

module.exports = {
  NOTIFICATIONS_ENABLED_DEFAULT,
  normalizeNotificationsEnabled,
  notify,
};
