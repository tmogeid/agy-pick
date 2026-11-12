#!/usr/bin/env node
/**
 * agy-pick - Interactive Antigravity conversation picker and launcher
 * 
 * Allows users to browse, search, and resume previous Antigravity (agy) sessions
 * with zero external npm dependencies.
 *
 * Usage:
 *   node agy-pick.js                  (Interactive picker)
 *   node agy-pick.js --list           (List recent conversations non-interactively)
 *   node agy-pick.js --search <text>  (Filter conversations by preview or ID)
 *   node agy-pick.js --resume <id>    (Resume directly by ID or prefix)
 *   node agy-pick.js --id-only        (Print only the conversation ID)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawn } = require('child_process');

// ── Configuration & Paths ───────────────────────────────────────────────────

const HOME_DIR = os.homedir();
const DEFAULT_BRAIN_DIR = path.join(HOME_DIR, '.gemini', 'antigravity-cli', 'brain');
const CACHE_DIR = path.join(HOME_DIR, '.gemini', 'antigravity-cli', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'agy-pick-cache.json');
const DEFAULT_PAGE_SIZE = 10;

// ANSI Styling codes
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Colors
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  // Backgrounds
  bgCyan: '\x1b[46m',
  bgBlue: '\x1b[44m',
  // Cursor
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\x1b[2K',
};

// ── Argument Parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    help: false,
    list: false,
    idOnly: false,
    all: false,
    limit: 20,
    search: '',
    resumeId: '',
    dryRun: false,
    noCache: false,
    brainDir: process.env.AGY_BRAIN_DIR || DEFAULT_BRAIN_DIR,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list' || arg === '-l') {
      options.list = true;
    } else if (arg === '--id-only' || arg === '-i') {
      options.idOnly = true;
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
      options.limit = 0; // unlimited
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-cache') {
      options.noCache = true;
    } else if (arg === '--limit' || arg === '-n') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.limit = val;
    } else if (arg === '--page-size' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.pageSize = val;
    } else if (arg === '--search' || arg === '-s') {
      options.search = args[++i] || '';
    } else if (arg === '--resume' || arg === '-r') {
      options.resumeId = args[++i] || '';
    } else if (arg === '--dir') {
      options.brainDir = args[++i] || DEFAULT_BRAIN_DIR;
    } else if (!arg.startsWith('-') && !options.search && !options.resumeId) {
      // Treat first loose argument as search term or prefix if provided
      options.search = arg;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
${ANSI.bold}${ANSI.cyan}agy-pick${ANSI.reset} - Interactive Antigravity Conversation Picker & Launcher

${ANSI.bold}USAGE:${ANSI.reset}
  agy-pick [options] [search-term]

${ANSI.bold}OPTIONS:${ANSI.reset}
  -h, --help           Show this help message
  -l, --list           List conversations in a non-interactive table
  -i, --id-only        Output only the conversation UUID(s)
  -s, --search <term>  Filter conversations matching ID or preview text
  -r, --resume <id>    Resume conversation directly by full ID or prefix
  -n, --limit <n>      Number of conversations to display in list mode (default: 20)
  -a, --all            Show all conversations in list mode
  -p, --page-size <n>  Items per page in interactive menu (default: 10)
      --dir <path>     Custom brain directory (default: ~/.gemini/antigravity-cli/brain)
      --no-cache       Force re-parsing transcripts without using disk cache
      --dry-run        Print selected conversation ID instead of launching agy

${ANSI.bold}INTERACTIVE CONTROLS:${ANSI.reset}
  ${ANSI.cyan}↑ / k${ANSI.reset}        Navigate up
  ${ANSI.cyan}↓ / j${ANSI.reset}        Navigate down
  ${ANSI.cyan}← / h / PgUp${ANSI.reset} Previous page
  ${ANSI.cyan}→ / l / PgDn${ANSI.reset} Next page
  ${ANSI.cyan}Home / End${ANSI.reset}   First / Last conversation
  ${ANSI.cyan}/${ANSI.reset}            Interactive filter mode
  ${ANSI.cyan}Enter${ANSI.reset}        Resume selected conversation (agy --conversation <id>)
  ${ANSI.cyan}q / Esc${ANSI.reset}      Exit without changes
`);
}

// ── Text Cleaning & Metadata Extraction ─────────────────────────────────────

function formatLocalDateTime(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function cleanPromptText(raw) {
  if (!raw) return '(empty prompt)';
  let text = String(raw);

  // Extract from <USER_REQUEST> ... </USER_REQUEST> if wrapped
  const matchReq = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
  if (matchReq) {
    text = matchReq[1];
  }

  // Extract Subagent delegation header if present
  const delegMatch = text.match(/#\s*Delegation:\s*([^\r\n]+)/i);
  if (delegMatch) {
    return `[Delegation] ${delegMatch[1].trim()}`;
  }

  // Strip OmniRoute harness tools preamble if present
  text = text.replace(/^[\s\S]*?The harness tools you may call[\s\S]*?\n\n/i, '');

  // If prompt has forwarded 'User: ...' (matching start-of-line)
  const userPrefixMatch = text.match(/(?:^|\r?\n)User:\s*(.*)$/is);
  if (userPrefixMatch) {
    text = userPrefixMatch[1];
  }

  // Remove common automated wrapper trailing instructions
  text = text.replace(/Reply now with the assistant response only\..*/si, '');

  // Clean MemPalace context header if present
  if (text.includes('Wake-up text')) {
    const parts = text.split(/={10,}/);
    if (parts.length > 1) {
      text = parts[parts.length - 1];
    }
  }

  // Strip XML-style tags
  text = text.replace(/<[A-Za-z0-9_-]+[^>]*>[\s\S]*?<\/[A-Za-z0-9_-]+>/g, '');
  text = text.replace(/<[A-Za-z0-9_-]+[^>]*\/>/g, '');
  text = text.replace(/<[A-Za-z0-9_-]+[^>]*>/g, '');

  // Collapse multiple whitespaces and linebreaks into single spaces
  text = text.replace(/\s+/g, ' ').trim();

  return text || '(empty prompt)';
}

