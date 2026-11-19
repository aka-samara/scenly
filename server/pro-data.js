// Studio Pro catalogue: kinds of work, starting templates, camera bodies, lenses, camera moves and restyle looks.
// Everything here ends up as words in a prompt, so it works with every model on the gateway.

export const KINDS = [
  { id: 'auto', label: 'Auto', icon: 'sparkle', hint: 'The agent picks the best format', guide: '' },
  { id: 'ad', label: 'Ad', icon: 'megaphone', hint: 'A polished product or brand commercial', guide: 'Make a commercial: a hook in the first two seconds, the product shown clearly and in use, a clean end shot of the product. Premium light and deliberate camera moves.' },
  { id: 'ugc', label: 'UGC', icon: 'user', hint: 'Creator-style video shot on a phone', guide: 'Make user-generated-style content: one relatable creator, handheld phone camera, real home or street setting, natural light, casual and honest. It must not look like a studio ad.' },
  { id: 'drama', label: 'Short drama', icon: 'film', hint: 'A story in a few shots with a cliffhanger', guide: 'Make a vertical short-drama episode as a film: two or three named characters described the same way in every shot, a conflict that turns in each shot, cinematic close-ups, and a cliffhanger on the last shot.' },
  { id: 'social', label: 'Social clip', icon: 'bolt', hint: 'A scroll-stopping Reel, Short or TikTok', guide: 'Make a short social video that stops the scroll: a striking first frame, one clear idea, fast pacing, vertical.' },
  { id: 'product', label: 'Product shots', icon: 'bag', hint: 'A set of still pictures of a product', guide: 'Make a set of still product photographs as "images". If the brief names how many pictures, make exactly that many; otherwise make four: a hero packshot, a lifestyle shot in use, a detail close-up and a styled flat lay, all with one consistent art direction.' },
  { id: 'explainer', label: 'Explainer', icon: 'brain', hint: 'A topic explained with narration', guide: 'Make a narrated explainer as a film: each shot illustrates one sentence of the narration, in one consistent illustrated or cinematic style, with no host on camera.' },
];

export const PRO_CATEGORIES = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'ads', label: 'Ads', icon: 'megaphone' },
  { id: 'ugc', label: 'UGC', icon: 'user' },
  { id: 'drama', label: 'Short drama', icon: 'film' },
  { id: 'social', label: 'Social', icon: 'bolt' },
  { id: 'brand', label: 'Branding', icon: 'palette' },
  { id: 'explain', label: 'Explainers', icon: 'brain' },
];

