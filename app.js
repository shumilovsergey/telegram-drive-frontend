// Telegram Web App Integration
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
// tg.enableClosingConfirmation(); // Removed to allow seamless app closing
tg.setHeaderColor('#527da3');
tg.setBackgroundColor('#ffffff');

// Development configuration

const DEBUG = true; 
// const DEBUG = false; 
const DEV_USER_ID = 507717647;

// User configuration
const USER = {
  user_id: DEBUG ? DEV_USER_ID : tg.initDataUnsafe?.user?.id,
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
let isSearching = false;
let searchQuery = '';

// DOM Elements
const elements = {
  headerTitle: document.getElementById('header-title'),
  backBtn: document.getElementById('back-btn'),
  fileList: document.getElementById('file-list'),
  breadcrumb: document.getElementById('breadcrumb'),
  currentFolderMenu: document.getElementById('current-folder-menu'),
  searchContainer: document.getElementById('search-container'),
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),
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
  if (DEBUG) {
    console.log('DEBUG MODE: Using dev user ID:', DEV_USER_ID);
    console.log('USER object:', USER);
    
    // Show debug indicator in header
    const debugIndicator = document.getElementById('debug-indicator');
    if (debugIndicator) {
      debugIndicator.style.display = 'block';
    }
  }
  
  loadIconMap();
  await loadFileTree();
  renderCurrentView();
  setupEventListeners();
  
});

// Load file type icons mapping - now using SVG icons
function loadIconMap() {
  // Use SVG icons instead of loading from dictionary.json
  iconMap = {
    folder: 'folder',
    photo: 'photo',
    document: 'document',
    video: 'video',
    voice: 'voice',
    audio: 'audio',
    video_note: 'video_note',
    default: 'default'
  };
}

// Load file tree from API
async function loadFileTree() {
  try {
    showLoader();
    console.log('Loading file tree for user:', USER);
    
    const response = await fetch(`${API_HOST}get_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(USER)
    });
    
    console.log('API response status:', response.status);
    
    if (response.ok) {
      const jsonData = await response.json();
      console.log('API response data:', jsonData);
      
      const files = jsonData.user_data?.files || [];
      console.log('Files array:', files);
      console.log('Number of files:', files.length);
      
      fileTree = buildTree(files);
      console.log('Built file tree:', fileTree);
    } else {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`Failed to load files: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('Error loading files:', error);
    showToast('Ошибка загрузки файлов');
    fileTree = {};
  } finally {
    hideLoader();
  }
}

// Build hierarchical tree from flat file array
function buildTree(files) {
  console.log('Building tree from files:', files);
  const tree = {};
  files.forEach(file => {
    console.log('Processing file:', file);
    
    // Check if this is an empty folder entry (ends with "/" and has file_type "folder")
    if (file.file_type === 'folder' && file.file_path.endsWith('/')) {
      // Handle empty folder
      const folderPath = file.file_path.replace(/^\/+/, "").replace(/\/+$/, "");
      const parts = folderPath ? folderPath.split("/").filter(Boolean) : [];
      console.log('Processing empty folder with parts:', parts);
      
      let node = tree;
      parts.forEach(part => {
        if (!node.folders) node.folders = {};
        if (!node.folders[part]) node.folders[part] = {};
        node = node.folders[part];
        console.log('Created/navigated to folder:', part);
      });
    } else {
      // Handle regular file
      // file.file_path might be "/documents/mama docs/test.txt"
      const parts = file.file_path.replace(/^\/+/, "").split("/").filter(Boolean);
      console.log('File path parts:', parts);
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
          console.log('Added file to node:', part, 'in folder:', node);
        } else {
          if (!node.folders) node.folders = {};
          if (!node.folders[part]) node.folders[part] = {};
          node = node.folders[part];
          console.log('Created/navigated to folder:', part);
        }
      });
    }
  });
  console.log('Final tree structure:', tree);
  return tree;
}

