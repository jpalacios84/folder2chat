const vscode = acquireVsCodeApi();

// DOM
const browseFolderBtn = document.getElementById("browseFolderBtn");
const folderPathInput  = document.getElementById("folderPath");
const refreshTreeBtn   = document.getElementById("refreshTreeBtn");
const selectAllBtn     = document.getElementById("selectAllBtn");
const selectNoneBtn    = document.getElementById("selectNoneBtn");
const expandAllBtn     = document.getElementById("expandAllBtn");
const collapseAllBtn   = document.getElementById("collapseAllBtn");
const treeContainer    = document.getElementById("treeContainer");
const generateBtn      = document.getElementById("generateReportBtn");
const includeTreeCb    = document.getElementById("includeTreeCheckbox");
const includeInstructionsCb = document.getElementById("includeInstructionsCheckbox");
const reportOutput     = document.getElementById("reportOutput");
const copyBtn          = document.getElementById("copyReportBtn");
const statsBadge       = document.getElementById("statsBadge");
const spinner          = document.getElementById("spinner");
const extChips         = document.getElementById("extChips");

// Settings
const limitInput = document.getElementById("limitInput");
const textExtensionsInput = document.getElementById("textExtensionsInput");
const defaultExcludedInput = document.getElementById("defaultExcludedInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsAlerts = document.getElementById("settingsAlerts");

// State
let currentTree = null;
let allowedExts = [];
let selectedExtFilters = new Set();
let projectExts = new Set();
let hasWorkspace = false;
// State flags for robust initial loading
let treeDataReceived = false;
let configDataReceived = false;

const setBusy = (busy) => spinner.classList.toggle("d-none", !busy);

function setSettingsMessage(msg, ok = true) {
  settingsAlerts.textContent = msg || "";
  settingsAlerts.className = "small " + (ok ? "text-success" : "text-danger");
}

// Gatekeeper for the initial UI setup. Waits for both the tree and config to arrive.
function performInitialSetup() {
    if (!treeDataReceived || !configDataReceived) return;

    const savedState = vscode.getState();
    // Only apply saved state if it's for the currently loaded folder.
    if (savedState && savedState.folder === folderPathInput.value) {
        renderTree();
        applyState(savedState);
    } else {
        // This is a fresh session or a new folder, so we perform auto-selection.
        selectedExtFilters = new Set(
            [...projectExts].filter(ext => allowedExts.includes(ext))
        );
        
        renderTree(true); // Render the tree with the new filters applied.
        
        // Manually update the chip UI to reflect the new filter state.
        Array.from(extChips.children).forEach(ch => {
            ch.classList.toggle("active", selectedExtFilters.has(ch.textContent));
        });
        
        // Save this calculated initial state.
        saveState();
    }
}


// Messages from extension
window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg.command) {
    case "workspaceState":
      hasWorkspace = !!msg.hasWorkspace;
      if (!hasWorkspace) document.getElementById("saveTargetWorkspace").disabled = true;
      break;

    case "directoryTreeResponse":
      setBusy(false);
      if (msg.error) {
        currentTree = null;
        treeContainer.innerHTML = `<p class="p-2 text-danger small">${msg.error}</p>`;
        return;
      }
      if (msg.folder) folderPathInput.value = msg.folder;
      currentTree = msg.tree;
      projectExts = collectProjectExts(currentTree);
      
      treeDataReceived = true;
      performInitialSetup();
      break;

    case "browseFolderResponse":
      if (msg.folder) {
        folderPathInput.value = msg.folder;
        loadTree();
      }
      break;

    case "generateReportResponse":
      setBusy(false);
      if (msg.error) return;
      reportOutput.value = msg.report || "";
      const s = msg.stats || {};
      statsBadge.textContent = s.files != null
        ? `${s.files} files • ${s.lines ?? "-"} lines • ${s.bytes ?? "-"} bytes • ~${s.tokens ?? "-"} tok`
        : "";
      break;

    case "configResponse":
      const conf = msg.config || {};
      if (conf.TEXT_EXTENSIONS) {
        allowedExts = conf.TEXT_EXTENSIONS;
        textExtensionsInput.value = conf.TEXT_EXTENSIONS.join(", ");
        renderExtChips(conf.TEXT_EXTENSIONS);
      }
      if (conf.DEFAULT_EXCLUDED_FOLDERS) {
        defaultExcludedInput.value = conf.DEFAULT_EXCLUDED_FOLDERS.join(", ");
      }
      
      configDataReceived = true;
      performInitialSetup();
      break;

    case "saveConfigResponse":
      setSettingsMessage(msg.success ? "Settings saved." : (msg.error || "Error saving settings."), !!msg.success);
      break;

    default:
      console.error("Unknown message", msg);
  }
});

// Init
(function init() {
  vscode.postMessage({ command: "getConfig" });
  vscode.postMessage({ command: "loadTreeOnStartup" });
})();

