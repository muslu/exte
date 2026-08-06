# exte — Privacy Policy

**Last updated:** 6 August 2026 · **Applies to version:** 1.0.0

## Summary

exte does not collect, store, or transmit any data to anyone. The extension has **no network
permission** and therefore cannot contact any server. Everything you enter stays in your own
browser.

## What data is handled

You do not need an account, a sign-in, or any personal information to use this extension.
Only the following, all of which **you** enter, is stored **on your device**:

- The name and issuer (service) of each 2FA account
- The shared secret needed to generate verification codes
- Technical fields such as algorithm, digit count, period, and counter
- Your theme preference and password-lock settings

This data lives in your browser's `chrome.storage.local` area. If you enable the optional
password lock, the secrets are encrypted with **AES-256-GCM** using a key derived from your
password with PBKDF2-SHA256 (310,000 iterations).

## Where the data goes

**Nowhere.** The extension manifest declares no `host_permissions`, and the code contains no
network calls (`fetch`, `XMLHttpRequest`, WebSocket). This is enforced by the browser — even
if the extension wanted to send data, it could not.

There is no data sale, no sharing with third parties, no advertising, no analytics, no
cookies, and no telemetry.

## Why each permission is requested

| Permission | Purpose |
|---|---|
| `storage` | To keep your accounts and settings on your device |
| `activeTab` | Only when you click "Scan from screen": to capture the active tab so the QR code on screen can be decoded. The image is processed in memory and never stored |
| `clipboardWrite` | To copy the verification code you click to your clipboard |

## Chrome sync

Data is kept in `chrome.storage.local` and is **not** included in Chrome account
synchronisation; it is not copied to your other devices automatically. To move to another
device, use the extension's built-in encrypted backup.

## Deleting your data

When you remove the extension, Chrome deletes all of its storage. You can also delete
individual accounts from within the extension. Deleted data cannot be recovered.

## Your responsibility for backup files

Backup files you export are under your own control:

- **Encrypted JSON** — protected by your password; if you forget it, the file cannot be decrypted.
- **`.txt` (otpauth list)** — **not encrypted**; it contains your secrets in plain text. Use it
  only to move accounts to another application, then delete it.

## Changes

If this policy changes, this page is updated together with the new version and the
"Last updated" date is changed.

## Contact

muslu.yuksektepe@makdos.com
