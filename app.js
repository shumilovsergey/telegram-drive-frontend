const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.enableClosingConfirmation();
tg.setHeaderColor('#ffffff');
tg.setBackgroundColor('#f8f9fa');

const USER = {
  user_id: tg.initDataUnsafe.user.id,
  token:   "my_secret_token"
};

// const USER = {
//   user_id: "7777",
//   token:   "my_secret_token"
// };

const API_HOST = "https://tgdrive-backend.sh-development.ru/";

let iconMap = {};
let fileTree = {};
const expandedPaths = new Set();
let cutFileObj = null;
let cutParentPath = null;
let selectedContext = null;
let selectedElement = null;
let lastMessageId = null;

// NEW NAME
function showRenameDialog(titleText, defaultValue, onConfirm) {
  const modal = document.getElementById("rename-modal");
  const title = document.getElementById("rename-modal-title");
  const input = document.getElementById("rename-modal-input");
  const btnOk = document.getElementById("rename-modal-ok");
  const btnCancel = document.getElementById("rename-modal-cancel");

  title.textContent = titleText;
  input.value = defaultValue;
  modal.classList.remove("hidden");
  input.focus();

  function cleanup() {
    modal.classList.add("hidden");
    btnOk.removeEventListener("click", okHandler);
    btnCancel.removeEventListener("click", cancelHandler);
  }
  function okHandler() {
    const newName = input.value.trim();
    if (newName) onConfirm(newName);
    cleanup();
  }
  function cancelHandler() {
    cleanup();
  }

  btnOk.addEventListener("click", okHandler);
  btnCancel.addEventListener("click", cancelHandler);
}