browseFolderBtn.addEventListener("click", () => vscode.postMessage({ command: "browseFolder" }));
refreshTreeBtn.addEventListener("click", loadTree);
function loadTree() {
  const folder = folderPathInput.value.trim();
  if (!folder) return;
  // Reset state for the new folder load
  treeDataReceived = false;
  configDataReceived = false;
  setBusy(true);
  const limitVal = parseInt(limitInput.value, 10) || 100;
  // Request both tree and config again
  vscode.postMessage({ command: "loadTree", folder, limit: limitVal });
  vscode.postMessage({ command: "getConfig" });
}

function collectProjectExts(node) {
  const set = new Set();
  (function walk(n) {
    if (!n) return;
    if (n.type === "file") {
      const dot = n.name.lastIndexOf(".");
      if (dot >= 0) set.add(n.name.slice(dot));
    } else {
      (n.children || []).forEach(walk);
    }
  })(node);
  return set;
}

function renderTree(expandRoot = false) {
  treeContainer.innerHTML = "";
  if (!currentTree) return;
  const ul = document.createElement("ul");
  ul.className = "tree";
  ul.appendChild(renderNode(currentTree));
  treeContainer.appendChild(ul);

  if (expandRoot) {
    const rootLi = treeContainer.querySelector(":scope > ul > li");
    const firstUl = rootLi?.querySelector(":scope > ul");
    if (firstUl) {
      firstUl.style.display = "block";
      const folderEmoji = rootLi.querySelector(":scope > div .folder-emoji");
      if (folderEmoji) folderEmoji.textContent = "📂";
    }
  }
}

function isVisibleByFilters(name) {
  if (selectedExtFilters.size === 0) return true;
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  return selectedExtFilters.has(ext);
}

function renderNode(node) {
  const li = document.createElement("li");
  li.className = "tree-item";
  if (node.type === "directory") {
    li.dataset.path = node.path;
    const row = document.createElement("div");

    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.className = "form-check-input me-1 folder-cb";
    cb.dataset.type = "dir";

    const folderEmoji = document.createElement("span");
    folderEmoji.className = "icon folder-emoji";
    folderEmoji.textContent = "📁";

    const label = document.createElement("span");
    label.className = "folder-label";
    label.textContent = " " + (node.name || "/");

    row.appendChild(cb);
    row.appendChild(folderEmoji);
    row.appendChild(label);
    li.appendChild(row);

    const sub = document.createElement("ul");
    sub.style.display = "none";

    (node.children || []).forEach(child => sub.appendChild(renderNode(child)));
    li.appendChild(sub);

    const toggle = () => {
      const open = sub.style.display !== "none";
      sub.style.display = open ? "none" : "block";
      folderEmoji.textContent = open ? "📁" : "📂";
      saveState();
    };
    label.addEventListener("click", toggle);
    folderEmoji.addEventListener("click", toggle);

    cb.addEventListener("change", () => {
      setChildrenSelection(sub, cb.checked);
      updateAncestors(li);
      saveState();
    });

  } else {
    if (!isVisibleByFilters(node.name)) li.style.display = "none";

    const row = document.createElement("div");

    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.className = "form-check-input me-1";
    cb.dataset.type = "file"; cb.dataset.path = node.path;

    const fileEmoji = document.createElement("span");
    fileEmoji.className = "icon";
    fileEmoji.textContent = "📄";

    const label = document.createElement("label");
    label.textContent = " " + node.name;

    row.appendChild(cb);
    row.appendChild(fileEmoji);
    row.appendChild(label);
    li.appendChild(row);

    // Clicking the file name (and icon) toggles selection
    const toggleFileSelection = () => {
      cb.checked = !cb.checked;
      updateAncestors(li);
      saveState();
    };
    label.addEventListener("click", toggleFileSelection);
    fileEmoji.addEventListener("click", toggleFileSelection);

    cb.addEventListener("change", () => { updateAncestors(li); saveState(); });
  }
  return li;
}
function setChildrenSelection(ul, checked) {
  ul.querySelectorAll('input[type="checkbox"]').forEach(i => { i.checked = checked; i.indeterminate = false; });
}
function updateAncestors(li) {
  let parent = li.parentElement?.closest("li");
  while (parent) {
    const cb = parent.querySelector(":scope > div > input.folder-cb");
    if (cb) {
      const inputs = parent.querySelectorAll(":scope > ul > li:not([style*='display: none']) input[type='checkbox']");
      if (inputs.length === 0) {
        cb.checked = false;
        cb.indeterminate = false;
        continue;
      }
      const checkedCount = Array.from(inputs).filter(i => i.checked).length;
      cb.checked = checkedCount === inputs.length;
      cb.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
    }
    parent = parent.parentElement?.closest("li");
  }
}

