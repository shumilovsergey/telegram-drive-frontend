// ------------------------------
// 1) Configuration & State
// ------------------------------
const API_HOST = "http://45.131.41.34:9000";
const USER = {
  user_id: "7777",
  token:   "my_secret_token"
};

// Tracks extension (or “folder”) → icon filename, e.g. { pdf: "pdf.png", folder: "folder.png", … }
let iconMap = {};

// In-memory nested object representing the folder tree.
// Example format:
// {
//   "documents": {
//     "mama docs": {
//       files: [ { name:"test.txt", file_id:"frjijr4895" } ]
//     },
//     "papa": {
//       files: [ { name:"photo.png", file_id:"kofrk45" } ]
//     },
//     files: [ { name:"rootfile.doc", file_id:"xyz123" } ]
//   },
//   files: [ { name:"readme.txt", file_id:"abc999" } ]
// }
let fileTree = {};

// A Set of “expanded” folder paths. Each folder’s path is stored as a string "parent/child/…".  
// If present in this Set, that folder is currently expanded.
const expandedPaths = new Set();

// Holds the last‐“copied” file object for Paste operations:
let copiedFileObj = null;

// ------------------------------
// 2) On page load: fetch icons + user data
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

    // 2.4) Render entire tree at root
    renderTree(fileTree, [], rootEl);
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
    // file.file_path might be "/documents/mama docs/test.txt"
    const parts = file.file_path.replace(/^\/+/, "").split("/").filter(Boolean);
    let node = tree;

    parts.forEach((part, idx) => {
      const isLeaf = idx === parts.length - 1;
      if (isLeaf) {
        if (!node.files) node.files = [];
        node.files.push({
          name: part,
          file_id: file.file_id
        });
      } else {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    });
  });

  return tree;
}