function readFirstUserPrompt(filePath) {
  return new Promise((resolve) => {
    let resolved = false;
    let stream;
    try {
      stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    } catch (e) {
      return resolve('(unreadable transcript)');
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    function finish(content) {
      if (resolved) return;
      resolved = true;
      try {
        rl.close();
        stream.destroy();
      } catch (e) {}
      resolve(cleanPromptText(content));
    }

    stream.on('error', () => finish('(unreadable transcript)'));
    rl.on('error', () => finish('(error reading transcript)'));
    rl.on('line', (line) => {
      if (resolved) return;
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.type === 'USER_INPUT' || obj.source === 'USER_EXPLICIT' || obj.role === 'user') {
          finish(obj.content || '');
        } else if (obj.content && (obj.content.includes('# Delegation:') || obj.content.includes('<USER_REQUEST>'))) {
          finish(obj.content);
        }
      } catch (e) {
        // Continue reading next lines
      }
    });

    rl.on('close', () => finish('(no prompt found)'));
    rl.on('error', () => finish('(error reading transcript)'));
  });
}

// ── Cache Layer ─────────────────────────────────────────────────────────────

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    }
  } catch (e) {
    // Cache miss or corrupted, return empty
  }
  return {};
}

function saveCache(cache) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
  } catch (e) {
    // Non-critical if cache fails to write
  }
}

// ── Directory Scanner & Loader ──────────────────────────────────────────────

