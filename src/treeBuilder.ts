import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

/**
 * Recursively builds a directory tree.
 */
export function buildDirectoryTree(rootPath: string, limit: number = 100, excluded: string[] = []): any {
    if (!fs.statSync(rootPath).isDirectory()) {
        return {
            name: path.basename(rootPath),
            path: rootPath,
            type: "file"
        };
    }

    const tree: any = {
        name: path.basename(rootPath) || rootPath,
        path: rootPath,
        type: "directory",
        children: []
    };

    let entries: string[];
    try {
        entries = fs.readdirSync(rootPath);
    } catch (err) {
        console.error(`Error listing directory ${rootPath}: ${err}`);
        return tree;
    }

    entries.sort((a, b) => {
        const aPath = path.join(rootPath, a);
        const bPath = path.join(rootPath, b);
        const aIsDir = fs.statSync(aPath).isDirectory();
        const bIsDir = fs.statSync(bPath).isDirectory();
        if (aIsDir !== bIsDir) {
            return aIsDir ? -1 : 1;
        }
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    const allowedExtensions = new Set(config.TEXT_EXTENSIONS.map(ext => ext.toLowerCase()));
    let count = 0;
    for (const entry of entries) {
        if (excluded.includes(entry)) {
            continue;
        }
        const fullPath = path.join(rootPath, entry);
        if (fs.statSync(fullPath).isDirectory()) {
            const child = buildDirectoryTree(fullPath, limit, excluded);
            tree.children.push(child);
            count++;
        } else {
            const ext = path.extname(entry).toLowerCase();
            if (allowedExtensions.has(ext)) {
                tree.children.push({
                    name: entry,
                    path: fullPath,
                    type: "file"
                });
                count++;
            }
        }
        if (limit > 0 && count >= limit) {
            break;
        }
    }

    return tree;
}