selectAllBtn.addEventListener("click", () => {
  treeContainer.querySelectorAll("input[type='checkbox']").forEach(i => { i.checked = true; i.indeterminate = false; });
  saveState();
});
selectNoneBtn.addEventListener("click", () => {
  treeContainer.querySelectorAll("input[type='checkbox']").forEach(i => { i.checked = false; i.indeterminate = false; });
  saveState();
});
expandAllBtn.addEventListener("click", () => {
  treeContainer.querySelectorAll("li > ul").forEach(ul => ul.style.display = "block");
  treeContainer.querySelectorAll(".folder-emoji").forEach(el => el.textContent = "📂");
  saveState();
});
collapseAllBtn.addEventListener("click", () => {
  treeContainer.querySelectorAll("li > ul").forEach(ul => ul.style.display = "none");
  treeContainer.querySelectorAll(".folder-emoji").forEach(el => el.textContent = "📁");
  saveState();
});

function renderExtChips(exts) {
  extChips.innerHTML = "";
  exts.forEach(ext => {
    const b = document.createElement("span");
    b.className = "chip"; b.textContent = ext;
    b.addEventListener("click", () => {
      if (selectedExtFilters.has(ext)) {
        selectedExtFilters.delete(ext);
      } else {
        selectedExtFilters.add(ext);
      }
      const state = captureState();
      renderTree();
      applyState(state);
      saveState();
    });
    extChips.appendChild(b);
  });
}

generateBtn.addEventListener("click", () => {
  const files = Array.from(treeContainer.querySelectorAll("input[type='checkbox'][data-type='file']:checked"))
    .map(cb => cb.dataset.path);
  // THIS IS THE KEY CHANGE: The 'if (files.length === 0) return;' check is now removed.
  const rootFolder = folderPathInput.value.trim();
  const includeTree = !!includeTreeCb.checked;
  const includeInstructions = !!includeInstructionsCb.checked;
  setBusy(true);
  vscode.postMessage({ command: "generateReport", files, rootFolder, includeTree, includeInstructions });
});

copyBtn.addEventListener("click", async () => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(reportOutput.value || "");
    else { reportOutput.select(); document.execCommand("copy"); }
  } catch {}
});

saveSettingsBtn.addEventListener("click", () => {
  const extArr = textExtensionsInput.value.trim()
    ? textExtensionsInput.value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const defExcArr = defaultExcludedInput.value.trim()
    ? defaultExcludedInput.value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const target = document.querySelector('input[name="saveTarget"]:checked').value;
  setSettingsMessage("");
  vscode.postMessage({ command: "saveConfig", config: { TEXT_EXTENSIONS: extArr, DEFAULT_EXCLUDED_FOLDERS: defExcArr }, target });
});

document.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
  if (e.key.toLowerCase() === "a") { e.preventDefault(); selectAllBtn.click(); }
  if (e.key.toLowerCase() === "n") { e.preventDefault(); selectNoneBtn.click(); }
  if (e.key.toLowerCase() === "g") { e.preventDefault(); generateBtn.click(); }
});

function captureState() {
  const checkedFiles = Array.from(treeContainer.querySelectorAll("input[type='checkbox'][data-type='file']:checked"))
    .map(cb => cb.dataset.path);
  const expandedFolders = Array.from(treeContainer.querySelectorAll("li[data-path]"))
    .filter(li => li.querySelector(":scope > ul")?.style.display === "block")
    .map(li => li.dataset.path);

  return {
    folder: folderPathInput.value,
    includeTree: includeTreeCb.checked,
    includeInstructions: includeInstructionsCb.checked,
    chips: Array.from(selectedExtFilters),
    checkedFiles,
    expandedFolders,
  };
}

function applyState(state) {
  if (!state) return;
  folderPathInput.value = state.folder || folderPathInput.value;
  includeTreeCb.checked = !!state.includeTree;
  includeInstructionsCb.checked = state.includeInstructions !== false;
  selectedExtFilters = new Set(state.chips || []);
  Array.from(extChips.children).forEach(ch => ch.classList.toggle("active", selectedExtFilters.has(ch.textContent)));
  if (state.checkedFiles?.length) {
    const map = new Set(state.checkedFiles);
    treeContainer.querySelectorAll("input[type='checkbox'][data-type='file']").forEach(cb => { if (map.has(cb.dataset.path)) cb.checked = true; });
    treeContainer.querySelectorAll("li[data-path]").forEach(li => updateAncestors(li));
  }
  if (state.expandedFolders?.length) {
    const expandedSet = new Set(state.expandedFolders);
    treeContainer.querySelectorAll("li[data-path]").forEach(li => {
      if (expandedSet.has(li.dataset.path)) {
        const sub = li.querySelector(":scope > ul");
        const folderEmoji = li.querySelector(":scope > div .folder-emoji");
        if (sub) sub.style.display = "block";
        if (folderEmoji) folderEmoji.textContent = "📂";
      }
    });
  }
}

function saveState() { vscode.setState(captureState()); }
function restoreState() { applyState(vscode.getState()); }
