// Design Library: one-click looks for the Image page. A style adds a short, tested
// phrase to the prompt. "Photo Transform" styles work on an uploaded picture.
import { isPaid } from './auth.js';

export const STYLE_CATEGORIES = [
  { id: 'photo', name: 'Photography' },
  { id: 'art', name: 'Art & Illustration' },
  { id: 'brand', name: 'Marketing & Brand' },
  { id: 'transform', name: 'Photo Transform', needsImage: true },
];

// [id, name, add-on, two colours for the tile, emoji-free icon name]
const RAW = {
  photo: [
    ['studio-product', 'Studio Product', 'professional studio product photo, clean seamless background, softbox lighting, sharp focus', '#e9edf3', '#aab4c4', 'bag'],
    ['lifestyle', 'Lifestyle', 'authentic lifestyle photo, natural window light, candid, shallow depth of field', '#f6d9b8', '#c98f5f', 'sun'],
    ['cinematic', 'Cinematic', 'cinematic film still, dramatic lighting, teal and orange grade', '#0f6b7a', '#f08a3c', 'film'],
    ['golden-hour', 'Golden Hour', 'golden hour sunlight, warm glow, soft long shadows', '#ffcf6b', '#f2793a', 'sun'],
    ['film-35mm', '35mm Film', 'shot on 35mm film, Portra colors, natural grain, nostalgic', '#d8c29a', '#7c8f6c', 'film'],
    ['black-white', 'Black & White', 'high-contrast black and white fine-art photography', '#f2f2f2', '#1b1b1f', 'blend'],
    ['food-magazine', 'Food Magazine', 'food magazine photography, styled props, appetising, soft light', '#f4b860', '#b5432c', 'star'],
    ['interior', 'Interior / Real Estate', 'bright real estate interior photography, wide angle, natural light', '#e8f0ea', '#8fb6a4', 'home'],
    ['macro', 'Macro', 'extreme macro close-up, fine detail, creamy bokeh', '#9be15d', '#00a37a', 'search'],
    ['aerial-drone', 'Aerial Drone', 'aerial drone shot, top-down perspective, wide view', '#63c7ff', '#2a7a5f', 'compass'],
  ],
  art: [
    ['cartoon-3d', '3D Cartoon', '3D animated movie style, cute expressive character, soft lighting', '#ffb26b', '#ff6f91', 'face'],
    ['glossy-icon', 'Glossy 3D Icon', 'glossy 3D icon, smooth rounded shapes, soft gradients', '#8ec5fc', '#e0c3fc', 'sparkle'],
    ['isometric', 'Isometric', 'isometric 3D miniature diorama, clean pastel colors', '#a8edea', '#fed6e3', 'layers'],
    ['clay-art', 'Clay Art', 'claymation style, handmade clay texture, playful', '#f6a56a', '#d9634c', 'paw'],
    ['flat-vector', 'Flat Vector', 'flat vector illustration, clean shapes, limited palette', '#5b8def', '#ffd166', 'pen'],
    ['anime', 'Anime', 'anime style, cel shading, vibrant colors', '#ff7eb3', '#7afcff', 'star'],
    ['watercolor', 'Watercolor', 'soft watercolor painting, paper texture, bleeding edges', '#b8e1ff', '#f7c6d9', 'palette'],
    ['childrens-book', "Children's Book", 'whimsical storybook illustration, gentle colors', '#ffe29a', '#9ad0c2', 'doc'],
    ['oil-painting', 'Oil Painting', 'classical oil painting, visible brush strokes', '#8a5a2b', '#d9a441', 'palette'],
    ['sticker', 'Sticker', 'die-cut sticker, thick white border, bold colors', '#ffffff', '#ff5d8f', 'check'],
  ],
  brand: [
    ['clean-corporate', 'Clean Corporate', 'clean corporate style, blue and white, professional, trustworthy', '#eaf2ff', '#2f6fed', 'chart'],
    ['luxury-premium', 'Luxury Premium', 'luxury aesthetic, black and gold, elegant, high-end ad', '#16130d', '#c9a24b', 'star'],
    ['minimal-tech', 'Minimal Tech', 'minimal tech aesthetic, lots of white space, sleek, soft shadows', '#f5f6f8', '#b9c0cc', 'code'],
    ['bold-pop', 'Bold Pop', 'bold saturated colors, high energy, scroll-stopping ad style', '#ff2e63', '#ffd400', 'megaphone'],
    ['soft-pastel', 'Soft Pastel', 'soft pastel palette, airy, gentle branding', '#ffd6e8', '#c8e7ff', 'palette'],
    ['eco-natural', 'Eco Natural', 'earthy tones, organic textures, sustainable brand feel', '#b7c9a0', '#6b7f4e', 'globe'],
    ['retro-poster', 'Retro Poster', 'vintage 1960s poster, screen-print texture, limited palette', '#e4572e', '#f3c969', 'poster'],
    ['festive-promo', 'Festive Promo', 'festive {season} theme, decorations, warm celebratory lighting', '#c62828', '#f6c453', 'sparkle',
      { key: 'season', label: 'Occasion', options: ['Christmas', 'New Year', 'Black Friday', 'Halloween', 'Easter', "Valentine's Day", 'Lunar New Year', 'Summer sale'] }],
  ],
  transform: [
    ['pro-headshot', 'Pro Headshot', 'turn into a professional corporate headshot, business attire, studio background', '#dfe6ee', '#5b6b82', 'user'],
    ['cartoon-me', 'Cartoon Me', 'turn into a 3D cartoon character, keep likeness', '#ffb26b', '#ff6f91', 'face'],
    ['anime-me', 'Anime Me', 'convert to anime portrait, keep likeness', '#ff7eb3', '#7afcff', 'star'],
    ['white-studio', 'White Studio Product', 'place product on clean white studio background, soft shadow', '#ffffff', '#d5dae2', 'bag'],
    ['background-swap', 'Background Swap', 'keep subject, replace background with {setting}', '#7fd3c4', '#4d7cff', 'swap',
      { key: 'setting', label: 'New background', options: ['a sunny beach', 'a modern office', 'a city street at night', 'a cozy cafe', 'a mountain landscape', 'a plain studio backdrop', 'a luxury hotel lobby'], custom: true }],
    ['virtual-staging', 'Virtual Staging', 'furnish this empty room in modern style, realistic', '#e8f0ea', '#8fb6a4', 'home'],
    ['sketch-render', 'Sketch to Render', 'turn this sketch into a photorealistic render', '#f2f2f2', '#555a66', 'pen'],
    ['photo-restore', 'Photo Restore', 'restore old photo, remove scratches, sharpen, natural color', '#c9b79c', '#6f5b45', 'history'],
  ],
};