// needs: what the person should attach for the best result. tint: the two colours of the tile.
const T = (id, cat, kind, title, blurb, prompt, extra = {}) => ({ id, cat, kind, title, blurb, prompt, ratio: '9:16', seconds: 0, needs: '', tint: ['#2fe6f2', '#6f8bff'], ...extra });
export const PRO_TEMPLATES = [
  // Ads
  T('ad-packshot-film', 'ads', 'ad', 'Packshot to Film', 'One product photo becomes a 15 second launch film with a hook, a use moment and a hero end shot.', 'A 15 second launch ad for [your product]. Open on a bold close-up, show it being used by [who it is for], end on a clean hero shot of the product.', { seconds: 15, needs: 'product photo', tint: ['#ff7a45', '#ffcc4d'] }),
  T('ad-problem-relief', 'ads', 'ad', 'Problem, then Relief', 'The classic ad arc: an everyday frustration, your product arrives, life is better.', 'An ad that shows the problem of [the everyday problem], then how [your product] fixes it, ending on a happy customer and the product.', { seconds: 20, tint: ['#ff4f8b', '#ff9f6b'] }),
  T('ad-retro-tv', 'ads', 'ad', 'Retro TV Spot', 'A playful 1980s television commercial look for a product drop.', 'A playful retro 1980s TV commercial for [your product]: bright studio colours, film grain, a cheerful presenter gesture and a spinning product end shot.', { ratio: '16:9', seconds: 15, needs: 'product photo', tint: ['#ffcc4d', '#ff4f8b'] }),
  T('ad-texture-macro', 'ads', 'ad', 'Texture Macro Film', 'Slow macro shots of texture, pour and packaging for beauty, food and drink.', 'A slow, luxurious macro film for [your product]: extreme close-ups of its texture, a pour or swirl in slow motion, and the packaging turning in soft light.', { seconds: 10, needs: 'product photo', tint: ['#b46cff', '#ff7ad9'] }),
  T('ad-static-set', 'ads', 'product', 'Static Ad Set', 'Four ready-to-post ad pictures for feed, story and display.', 'Four static ad visuals for [your product] aimed at [audience]: a hero packshot, a lifestyle moment, a bold colour-block layout with empty space for a headline, and a detail close-up.', { ratio: '1:1', needs: 'product photo', tint: ['#42c98a', '#2fe6f2'] }),
  T('ad-sport-energy', 'ads', 'ad', 'Studio Sprint', 'High-energy sport footage built around your drink, shoe or gear.', 'A high-energy sports ad for [your product]: an athlete training hard in a dramatic studio with hard light and sweat, quick cuts, ending on the product.', { seconds: 15, tint: ['#6f8bff', '#2fe6f2'] }),
  // UGC
  T('ugc-first-try', 'ugc', 'ugc', 'First Try Reaction', 'A creator tries your product for the first time and reacts on camera.', 'A UGC clip of a creator in their [kitchen / bedroom / car] trying [your product] for the first time and reacting with honest delight to the phone camera.', { seconds: 8, needs: 'product photo', tint: ['#ff9f6b', '#ffcc4d'] }),
  T('ugc-unboxing', 'ugc', 'ugc', 'Unboxing', 'Hands open the parcel, reveal the product and show it off.', 'A UGC unboxing video of [your product]: hands open the parcel on a desk, lift the product out, turn it to the camera and show its best detail.', { seconds: 15, needs: 'product photo', tint: ['#2fe6f2', '#42c98a'] }),
  T('ugc-grwm', 'ugc', 'ugc', 'Get Ready With Me', 'A morning-routine Reel with your product in the routine.', 'A get-ready-with-me morning routine video where a creator uses [your product] as one natural step, filmed on a phone in a bright bathroom.', { seconds: 15, tint: ['#ff7ad9', '#b46cff'] }),
  T('ugc-testimonial', 'ugc', 'ugc', 'Honest Review', 'A talking-to-camera style review told with voice-over and captions.', 'A UGC honest review of [your product] after two weeks of use: the creator holds it up, shows how they use it and the result, with a voice-over review.', { seconds: 20, needs: 'product photo', tint: ['#6f8bff', '#b46cff'] }),
  T('ugc-pov-day', 'ugc', 'social', 'POV Day in the Life', 'A faceless point-of-view day built around one habit or product.', 'A faceless POV day-in-the-life video for [your niche]: morning coffee, the commute, the main moment with [your product or habit], and a calm evening.', { seconds: 20, tint: ['#42c98a', '#ffcc4d'] }),
  // Short drama
  T('drama-secret-heir', 'drama', 'drama', 'The Secret Heir', 'A humble worker is revealed as the owner of the company. Episode one.', 'Episode 1 of a vertical short drama: a quiet [waitress / intern / driver] is humiliated by an arrogant manager, until a phone call reveals she secretly owns the company. End on the manager\'s shocked face.', { seconds: 30, tint: ['#ff4f8b', '#b46cff'] }),
  T('drama-parked-car', 'drama', 'drama', 'Parked Car Confession', 'One emotional scene in a parked car at night, told in close-ups.', 'A short drama scene: two people sit in a parked car at night in the rain; one finally tells the truth about [the secret]. Tight close-ups, neon reflections, ends on a held look.', { seconds: 20, tint: ['#6f8bff', '#0d1b3e'] }),
  T('drama-revenge', 'drama', 'drama', 'The Return', 'She comes back five years later, successful and unrecognised.', 'Episode 1 of a vertical short drama: five years after being thrown out, [name] returns to her family\'s gala as a successful stranger. Nobody recognises her until the last shot.', { seconds: 30, tint: ['#ffcc4d', '#ff4f8b'] }),
  T('drama-trailer', 'drama', 'drama', 'Action Teaser', 'A fast trailer for a story, game or series, starring your character.', 'A 20 second action movie teaser about [your character]: a tense opening, a chase through [location], one big stunt, and a title-card moment at the end.', { ratio: '16:9', seconds: 20, needs: 'character photo', tint: ['#ff7a45', '#1a1a1e'] }),
  // Social
  T('social-food-crave', 'social', 'social', 'Food Craving', 'Close-up food footage for restaurant Reels and menu launches.', 'A mouth-watering close-up food video of [your dish]: steam rising, a slow pull or pour, a fork lifting the perfect bite, warm restaurant light.', { seconds: 8, tint: ['#ff7a45', '#ffcc4d'] }),
  T('social-travel-vlog', 'social', 'social', 'Summer Travel Vlog', 'Handheld holiday moments cut like a travel Reel.', 'A handheld summer travel vlog of [destination]: arriving, a street-food moment, a viewpoint at golden hour and an evening swim, warm film look.', { seconds: 20, tint: ['#2fe6f2', '#ffcc4d'] }),
  T('social-outfit', 'social', 'social', 'Outfit Montage', 'One look shown in motion for fashion Reels.', 'A fashion Reel showing [the outfit] in motion: a walk toward the camera on a city street, a turn, a detail close-up of fabric and accessories.', { seconds: 10, needs: 'outfit photo', tint: ['#ff7ad9', '#6f8bff'] }),
  T('social-pet-comedy', 'social', 'social', 'Pet Comedy', 'Your pet in a funny everyday situation.', 'A funny short video of [your pet] behaving like a tiny human at [a grooming shop / an office / a cafe], with a comic beat at the end.', { seconds: 8, needs: 'pet photo', tint: ['#ffcc4d', '#42c98a'] }),
  T('social-thumbnail', 'social', 'product', 'Thumbnail Pack', 'Four bold thumbnail options for one video idea.', 'Four bold, high-contrast YouTube thumbnail pictures for a video about [your topic], each with a different concept and clear empty space for a title.', { ratio: '16:9', tint: ['#ff4f8b', '#ffcc4d'] }),
  // Branding
  T('brand-logo-sting', 'brand', 'social', 'Logo Sting', 'A short animated opener that reveals your logo.', 'A 5 second logo reveal: liquid [brand colour] metal flows together on a dark stage and settles into the logo shape, with a soft glow.', { ratio: '16:9', seconds: 5, needs: 'logo', tint: ['#6f8bff', '#b46cff'] }),
  T('brand-world', 'brand', 'ad', 'Brand World Teaser', 'A playful 3D teaser in your brand colours for a launch.', 'A playful 3D launch teaser in the colours [brand colours]: soft rounded shapes assemble into a miniature world around [your product], ending on the product alone.', { ratio: '16:9', seconds: 15, tint: ['#42c98a', '#6f8bff'] }),
  T('brand-lookbook', 'brand', 'product', 'Lookbook Stills', 'Six editorial pictures with one art direction for a collection.', 'Six editorial lookbook photographs for [your collection]: one consistent model and location, a mix of full-length, half-length and detail shots, magazine quality.', { needs: 'outfit photo', tint: ['#d4d4da', '#6d6d77'] }),
  // Explainers
  T('explain-paper', 'explain', 'explainer', 'Paper Collage Explainer', 'A topic told in a paper-collage style with narration.', 'A 30 second narrated explainer about [your topic] in a paper-collage style: cut-out shapes, soft shadows, one idea per shot.', { ratio: '16:9', seconds: 30, tint: ['#ffcc4d', '#ff9f6b'] }),
  T('explain-exploded', 'explain', 'explainer', 'Exploded View', 'Your product comes apart to show what is inside and why it matters.', 'An animated exploded-view explainer of [your product]: it lifts apart into its parts, each part is highlighted in turn, then it snaps back together.', { ratio: '16:9', seconds: 15, needs: 'product photo', tint: ['#2fe6f2', '#6f8bff'] }),
  T('explain-history', 'explain', 'explainer', 'Watercolour History', 'History or science told in soft watercolour scenes.', 'A 30 second watercolour-style explainer about [a moment in history or science], told in four painted scenes with a calm narration.', { seconds: 30, tint: ['#6f8bff', '#ff7ad9'] }),
];

