
export const WAVEBANDS = [
  410, 435, 460, 485, 510, 535, 560, 585, 610, 
  645, 680, 705, 730, 760, 810, 860, 900, 940
];

/**
 * Standard Whiteboard Correction Coefficients for each band
 */
export const WHITEBOARD_COEFFICIENTS = [
  0.984, // 410nm
  0.985, // 435nm
  0.986, // 460nm
  0.987, // 485nm
  0.987, // 510nm
  0.987, // 535nm
  0.988, // 560nm
  0.988, // 585nm
  0.988, // 610nm
  0.988, // 645nm
  0.988, // 680nm
  0.988, // 705nm
  0.988, // 730nm
  0.987, // 760nm
  0.987, // 810nm
  0.988, // 860nm
  0.988, // 900nm
  0.987  // 940nm
];

export const P7_MAGIC = [0x77, 0xCC];
export const P7_FCS = [0x00, 0x00];

export const APP_THEME = {
  primary: '#10b981', // Emerald 500
  secondary: '#3b82f6', // Blue 500
  accent: '#f59e0b', // Amber 500
};
