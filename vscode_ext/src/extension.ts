import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Default configuration values
const DEFAULT_TEXT_EXTENSIONS = [
    ".txt", ".md", ".py", ".html", ".css", ".js", ".json", ".csv",
    ".ts", ".java", ".c", ".cpp", ".cs", ".php", ".sh"
];
const DEFAULT_EXCLUDED_FOLDERS = [
    ".git", "__pycache__", ".vscode", ".idea", ".venv",
    "node_modules", "dist", "build", ".next"
];

// In-memory config
let config = {
    TEXT_EXTENSIONS: [...DEFAULT_TEXT_EXTENSIONS],
    DEFAULT_EXCLUDED_FOLDERS: [...DEFAULT_EXCLUDED_FOLDERS]
};

/**
 * Recursively builds a directory tree.
 * 
 * This version filters out any files whose extensions
 * are not in config.TEXT_EXTENSIONS.
 */
function buildDirectoryTree(rootPath: string, limit: number = 100, excluded: string[] = []): any {
    // If it's not a directory, just return a file node
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

    // Sort: directories first, then files (alphabetically, case-insensitive)
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

    // Convert configured extensions to lowercase for consistency
    const allowedExtensions = new Set(config.TEXT_EXTENSIONS.map(ext => ext.toLowerCase()));

    let count = 0;
    for (const entry of entries) {
        if (excluded.includes(entry)) {
            // Skip explicitly excluded folders/files
            continue;
        }

        const fullPath = path.join(rootPath, entry);
        if (fs.statSync(fullPath).isDirectory()) {
            // Build subtree for directories
            const child = buildDirectoryTree(fullPath, limit, excluded);
            tree.children.push(child);
            count++;
        } else {
            // For files, filter by allowed extension
            const ext = path.extname(entry).toLowerCase();
            if (allowedExtensions.has(ext)) {
                const child = {
                    name: entry,
                    path: fullPath,
                    type: "file"
                };
                tree.children.push(child);
                count++;
            }
        }

        if (limit > 0 && count >= limit) {
            break;
        }
    }

    return tree;
}

/**
 * Generate a report from a list of file paths.
 * This version no longer checks the file extension:
 * all files passed in will be read.
 */
function generateReport(filePaths: string[]): string {
    const reportLines: string[] = [];

    for (const fullPath of filePaths) {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            continue;
        }

        const filename = path.basename(fullPath);
        const ext = path.extname(filename).toLowerCase();
        const lang = ext.substring(1) || "txt";

        let content = "";
        try {
            content = fs.readFileSync(fullPath, { encoding: 'utf8' });
        } catch (e) {
            content = `Could not read file: ${e}`;
        }

        reportLines.push(`File: ${filename}`);
        reportLines.push(`\`\`\`${lang}`);
        reportLines.push(content.trim());
        reportLines.push("```");
        reportLines.push("");
    }

    return reportLines.join("\n");
}

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('folder2chat.start', () => {
            const panel = vscode.window.createWebviewPanel(
                'folder2chat', // internal identifier
                'Folder2Chat', // title
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
                }
            );

            // Load the HTML content from media/index.html
            const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
            let html = fs.readFileSync(htmlPath, 'utf8');
            panel.webview.html = html;

            // Once the Webview is open, automatically load the first workspace folder if available
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceFolder = workspaceFolders[0].uri.fsPath;
                const limit = 100; // Or read from config, if you prefer
                const tree = buildDirectoryTree(workspaceFolder, limit, config.DEFAULT_EXCLUDED_FOLDERS);
                // Send the folder and tree to the Webview
                panel.webview.postMessage({
                    command: 'directoryTreeResponse',
                    tree,
                    folder: workspaceFolder
                });
            }

            // Handle messages from the Webview
            panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'browseFolder': {
                        // Show folder open dialog
                        const result = await vscode.window.showOpenDialog({
                            canSelectFolders: true,
                            canSelectFiles: false,
                            canSelectMany: false
                        });
                        if (result && result.length > 0) {
                            const folder = result[0].fsPath;
                            panel.webview.postMessage({ command: 'browseFolderResponse', folder });
                        } else {
                            panel.webview.postMessage({ command: 'browseFolderResponse', folder: '' });
                        }
                        break;
                    }

                    case 'loadTree': {
                        const folder: string = message.folder;
                        const limit: number = message.limit || 100;
                        if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
                            panel.webview.postMessage({
                                command: 'directoryTreeResponse',
                                error: `'${folder}' is not a valid directory.`
                            });
                        } else {
                            const tree = buildDirectoryTree(folder, limit, config.DEFAULT_EXCLUDED_FOLDERS);
                            panel.webview.postMessage({ command: 'directoryTreeResponse', tree });
                        }
                        break;
                    }

                    case 'generateReport': {
                        const files: string[] = message.files;
                        if (!files || files.length === 0) {
                            panel.webview.postMessage({
                                command: 'generateReportResponse',
                                error: "No files selected."
                            });
                        } else {
                            const report = generateReport(files);
                            panel.webview.postMessage({ command: 'generateReportResponse', report });
                        }
                        break;
                    }

                    case 'getConfig': {
                        panel.webview.postMessage({
                            command: 'configResponse',
                            config
                        });
                        break;
                    }

                    case 'saveConfig': {
                        const newConfig = message.config;
                        // Update in-memory config
                        config.TEXT_EXTENSIONS = Array.isArray(newConfig.TEXT_EXTENSIONS)
                            ? newConfig.TEXT_EXTENSIONS.map((s: string) => s.trim()).filter((s: string) => s)
                            : config.TEXT_EXTENSIONS;
                        config.DEFAULT_EXCLUDED_FOLDERS = Array.isArray(newConfig.DEFAULT_EXCLUDED_FOLDERS)
                            ? newConfig.DEFAULT_EXCLUDED_FOLDERS.map((s: string) => s.trim()).filter((s: string) => s)
                            : config.DEFAULT_EXCLUDED_FOLDERS;
                        panel.webview.postMessage({ command: 'saveConfigResponse', success: true });
                        break;
                    }

                    default:
                        console.error("Unknown command: ", message);
                }
            });
        })
    );
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate() {}
