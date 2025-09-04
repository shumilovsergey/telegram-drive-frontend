// Telegram Web App Integration
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.enableClosingConfirmation();
tg.setHeaderColor('#527da3');
tg.setBackgroundColor('#ffffff');

// User configuration
const USER = {
  user_id: tg.initDataUnsafe?.user?.id || "7777", // fallback for testing
  token: "my_secret_token"
};

const API_HOST = "https://tgdrive-backend.sh-development.ru/";

// Application state
let iconMap = {};
let fileTree = {};
const expandedPaths = new Set();
let cutFileObj = null;
let cutParentPath = null;
let currentPath = [];
let touchStartTime = 0;
let longPressTimer = null;

// DOM Elements
const elements = {
  headerTitle: document.getElementById('header-title'),
  backBtn: document.getElementById('back-btn'),
  infoBtn: document.getElementById('info-btn'),
  fileList: document.getElementById('file-list'),
  breadcrumb: document.getElementById('breadcrumb'),
  uploadArea: document.getElementById('upload-area'),
  fileInput: document.getElementById('file-input'),
  fileBrowser: document.getElementById('file-browser'),
  infoPage: document.getElementById('info-page'),
  bottomBar: document.getElementById('bottom-bar'),
  pasteBtn: document.getElementById('paste-btn'),
  cancelBtn: document.getElementById('cancel-btn'),
  modalOverlay: document.getElementById('modal-overlay'),
  contextMenu: document.getElementById('context-menu'),
  toast: document.getElementById('toast')
};

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  await loadIconMap();
  await loadFileTree();
  renderCurrentView();
  setupEventListeners();
});

// Load file type icons mapping
async function loadIconMap() {
  try {
    const response = await fetch('assets/dictionary.json');
    const data = await response.json();
    data.forEach(item => {
      const key = Object.keys(item)[0];
      iconMap[key] = item[key];
    });
  } catch (error) {
    console.error('Failed to load icon map:', error);
    // Fallback icon map
    iconMap = {
      folder: 'folder.png',
      photo: 'photo.png',
      document: 'document.png',
      video: 'video.png',
      audio: 'audio.png',
      voice: 'voice.png',
      video_note: 'video_note.png',
      default: 'default.png'
    };
  }
}

// Load file tree from API
async function loadFileTree() {
  try {
    showLoader();
    const response = await fetch(`${API_HOST}get_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(USER)
    });
    
    if (response.ok) {
      const data = await response.json();
      fileTree = data.files || {};
    } else {
      throw new Error('Failed to load files');
    }
  } catch (error) {
    console.error('Error loading files:', error);
    showToast('Ошибка загрузки файлов');
    fileTree = {};
  } finally {
    hideLoader();
  }
}

// Save file tree to API
async function saveFileTree() {
  try {
    const response = await fetch(`${API_HOST}update_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...USER,
        files: fileTree
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save changes');
    }
  } catch (error) {
    console.error('Error saving files:', error);
    showToast('Ошибка сохранения');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Header navigation
  elements.backBtn.addEventListener('click', navigateBack);
  elements.infoBtn.addEventListener('click', showInfoPage);
  
  // Upload handling
  elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileUpload);
  
  // Drag and drop
  setupDragAndDrop();
  
  // Bottom bar actions
  elements.pasteBtn.addEventListener('click', handlePaste);
  elements.cancelBtn.addEventListener('click', cancelCutOperation);
  
  // Modal overlay
  elements.modalOverlay.addEventListener('click', hideAllModals);
  
  // Context menu
  setupContextMenu();
  
  // Info page buttons
  setupInfoPageButtons();
  
  // Hide context menu on body click
  document.body.addEventListener('click', hideContextMenu);
  
  // Handle hardware back button
  tg.onEvent('backButtonClicked', navigateBack);
}

// Navigation functions
function navigateBack() {
  if (currentPath.length > 0) {
    currentPath.pop();
    renderCurrentView();
    updateBackButton();
  } else if (!elements.fileBrowser.classList.contains('hidden')) {
    // Already at root of file browser
    tg.close();
  } else {
    // On info page, go back to file browser
    showFileBrowser();
  }
}