// Save file tree to API
async function saveFileTree() {
  try {
    // Flatten tree back to file array format for backend
    const files = [];
    function flattenTree(node, pathSoFar) {
      if (node.files) {
        node.files.forEach(f => {
          const filePath = "/" + [...pathSoFar, f.name].join("/");
          files.push({
            file_id: f.file_id,
            file_type: f.file_type,
            file_path: filePath
          });
        });
      }
      if (node.folders) {
        Object.keys(node.folders).forEach(folderName => {
          const folderNode = node.folders[folderName];
          // Check if this folder is empty (no files and no subfolders)
          const isEmpty = (!folderNode.files || folderNode.files.length === 0) && 
                         (!folderNode.folders || Object.keys(folderNode.folders).length === 0);
          
          if (isEmpty) {
            // Save empty folder as a special entry
            const folderPath = "/" + [...pathSoFar, folderName].join("/") + "/";
            files.push({
              file_id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              file_type: 'folder',
              file_path: folderPath
            });
          }
          
          flattenTree(folderNode, [...pathSoFar, folderName]);
        });
      }
    }
    flattenTree(fileTree, []);

    const response = await fetch(`${API_HOST}up_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER.user_id,
        token: USER.token,
        user_data: {
          files: files
        }
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
  document.querySelector('.drive-back-button').addEventListener('click', navigateBack);
  
  // Current folder menu
  elements.currentFolderMenu.addEventListener('click', showCurrentFolderMenu);
  
  // Search functionality
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.searchInput.addEventListener('focus', handleSearchFocus);
  elements.searchInput.addEventListener('blur', handleSearchBlur);
  elements.searchClear.addEventListener('click', clearSearch);
  
  // File input handling (disabled - files come from bot)
  elements.fileInput.addEventListener('change', handleFileUpload);
  
  // Bottom bar actions
  elements.pasteBtn.addEventListener('click', handlePaste);
  elements.cancelBtn.addEventListener('click', cancelCutOperation);
  
  // Modal overlay
  elements.modalOverlay.addEventListener('click', hideAllModals);
  
  
  // Context menu
  setupContextMenu();
  
  
  // Hide context menu and dropdowns on body click
  document.body.addEventListener('click', (e) => {
    if (!e.target.closest('.drive-bottom-sheet') && !e.target.closest('.drive-list-item-menu') && !e.target.closest('.drive-current-folder-menu')) {
      hideAllDropdowns();
    }
    hideContextMenu();
  });
  
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


function showFileBrowser() {
  elements.infoPage.classList.add('hidden');
  elements.fileBrowser.classList.remove('hidden');
  elements.headerTitle.textContent = '☁️';
  updateBackButton();
  updateBottomBar();
}

function updateBackButton(show = currentPath.length > 0) {
  const backBtn = document.querySelector('.drive-back-button');
  if (show) {
    backBtn.style.display = 'flex';
    tg.BackButton.show();
  } else {
    backBtn.style.display = 'none';
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
  const breadcrumbText = currentPath.length === 0 ? 'Мой диск' : currentPath[currentPath.length - 1];
  elements.breadcrumb.querySelector('.drive-breadcrumb-text').textContent = breadcrumbText;
}

function updateHeaderTitle() {
  // Keep header title static as cloud emoji
  elements.headerTitle.textContent = '☁️';
}

function renderFileList() {
  console.log('Rendering file list for path:', currentPath);
  const currentFolder = getCurrentFolder();
  console.log('Current folder:', currentFolder);
  elements.fileList.innerHTML = '';
  
  if (!currentFolder) {
    console.log('No current folder found');
    showEmptyState();
    return;
  }
  
  // Render folders
  if (currentFolder.folders) {
    console.log('Rendering folders:', Object.keys(currentFolder.folders));
    Object.keys(currentFolder.folders).forEach(folderName => {
      renderFolderItem(folderName);
    });
  } else {
    console.log('No folders in current directory');
  }
  
  // Render files
  if (currentFolder.files) {
    console.log('Rendering files:', currentFolder.files);
    currentFolder.files.forEach(fileObj => {
      renderFileItem(fileObj);
    });
  } else {
    console.log('No files in current directory');
  }
  
  if (!hasContent(currentFolder)) {
    console.log('Folder has no content, showing empty state');
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
  if (currentPath.length === 0) {
    // Root folder empty
    elements.fileList.innerHTML = `
      <div class="tg-text-block" style="text-align: center; padding: var(--tg-spacing-xl);">
        <p class="tg-text-hint">У вас еще нет загруженных файлов!</p>
        <p class="tg-text-hint">Отправьте файлы в чат с ботом и они появятся здесь 🙂</p>
      </div>
    `;
  } else {
    // Subfolder empty
    elements.fileList.innerHTML = `
      <div class="tg-text-block" style="text-align: center; padding: var(--tg-spacing-xl);">
        <p class="tg-text-hint">Папка пуста</p>
      </div>
    `;
  }
}

function renderFolderItem(folderName) {
  const item = document.createElement('div');
  item.className = 'drive-list-item folder';
  item.innerHTML = `
    <div class="drive-list-item-icon">
      ${getSVGIconHTML(iconMap.folder)}
    </div>
    <div class="drive-list-item-body">
      <div class="drive-list-item-title">${folderName}</div>

    </div>
    <div class="drive-list-item-actions">
      <button class="drive-list-item-menu" data-action="menu">
        <div class="drive-three-dots"></div>
      </button>
    </div>
  `;
  
  // Click handling
  item.addEventListener('click', (e) => {
    if (e.target.closest('.drive-list-item-menu')) {
      e.preventDefault();
      e.stopPropagation();
      showDropdownMenu(e.target.closest('.drive-list-item-menu'), 'folder', { folderName, folderPath: [...currentPath, folderName] });
      return;
    }
    currentPath.push(folderName);
    renderCurrentView();
  });
  
  elements.fileList.appendChild(item);
}

function renderFileItem(fileObj) {
  const item = document.createElement('div');
  item.className = 'drive-list-item file';
  
  const fileIcon = getFileIcon(fileObj);
  
  item.innerHTML = `
    <div class="drive-list-item-icon">
      ${getSVGIconHTML(fileIcon)}
    </div>
    <div class="drive-list-item-body">
      <div class="drive-list-item-title">${fileObj.name}</div>
      <div class="drive-list-item-subtitle">
        <span>${fileObj.file_type || 'файл'}</span>
      </div>
    </div>
    <div class="drive-list-item-actions">
      <button class="drive-list-item-menu" data-action="menu">
        <div class="drive-three-dots"></div>
      </button>
    </div>
  `;
  
  // Click handling
  item.addEventListener('click', (e) => {
    if (e.target.closest('.drive-list-item-menu')) {
      e.preventDefault();
      e.stopPropagation();
      showDropdownMenu(e.target.closest('.drive-list-item-menu'), 'file', { fileObj, parentPath: currentPath.slice() });
      return;
    }
    // Files are not directly downloadable - use 3-dot menu
  });
  
  elements.fileList.appendChild(item);
}

function getFileIcon(fileObj) {
  // Use file_type from backend if available
  if (fileObj.file_type && iconMap[fileObj.file_type]) {
    return iconMap[fileObj.file_type];
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

// Bottom Sheet Menu (Google Drive Style)
function showDropdownMenu(buttonElement, type, context) {
  hideAllDropdowns();
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'drive-bottom-sheet-overlay';
  
  // Create bottom sheet
  const bottomSheet = document.createElement('div');
  bottomSheet.className = 'drive-bottom-sheet';
  
  // Create header with handle and title
  const header = document.createElement('div');
  header.className = 'drive-bottom-sheet-header';
  
  const handle = document.createElement('div');
  handle.className = 'drive-bottom-sheet-handle';
  
  const title = document.createElement('h3');
  title.className = 'drive-bottom-sheet-title';
  title.textContent = type === 'file' ? context.fileObj.name : context.folderName;
  
  header.appendChild(handle);
  header.appendChild(title);
  
  // Create content
  const content = document.createElement('div');
  content.className = 'drive-bottom-sheet-content';
  
  // Add menu items based on type
  if (type === 'file') {
    addBottomSheetItem(content, '📥', 'Скачать', () => handleDownload(context.fileObj));
    addBottomSheetItem(content, '✏️', 'Переименовать', () => handleRenameFile(context.fileObj, context.parentPath));
    addBottomSheetItem(content, '✂️', 'Вырезать', () => handleCut(context.fileObj, context.parentPath));
    // Show paste only if something was cut
    if (cutFileObj) {
      addBottomSheetItem(content, '📋', 'Вставить', () => handlePasteToFolder(context.parentPath));
    }
    addBottomSheetItem(content, '🗑️', 'Удалить', () => showDeleteFileConfirmation(context.fileObj, context.parentPath), true);
  } else if (type === 'folder') {
    addBottomSheetItem(content, '➕', 'Новая папка', () => handleNewFolder(context.folderPath));
    addBottomSheetItem(content, '✏️', 'Переименовать', () => handleRenameFolder(context.folderPath));
    addBottomSheetItem(content, '✂️', 'Вырезать', () => handleCutFolder(context.folderPath));
    // Show paste only if something was cut
    if (cutFileObj) {
      addBottomSheetItem(content, '📋', 'Вставить', () => handlePasteToFolder(context.folderPath));
    }
    addBottomSheetItem(content, '🗑️', 'Удалить', () => showDeleteFolderConfirmation(context.folderPath), true);
  }
  
  // Assemble bottom sheet
  bottomSheet.appendChild(header);
  bottomSheet.appendChild(content);
  
  // Add to page
  document.body.appendChild(overlay);
  document.body.appendChild(bottomSheet);
  
  // Close on overlay click
  overlay.addEventListener('click', hideAllDropdowns);
}

function addBottomSheetItem(content, icon, text, onClick, isDestructive = false) {
  const item = document.createElement('div');
  item.className = `drive-bottom-sheet-item ${isDestructive ? 'drive-bottom-sheet-item-destructive' : ''}`;
  item.innerHTML = `
    <div class="drive-bottom-sheet-icon">${icon}</div>
    <div class="drive-bottom-sheet-text">${text}</div>
  `;
  
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    hideAllDropdowns();
    onClick();
  });
  
  content.appendChild(item);
}

function hideAllDropdowns() {
  const bottomSheets = document.querySelectorAll('.drive-bottom-sheet');
  const overlays = document.querySelectorAll('.drive-bottom-sheet-overlay');
  
  bottomSheets.forEach(sheet => {
    sheet.classList.add('closing');
    setTimeout(() => sheet.remove(), 250);
  });
  
  overlays.forEach(overlay => {
    overlay.style.animation = 'overlayFadeOut 0.25s ease forwards';
    setTimeout(() => overlay.remove(), 250);
  });
}

// Current folder menu (for the folder user is currently in)
function showCurrentFolderMenu() {
  hideAllDropdowns();
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'drive-bottom-sheet-overlay';
  
  // Create bottom sheet
  const bottomSheet = document.createElement('div');
  bottomSheet.className = 'drive-bottom-sheet';
  
  // Create header with handle and title
  const header = document.createElement('div');
  header.className = 'drive-bottom-sheet-header';
  
  const handle = document.createElement('div');
  handle.className = 'drive-bottom-sheet-handle';
  
  const title = document.createElement('h3');
  title.className = 'drive-bottom-sheet-title';
  
  // Set title based on current location
  if (currentPath.length === 0) {
    title.textContent = 'Мой диск';
  } else {
    title.textContent = currentPath[currentPath.length - 1];
  }
  
  header.appendChild(handle);
  header.appendChild(title);
  
  // Create content
  const content = document.createElement('div');
  content.className = 'drive-bottom-sheet-content';
  
  // Add menu items based on current location
  if (currentPath.length === 0) {
    // Root folder - only show "New Folder" option
    addBottomSheetItem(content, '➕', 'Новая папка', () => handleNewFolder([]));
    // Show paste only if something was cut
    if (cutFileObj) {
      addBottomSheetItem(content, '📋', 'Вставить', () => handlePasteToFolder([]));
    }
  } else {
    // Inside a folder - show all folder options
    addBottomSheetItem(content, '➕', 'Новая папка', () => handleNewFolder(currentPath));
    addBottomSheetItem(content, '✏️', 'Переименовать папку', () => handleRenameFolder(currentPath));
    addBottomSheetItem(content, '✂️', 'Вырезать папку', () => handleCutFolder(currentPath));
    // Show paste only if something was cut
    if (cutFileObj) {
      addBottomSheetItem(content, '📋', 'Вставить', () => handlePasteToFolder(currentPath));
    }
    addBottomSheetItem(content, '🗑️', 'Удалить папку', () => showDeleteFolderConfirmation(currentPath), true);
  }
  
  // Assemble bottom sheet
  bottomSheet.appendChild(header);
  bottomSheet.appendChild(content);
  
  // Add to page
  document.body.appendChild(overlay);
  document.body.appendChild(bottomSheet);
  
  // Close on overlay click
  overlay.addEventListener('click', hideAllDropdowns);
}

// Add fadeOut animation
const style = document.createElement('style');
style.textContent = `
  @keyframes overlayFadeOut {
    to { opacity: 0; }
  }
`;
document.head.appendChild(style);

// Context menu (legacy)
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

// File operations - Files come from bot, not direct upload
function handleFileUpload(event) {
  // Files are uploaded through the bot, not directly
  showToast('Отправьте файлы в чат с ботом для загрузки');
  elements.fileInput.value = ''; // Reset input
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
  try {
    showToast(`Скачиваем ${fileObj.name}...`);
    
    const response = await fetch(`${API_HOST}download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER.user_id,
        token: USER.token,
        file_id: fileObj.file_id,
        file_type: fileObj.file_type
      })
    });
    
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    
    tg.HapticFeedback.notificationOccurred('success');
    tg.close();
  } catch (error) {
    console.error('Download error:', error);
    showToast('Ошибка скачивания файла');
  }
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

