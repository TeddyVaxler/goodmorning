// A player's theme choice. 'system' (nothing saved) follows the device's dark mode setting.
export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

// Puts a saved choice on <html> before the first paint (inlined by app/layout.tsx)
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
