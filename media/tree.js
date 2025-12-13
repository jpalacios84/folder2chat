/**
 * Tree rendering and traversal logic
 */

export function collectProjectExts(node) {
  const set = new Set();
  (function walk(n) {
    if (!n) return;
    if (n.type === "file") {
      const dot = n.name.lastIndexOf(".");
      // If dot > 0, standard ext. If <= 0 (Dockerfile or .env), use whole name.
      if (dot > 0) {
        set.add(n.name.slice(dot));
      } else {
        set.add(n.name);
      }
    } else {
      (n.children || []).forEach(walk);
    }
  })(node);
  return set;
}

export function isVisibleByFilters(name, filters) {
  if (filters.size === 0) return true;
  const dot = name.lastIndexOf(".");
  // Matching logic: if dot > 0, use ext. Else use name.
  const ext = dot > 0 ? name.slice(dot) : name;
  return filters.has(ext);
}

export function renderTree(container, rootNode, filters, onStateChange) {
  container.innerHTML = "";
  if (!rootNode) return;
  
  const ul = document.createElement("ul");
  ul.className = "tree";
  ul.appendChild(renderNode(rootNode, filters, onStateChange));
  container.appendChild(ul);
}

export function expandRoot(container) {
  const rootLi = container.querySelector(":scope > ul > li");
  const firstUl = rootLi?.querySelector(":scope > ul");
  if (firstUl) {
    firstUl.style.display = "block";
    const folderEmoji = rootLi.querySelector(":scope > div .folder-emoji");
    if (folderEmoji) folderEmoji.textContent = "📂";
  }
}

function renderNode(node, filters, onStateChange) {
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

    (node.children || []).forEach(child => sub.appendChild(renderNode(child, filters, onStateChange)));
    li.appendChild(sub);

    const toggle = () => {
      const open = sub.style.display !== "none";
      sub.style.display = open ? "none" : "block";
      folderEmoji.textContent = open ? "📁" : "📂";
      if (onStateChange) onStateChange();
    };
    label.addEventListener("click", toggle);
    folderEmoji.addEventListener("click", toggle);

    cb.addEventListener("change", () => {
      setChildrenSelection(sub, cb.checked);
      updateAncestors(li);
      if (onStateChange) onStateChange();
    });

  } else {
    // Check visibility against filters
    if (!isVisibleByFilters(node.name, filters)) {
      li.style.display = "none";
    }

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
      if (onStateChange) onStateChange();
    };
    label.addEventListener("click", toggleFileSelection);
    fileEmoji.addEventListener("click", toggleFileSelection);

    cb.addEventListener("change", () => { 
      updateAncestors(li); 
      if (onStateChange) onStateChange();
    });
  }
  return li;
}

export function setChildrenSelection(ul, checked) {
  ul.querySelectorAll('input[type="checkbox"]').forEach(i => {
    i.checked = checked; 
    i.indeterminate = false;
  });
}

export function updateAncestors(li) {
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