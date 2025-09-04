// Acquire the VS Code API object.
const vscode = acquireVsCodeApi();

// DOM elements
const browseFolderBtn = document.getElementById("browseFolderBtn");
const folderPathInput = document.getElementById("folderPath");
const treeContainer = document.getElementById("treeContainer");
const refreshTreeBtn = document.getElementById("refreshTreeBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const generateReportBtn = document.getElementById("generateReportBtn");
const reportOutput = document.getElementById("reportOutput");
const copyReportBtn = document.getElementById("copyReportBtn");
const reportHeadline = document.getElementById("reportHeadline");
const includeTreeCheckbox = document.getElementById("includeTreeCheckbox");

// Settings fields
const limitInput = document.getElementById("limitInput");
const textExtensionsInput = document.getElementById("textExtensionsInput");
const defaultExcludedInput = document.getElementById("defaultExcludedInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

/**
 * Displays a Bootstrap alert message in a specified container.
 */
function showAlert(message, type, containerId) {
  const alertContainer = document.getElementById(containerId);
  if (!alertContainer) return;
  alertContainer.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}

// Listen for messages from the extension host.
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'browseFolderResponse': {
      if (message.folder) {
        folderPathInput.value = message.folder;
        loadTree();
      } else {
        showAlert("No folder selected.", "info", "reportAlerts");
      }
      break;
    }
    case 'directoryTreeResponse': {
      if (message.error) {
        showAlert(message.error, "danger", "reportAlerts");
        treeContainer.innerHTML = "";
      } else {
        if (message.folder) {
          folderPathInput.value = message.folder;
        }
        treeContainer.innerHTML = "";
        const rootUl = renderTree(message.tree);
        treeContainer.appendChild(rootUl);
        showAlert("Tree loaded successfully.", "info", "reportAlerts");
      }
      break;
    }
    case 'generateReportResponse': {
      if (message.error) {
        showAlert("Error generating report: " + message.error, "danger", "reportAlerts");
      } else if (message.report) {
        reportOutput.value = message.report;
        showAlert("Report generated successfully.", "success", "reportAlerts");
        reportHeadline.scrollIntoView({ behavior: "smooth" });
      }
      break;
    }
    case 'configResponse': {
      const conf = message.config;
      if (conf && conf.TEXT_EXTENSIONS) {
        textExtensionsInput.value = conf.TEXT_EXTENSIONS.join(", ");
      }
      if (conf && conf.DEFAULT_EXCLUDED_FOLDERS) {
        defaultExcludedInput.value = conf.DEFAULT_EXCLUDED_FOLDERS.join(", ");
      }
      break;
    }
    case 'saveConfigResponse': {
      if (message.success) {
        showAlert("Settings saved successfully!", "success", "settingsAlerts");
      } else {
        const errorMessage = message.error || "Error saving config.";
        showAlert(errorMessage, "danger", "settingsAlerts");
      }
      break;
    }
    case 'workspaceState': {
      const workspaceRadio = document.getElementById('saveTargetWorkspace');
      const workspaceLabel = document.querySelector('label[for="saveTargetWorkspace"]');
      if (workspaceRadio && workspaceLabel) {
          workspaceRadio.disabled = !message.hasWorkspace;
          if (!message.hasWorkspace) {
              document.getElementById('saveTargetGlobal').checked = true;
              workspaceLabel.title = "A folder or workspace must be open to save project-specific settings.";
              workspaceRadio.parentElement.style.opacity = '0.6';
              workspaceRadio.parentElement.style.cursor = 'not-allowed';
          } else {
              workspaceLabel.title = "";
              workspaceRadio.parentElement.style.opacity = '1';
              workspaceRadio.parentElement.style.cursor = 'default';
          }
      }
      break;
    }
    default:
      console.error("Unknown message from extension:", message);
  }
});

// Browse folder button
browseFolderBtn.addEventListener("click", () => {
  vscode.postMessage({ command: 'browseFolder' });
});

// Load (refresh) the tree
function loadTree() {
  const folder = folderPathInput.value.trim();
  if (!folder) {
    showAlert("Please select or enter a folder path.", "warning", "reportAlerts");
    return;
  }
  const limitVal = parseInt(limitInput.value, 10) || 100;
  vscode.postMessage({ command: 'loadTree', folder, limit: limitVal });
}