// Search functionality
function handleSearchInput(e) {
  const query = e.target.value.toLowerCase().trim();
  searchQuery = query;
  
  // Show/hide clear button
  if (query.length > 0) {
    elements.searchClear.classList.add('visible');
    isSearching = true;
  } else {
    elements.searchClear.classList.remove('visible');
    isSearching = false;
  }
  
  // Perform search
  performSearch();
}

function handleSearchFocus() {
  // Add any focus-specific behavior here
}

function handleSearchBlur() {
  // Add any blur-specific behavior here
}

function clearSearch() {
  elements.searchInput.value = '';
  elements.searchClear.classList.remove('visible');
  searchQuery = '';
  isSearching = false;
  performSearch();
  elements.searchInput.focus();
}

function performSearch() {
  if (isSearching && searchQuery.length > 0) {
    renderSearchResults();
  } else {
    renderCurrentView();
  }
}

function renderSearchResults() {
  console.log('Searching for:', searchQuery);
  elements.fileList.innerHTML = '';
  
  // Search through entire file tree
  const results = searchFiles(fileTree, searchQuery);
  console.log('Search results:', results);
  
  if (results.length === 0) {
    elements.fileList.innerHTML = '<div class="drive-empty-state">Ничего не найдено</div>';
    return;
  }
  
  // Render search results
  results.forEach(result => {
    if (result.type === 'folder') {
      renderSearchFolderItem(result);
    } else {
      renderSearchFileItem(result);
    }
  });
}

