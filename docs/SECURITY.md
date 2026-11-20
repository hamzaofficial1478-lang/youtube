# Security and reliability checklist (0.113)

Owner question 2026-11-20: "Is the program end-to-end encrypted? Can one user see another user's program?" plus a list of 48 points to check. Each point below was checked in the code at 0.113. "Fixed in 0.113" marks what this release changed.

## What kind of program this is

The Control Room is a **local, single-user program**. Each PC runs its own copy (`server.js` listens on `127.0.0.1` only), with its own database (`data/control-room.sqlite`), its own files and its own keys. There are no user accounts, no shared server and no cloud database. Another person on another PC has their own separate program and cannot reach yours: the server refuses any request that does not come from this PC by its own address (`Host` must be `127.0.0.1:<port>` or `localhost:<port>`, which also blocks DNS-rebinding tricks), any request from another website (`Origin` check), and any change without the page's secret token.

It is not "end-to-end encrypted" in the WhatsApp sense, because nothing is sent between users. What it does: every connection to an outside service (Claude, ChatGPT, Gemini, YouTube, ElevenLabs, Freesound, useapi.net...) is HTTPS, and every key or token is stored encrypted on the PC with Windows DPAPI (only your Windows account on that PC can decrypt it). The database itself is not encrypted; use BitLocker (Windows' own disk encryption) to protect it if the laptop is lost.

Two people on the **same Windows account** of the same PC share everything, like any desktop program. Give each person their own Windows account.

## The 48 points

| # | Point | Status in the program |
|---|---|---|
| 1 | JWT secret | Not applicable: no JWTs and no logins. Writes need a 32-byte random token made fresh at every start (`randomBytes(32)`), compared in constant time (`timingSafeEqual`). |
| 2 | Token in local storage | Applied: the page keeps its token in memory only. `localStorage` holds only the name you type for approvals (a convenience); `sessionStorage` holds "setup skipped". |
| 3 | Refresh token never rotated | Applied where tokens exist: YouTube's refresh token is Google's, encrypted, revoked when a channel is replaced, and `invalid_grant` asks you to reconnect. The page token changes at every start. |
| 4 | Reset link works twice | Not applicable: no passwords or reset links. The YouTube sign-in `state` is one-time and expires after 15 minutes. |
| 5 | Reset token guessable | Not applicable (no reset). Sign-in states and the page token come from `crypto.randomBytes`/`randomUUID`, with PKCE S256 for Google. |
| 6 | Memory leaks | Checked: long-lived maps are bounded (live progress entries end with their job; the sign-in map expires after 15 minutes; Muse reference uploads are kept 6 hours). Browsers used for drawing are closed after each job. Not measured over days of running. |
| 7 | Disaster recovery | Applied: automatic backups every 24 hours (newest 14 kept), checked by checksum, restored safely at the next start with everything replaced set aside (BACKUPS.md). Keep the backup folder on another drive. |
| 8 | Data privacy (GDPR) | Applied for a single owner: your data stays on your PC; YouTube data about other channels is display-only and deleted after 30 days; video descriptions used for matching are not stored; channels and lists can be deleted or exported. AI providers receive only what each job needs. |
| 9 | Accessibility | Partly: buttons are real buttons with labels, the navigation marks the current page (`aria-current`), progress bars have labels, dialogs are native `<dialog>`. Not audited with a screen reader. |
| 10 | Content security policy | Applied: `default-src 'self'`, no inline scripts or styles, no outside scripts, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`. Drawing pages run in their own stricter page with networking blocked. |
| 11 | Security headers | Fixed in 0.113: besides CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`, the program now sends `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` (other websites cannot embed its pictures, sounds or videos) and a `Permissions-Policy` that turns off camera, microphone, location, payment, USB, serial and Bluetooth. HSTS does not apply to a local `http://127.0.0.1` page. |
| 12 | Clickjacking | Applied: `X-Frame-Options: DENY` and `frame-ancestors 'none'`. |
| 13 | SSRF | Applied: every outside request goes to a fixed origin (Google, Anthropic, useapi.net, Freesound...) with `redirect: 'error'` or redirects checked against the platform's own hosts; downloads are size- and type-checked. TubeMind URLs must be https on tubemind.io. The program never fetches a URL a web page or AI answer gives it. |
| 14 | Path traversal | Applied: page files come from a fixed list; media is served by database ID or SHA-256 only; a backup's file list is checked to stay inside the data folder before a restore. Folders you type yourself (imports, studies) are read as you named them, by design. |
| 15 | Command injection | Applied: FFmpeg, ffprobe, Claude Code, Codex, PowerShell and the browser are started with argument lists, never a shell string. Fixed in 0.113: the one `cmd /k` window (Claude's sign-in) refuses a program path containing a quote, `%` or a line break. |
| 16 | Mass assignment | Applied: every route picks the fields it accepts and validates them; owner edits are checked strictly. Fixed in 0.113: request bodies drop any `__proto__` key while being read. |
| 17 | IDOR | Not applicable as a user-to-user risk: there is one owner. Every ID is still looked up and checked against its family, video and revision before use. |
| 18 | API keys protection | Applied: keys and tokens are DPAPI-encrypted in SQLite; the page only learns whether a key is present; keys travel in headers only and are scrubbed from error messages; logs never contain them; backups keep them encrypted. |
| 19 | End-to-end APIs | Applied: every provider connection has a test that reaches the real service (or names why not); live tests with each provider are listed as "not tested" in each release until done on the owner's PC. |
| 20 | Row level security | Not applicable: one owner per database. Families (channels) are kept apart by `family_id` in every query, and directions never cross channels. |
| 21 | Audit logs | Applied: the event log records approvals, uploads, deletes and settings changes with the name given; approvals, revisions and publishing records are immutable (deletes are blocked by database triggers). |
| 22 / 46 | Encryption at rest | Partly: keys and tokens are encrypted (DPAPI). The database, videos and pictures are not: turn on BitLocker on the PC (and on the backup drive). |
| 23 | Hashing vs encryption | Applied correctly: secrets that must be used again (API keys) are encrypted, not hashed; files are identified and checked by SHA-256 hashes; no passwords are stored. |
| 24 | Cache invalidation | Applied: page files and API answers are `no-store`; search caches expire (stock 24 h, Freesound 30 min); render parts are keyed by the exact recipe and checksum. Fixed in 0.113: after an update the open page reloads itself instead of running old code against the new program. |
| 25 | Error tracking | Applied: unexpected errors are written to `data/server-error.log` with time and stack; every job keeps its own error and status on its row; Operations lists the latest problems. No error report leaves the PC. |
| 26 | Code review | Applied: every release is a pull request into `main` with tests and a written review of the change. There is no automated CI on GitHub yet. |
| 27 | Branching strategy | Applied: work on a branch, pull request, merge into `main` (never force-pushed); the laptop pulls `main`. |
| 28 | API versioning | Not applicable: the API serves only its own page, shipped together; the page reloads on a version change (0.113). |
| 29 | API documentation | Partly: each room's document describes its routes and rules; there is no separate API reference because nothing else calls the API. |
| 30 | Integration end-to-end tests | Applied with stand-ins: about 500 tests run each room together with fake providers and real FFmpeg; browser checks run the real page. Real providers are tested on the owner's PC. |
| 31 | Time zones | Applied: times are stored in UTC (ISO 8601); YouTube schedules are entered in a named IANA zone and converted with clock-change gaps refused. |
| 32 | Character encoding | Applied: UTF-8 everywhere (requests, files, captions); CSV exports carry a BOM; titles from YouTube are decoded. |
| 33 | Concurrency | Applied: one program per PC owns the database; jobs are claimed in transactions so two workers never take the same one; immutable revisions refuse stale edits; lanes limit parallel work (Muse 4, designed shots 3, drawing browsers 3). |
| 34 | Session management | Applied for a local page: no login session; the token lives only while the program runs; a stale page is told to reload. |
| 35 | XSS | Applied: all text is escaped before it reaches the page (`esc`), the CSP forbids inline script, and `javascript:` links cannot run. |
| 36 | Connection pooling | Not applicable: one embedded SQLite database in the same process (no database server). Outside requests use Node's built-in keep-alive. |
| 37 | File upload security | Applied: uploads are checked by their bytes (not the name), size-limited (pictures 4-15 MB, documents 10 MB, clips and narration 500 MB), probed with the pinned ffprobe or decoded before use, stored under a new name by checksum, never executed. |
| 38 | Soft deletes | Applied where history matters: drafts, references, attempts and renders are marked removed or cleared (usage and costs stay counted); approvals and revisions are never deleted; a channel delete asks to keep a saved copy. |
| 39 | Background jobs | Applied: every job is a database row with its status, attempts and error; interrupted jobs are recovered at start; paid work never repeats by itself (except the owner-approved internet retry, at most 3 tries in an hour). |
| 40 | Cron jobs | Applied: one in-process timer (every 0.5 s for workers, 30 s for internet checks, 30 min for the competitor watch, 24 h for backups). No system cron, nothing runs while the program is closed. |
| 41 | Graceful shutdown | Fixed in 0.113: Stop now closes the page's open connections (before, `server.close()` could wait for them for ever), closes the database and exits within 15 seconds at most. Work cut off is recovered or resumed at the next start. |
| 42 | API gateways | Not applicable: one local program, no gateway. |
| 43 | Failover | Applied where it matters: Claude and ChatGPT stand in for each other on a failure (with your click); a failed picture falls back to a drawing; storyboards pause and resume. One PC means no server failover. |
| 44 | Latency | Applied: long work runs in the background with live progress; the page refreshes every 1.5 s; drawings, designed shots and Muse clips run in parallel lanes; finished parts are reused. |
| 45 | Network partitions | Applied: lost connections pause storyboards and are retried when the AI's server can be reached again; uploads resume from the confirmed byte; nothing is paid twice. |
| 47 | Encryption in transit | Applied: every outside service is HTTPS with certificate checks. The page itself talks to the program over `http://127.0.0.1`, which never leaves the PC. |
| 48 | Garbage collection | Applied: Node's own garbage collector for memory; on disk, old search caches, YouTube data (30 days), the render cache (over 8 GB), temporary files and revoked drawings are cleaned; backups keep the newest 14. |

## What you should do on your PC

1. Turn on BitLocker for the drive with the program and for the backup drive.
2. Use a Windows password, and one Windows account per person.
3. Keep the backup folder on another drive (Backups page).
4. Never paste a key into chat or GitHub; only into Connections.
