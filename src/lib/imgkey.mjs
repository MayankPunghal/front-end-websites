import { createHash } from 'node:crypto';
/** Canonical key for a remote image: https, no query, sunrooof.com/cdn/shop mapped to the Shopify CDN path (same asset). */
export const key = u => u.replace(/^http:/, 'https:').replace(/[?#].*$/, '').replace('https://sunrooof.com/cdn/shop/', 'https://cdn.shopify.com/s/files/1/0693/8270/1216/');
export const id = u => createHash('sha1').update(u).digest('hex').slice(0, 10);
