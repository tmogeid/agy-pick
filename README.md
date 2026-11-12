# agy-pick 🎯

> **Interactive conversation picker & session resume launcher for Antigravity CLI (`agy`).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

---

## 💡 Why `agy-pick`?

When working with Google's Antigravity CLI (`agy`) in terminal / TUI mode, resuming previous sessions requires running:
```bash
agy --conversation <conversation-id>
```
However, finding past conversation UUIDs usually meant digging manually through `~/.gemini/antigravity-cli/brain/`.

**`agy-pick`** solves this by providing a clean, blazing-fast interactive terminal menu with arrow-key navigation, real-time filtering, smart prompt previews, and instant session resumption.

```text
Antigravity Conversations (10 shown of 502 total)  [Page 1/51]  (Filter: off)

 > 1. 2026-11-11 17:13 [Delegation] Code Review — agy conversation picker CLI (5dab8d8e)
   2. 2026-11-11 16:58 [Delegation] Phase 1 — Implement agy conversation pi... (cb110a12)
   3. 2026-11-11 16:40 /maestro:orchestrate                                   (78b1994f)
   4. 2026-11-11 16:20 ¿Cómo abro otra sesión o conversación que tuvimos?     (e3056ab9)
   5. 2026-11-11 14:10 Add unit tests for payment processing module           (a4192b01)

 ↑/↓: Navigate • Enter: Resume • /: Filter • ←/→: Page • q: Exit
```

---

## ✨ Features

- ⚡ **Zero External Dependencies**: Built 100% with native Node.js standard libraries (`readline`, `fs`, `path`, `child_process`).
- 🚀 **Blazing Fast**: Uses an `mtime`-keyed persistent disk cache. Scans and indexes **500+ conversations in <100ms**.
- 🔍 **Real-Time Search & Filtering**: Press `/` in interactive mode to instantly filter by topic or ID prefix.
- 🧼 **Smart Prompt Cleaning**: Strips internal harness wrappers, MemPalace headers, and XML boilerplate to display clean, human-readable previews.
- 🪟 **First-Class Windows Support**: Includes both native CMD (`.cmd`) and PowerShell (`.ps1`) wrappers that seamlessly integrate into your `$PATH`.
- 🐧 **Linux & macOS Ready**: Full POSIX terminal support and one-line shell installer.
- 🤖 **Scriptable & Pipeline Ready**: Non-interactive flags (`--list`, `--search`, `--id-only`, `--dry-run`) with automatic non-TTY fallback.
- 🛡️ **Robust & Secure**: Complete stdin listener detachment before launching `agy` to prevent keyboard conflicts, plus strict regex sanitization of conversation IDs.

---

## 📦 Installation

### Option 1: PowerShell (Windows One-Liner)

Run in PowerShell:
```powershell
irm https://raw.githubusercontent.com/tmogeid/agy-pick/main/install.ps1 | iex
```

### Option 2: Linux / macOS (Curl One-Liner)

Run in Bash or Zsh:
```bash
curl -fsSL https://raw.githubusercontent.com/tmogeid/agy-pick/main/install.sh | bash
```

### Option 3: Via NPM / NPX

Run instantly without installing:
```bash
npx agy-pick
```

Or install globally:
```bash
npm install -g agy-pick
```

### Option 4: Git Clone

```bash
git clone https://github.com/tmogeid/agy-pick.git
cd agy-pick
./install.ps1   # on Windows
# or
./install.sh    # on Linux / macOS
```

---

## 🎮 Interactive Controls

| Key | Action |
| --- | --- |
| **`↑`** / **`k`** | Move selection up |
| **`↓`** / **`j`** | Move selection down |
| **`Enter`** | **Resume selected conversation** (`agy --conversation <id>`) |
| **`/`** | Activate real-time filter mode (type query, press `Enter` or `Esc` to return) |
| **`←`** / **`h`** / **`PgUp`** | Previous page |
| **`→`** / **`l`** / **`PgDn`** | Next page |
| **`Home`** / **`g`** | Jump to first conversation |
| **`End`** / **`G`** | Jump to last conversation |
| **`q`** / **`Esc`** | Exit without resuming |

---

## 🛠️ CLI Options & Non-Interactive Usage

```text
USAGE:
  agy-pick [options] [search-term]

OPTIONS:
  -h, --help           Show help message
  -l, --list           List conversations in a non-interactive table
  -i, --id-only        Output only the latest conversation UUID (useful for piping)
  -s, --search <term>  Filter conversations matching ID or preview text
  -r, --resume <id>    Resume conversation directly by full ID or prefix
  -n, --limit <n>      Number of conversations to display in list mode (default: 20)
  -a, --all            Show all conversations in list mode
  -p, --page-size <n>  Items per page in interactive menu (default: 10)
      --dir <path>     Custom brain directory (default: ~/.gemini/antigravity-cli/brain)
      --no-cache       Force re-parsing transcripts without using disk cache
      --dry-run        Print selected conversation ID instead of launching agy
```

### Examples

**List recent 10 sessions:**
```bash
agy-pick --list -n 10
```

**Search past conversations mentioning "maestro":**
```bash
agy-pick --search "maestro"
```

**Resume directly by ID prefix:**
```bash
agy-pick --resume 78b1994f
```

**Get latest conversation ID in a script:**
```bash
LATEST_ID=$(agy-pick --id-only)
```

---

## ⚙️ Configuration & Environment

`agy-pick` works out of the box with default Antigravity settings:

- Default Brain Directory: `~/.gemini/antigravity-cli/brain/`
- Custom Brain Path: set environment variable `AGY_BRAIN_DIR=/custom/path` or pass `--dir <path>`.
- Cache Location: `~/.gemini/antigravity-cli/cache/agy-pick-cache.json`

---

## 📄 License

MIT © 2026 [tmogeid](https://github.com/tmogeid)
