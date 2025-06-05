import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildDirectoryTree } from './treeBuilder';
import { generateReport } from './reportGenerator';
import { config, updateConfig, DEFAULT_TEXT_EXTENSIONS, DEFAULT_EXCLUDED_FOLDERS } from './config';

// Helper function to load configuration from VS Code settings
function loadConfiguration() {
    const configuration = vscode.workspace.getConfiguration('folder2chat');
    
    // Get stored settings, falling back to defaults from config.ts
    const textExtensions = configuration.get<string[]>('textExtensions', DEFAULT_TEXT_EXTENSIONS);
    const defaultExcludedFolders = configuration.get<string[]>('defaultExcludedFolders', DEFAULT_EXCLUDED_FOLDERS);
    
    // Update the in-memory config for the current session
    updateConfig({
        TEXT_EXTENSIONS: textExtensions,
        DEFAULT_EXCLUDED_FOLDERS: defaultExcludedFolders
    });
}


export function activate(context: vscode.ExtensionContext) {
    // Load config as soon as the extension is activated
    loadConfiguration();

    // Listen for changes to the configuration
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('folder2chat')) {
            loadConfiguration();
        }
    }));
    
    context.subscriptions.push(
        vscode.commands.registerCommand('folder2chat.start', () => {
            const panel = vscode.window.createWebviewPanel(
                'folder2chat',
                'folder2chat',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
                }
            );

            const htmlPath = path.join(context.extensionUri.fsPath, 'media', 'index.html');
            let html = fs.readFileSync(htmlPath, 'utf8');

            const styleUri = panel.webview.asWebviewUri(
                vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css')
            );
            const scriptUri = panel.webview.asWebviewUri(
                vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js')
            );

            html = html.replace(/%STYLE_URI%/g, styleUri.toString())
                       .replace(/%SCRIPT_URI%/g, scriptUri.toString());

            panel.webview.html = html;

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceFolder = workspaceFolders[0].uri.fsPath;
                const limit = 100;
                const tree = buildDirectoryTree(workspaceFolder, limit, config.DEFAULT_EXCLUDED_FOLDERS);
                panel.webview.postMessage({
                    command: 'directoryTreeResponse',
                    tree,
                    folder: workspaceFolder
                });
            }

            panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'browseFolder': {
                        const result = await vscode.window.showOpenDialog({
                            canSelectFolders: true,
                            canSelectFiles: false,
                            canSelectMany: false
                        });
                        if (result && result.length > 0) {
                            panel.webview.postMessage({ command: 'browseFolderResponse', folder: result[0].fsPath });
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
                          const includeTree: boolean = message.includeTree;
                          const rootFolder: string = message.rootFolder;
                          const report = generateReport(files, includeTree, rootFolder);
                          panel.webview.postMessage({ command: 'generateReportResponse', report });
                      }
                      break;
                  }
                    case 'getConfig': {
                        // Ensure the latest config is loaded before sending
                        loadConfiguration();
                        panel.webview.postMessage({
                            command: 'configResponse',
                            config
                        });
                        break;
                    }
                    case 'saveConfig': {
                        const newConfig = message.config;
                        const configuration = vscode.workspace.getConfiguration('folder2chat');

                        // Persist settings globally
                        await configuration.update('textExtensions', newConfig.TEXT_EXTENSIONS, vscode.ConfigurationTarget.Global);
                        await configuration.update('defaultExcludedFolders', newConfig.DEFAULT_EXCLUDED_FOLDERS, vscode.ConfigurationTarget.Global);
                        
                        // The onDidChangeConfiguration listener will handle updating the in-memory 'config'
                        
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