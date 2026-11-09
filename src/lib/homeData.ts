// Content for the home page, shared by every home-page variant (/, ...).
import projects from '../data/projects.json';
import faqs from '../data/faqs.json';
import articles from '../data/articles.json';
import { L } from './live';

export const slides = [
  { before: 'Dark__LE_upscale_prime.jpg', after: 'Tropical_Courtyard_Living_with_Koi_Pond_LE_upscale_prime.jpg', alt: 'A courtyard living room with a koi pond, lit by a SUNROOOF skylight' },
  { before: 'dark_LE_upscale_prime.jpg', after: 'ChatGPT_Image_Jun_20_2026_05_31_17_PM_LE_upscale_prime.jpg', alt: 'A saree store ceiling with a SUNROOOF skylight and hanging plants' },
];
export const mosaic = [
  ['gal-home-one_8c97d402-1828-498f-a3e6-517dd70343d6.png', 'Greens', 'Hanging plants under a SUNROOOF skylight'],
  ['23_fb456f7f-9e52-47f7-8abc-f05cbadad6c4.jpg', 'French Window', 'A SUNROOOF French window in a bright room'],
  ['atrium.jpg', 'Atrium', 'An atrium lit by a SUNROOOF skylight'],
  ['gal-home-one5_54e41b4f-9616-47e8-aa4b-585a84ed9393.jpg', 'Minimalist Wood', 'A minimalist wood SUNROOOF ceiling'],
  ['MIL09955.jpg', 'Classical White', 'A classical white SUNROOOF ceiling'],
  ['gal-home-one7_e28d9734-850e-4351-a590-029a5c67dc76.jpg', 'Classical Wood', 'A classical wood SUNROOOF ceiling'],
];
export const apps: Record<string, string[]> = { Commercial: ['Lounge', 'Office', 'Wellness centres', 'Retail store'], Residential: ['Living room', 'Bedroom', 'Kitchen', 'Basements'] };
export const designs: Record<string, string[]> = {
  Classical: ['class-b1.png', 'class-b2.png', 'class-b3.png'],
  Minimalist: ['classw2.png', 'class-b2.png', 'class-b1.png'],
  Greens: ['class-b3.png', 'class-b1.png', 'class-b2.png'],
};
export const skyTabs = [
  { t: 'Sun Dial', img: 'sky-slider-tab-1-desk.png', alt: 'A hand turning the SUNROOOF Sun Dial on a wooden table in sunlight' },
  { t: 'App Control', img: 'sky-slider-tab-2-desk.png', alt: 'A phone controlling SUNROOOF light in a living room' },
];
export const spaces = [
  ...['1_5c34eee2-04b4-4a05-8210-ee238276b971.jpg', '2_b748d602-2596-4b13-a164-5d14af9d5021.png', '11_5c637a04-be3b-43e4-b264-85061f1d6b68.jpg', '4_95beff59-0345-4eb1-8b04-30640fdf5d54.png', 'Container_4.png', 'Container_5.png'].map(f => ({ src: L(f, 900), type: 'all' })),
  ...projects.filter(p => p.type === 'Commercial').slice(0, 6).map(p => ({ src: p.image + '?width=900', type: 'commercial' })),
  ...projects.filter(p => p.type === 'Residential').slice(0, 6).map(p => ({ src: p.image + '?width=900', type: 'residential' })),
];
export const logoNames = ['Danube-Properties.webp', 'Reliance.jpg', 'Johnson-Johnson-Logo.png', 'KohlerLogoImage.jpg', 'Good_Earth.jpg', 'Libas.png', 'Mokobara.png', 'JW_Marriott-removebg-preview.png', 'SBI.png', 'Fortis_Final.png', 'Blue_Tokai_Updated.png', 'RattanIndia_Logo.jpg', 'Manas_Logo.png'];
export const vids = [
  ['https://www.youtube.com/watch?v=ZmCRLJEpweQ', 'thumbnail.webp', 'Shilpa Shetty on SUNROOOF'],
  ['https://www.youtube.com/watch?v=cTGe-vPRIbc', 'thum2_1.png', 'A SUNROOOF customer story'],
  ['https://www.youtube.com/watch?v=h9bLDkK84Yw', 'thum4.webp', 'A SUNROOOF customer story'],
  ['https://youtu.be/NP9eIikz1to', 'yt.webp', 'A SUNROOOF customer story'],
  ['https://www.youtube.com/watch?v=hfBli25m_m8', 'thumbnail0.webp', 'A SUNROOOF customer story'],
];
export const reels = ['6d94a2fae92f4ee7bbd12366534f4b2f.HD-1080p-2.5Mbps-99321680', '9451a5b226bf47ccb0a0d88e21c55dd8.HD-1080p-2.5Mbps-99321679', '00b2b0ae1d6148dea6042c1f6c9edfec.HD-1080p-2.5Mbps-99321676', '13128d2ce1c844acb80bc5567eeba717.HD-1080p-2.5Mbps-99321677', '0ebc3e8f5760420c88f64add0b7313d4.HD-1080p-2.5Mbps-99321678'];
export const centres = [
  ['Delhi Flagship', 'Plot 352, Mehrauli-Gurgaon Rd, Sultanpur, New Delhi, Delhi 110030', 'https://maps.app.goo.gl/tjQR77emirzW15k36', 'stor-location-1.png'],
  ['Delhi West', '12/1, WHS, Block A, Kirti Nagar Industrial Area, Kirti Nagar, Delhi, 110015', 'https://maps.app.goo.gl/4f92tpEptMMKtMoh8', 'stor-location-2.png'],
  ['Bengaluru Flagship', 'SUNROOOF 1154, 12th Main Rd, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038', 'https://maps.app.goo.gl/xBGzz1SgnsBrhow87', 'stor-location-3.png'],
  ['Mumbai', 'Office no 1615B, 16th floor, One Lodha Place, Senapati Bapat Marg, Dadar West, Lower Parel, Mumbai', 'https://maps.app.goo.gl/i3Bbpj9ABkLav2aL8', 'stor-location-4.png'],
  ['Surat', 'SUNROOOF Solaris Cube Ground floor Vesu, Maharana Pratap Road Surat 395007', 'https://maps.app.goo.gl/nYkzQapaTQE3dMFJ7', 'stor-location-5.png'],
  ['Mohali', 'SCO 66, Sector 82, JLPL Industrial Area, Sahibzada Ajit Singh Nagar, Punjab 140306', 'https://maps.app.goo.gl/7xM7KXQrszJJF6Ae9', 'stor-location-6.png'],
  ['Hyderabad', 'Plot No. 1057, 8-2-193/B2/JIII/550/L, Road No. 45, Jubilee Hills, Hyderabad 500033', '', 'stor-location-7.png'],
  ['Coimbatore', '70, Thiruvenkatasamy Road (West), R. S. Puram, Coimbatore, Tamil Nadu 641002', '', '9_3d9793ff-43b4-43d2-a346-67ddc9687716.jpg'],
  ['Dubai', '+971 54 201 0504', '', 'stor-location-8.png'],
];
export const faqTop = faqs.slice(0, 4);
export const posts = articles.slice(0, 4);
export const arrow = '<svg viewBox="0 0 11 18" width="11" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1 1l8 8-8 8"/></svg>';
