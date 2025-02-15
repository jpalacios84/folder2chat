import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildDirectoryTree } from './treeBuilder';
import { generateReport } from './reportGenerator';
import { config, updateConfig } from './config';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('folder2chat.start', () => {
            const panel = vscode.window.createWebviewPanel(
                'folder2chat',
                'folder2chat',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,  // <-- This preserves state when the webview is hidden
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
                }
            );

            // Load the HTML content from media/index.html
            const htmlPath = path.join(context.extensionUri.fsPath, 'media', 'index.html');
            let html = fs.readFileSync(htmlPath, 'utf8');

            // Get the URIs for your local assets using joinPath
            const styleUri = panel.webview.asWebviewUri(
                vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css')
            );
            const scriptUri = panel.webview.asWebviewUri(
                vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js')
            );

            // Replace the placeholders in the HTML with the proper URIs.
            html = html.replace(/%STYLE_URI%/g, styleUri.toString())
                       .replace(/%SCRIPT_URI%/g, scriptUri.toString());

            panel.webview.html = html;

            // Optional: Auto-load the first workspace folder if available.
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceFolder = workspaceFolders[0].uri.fsPath;
                const limit = 100;
                // Build the tree for the file explorer (this tree still shows the full hierarchy)
                const tree = buildDirectoryTree(workspaceFolder, limit, config.DEFAULT_EXCLUDED_FOLDERS);
                panel.webview.postMessage({
                    command: 'directoryTreeResponse',
                    tree,
                    folder: workspaceFolder
                });
            }

            // Handle messages from the webview.
            panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'browseFolder': {
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
                            // Rebuild the tree for the file explorer view.
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
                          // Get the checkbox value and the selected root folder from the message.
                          const includeTree: boolean = message.includeTree;
                          const rootFolder: string = message.rootFolder;
                          const report = generateReport(files, includeTree, rootFolder);
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
                        updateConfig({
                            TEXT_EXTENSIONS: newConfig.TEXT_EXTENSIONS,
                            DEFAULT_EXCLUDED_FOLDERS: newConfig.DEFAULT_EXCLUDED_FOLDERS
                        });
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

export function deactivate() {}