async function loadConversations(brainDir, noCache) {
  if (!fs.existsSync(brainDir)) {
    throw new Error(`Target brain directory does not exist: ${brainDir}`);
  }

  const entries = fs.readdirSync(brainDir, { withFileTypes: true });
  const rawDirs = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(brainDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        rawDirs.push({
          id: entry.name,
          fullPath,
          mtime: stat.mtimeMs,
        });
      } catch (e) {
        // Skip unreadable directories
      }
    }
  }

  // Sort descending by mtime (most recent first)
  rawDirs.sort((a, b) => b.mtime - a.mtime);

  const cache = noCache ? {} : loadCache();
  let cacheModified = false;
  const conversations = [];
  const needFetch = [];

  for (const item of rawDirs) {
    const cached = cache[item.id];
    if (cached && cached.mtime === item.mtime && cached.preview) {
      conversations.push({
        id: item.id,
        mtime: item.mtime,
        dateFormatted: cached.dateFormatted || formatLocalDateTime(item.mtime),
        preview: cached.preview,
      });
    } else {
      needFetch.push(item);
    }
  }

  // Batch process cache misses concurrently in chunks of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
    const batch = needFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        const p1 = path.join(item.fullPath, '.system_generated', 'logs', 'transcript.jsonl');
        const p2 = path.join(item.fullPath, 'transcript.jsonl');
        const transcriptPath = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);

        let preview = '(no transcript / empty session)';
        if (transcriptPath) {
          preview = await readFirstUserPrompt(transcriptPath);
        }

        const dateFormatted = formatLocalDateTime(item.mtime);
        const record = {
          id: item.id,
          mtime: item.mtime,
          dateFormatted,
          preview,
        };

        conversations.push(record);
        cache[item.id] = record;
        cacheModified = true;
      })
    );
  }

  // Sort final array by mtime descending
  conversations.sort((a, b) => b.mtime - a.mtime);

  if (cacheModified && !noCache) {
    saveCache(cache);
  }

  return conversations;
}

// ── Spawn Helper ────────────────────────────────────────────────────────────

function resumeConversation(id, dryRun) {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    console.error(`Error: Invalid conversation ID '${id}'. Only alphanumeric characters, dashes, and underscores are allowed.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[dry-run] Selected conversation: ${id}`);
    process.exit(0);
  }

  console.log(`\n${ANSI.green}▶ Resuming conversation:${ANSI.reset} ${id}\n`);

  const child = spawn('agy', ['--conversation', id], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error(`Failed to launch 'agy': ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

// ── Non-Interactive Modes ───────────────────────────────────────────────────

function runNonInteractive(conversations, options) {
  let list = conversations;

  if (options.search) {
    const q = options.search.toLowerCase();
    list = list.filter((c) => c.id.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q));
  }

  if (options.resumeId) {
    const q = options.resumeId.toLowerCase();
    const match = conversations.find((c) => c.id.toLowerCase().startsWith(q));
    if (!match) {
      console.error(`Error: No conversation found matching prefix/ID '${options.resumeId}'`);
      process.exit(1);
    }
    resumeConversation(match.id, options.dryRun);
    return;
  }

  if (options.idOnly) {
    if (options.list) {
      const display = options.limit > 0 ? list.slice(0, options.limit) : list;
      for (const c of display) {
        console.log(c.id);
      }
    } else {
      if (list.length > 0) {
        console.log(list[0].id);
      }
    }
    process.exit(0);
  }

  // Formatted list output
  const display = options.limit > 0 ? list.slice(0, options.limit) : list;
  console.log(
    `\n${ANSI.bold}${ANSI.cyan}Antigravity Conversations${ANSI.reset} ` +
    `(${display.length} shown of ${list.length} total):\n`
  );

  const termWidth = process.stdout.columns || 100;
  const previewMaxLen = Math.max(30, termWidth - 45);

  console.log(
    ` ${ANSI.dim}#   Date/Time        ID        Preview${ANSI.reset}`
  );
  console.log(` ${ANSI.dim}${'─'.repeat(Math.min(termWidth - 2, 90))}${ANSI.reset}`);

  for (let i = 0; i < display.length; i++) {
    const item = display[i];
    const indexStr = String(i + 1).padStart(3, ' ');
    const shortId = item.id.slice(0, 8);
    let preview = item.preview;
    if (preview.length > previewMaxLen) {
      preview = preview.slice(0, previewMaxLen - 3) + '...';
    }
    console.log(
      ` ${ANSI.cyan}${indexStr}${ANSI.reset} ` +
      `${ANSI.dim}${item.dateFormatted}${ANSI.reset} ` +
      `${ANSI.yellow}${shortId}${ANSI.reset} ` +
      `${preview}`
    );
  }

  if (options.limit > 0 && list.length > options.limit) {
    console.log(
      `\n${ANSI.dim}... and ${list.length - options.limit} older conversations. ` +
      `Use --all or -n <limit> to see more.${ANSI.reset}\n`
    );
  } else {
    console.log('');
  }
}

// ── Interactive Terminal Picker ─────────────────────────────────────────────