// A camera body sets the texture of the footage. `say` is added to the prompt.
export const CAMERAS = [
  { id: '', label: 'None', say: '' },
  { id: 'phone', label: 'Phone', say: 'shot on a modern smartphone, handheld, natural auto exposure, slight rolling movement' },
  { id: 'super8', label: 'Super 8 film', say: 'shot on Super 8 film, heavy warm grain, light leaks, soft focus, slight gate weave' },
  { id: '16mm', label: '16mm film', say: 'shot on 16mm film, organic grain, rich colour, gentle halation on highlights' },
  { id: 'cinema', label: 'Digital cinema', say: 'shot on a large-format digital cinema camera, clean image, wide dynamic range, shallow depth of field, cinematic colour grade' },
  { id: 'imax', label: 'Large format', say: 'shot on 65mm large-format film, immense detail, deep clarity, epic scale' },
  { id: 'vhs', label: 'VHS camcorder', say: 'recorded on a 1990s VHS camcorder, soft low resolution, colour bleed, tracking noise, date-stamp era feel' },
  { id: 'dslr', label: 'DSLR', say: 'shot on a full-frame DSLR, crisp detail, natural colours, creamy background blur' },
  { id: 'drone', label: 'Drone', say: 'aerial drone footage, smooth stabilised flight, wide view from above' },
  { id: 'action', label: 'Action cam', say: 'shot on a chest-mounted action camera, ultra-wide view, energetic motion, slight barrel distortion' },
  { id: 'cctv', label: 'Security cam', say: 'security camera footage from a high corner, fixed wide angle, flat lighting, timestamp-era look' },
];
export const LENSES = [
  { id: '', label: 'None', mm: '', say: '' },
  { id: 'ultra', label: 'Ultra wide', mm: '14', say: '14mm ultra-wide lens, dramatic perspective, deep focus' },
  { id: 'wide', label: 'Wide', mm: '24', say: '24mm wide lens, environment in view, deep focus' },
  { id: 'classic', label: 'Classic', mm: '35', say: '35mm lens, natural documentary perspective' },
  { id: 'normal', label: 'Standard', mm: '50', say: '50mm lens, natural perspective close to the human eye' },
  { id: 'portrait', label: 'Portrait', mm: '85', say: '85mm portrait lens at f/1.4, very shallow depth of field, soft creamy bokeh' },
  { id: 'tele', label: 'Telephoto', mm: '200', say: '200mm telephoto lens, compressed background, subject isolated' },
  { id: 'macro', label: 'Macro', mm: '100', say: '100mm macro lens, extreme close-up, razor-thin focus on fine texture' },
  { id: 'anamorphic', label: 'Anamorphic', mm: '40', say: 'anamorphic lens, oval bokeh, horizontal blue lens flares, widescreen cinema feel' },
  { id: 'fisheye', label: 'Fisheye', mm: '8', say: '8mm fisheye lens, strong curved distortion, edgy skate-video feel' },
  { id: 'tilt', label: 'Tilt-shift', mm: '45', say: 'tilt-shift lens, miniature effect with a thin band of focus' },
];
export const MOVES = [
  { id: '', label: 'None', say: '' },
  { id: 'static', label: 'Locked off', say: 'The camera is locked off on a tripod and does not move.' },
  { id: 'push', label: 'Push in', say: 'The camera pushes in slowly and smoothly toward the subject.' },
  { id: 'pull', label: 'Pull out', say: 'The camera pulls back slowly to reveal the surroundings.' },
  { id: 'orbit', label: 'Orbit', say: 'The camera orbits smoothly around the subject in a half circle.' },
  { id: 'pan-l', label: 'Pan left', say: 'The camera pans steadily to the left.' },
  { id: 'pan-r', label: 'Pan right', say: 'The camera pans steadily to the right.' },
  { id: 'tilt-up', label: 'Tilt up', say: 'The camera tilts up from the ground to reveal the subject.' },
  { id: 'crane', label: 'Crane up', say: 'The camera rises on a crane, lifting high above the scene.' },
  { id: 'track', label: 'Tracking', say: 'The camera tracks alongside the moving subject at the same speed.' },
  { id: 'handheld', label: 'Handheld', say: 'Handheld camera with natural, slightly shaky documentary movement.' },
  { id: 'dolly-zoom', label: 'Dolly zoom', say: 'A dolly zoom: the camera moves back while zooming in, so the background stretches behind the subject.' },
  { id: 'fpv', label: 'FPV dive', say: 'A fast first-person drone flight that dives and sweeps through the scene.' },
  { id: 'whip', label: 'Whip pan', say: 'A fast whip pan with motion blur that lands on the subject.' },
  { id: 'slowmo', label: 'Slow motion', say: 'Shot in smooth slow motion.' },
];
// Looks for "Restyle video" and "Restyle image".
export const RESTYLES = [
  { id: 'anime', label: 'Anime', say: 'Japanese anime style with clean line art, cel shading and vivid colour' },
  { id: 'pixar', label: '3D animation', say: 'a polished 3D animated film style with soft rounded shapes and warm light' },
  { id: 'clay', label: 'Claymation', say: 'stop-motion claymation with visible fingerprints and handmade sets' },
  { id: 'comic', label: 'Comic book', say: 'a bold comic-book style with ink outlines and halftone dots' },
  { id: 'watercolor', label: 'Watercolour', say: 'a soft hand-painted watercolour style on textured paper' },
  { id: 'noir', label: 'Film noir', say: 'black-and-white film noir with hard shadows and high contrast' },
  { id: 'cyber', label: 'Neon cyberpunk', say: 'a neon cyberpunk look with rain, glowing signs and teal and magenta light' },
  { id: 'pixel', label: 'Pixel art', say: '16-bit pixel art with a limited palette' },
  { id: 'paper', label: 'Paper cut-out', say: 'a layered paper cut-out diorama with soft shadows' },
  { id: 'oil', label: 'Oil painting', say: 'a classical oil painting with visible brush strokes' },
];

