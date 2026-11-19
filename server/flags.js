// Feature switches. Anything not proven stable stays off until it is switched on in .env (FEATURE_NAME=1).
const on = (name, dflt = false) => { const v = process.env['FEATURE_' + name]; return v == null || v === '' ? dflt : /^(1|true|on|yes)$/i.test(v); };
export const flags = () => ({
  videoAgent: on('VIDEO_AGENT'),
  videoBuilder: on('VIDEO_BUILDER'),
  precisionEdit: on('PRECISION_EDIT'),
  musicLibrary: on('MUSIC_LIBRARY'),
  beatSync: on('BEAT_SYNC'),
  audioFirst: on('AUDIO_FIRST'),     // plan scenes from a voice-over (needs the Video Builder)
  videoExtend: on('VIDEO_EXTEND'),   // "Extend video" task: needs the ffmpeg joiner from the Video Builder step
  frameTiles: on('FRAME_TILES'),
  studioPro: on('STUDIO_PRO'),         // Studio Pro: the second image + video studio beside the existing pages (server/pro.js)
  subscriptions: on('SUBSCRIPTIONS'), // monthly plans with Stripe, free trial, upgrade prompt, plan management (server/billing.js)     // First frame / last frame tiles: no model supports a last frame today
});
