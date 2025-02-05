import os
import json
import logging
from typing import Set, Optional, Dict, Any

from fastapi import FastAPI, Request, Form, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# For the system "browse folder" dialog (tkinter must be installed)
try:
    import tkinter
    import tkinter.filedialog
    TKINTER_AVAILABLE = True
except ImportError:
    TKINTER_AVAILABLE = False

app = FastAPI()
templates = Jinja2Templates(directory="templates")

CONFIG_FILE = "config.json"

# Default sets (used if config.json not found)
DEFAULT_TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".html", ".css", ".js",
    ".json", ".csv", ".ts", ".java", ".c", ".cpp",
    ".cs", ".php", ".sh"
}
DEFAULT_EXCLUDED_FOLDERS = {
    ".git", "__pycache__", ".vscode", ".idea", ".venv",
    "node_modules", "dist", "build", ".next"
}

# In-memory sets
TEXT_EXTENSIONS: Set[str] = set(DEFAULT_TEXT_EXTENSIONS)
EXCLUDED_FOLDERS: Set[str] = set(DEFAULT_EXCLUDED_FOLDERS)


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
            # Fallback to defaults
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


# Attempt to load config on startup
load_config()


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Renders the main UI from templates/index.html."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/config", response_class=JSONResponse)
def get_config() -> Dict[str, Any]:
    """Return current TEXT_EXTENSIONS and DEFAULT_EXCLUDED_FOLDERS as JSON."""
    return {
        "TEXT_EXTENSIONS": sorted(TEXT_EXTENSIONS),
        "DEFAULT_EXCLUDED_FOLDERS": sorted(EXCLUDED_FOLDERS)
    }


class ConfigUpdate(BaseModel):
    TEXT_EXTENSIONS: list[str]
    DEFAULT_EXCLUDED_FOLDERS: list[str]


@app.post("/config", response_class=JSONResponse)
def update_config(config: ConfigUpdate) -> Dict[str, Any]:
    """Update and save TEXT_EXTENSIONS & DEFAULT_EXCLUDED_FOLDERS from posted JSON."""
    global TEXT_EXTENSIONS, EXCLUDED_FOLDERS
    try:
        TEXT_EXTENSIONS = set(config.TEXT_EXTENSIONS)
        EXCLUDED_FOLDERS = set(config.DEFAULT_EXCLUDED_FOLDERS)
        save_config()
        return {"success": True}
    except Exception as e:
        logger.error("Error updating configuration: %s", e)
        return {"error": str(e)}


@app.get("/browse-folder", response_class=JSONResponse)
def browse_folder() -> Dict[str, str]:
    """
    Opens a system dialog (via tkinter) to select a folder, and returns the selected path.
    Only works if tkinter is installed and a local GUI environment is available.
    """
    if not TKINTER_AVAILABLE:
        return {"folder": "", "error": "tkinter not available on this system"}

    root = tkinter.Tk()
    root.withdraw()
    folder_selected = tkinter.filedialog.askdirectory()
    root.destroy()

    return {"folder": folder_selected}


def build_directory_tree(root_path: str, limit: int = 100, excluded: Optional[Set[str]] = None) -> Dict[str, Any]:
    """
    Recursively build a directory tree up to 'limit' items per folder.
    'excluded' is a set of folder names to skip.
    If limit <= 0, no limit is applied.
    """
    if excluded is None:
        excluded = set()

    if not os.path.isdir(root_path):
        # Not a directory -> return file node
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
        entries = sorted(os.listdir(root_path))
    except Exception as e:
        logger.error("Error listing directory %s: %s", root_path, e)
        return tree

    count = 0
    for entry in entries:
        if entry in excluded:
            continue

        full_path = os.path.join(root_path, entry)
        if os.path.isdir(full_path):
            child = build_directory_tree(full_path, limit=limit, excluded=excluded)
        else:
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


@app.get("/directory-tree", response_class=JSONResponse)
def directory_tree(folder: str, limit: int = 100) -> Dict[str, Any]:
    """
    Return a JSON "tree" of the specified folder,
    respecting the 'limit' items per directory,
    and excluding any folders in EXCLUDED_FOLDERS (from config).
    """
    if not os.path.isdir(folder):
        return {"error": f"'{folder}' is not a valid directory."}

    tree = build_directory_tree(
        folder,
        limit=limit,
        excluded=EXCLUDED_FOLDERS
    )
    return tree


@app.post("/generate-report", response_class=JSONResponse)
def generate_report(files: str = Form(...)) -> Dict[str, Any]:
    """
    Generate a report with the contents of the selected files.
    Only files whose extension is in TEXT_EXTENSIONS are read.
    'files' is a JSON-encoded list of absolute file paths.
    """
    try:
        file_paths = json.loads(files)
    except Exception as e:
        logger.error("Error parsing files JSON: %s", e)
        return {"error": f"Cannot parse 'files' JSON: {e}"}

    report_lines = []
    allowed_extensions = {ext.lower() for ext in TEXT_EXTENSIONS}
    for full_path in file_paths:
        if not os.path.isfile(full_path):
            continue

        filename = os.path.basename(full_path)
        _, ext = os.path.splitext(filename)
        lang = ext.lstrip(".") or "txt"

        if ext.lower() in allowed_extensions:
            try:
                with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception as e:
                content = f"Could not read file: {e}"

            report_lines.append(f"File: {filename}")
            report_lines.append(f"```{lang}\n{content}\n```")
            report_lines.append("")
        else:
            report_lines.append(f"File: {filename}")
            report_lines.append("(Not a recognized text file — skipped.)")
            report_lines.append("")

    full_report = "\n".join(report_lines)
    return {"report": full_report}