// How many styles in each group a free trial account can use. Set STYLE_FREE_PER_CATEGORY=0 to lock the whole library.
const FREE_EACH = () => Math.max(0, Number(process.env.STYLE_FREE_PER_CATEGORY ?? 2));

export const STYLES = Object.entries(RAW).flatMap(([cat, list]) => list.map(([sid, name, addon, c1, c2, icon, variable], i) => ({
  id: sid, name, category: cat, addon, colors: [c1, c2], icon, variable: variable || null,
  needsImage: cat === 'transform', order: i,
})));

export const findStyle = (sid) => STYLES.find((s) => s.id === sid);
export const styleLocked = (user, style) => !isPaid(user) && style.order >= FREE_EACH();
export const publicStyles = (user) => STYLES.map((s) => ({ ...s, locked: user ? styleLocked(user, s) : s.order >= FREE_EACH() }));

/** The prompt that is sent to the image model for a style. `value` fills {season} or {setting}. */
export function applyStyle(style, prompt, value) {
  let addon = style.addon;
  if (style.variable) {
    const v = String(value || '').trim().slice(0, 80) || style.variable.options[0];
    addon = addon.replace(`{${style.variable.key}}`, v);
  }
  const text = String(prompt || '').trim();
  if (style.needsImage) return text ? `${addon}. ${text}` : addon;
  return `${text.replace(/[.\s]+$/, '')}. Style: ${addon}`;
}