function searchFiles(node, query, currentPath = []) {
  const results = [];
  
  // Search folders
  if (node.folders) {
    Object.keys(node.folders).forEach(folderName => {
      // Check if folder name matches query
      if (folderName.toLowerCase().includes(query)) {
        results.push({
          type: 'folder',
          name: folderName,
          path: [...currentPath, folderName],
          pathString: currentPath.length > 0 ? currentPath.join(' > ') : 'Мой диск'
        });
      }
      
      // Recursively search in subfolders
      const subResults = searchFiles(node.folders[folderName], query, [...currentPath, folderName]);
      results.push(...subResults);
    });
  }
  
  // Search files
  if (node.files) {
    node.files.forEach(file => {
      if (file.name.toLowerCase().includes(query)) {
        results.push({
          type: 'file',
          ...file,
          path: currentPath,
          pathString: currentPath.length > 0 ? currentPath.join(' > ') : 'Мой диск'
        });
      }
    });
  }
  
  return results;
}

function renderSearchFolderItem(result) {
  const item = document.createElement('div');
  item.className = 'drive-list-item folder search-result';
  
  item.innerHTML = `
    <div class="drive-list-item-icon">
      ${getSVGIconHTML('folder')}
    </div>
    <div class="drive-list-item-body">
      <div class="drive-list-item-title">${result.name}</div>
      <div class="drive-list-item-subtitle">
        <span>📍 ${result.pathString}</span>
      </div>
    </div>
    <div class="drive-list-item-actions">
      <button class="drive-list-item-menu" data-action="menu">
        <div class="drive-three-dots"></div>
      </button>
    </div>
  `;
  
  // Click handling
  item.addEventListener('click', (e) => {
    if (e.target.closest('.drive-list-item-menu')) {
      e.preventDefault();
      e.stopPropagation();
      showDropdownMenu(e.target.closest('.drive-list-item-menu'), 'folder', { 
        folderName: result.name, 
        folderPath: result.path 
      });
      return;
    }
    // Navigate to folder
    navigateToPath(result.path);
  });
  
  elements.fileList.appendChild(item);
}

