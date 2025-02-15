/**
 * Displays a Bootstrap alert message in a specified container.
 * @param {string} message - The message text to display
 * @param {string} type - The type of Bootstrap alert (e.g., "success", "danger", "info", "warning")
 * @param {string} containerId - The DOM id of the alert container
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
  
  // DOM elements
  const browseFolderBtn = document.getElementById("browseFolderBtn");
  const folderPathInput = document.getElementById("folderPath");
  const treeContainer = document.getElementById("treeContainer");
  const refreshTreeBtn = document.getElementById("refreshTreeBtn");
  const generateReportBtn = document.getElementById("generateReportBtn");
  const reportOutput = document.getElementById("reportOutput");
  const copyReportBtn = document.getElementById("copyReportBtn");
  const reportHeadline = document.getElementById("reportHeadline");
  
  // Settings fields
  const limitInput = document.getElementById("limitInput");
  const textExtensionsInput = document.getElementById("textExtensionsInput");
  const defaultExcludedInput = document.getElementById("defaultExcludedInput");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  
  // Copy to clipboard using modern API with fallback
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
  
  // Load (refresh) the tree
  async function loadTree() {
    const folder = folderPathInput.value.trim();
    if (!folder) {
      showAlert("Please select or enter a folder path.", "warning", "reportAlerts");
      return;
    }
    const limitVal = parseInt(limitInput.value, 10) || 100;
    const params = new URLSearchParams({
      folder,
      limit: limitVal.toString()
    });
  
    try {
      const res = await fetch(`/directory-tree?${params.toString()}`);
      const data = await res.json();
      if (data.error) {
        showAlert(data.error, "danger", "reportAlerts");
        return;
      }
      treeContainer.innerHTML = "";
      const rootUl = renderTree(data);
      treeContainer.appendChild(rootUl);
      showAlert("Tree loaded successfully.", "info", "reportAlerts");
    } catch (err) {
      console.error(err);
      showAlert("Error loading tree. Check console for details.", "danger", "reportAlerts");
    }
  }
  
  // Browse folder -> auto load tree
  browseFolderBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/browse-folder");
      const data = await res.json();
      if (data.error) {
        showAlert("Error: " + data.error, "danger", "reportAlerts");
      } else if (data.folder) {
        folderPathInput.value = data.folder;
        loadTree();
      } else {
        showAlert("No folder selected.", "info", "reportAlerts");
      }
    } catch (err) {
      console.error(err);
      showAlert("Could not open folder dialog. Check console for details.", "danger", "reportAlerts");
    }
  });
  
  // "Refresh Tree" button
  refreshTreeBtn.addEventListener("click", loadTree);
  
  // Generate Report
  generateReportBtn.addEventListener("click", async () => {
    const checkedBoxes = treeContainer.querySelectorAll('input[type="checkbox"]:checked');
    const filePaths = [];
    checkedBoxes.forEach((cb) => {
      if (cb.dataset.type === "file") {
        filePaths.push(cb.dataset.path);
      }
    });
    if (filePaths.length === 0) {
      showAlert("No files selected.", "warning", "reportAlerts");
      return;
    }
  
    // Get the "Include tree" checkbox value and the selected folder (root)
    const includeTreeCheckbox = document.getElementById("includeTreeCheckbox");
    const includeTree = includeTreeCheckbox.checked;
    const formData = new FormData();
    formData.append("files", JSON.stringify(filePaths));
    formData.append("root", folderPathInput.value.trim());
    formData.append("include_tree", includeTree ? "true" : "false");
  
    try {
      const res = await fetch("/generate-report", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.error) {
        showAlert("Error generating report: " + data.error, "danger", "reportAlerts");
        return;
      }
      if (data.report) {
        reportOutput.value = data.report;
        showAlert("Report generated successfully.", "success", "reportAlerts");
        reportHeadline.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      console.error(err);
      showAlert("Error generating report. Check console for details.", "danger", "reportAlerts");
    }
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
  
      // Toggle icon: ► when collapsed, ▼ when expanded.
      const toggleIcon = document.createElement("span");
      toggleIcon.classList.add("folder-icon");
      toggleIcon.textContent = "►";
      labelSpan.appendChild(toggleIcon);
  
      const folderText = document.createElement("span");
      folderText.textContent = " " + node.name;
      labelSpan.appendChild(folderText);
  
      labelDiv.appendChild(labelSpan);
  
      if (Array.isArray(node.children) && node.children.length > 0) {
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
  
  // Load / Save config
  async function loadConfig() {
    try {
      const res = await fetch("/config");
      const data = await res.json();
      if (data.error) {
        showAlert("Error fetching config: " + data.error, "danger", "settingsAlerts");
        return;
      }
      if (data.TEXT_EXTENSIONS) {
        textExtensionsInput.value = data.TEXT_EXTENSIONS.join(", ");
      }
      if (data.DEFAULT_EXCLUDED_FOLDERS) {
        defaultExcludedInput.value = data.DEFAULT_EXCLUDED_FOLDERS.join(", ");
      }
    } catch (err) {
      console.error("Error loading config:", err);
      showAlert("Error loading config. Check console for details.", "danger", "settingsAlerts");
    }
  }
  
  saveSettingsBtn.addEventListener("click", async () => {
    try {
      const extStr = textExtensionsInput.value.trim();
      const defExcStr = defaultExcludedInput.value.trim();
      const extArr = extStr ? extStr.split(",").map(s => s.trim()) : [];
      const defExcArr = defExcStr ? defExcStr.split(",").map(s => s.trim()) : [];
  
      const payload = {
        TEXT_EXTENSIONS: extArr,
        DEFAULT_EXCLUDED_FOLDERS: defExcArr
      };
      const res = await fetch("/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) {
        showAlert("Error saving config: " + data.error, "danger", "settingsAlerts");
      } else {
        showAlert("Settings saved successfully!", "success", "settingsAlerts");
      }
    } catch (err) {
      console.error("Error saving settings:", err);
      showAlert("Error saving settings. Check console for details.", "danger", "settingsAlerts");
    }
  });
  
  // Fetch config on page load
  loadConfig().then(() => {
    if (folderPathInput.value.trim() !== "") {
      loadTree();
    }
  });
