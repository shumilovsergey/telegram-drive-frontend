// ------------------------------
// 1) Configuration & State
// ------------------------------
const API_HOST = "http://45.131.41.34:9000";
const USER = {
  user_id: "7777",
  token:   "my_secret_token"
};

// iconMap: { "pdf": "pdf.png", "folder": "folder.png", ... }
let iconMap = {};

// In-memory nested object showing folder‐file hierarchy
let fileTree = {};

// The path to the currently open folder, e.g. ["documents","papa"]
let currentPath = [];

// Holds the last copied file object (from “Copy” on a file row)
let copiedFileObj = null;

// ------------------------------
// 2) On page load: fetch dictionary + user data
// ------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  const rootEl = document.getElementById("drive-root");
  try {
    // 2.1) Load icon dictionary from /assets/dictionary.json
    const dictResp = await fetch("./assets/dictionary.json");
    const dictArray = await dictResp.json();
    dictArray.forEach(obj => {
      const key = Object.keys(obj)[0];
      iconMap[key] = obj[key];
    });

    // 2.2) Fetch user_data from backend
    const dataResp = await fetch(`${API_HOST}/get_data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(USER),
    });
    const jsonData = await dataResp.json();
    const files = jsonData.user_data || [];

    // 2.3) Build in-memory folder tree
    fileTree = buildTree(files);

    // 2.4) Render root view
    renderUI(fileTree, []);
  } catch (err) {
    console.error("Error loading data or dictionary:", err);
    rootEl.innerHTML = `
      <p style="color: #fff; text-align: center; margin-top: 2rem;">
        Could not load files.<br/>Please check network or server.
      </p>`;
  }
});

// ------------------------------
// 3) buildTree(files) → nested object
// ------------------------------
function buildTree(files) {
  const tree = {};
  files.forEach(file => {
    // file.file_path e.g. "/documents/mama docs/test.txt"
    const parts = file.file_path
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean);
    let node = tree;
    parts.forEach((part, idx) => {
      const isLeaf = idx === parts.length - 1;
      if (isLeaf) {
        // It's a file. Add to node.files array.
        if (!node.files) node.files = [];
        node.files.push({
          name: file.file_path.split("/").pop(),
          file_id: file.file_id
        });
      } else {
        // It's a folder. Create if missing.
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    });
  });
  return tree;
}

// ------------------------------
// 4) renderUI(treeNode, pathArray)
// ------------------------------
function renderUI(treeNode, path) {
  const rootEl = document.getElementById("drive-root");
  rootEl.innerHTML = "";

  // 4.1) If not at root, show “Back” button
  if (path.length > 0) {
    const backBtn = document.createElement("div");
    backBtn.className = "back-button";

    const folderIcon = iconMap["folder"] || "folder.png";
    const img = document.createElement("img");
    img.className = "icon";
    img.src = `./assets/${folderIcon}`;
    img.alt = "Back";
    backBtn.appendChild(img);

    const txt = document.createElement("span");
    txt.textContent = "Back";
    backBtn.appendChild(txt);

    backBtn.addEventListener("click", () => {
      path.pop();
      const newNode = getNodeFromPath(fileTree, path);
      renderUI(newNode, path);
    });

    rootEl.appendChild(backBtn);
  }

  // 4.2) Render sub-folders
  Object.keys(treeNode)
    .filter(key => key !== "files")
    .sort((a, b) => a.localeCompare(b))
    .forEach(folderName => {
      const folderEl = document.createElement("div");
      folderEl.className = "folder";

      // Icon for folder
      const folderIcon = iconMap["folder"] || "folder.png";
      const img = document.createElement("img");
      img.className = "icon";
      img.src = `./assets/${folderIcon}`;
      img.alt = folderName;
      folderEl.appendChild(img);

      // Folder name text
      const txt = document.createElement("span");
      txt.textContent = folderName;
      folderEl.appendChild(txt);

      // 4.2.a) Add menu button (⋮) for this folder
      const menuBtn = document.createElement("span");
      menuBtn.className = "menu-btn";
      menuBtn.innerHTML = "&#x22EE;"; // Vertical ellipsis “⋮”
      folderEl.appendChild(menuBtn);

      // 4.2.b) Build the popup menu for this folder
      const popup = document.createElement("div");
      popup.className = "menu-popup";

      // — “Paste” (only enabled if copiedFileObj exists)
      const pasteItem = document.createElement("div");
      pasteItem.className = "menu-item";
      pasteItem.textContent = "Paste";
      if (!copiedFileObj) {
        pasteItem.classList.add("disabled");
      } else {
        pasteItem.addEventListener("click", e => {
          e.stopPropagation();
          handlePasteToFolder(folderName);
          popup.style.display = "none";
        });
      }
      popup.appendChild(pasteItem);

      // — “Rename”
      const renameItem = document.createElement("div");
      renameItem.className = "menu-item";
      renameItem.textContent = "Rename";
      renameItem.addEventListener("click", e => {
        e.stopPropagation();
        handleRenameFolder(folderName);
        popup.style.display = "none";
      });
      popup.appendChild(renameItem);

      // — “Delete”
      const deleteItem = document.createElement("div");
      deleteItem.className = "menu-item";
      deleteItem.textContent = "Delete";
      deleteItem.addEventListener("click", e => {
        e.stopPropagation();
        handleDeleteFolder(folderName);
        popup.style.display = "none";
      });
      popup.appendChild(deleteItem);

      folderEl.appendChild(popup);

      // 4.2.c) Toggle the folder popup on ⋮ click
      menuBtn.addEventListener("click", event => {
        event.stopPropagation();
        closeAllMenus();
        popup.style.display = "flex";
      });

      // 4.2.d) Clicking the folder name itself (outside the menu) navigates in
      folderEl.addEventListener("click", () => {
        closeAllMenus();
        currentPath.push(folderName);
        const nextNode = getNodeFromPath(fileTree, currentPath);
        renderUI(nextNode, currentPath);
      });

      rootEl.appendChild(folderEl);
    });

  // 4.3) Render files
  if (Array.isArray(treeNode.files)) {
    treeNode.files
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(fileObj => {
        const fileEl = document.createElement("div");
        fileEl.className = "file";

        // Determine extension (for icon lookup)
        const parts = fileObj.name.split(".");
        const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
        const iconFile = iconMap[ext] || "default.png";

        const img = document.createElement("img");
        img.className = "icon";
        img.src = `./assets/${iconFile}`;
        img.alt = ext;
        fileEl.appendChild(img);

        const txt = document.createElement("span");
        txt.textContent = `${ext.toUpperCase()}: ${fileObj.name}`;
        fileEl.appendChild(txt);

        // 4.3.a) Three-dot menu for file
        const menuBtn = document.createElement("span");
        menuBtn.className = "menu-btn";
        menuBtn.innerHTML = "&#x22EE;"; // “⋮”
        fileEl.appendChild(menuBtn);

        // 4.3.b) Build file’s pop-up menu
        const popup = document.createElement("div");
        popup.className = "menu-popup";

        // — Copy
        const copyItem = document.createElement("div");
        copyItem.className = "menu-item";
        copyItem.textContent = "Copy";
        copyItem.addEventListener("click", e => {
          e.stopPropagation();
          handleCopy(fileObj);
          popup.style.display = "none";
        });
        popup.appendChild(copyItem);

        // — Paste (disabled for files, because you can only paste into a folder)
        const pasteItem = document.createElement("div");
        pasteItem.className = "menu-item disabled";
        pasteItem.textContent = "Paste";
        popup.appendChild(pasteItem);

        // — Download
        const downloadItem = document.createElement("div");
        downloadItem.className = "menu-item";
        downloadItem.textContent = "Download";
        downloadItem.addEventListener("click", e => {
          e.stopPropagation();
          handleDownload(fileObj);
          popup.style.display = "none";
        });
        popup.appendChild(downloadItem);

        // — Delete
        const deleteItem = document.createElement("div");
        deleteItem.className = "menu-item";
        deleteItem.textContent = "Delete";
        deleteItem.addEventListener("click", e => {
          e.stopPropagation();
          handleDeleteFile(fileObj);
          popup.style.display = "none";
        });
        popup.appendChild(deleteItem);

        fileEl.appendChild(popup);

        // 4.3.c) Toggle file popup on ⋮ click
        menuBtn.addEventListener("click", event => {
          event.stopPropagation();
          closeAllMenus();
          popup.style.display = "flex";
        });

        // 4.3.d) Clicking the file row (outside its menu) just closes menus
        fileEl.addEventListener("click", () => {
          closeAllMenus();
        });

        rootEl.appendChild(fileEl);
      });
  }

  // 4.4) Clicking anywhere else on the page closes all popups
  document.addEventListener("click", closeAllMenus);
}

// ------------------------------
// 5) getNodeFromPath(tree, pathArr) → node
// ------------------------------
function getNodeFromPath(tree, pathArr) {
  let node = tree;
  for (const segment of pathArr) {
    node = node[segment];
  }
  return node;
}

// ------------------------------
// 6) closeAllMenus(): hides .menu-popup everywhere
// ------------------------------
function closeAllMenus() {
  document.querySelectorAll(".menu-popup").forEach(p => {
    p.style.display = "none";
  });
}

// ------------------------------
// 7) handleCopy(fileObj): store in “clipboard”
// ------------------------------
function handleCopy(fileObj) {
  copiedFileObj = fileObj;
  // Also copy the filename to the OS clipboard if possible:
  navigator.clipboard
    .writeText(fileObj.name)
    .catch(() => {
      console.warn(
        "Could not write to OS clipboard, but internal copy succeeded."
      );
    });
  alert(`Copied: ${fileObj.name}`);
}

// ------------------------------
// 8) handlePasteToFolder(folderName)
//     → Paste copiedFileObj into that folder
// ------------------------------
async function handlePasteToFolder(folderName) {
  if (!copiedFileObj) {
    alert("Nothing to paste.");
    return;
  }
  // 8.1) Find the parent node for the target folder:
  const parentOfTarget = getNodeFromPath(fileTree, currentPath);
  const targetNode = parentOfTarget[folderName];

  if (!targetNode.files) {
    targetNode.files = [];
  }

  // 8.2) Create a brand-new ID for the copied file
  const newId = "id_" + Date.now() + "_" + Math.floor(Math.random() * 1e4);
  const newFile = {
    name: copiedFileObj.name,
    file_id: newId
  };
  targetNode.files.push(newFile);

  // 8.3) Re-render the current folder view
  renderUI(getNodeFromPath(fileTree, currentPath), currentPath);

  // 8.4) Sync with backend
  await updateBackend();

  alert(`Pasted "${copiedFileObj.name}" into "${folderName}".`);
}

// ------------------------------
// 9) handleDeleteFile(fileObj): remove file from current folder
// ------------------------------
async function handleDeleteFile(fileObj) {
  const parentNode = getNodeFromPath(fileTree, currentPath);
  const idx = parentNode.files.findIndex(f => f.file_id === fileObj.file_id);
  if (idx === -1) return;

  if (
    !confirm(`Are you sure you want to delete "${fileObj.name}"?`)
  ) {
    return;
  }
  parentNode.files.splice(idx, 1);
  renderUI(parentNode, currentPath);
  await updateBackend();
  alert(`Deleted file "${fileObj.name}".`);
}

// ------------------------------
// 10) handleDeleteFolder(folderName)
//      → only if empty
// ------------------------------
async function handleDeleteFolder(folderName) {
  const parentNode = getNodeFromPath(fileTree, currentPath);
  const folderNode = parentNode[folderName];

  const hasSubfolders = Object.keys(folderNode).filter(k => k !== "files").length > 0;
  const hasFiles = Array.isArray(folderNode.files) && folderNode.files.length > 0;

  if (hasSubfolders || hasFiles) {
    alert("Cannot delete non‐empty folder.");
    return;
  }

  if (!confirm(`Delete empty folder "${folderName}"?`)) {
    return;
  }

  delete parentNode[folderName];
  renderUI(parentNode, currentPath);
  await updateBackend();
  alert(`Deleted folder "${folderName}".`);
}

// ------------------------------
// 11) handleRenameFolder(oldName)
// ------------------------------
async function handleRenameFolder(oldName) {
  const parentNode = getNodeFromPath(fileTree, currentPath);

  const newName = prompt("Enter new folder name:", oldName);
  if (!newName || newName.trim() === "" || newName === oldName) {
    return; // no change
  }
  if (parentNode[newName]) {
    alert("A folder with that name already exists.");
    return;
  }

  // Move the subtree from oldName → newName
  parentNode[newName] = parentNode[oldName];
  delete parentNode[oldName];

  renderUI(parentNode, currentPath);
  await updateBackend();
  alert(`Renamed folder "${oldName}" → "${newName}".`);
}

// ------------------------------
// 12) handleDownload(fileObj): POST to /download
// ------------------------------
async function handleDownload(fileObj) {
  try {
    const resp = await fetch(`${API_HOST}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER.user_id,
        file_id: fileObj.file_id
      })
    });
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}`);
    }
    // If your backend returns a Blob, you can adapt this to trigger a real download:
    // const blob = await resp.blob();
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement("a");
    // a.href = url;
    // a.download = fileObj.name;
    // a.click();
    // URL.revokeObjectURL(url);

    alert(`Download request sent for "${fileObj.name}".`);
  } catch (err) {
    console.error("Download error:", err);
    alert("Failed to download. Check console for details.");
  }
}

// ------------------------------
// 13) updateBackend(): POST /up_data
// ------------------------------
async function updateBackend() {
  // Flatten fileTree into [{ file_id, file_type, file_path }, …]
  const newUserData = [];
  function recurse(node, pathSoFar) {
    if (node.files) {
      node.files.forEach(f => {
        const parts = f.name.split(".");
        const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
        const filePath = "/" + [...pathSoFar, f.name].join("/");
        newUserData.push({
          file_id: f.file_id,
          file_type: ext,
          file_path: filePath
        });
      });
    }
    Object.keys(node)
      .filter(k => k !== "files")
      .forEach(folderName => {
        recurse(node[folderName], [...pathSoFar, folderName]);
      });
  }
  recurse(fileTree, []);

  try {
    const resp = await fetch(`${API_HOST}/up_data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER.user_id,
        token: USER.token,
        user_data: newUserData
      })
    });
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}`);
    }
    // Optional: check resp.json() for a success message
  } catch (err) {
    console.error("Error updating backend (/up_data):", err);
    alert("Failed to synchronize changes with server.");
  }
}