function renderSearchFileItem(result) {
  const item = document.createElement('div');
  item.className = 'drive-list-item file search-result';
  
  const fileIcon = getFileIcon(result);
  
  item.innerHTML = `
    <div class="drive-list-item-icon">
      ${getSVGIconHTML(fileIcon)}
    </div>
    <div class="drive-list-item-body">
      <div class="drive-list-item-title">${result.name}</div>
      <div class="drive-list-item-subtitle">
        <span>📍 ${result.pathString}</span>
        <span>•</span>
        <span>${result.file_type || 'файл'}</span>
      </div>
    </div>
    <div class="drive-list-item-actions">
      <button class="drive-list-item-menu" data-action="menu">
        <div class="drive-three-dots"></div>
      </button>
    </div>
  `;
  
  // Click handling
  item.addEventListener('click', (e) => {
    if (e.target.closest('.drive-list-item-menu')) {
      e.preventDefault();
      e.stopPropagation();
      showDropdownMenu(e.target.closest('.drive-list-item-menu'), 'file', { 
        fileObj: result, 
        parentPath: result.path 
      });
      return;
    }
    // Files are not directly downloadable - use 3-dot menu
  });
  
  elements.fileList.appendChild(item);
}

function navigateToPath(targetPath) {
  // Clear search
  clearSearch();
  
  // Set current path
  currentPath = [...targetPath];
  
  // Render the target location
  renderCurrentView();
}

