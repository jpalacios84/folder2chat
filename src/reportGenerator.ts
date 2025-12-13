import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

interface FilePart {
  path: string;
  lang: string;
  bytes: number;
  lines: number;
  content: string;
}

interface Stats {
  files: number;
  bytes: number;
  lines: number;
  tokens: number;
}

function estimateTokensFromText(s: string): number {
  return Math.ceil((s?.length ?? 0) / 4);
}

const AGENT_RULES = [
  "Act as an expert coding assistant. Expect a brief instruction followed by a large code baseline and a directory tree.",
  "Do **not** assume missing files. If something seems absent, ask which file(s) to include.",
  "When proposing a change, output the **full regenerated file(s)** only — no diffs, no snippets.",
  "Acknowledge errors briefly (e.g., \"Got it!\"). Do not apologize or emote.",
  "Do not infer the user's mood. Stay neutral and concise.",
  "While fixing or troubleshooting, avoid explanations unless explicitly asked.",
  "Across rounds, regenerate **only** files that changed; do not resend unchanged files.",
  "Avoid praise or flattery. Focus on code and results."
];

/**
 * Builds the markdown report and returns it **with** file-content stats.
 * Independence rules:
 *  - includeInstructions => summary lines + guidelines
 *  - includeTree         => directory tree section
 * Also removes: metadata HTML comment and the "# folder2chat report" title line.
 */
export function generateReportBundle(
  filePaths: string[],
  includeTree: boolean = true,
  rootFolder?: string,
  includeInstructions: boolean = true,
  allowedExtensions?: string[]
): { report: string; stats: Stats } {

  // "Empty report!" only when nothing is requested or selected.
  if (filePaths.length === 0 && !includeTree && !includeInstructions) {
    return { report: "Empty report!", stats: { files: 0, bytes: 0, lines: 0, tokens: 0 } };
  }

  let commonBase = '';
  if (rootFolder && fs.existsSync(rootFolder)) {
    commonBase = rootFolder;
  } else if (filePaths.length > 0) {
    commonBase = getCommonDirectory(filePaths);
  }

  const parts: FilePart[] = [];
  for (const fullPath of filePaths) {
    try {
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      const lines = content.split(/\r?\n/).length;
      const rel = commonBase ? path.relative(commonBase, fullPath) : fullPath;
      const ext = path.extname(fullPath).toLowerCase();
      const lang = ext ? ext.slice(1) : 'txt';
      parts.push({ path: rel, lang, bytes, lines, content });
    } catch (err) {
      const rel = commonBase ? path.relative(commonBase, fullPath) : fullPath;
      const msg = `/* folder2chat: failed to read "${rel}": ${err} */`;
      parts.push({ path: rel, lang: 'txt', bytes: Buffer.byteLength(msg), lines: 1, content: msg });
    }
  }

  const totalBytes = parts.reduce((s, p) => s + p.bytes, 0);
  const totalLines = parts.reduce((s, p) => s + p.lines, 0);
  const combined = parts.map(p => p.content).join('\n');
  const approxTokens = estimateTokensFromText(combined);
  const stats: Stats = { files: parts.length, bytes: totalBytes, lines: totalLines, tokens: approxTokens };

  // Build output (no metadata HTML comment; no title line)
  const out: string[] = [];

  // Summary + guidelines only if includeInstructions (no H1 title)
  if (includeInstructions) {
    out.push(`**Root:** \`${commonBase}\`  `);
    out.push(`**Files:** ${stats.files}  |  **Lines:** ${stats.lines}  |  **Bytes:** ${stats.bytes}  |  **~Tokens:** ${stats.tokens}`);
    out.push('');

    out.push('## Response guidelines');
    AGENT_RULES.forEach(rule => out.push(`- ${rule}`));
    out.push('');
  }

  // Directory Tree is independent of includeInstructions
  if (includeTree && commonBase) {
    // If specific filters provided (from UI chips), use them. Otherwise default to config.
    const exts = allowedExtensions ?? config.TEXT_EXTENSIONS;
    const treeText = generateTreeText(commonBase, exts);
    if (treeText) {
      out.push('## Directory Tree');
      out.push('```');
      out.push(treeText);
      out.push('```');
      out.push('');
    }
  }

  // Files (if any)
  if (parts.length > 0) {
    out.push('## Files');
    for (const p of parts) {
      out.push(`### ${p.path}`);
      out.push(`\`\`\`${p.lang}`);
      out.push(p.content.trim());
      out.push('```');
      out.push('');
    }
  }

  return { report: out.join('\n'), stats };
}

