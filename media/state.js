// Shared state storage
export const state = {
  currentTree: null,
  allowedExts: [],
  selectedExtFilters: new Set(),
  projectExts: new Set(),
  hasWorkspace: false,
  treeDataReceived: false,
  configDataReceived: false,
};