function showInfoPage() {
  elements.fileBrowser.classList.add('hidden');
  elements.infoPage.classList.remove('hidden');
  elements.headerTitle.textContent = 'О приложении';
  updateBackButton(true);
  hideBottomBar();
}

function showFileBrowser() {
  elements.infoPage.classList.add('hidden');
  elements.fileBrowser.classList.remove('hidden');
  elements.headerTitle.textContent = 'Облачный диск';
  updateBackButton();
  updateBottomBar();
}

function updateBackButton(show = currentPath.length > 0) {
  if (show || !elements.fileBrowser.classList.contains('hidden') && currentPath.length === 0) {
    elements.backBtn.style.display = 'flex';
    tg.BackButton.show();
  } else {
    elements.backBtn.style.display = 'none';
    tg.BackButton.hide();
  }
}

// Render current directory view
function renderCurrentView() {
  updateBreadcrumb();
  updateHeaderTitle();
  renderFileList();
  updateBackButton();
}

function updateBreadcrumb() {
  const breadcrumbItems = ['Главная'];
  for (let i = 0; i < currentPath.length; i++) {
    breadcrumbItems.push(currentPath[i]);
  }
  
  elements.breadcrumb.innerHTML = breadcrumbItems
    .map((item, index) => {
      const isLast = index === breadcrumbItems.length - 1;
      return `<span class="tg-breadcrumb-item ${isLast ? 'active' : ''}">${item}</span>`;
    })
    .join(' / ');
}

function updateHeaderTitle() {
  const title = currentPath.length === 0 ? 'Облачный диск' : currentPath[currentPath.length - 1];
  elements.headerTitle.textContent = title;
}

function renderFileList() {
  const currentFolder = getCurrentFolder();
  elements.fileList.innerHTML = '';
  
  if (!currentFolder) {
    showEmptyState();
    return;
  }
  
  // Render folders
  if (currentFolder.folders) {
    Object.keys(currentFolder.folders).forEach(folderName => {
      renderFolderItem(folderName);
    });
  }
  
  // Render files
  if (currentFolder.files) {
    currentFolder.files.forEach(fileObj => {
      renderFileItem(fileObj);
    });
  }
  
  if (!hasContent(currentFolder)) {
    showEmptyState();
  }
}

function getCurrentFolder() {
  let folder = fileTree;
  for (const pathSegment of currentPath) {
    if (folder.folders && folder.folders[pathSegment]) {
      folder = folder.folders[pathSegment];
    } else {
      return null;
    }
  }
  return folder;
}

function hasContent(folder) {
  return (folder.folders && Object.keys(folder.folders).length > 0) ||
         (folder.files && folder.files.length > 0);
}

function showEmptyState() {
  elements.fileList.innerHTML = `
    <div class="tg-text-block">
      <p class="tg-text-hint">Папка пуста</p>
    </div>
  `;
}

function renderFolderItem(folderName) {
  const item = document.createElement('div');
  item.className = 'tg-list-item';
  item.innerHTML = `
    <div class="tg-list-item-icon">
      <img src="assets/${iconMap.folder}" alt="folder">
    </div>
    <div class="tg-list-item-body">
      <div class="tg-list-item-title">${folderName}</div>
    </div>
    <div class="tg-list-item-right">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--tg-theme-hint-color)">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
      </svg>
    </div>
  `;
  
  // Single tap to navigate
  item.addEventListener('click', () => {
    currentPath.push(folderName);
    renderCurrentView();
  });
  
  // Long press for context menu
  setupLongPress(item, () => {
    showContextMenu(item, 'folder', { folderName, folderPath: [...currentPath, folderName] });
  });
  
  elements.fileList.appendChild(item);
}

