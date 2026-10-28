# Backups and restore (A02, 0.55)

Phase 06 step A02, built 2026-10-22 before real production starts, so the owner's work is protected from the first
video. Page: **Backups** in the sidebar. Code: `backup.js`; tests: `tests/backup.test.js`.

## What a backup holds

- **The database**, as one consistent snapshot taken by SQLite itself (`VACUUM INTO`) while the program keeps running.
- **Every file of the work** in the data folder: narrations, visuals, drawings, painted pictures, renders, packages,
  thumbnails, screenshots, editions. Left out: the logs, the launcher note, files still being written (names that
  start with a dot or end in `.tmp`), the live database files (the snapshot stands for them) and the backups folder.
- Files are stored **once by their SHA-256** (`backups/files/aa/<sha>`), so a second backup copies only what changed.
  A file whose size and time match the last backup keeps its known SHA-256 (rsync's quick check); the rest are hashed
  as a stream, so the program stays responsive.
- Each backup keeps a manifest `backups/sets/<id>.json` (path, size, SHA-256 of every file, the database snapshot's
  size and SHA-256) beside its snapshot `<id>.sqlite`.
- Keys stay encrypted for the owner's Windows account (DPAPI). A backup restored on another PC or account needs the
  keys entered again in Connections.

## When backups run

- **By hand:** "Back up now".
- **By themselves** (default on): checked 3 minutes after the program starts and then every 15 minutes; a backup runs
  when the newest one is older than the setting (default 24 hours) and no render is running.
- **Kept:** the newest automatic backups up to the setting (default 14); backups made by hand stay. Stored files no
  remaining backup needs are removed.
- **Where:** the program's own `data/backups`, or a folder the owner names (an external drive is safer). The folder
  must exist, be writable and lie outside the data folder.
- **Room:** a backup is refused when its drive would keep less than 1 GB free, with the size it needs.

## Checking and restoring

- **Check it:** every stored file is read again and compared with its SHA-256, and SQLite checks the database
  snapshot (`PRAGMA integrity_check`). The result is kept beside the backup and shown in the list.
- **Restore:** the owner ticks a confirmation. The backup is checked first (a failed check refuses the restore), then
  `restore-request.json` is written and the page says to close and start the program again. The restore happens at the
  next start, **before the database opens** (`Backups.applyPendingRestore` in `createApp`):
  1. the backup is checked again (snapshot SHA-256 and integrity, every stored file present); if anything is wrong,
     nothing is touched and the reason is shown;
  2. the current database (with its `-wal`/`-shm`) is set aside in `backups/before-restore/<time>/`;
  3. the snapshot becomes the database;
  4. every file of the backup that is missing or different is copied back; a file it replaces is set aside first;
     files newer than the backup stay where they are.
  The result (`restore-result.json`) is shown on the Backups page. A waiting restore can be cancelled.

## Disk pressure

- Every render (preview, master, language edition) is refused before it starts when the drive with the work has less
  than 2 GB free (`RenderRoom.diskCheck`), with the free space in the message.
- The Overview warns when that drive has less than 5 GB free, or when the newest backup is more than two days old.

## Reliability already in place (A02 checklist)

- **No automatic retries** of provider calls anywhere: every Claude, ChatGPT, ElevenLabs, NexLev and YouTube call
  starts from a click (or a named unattended rule), reserves first and is never retried by itself.
- **Interrupted work** is marked on the next start (every room's `recoverInterrupted`), with usage `unknown` where a
  provider may have charged; a retry is a confirmed new attempt.
- **Renders resume** from verified parts (`render_stages`, Room 10) and publishing resumes uploads from the session
  YouTube reports (Room 11).

## Not built

- Backups to cloud storage (a folder on a synced drive works, but the program does not upload anything itself).
- Restoring a single file or a single video (a restore is the whole workspace).
- Measured 14-day reliability, quota and render capacity (A03).