// ------------------------------
// 4) renderTree(treeNode, pathArray, container)
//    Recursively builds a nested “tree” inside `container`
// ------------------------------
function renderTree(treeNode, pathArray, container) {
  container.innerHTML = ""; // Clear existing children

  // 4.1) Render all subfolders at this level
  Object.keys(treeNode)
    .filter(key => key !== "files")
    .sort((a, b) => a.localeCompare(b))
    .forEach(folderName => {
      // Build the full path string for this folder:
      const folderPathArr = [...pathArray, folderName];
      const pathKey = folderPathArr.join("/");

      // Create the folder “row”
      const folderEl = document.createElement("div");
      folderEl.className = "folder";

      // Icon for folder
      const folderIconName = iconMap["folder"] || "folder.png";
      const img = document.createElement("img");
      img.className = "icon";
      img.src = `./assets/${folderIconName}`;
      img.alt = folderName;
      folderEl.appendChild(img);

      // Folder name text
      const txt = document.createElement("span");
      txt.textContent = folderName;
      folderEl.appendChild(txt);

      // 4.1.a) Three‐dot menu button (⋮)
      const menuBtn = document.createElement("span");
      menuBtn.className = "menu-btn";
      menuBtn.innerHTML = "&#x22EE;"; // Vertical ellipsis
      folderEl.appendChild(menuBtn);

      // 4.1.b) Build pop‐up menu for this folder
      const popup = document.createElement("div");
      popup.className = "menu-popup";

      // — “Paste” (enabled only if we have copiedFileObj non‐null)
      const pasteItem = document.createElement("div");
      pasteItem.className = "menu-item";
      pasteItem.textContent = "Paste";
      if (!copiedFileObj) {
        pasteItem.classList.add("disabled");
      } else {
        pasteItem.addEventListener("click", e => {
          e.stopPropagation();
          handlePasteToFolder(folderPathArr);
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
        handleRenameFolder(folderPathArr);
        popup.style.display = "none";
      });
      popup.appendChild(renameItem);

      // — “Delete”
      const deleteItem = document.createElement("div");
      deleteItem.className = "menu-item";
      deleteItem.textContent = "Delete";
      deleteItem.addEventListener("click", e => {
        e.stopPropagation();
        handleDeleteFolder(folderPathArr);
        popup.style.display = "none";
      });
      popup.appendChild(deleteItem);

      folderEl.appendChild(popup);

      // 4.1.c) Toggle expansion/collapse on folder row click
      folderEl.addEventListener("click", () => {
        // If user clicked the ⋮ menu, stopPropagation happens inside that handler,
        // so this click only fires when clicking the row background or name.
        if (expandedPaths.has(pathKey)) {
          expandedPaths.delete(pathKey);
        } else {
          expandedPaths.add(pathKey);
        }
        // Re-render the entire tree from root
        const rootEl = document.getElementById("drive-root");
        renderTree(fileTree, [], rootEl);
      });

      // 4.1.d) Toggle popup menu when clicking ⋮ (and stopPropagation)
      menuBtn.addEventListener("click", event => {
        event.stopPropagation();
        closeAllMenus();
        popup.style.display = "flex";
      });

      container.appendChild(folderEl);

      // 4.1.e) If this folder is expanded, show its children inside a nested div
      if (expandedPaths.has(pathKey)) {
        const childContainer = document.createElement("div");
        childContainer.className = "tree-children";
        renderTree(treeNode[folderName], folderPathArr, childContainer);
        container.appendChild(childContainer);
      }
    });

  // 4.2) Render files that live in this `treeNode`
  if (Array.isArray(treeNode.files)) {
    treeNode.files
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(fileObj => {
        const fileEl = document.createElement("div");
        fileEl.className = "file";

        // Determine extension for icon lookup
        const parts = fileObj.name.split(".");
        const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
        const iconFileName = iconMap[ext] || "default.png";

        const img = document.createElement("img");
        img.className = "icon";
        img.src = `./assets/${iconFileName}`;
        img.alt = ext;
        fileEl.appendChild(img);

        const txt = document.createElement("span");
        txt.textContent = `${ext.toUpperCase()}: ${fileObj.name}`;
        fileEl.appendChild(txt);

        // 4.2.a) Three‐dot menu for file
        const menuBtn = document.createElement("span");
        menuBtn.className = "menu-btn";
        menuBtn.innerHTML = "&#x22EE;"; // “⋮”
        fileEl.appendChild(menuBtn);

        // 4.2.b) Build file’s pop‐up menu
        const popup = document.createElement("div");
        popup.className = "menu-popup";

        // — “Copy”
        const copyItem = document.createElement("div");
        copyItem.className = "menu-item";
        copyItem.textContent = "Copy";
        copyItem.addEventListener("click", e => {
          e.stopPropagation();
          handleCopy(fileObj);
          popup.style.display = "none";
        });
        popup.appendChild(copyItem);

        // — “Paste” (always disabled for files)
        const pasteItem = document.createElement("div");
        pasteItem.className = "menu-item disabled";
        pasteItem.textContent = "Paste";
        popup.appendChild(pasteItem);

        // — “Download”
        const downloadItem = document.createElement("div");
        downloadItem.className = "menu-item";
        downloadItem.textContent = "Download";
        downloadItem.addEventListener("click", e => {
          e.stopPropagation();
          handleDownload(fileObj);
          popup.style.display = "none";
        });
        popup.appendChild(downloadItem);

        // — “Delete”
        const deleteItem = document.createElement("div");
        deleteItem.className = "menu-item";
        deleteItem.textContent = "Delete";
        deleteItem.addEventListener("click", e => {
          e.stopPropagation();
          handleDeleteFile(fileObj, pathArray);
          popup.style.display = "none";
        });
        popup.appendChild(deleteItem);

        fileEl.appendChild(popup);

        // 4.2.c) Toggle file popup on ⋮ click
        menuBtn.addEventListener("click", event => {
          event.stopPropagation();
          closeAllMenus();
          popup.style.display = "flex";
        });

        // 4.2.d) Clicking the file row (outside the menu) closes all menus
        fileEl.addEventListener("click", () => {
          closeAllMenus();
        });

        container.appendChild(fileEl);
      });
  }

  // 4.3) Clicking anywhere else closes all open menus
  document.addEventListener("click", closeAllMenus);
}

// ------------------------------
// 5) closeAllMenus(): hides every .menu-popup
// ------------------------------
function closeAllMenus() {
  document.querySelectorAll(".menu-popup").forEach(p => {
    p.style.display = "none";
  });
}

// ------------------------------
// 6) handleCopy(fileObj)
// ------------------------------
function handleCopy(fileObj) {
  copiedFileObj = fileObj;
  // Also try to put filename into OS clipboard
  navigator.clipboard
    .writeText(fileObj.name)
    .catch(() => {
      console.warn("OS clipboard write failed, but internal copy succeeded.");
    });
  alert(`Copied: ${fileObj.name}`);
}

// ------------------------------
// 7) handlePasteToFolder(folderPathArr)
//    Duplicate copiedFileObj into the folder at folderPathArr
// ------------------------------
async function handlePasteToFolder(folderPathArr) {
  if (!copiedFileObj) {
    alert("Nothing to paste.");
    return;
  }

  // 7.1) Locate the target folder node
  const targetNode = getNodeFromPath(fileTree, folderPathArr);
  if (!targetNode.files) targetNode.files = [];

  // 7.2) Generate a brand‐new file_id
  const newId = "id_" + Date.now() + "_" + Math.floor(Math.random() * 1e4);
  const newFile = {
    name: copiedFileObj.name,
    file_id: newId
  };
  targetNode.files.push(newFile);

  // 7.3) Re-render entire tree
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // 7.4) Sync with backend
  await updateBackend();
  alert(`Pasted "${copiedFileObj.name}" into "${folderPathArr.join("/")}".`);
}

// ------------------------------
// 8) handleDeleteFile(fileObj, parentPathArr)
// ------------------------------
async function handleDeleteFile(fileObj, parentPathArr) {
  const parentNode = getNodeFromPath(fileTree, parentPathArr);
  const idx = parentNode.files.findIndex(f => f.file_id === fileObj.file_id);
  if (idx === -1) return;

  if (!confirm(`Delete file "${fileObj.name}"?`)) {
    return;
  }
  parentNode.files.splice(idx, 1);

  // Re-render
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // Sync
  await updateBackend();
  alert(`Deleted file "${fileObj.name}".`);
}

// ------------------------------
// 9) handleDeleteFolder(folderPathArr)
//    Only if the folder is empty; otherwise alert.
// ------------------------------
async function handleDeleteFolder(folderPathArr) {
  // folderPathArr = ["documents","papa"] for example
  const parentPath = folderPathArr.slice(0, -1);
  const folderName = folderPathArr[folderPathArr.length - 1];
  const parentNode = getNodeFromPath(fileTree, parentPath);
  const folderNode = parentNode[folderName];

  const hasSubfolders = Object
    .keys(folderNode)
    .filter(k => k !== "files")
    .length > 0;
  const hasFiles = Array.isArray(folderNode.files) && folderNode.files.length > 0;

  if (hasSubfolders || hasFiles) {
    alert("Cannot delete non‐empty folder.");
    return;
  }
  if (!confirm(`Delete empty folder "${folderName}"?`)) {
    return;
  }

  delete parentNode[folderName];

  // Also remove from expandedPaths if it was expanded
  const pathKey = folderPathArr.join("/");
  expandedPaths.delete(pathKey);

  // Re-render
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // Sync
  await updateBackend();
  alert(`Deleted folder "${folderName}".`);
}

// ------------------------------
// 10) handleRenameFolder(folderPathArr)
// ------------------------------
async function handleRenameFolder(folderPathArr) {
  const parentPath = folderPathArr.slice(0, -1);
  const oldName = folderPathArr[folderPathArr.length - 1];
  const parentNode = getNodeFromPath(fileTree, parentPath);

  const newName = prompt("Enter new folder name:", oldName);
  if (!newName || newName.trim() === "" || newName === oldName) {
    return; // no change
  }
  if (parentNode[newName]) {
    alert("A folder with that name already exists.");
    return;
  }

  // Move subtree from oldName → newName
  parentNode[newName] = parentNode[oldName];
  delete parentNode[oldName];

  // Update expandedPaths: any path that started with oldName/… should be updated
  const oldKeyPrefix = [...parentPath, oldName].join("/") + "/";
  const newKeyPrefix = [...parentPath, newName].join("/") + "/";
  const updatedSet = new Set();
  expandedPaths.forEach(key => {
    if (key === oldKeyPrefix.slice(0, -1)) {
      // The folder itself was expanded; replace
      updatedSet.add(newKeyPrefix.slice(0, -1));
    } else if (key.startsWith(oldKeyPrefix)) {
      // Some child under it was expanded; update prefix
      updatedSet.add(key.replace(oldKeyPrefix, newKeyPrefix));
    } else {
      // Unrelated path; keep as is
      updatedSet.add(key);
    }
  });
  expandedPaths.clear();
  updatedSet.forEach(k => expandedPaths.add(k));

  // Re-render
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // Sync
  await updateBackend();
  alert(`Renamed folder "${oldName}" → "${newName}".`);
}

// ------------------------------
// 11) handleDownload(fileObj)
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
    // If your backend returns a Blob, you can do something like:
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
// 12) updateBackend(): flatten tree and POST /up_data
// ------------------------------
async function updateBackend() {
  // Build newUserData = [ { file_id, file_type, file_path }, … ]
  const newUserData = [];
  function recurse(node, pathSoFar) {
    if (node.files) {
      node.files.forEach(f => {
        const parts = f.name.split(".");
        const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
        const filePath = "/" + [...pathSoFar, f.name].join("/");
        newUserData.push({
          file_id:   f.file_id,
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
        user_id:   USER.user_id,
        token:     USER.token,
        user_data: newUserData
      })
    });
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}`);
    }
    // Optionally: const result = await resp.json();
    // console.log("Up_data response:", result);
  } catch (err) {
    console.error("Error updating backend (/up_data):", err);
    alert("Failed to synchronize changes with server.");
  }
}

// ------------------------------
// 13) getNodeFromPath(tree, pathArr) → returns the subtree at that path
// ------------------------------
function getNodeFromPath(tree, pathArr) {
  let node = tree;
  for (const segment of pathArr) {
    node = node[segment];
  }
  return node;
}