// Folder Operations (adapted for current tree structure)
async function handleNewFolder(folderPathArr) {
  const parentNode = getNodeFromPath(fileTree, folderPathArr);
  if (!parentNode) {
    showToast("Ошибка: папка не найдена");
    return;
  }

  if (!parentNode.folders) parentNode.folders = {};

  // Find a unique name ("new_folder", "new_folder_1", etc.)
  let base = "new_folder";
  let candidate = base;
  let counter = 1;
  while (parentNode.folders[candidate]) {
    candidate = `${base}_${counter++}`;
  }

  // Create the subfolder
  parentNode.folders[candidate] = {};

  // Re-render
  renderCurrentView();

  // Sync
  await saveFileTree();

  showToast(`Создана папка "${candidate}"`);
}

async function handleRenameFolder(folderPathArr) {
  const parentPath = folderPathArr.slice(0, -1);
  const oldName = folderPathArr[folderPathArr.length - 1];
  const parentNode = getNodeFromPath(fileTree, parentPath);
  
  if (!parentNode || !parentNode.folders || !parentNode.folders[oldName]) {
    showToast("Ошибка: папка не найдена");
    return;
  }

  showRenameDialog(
    "Переименовать папку",
    oldName,
    async newName => {
      // If unchanged or empty—do nothing
      if (!newName || newName.trim() === "" || newName === oldName) return;

      // Name clash?
      if (parentNode.folders[newName]) {
        showToast("Папка с таким именем уже существует.");
        return;
      }

      // Move subtree
      parentNode.folders[newName] = parentNode.folders[oldName];
      delete parentNode.folders[oldName];

      // Re-render & sync
      renderCurrentView();
      await saveFileTree();
    }
  );
}

function showDeleteFolderConfirmation(folderPathArr) {
  const folderName = folderPathArr[folderPathArr.length - 1];
  showConfirmDialog(
    `Удалить папку "${folderName}"?`,
    () => handleDeleteFolder(folderPathArr)
  );
}