function renderFileItem(fileObj) {
  const item = document.createElement('div');
  item.className = 'tg-list-item';
  
  const fileIcon = getFileIcon(fileObj);
  const fileSize = formatFileSize(fileObj.file_size);
  
  item.innerHTML = `
    <div class="tg-list-item-icon">
      <img src="assets/${fileIcon}" alt="file">
    </div>
    <div class="tg-list-item-body">
      <div class="tg-list-item-title">${fileObj.name}</div>
      <div class="tg-list-item-subtitle">${fileSize}</div>
    </div>
  `;
  
  // Single tap to download
  item.addEventListener('click', () => {
    handleDownload(fileObj);
  });
  
  // Long press for context menu
  setupLongPress(item, () => {
    showContextMenu(item, 'file', { fileObj, parentPath: currentPath.slice() });
  });
  
  elements.fileList.appendChild(item);
}

function getFileIcon(fileObj) {
  if (fileObj.type && iconMap[fileObj.type]) {
    return iconMap[fileObj.type];
  }
  
  // Fallback based on file extension
  const ext = fileObj.name.split('.').pop().toLowerCase();
  const typeMap = {
    jpg: 'photo', jpeg: 'photo', png: 'photo', gif: 'photo',
    mp4: 'video', avi: 'video', mov: 'video',
    mp3: 'audio', wav: 'audio', aac: 'audio',
    pdf: 'document', doc: 'document', docx: 'document', txt: 'document'
  };
  
  return iconMap[typeMap[ext]] || iconMap.default;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Long press handling for context menus
function setupLongPress(element, onLongPress) {
  let pressTimer = null;
  let startPos = null;
  
  const startPress = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    startPos = { x: touch.clientX, y: touch.clientY };
    
    pressTimer = setTimeout(() => {
      tg.HapticFeedback.impactOccurred('medium');
      onLongPress();
      pressTimer = null;
    }, 500);
  };
  
  const movePress = (e) => {
    if (!pressTimer || !startPos) return;
    
    const touch = e.touches ? e.touches[0] : e;
    const deltaX = Math.abs(touch.clientX - startPos.x);
    const deltaY = Math.abs(touch.clientY - startPos.y);
    
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  
  const endPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    startPos = null;
  };
  
  element.addEventListener('mousedown', startPress);
  element.addEventListener('touchstart', startPress, { passive: true });
  element.addEventListener('mousemove', movePress);
  element.addEventListener('touchmove', movePress, { passive: true });
  element.addEventListener('mouseup', endPress);
  element.addEventListener('touchend', endPress);
  element.addEventListener('mouseleave', endPress);
  element.addEventListener('touchcancel', endPress);
}

// Context menu
function showContextMenu(targetElement, type, context) {
  hideContextMenu();
  
  const menu = elements.contextMenu;
  menu.innerHTML = '';
  menu.style.display = 'block';
  
  // Position context menu
  const rect = targetElement.getBoundingClientRect();
  const menuHeight = 200; // Approximate
  
  let top = rect.bottom + 8;
  if (top + menuHeight > window.innerHeight) {
    top = rect.top - menuHeight - 8;
  }
  
  menu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
  menu.style.top = Math.max(8, top) + 'px';
  
  // Add menu items based on type
  if (type === 'file') {
    addContextMenuItem('📥', 'Скачать', () => handleDownload(context.fileObj));
    addContextMenuItem('✏️', 'Переименовать', () => showRenameModal(context.fileObj, context.parentPath));
    addContextMenuItem('✂️', 'Вырезать', () => handleCut(context.fileObj, context.parentPath));
    addContextMenuItem('🗑️', 'Удалить', () => showDeleteConfirmation(context.fileObj, context.parentPath), true);
  } else if (type === 'folder') {
    addContextMenuItem('➕', 'Новая папка', () => showCreateFolderModal(context.folderPath));
    addContextMenuItem('✏️', 'Переименовать', () => showRenameFolderModal(context.folderPath));
    addContextMenuItem('✂️', 'Вырезать', () => handleCutFolder(context.folderPath));
    addContextMenuItem('🗑️', 'Удалить', () => showDeleteFolderConfirmation(context.folderPath), true);
  }
  
  // Show overlay
  elements.modalOverlay.style.display = 'flex';
}

