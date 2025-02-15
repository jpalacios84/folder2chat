import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

/**
 * Generates the report.
 * @param filePaths The selected file paths.
 * @param includeTree Whether to include the directory tree.
 * @param rootFolder The root folder from which to generate the tree.
 */
export function generateReport(filePaths: string[], includeTree: boolean = true, rootFolder?: string): string {
  const reportLines: string[] = [];

  // Determine the common base.
  // If a rootFolder is provided (from the webview), use it.
  let commonBase: string;
  if (rootFolder && fs.existsSync(rootFolder)) {
    commonBase = rootFolder;
  } else {
    commonBase = getCommonDirectory(filePaths);
  }
  
  // Include the full directory tree only if the checkbox was checked.
  if (includeTree && commonBase) {
    const treeText = generateTreeText(commonBase);
    reportLines.push("Directory Tree:");
    reportLines.push("```");
    reportLines.push(treeText);
    reportLines.push("```");
    reportLines.push("");
  }

  // For each file, print its contents along with its relative path.
  for (const fullPath of filePaths) {
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      continue;
    }
    const relativeFilePath = path.relative(commonBase, fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const lang = ext ? ext.substring(1) : "txt";

    let content = "";
    try {
      content = fs.readFileSync(fullPath, { encoding: 'utf8' });
    } catch (e) {
      content = `Could not read file: ${e}`;
    }

    reportLines.push(`File: ${relativeFilePath}`);
    reportLines.push(`\`\`\`${lang}`);
    reportLines.push(content.trim());
    reportLines.push("```");
    reportLines.push("");
  }
  return reportLines.join("\n");
}

/**
 * Returns the common directory for all file paths.
 * For files, their parent directory is used.
 */
function getCommonDirectory(paths: string[]): string {
  if (paths.length === 0) return '';
  const dirs = paths.map(p => {
    try {
      return fs.statSync(p).isDirectory() ? p : path.dirname(p);
    } catch (e) {
      return path.dirname(p);
    }
  });
  return commonDirectory(dirs);
}

/**
 * Computes the longest common directory from an array of directories.
 */
function commonDirectory(paths: string[]): string {
  if (paths.length === 0) return '';
  const splitPaths = paths.map(p => p.split(path.sep).filter(Boolean));
  let commonParts = splitPaths[0];
  for (let i = 1; i < splitPaths.length; i++) {
    const parts = splitPaths[i];
    let j = 0;
    while (j < commonParts.length && j < parts.length && commonParts[j] === parts[j]) {
      j++;
    }
    commonParts = commonParts.slice(0, j);
    if (commonParts.length === 0) break;
  }
  return (path.isAbsolute(paths[0]) ? path.sep : '') + commonParts.join(path.sep);
}

/**
 * Recursively generates a text representation of the directory tree,
 * similar to the Linux 'tree' command, but without including the root folder itself.
 * Folders in config.DEFAULT_EXCLUDED_FOLDERS are skipped.
 */
function generateTreeText(rootPath: string, prefix: string = ""): string {
  let lines: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(rootPath).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error(`Error listing directory ${rootPath}: ${e}`);
    return "";
  }
  
  // Filter out entries that are in the excluded folders.
  const filteredEntries = entries.filter(entry => !config.DEFAULT_EXCLUDED_FOLDERS.includes(entry));
  
  filteredEntries.forEach((entry, index) => {
    const fullPath = path.join(rootPath, entry);
    const isLast = index === filteredEntries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    lines.push(prefix + connector + entry);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      const extension = isLast ? "    " : "│   ";
      const subtree = generateTreeText(fullPath, prefix + extension);
      if (subtree) {
        lines.push(...subtree.split("\n"));
      }
    }
  });
  return lines.join("\n");
}
