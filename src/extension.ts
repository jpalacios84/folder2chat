import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildDirectoryTree } from './treeBuilder';
import { generateReportBundle } from './reportGenerator';
import { config, updateConfig, DEFAULT_TEXT_EXTENSIONS, DEFAULT_EXCLUDED_FOLDERS } from './config';

function loadConfiguration() {
  const c = vscode.workspace.getConfiguration('folder2chat');
  const textExtensions = c.get<string[]>('textExtensions', DEFAULT_TEXT_EXTENSIONS);
  const defaultExcludedFolders = c.get<string[]>('defaultExcludedFolders', DEFAULT_EXCLUDED_FOLDERS);
  updateConfig({ TEXT_EXTENSIONS: textExtensions, DEFAULT_EXCLUDED_FOLDERS: defaultExcludedFolders });
}

export function activate(context: vscode.ExtensionContext) {
  loadConfiguration();
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('folder2chat')) loadConfiguration();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('folder2chat.start', () => {
    const panel = vscode.window.createWebviewPanel(
      'folder2chat', 'folder2chat', vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
      }
    );

    const htmlPath = path.join(context.extensionUri.fsPath, 'media', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css'));
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js'));
    const cspSource = panel.webview.cspSource;

    html = html
      .replace(/%STYLE_URI%/g, styleUri.toString())
      .replace(/%SCRIPT_URI%/g, scriptUri.toString())
      .replace(/%CSP_SOURCE%/g, cspSource);

    panel.webview.html = html;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    panel.webview.postMessage({ command: 'workspaceState', hasWorkspace: !!(workspaceFolders && workspaceFolders.length) });

    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceFolder = workspaceFolders[0].uri.fsPath;
      const limit = 100;
      const tree = buildDirectoryTree(workspaceFolder, limit, config.DEFAULT_EXCLUDED_FOLDERS);
      panel.webview.postMessage({ command: 'directoryTreeResponse', tree, folder: workspaceFolder });
    }

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'loadTreeOnStartup':
          break;

        case 'browseFolder': {
          const result = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
          panel.webview.postMessage({ command: 'browseFolderResponse', folder: result?.[0]?.fsPath ?? '' });
          break;
        }

        case 'loadTree': {
          const folder: string = message.folder;
          const limit: number = message.limit || 100;
          if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
            panel.webview.postMessage({ command: 'directoryTreeResponse', error: `'${folder}' is not a valid directory.` });
            break;
          }
          const tree = buildDirectoryTree(folder, limit, config.DEFAULT_EXCLUDED_FOLDERS);
          panel.webview.postMessage({ command: 'directoryTreeResponse', tree, folder });
          break;
        }

        case 'generateReport': {
          const { files, includeTree, rootFolder, includeInstructions } = message;

          // Always generate; the bundle handles the "empty" case.
          const { report, stats } = generateReportBundle(
            files ?? [],
            !!includeTree,
            rootFolder,
            !!includeInstructions
          );

          panel.webview.postMessage({
            command: 'generateReportResponse',
            report,
            stats: { files: stats.files, lines: stats.lines, bytes: stats.bytes, tokens: stats.tokens }
          });
          break;
        }

        case 'getConfig': {
          loadConfiguration();
          panel.webview.postMessage({ command: 'configResponse', config });
          break;
        }

        case 'saveConfig': {
          const { config: newConfig, target: targetValue } = message;
          if (targetValue === 'workspace' && (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0)) {
            panel.webview.postMessage({ command: 'saveConfigResponse', success: false, error: 'A folder or workspace must be open to save project settings.' });
            break;
          }
          const target = targetValue === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
          const c = vscode.workspace.getConfiguration('folder2chat');
          try {
            await c.update('textExtensions', newConfig.TEXT_EXTENSIONS, target);
            await c.update('defaultExcludedFolders', newConfig.DEFAULT_EXCLUDED_FOLDERS, target);
            panel.webview.postMessage({ command: 'saveConfigResponse', success: true });
          } catch (err: any) {
            panel.webview.postMessage({ command: 'saveConfigResponse', success: false, error: err?.message || 'Unknown error.' });
          }
          break;
        }

        default:
          console.error('Unknown command:', message);
      }
    });
  }));
}

export function deactivate() {}