/**
 * Backwards-compatible wrapper that returns only the markdown.
 */
export function generateReport(
  filePaths: string[],
  includeTree: boolean = true,
  rootFolder?: string,
  includeInstructions: boolean = true,
  allowedExtensions?: string[]
): string {
  return generateReportBundle(filePaths, includeTree, rootFolder, includeInstructions, allowedExtensions).report;
}

/* helpers */

function getCommonDirectory(pathsArr: string[]): string {
  if (!pathsArr || pathsArr.length === 0) return '';
  const dirs = pathsArr.map(p => {
    try { return fs.statSync(p).isDirectory() ? p : path.dirname(p); }
    catch { return path.dirname(p); }
  });
  return commonDirectory(dirs);
}

function commonDirectory(pathsArr: string[]): string {
  if (!pathsArr || pathsArr.length === 0) return '';

  // Split each path into components; drop empty components from leading separator.
  const splitPaths = pathsArr.map(p => p.split(path.sep).filter(Boolean));

  // Start with the first path's components, then narrow.
  let commonParts: string[] = splitPaths[0] ?? [];

  for (let i = 1; i < splitPaths.length; i++) {
    const currentPathParts = splitPaths[i];
    let j = 0;
    while (
      j < commonParts.length &&
      j < currentPathParts.length &&
      commonParts[j] === currentPathParts[j]
    ) {
      j++;
    }
    commonParts = commonParts.slice(0, j);
    if (commonParts.length === 0) break;
  }

  // Preserve absolute-root if the first path is absolute.
  const leadingSep = path.isAbsolute(pathsArr[0]) ? path.sep : '';
  return leadingSep + commonParts.join(path.sep);
}

function generateTreeText(rootPath: string, allowedExtensions: string[], prefix: string = ''): string {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(rootPath).sort((a, b) => a.localeCompare(b));
  } catch {
    return '';
  }

  // Filter entries based on excluded folders AND active extension filters
  const validEntries = entries.filter(entry => {
    // 1. Exclude blocked folders
    if (config.DEFAULT_EXCLUDED_FOLDERS.includes(entry)) return false;

    const full = path.join(rootPath, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { return false; }

    // 2. Directories are included (to match UI tree structure, even if empty)
    if (stat.isDirectory()) return true;

    // 3. Files must match allowed extensions
    const ext = path.extname(entry).toLowerCase();
    // If ext is empty, use the filename itself (to match Dockerfile, .env, etc.)
    const key = ext || entry;
    
    // Check if either the extension or the exact filename is in the allowed list
    return allowedExtensions.some(allowed => allowed.toLowerCase() === key.toLowerCase());
  });

  let lines: string[] = [];
  validEntries.forEach((entry, i) => {
    const full = path.join(rootPath, entry);
    // Safe to stat again (or we could have cached it, but FS overhead is low here)
    const isDir = fs.statSync(full).isDirectory();
    const last = i === validEntries.length - 1;
    const connector = last ? '└── ' : '├── ';

    lines.push(prefix + connector + entry);
    if (isDir) {
      const extension = last ? '    ' : '│   ';
      const sub = generateTreeText(full, allowedExtensions, prefix + extension);
      if (sub) {
        lines.push(sub);
      }
    }
  });

  return lines.join('\n');
}