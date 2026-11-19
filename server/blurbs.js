// One plain-language line per model, shown under the model name in every model menu and card.
// Written from the person's "Model Tags" sheet (2026-11-18). Keys are model names (or ids) with everything
// but letters and digits removed, so "Claude Opus 5.5", "claude-opus-5.5" and "claude-opus-5-5" all match.
const BLURBS = {
  // Claude
  claudefable5: 'Older top Claude for long, hard tasks',
  claudefable51: 'Strongest Claude, for long tasks and research',
  claudeopus45: 'Older Claude, good at coding',
  claudeopus47: 'Older Claude, precise and sharp with images',
  claudeopus48: 'Older, careful Claude for legal and finance',
  claudeopus5: 'Older Claude for long tasks, checks its own work',
  claudeopus55: 'Best value Claude, close to the top model',
  claudesonnet46: 'Older Claude for office work and computer tasks',
  claudesonnet5: 'Lowest cost Claude, good for coding',
  // DeepSeek
  deepseekv4flash: 'Very cheap everyday model, now runs V4.1',
  deepseekv41flash: 'Fast and cheap, reads images and long files',
  deepseekv4pro: 'Maths and science expert, text only, being retired',
  // Gemini
  gemini31flashlite: 'Lowest cost, for big volumes, understands audio',
  gemini31propreview: 'Deep thinking and tool use, early preview',
  gemini35flash: 'Older Flash, replaced by Gemini 3.6',
  gemini36flash: 'All-rounder that reads audio, PDFs and more',
  // GLM
  glm5: 'Good for engineering, data extraction and translation',
  glm51: 'Works for hours on web and office tasks',
  glm52: 'Handles very long files and big code changes',
  glm53: 'Top GLM, reads very long files, security work',
  glm53flash: 'Low cost, reads images, builds web screens',
  // GPT
  gpt54: 'Affordable GPT with built-in tools',
  gpt54mini: 'Fast, small GPT for quick tasks',
  gpt55: 'Handles multi-step work and workflows',
  gpt55codex: 'Coding agent that writes and fixes code',
  gpt56luna: 'Fastest, lowest cost GPT for quick tasks',
  gpt56sol: 'Flagship GPT for research and hard problems',
  gpt56terra: 'Balanced everyday GPT, good at coding',
  gpt6astra: 'Top GPT for the hardest tasks and documents',
  // Others
  grok47: 'Searches live news and info, long input',
  hyvision20instruct: 'Answers questions about images, low cost',
  hy3: 'Very cheap, good for office work and coding',
  hy3preview: 'Old preview, now runs as Hy3',
  hy4preview: 'Next-generation preview, reads long files',
  kimik27code: 'Coding only, thinks before it answers',
  kimik3: 'Writes very long answers, builds visual apps',
  mimov26flash: 'Ultra cheap, understands audio and video',
  mimov26pro: 'Understands text, images, audio and video, low price',
  minimaxm3: 'Research and long video understanding',
  // Qwen
  qwen36flash: 'Low cost, good at maths and finding objects',
  qwen36plus: 'Reads text in images, builds web pages',
  qwen37max: 'Strong thinking and agent tasks, text only',
  qwen37plus: 'Balanced Qwen, reads images and video',
  qwen3827b: 'Compact Qwen, reads images and video',
  qwen38flash: 'Cheap and quick, reads charts and videos',
  qwen38max: 'Top Qwen for long legal and finance documents',
  // Image
  gptimage2: 'High quality images up to 4K, with edits',
  gptimage2edits: 'Edits images, change chosen areas, up to 16 inputs',
  gptimage25: 'Newest GPT Image, fast, transparent backgrounds',
  nanobanana: 'Quick edits that keep characters the same',
  nanobanana2: '4K images with clear text, up to 14 references',
  seedream50pro: 'Posters and text layouts, edit any area',
  seedream50: 'Image sets with web search, up to 3K',
  seedream50lite: 'Image sets with web search, up to 3K',
  // Video
  dreaminaseedance20: 'Economy video clips with sound',
  doubaoseedance20: 'Balanced clips with sound for social and ads',
  doubaoseedance20fast: 'Fast, low cost drafts in 720p',
  doubaoseedance20mini: 'Cheapest previews in 720p',
  doubaoseedance25: 'Long 30s clips with several shots and sound',
  doubaoseedance25vision: 'Edit, extend or restyle a video',
  dreaminaseedance25global: 'Long 30s clips, can edit and extend',
  seedance25260628: 'Long 30s clips with sound, fixed version',
  seedance251080p: 'Final 1080p clips up to 30s, with sound',
  seedance25vision1080p: 'Edit or extend videos in 1080p, with sound',
};

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FALLBACK = { chat: 'General chat, writing and questions', image: 'Creates and edits images', video: 'Turns text or images into video' };

export function blurbFor(m, type) {
  const name = key(m.name).replace(/^doubao(?=seedream)/, '');
  return BLURBS[name] || BLURBS[key(m.id)] || BLURBS[name.replace(/\d{6,}$/, '')] || FALLBACK[type] || '';
}
