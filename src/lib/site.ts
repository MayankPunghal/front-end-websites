import products from '../data/products.json';
import projects from '../data/projects.json';

export type Product = (typeof products)[number];
export type Project = (typeof projects)[number];

export const SITE = {
  name: 'SUNROOOF',
  tagline: 'The sky, in any room.',
  phone: { in: '+91 98117 73388', ae: '+971 54 201 0504' },
  email: 'contact@sunrooof.com',
  instagram: 'https://instagram.com/sunrooof_',
  youtube: 'https://www.youtube.com/@Sunrooof',
  legal: 'SUNROOOF LUMINARIES PRIVATE LIMITED',
  parent: 'MAGPPIE Group',
  formEndpoint: 'https://ecf.cirkleinc.com/api/form-submit', // existing sales-team lead integration: unchanged
  liveOrigin: 'https://sunrooof.com',
};

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/collections', label: 'Products' },
  { href: '/pages/gallery', label: 'Gallery' },
  { href: '/pages/about-us', label: 'About Us' },
  { href: '/pages/clients', label: 'Our Clients' },
  { href: '/pages/contact-us', label: 'Contact Us' },
];

export const CENTRES = ['Delhi Flagship', 'Delhi West', 'Bengaluru Flagship', 'Mumbai', 'Surat', 'Mohali', 'Hyderabad', 'Coimbatore', 'Dubai'];

export const COLLECTIONS = [
  { handle: 'minimalist-sunrooof', family: 'minimalist', title: 'Minimalist', kind: 'skylight' },
  { handle: 'classical-sunrooof', family: 'classical', title: 'Classical', kind: 'skylight' },
  { handle: 'modern-sunrooof', family: 'modern', title: 'Modern', kind: 'skylight' },
  { handle: 'french-window', family: 'french-window', title: 'French Window', kind: 'window' },
  { handle: 'arch-window', family: 'arch-window', title: 'Arch Window', kind: 'window' },
  { handle: 'louvered-window', family: 'louvered-window', title: 'Louvered Window', kind: 'window' },
  { handle: 'accessories', family: 'accessories', title: 'Accessories', kind: 'accessory' },
];

export const inr = (n: number) => '₹ ' + new Intl.NumberFormat('en-IN').format(n);

/** Shopify CDN image with width param: the CDN resizes and serves WebP/AVIF by Accept header. */
/** pj: product room renders decode slowly as WebP/AVIF under CPU throttling (lab TBT 1.3 s); progressive JPEG measured 0 ms. */
export const img = (url: string, w: number, pj = false) => `${url}?width=${w}${pj ? '&format=pjpg' : ''}`;
export const srcset = (url: string, widths: number[], pj = false) => widths.map(w => `${img(url, w, pj)} ${w}w`).join(', ');

export const byHandle = (h: string) => products.find(p => p.handle === h)!;
export const productsOf = (family: string) => products.filter(p => p.family === family);
export const collectionOf = (p: Product) => COLLECTIONS.find(c => c.family === p.family)!;

/** Source copy has typos ("celling", "blonding"); fix them, keep the facts. */
export const clean = (t: string) => t.replace(/celling/g, 'ceiling').replace(/blonding/g, 'blending').replace(/aluminum/g, 'aluminium').replace(/\s+/g, ' ').trim();
export const blurb = (family: string) =>
  family === 'accessories'
    ? 'App control is included with every SUNROOOF. Keypads and remotes are optional extras.'
    : clean(productsOf(family)[0]?.description ?? '');

/** Public figures and brands shown on sunrooof.com (names, roles and photos as published there). */
export const CDN = 'https://cdn.shopify.com/s/files/1/0693/8270/1216/files/';
export const portraits = [
  ['Mr. Mukesh Ambani', 'Reliance Industry', '7_5f8f06ef-a946-4171-a390-0d2b10400e7d.jpg'],
  ['Mrs. Shilpa Shetty', 'Actress', '1_4e88eab9-c1dd-47cb-b0e6-c72ac5d6768e.jpg'],
  ['Mr. Peyush Bansal', 'Founder of Lenskart', '5_b0ef2593-82da-4e34-ad7d-d29ca7129555.jpg'],
  ['Mr. Deepinder Goyal', 'CEO Zomato', '2.jpg'],
  ['Mr. Nitin Gadkari', 'Politician', '13.jpg'],
  ['Mr. Raj Kumar Hirani', 'Bollywood Movie Director', '9_1b4c55a1-a71a-41dc-ac2d-6540c126482d.jpg'],
  ['Mrs. Sarah Sham', 'Interior Designer', '4_6d260e50-73fa-4e0f-b780-ab0414ed51ef.jpg'],
  ['Mr. Rizwan Sajan', 'Founder of Danube Properties', '6_a98c90f1-5134-4e39-8439-72a9373d0d1d.jpg'],
  ['Mr. Puneet Yadu Dalmia', 'MD Dalmia Group', '12_73930f51-e755-4229-ba86-b662c0610cb2.jpg'],
  ['Mrs. Anita Lal', 'Owner of Good Earth', '3.jpg'],
  ['Dr. Ritesh Malik', 'Entrepreneur & Investor', '8.jpg'],
];
export const logos = ['Image_Reliance_Logo.png', 'Image_Kohler_Logo.png', 'Image_Good_Earth_Logo.png', 'Image_Libas_Logo.png', 'Image_Mokobara_Logo.png', 'Image_JW_Marriott_Logo.png', 'Image_RattanIndia_Logo.png'];
