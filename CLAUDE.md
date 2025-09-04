# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram Mini App frontend for a cloud drive service. It's a pure frontend JavaScript application that integrates with Telegram Web Apps API and communicates with a backend API for file management.

## Architecture

- **Frontend**: Vanilla HTML/CSS/JavaScript (no build system or frameworks)
- **Integration**: Telegram Web Apps API via telegram-web-app.js CDN
- **Backend API**: REST API at `https://tgdrive-backend.sh-development.ru/`
- **File Structure**: Single-page application with modal dialogs and search functionality

### Key Files

- `index.html` - Main HTML structure with Telegram-native navigation, file browser, search, and modals
- `app.js` - Core application logic (~1600+ lines) with modular function organization
- `style.css` - Telegram Web App theming with backdrop blur effects and responsive design
- `assets/dictionary.json` - File type to icon mapping for visual file browser
- `assets/*.png` - File type icons (photo, document, video, audio, voice, video_note, default) and background

### Application Structure

The app is organized as a single-page application with these main components:

1. **Telegram Header**: Native header with back button, title, and info button
2. **File Browser**: Google Drive-style navigation with breadcrumb and current folder actions
3. **Search**: Real-time file/folder search with result navigation
4. **File Management**: Upload (drag & drop + file input), download, cut/paste, delete, rename operations
5. **Context Menus**: Long-press and right-click context menus for files/folders
6. **Modals & Dialogs**: Rename dialogs, delete confirmations, toast notifications

### State Management

The app maintains client-side state through global variables in `app.js`:
- `fileTree` - In-memory hierarchical file structure mirroring backend data
- `currentPath` - Array representing current navigation path
- `expandedPaths` - Set of expanded folder paths for tree navigation
- `iconMap` - File extension to icon mapping loaded from dictionary.json
- `cutFileObj`/`cutParentPath` - Cut/paste operation state
- `isSearching`/`searchQuery` - Search state management

### API Integration

All file operations sync with backend via `/get_data` and `/update_data` endpoints using the user's Telegram ID and a secret token. The app includes debug mode configuration for development.

## Development Commands

Since this is a vanilla JavaScript project, there are no build commands. For development:

- Serve files via local HTTP server: `python -m http.server 8000` or similar
- Open in browser and use Telegram Web Apps dev tools
- Set `DEBUG = true` in app.js for development mode (uses hardcoded user ID)
- No linting, testing, or build processes configured

## Code Architecture

The main application logic in `app.js` is organized into functional modules:

### Core Functions
- `loadIconMap()`, `loadFileTree()`, `saveFileTree()` - Data loading and persistence
- `renderCurrentView()`, `renderFileList()` - UI rendering and state updates
- `buildTree()`, `getNodeFromPath()` - Tree data structure manipulation

### Navigation & UI
- `navigateBack()`, `navigateToPath()`, `updateBreadcrumb()` - Navigation handling
- `showContextMenu()`, `showDropdownMenu()` - Context menu systems
- `showRenameModal()`, `showDeleteConfirmation()` - Modal dialogs

### File Operations  
- `handleUpload()`, `handleDownload()`, `handleCut()`, `handlePaste()` - File management
- `handleNewFolder()`, `handleRenameFile()`, `handleDeleteFile()` - CRUD operations
- Search functionality: `performSearch()`, `searchFiles()`, `renderSearchResults()`

## Code Conventions

- Russian language used in UI strings and user-facing text
- camelCase for JavaScript variables and functions  
- Async/await for API calls with error handling
- Event delegation for dynamic UI elements
- Global state management through module-level variables
- Telegram Web App theming integration