// ────── Simple toast utility ──────
function showToast(message, duration = 2000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  // Force repaint so transition works
  void toast.offsetWidth;
  toast.classList.add("visible");
  // Hide after `duration` ms
  setTimeout(() => {
    toast.classList.remove("visible");
    // Wait for fade-out transition, then hide
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}


// ------------------------------
// 2) On page load: fetch dictionary + user_data
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
    lastMessageId = jsonData.user_data?.last_message_id ?? null;
    const files = jsonData.user_data?.files ?? [];

    // 2.3) Build in-memory folder tree
    fileTree = buildTree(files);


    const rootEl = document.getElementById("drive-root");
    if (!fileTree || Object.keys(fileTree).length === 0) {
      rootEl.innerHTML =
        '<p style="color:#fff; text-align:center; margin-top:2rem;">У тебя еще нет загруженных файлов! Попробоуй скиннуть файл в диалог с ботом и он появится тут :^) </p>';
    } else {
      renderTree(fileTree, [], rootEl);
    }

    // 2.5) Hook up top‐nav buttons
    document.getElementById("home-btn").addEventListener("click", () => {
      handleHome();
    });
    document.getElementById("info-btn").addEventListener("click", () => {
      showInfoPage();
    });
    document.getElementById("info-close-btn").addEventListener("click", () => {
      hideInfoPage();
    });
  } catch (err) {
    console.error("Error loading data or dictionary:", err);
    rootEl.innerHTML = `
      <p style="color: #fff; text-align: center; margin-top: 2rem;">
        Сервис временно недоступен :^( попробуй позже)
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
          file_id: file.file_id,
          file_type: file.file_type
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
//    Recursively build the expandable/collapsible tree.
// ------------------------------
function renderTree(treeNode, pathArray, container) {
  container.innerHTML = ""; // Clear out previous content

  // 4.1) Render all subfolders at this level
  Object.keys(treeNode)
    .filter(key => key !== "files")
    .sort((a, b) => a.localeCompare(b))
    .forEach(folderName => {
      // Build the full folder path array and string
      const folderPathArr = [...pathArray, folderName];
      const pathKey = folderPathArr.join("/");

      // 4.1.a) Create the folder row
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

      // 4.1.b) Create the “selector” circle on the right
      const selectBtn = document.createElement("span");
      selectBtn.className = "select-btn";
      folderEl.appendChild(selectBtn);

      // 4.1.c) Clicking the folder row toggles expansion/collapse,
      //         and also deselects any currently-selected item.
      folderEl.addEventListener("click", () => {
        deselectCurrent();
        if (expandedPaths.has(pathKey)) {
          expandedPaths.delete(pathKey);
        } else {
          expandedPaths.add(pathKey);
        }
        const rootEl = document.getElementById("drive-root");
        renderTree(fileTree, [], rootEl);
      });

      // 4.1.d) Clicking the selector circle selects/deselects this folder
      selectBtn.addEventListener("click", event => {
        event.stopPropagation(); // Prevent triggering the folderEl click
        handleSelectFolder(folderPathArr, folderEl);
      });

      // 4.1.e) If this folder is marked as “selected,” add the class
      if (
        selectedContext &&
        selectedContext.type === "folder" &&
        selectedContext.folderPath.join("/") === pathKey
      ) {
        folderEl.classList.add("selected");
      }

      container.appendChild(folderEl);

      // 4.1.f) If expanded, render its children inside a nested div
      if (expandedPaths.has(pathKey)) {
        const childContainer = document.createElement("div");
        childContainer.className = "tree-children";
        renderTree(treeNode[folderName], folderPathArr, childContainer);
        container.appendChild(childContainer);
      }
    });

  // 4.2) Render files at this level (if any)
  if (Array.isArray(treeNode.files)) {
    treeNode.files
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(fileObj => {
        const fileEl = document.createElement("div");
        fileEl.className = "file";

      const typeKey = (fileObj.file_type || "").toLowerCase();
      let iconFileName = iconMap[typeKey] || null;

      const img = document.createElement("img");
      img.className = "icon";
      img.src = `./assets/${iconFileName}`;
      img.alt = typeKey || "";
      fileEl.appendChild(img);

      const txt = document.createElement("span");
      txt.textContent = fileObj.name;
      fileEl.appendChild(txt);

        // 4.2.a) Create the “selector” circle on the right
        const selectBtn = document.createElement("span");
        selectBtn.className = "select-btn";
        fileEl.appendChild(selectBtn);

        // 4.2.b) Clicking the file row deselects any selected item
        fileEl.addEventListener("click", () => {
          deselectCurrent();
        });

        // 4.2.c) Clicking the selector circle selects/deselects this file
        selectBtn.addEventListener("click", event => {
          event.stopPropagation();
          handleSelectFile(fileObj, pathArray, fileEl);
        });

        // 4.2.d) If this file is “selected,” add the class
        if (
          selectedContext &&
          selectedContext.type === "file" &&
          selectedContext.fileObj.file_id === fileObj.file_id
        ) {
          fileEl.classList.add("selected");
        }

        container.appendChild(fileEl);
      });
  }
}

// ------------------------------
// 5) deselectCurrent(): clears any selected row & hides bottom menu
// ------------------------------

function deselectCurrent() {
  // Remove "selected" from every folder or file row
  document
    .querySelectorAll(".folder.selected, .file.selected")
    .forEach(el => el.classList.remove("selected"));

  // Clear our stored references & hide the bottom bar
  selectedElement  = null;
  selectedContext  = null;
  hideBottomMenu();
}

// ------------------------------
// 6) handleSelectFolder(folderPathArr, rowEl)
// ------------------------------
function handleSelectFolder(folderPathArr, rowEl) {
  const pathKey = folderPathArr.join("/");

  // If already selected, deselect
  if (
    selectedContext &&
    selectedContext.type === "folder" &&
    selectedContext.folderPath.join("/") === pathKey
  ) {
    deselectCurrent();
    return;
  }

  // Otherwise, switch selection
  deselectCurrent();
  rowEl.classList.add("selected");
  selectedElement = rowEl;
  selectedContext = {
    type: "folder",
    folderPath: folderPathArr.slice()
  };
  showBottomMenu();
}

// ------------------------------
// 7) handleSelectFile(fileObj, parentPathArr, rowEl)
// ------------------------------
function handleSelectFile(fileObj, parentPathArr, rowEl) {
  // If already selected, deselect
  if (
    selectedContext &&
    selectedContext.type === "file" &&
    selectedContext.fileObj.file_id === fileObj.file_id
  ) {
    deselectCurrent();
    return;
  }

  // Otherwise, switch selection
  deselectCurrent();
  rowEl.classList.add("selected");
  selectedElement = rowEl;
  selectedContext = {
    type: "file",
    fileObj: { ...fileObj },
    parentPath: parentPathArr.slice()
  };
  showBottomMenu();
}

// ------------------------------
// 8) showBottomMenu(): renders bottom nav buttons based on selectedContext
// ------------------------------
function showBottomMenu() {
  const bottomNav = document.getElementById("bottom-menu");
  bottomNav.innerHTML = ""; // Clear old buttons
  bottomNav.classList.add("show");

  if (!selectedContext) return;

  // Helper to create a <button> for the bottom menu
  function makeButton(emoji, onClick, disabled = false) {
    const btn = document.createElement("button");
    btn.textContent = emoji;
    if (disabled) {
      btn.classList.add("disabled");
    } else {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        onClick();
        hideBottomMenu();
      });
    }
    return btn;
  }

  if (selectedContext.type === "file") {
    const { fileObj, parentPath } = selectedContext;

    // ⬇️ Download
    bottomNav.appendChild(
      makeButton("⬇️", () => handleDownload(fileObj), false)
    );

    // ✏️ Rename (only name, keep extension)
    bottomNav.appendChild(
      makeButton("✏️", () => handleRenameFile(fileObj, parentPath), false)
    );

    // ✂️ Cut
    bottomNav.appendChild(
      makeButton("✂️", () => handleCut(fileObj, parentPath), false)
    );

    // 🗑️ Delete
    bottomNav.appendChild(
      makeButton("🗑️", () => handleDeleteFile(fileObj, parentPath), false)
    );
  }
  else if (selectedContext.type === "folder") {
    const { folderPath } = selectedContext;

    // ➕ Add
    bottomNav.appendChild(
      makeButton("➕", () => handleNewFolder(folderPath), false)
    );

    // ✏️ Rename
    bottomNav.appendChild(
      makeButton("✏️", () => handleRenameFolder(folderPath), false)
    );

    // 📋 Paste (only if something is cut)
    bottomNav.appendChild(
      makeButton(
        "📋",
        () => handlePasteToFolder(folderPath),
        cutFileObj === null
      )
    );

    // 🗑️ Delete (only if empty)
    bottomNav.appendChild(
      makeButton("🗑️", () => handleDeleteFolder(folderPath), false)
    );
  }
}

// ------------------------------
// 9) hideBottomMenu()
// ------------------------------
function hideBottomMenu() {
  const bottomNav = document.getElementById("bottom-menu");
  bottomNav.classList.remove("show");
}

// ------------------------------
// 10) handleCut(fileObj, parentPathArr)
// ------------------------------
function handleCut(fileObj, parentPathArr) {
  cutFileObj = fileObj;
  cutParentPath = parentPathArr.slice();

}

// ------------------------------
// 11) handlePasteToFolder(folderPathArr)
// ------------------------------
async function handlePasteToFolder(folderPathArr) {
  if (!cutFileObj) {
    alert("Nothing to paste.");
    return;
  }

  // 11.1) Remove from old folder
  const oldParentNode = getNodeFromPath(fileTree, cutParentPath);
  const idx = oldParentNode.files.findIndex(f => f.file_id === cutFileObj.file_id);
  if (idx !== -1) {
    oldParentNode.files.splice(idx, 1);
  }

  // 11.2) Add to new folder
  const targetNode = getNodeFromPath(fileTree, folderPathArr);
  if (!targetNode.files) targetNode.files = [];
  targetNode.files.push({
    name: cutFileObj.name,
    file_id: cutFileObj.file_id,
    file_type: cutFileObj.file_type
  });

  // 11.3) Clear cut state
  cutFileObj = null;
  cutParentPath = null;

  // 11.4) Re-render entire tree
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // 11.5) Sync with backend
  await updateBackend();
  showToast(`Файл перемещен "${folderPathArr.join("/")}".`);
}

// ------------------------------
// 12) handleDeleteFile(fileObj, parentPathArr)
// ------------------------------
async function handleDeleteFile(fileObj, parentPathArr) {
  const parentNode = getNodeFromPath(fileTree, parentPathArr);
  const idx = parentNode.files.findIndex(f => f.file_id === fileObj.file_id);
  if (idx === -1) return;

  parentNode.files.splice(idx, 1);

  // If we had this file cut, clear that too
  if (cutFileObj && cutFileObj.file_id === fileObj.file_id) {
    cutFileObj = null;
    cutParentPath = null;
  }

  // Clear selection and hide bottom menu
  deselectCurrent();

  // Re-render
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // Sync
  await updateBackend();
}

// ------------------------------
// 13) handleDeleteFolder(folderPathArr)
// ------------------------------
async function handleDeleteFolder(folderPathArr) {
  const parentPath = folderPathArr.slice(0, -1);
  const folderName = folderPathArr[folderPathArr.length - 1];
  const parentNode = getNodeFromPath(fileTree, parentPath);
  const folderNode = parentNode[folderName];

  // Only delete if truly empty
  const hasSubfolders = Object
    .keys(folderNode)
    .filter(k => k !== "files")
    .length > 0;
  const hasFiles = Array.isArray(folderNode.files) && folderNode.files.length > 0;

  if (hasSubfolders || hasFiles) {
    showToast("Папка должна быть пусой!");
    return;
  }

  delete parentNode[folderName];
  const pathKey = folderPathArr.join("/");
  expandedPaths.delete(pathKey);

  // Clear selection and hide bottom menu
  deselectCurrent();

  // Re-render
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // Sync
  await updateBackend();
}

// ------------------------------
// 14) handleRenameFolder(folderPathArr)
// ------------------------------

async function handleRenameFolder(folderPathArr) {
  const parentPath = folderPathArr.slice(0, -1);
  const oldName    = folderPathArr[folderPathArr.length - 1];
  const parentNode = getNodeFromPath(fileTree, parentPath);

  showRenameDialog(
    /* title */    "Переименовать папку",
    /* default */  oldName,
    /* onConfirm => */ async newName => {
      // If unchanged or empty—do nothing
      if (!newName || newName.trim() === "" || newName === oldName) return;

      // Name clash?
      if (parentNode[newName]) {
        showToast("Папка с таким именем уже существует.");
        return;
      }

      // Move subtree
      parentNode[newName] = parentNode[oldName];
      delete parentNode[oldName];

      // Update expandedPaths
      const oldKeyPrefix = [...parentPath, oldName].join("/") + "/";
      const newKeyPrefix = [...parentPath, newName].join("/") + "/";
      const updatedSet = new Set();
      expandedPaths.forEach(key => {
        if (key === oldKeyPrefix.slice(0, -1)) {
          updatedSet.add(newKeyPrefix.slice(0, -1));
        } else if (key.startsWith(oldKeyPrefix)) {
          updatedSet.add(key.replace(oldKeyPrefix, newKeyPrefix));
        } else {
          updatedSet.add(key);
        }
      });
      expandedPaths.clear();
      updatedSet.forEach(k => expandedPaths.add(k));

      // Re-render & sync
      const rootEl = document.getElementById("drive-root");
      renderTree(fileTree, [], rootEl);
      await updateBackend();
    }
  );
}




// ------------------------------
// 15) handleNewFolder(folderPathArr)
//     Creates a new subfolder named "new_folder" (or "new_folder_1", etc.)
// ------------------------------
async function handleNewFolder(folderPathArr) {
  const parentNode = getNodeFromPath(fileTree, folderPathArr);

  // Find a unique name ("new_folder", "new_folder_1", etc.)
  let base = "new_folder";
  let candidate = base;
  let counter = 1;
  while (parentNode[candidate]) {
    candidate = `${base}_${counter++}`;
  }

  // Create the subfolder
  parentNode[candidate] = {};

  // Ensure parent is expanded
  const pathKey = folderPathArr.join("/");
  expandedPaths.add(pathKey);

  deselectCurrent();

  // Re-render
  const rootEl = document.getElementById("drive-root");
  renderTree(fileTree, [], rootEl);

  // Sync
  await updateBackend();

  showToast(`Создана папка в "${folderPathArr.join("/")}".`);
}

// ------------------------------
// 16) handleRenameFile(fileObj, parentPathArr)
//     Prompts for a new filename (keeps extension fixed), updates tree & backend.
// ------------------------------

async function handleRenameFile(fileObj, parentPathArr) {
  // Extract old name and split into base/ext
  const oldName = fileObj.name; // e.g. "document.pdf"
  const dotIndex = oldName.lastIndexOf(".");
  const base = dotIndex > 0 ? oldName.slice(0, dotIndex) : oldName;
  const ext  = dotIndex > 0 ? oldName.slice(dotIndex) : "";

  // Show the rename dialog, pre-filled with the base name
  showRenameDialog(
    /* title     */ "Переименовать файл",
    /* default   */ base,
    /* onConfirm */ async newBase => {
      // Trim and ignore if empty or unchanged
      if (!newBase || newBase.trim() === "" || newBase === base) return;

      const newName = newBase + ext; 

      // Update in-memory tree
      const parentNode = getNodeFromPath(fileTree, parentPathArr);
      const idx = parentNode.files.findIndex(f => f.file_id === fileObj.file_id);
      if (idx === -1) return; // safety

      parentNode.files[idx].name = newName;

      // Re-render & sync
      const rootEl = document.getElementById("drive-root");
      renderTree(fileTree, [], rootEl);
      await updateBackend();

    }
  );
}


// ------------------------------
// 17) handleDownload(fileObj)
// ------------------------------
async function handleDownload(fileObj) {
  try {
    const resp = await fetch(`${API_HOST}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER.user_id,
        token: USER.token,
        file_id: fileObj.file_id,
        file_type: fileObj.file_type
      })
    });
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}`);
    }
    tg.close();

  } catch (err) {
    console.error("Download error:", err);
    alert("Что-то пошло не по плану - попробуй позже :^(");
  }
}

// ------------------------------
// 18) updateBackend(): flatten tree & POST to /up_data
// ------------------------------
async function updateBackend() {
  const newUserData = [];
  function recurse(node, pathSoFar) {
    if (node.files) {
      node.files.forEach(f => {
        const filePath = "/" + [...pathSoFar, f.name].join("/");
        newUserData.push({
          file_id:   f.file_id,
          file_type: f.file_type,   // <- use the original file_type
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
        token:   USER.token,
        user_data: {
          last_message_id: lastMessageId,  // carry over the old value
          files:            newUserData    // the flattened files array
        }
      })
    });
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}`);
    }
  } catch (err) {
    console.error("Error updating backend (/up_data):", err);
    showToast("Нет связи с сервером :^( попробуй позже!");
  }
}