function addContextMenuItem(icon, text, onClick, isDestructive = false) {
  const item = document.createElement('div');
  item.className = `tg-context-menu-item ${isDestructive ? 'tg-context-menu-item-destructive' : ''}`;
  item.innerHTML = `
    <span class="tg-context-menu-icon">${icon}</span>
    <span class="tg-context-menu-text">${text}</span>
  `;
  
  item.addEventListener('click', () => {
    hideContextMenu();
    onClick();
  });
  
  elements.contextMenu.appendChild(item);
}

function setupContextMenu() {
  document.getElementById('context-download').addEventListener('click', () => {
    hideContextMenu();
    // Download action will be handled by specific context
  });
  
  document.getElementById('context-rename').addEventListener('click', () => {
    hideContextMenu();
    // Rename action will be handled by specific context
  });
  
  document.getElementById('context-cut').addEventListener('click', () => {
    hideContextMenu();
    // Cut action will be handled by specific context
  });
  
  document.getElementById('context-delete').addEventListener('click', () => {
    hideContextMenu();
    // Delete action will be handled by specific context
  });
}

function hideContextMenu() {
  elements.contextMenu.style.display = 'none';
  elements.modalOverlay.style.display = 'none';
}

// File operations
async function handleFileUpload(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  
  showToast(`Загружаем ${files.length} файл(ов)...`);
  
  try {
    for (const file of files) {
      await uploadFile(file);
    }
    
    showToast('Файлы успешно загружены');
    await loadFileTree();
    renderCurrentView();
  } catch (error) {
    console.error('Upload error:', error);
    showToast('Ошибка загрузки файлов');
  }
  
  // Reset input
  elements.fileInput.value = '';
}

async function uploadFile(file) {
  const fileObj = {
    file_id: Date.now() + Math.random(),
    name: file.name,
    file_size: file.size,
    type: getFileTypeFromName(file.name)
  };
  
  // Add to current folder
  const currentFolder = getCurrentFolder() || fileTree;
  if (!currentFolder.files) currentFolder.files = [];
  currentFolder.files.push(fileObj);
  
  await saveFileTree();
}

function getFileTypeFromName(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const typeMap = {
    jpg: 'photo', jpeg: 'photo', png: 'photo', gif: 'photo', webp: 'photo',
    mp4: 'video', avi: 'video', mov: 'video', mkv: 'video',
    mp3: 'audio', wav: 'audio', aac: 'audio', flac: 'audio',
    pdf: 'document', doc: 'document', docx: 'document', txt: 'document'
  };
  return typeMap[ext] || 'default';
}

async function handleDownload(fileObj) {
  showToast(`Скачиваем ${fileObj.name}...`);
  tg.HapticFeedback.notificationOccurred('success');
  
  // Simulate download
  setTimeout(() => {
    showToast('Файл скачан');
  }, 1000);
}

function handleCut(fileObj, parentPath) {
  cutFileObj = fileObj;
  cutParentPath = parentPath.slice();
  showToast(`Файл "${fileObj.name}" вырезан`);
  showBottomBar();
}

function handleCutFolder(folderPath) {
  // Implementation for cutting folders
  showToast(`Папка "${folderPath[folderPath.length - 1]}" вырезана`);
  showBottomBar();
}

async function handlePaste() {
  if (!cutFileObj || !cutParentPath) return;
  
  try {
    // Remove from old location
    const oldFolder = getfolderByPath(cutParentPath);
    if (oldFolder && oldFolder.files) {
      oldFolder.files = oldFolder.files.filter(f => f.file_id !== cutFileObj.file_id);
    }
    
    // Add to current location
    const currentFolder = getCurrentFolder() || fileTree;
    if (!currentFolder.files) currentFolder.files = [];
    currentFolder.files.push(cutFileObj);
    
    await saveFileTree();
    
    showToast(`Файл "${cutFileObj.name}" перемещен`);
    cancelCutOperation();
    renderCurrentView();
  } catch (error) {
    console.error('Paste error:', error);
    showToast('Ошибка перемещения файла');
  }
}

function cancelCutOperation() {
  cutFileObj = null;
  cutParentPath = null;
  hideBottomBar();
}

