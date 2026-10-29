// Cartes personnalisées : un dos, 16 têtes (V/C/D/R × 4 enseignes) et 22 atouts (Excuse + 1 à 21).
const KEY = 'crapette.skin.v1';

export const HEADS = 16;
export const ATOUTS = 22; // indice = rang de l'atout (0 = Excuse)
export const emptySkin = () => ({ back: null, heads: Array(HEADS).fill(null), atouts: Array(ATOUTS).fill(null) });
export const headIndex = (rank, suit) => (rank - 11) * 4 + suit;

export function loadSkin() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.heads)) {
      // anciennes sauvegardes (V/D/R, sans cavalier) : on insère la place des cavaliers
      if (s.heads.length === 12) s.heads = [...s.heads.slice(0, 4), ...Array(4).fill(null), ...s.heads.slice(4)];
      if (!Array.isArray(s.atouts) || s.atouts.length !== ATOUTS) s.atouts = Array(ATOUTS).fill(null);
      if (s.heads.length === HEADS) return s;
    }
  } catch {}
  return emptySkin();
}

export function saveSkin(skin) {
  try { localStorage.setItem(KEY, JSON.stringify(skin)); } catch {}
}

// Recadre l'image au centre au ratio voulu, la réduit et la renvoie en JPEG (data URL).
export function fileToDataUrl(file, w, h, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(w / img.width, h / img.height);
      const sw = w / scale, sh = h / scale;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}
