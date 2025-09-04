// SVG Icons for Telegram Drive App
// These icons are designed to match the app's color scheme and load instantly

const SVG_ICONS = {
  folder: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M10 4H4C2.9 4 2 4.9 2 6v12c0 1.1 0.9 2 2 2h16c1.1 0 2-0.9 2-2V8c0-1.1-0.9-2-2-2h-8l-2-2z" 
          fill="#8e8e93" stroke="none"/>
  </svg>`,
  
  document: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6c-1.1 0-2 0.9-2 2v16c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2V8l-6-6z" 
          fill="#8e8e93" stroke="none"/>
    <path d="M14 2v6h6" stroke="#ffffff" stroke-width="2" fill="none"/>
    <path d="M8 13h8M8 17h8M8 9h2" stroke="#ffffff" stroke-width="1.5"/>
  </svg>`,
  
  photo: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="#34c759"/>
    <circle cx="8.5" cy="8.5" r="1.5" fill="#ffffff"/>
    <path d="M21 15l-5-5L5 21h14c1.1 0 2-0.9 2-2v-4z" fill="#ffffff" opacity="0.8"/>
  </svg>`,
  
  video: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="3" width="20" height="14" rx="2" fill="#ff6b6b"/>
    <polygon points="10,8 16,12 10,16" fill="#ffffff"/>
    <circle cx="19" cy="6" r="2" fill="#ffffff" opacity="0.9"/>
  </svg>`,
  
  audio: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#ff9500"/>
    <path d="M12 6v12l4-2v-8z" fill="#ffffff"/>
    <circle cx="12" cy="18" r="2" fill="#ffffff"/>
  </svg>`,
  
  voice: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="2" width="6" height="12" rx="3" fill="#5856d6"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="#5856d6" stroke-width="2" fill="none"/>
  </svg>`,
  
  video_note: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#00d4aa"/>
    <polygon points="10,8 16,12 10,16" fill="#ffffff"/>
    <circle cx="18" cy="6" r="3" fill="#ffffff" opacity="0.9"/>
    <path d="M18 6v0" stroke="#00d4aa" stroke-width="2"/>
  </svg>`,
  
  default: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="16" rx="2" fill="#8e8e93"/>
    <path d="M7 8h10M7 12h10M7 16h6" stroke="#ffffff" stroke-width="1.5"/>
  </svg>`
};

// Function to get SVG icon as data URL for img src
function getSVGIcon(type) {
  const svg = SVG_ICONS[type] || SVG_ICONS.default;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Function to get SVG icon as HTML string for direct insertion
function getSVGIconHTML(type) {
  return SVG_ICONS[type] || SVG_ICONS.default;
}