// Ad Studio templates: proven ad formats. `still` shapes a picture ad, `video` shapes a video ad. Every concept in a batch follows the one picked.
export const AD_TEMPLATES = [
  { id: 'auto', label: 'Mix it up', tag: '', icon: 'sparkle', blurb: 'A different angle for each ad. Best for a first batch.', still: '', video: '' },
  { id: 'hook', label: 'Bold hook', tag: 'Viral', icon: 'bolt', blurb: 'One punchy line that stops the scroll, product front and centre.', still: 'A bold-statement ad: one short, surprising or provocative headline in very large type fills most of the picture, with the product as the single hero object and a flat or simple background.', video: 'A hook-first short: the first second is a striking close-up or unexpected action with a punchy on-screen line, then the product is revealed and shown in use.' },
  { id: 'before-after', label: 'Before / After', tag: 'Viral', icon: 'swap', blurb: 'The problem on the left, the result on the right.', still: 'A before-and-after ad: the picture is split in two halves, the left half labelled "Before" showing the problem, the right half labelled "After" showing the improved result with the product visible. Keep it honest and realistic, with no exaggerated or medical claims.', video: 'A before-and-after video: first the frustrating "before" situation, then a quick transition to the "after" with the product in use and a visibly better result.' },
  { id: 'us-vs-them', label: 'Us vs Them', tag: 'Viral', icon: 'layers', blurb: 'A side-by-side comparison with the usual alternative.', still: 'A comparison ad: two columns side by side, the left headed with the brand name and the right headed "Others", with three short rows of ticks and crosses based only on the selling points given. Never name a real competitor.', video: 'A comparison video: the same everyday task shown twice, first the ordinary way and then with the product, making the difference obvious. Never name a real competitor.' },
  { id: 'pov', label: 'POV moment', tag: 'Viral', icon: 'eye', blurb: 'A relatable first-person moment with the product in it.', still: 'A POV ad: a first-person view of hands using the product in a real everyday moment, with a caption that starts with "POV:" as the headline.', video: 'A POV video filmed from the first-person view: hands and the product in a relatable everyday moment, with an on-screen line that starts with "POV:".' },
  { id: 'ugc', label: 'UGC testimonial', tag: 'Trending', icon: 'user', blurb: 'A real-looking customer holding the product, with their words.', still: 'A UGC-style testimonial ad: a candid phone photo of an ordinary, happy customer holding or using the product in a real home or street setting, with a short first-person quote as the headline in a clean caption box. The quote must stay general (how it feels to use) and must not claim results or numbers.', video: 'A UGC testimonial video: a relatable creator films themselves on a phone at home, shows the product to the camera, uses it and reacts honestly. Handheld, natural light, casual.' },
  { id: 'unboxing', label: 'Unboxing', tag: 'Trending', icon: 'bag', blurb: 'Hands open the parcel and reveal the product.', still: 'An unboxing ad: a top-down photo of hands lifting the product out of an opened parcel with tissue paper on a clean desk, with a short headline about the first impression.', video: 'An unboxing video: hands open the parcel on a desk, lift the product out, turn it to the camera and show its best detail up close.' },
  { id: 'reasons', label: '3 reasons why', tag: 'Trending', icon: 'list', blurb: 'Three short reasons to buy, numbered.', still: 'A "3 reasons" ad: the product on one side and on the other a headline such as "3 reasons to switch" above three short numbered reasons taken only from the selling points given, each of at most five words.', video: 'A "3 reasons why" video: three quick shots, each showing one reason from the selling points with a numbered on-screen caption, ending on the product.' },
  { id: 'founder', label: 'Behind the scenes', tag: 'Trending', icon: 'film', blurb: 'How it is made or the people behind it.', still: 'A behind-the-scenes ad: a warm documentary-style photo of the product being made, packed or prepared by skilled hands in a workshop or studio, with a headline about care and craft.', video: 'A behind-the-scenes video: close shots of the product being made or packed by hand in a workshop or studio, warm documentary style, ending on the finished product.' },
  { id: 'problem', label: 'Problem, solved', tag: 'Popular', icon: 'check', blurb: 'Name the everyday frustration, show the fix.', still: 'A problem-and-solution ad: the headline names one everyday frustration the audience knows, and the picture shows the product as the calm, obvious fix.', video: 'A problem-and-solution video: an everyday frustration the audience knows, then the product arrives and fixes it, ending on a relieved, happy moment and the product.' },
  { id: 'showcase', label: 'Product showcase', tag: 'Popular', icon: 'star', blurb: 'A premium hero shot that lets the product speak.', still: 'A premium product-showcase ad: a studio hero shot of the product with dramatic, flattering light, plenty of empty space, and a short elegant headline.', video: 'A product-showcase video: slow, premium studio shots of the product from several angles with macro details and smooth camera moves, ending on a clean hero shot.' },
  { id: 'offer', label: 'Offer / Sale', tag: 'Popular', icon: 'coin', blurb: 'A promotion banner. Uses only offers your kit states.', still: 'A promotional offer ad: a bright, energetic layout with a large offer badge and the product. Use an offer, price or discount ONLY if one is written in the brand facts above; if none is, use a no-number line such as "New in" or "Shop the collection" instead.', video: 'A promotional video: energetic quick cuts of the product with an on-screen offer line. Use an offer or price ONLY if one is written in the brand facts; otherwise use a no-number line such as "New in".' },
];