function getfolderByPath(pathArray) {
  let folder = fileTree;
  for (const segment of pathArray) {
    if (folder.folders && folder.folders[segment]) {
      folder = folder.folders[segment];
    } else {
      return null;
    }
  }
  return folder;
}

// Modal functions
function showRenameModal(fileObj, parentPath) {
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  const confirmBtn = document.getElementById('rename-confirm');
  const cancelBtn = document.getElementById('rename-cancel');
  
  input.value = fileObj.name;
  modal.style.display = 'block';
  elements.modalOverlay.style.display = 'flex';
  
  // Focus input after animation
  setTimeout(() => input.focus(), 100);
  
  const handleConfirm = async () => {
    const newName = input.value.trim();
    if (newName && newName !== fileObj.name) {
      fileObj.name = newName;
      await saveFileTree();
      renderCurrentView();
      showToast('Файл переименован');
    }
    hideAllModals();
  };
  
  const handleCancel = () => hideAllModals();
  
  confirmBtn.onclick = handleConfirm;
  cancelBtn.onclick = handleCancel;
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };
}

function showDeleteConfirmation(fileObj, parentPath) {
  const modal = document.getElementById('confirm-modal');
  const title = document.getElementById('confirm-title');
  const message = document.getElementById('confirm-message');
  const confirmBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  
  title.textContent = 'Удалить файл?';
  message.textContent = `Файл "${fileObj.name}" будет удален без возможности восстановления.`;
  
  modal.style.display = 'block';
  elements.modalOverlay.style.display = 'flex';
  
  const handleConfirm = async () => {
    const folder = getfolderByPath(parentPath) || fileTree;
    if (folder.files) {
      folder.files = folder.files.filter(f => f.file_id !== fileObj.file_id);
    }
    
    await saveFileTree();
    renderCurrentView();
    showToast('Файл удален');
    hideAllModals();
  };
  
  confirmBtn.onclick = handleConfirm;
  cancelBtn.onclick = () => hideAllModals();
}

function hideAllModals() {
  elements.modalOverlay.style.display = 'none';
  document.querySelectorAll('.tg-modal').forEach(modal => {
    modal.style.display = 'none';
  });
  hideContextMenu();
}

// Bottom bar
function showBottomBar() {
  elements.bottomBar.style.display = 'flex';
}

function hideBottomBar() {
  elements.bottomBar.style.display = 'none';
}

function updateBottomBar() {
  if (cutFileObj) {
    showBottomBar();
  } else {
    hideBottomBar();
  }
}

// Drag and drop setup
function setupDragAndDrop() {
  const uploadArea = elements.uploadArea;
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
  });
  
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.add('drag-over');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.remove('drag-over');
    }, false);
  });
  
  uploadArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleDrop(e) {
  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) {
    // Simulate file input change
    const event = { target: { files } };
    handleFileUpload(event);
  }
}

// Info page setup
function setupInfoPageButtons() {
  document.getElementById('website-btn').addEventListener('click', () => {
    tg.openLink('https://sh-development.ru');
  });
  
  document.getElementById('telegram-btn').addEventListener('click', () => {
    tg.openTelegramLink('https://t.me/sh_development');
  });
  
  document.getElementById('email-btn').addEventListener('click', () => {
    const email = 'wumilovsergey@gmail.com';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(email).then(() => {
        showToast(`Email скопирован: ${email}`);
      }).catch(() => {
        showToast(`Скопируйте вручную: ${email}`);
      });
    } else {
      showToast(`Скопируйте вручную: ${email}`);
    }
  });
}

// Utility functions
function showToast(message, duration = 3000) {
  elements.toast.textContent = message;
  elements.toast.style.display = 'block';
  
  setTimeout(() => {
    elements.toast.style.display = 'none';
  }, duration);
}

function showLoader() {
  // Could add a loader overlay here
  console.log('Loading...');
}

function hideLoader() {
  // Hide loader
  console.log('Loading complete');
}

// Initialize Telegram Web App theme handling
function initializeTheme() {
  if (tg.colorScheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  
  // Listen for theme changes
  tg.onEvent('themeChanged', () => {
    if (tg.colorScheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });
}

// Call theme initialization
initializeTheme();