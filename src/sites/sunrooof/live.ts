import map from './live-images.json';
const m = { ...(map as Record<string, string>), 'After_LE_upscale_prime.jpg': 'https://sunrooof.com/cdn/shop/files/After_LE_upscale_prime.jpg', 'Before_LE_upscale_prime.jpg': 'https://sunrooof.com/cdn/shop/files/Before_LE_upscale_prime.jpg' } as Record<string, string>; // the café pair is a CSS background on the live site, so it is not in the scraped <img> list
/** Image from sunrooof.com's own CDN by file name (as published on the live home page), resized by the CDN. */
const CDN_FILES = 'https://cdn.shopify.com/s/files/1/0693/8270/1216/files/';
export const L = (name: string, w: number) => `${m[name] ?? CDN_FILES + name}?width=${w}`;
export const LS = (name: string, ws: number[]) => ws.map(w => `${L(name, w)} ${w}w`).join(', ');
export const REEL = 'https://sunrooof.com/cdn/shop/videos/c/vp';
