# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram Mini App frontend for a cloud drive service. It's a pure frontend JavaScript application that integrates with Telegram Web Apps API and communicates with a backend API for file management.

## Architecture

- **Frontend**: Vanilla HTML/CSS/JavaScript (no build system or frameworks)
- **Integration**: Telegram Web Apps API via telegram-web-app.js CDN
- **Backend API**: REST API at `https://tgdrive-backend.sh-development.ru/`
- **File Structure**: Single-page application with modal dialogs

### Key Files

- `index.html` - Main HTML structure with navigation, file browser, and modals
- `app.js` - Core application logic (~1000+ lines)
- `style.css` - All styling with backdrop blur effects and responsive design
- `assets/dictionary.json` - File type to icon mapping
- `assets/*.png` - File type icons and background image

### Application Structure

The app is organized as a single-page application with these main components:

1. **Navigation**: Top nav with Home/Info buttons
2. **File Browser**: Tree-view file/folder browser with context menus
3. **Modals**: Rename dialog and toast notifications
4. **File Management**: Upload, download, cut/paste, delete operations

### State Management

The app maintains client-side state through global variables:
- `fileTree` - In-memory hierarchical file structure
- `expandedPaths` - Set of expanded folder paths
- `iconMap` - File extension to icon mapping
- `cutFileObj`/`cutParentPath` - Cut/paste operation state

### API Integration

All file operations sync with backend via `/get_data` and `/update_data` endpoints using the user's Telegram ID and a secret token.

## Development Commands

Since this is a vanilla JavaScript project, there are no build commands. For development:

- Serve files via local HTTP server: `python -m http.server 8000` or similar
- Open in browser and use Telegram Web Apps dev tools
- No linting, testing, or build processes configured

## Code Conventions

- Russian language used in UI strings
- camelCase for JavaScript variables and functions  
- Async/await for API calls
- Event delegation for dynamic UI elements
- Inline styles for modal components