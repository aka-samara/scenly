// AI Apps: one-purpose tools built from a prompt template, a model and fixed
// settings. Add an app by adding an entry here; no other code changes needed.
//
// inputs: image (reference image), images (up to 2), video (reference video or link), text,
//   subject (a saved Character, or an uploaded photo; kinds = which Character types fit),
//   select (a list of options; each option's prompt replaces {key} in the template),
//   consent (a box the user must tick)
// frame: key of the input whose shape the result follows. The gateway only makes square (1024x1024) and
//   portrait (1024x1536) pictures, so a portrait source gives a portrait result and anything else a square one.
// settings: defaults the user can change in the pop-up (image: size; video: resolution, ratio, duration)
// prompt: template; {text} is replaced by the user's text (or the input's default)
// variants: optional list of { label, prompt }; the app makes one image per variant
// Image models take at most two reference images. The subject always travels first.
// models: preference order; the first one available on the gateway is used

export const APPS = [
  {
    id: 'product-photoshoot', name: 'Product Photoshoot', category: 'image', badge: 'Popular',
    tagline: 'One product photo, a studio-quality shot',
    description: 'Upload a product photo and describe the scene. The product stays exactly as it is while the background, light and styling become a professional photoshoot.',
    colors: ['#ff8a5b', '#ffd36e'], icon: 'bag',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['product', 'brand'], label: 'Product', required: true },
      { key: 'text', type: 'text', label: 'Scene', placeholder: 'On a marble counter with soft morning light and eucalyptus leaves', default: 'a clean premium studio set with soft light and gentle shadows' },
    ],
    models: ['seedream-5.0-pro', 'gpt-image-2', 'nano-banana-2'],
    prompt: 'Professional commercial product photography. Keep the product exactly as in the reference image: same shape, colours, label and logo. Place it in this scene: {text}. Sharp focus, realistic reflections, magazine-quality lighting.',
  },
  {
    id: 'outfit-changer', frame: 'image', name: 'Outfit Changer', category: 'image',
    tagline: 'Try on any outfit in one click',
    description: 'Upload a photo of a person and describe new clothes. Face, pose and background stay the same.',
    colors: ['#c471f5', '#fa71cd'], icon: 'shirt',
    inputs: [
      { key: 'image', type: 'image', label: 'Portrait photo', required: true },
      { key: 'text', type: 'text', label: 'New outfit', placeholder: 'A cream linen suit with a white t-shirt', required: true },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Change only the clothing of the person in the image to: {text}. Keep the face, hair, body, pose, lighting and background exactly the same. Photorealistic fabric and fit.',
  },
  {
    id: 'image-expander', name: 'Image Expander', category: 'image',
    tagline: 'Zoom out and extend a picture',
    description: 'Zoom out of an image and fill in what is around it, as a tall portrait or a square, keeping the style, light and perspective consistent.',
    colors: ['#43cea2', '#185a9d'], icon: 'expand',
    inputs: [
      { key: 'image', type: 'image', label: 'Image to expand', required: true },
      { key: 'text', type: 'text', label: 'What to add around it (optional)', placeholder: 'More of the beach and sky', default: 'a natural continuation of the existing scene' },
    ],
    models: ['seedream-5.0-pro', 'gpt-image-2', 'nano-banana-2'],
    settings: { size: '1024x1536' },
    prompt: 'Zoom out and expand this image beyond its original borders, showing {text}. The original content stays unchanged in the centre. Match the style, lighting, colour and perspective seamlessly.',
  },
  {
    id: 'avatar-maker', name: 'AI Avatar Maker', category: 'image',
    tagline: 'Turn a selfie into a styled avatar',
    description: 'Upload a portrait and pick a style. The avatar keeps your face recognisable.',
    colors: ['#f7971e', '#ffd200'], icon: 'user',
    inputs: [
      { key: 'image', type: 'image', label: 'Your photo', required: true },
      { key: 'text', type: 'text', label: 'Style', placeholder: '3D animated film character, warm lighting', default: 'a polished 3D animated character with soft studio lighting' },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Create a head-and-shoulders avatar of the person in the photo in this style: {text}. Keep their facial features, hairstyle and expression recognisable. Clean background.',
  },
  {
    id: 'sketch-render', frame: 'image', name: 'Sketch to Render', category: 'image',
    tagline: 'Sketches into photorealistic renders',
    description: 'Upload a sketch or line drawing and get a production-ready render that respects its proportions and design intent.',
    colors: ['#8e9eab', '#eef2f3'], icon: 'pen',
    inputs: [
      { key: 'image', type: 'image', label: 'Sketch', required: true },
      { key: 'text', type: 'text', label: 'Materials and setting (optional)', placeholder: 'Brushed aluminium, studio backdrop', default: 'realistic materials on a neutral studio backdrop' },
    ],
    models: ['seedream-5.0-pro', 'gpt-image-2', 'nano-banana-2'],
    prompt: 'Turn this sketch into a photorealistic, high-fidelity render. Follow its linework, proportions and design exactly. Use {text}. Professional lighting.',
  },
  {
    id: 'photo-enhancer', frame: 'image', name: 'Photo Restore', category: 'image',
    tagline: 'Sharpen and clean up old or blurry photos',
    description: 'Upload a blurry, noisy, faded or scratched photo and get a clear, detailed version that still looks natural. The result is about 1,000 pixels wide.',
    colors: ['#00c6ff', '#0072ff'], icon: 'sparkle',
    inputs: [{ key: 'image', type: 'image', label: 'Photo', required: true }],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Restore and enhance this photo: remove blur and noise, sharpen fine detail, correct exposure and colour. Keep the content, faces and composition exactly the same. Natural, not over-processed.',
  },
  {
    id: 'text-replacer', frame: 'image', name: 'Image Text Editor', category: 'image',
    tagline: 'Replace the words in an image',
    description: 'Upload an image with text and type the new words. They are redrawn in a matching font and background.',
    colors: ['#ee0979', '#ff6a00'], icon: 'type',
    inputs: [
      { key: 'image', type: 'image', label: 'Image with text', required: true },
      { key: 'text', type: 'text', label: 'New text', placeholder: 'GRAND OPENING · 20% OFF', required: true },
    ],
    models: ['gpt-image-2', 'nano-banana-2', 'seedream-5.0-pro'],
    prompt: 'Replace the main text in this image with exactly: "{text}". Match the original font style, size, colour, perspective and background. Change nothing else.',
  },
  {
    id: 'poster-maker', name: 'Poster Maker', category: 'image',
    tagline: 'Bold posters with accurate text',
    description: 'Describe an event or product and get a ready-to-share poster with clean typography.',
    colors: ['#654ea3', '#eaafc8'], icon: 'poster',
    inputs: [{ key: 'text', type: 'text', label: 'What is the poster for?', placeholder: 'Summer jazz night, 12 July, Riverside Park, free entry', required: true }],
    models: ['gpt-image-2', 'seedream-5.0-pro', 'nano-banana-2'],
    settings: { size: '1024x1536' },
    prompt: 'Design a striking, modern poster for: {text}. Clear hierarchy, accurate spelling of every word, balanced layout, bold colours, print quality.',
  },
  {
    id: 'image-blender', name: 'Image Blender', category: 'image',
    tagline: 'Blend two images into one',
    description: 'Upload two images and describe how to combine them: a subject in a new place, two styles merged, or two products together.',
    colors: ['#ff9a9e', '#a18cd1'], icon: 'blend',
    inputs: [
      { key: 'images', type: 'images', label: 'Two images', required: true, max: 2 },
      { key: 'text', type: 'text', label: 'How to combine them', placeholder: 'Put the dog from image 1 into the living room from image 2', required: true },
    ],
    models: ['nano-banana-2', 'gpt-image-2', 'seedream-5.0-pro'],
    prompt: 'Combine the reference images: {text}. Make the result look like one coherent, realistic photo with consistent lighting and perspective.',
  },
  {
    id: 'product-spin', name: '360° Product Spin', category: 'video', badge: 'New',
    tagline: 'A smooth turntable video of any product',
    description: 'Upload a product photo to create a smooth 360-degree rotation that shows every angle.',
    colors: ['#11998e', '#38ef7d'], icon: 'rotate',
    inputs: [{ key: 'subject', type: 'subject', kinds: ['product'], label: 'Product', required: true }],
    models: ['doubao-seedance-2.0-fast', 'doubao-seedance-2.0', 'doubao-seedance-2-5'],
    settings: { resolution: '720p', ratio: '1:1', duration: 5 },
    prompt: 'The subject from the reference image rotates a smooth, continuous 360 degrees on a turntable. Camera stays still. Clean studio background, soft even lighting, subtle reflections.',
  },
  {
    id: 'ad-video', name: 'Photo to Ad Video', category: 'video', badge: 'Popular',
    tagline: 'A 10-second commercial from one photo',
    description: 'Upload a product photo and name the product. Get a short, cinematic ad with dramatic camera moves and close-ups.',
    colors: ['#f12711', '#f5af19'], icon: 'megaphone',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['product', 'brand'], label: 'Product', required: true },
      { key: 'text', type: 'text', label: 'Product and mood', placeholder: 'Dark chocolate bar, luxurious and indulgent', required: true },
    ],
    models: ['doubao-seedance-2-5', 'doubao-seedance-2.0', 'doubao-seedance-2.0-fast'],
    settings: { resolution: '720p', ratio: '16:9', duration: 10 },
    prompt: 'A premium cinematic commercial for {text}, based on the product in the reference image. Slow dolly-in, macro close-ups of textures, elegant light sweeps, shallow depth of field, a final hero shot. Upbeat music.',
  },
  {
    id: 'photo-alive', name: 'Bring Photo to Life', category: 'video',
    tagline: 'Animate any still photo',
    description: 'Upload a photo and it gently comes alive: natural motion, a slow camera push-in and ambient sound.',
    colors: ['#4568dc', '#b06ab3'], icon: 'play',
    inputs: [
      { key: 'image', type: 'image', label: 'Photo', required: true },
      { key: 'text', type: 'text', label: 'What should move? (optional)', placeholder: 'Her hair moves in the wind and she smiles', default: 'subtle natural motion in the scene' },
    ],
    models: ['doubao-seedance-2.0-fast', 'doubao-seedance-2.0', 'doubao-seedance-2-5'],
    settings: { resolution: '720p', duration: 5 },
    prompt: 'Animate this photo: {text}. Gentle camera push-in with soft parallax. Keep the people and objects consistent with the photo. Natural ambient sound.',
  },
  // ---------- characters, faces and portraits ----------
  {
    id: 'character-scenes', name: 'Character Scenes', category: 'image', group: 'character', badge: 'New',
    tagline: 'The same face in any scene, outfit or pose',
    description: 'Pick a saved Character or upload a photo, then describe a new scene. The face stays the same while the setting, outfit and pose change.',
    colors: ['#7f5af0', '#2cb67d'], icon: 'user',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Person', required: true },
      { key: 'text', type: 'text', label: 'New scene, outfit or pose', placeholder: 'Walking through a rainy Tokyo street at night in a long beige trench coat, looking over her shoulder', required: true },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Create a new photo of the person from reference image 1: {text}. Keep the same face, facial features, skin tone and hair so they are clearly the same person. Give them a natural new pose and framing that fit the scene. Photorealistic, natural skin texture, consistent lighting.',
  },
  {
    id: 'face-swap', frame: 'target', name: 'Face Swap', category: 'image', group: 'character',
    tagline: 'Put a face from one photo onto another',
    description: 'Choose the face to use and the photo to put it on. Pose, clothes and background of the second photo stay. The result is a very close likeness made by an edit model, not a pixel-exact copy.',
    colors: ['#f953c6', '#b91d73'], icon: 'swap',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Face to use', required: true },
      { key: 'target', type: 'image', label: 'Photo to put the face on', required: true },
      { key: 'consent', type: 'consent', label: 'I have permission from the people in these photos to use their likeness.', required: true },
    ],
    models: ['nano-banana-2', 'gpt-image-2', 'seedream-5.0-pro'],
    prompt: 'Replace the face of the main person in reference image 2 with the face of the person in reference image 1. Keep everything else from reference image 2 exactly the same: pose, body, hairstyle, clothing, background, framing and lighting. Match skin tone, lighting direction and grain so the new face looks natural and seamless.',
  },
  {
    id: 'virtual-tryon', name: 'Virtual Try-On', category: 'image', group: 'fashion', badge: 'New',
    tagline: 'Clothes, jewellery, glasses and bags on a real person',
    description: 'Pick a person and upload a photo of the item. The item is fitted to them with the right drape, size and reflections while the face stays the same.',
    colors: ['#ff758c', '#ff7eb3'], icon: 'shirt',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Person', required: true },
      { key: 'item', type: 'image', label: 'Item to try on', required: true },
      { key: 'kind', type: 'select', label: 'What is it?', options: [
        { value: 'clothing', label: 'Clothing', prompt: 'garment. Fit it to their body with realistic drape, folds and fabric texture, replacing what they wore on that part of the body' },
        { value: 'jewellery', label: 'Jewellery', prompt: 'piece of jewellery. Place it where it is worn, at the correct scale, with realistic metal and gemstone reflections' },
        { value: 'glasses', label: 'Glasses', prompt: 'pair of glasses. Sit them naturally on the nose and ears with correct perspective and lens reflections' },
        { value: 'shoes', label: 'Shoes', prompt: 'pair of shoes. Show a full-length view with the shoes on their feet at the correct size' },
        { value: 'bag', label: 'Bag or accessory', prompt: 'accessory. Have them carry or wear it naturally at the correct scale' },
      ] },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    settings: { size: '1024x1536' },
    prompt: 'Show the person from reference image 1 wearing the item from reference image 2, which is a {kind}. Keep the item exactly as pictured: same design, colours, pattern, logo and material. Keep the person the same: same face, hair, skin tone and body. Clean, well-lit fashion photo.',
  },
  {
    id: 'hair-makeup', frame: 'subject', name: 'Hair & Makeup Studio', category: 'image', group: 'fashion',
    tagline: 'Try a new hairstyle, colour or makeup look',
    description: 'Pick a person and describe the look. Only the hair and makeup change.',
    colors: ['#f6d365', '#fda085'], icon: 'wand',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Person', required: true },
      { key: 'text', type: 'text', label: 'Hair and makeup', placeholder: 'Shoulder-length copper bob with a fringe, soft glam makeup with a berry lip', required: true },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Change only the hair and makeup of the person in reference image 1 to: {text}. Keep the same face shape and features, skin tone, expression, clothing, pose and background. Realistic hair strands and natural-looking makeup.',
  },
  {
    id: 'model-shoot', name: 'AI Model Shoot', category: 'image', group: 'fashion',
    tagline: 'Your clothing or product on a model, no photoshoot',
    description: 'Upload a garment or product. Describe the model and set, or pick one of your Characters as the model.',
    colors: ['#a18cd1', '#fbc2eb'], icon: 'bag',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Model (optional, leave empty for an AI model)' },
      { key: 'item', type: 'image', label: 'Garment or product', required: true },
      { key: 'text', type: 'text', label: 'Model and set', placeholder: 'A woman in her 30s with curly dark hair, walking in a sunlit Mediterranean street', default: 'a professional fashion model in a bright minimalist studio' },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    settings: { size: '1024x1536' },
    prompt: 'Editorial fashion photograph of a model wearing or holding the item from the reference image of the garment or product. Keep that item exactly as pictured: same design, colours, pattern, logo and material. Model and set: {text}. If a reference person is given, they are the model and keep their face. Full, flattering framing, magazine-quality light.',
  },
  {
    id: 'headshot-studio', name: 'Headshot Studio', category: 'image', group: 'portrait', badge: 'Popular',
    tagline: 'Professional headshots from a casual photo',
    description: 'Pick a person and a style. You get a studio-quality portrait that still looks like them.',
    colors: ['#4facfe', '#00f2fe'], icon: 'user',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Person', required: true },
      { key: 'style', type: 'select', label: 'Style', options: [
        { value: 'corporate', label: 'Corporate', prompt: 'a corporate headshot: tailored dark blazer, soft grey studio backdrop, confident friendly expression' },
        { value: 'linkedin', label: 'LinkedIn', prompt: 'a modern LinkedIn profile photo: smart-casual clothes, softly blurred office background, warm approachable smile' },
        { value: 'creative', label: 'Creative', prompt: 'a creative professional portrait: stylish outfit, coloured backdrop, bold but flattering light' },
        { value: 'passport', label: 'Passport style', prompt: 'a passport-style photo: plain white background, facing the camera straight on, neutral expression, mouth closed, even shadow-free light, head and shoulders centred, no glasses glare' },
        { value: 'bw', label: 'Black and white', prompt: 'a classic black-and-white actor headshot with dramatic soft light and a dark backdrop' },
      ] },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Turn the photo of the person in reference image 1 into {style}. Head and shoulders, sharp eyes, natural skin texture. Keep their real face, features, skin tone and hair so they are instantly recognisable. Do not beautify them into a different person.',
  },
  {
    id: 'ugc-ad', name: 'UGC Ad Clip', category: 'video', group: 'character',
    tagline: 'A creator-style clip with your character',
    description: 'Pick a person and say what they are showing or talking about. You get a casual, phone-shot style clip for social ads.',
    colors: ['#ff9966', '#ff5e62'], icon: 'megaphone',
    inputs: [
      { key: 'subject', type: 'subject', kinds: ['person'], label: 'Creator (used as the first frame)', required: true },
      { key: 'text', type: 'text', label: 'What they talk about or show', placeholder: 'Excitedly talking about a new pistachio chocolate bar and taking a bite', required: true },
    ],
    models: ['doubao-seedance-2-5', 'doubao-seedance-2.0', 'doubao-seedance-2.0-fast'],
    settings: { resolution: '720p', ratio: '9:16', duration: 10 },
    prompt: 'Authentic user-generated-content style video shot on a phone. The person in the first frame talks straight to the camera: {text}. Handheld framing, natural room light, lively gestures and real expressions. They stay the same person throughout.',
  },
  // ---------- editing tools ----------
  {
    id: 'magic-eraser', frame: 'image', name: 'Magic Eraser', category: 'image', group: 'edit', badge: 'New',
    tagline: 'Remove people, objects or text from a photo',
    description: 'Upload an image and name what to remove. The gap is filled in to match the surroundings.',
    colors: ['#ff6a88', '#ff99ac'], icon: 'x',
    inputs: [
      { key: 'image', type: 'image', label: 'Image', required: true },
      { key: 'text', type: 'text', label: 'What to remove', placeholder: 'The two people in the background and the bin on the right', required: true },
    ],
    models: ['nano-banana-2', 'gpt-image-2', 'seedream-5.0-pro'],
    prompt: 'Remove this from the image: {text}. Fill the area with a realistic continuation of the background. Leave everything else exactly unchanged: same framing, colours, light and detail.',
  },
  {
    id: 'replace-anything', frame: 'image', name: 'Replace Anything', category: 'image', group: 'edit',
    tagline: 'Swap one thing in a photo for another',
    description: 'Upload an image and say what to change into what. Only that part changes.',
    colors: ['#30cfd0', '#330867'], icon: 'swap',
    inputs: [
      { key: 'image', type: 'image', label: 'Image', required: true },
      { key: 'text', type: 'text', label: 'What to replace, and with what', placeholder: 'Replace the red car with a yellow vintage scooter', required: true },
    ],
    models: ['nano-banana-2', 'gpt-image-2', 'seedream-5.0-pro'],
    prompt: 'Edit this image: {text}. Change only that part, matching the perspective, scale, lighting and shadows of the scene. Keep everything else exactly the same.',
  },
  {
    id: 'background-swap', frame: 'image', name: 'Background Swap', category: 'image', group: 'edit',
    tagline: 'Keep the subject, change the background',
    description: 'Upload a photo and describe the new background. The subject is cut out cleanly and relit to match.',
    colors: ['#5ee7df', '#b490ca'], icon: 'image',
    inputs: [
      { key: 'image', type: 'image', label: 'Image', required: true },
      { key: 'text', type: 'text', label: 'New background', placeholder: 'A sunny rooftop terrace with a city skyline', required: true },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Replace only the background of this image with: {text}. Keep the main subject exactly as it is, with clean edges around hair and fine detail. Adjust the light and shadows on the subject so it sits naturally in the new background.',
  },
  {
    id: 'relight', frame: 'image', name: 'Relight', category: 'image', group: 'edit',
    tagline: 'Change the lighting of any photo',
    description: 'Upload a photo and pick a lighting look. The content stays the same.',
    colors: ['#f6d242', '#ff52e5'], icon: 'sun',
    inputs: [
      { key: 'image', type: 'image', label: 'Image', required: true },
      { key: 'light', type: 'select', label: 'Lighting', options: [
        { value: 'golden', label: 'Golden hour', prompt: 'warm golden-hour sunlight from a low angle with long soft shadows' },
        { value: 'studio', label: 'Studio softbox', prompt: 'clean, even studio softbox light with gentle shadows' },
        { value: 'dramatic', label: 'Dramatic side light', prompt: 'dramatic single side light with deep shadows and strong contrast' },
        { value: 'neon', label: 'Neon night', prompt: 'night-time neon light in pink and cyan with glowing reflections' },
        { value: 'overcast', label: 'Soft daylight', prompt: 'soft, diffuse overcast daylight with very gentle shadows' },
      ] },
    ],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Relight this image with {light}. Keep the subject, composition, colours of objects and all details the same. Only the lighting, shadows and highlights change, and they must be physically consistent.',
  },
  {
    id: 'multi-angle', name: 'Multi-Angle Views', category: 'image', group: 'edit', badge: 'New',
    tagline: 'One picture in, four angles out',
    description: 'Pick a Character, product or photo and get the same subject from four camera angles. Costs four images.',
    colors: ['#0ba360', '#3cba92'], icon: 'rotate',
    inputs: [{ key: 'subject', type: 'subject', kinds: ['person', 'product', 'brand'], label: 'Subject', required: true }],
    models: ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'],
    prompt: 'Show the same subject as in reference image 1 from a different camera angle: {variant}. Keep the subject identical: same face or design, colours, materials, clothing and details. Same lighting style and a plain neutral background.',
    variants: [
      { label: 'Front', prompt: 'a straight-on front view' },
      { label: 'Three-quarter', prompt: 'a three-quarter view from the left' },
      { label: 'Side', prompt: 'a full side profile view from the right' },
      { label: 'Back', prompt: 'a view from behind' },
    ],
  },
];

