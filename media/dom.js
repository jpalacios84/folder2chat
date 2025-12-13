export const elements = {
  browseFolderBtn: document.getElementById("browseFolderBtn"),
  folderPathInput: document.getElementById("folderPath"),
  refreshTreeBtn: document.getElementById("refreshTreeBtn"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  selectNoneBtn: document.getElementById("selectNoneBtn"),
  expandAllBtn: document.getElementById("expandAllBtn"),
  collapseAllBtn: document.getElementById("collapseAllBtn"),
  treeContainer: document.getElementById("treeContainer"),
  generateBtn: document.getElementById("generateReportBtn"),
  includeTreeCb: document.getElementById("includeTreeCheckbox"),
  includeInstructionsCb: document.getElementById("includeInstructionsCheckbox"),
  reportOutput: document.getElementById("reportOutput"),
  copyBtn: document.getElementById("copyReportBtn"),
  statsBadge: document.getElementById("statsBadge"),
  spinner: document.getElementById("spinner"),
  extChips: document.getElementById("extChips"),
  limitInput: document.getElementById("limitInput"),
  textExtensionsInput: document.getElementById("textExtensionsInput"),
  defaultExcludedInput: document.getElementById("defaultExcludedInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  settingsAlerts: document.getElementById("settingsAlerts"),
  saveTargetWorkspace: document.getElementById("saveTargetWorkspace"),
  
  // Helpers
  setBusy: (busy) => document.getElementById("spinner").classList.toggle("d-none", !busy),
  
  setSettingsMessage: (msg, ok = true) => {
    const el = document.getElementById("settingsAlerts");
    el.textContent = msg || "";
    el.className = "small " + (ok ? "text-success" : "text-danger");
  }
};