refreshTreeBtn.addEventListener("click", loadTree);

selectAllBtn.addEventListener("click", () => {
  const allCheckboxes = treeContainer.querySelectorAll('input[type="checkbox"]');
  allCheckboxes.forEach(cb => {
    cb.checked = true;
  });
});

// Generate Report
generateReportBtn.addEventListener("click", () => {
  const checkedBoxes = treeContainer.querySelectorAll('input[type="checkbox"]:checked');
  const filePaths = [];
  checkedBoxes.forEach(cb => {
    if (cb.dataset.type === "file") {
      filePaths.push(cb.dataset.path);
    }
  });
  if (filePaths.length === 0) {
    showAlert("No files selected.", "warning", "reportAlerts");
    return;
  }
  // Get the root folder (from the folderPath input) and checkbox value.
  const rootFolder = folderPathInput.value.trim();
  const includeTree = includeTreeCheckbox && includeTreeCheckbox.checked;
  vscode.postMessage({ command: 'generateReport', files: filePaths, rootFolder, includeTree });
});

// Render the directory tree recursively with collapsible subfolders
function renderTree(node) {
  const ul = document.createElement("ul");
  ul.className = "tree";
  ul.appendChild(renderNode(node));
  return ul;
}

function renderNode(node) {
  const li = document.createElement("li");
  const labelDiv = document.createElement("div");

  if (node.type === "directory") {
    const labelSpan = document.createElement("span");
    labelSpan.classList.add("folder-label");

    if (Array.isArray(node.children) && node.children.length > 0) {
      const toggleIcon = document.createElement("span");
      toggleIcon.classList.add("folder-icon");
      toggleIcon.textContent = "►";
      labelSpan.appendChild(toggleIcon);

      const folderText = document.createElement("span");
      folderText.textContent = " " + node.name;
      labelSpan.appendChild(folderText);
      labelDiv.appendChild(labelSpan);

      const subUl = document.createElement("ul");
      subUl.style.display = "none";
      node.children.forEach(child => {
        subUl.appendChild(renderNode(child));
      });
      li.appendChild(labelDiv);
      li.appendChild(subUl);

      labelSpan.addEventListener("click", () => {
        if (subUl.style.display === "none") {
          subUl.style.display = "block";
          toggleIcon.textContent = "▼";
        } else {
          subUl.style.display = "none";
          toggleIcon.textContent = "►";
        }
      });
    } else {
      labelSpan.textContent = "📁 " + node.name;
      labelDiv.appendChild(labelSpan);
      li.appendChild(labelDiv);
    }
  } else {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.type = node.type;
    checkbox.dataset.path = node.path;
    const checkboxId = "checkbox-" + Math.random().toString(36).substr(2, 9);
    checkbox.id = checkboxId;

    const label = document.createElement("label");
    label.setAttribute("for", checkboxId);
    label.innerHTML = " 📄 " + node.name;

    labelDiv.appendChild(checkbox);
    labelDiv.appendChild(label);
    li.appendChild(labelDiv);
  }
  return li;
}

// Copy to clipboard
copyReportBtn.addEventListener("click", () => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(reportOutput.value).then(() => {
      showAlert("Copied report to clipboard.", "info", "reportAlerts");
    }).catch(() => {
      showAlert("Failed to copy report.", "danger", "reportAlerts");
    });
  } else {
    reportOutput.select();
    document.execCommand("copy");
    showAlert("Copied report to clipboard.", "info", "reportAlerts");
  }
});

// Load config on startup
function loadConfig() {
  vscode.postMessage({ command: 'getConfig' });
}
loadConfig();

// Save settings button
saveSettingsBtn.addEventListener("click", () => {
  const extStr = textExtensionsInput.value.trim();
  const defExcStr = defaultExcludedInput.value.trim();
  const extArr = extStr ? extStr.split(",").map(s => s.trim()).filter(s => s) : [];
  const defExcArr = defExcStr ? defExcStr.split(",").map(s => s.trim()).filter(s => s) : [];
  const saveTarget = document.querySelector('input[name="saveTarget"]:checked').value;
  vscode.postMessage({ command: 'saveConfig', config: { TEXT_EXTENSIONS: extArr, DEFAULT_EXCLUDED_FOLDERS: defExcArr }, target: saveTarget });
});