async function handleDeleteFolder(folderPathArr) {
  const parentPath = folderPathArr.slice(0, -1);
  const folderName = folderPathArr[folderPathArr.length - 1];
  const parentNode = getNodeFromPath(fileTree, parentPath);
  
  if (!parentNode || !parentNode.folders || !parentNode.folders[folderName]) {
    showToast("Ошибка: папка не найдена");
    return;
  }
  
  const folderNode = parentNode.folders[folderName];

  // Only delete if truly empty
  const hasSubfolders = folderNode.folders && Object.keys(folderNode.folders).length > 0;
  const hasFiles = Array.isArray(folderNode.files) && folderNode.files.length > 0;

  if (hasSubfolders || hasFiles) {
    showToast("Папка должна быть пустой!");
    return;
  }

  delete parentNode.folders[folderName];

  // Re-render
  renderCurrentView();

  // Sync
  await saveFileTree();
  showToast(`Папка "${folderName}" удалена`);
}

// File Operations (from old design)
async function handleRenameFile(fileObj, parentPathArr) {
  // Extract old name and split into base/ext
  const oldName = fileObj.name; // e.g. "document.pdf"
  const dotIndex = oldName.lastIndexOf(".");
  const base = dotIndex > 0 ? oldName.slice(0, dotIndex) : oldName;
  const ext = dotIndex > 0 ? oldName.slice(dotIndex) : "";

  // Show the rename dialog, pre-filled with the base name
  showRenameDialog(
    "Переименовать файл",
    base,
    async newBase => {
      // Trim and ignore if empty or unchanged
      if (!newBase || newBase.trim() === "" || newBase === base) return;

      const newName = newBase + ext; 

      // Update in-memory tree
      const parentNode = getNodeFromPath(fileTree, parentPathArr);
      if (!parentNode || !parentNode.files) {
        showToast("Ошибка: не удалось найти файл");
        return;
      }
      
      const idx = parentNode.files.findIndex(f => f.file_id === fileObj.file_id);
      if (idx === -1) return; // safety

      parentNode.files[idx].name = newName;

      // Re-render & sync
      renderCurrentView();
      await saveFileTree();
    }
  );
}

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
    showToast("Что-то пошло не по плану - попробуй позже");
  }
}

function handleCut(fileObj, parentPathArr) {
  cutFileObj = fileObj;
  cutParentPath = parentPathArr.slice();
  showToast(`"${fileObj.name}" вырезан`);
}

function handleCutFolder(folderPathArr) {
  const folderName = folderPathArr[folderPathArr.length - 1];
  // For folders, we create a pseudo file object to maintain consistency
  cutFileObj = { 
    name: folderName, 
    isFolder: true,
    folderPath: folderPathArr 
  };
  cutParentPath = folderPathArr.slice(0, -1);
  showToast(`Папка "${folderName}" вырезана`);
}

async function handlePasteToFolder(folderPathArr) {
  if (!cutFileObj) {
    showToast("Нечего вставлять.");
    return;
  }

  if (cutFileObj.isFolder) {
    // Handle folder paste
    const oldParentNode = getNodeFromPath(fileTree, cutParentPath);
    const targetNode = getNodeFromPath(fileTree, folderPathArr);
    const folderName = cutFileObj.name;

    if (!oldParentNode || !targetNode || !oldParentNode.folders || !oldParentNode.folders[folderName]) {
      showToast("Ошибка: не удалось найти папку для перемещения");
      return;
    }

    if (!targetNode.folders) targetNode.folders = {};

    // Check if folder with same name exists in target
    if (targetNode.folders[folderName]) {
      showToast("Папка с таким именем уже существует.");
      return;
    }

    // Move the folder
    targetNode.folders[folderName] = oldParentNode.folders[folderName];
    delete oldParentNode.folders[folderName];

    showToast(`Папка "${folderName}" перемещена.`);
  } else {
    // Handle file paste
    const oldParentNode = getNodeFromPath(fileTree, cutParentPath);
    const targetNode = getNodeFromPath(fileTree, folderPathArr);
    
    if (!oldParentNode || !targetNode || !oldParentNode.files) {
      showToast("Ошибка: не удалось найти файл для перемещения");
      return;
    }

    const idx = oldParentNode.files.findIndex(f => f.file_id === cutFileObj.file_id);
    if (idx !== -1) {
      oldParentNode.files.splice(idx, 1);
    }

    // Add to new folder
    if (!targetNode.files) targetNode.files = [];
    targetNode.files.push({
      name: cutFileObj.name,
      file_id: cutFileObj.file_id,
      file_type: cutFileObj.file_type
    });

    showToast(`Файл "${cutFileObj.name}" перемещен.`);
  }

  // Clear cut state
  cutFileObj = null;
  cutParentPath = null;

  // Re-render entire tree
  renderCurrentView();

  // Sync with backend
  await saveFileTree();
}

