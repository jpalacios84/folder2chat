import os
import json
from fastapi import APIRouter, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from . import utils

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Render the main UI template with the default folder."""
    default_folder = os.getcwd()  # or any directory you want as default
    return templates.TemplateResponse("index.html", {"request": request, "default_folder": default_folder})

@router.get("/config", response_class=JSONResponse)
def get_config():
    """Return the current configuration."""
    return {
        "TEXT_EXTENSIONS": sorted(utils.TEXT_EXTENSIONS),
        "DEFAULT_EXCLUDED_FOLDERS": sorted(utils.EXCLUDED_FOLDERS)
    }

class ConfigUpdate(BaseModel):
    TEXT_EXTENSIONS: list[str]
    DEFAULT_EXCLUDED_FOLDERS: list[str]

@router.post("/config", response_class=JSONResponse)
def update_config(config: ConfigUpdate):
    """Update and save the configuration."""
    try:
        utils.TEXT_EXTENSIONS = set(config.TEXT_EXTENSIONS)
        utils.EXCLUDED_FOLDERS = set(config.DEFAULT_EXCLUDED_FOLDERS)
        utils.save_config()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@router.get("/browse-folder", response_class=JSONResponse)
def browse_folder():
    """
    Open a system dialog (via tkinter) to select a folder.
    Note: This only works if tkinter is installed and a GUI is available.
    """
    if not utils.TKINTER_AVAILABLE:
        return {"folder": "", "error": "tkinter not available on this system"}
    import tkinter
    import tkinter.filedialog
    root = tkinter.Tk()
    root.withdraw()
    folder_selected = tkinter.filedialog.askdirectory()
    root.destroy()
    return {"folder": folder_selected}

@router.get("/directory-tree", response_class=JSONResponse)
def directory_tree(folder: str, limit: int = 100):
    """
    Return a JSON tree of the specified folder, applying the folder limit and exclusions.
    """
    if not os.path.isdir(folder):
        return {"error": f"'{folder}' is not a valid directory."}
    tree = utils.build_directory_tree(folder, limit=limit, excluded=utils.EXCLUDED_FOLDERS)
    return tree

@router.post("/generate-report", response_class=JSONResponse)
def generate_report(
    files: str = Form(...),
    root: str = Form(...),
    include_tree: str = Form(...)
):
    """
    Generate a report with the contents of the selected files.
    Each file is shown with its relative path (from the chosen root).
    If 'include_tree' is true, prepend a directory tree (similar to Linux's `tree`) to the report.
    """
    try:
        file_paths = json.loads(files)
    except Exception as e:
        return {"error": f"Cannot parse 'files' JSON: {e}"}

    include_tree_flag = include_tree.lower() == "true"
    report_lines = []

    if include_tree_flag and os.path.isdir(root):
        tree_text = utils.generate_tree_text(root)
        if tree_text:
            report_lines.append("Directory Tree:")
            report_lines.append("```")
            report_lines.append(tree_text)
            report_lines.append("```")
            report_lines.append("")

    for full_path in file_paths:
        if not os.path.isfile(full_path):
            continue

        # Get the relative path (omit the root folder itself)
        relative_path = os.path.relpath(full_path, root)
        _, ext = os.path.splitext(full_path)
        lang = ext.lstrip(".") or "txt"

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            content = f"Could not read file: {e}"

        report_lines.append(f"File: {relative_path}")
        report_lines.append(f"```{lang}\n{content.strip()}\n```")
        report_lines.append("")

    full_report = "\n".join(report_lines)
    return {"report": full_report}
