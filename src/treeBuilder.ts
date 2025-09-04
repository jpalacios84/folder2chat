import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

/**
 * Recursively builds a directory tree honoring excluded folders and allowed extensions.
 */
export function buildDirectoryTree(rootPath: string, limit: number = 100, excluded: string[] = []): any {
  if (!fs.statSync(rootPath).isDirectory()) {
    return { name: path.basename(rootPath), path: rootPath, type: 'file' };
  }

  const tree: any = { name: path.basename(rootPath) || rootPath, path: rootPath, type: 'directory', children: [] };

  let entries: string[] = [];
  try { entries = fs.readdirSync(rootPath); }
  catch { return tree; }

  entries.sort((a, b) => {
    const aPath = path.join(rootPath, a);
    const bPath = path.join(rootPath, b);
    const aIsDir = fs.statSync(aPath).isDirectory();
    const bIsDir = fs.statSync(bPath).isDirectory();
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  const allowed = new Set(config.TEXT_EXTENSIONS.map(e => e.toLowerCase()));
  let count = 0;

  for (const entry of entries) {
    if (excluded.includes(entry)) continue;
    const full = path.join(rootPath, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      const child = buildDirectoryTree(full, limit, excluded);
      tree.children.push(child);
      count++;
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (allowed.has(ext)) {
        tree.children.push({ name: entry, path: full, type: 'file' });
        count++;
      }
    }
    if (limit > 0 && count >= limit) break;
  }

  return tree;
}