function showDeleteFileConfirmation(fileObj, parentPath) {
  showConfirmDialog(
    `Удалить файл "${fileObj.name}"?`,
    () => handleDeleteFile(fileObj, parentPath)
  );
}

async function handleDeleteFile(fileObj, parentPathArr) {
  console.log('Deleting file:', fileObj, 'from path:', parentPathArr);
  const parentNode = getNodeFromPath(fileTree, parentPathArr);
  console.log('Parent node before delete:', parentNode);
  
  if (!parentNode || !parentNode.files) {
    showToast("Ошибка: не удалось найти файл");
    return;
  }
  
  const idx = parentNode.files.findIndex(f => f.file_id === fileObj.file_id);
  console.log('File index to delete:', idx);
  
  if (idx === -1) {
    console.log('File not found in parent node');
    return;
  }

  // Remove from local tree
  parentNode.files.splice(idx, 1);
  console.log('Parent node after delete:', parentNode);

  // If we had this file cut, clear that too
  if (cutFileObj && cutFileObj.file_id === fileObj.file_id) {
    cutFileObj = null;
    cutParentPath = null;
  }

  // Re-render IMMEDIATELY
  console.log('Re-rendering UI after delete');
  renderCurrentView();

  // Sync with backend
  try {
    await saveFileTree();
    console.log('Successfully synced delete with backend');
  } catch (error) {
    console.error('Error syncing delete with backend:', error);
  }
  
  showToast(`Файл "${fileObj.name}" удален`);
}

// Dialog functions (from old design)
function showRenameDialog(titleText, defaultValue, onConfirm) {
  const modal = document.getElementById("rename-modal");
  const title = modal.querySelector(".tg-modal-title");
  const input = document.getElementById("rename-input");
  const btnOk = document.getElementById("rename-confirm");
  const btnCancel = document.getElementById("rename-cancel");

  title.textContent = titleText;
  input.value = defaultValue;
  
  // Show modal
  elements.modalOverlay.style.display = 'flex';
  modal.style.display = 'block';
  input.focus();

  function cleanup() {
    elements.modalOverlay.style.display = 'none';
    modal.style.display = 'none';
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

function showConfirmDialog(message, onConfirm) {
  console.log('Showing confirm dialog:', message);
  const modal = document.getElementById("confirm-modal");
  const messageEl = document.getElementById("confirm-message");
  const btnOk = document.getElementById("confirm-ok");
  const btnCancel = document.getElementById("confirm-cancel");

  messageEl.textContent = message;
  
  // Show modal
  elements.modalOverlay.style.display = 'flex';
  modal.style.display = 'block';

  function cleanup() {
    elements.modalOverlay.style.display = 'none';
    modal.style.display = 'none';
    btnOk.removeEventListener("click", okHandler);
    btnCancel.removeEventListener("click", cancelHandler);
  }
  
  function okHandler() {
    console.log('User confirmed deletion, calling onConfirm function');
    onConfirm();
    cleanup();
  }
  
  function cancelHandler() {
    console.log('User cancelled deletion');
    cleanup();
  }

  btnOk.addEventListener("click", okHandler);
  btnCancel.addEventListener("click", cancelHandler);
}

// Helper function (adapted for current tree structure)
function getNodeFromPath(tree, pathArr) {
  let node = tree;
  for (const segment of pathArr) {
    if (node.folders && node.folders[segment]) {
      node = node.folders[segment];
    } else {
      return null; // Path doesn't exist
    }
  }
  return node;
}