// Which tab each app sits under in the App Library.
const GROUPS = { 'product-photoshoot': 'product', 'product-spin': 'product', 'ad-video': 'product', 'outfit-changer': 'fashion', 'avatar-maker': 'portrait', 'image-expander': 'edit', 'sketch-render': 'edit', 'photo-enhancer': 'edit', 'text-replacer': 'edit', 'poster-maker': 'edit', 'image-blender': 'edit' };
for (const a of APPS) a.group ||= GROUPS[a.id] || (a.category === 'video' ? 'video' : 'edit');

export const publicApp = (a) => {
  const { prompt, ...rest } = a;
  return { ...rest, inputs: a.inputs.map((i) => (i.options ? { ...i, options: i.options.map(({ prompt: _p, ...o }) => o) } : i)), variants: a.variants?.map((v) => v.label) };
};
export const findApp = (aid) => APPS.find((a) => a.id === aid);

export function fillPrompt(app, text, options = {}, variant) {
  const t = String(text || '').trim() || app.inputs.find((i) => i.key === 'text')?.default || '';
  let out = app.prompt.replaceAll('{text}', t);
  for (const inp of app.inputs) {
    if (inp.type !== 'select') continue;
    const opt = inp.options.find((o) => o.value === options[inp.key]) || inp.options[0];
    out = out.replaceAll(`{${inp.key}}`, opt.prompt);
  }
  if (variant) out = out.replaceAll('{variant}', variant.prompt);
  return out;
}
