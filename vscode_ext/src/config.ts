export const DEFAULT_TEXT_EXTENSIONS = [
    ".txt", ".md", ".py", ".html", ".css", ".js", ".json", ".csv",
    ".ts", ".java", ".c", ".cpp", ".cs", ".php", ".sh", ".jsx"
];

export const DEFAULT_EXCLUDED_FOLDERS = [
    ".git", "__pycache__", ".vscode", ".idea", ".venv",
    "node_modules", "dist", "build", ".next"
];

export interface Config {
    TEXT_EXTENSIONS: string[];
    DEFAULT_EXCLUDED_FOLDERS: string[];
}

export let config: Config = {
    TEXT_EXTENSIONS: [...DEFAULT_TEXT_EXTENSIONS],
    DEFAULT_EXCLUDED_FOLDERS: [...DEFAULT_EXCLUDED_FOLDERS]
};

export function updateConfig(newConfig: Partial<Config>) {
    if (newConfig.TEXT_EXTENSIONS) {
        config.TEXT_EXTENSIONS = newConfig.TEXT_EXTENSIONS.map(s => s.trim()).filter(s => s);
    }
    if (newConfig.DEFAULT_EXCLUDED_FOLDERS) {
        config.DEFAULT_EXCLUDED_FOLDERS = newConfig.DEFAULT_EXCLUDED_FOLDERS.map(s => s.trim()).filter(s => s);
    }
}
