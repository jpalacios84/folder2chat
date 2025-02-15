import os
import json
import logging
from typing import Set, Optional, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CONFIG_FILE = "config.json"

# Default configuration values
DEFAULT_TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".html", ".css", ".js",
    ".json", ".csv", ".ts", ".java", ".c", ".cpp",
    ".cs", ".php", ".sh", "jsx"
}
DEFAULT_EXCLUDED_FOLDERS = {
    ".git", "__pycache__", ".vscode", ".idea", ".venv",
    "node_modules", "dist", "build", ".next"
}

# Global in-memory configuration
TEXT_EXTENSIONS: Set[str] = set(DEFAULT_TEXT_EXTENSIONS)
EXCLUDED_FOLDERS: Set[str] = set(DEFAULT_EXCLUDED_FOLDERS)

# Check for tkinter availability (used by the browse folder endpoint)
try:
    import tkinter
    import tkinter.filedialog
    TKINTER_AVAILABLE = True
except ImportError:
    TKINTER_AVAILABLE = False

def load_config() -> None:
    global TEXT_EXTENSIONS, EXCLUDED_FOLDERS
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            TEXT_EXTENSIONS = set(data.get("TEXT_EXTENSIONS", []))
            EXCLUDED_FOLDERS = set(data.get("DEFAULT_EXCLUDED_FOLDERS", []))
            logger.info("Configuration loaded from %s", CONFIG_FILE)
        except Exception as e:
            logger.error("Error loading %s: %s", CONFIG_FILE, e)
            TEXT_EXTENSIONS = set(DEFAULT_TEXT_EXTENSIONS)
            EXCLUDED_FOLDERS = set(DEFAULT_EXCLUDED_FOLDERS)
    else:
        TEXT_EXTENSIONS = set(DEFAULT_TEXT_EXTENSIONS)
        EXCLUDED_FOLDERS = set(DEFAULT_EXCLUDED_FOLDERS)
        logger.info("Using default configuration")

def save_config() -> None:
    data = {
        "TEXT_EXTENSIONS": sorted(TEXT_EXTENSIONS),
        "DEFAULT_EXCLUDED_FOLDERS": sorted(EXCLUDED_FOLDERS)
    }
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Configuration saved to %s", CONFIG_FILE)
    except Exception as e:
        logger.error("Error saving configuration: %s", e)

# Load configuration when this module is imported.
load_config()

def build_directory_tree(root_path: str, limit: int = 100, excluded: Optional[Set[str]] = None) -> Dict[str, Any]:
    if excluded is None:
        excluded = set()

    if not os.path.isdir(root_path):
        return {
            "name": os.path.basename(root_path),
            "path": root_path,
            "type": "file"
        }

    tree = {
        "name": os.path.basename(root_path) or root_path,
        "path": root_path,
        "type": "directory",
        "children": []
    }

    try:
        entries = os.listdir(root_path)
    except Exception as e:
        logger.error("Error listing directory %s: %s", root_path, e)
        return tree

    entries.sort(key=lambda x: (not os.path.isdir(os.path.join(root_path, x)), x.lower()))
    count = 0
    for entry in entries:
        if entry in excluded:
            continue

        full_path = os.path.join(root_path, entry)
        if os.path.isdir(full_path):
            child = build_directory_tree(full_path, limit=limit, excluded=excluded)
            tree["children"].append(child)
            count += 1
        else:
            _, ext = os.path.splitext(entry)
            if ext.lower() in TEXT_EXTENSIONS:
                child = {
                    "name": entry,
                    "path": full_path,
                    "type": "file"
                }
                tree["children"].append(child)
                count += 1

        if limit > 0 and count >= limit:
            break

    return tree

def generate_tree_text(root_path: str, prefix: str = "") -> str:
    """
    Recursively generate a text representation of the directory tree (similar to Linux 'tree'),
    but without including the root folder itself. Folders listed in EXCLUDED_FOLDERS will be skipped.
    """
    lines = []
    try:
        entries = sorted(os.listdir(root_path))
    except Exception as e:
        logger.error("Error listing directory %s: %s", root_path, e)
        return ""
    
    # Filter out entries that are in the excluded folders
    filtered_entries = [entry for entry in entries if entry not in EXCLUDED_FOLDERS]
    
    for i, entry in enumerate(filtered_entries):
        full_path = os.path.join(root_path, entry)
        connector = "└──" if i == len(filtered_entries) - 1 else "├──"
        lines.append(prefix + connector + " " + entry)
        if os.path.isdir(full_path):
            extension = "    " if i == len(filtered_entries) - 1 else "│   "
            subtree = generate_tree_text(full_path, prefix + extension)
            if subtree:
                lines.extend(subtree.split("\n"))
    return "\n".join(lines)