// ------------------------------
// 19) getNodeFromPath(tree, pathArr)
//     Returns the subtree at the given path.
// ------------------------------
function getNodeFromPath(tree, pathArr) {
  let node = tree;
  for (const segment of pathArr) {
    node = node[segment];
  }
  return node;
}

// ------------------------------
// 20) handleHome()
//     Collapse everything, clear selection, hide info page & bottom menu, re-render root.
// ------------------------------
function handleHome() {
  window.location.reload();
}

// ------------------------------
// 21) showInfoPage() / hideInfoPage()
// ------------------------------
function showInfoPage() {
  document.getElementById("drive-root").classList.add("hidden");
  hideBottomMenu();
  document.getElementById("info-page").classList.remove("hidden");
}
function hideInfoPage() {
  document.getElementById("info-page").classList.add("hidden");
  document.getElementById("drive-root").classList.remove("hidden");
}

// ──────────────────────────────────────────────────────────────
// 2.6) Hook up the three new Info-page buttons
// ──────────────────────────────────────────────────────────────

// 1) Website: open your site in a new tab
document.getElementById("website-btn").addEventListener("click", () => {
  window.open("https://sh-development.ru/", "_blank");
});

// 2) Telegram: open your Telegram link in a new tab
document.getElementById("telegram-btn").addEventListener("click", () => {
  window.open("https://t.me/sergey_showmelove", "_blank");
});

// 3) E-mail: copy to clipboard & toast
document.getElementById("email-btn").addEventListener("click", () => {
  const emailAddress = "wumilovsergey@gmail.com";
  navigator.clipboard
    .writeText(emailAddress)
    .then(() => {
      showToast(`Электронная почта скопирована: ${emailAddress}`);
    })
    .catch(() => {
      showToast(`Скопируйте вручную: ${emailAddress}`);
    });
});