function runInteractive(allConversations, options) {
  let conversations = allConversations;
  let selectedIndex = 0;
  let searchQuery = options.search || '';
  let searchMode = false;
  let lastRenderedLineCount = 0;
  const pageSize = options.pageSize;

  function filterItems() {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) => c.id.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  }

  function render() {
    const filtered = filterItems();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    // Clamp selected index
    if (selectedIndex >= totalItems) {
      selectedIndex = Math.max(0, totalItems - 1);
    }
    if (selectedIndex < 0) {
      selectedIndex = 0;
    }

    const currentPage = totalItems === 0 ? 0 : Math.floor(selectedIndex / pageSize);
    const pageStart = currentPage * pageSize;
    const pageItems = filtered.slice(pageStart, pageStart + pageSize);

    const termWidth = process.stdout.columns || 80;
    const previewMaxLen = Math.max(25, termWidth - 44);

    const lines = [];

    // Header
    lines.push(
      `${ANSI.bold}${ANSI.cyan}⚡ Antigravity Session Picker${ANSI.reset} ` +
      `${ANSI.dim}(Page ${currentPage + 1}/${totalPages} · ${totalItems} conversations)${ANSI.reset}`
    );

    // Filter status or hint
    if (searchMode) {
      const maxQueryLen = Math.max(10, termWidth - 35);
      const displayQuery = searchQuery.length > maxQueryLen 
        ? '...' + searchQuery.slice(-(maxQueryLen - 3))
        : searchQuery;
      lines.push(
        `${ANSI.bold}${ANSI.yellow}Filter:${ANSI.reset} ${displayQuery}${ANSI.bold}_${ANSI.reset} ` +
        `${ANSI.dim}[Enter: apply, Esc: cancel]${ANSI.reset}`
      );
    } else if (searchQuery) {
      const maxQueryLen = Math.max(10, termWidth - 35);
      const displayQuery = searchQuery.length > maxQueryLen 
        ? searchQuery.slice(0, maxQueryLen - 3) + '...'
        : searchQuery;
      lines.push(
        `${ANSI.yellow}Filter active:${ANSI.reset} "${displayQuery}" ` +
        `${ANSI.dim}(Press '/' to edit, 'c' to clear)${ANSI.reset}`
      );
    } else {
      lines.push(
        `${ANSI.dim}[↑/↓] Navigate  [Enter] Resume  [←/→] Page  [/] Filter  [q] Quit${ANSI.reset}`
      );
    }

    // Divider
    lines.push(`${ANSI.gray}${'─'.repeat(Math.min(termWidth, 80))}${ANSI.reset}`);

    // Items
    if (pageItems.length === 0) {
      lines.push(`  ${ANSI.italic}${ANSI.dim}No matching conversations found.${ANSI.reset}`);
      for (let i = 1; i < pageSize; i++) lines.push('');
    } else {
      for (let i = 0; i < pageSize; i++) {
        if (i < pageItems.length) {
          const item = pageItems[i];
          const globalIndex = pageStart + i;
          const isSelected = globalIndex === selectedIndex;
          const indexStr = String(globalIndex + 1).padStart(3, ' ');
          const shortId = item.id.slice(0, 8);

          let preview = item.preview;
          if (preview.length > previewMaxLen) {
            preview = preview.slice(0, previewMaxLen - 3) + '...';
          }

          if (isSelected) {
            lines.push(
              `${ANSI.bold}${ANSI.green}▶ [${indexStr}] ${item.dateFormatted}  ${preview} ${ANSI.dim}(${shortId})${ANSI.reset}`
            );
          } else {
            lines.push(
              `  [${ANSI.dim}${indexStr}${ANSI.reset}] ${item.dateFormatted}  ${ANSI.dim}${preview}${ANSI.reset} ${ANSI.gray}(${shortId})${ANSI.reset}`
            );
          }
        } else {
          // Empty padding line to maintain stable terminal height
          lines.push('');
        }
      }
    }

    // Bottom info
    lines.push(`${ANSI.gray}${'─'.repeat(Math.min(termWidth, 80))}${ANSI.reset}`);
    if (filtered.length > 0 && selectedIndex < filtered.length) {
      const active = filtered[selectedIndex];
      lines.push(`${ANSI.dim}UUID: ${ANSI.reset}${ANSI.cyan}${active.id}${ANSI.reset}`);
    } else {
      lines.push('');
    }

    // Output buffer
    let output = '';
    if (lastRenderedLineCount > 0) {
      output += `\x1b[${lastRenderedLineCount}A\r`;
    }

    for (const line of lines) {
      output += `${ANSI.clearLine}${line}\n`;
    }

    lastRenderedLineCount = lines.length;
    process.stdout.write(output);
  }

  function cleanup() {
    process.stdout.write(ANSI.showCursor);
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch (e) {}
    }
    process.stdin.pause();
    process.stdin.removeAllListeners('keypress');
  }

  // Register clean shutdown
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.stdout.write('\n');
    process.exit(0);
  });
  process.on('uncaughtException', (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  // Setup terminal raw mode
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdout.write(ANSI.hideCursor);

  // Resize listener
  process.stdout.on('resize', () => {
    lastRenderedLineCount = 0;
    render();
  });

  // Initial draw
  render();

  process.stdin.on('keypress', (str, key) => {
    if (!key) return;

    // Global exit: Ctrl+C
    if (key.ctrl && key.name === 'c') {
      cleanup();
      process.stdout.write('\n');
      process.exit(0);
    }

    // Search mode key handling
    if (searchMode) {
      if (key.name === 'return') {
        searchMode = false;
        render();
        return;
      }
      if (key.name === 'escape') {
        searchMode = false;
        render();
        return;
      }
      if (key.name === 'backspace') {
        if (searchQuery.length > 0) {
          searchQuery = searchQuery.slice(0, -1);
          selectedIndex = 0;
          render();
        }
        return;
      }
      if (str && str.length === 1 && !key.ctrl && !key.meta) {
        searchQuery += str;
        selectedIndex = 0;
        render();
        return;
      }
      return;
    }

    // Normal navigation mode key handling
    const filtered = filterItems();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = totalItems === 0 ? 0 : Math.floor(selectedIndex / pageSize);

    if (key.name === 'escape' || key.name === 'q') {
      cleanup();
      process.stdout.write('\n');
      process.exit(0);
    }

    if (str === '/') {
      searchMode = true;
      render();
      return;
    }

    if (str === 'c' && searchQuery) {
      searchQuery = '';
      selectedIndex = 0;
      render();
      return;
    }

    if (key.name === 'up' || key.name === 'k') {
      if (totalItems > 0) {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : totalItems - 1;
        render();
      }
      return;
    }

    if (key.name === 'down' || key.name === 'j') {
      if (totalItems > 0) {
        selectedIndex = selectedIndex < totalItems - 1 ? selectedIndex + 1 : 0;
        render();
      }
      return;
    }

    if (key.name === 'left' || key.name === 'h' || key.name === 'pageup') {
      if (totalPages > 1) {
        const prevPage = currentPage > 0 ? currentPage - 1 : totalPages - 1;
        selectedIndex = prevPage * pageSize;
        render();
      }
      return;
    }

    if (key.name === 'right' || key.name === 'l' || key.name === 'pagedown') {
      if (totalPages > 1) {
        const nextPage = currentPage < totalPages - 1 ? currentPage + 1 : 0;
        selectedIndex = nextPage * pageSize;
        render();
      }
      return;
    }

    if (key.name === 'home' || str === 'g') {
      selectedIndex = 0;
      render();
      return;
    }

    if (key.name === 'end' || str === 'G') {
      selectedIndex = Math.max(0, totalItems - 1);
      render();
      return;
    }

    if (key.name === 'return' || key.name === 'enter') {
      if (filtered.length === 0) return;
      const chosen = filtered[selectedIndex];
      cleanup();
      resumeConversation(chosen.id, options.dryRun);
    }
  });
}

// ── Main Entry Point ────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  let conversations;
  try {
    conversations = await loadConversations(options.brainDir, options.noCache);
  } catch (err) {
    console.error(`${ANSI.bold}Error loading conversations:${ANSI.reset} ${err.message}`);
    process.exit(1);
  }

  if (conversations.length === 0) {
    console.log('No conversations found in target directory.');
    process.exit(0);
  }

  // Determine whether to run interactive or non-interactive
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const forceNonInteractive = options.list || options.idOnly || options.resumeId || !isTTY;

  if (forceNonInteractive) {
    runNonInteractive(conversations, options);
  } else {
    runInteractive(conversations, options);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
