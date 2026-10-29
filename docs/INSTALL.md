# Installing the Control Room on another Windows PC (0.66)

Owner request 2026-10-29: "make the program workable on other PCs". Every PC gets its own copy with its own empty
workspace and its own keys (owner decision: start fresh on each PC). It runs on 64-bit Windows 10 or 11.

## Install (once per PC)

1. In the browser, sign in to GitHub, open https://github.com/hamzaofficial1478-lang/youtube and choose
   **Code → Download ZIP**.
2. Right-click the ZIP → **Extract All**, to a short path such as `Desktop\YT` (deep folders hit Windows' 260-character
   limit in renders).
3. Open the extracted folder and double-click **Install Control Room**. If Windows says it protected your PC, choose
   **More info → Run anyway** (the files came from the internet).

The installer then, in order:

1. unblocks the program files;
2. downloads **Node.js 24** into `runtime\node`, checked against the SHA-256 that nodejs.org publishes;
3. downloads **FFmpeg 9.0.2 essentials** into `runtime\ffmpeg` (about 115 MB), checked against the SHA-256 written in
   the installer; if gyan.dev no longer offers that exact package, its current release, checked against the
   checksum gyan.dev publishes;
4. installs **Git** with winget when it is missing (Windows may ask for permission), then links the folder to GitHub
   and takes the newest version (a GitHub sign-in opens if the repository is private). If that fails, the program
   still installs from the ZIP and the next run tries again;
5. installs the program's packages (`npm ci`);
6. puts a **Control Room** shortcut on the desktop and starts the program.

Nothing else is installed for the whole PC. Microsoft Edge (built into Windows) or Google Chrome is needed to draw
scenes.

## First start on the new PC

- **Connections:** add Claude, ChatGPT (the Codex app), the narrator and the other services again. Keys are locked to
  each PC's Windows account, so they are never copied between PCs.
- **Room 05:** run the FFmpeg readiness check once and pin the build.
- Channels, styles and videos start empty on each PC.

## Updates

Double-click **Update Control Room** in the program folder. It checks GitHub, stops the program, takes the newest
version (only when no program file was changed on this PC) and starts it again; changed packages install at that
start. Your data folder, keys and the downloaded tools stay as they are.

## The laptop you already use

It needs no installer: keep using `git pull origin main` or **Update Control Room**. If you run the installer there
anyway, the program switches to the installer's FFmpeg, so pin it again in Room 05.

## Not tested

The scripts run under Windows PowerShell, which the build environment cannot run. Their downloads (the Node package
list and checksums, the FFmpeg package, its checksum and its features: libass, libx264, fontconfig) and the git
linking were checked here; the scripts themselves still need their first run on a real Windows PC.
