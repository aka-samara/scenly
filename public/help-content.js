// Scenly help centre: every article, in plain language. Static content only (never built from user data).
// Each article: id (used in #/help/<id>), cat, title, sum (one line), kw (extra search words), body (HTML).
// Section ids inside a body (<h2 id="...">) can be linked as #/help/<article>/<section>.
// Keep this in step with the app: describe only what the code really does.

export const CATS = [
  { id: 'start', name: 'Getting started', icon: 'sparkle', blurb: 'Your account, the layout and your first creation.' },
  { id: 'credits', name: 'Credits and plans', icon: 'coin', blurb: 'How credits work, plans, packs and billing.' },
  { id: 'create', name: 'Create', icon: 'image', blurb: 'Chat, documents, code, images, video and AI apps.' },
  { id: 'paid', name: 'Pro studios', icon: 'film', blurb: 'Video Agent, Video Builder, Studio Pro and Ad Studio.' },
  { id: 'tools', name: 'Workspace and tools', icon: 'layers', blurb: 'Projects, characters, assets and handy helpers.' },
  { id: 'help', name: 'Troubleshooting and FAQ', icon: 'help', blurb: 'Fixes for common problems and quick answers.' },
];

const go = (href, label) => `<a class="hp-go" href="${href}">${label} →</a>`;
const note = (t) => `<div class="hp-note">${t}</div>`;
const tip = (t) => `<div class="hp-tip"><b>Tip</b> ${t}</div>`;
const paidNote = (name) => note(`<b>${name} is part of the paid plans</b> (Pro, Max and Ultra). On the Free plan the page shows the plans instead. Credit packs on their own do not open it. See <a href="#/help/paid-tools">Paid-only tools</a>.`);

export const ARTICLES = [
  // ---------------------------------------------------------------- Getting started
  {
    id: 'welcome', cat: 'start', title: 'Welcome to Scenly',
    sum: 'What Scenly is and what you can make with it.',
    kw: 'intro overview about what is start begin',
    body: `
<p>Scenly is one place to make pictures, videos, ads and documents with AI, and to chat with the leading AI models. Everything runs on one credit balance, so you never need a separate account for each model.</p>
<h2 id="what">What you can do</h2>
<ul>
<li><b>Chat</b> with more than 30 models, attach files and ask questions about them. <a href="#/help/chat">Chat</a></li>
<li><b>Create documents</b> such as Word files, spreadsheets, PDFs and PowerPoint decks right inside a chat. <a href="#/help/docs-studio">Docs Studio</a></li>
<li><b>Build small web projects and scripts</b> in Code. <a href="#/help/code">Code</a></li>
<li><b>Make and edit pictures</b> in Image. <a href="#/help/image">Image</a></li>
<li><b>Make videos</b> from words, a picture or another video in Video Studio. <a href="#/help/video-studio">Video Studio</a></li>
<li><b>Use one-click AI apps</b> such as Product Photoshoot or Virtual Try-On. <a href="#/help/ai-apps">AI Apps</a></li>
<li><b>Produce longer videos and ads</b> with Video Agent, Video Builder, Studio Pro and Ad Studio (paid plans). <a href="#/help/paid-tools">Pro studios</a></li>
</ul>
<h2 id="first">Your first five minutes</h2>
<ol>
<li>Create a free account. You get 1,000 welcome credits and no card is needed.</li>
<li>Open <b>Chat</b> and ask anything, or open <b>Image</b> and describe a picture.</li>
<li>Look at the price on the <b>Generate</b> button before you press it. That is roughly what it will cost.</li>
<li>Find everything you made later in <b>Assets</b> and in <b>Recents</b> in the sidebar.</li>
</ol>
${go('#/home', 'Open Home')}`,
  },
  {
    id: 'account-signin', cat: 'start', title: 'Create an account and sign in',
    sum: 'Sign up with email or Google, confirm your email and reset a password.',
    kw: 'signup register login log in google password forgot reset verify verification confirm email code',
    body: `
<h2 id="signup">Create an account</h2>
<ol>
<li>Press <b>Start free</b> on the home page, or <b>Create a free account</b>.</li>
<li>Type your name, email and a password of at least 8 characters, then press <b>Start free trial</b>. You can also press <b>Continue with Google</b> when it is shown.</li>
<li>By signing up you accept the Terms of Use and Privacy Policy and confirm you are 18 or older.</li>
</ol>
<p>If you typed something on the home page before signing up, Scenly keeps it. After sign-up your message is sent for you, or your image or video idea is placed in the prompt bar ready to generate.</p>
<h2 id="verify">Confirm your email</h2>
<p>When email confirmation is switched on, Scenly sends you an email after sign-up. You can either:</p>
<ul>
<li>press the button in the email, or</li>
<li>type the <b>6-digit code</b> from the email into the box on the sign-up screen.</li>
</ul>
<p>The sign-up screen notices by itself when you confirm, even if you opened the link on another device. No email? Check your spam folder, then press <b>Send the email again</b>. If you typed the wrong address, press <b>Start again</b>.</p>
<p>You cannot sign in with email and password until the address is confirmed. The sign-in screen offers to send the email again.</p>
<h2 id="signin">Sign in</h2>
<p>Use <b>Log in</b> on the home page. Sign in with the same method you used to sign up: email and password, or Google.</p>
<h2 id="forgot">Forgot your password</h2>
<ol>
<li>On the sign-in screen press <b>Forgot password?</b></li>
<li>Type your email and press <b>Email me a reset link</b>.</li>
<li>Open the link in the email and choose a new password. The link works once, for 1 hour.</li>
</ol>
${go('#/help/account', 'Change your password or add one')}`,
  },
  {
    id: 'find-your-way', cat: 'start', title: 'Finding your way around',
    sum: 'The sidebar, Recents, Home, the top bar, light and dark mode, and the phone layout.',
    kw: 'navigation sidebar menu layout recents search home top bar theme dark light mobile phone tab bar',
    body: `
<h2 id="sidebar">The sidebar</h2>
<p>The left sidebar holds every part of Scenly:</p>
<ul>
<li><b>New chat</b> starts an empty chat.</li>
<li><b>Chat, Image, Video Studio and Code</b> are open to everyone.</li>
<li><b>Video Agent, Video Builder, Studio Pro and Ad Studio</b> carry a small tag. They are part of the paid plans.</li>
<li><b>Workspace</b>: Projects, Characters, AI Apps, Assets and Help.</li>
<li><b>Recents</b>: everything you worked on lately. See <a href="#/help/assets-recents">Assets and Recents</a>.</li>
<li>At the bottom: your <b>account menu</b>.</li>
</ul>
<p>Hide the sidebar with the button next to the logo. On a desktop you can drag its edge to make it wider or narrower.</p>
<h2 id="home">Home</h2>
<p>Press the Scenly logo to open Home: rotating banners, a quick "What do you want to create today?" box (pick Image, Video, Chat or Code, then press <b>Start</b>), featured models, popular apps and your recent creations.</p>
<h2 id="topbar">The top bar</h2>
<p>Every page has a small bar at the top with:</p>
<ul>
<li>a <b>?</b> button that opens the help article for the page you are on,</li>
<li>a <b>sun or moon</b> button to switch between dark and light mode,</li>
<li>your <b>credit balance</b> (press it to see plans and your history), and <b>Pricing</b> (it shows UPGRADE on the Free plan).</li>
</ul>
<h2 id="account-menu">The account menu</h2>
<p>Press your name at the bottom of the sidebar for: Account &amp; password, Plans &amp; credits, My assets, Help, Dark or Light mode, Terms of Use, Privacy Policy and Sign out.</p>
<h2 id="phone">On a phone</h2>
<p>On a narrow screen a tab bar sits at the bottom: <b>Home, Chat, Image, Video</b> and <b>Menu</b>. Menu opens the full sidebar, where you find every other page, Recents and Help. The tab bar hides while the keyboard is open. Pop-up menus open as sheets from the bottom of the screen.</p>`,
  },
  {
    id: 'account', cat: 'start', title: 'Your account and password',
    sum: 'See your details, change your password or add one to a Google account, sign out.',
    kw: 'profile password change add google sign out logout delete account email name',
    body: `
<p>Open the account menu (your name at the bottom of the sidebar) and pick <b>Account &amp; password</b>. It shows your name, your email and how you sign in.</p>
<h2 id="change">Change your password</h2>
<p>Type your current password and a new one of at least 8 characters, then press <b>Change password</b>.</p>
<h2 id="add">Add a password to a Google account</h2>
<p>If you signed up with Google you have no password yet. Type a new password and press <b>Add password</b>. After that you can sign in with Google or with your email and password.</p>
<h2 id="signout">Sign out</h2>
<p>Pick <b>Sign out</b> at the bottom of the account menu. You return to the home page.</p>
<h2 id="delete">Closing your account</h2>
<p>There is no button to delete an account inside the app yet. Write to support and ask. See <a href="#/help/contact">Contact support</a>.</p>`,
  },

  // ---------------------------------------------------------------- Credits and plans
  {
    id: 'credits', cat: 'credits', title: 'How credits work',
    sum: 'One balance for everything. 1 credit = $0.001, so $1 buys 1,000 credits.',
    kw: 'credit cost price balance charge refund reserve estimate how much spend usage',
    body: `
<p>Everything in Scenly is paid from one credit balance: chats, documents, code, pictures, videos and apps.</p>
<div class="hp-fact"><b>1 credit = $0.001</b><span>So $1 buys 1,000 credits.</span></div>
<h2 id="price">What things cost</h2>
<p>Every model has its own price, set from the price of the AI service behind it. Scenly charges each model at its official price or less. You see the cost before you spend:</p>
<ul>
<li>The <b>Generate</b> button in Image and Video shows the estimated credits. The small <b>(i)</b> next to it explains the sum.</li>
<li>Model menus show a price for each model, and tags such as <b>Low cost</b> or <b>Premium</b>.</li>
<li>Apps and studios show the price on their run button.</li>
<li>The <b>Plans &amp; credits</b> page has a "What things cost" table and rough guides such as "about N images" for each plan.</li>
</ul>
<h2 id="when">When you are charged</h2>
<ul>
<li><b>Chat and documents</b>: by the length of the question and the answer. A reply is capped so it can never cost more than your balance. The cost shows under each answer.</li>
<li><b>Pictures</b>: charged when each picture arrives.</li>
<li><b>Videos</b>: the estimate is <b>reserved</b> when you press Generate, then settled to the real cost when the video is done. Any unused part comes back.</li>
<li><b>Prompt enhancer</b>: usually under 1 credit per press.</li>
<li><b>Free</b>: uploads, the Video Builder export, Resize and Upscale in the image editor, and clips or music you upload yourself.</li>
</ul>
<h2 id="refunds">Failed work is refunded</h2>
<p>If a picture, video or app run fails, the credits are returned automatically. Failed requests are never charged. You can see every charge and refund in your credit history on the <a href="#/billing">Plans &amp; credits</a> page.</p>
<h2 id="low">Running low</h2>
<p>When you do not have enough credits, Scenly says so and offers plans and credit packs. When email is switched on you also get an email when your balance runs low and when it reaches zero.</p>
${go('#/billing', 'See your balance and history')}`,
  },
  {
    id: 'plans', cat: 'credits', title: 'Plans and credit packs',
    sum: 'Free, Pro, Max and Ultra, plus one-time credit packs.',
    kw: 'plan pricing free pro max ultra pack top up subscription monthly price cost buy',
    body: `
<h2 id="plans">Plans</h2>
<table class="hp-table">
<thead><tr><th>Plan</th><th>Price</th><th>Credits</th></tr></thead>
<tbody>
<tr><td><b>Free</b></td><td>$0</td><td>1,000 welcome credits, once</td></tr>
<tr><td><b>Pro</b></td><td>$20 a month</td><td>20,000 every month</td></tr>
<tr><td><b>Max</b> (most popular)</td><td>$100 a month</td><td>100,000 every month</td></tr>
<tr><td><b>Ultra</b></td><td>$200 a month</td><td>200,000 every month</td></tr>
</tbody></table>
<ul>
<li><b>Free</b> lets you try every model: chat, documents, Code, pictures and editing, Video Studio and the AI apps. You get 2 styles in each Design Library group.</li>
<li><b>Pro, Max and Ultra</b> add Video Agent, Video Builder, Studio Pro and Ad Studio, and unlock every style. Unused monthly credits roll over.</li>
</ul>
<h2 id="packs">Credit packs</h2>
<table class="hp-table">
<thead><tr><th>Pack</th><th>Price</th></tr></thead>
<tbody>
<tr><td>10,000 credits</td><td>$10</td></tr>
<tr><td>25,000 credits</td><td>$25</td></tr>
<tr><td>50,000 credits</td><td>$50</td></tr>
</tbody></table>
<p>Packs are one-time top-ups for any account and <b>never expire</b>. Any pack unlocks the full Design Library. A pack does not open the paid-only studios; those need a monthly plan.</p>
<p>All plans and packs sell credits at face value: $1 buys 1,000 credits, with no bonus credits.</p>
${go('#/billing', 'Compare plans')}`,
  },
  {
    id: 'paid-tools', cat: 'credits', title: 'Paid-only tools',
    sum: 'Video Agent, Video Builder, Studio Pro and Ad Studio need a monthly plan.',
    kw: 'locked paid only pro plan upgrade video agent builder studio pro ad studio free trial',
    body: `
<p>Four studios are part of the monthly plans (Pro, Max and Ultra):</p>
<ul>
<li><a href="#/help/video-agent">Video Agent</a>: describe a video and get a full storyboard.</li>
<li><a href="#/help/video-builder">Video Builder</a>: build videos up to 5 minutes from scenes, with music, voice-over and captions.</li>
<li><a href="#/help/studio-pro">Studio Pro</a>: a guided picture and video studio that plans the shots for you.</li>
<li><a href="#/help/ad-studio">Ad Studio</a>: turn your website into a brand kit, then into picture and video ads.</li>
</ul>
<p>On the Free plan these show a small <b>Pro</b> tag in the sidebar. Opening one shows the plans instead. Credit packs alone do not open them.</p>
<p>Everything else stays open on the Free plan, limited only by your credits: chat, pictures, Video Studio, documents, Code and the AI apps.</p>
<p>Using these studios still spends credits. The plan opens them; your credits pay for what they make.</p>
${go('#/billing', 'See plans')}`,
  },
  {
    id: 'billing', cat: 'credits', title: 'Billing: upgrade, switch, cancel',
    sum: 'Start a plan, upgrade, move to a smaller plan, cancel, update your card.',
    kw: 'billing subscription upgrade downgrade cancel renew card invoice payment failed stripe manage receipt history',
    body: `
<p>Open <b>Plans &amp; credits</b> from the credit balance or <b>Pricing</b> in the top bar, or from the account menu. The page shows your plan, its status and renewal date, your credits, your credit history and your payments.</p>
<h2 id="start">Start a plan or buy a pack</h2>
<p>Press <b>Start</b> on a plan card (for example "Start Pro monthly") or <b>Buy for $10</b> on a pack. You pay on a secure checkout page. Your credits appear a moment after the payment goes through.</p>
<h2 id="upgrade">Upgrade</h2>
<p>Pick a bigger plan and confirm. You pay the difference for the rest of this month now, and get the matching share of the extra credits now. Your renewal date stays the same.</p>
<h2 id="switch">Move to a smaller plan</h2>
<p>Pick a smaller plan and confirm. The new price starts at your next renewal. There is no refund for the current month, and you keep all your credits.</p>
<h2 id="cancel">Cancel</h2>
<p>Press <b>Cancel plan</b>. Your plan stays until the end of the period you paid for, and your credits stay after that. You will not be charged again. Changed your mind? Press <b>Keep my plan</b> before the end date.</p>
<h2 id="manage">Card, invoices and address</h2>
<p>Press <b>Manage billing</b> to open the secure billing page, where you change your card, see invoices and update your billing address or tax details.</p>
<h2 id="failed">A payment did not go through</h2>
<p>The page says so and shows the amount waiting. Update your card in <b>Manage billing</b> to keep your plan.</p>
<h2 id="emails">Emails about billing</h2>
<p>When email is switched on, Scenly sends a receipt when credits are added, and emails when a plan is cancelled, ends, moves to a smaller plan, or a payment fails.</p>
${go('#/billing', 'Open Plans & credits')}`,
  },

  // ---------------------------------------------------------------- Create
  {
    id: 'chat', cat: 'create', title: 'Chat',
    sum: 'Ask anything, pick from 30+ models, attach files, download answers.',
    kw: 'chat message ask model claude gpt gemini deepseek attach file pdf word excel vision thinking regenerate stop copy download preview html background',
    body: `
<p>Chat works like any AI assistant, with one difference: you can switch between more than 30 models from different makers in one place.</p>
<h2 id="model">Pick a model</h2>
<p>Press the model button in the message bar. Each model shows its maker, a short description and its price. Models tagged <b>vision</b> can see pictures. You can also pick an image or video model here to make pictures and videos inside the chat. Coding models open in <a href="#/help/code">Code</a>.</p>
<h2 id="files">Attach files</h2>
<p>Press the paper clip, drag files onto the page or paste them. Chat reads PDF, Word, Excel, PowerPoint, CSV, code and text files, and pictures (with a vision model). A scanned PDF is read with text recognition, so you can still ask about it.</p>
<h2 id="answers">Working with answers</h2>
<ul>
<li><b>Copy</b> an answer, <b>Regenerate</b> the last one, or <b>Download</b> it as Word, PDF, Markdown or a web page.</li>
<li>Ask for "a Word document" or "as a PDF" and the answer comes as a clean file with a download card.</li>
<li>When a model writes a web page, chart or SVG, it opens in a <b>live preview</b> beside the chat.</li>
<li>Some models show their <b>Thinking</b>. Press it to read how they worked it out.</li>
<li>The credits used show under each answer.</li>
</ul>
<h2 id="background">Answers keep running</h2>
<p>An answer keeps going when you open another chat or another page. Come back and it is shown where it has got to. Several chats can answer at once. In Recents a working chat shows a small spinner, and a dot when it finished while you were away. Press <b>Stop</b> to stop the chat you are looking at. Closing or reloading the browser tab ends a running answer, so the browser asks first.</p>
<h2 id="more">More in the message bar</h2>
<ul>
<li><b>Create</b> makes a document. See <a href="#/help/docs-studio">Docs Studio</a>.</li>
<li><b>Project</b> adds the chat to a project. See <a href="#/help/projects">Projects</a>.</li>
<li>The <b>microphone</b> types what you say. See <a href="#/help/voice-input">Voice input</a>.</li>
<li>The <b>sparkle</b> improves your wording. See <a href="#/help/prompt-enhancer">Prompt enhancer</a>.</li>
<li>Press <b>Enter</b> to send and <b>Shift + Enter</b> for a new line.</li>
</ul>
${note('AI can make mistakes. Check important information.')}
${go('#/chat', 'Open Chat')}`,
  },
  {
    id: 'docs-studio', cat: 'create', title: 'Docs Studio: documents in the chat',
    sum: 'Word documents, spreadsheets, PDFs and PowerPoint decks with live preview and versions.',
    kw: 'docs document word docx excel xlsx spreadsheet pdf powerpoint pptx slides deck template brand kit mail merge tracked changes pdf tools merge split sign ocr convert version',
    body: `
<p>Docs Studio builds real files from a chat. It works with any chat model: the model plans the content, and Scenly checks it and builds the file.</p>
<h2 id="start">Start a document</h2>
<ol>
<li>In Chat press <b>Create</b> in the message bar.</li>
<li>Pick <b>Word document</b>, <b>Spreadsheet</b>, <b>PDF design</b> or <b>PowerPoint</b>, or one of the templates (for example a proposal, invoice, budget or pitch deck).</li>
<li>Describe what you want and send. You can also just ask for "a Word document about…" in a normal chat.</li>
</ol>
<p>The file opens in a panel beside the chat with a live preview.</p>
<h2 id="edit">Change it</h2>
<ul>
<li><b>By asking</b>: while a document is open, your next message changes it ("add a pricing section", "translate it into French"). Press × on the document chip to chat without changing it.</li>
<li><b>By hand</b>: edit the text, the spreadsheet cells, the PDF page or the slides directly in the panel.</li>
<li><b>Versions</b>: every change is kept. Open an older version to restore it.</li>
</ul>
<h2 id="kinds">What each type can do</h2>
<ul>
<li><b>Word</b>: headings, lists, tables, pictures, footnotes, contents, cover page, headers and footers. Attach a .docx to change it. Download as Word, Word with tracked changes, PDF, Markdown or a web page. <b>Mail merge</b> (in the Download menu) fills {{Name}} style fields from a spreadsheet.</li>
<li><b>Spreadsheet</b>: sheets with working formulas, charts, filters and formatting. Attach an .xlsx or .csv to work with your own data, even very large files. Download as Excel or CSV.</li>
<li><b>PDF design</b>: brochures, flyers, certificates, invoices and fillable forms. Attach a PDF and say "make one like this". Download as PDF, page images or a web page.</li>
<li><b>PowerPoint</b>: slides with charts, tables, pictures and speaker notes. Attach a .pptx to open it with its look. Download as PowerPoint, PDF, PDF with notes or slide images.</li>
</ul>
<h2 id="pdf-tools">PDF tools</h2>
<p>In the Create menu pick <b>PDF tools</b> to merge, split and reorder pages, rotate, compress, add a watermark or page numbers, fill a form, sign, read a scan (text recognition) or convert a PDF to Word, Excel, images or text.</p>
<h2 id="brand">Brand kits</h2>
<p>A brand kit holds your colours, fonts, logo and company details, and every document can follow it. Open <b>Brand kits</b> in the Create menu, or the palette button on a document. Use <b>From a file</b> to copy the look of a Word, Excel, PowerPoint or PDF file you already have.</p>
${tip('Long documents are written section by section, so they can take a little longer.')}
${go('#/chat', 'Open Chat')}`,
  },
  {
    id: 'code', cat: 'create', title: 'Code',
    sum: 'Describe something to build; Scenly writes the files and shows a live preview.',
    kw: 'code coding build website app script files preview zip download developer programming',
    body: `
<p>Code is a workspace for small software projects: web pages, dashboards, scripts and tools.</p>
<h2 id="how">How it works</h2>
<ol>
<li>Open <b>Code</b> and pick a coding model.</li>
<li>Describe what to build, or press one of the examples.</li>
<li>Scenly plans it and writes the files into your project, step by step.</li>
<li>Ask for changes, fixes or new features in the same conversation.</li>
</ol>
<h2 id="workspace">The workspace</h2>
<ul>
<li>A file list and an editor, so you can read and change any file.</li>
<li>A <b>live preview</b> for web projects.</li>
<li>Drop your own files in to work on them.</li>
<li><b>Download project as .zip</b> to keep everything.</li>
</ul>
${note('Code writes and edits files. It does not run commands on your computer.')}
${go('#/code', 'Open Code')}`,
  },
  {
    id: 'image', cat: 'create', title: 'Image',
    sum: 'Make pictures from words or edit a photo, with styles, references and batches.',
    kw: 'image picture photo generate seedream gpt image nano banana size quality batch reference style design library edit editor background remove upscale resize text translate mockup restyle animate',
    body: `
<p>Image makes pictures from a description, or changes a picture you add.</p>
<h2 id="make">Make a picture</h2>
<ol>
<li>Open <b>Image</b>.</li>
<li>Describe the picture in the prompt bar at the bottom.</li>
<li>Check the price on <b>Generate</b>, then press it (or press Enter).</li>
</ol>
<p>Results stack in a dated history. Your work is kept as a session in Recents, so you can come back and continue. Press <b>Explore</b> at the top for ready-made ideas.</p>
<h2 id="bar">The prompt bar</h2>
<ul>
<li><b>Mode</b>: switch between AI Image, AI Video and AI Chat.</li>
<li><b>Model</b>: each model shows what it is good at and its price.</li>
<li><b>Settings</b>: the size, the quality (on models that offer it) and the batch, 1 to 4 pictures per run. Each picture is charged on its own.</li>
<li><b>Style</b>: the Design Library (see below).</li>
<li><b>Character</b>: keep the same person, product or logo. See <a href="#/help/characters">Characters</a>.</li>
<li><b>Project</b>: add the result to a project.</li>
<li>The <b>sparkle</b> improves your prompt; its arrow turns on <b>Auto-enhance</b> for every run. See <a href="#/help/prompt-enhancer">Prompt enhancer</a>.</li>
</ul>
<p>On a narrow screen, chips that do not fit move into the <b>⋯</b> More menu.</p>
<h2 id="refs">Reference pictures</h2>
<p>Add a picture to change it or to guide the result: press <b>+ Reference</b>, drag a file in, paste it, or pick <b>From my assets</b>. How many references a model takes depends on the model.</p>
<h2 id="styles">Design Library</h2>
<p>Press <b>Style</b> to add a ready-made look in one click: 36 looks in four groups. Photo looks change a picture you add, with no prompt needed. Star a look to keep it in Favourites. The Free plan includes 2 looks in each group; any paid plan or credit pack unlocks them all.</p>
<h2 id="editor">The image editor</h2>
<p>Click any finished picture to open the editor. Every result is saved as a new version in the strip under the picture.</p>
<ul>
<li><b>Change this image</b>: describe a change, such as "make the sky pink". The wand tidies your wording first.</li>
<li><b>Remove background</b>: a see-through PNG. Plain backgrounds are removed for free; busy ones use one AI edit.</li>
<li><b>Upscale to 4K</b>: a larger, sharpened copy, free.</li>
<li><b>Resize</b>: sizes for posts, stories and banners, downloaded as one zip. Nothing is cropped; spare room is filled with a soft blur. Free.</li>
<li><b>Add text</b>: a headline drawn into the picture. Check the spelling in the result.</li>
<li><b>Translate</b>: replace the words in the picture with another language.</li>
<li><b>Mockup</b>: put the picture on a T-shirt, mug, sign and more.</li>
<li><b>Restyle</b>: redraw it with a Design Library look.</li>
<li><b>Animate</b>: turn it into a video in Video Studio.</li>
</ul>
<p>The editor shows the price of each AI edit and which model it uses; you can pick another model there.</p>
${go('#/image', 'Open Image')}`,
  },
  {
    id: 'video-studio', cat: 'create', title: 'Video Studio',
    sum: 'Make video clips from words, a picture, or another video.',
    kw: 'video clip seedance generate animate image to video video to video restyle edit extend ratio resolution duration sound audio batch',
    body: `
<p>Video Studio makes short video clips. It is open on every plan.</p>
<h2 id="make">Make a video</h2>
<ol>
<li>Open <b>Video Studio</b>.</li>
<li>Describe the scene: who, where, what happens, how the camera moves.</li>
<li>Check the price on <b>Generate</b> and press it.</li>
</ol>
<p>Videos usually take 1 to 5 minutes. You can leave the page; the history updates when the video is ready and you get a message.</p>
<h2 id="settings">Settings</h2>
<ul>
<li><b>Aspect ratio</b>: 16:9 is wide (YouTube), 9:16 is tall (Reels, TikTok, Shorts). Auto follows your reference.</li>
<li><b>Resolution</b>: higher looks sharper and costs more per second.</li>
<li><b>Duration</b>: you pay per second, so shorter clips cost less.</li>
<li><b>Batch</b>: 1 to 4 videos per run.</li>
</ul>
<p>The options depend on the model. Models with sound make synced audio with the video.</p>
<h2 id="tasks">Animate a picture or change a video</h2>
<ul>
<li><b>Create</b>: a new video from words, or from a picture you add (it becomes the start of the video). Press <b>Animate</b> on any picture in Scenly to send it here.</li>
<li><b>Edit video</b> (on models that offer it): add a video, then say what to change, such as a new style, or something to replace or remove. Upload an .mp4, .mov or .webm, pick one from your assets, or paste a public link to a video.</li>
</ul>
<p>Models that can do more than one task show the choices under their name in the model menu.</p>
${note('Video credits are reserved when you press Generate and settled to the real cost when it is done. A video that fails is refunded.')}
${tip('For videos longer than one clip, with music, voice-over and captions, use the <a href="#/help/video-builder">Video Builder</a>.')}
${go('#/video', 'Open Video Studio')}`,
  },
  {
    id: 'ai-apps', cat: 'create', title: 'AI Apps',
    sum: 'One-click tools: add a photo or a line of text and get a finished result.',
    kw: 'apps app library one click product photoshoot outfit try on face swap headshot poster blend spin ugc eraser background relight multi angle avatar',
    body: `
<p>AI Apps are one-purpose tools. You add a photo or a line of text and get a finished result, with no prompt writing. Each run is priced like a normal generation.</p>
<h2 id="list">The apps</h2>
<p>Search the App Library or filter by group:</p>
<ul>
<li><b>Characters</b>: Character Scenes, Face Swap, UGC Ad Clip.</li>
<li><b>Portraits</b>: Headshot Studio, AI Avatar Maker.</li>
<li><b>Fashion</b>: Virtual Try-On, Outfit Changer, Hair &amp; Makeup Studio, AI Model Shoot.</li>
<li><b>Product</b>: Product Photoshoot, 360° Product Spin, Photo to Ad Video.</li>
<li><b>Editing</b>: Magic Eraser, Replace Anything, Background Swap, Relight, Multi-Angle Views, Image Expander, Sketch to Render, Photo Restore, Image Text Editor, Poster Maker, Image Blender.</li>
<li><b>Video</b>: Bring Photo to Life, plus the video apps above.</li>
</ul>
<h2 id="run">Run an app</h2>
<ol>
<li>Open an app. Its inputs are on the left and your runs on the right.</li>
<li>Add the photo or text it asks for. Apps that use a person, product or logo also offer your saved <a href="#/help/characters">characters</a> in their own box.</li>
<li>Pick the output options if you like: shape and how many for pictures; shape, length and quality for videos. The price on the button follows them.</li>
<li>Press the run button.</li>
</ol>
<p>You are charged only when it succeeds; failed runs are refunded. A photo dropped into an app is used for that run only.</p>
<h2 id="background">Close it and keep going</h2>
<p>You can close the app while it works. It keeps going in the background, shows a spinner in Recents, and tells you when the result is ready. Each app you use gets one entry in Recents with all its past runs, and everything it makes is in Assets.</p>
${go('#/apps', 'Open AI Apps')}`,
  },

  // ---------------------------------------------------------------- Pro studios
  {
    id: 'video-agent', cat: 'paid', title: 'Video Agent',
    sum: 'Describe a video once and get a storyboard, ready to check and generate in the Video Builder.',
    kw: 'video agent storyboard scenes describe template length shape style language voice-over script chain continuity music product ugc explainer story',
    body: `
${paidNote('Video Agent')}
<p>Video Agent turns one description into a full storyboard. It opens in the <a href="#/help/video-builder">Video Builder</a>, where you check it before any video is made.</p>
<h2 id="how">How it works</h2>
<ol>
<li>Open <b>Video Agent</b> and pick a tab (General, Product Ad, UGC Ad, Explainer, Music Video or Story), or start from a <b>template</b> at the bottom. Replace the parts in [brackets] with your own words.</li>
<li>Describe the video in a sentence or two.</li>
<li>Set the options, then press <b>Write the storyboard</b>.</li>
<li>The storyboard opens in the Video Builder. Check the scenes, change anything, then press <b>Generate</b> there.</li>
</ol>
<h2 id="options">Options</h2>
<ul>
<li><b>Shape</b>: 16:9 for screens, 9:16 for phones, 1:1 for square feeds.</li>
<li><b>Length</b>: from 15 seconds to 5 minutes. The video is planned as scenes the video model can make.</li>
<li><b>Style</b>: one look that every scene keeps.</li>
<li><b>Language</b>: for the narration and the title.</li>
<li><b>Voice-over script</b>: writes what the voice says in each scene. Scenly cannot speak it for you yet, so record it or upload one in the Builder.</li>
<li><b>Keep Visual Continuity (Chain Scenes)</b>: each scene starts from the last picture of the scene before, so people, places and light stay the same.</li>
<li><b>Music</b>: adds a track with that mood from the music library.</li>
</ul>
<h2 id="files">Add your own files</h2>
<p>Press <b>Image / Video / Logo / Voice</b> to add a picture to start from, a picture to end on, a logo, a link to a video, a voice-over or music. The agent studies them before it writes.</p>
${note('Writing the storyboard is the only cost on this page, and it is small. Generating the scenes is priced in the Builder before you press the button.')}
${go('#/agent', 'Open Video Agent')}`,
  },
  {
    id: 'video-builder', cat: 'paid', title: 'Video Builder',
    sum: 'Put clips, pictures and AI scenes in order, add music, voice-over and captions, and export one video.',
    kw: 'video builder timeline scene edit export mp4 music voice-over voiceover captions subtitles srt trim split transition crossfade retake b-roll keyframe versions lock undo end card title beat',
    body: `
${paidNote('Video Builder')}
<p>The Video Builder makes videos up to 5 minutes long. Put clips, pictures and AI scenes in order, add a voice-over, music and captions, then export one finished MP4.</p>
<h2 id="start">Start a video</h2>
<ul>
<li>Press <b>New video</b>, then drop in your clips and pictures, or add AI scenes.</li>
<li>Or let <a href="#/help/video-agent">Video Agent</a> write the scenes for you.</li>
</ul>
<p>Your projects are listed on the Video Builder page and in Recents. Changes save by themselves.</p>
<h2 id="whole">Settings for the whole video</h2>
<ul>
<li><b>Shape</b> (16:9, 9:16, 1:1) and <b>resolution</b> (720p is quicker and cheaper, 1080p is sharper).</li>
<li><b>Model</b> for AI scenes. "Fast Draft" costs the fewest credits, "Best Quality" the most.</li>
<li>The total <b>length</b> and the <b>credits</b> the AI scenes without a clip will cost.</li>
</ul>
<h2 id="scenes">Scenes</h2>
<p>Pick a scene on the left to change it:</p>
<ul>
<li><b>AI scene</b>: describe what is seen, who, where, what happens and how the camera moves. Optionally add a start picture, a saved character, or start from the last frame of the scene before.</li>
<li><b>Preview picture</b>: draw a quick still of the scene for a few credits to check the look before you spend video credits.</li>
<li><b>Duration, trim, speed</b> (with "Play backwards"), <b>transition</b> (cut, crossfade, fade to black), <b>fit</b> (blurred edges or fill) and <b>volume</b>.</li>
<li><b>Narration</b>: what is said in the scene, used for captions and voice-over planning.</li>
<li><b>Versions</b>: each new take is kept. Step through them or compare two side by side.</li>
<li><b>Lock</b> a scene so it is not generated again or deleted by accident.</li>
</ul>
<p>Press <b>Generate</b> to make every AI scene that has no clip yet, or generate just the selected one. A scene that fails is refunded.</p>
<h2 id="timeline">The timeline</h2>
<ul>
<li>Drag the ends of a scene to trim it. Press <b>S</b> to split at the playhead and <b>Space</b> to play or pause.</li>
<li>Select part of a scene (press <b>I</b> and <b>O</b>, or hold Shift and drag on the time ruler), then <b>Retake</b> it with AI or put a new <b>B-roll</b> clip over it. The rest stays as it is.</li>
<li>Add a new AI scene that continues from the picture at the playhead.</li>
<li><b>Undo</b> and <b>Redo</b> (Ctrl or ⌘ + Z), and a <b>History</b> of every change in the session.</li>
<li>Zoom the timeline for exact trims, and turn snapping on or off.</li>
</ul>
<h2 id="sound">Voice-over, music and captions</h2>
<ul>
<li><b>Voice-over</b>: upload a recording. Scenly can plan scenes from what is said, and put each spoken phrase on the Captions track.</li>
<li><b>Music</b>: pick from the music library or upload your own (MP3, WAV or M4A, up to 20 minutes). It loops or shortens to fit, fades in and out, and is lowered while the voice speaks.</li>
<li><b>Captions</b>: add captions at the playhead, double-click to change the words, drag to move them. Choose a caption look, add titles, lower thirds and an end card.</li>
</ul>
<h2 id="export">Export</h2>
<p>Press <b>Export video</b> to join everything into one MP4. Exporting is <b>free</b> and keeps running if you close the tab. Turn on burned-in captions to draw them into the picture; you also get a separate .srt caption file. You can also export just the sound. The finished video is saved in Assets.</p>
${tip('The preview is a quick draft. Crossfades and exact sound levels show in the export.')}
${go('#/builder', 'Open Video Builder')}`,
  },
  {
    id: 'studio-pro', cat: 'paid', title: 'Studio Pro',
    sum: 'A guided picture and video studio: Agent, Video, Image and Enhancer, with face lock.',
    kw: 'studio pro agent plan autopilot draft standard high templates ugc short drama social ad video camera lens move image product shoot style transfer enhancer upscale 4k face lock',
    body: `
${paidNote('Studio Pro')}
<p>Studio Pro is a guided studio for pictures and video. Everything it makes goes into Assets and Recents like the rest of Scenly.</p>
<h2 id="home">Home and templates</h2>
<p>One prompt box, the four tools, and 26 starting templates in six groups: Ads, UGC, Short drama, Social, Branding and Explainers. Templates open in the Agent.</p>
<h2 id="agent">Agent</h2>
<p>One line in, a finished piece out: an ad, a UGC clip, a short drama, a social clip, product shots or an explainer.</p>
<ol>
<li>Describe what you want in a sentence. Pick a format or leave it on <b>Auto</b>.</li>
<li>The agent writes a production plan in a few seconds and shows the shots and the price.</li>
<li>Approve it. It makes a set of pictures, one video take filmed from an opening frame, or a film of several shots cut together for you.</li>
<li>It also writes the post copy: hook, caption, call to action and hashtags.</li>
</ol>
<ul>
<li><b>Autopilot</b> on: it makes everything without stopping for your approval. Off: it shows the plan and price first.</li>
<li><b>Draft / Standard / High</b> sets the video quality. Draft is the cheapest way to try an idea.</li>
<li>Add a picture of your product, person or place and the agent builds the work around it.</li>
<li>A finished film can be opened in the <a href="#/help/video-builder">Video Builder</a> to add music, a voice-over or captions.</li>
<li>Sessions are saved in Recents and reopen where you left them.</li>
</ul>
<h2 id="video">Video</h2>
<p>Modes: Generate, Frame to Video, Camera Control, Edit Video and Style Transfer (anime, claymation, film noir and more). Choose the model, duration, shape and resolution, plus a camera body, a lens and a camera move. The camera and lens are added to your prompt as words, so they work with every model.</p>
<h2 id="image">Image</h2>
<p>Generate, Edit, Product Shoot (put your product photo into a styled scene) and Style Transfer, with every image model.</p>
<h2 id="enhancer">Enhancer</h2>
<p>Sharpen, add detail and upscale a picture up to 4K. Choose AI detail, Upscale, or both, and compare with the before and after slider. Pictures only: there is no video upscaler yet.</p>
<h2 id="face-lock">Face lock</h2>
<p>In the Agent, Video and Image tools, pick a saved character and every picture and video shot is made with that same face, product or logo. See <a href="#/help/characters">Characters and face lock</a>.</p>
${go('#/pro', 'Open Studio Pro')}`,
  },
  {
    id: 'ad-studio', cat: 'paid', title: 'Ad Studio and ad templates',
    sum: 'Turn your website into a brand kit, then into picture and video ads.',
    kw: 'ad studio ads advertising brand kit website logo product feed stories placement template bold hook before after ugc testimonial unboxing offer sale headline video version',
    body: `
${paidNote('Ad Studio')}
<p>Ad Studio reads your website, builds a brand kit from it, and makes ads that follow it.</p>
<h2 id="kit">1. Make a brand kit</h2>
<ol>
<li>Open <b>Ad Studio</b> and type your website address, such as yourbrand.com.</li>
<li>Scenly opens the site, follows a few key pages (pricing, products, about) and collects your logo and product pictures.</li>
<li>You get an editable brand kit: name, tagline, colours, look, tone, audience, selling points and products with prices.</li>
</ol>
<p>Click a picture to say whether it is the logo or the photo of a product. A product with a photo is shown as it really looks in its ads. You can add your own logo and product photos too. <b>Read the site again</b> rebuilds the kit.</p>
${note('Some websites block automated visitors and cannot be read. Fill in the kit by hand instead.')}
<h2 id="make">2. Make ads</h2>
<ol>
<li>Pick a placement: <b>feed</b> (square picture ads for Instagram, Facebook and LinkedIn), <b>stories</b> (tall, edge to edge on a phone) or <b>video ad</b>.</li>
<li>Pick the products to feature.</li>
<li>Pick an ad template, or <b>Mix it up</b>.</li>
<li>Generate. Scenly writes the ad ideas and makes the pictures with the headline in them, with your logo placed in the ad.</li>
</ol>
<h2 id="templates">Ad templates</h2>
<p>Bold hook, Before / After, Us vs Them, POV moment, UGC testimonial, Unboxing, 3 reasons why, Behind the scenes, Problem solved, Product showcase, Offer / Sale, or Mix it up. Each template shapes both picture ads and video ads.</p>
<h2 id="after">After that</h2>
<ul>
<li>Copy the headline, the line and the call to action in one click.</li>
<li>Press <b>Video version</b> on an ad to hand it to the Studio Pro Agent, which makes a short video of it.</li>
<li>Each brand is listed in Recents. Everything made is in Assets.</li>
</ul>
${go('#/ads', 'Open Ad Studio')}`,
  },

  // ---------------------------------------------------------------- Workspace and tools
  {
    id: 'projects', cat: 'tools', title: 'Projects',
    sum: 'Keep instructions, files, chats and creations together so the AI knows the background.',
    kw: 'project folder workspace instructions knowledge files brand client campaign context shared',
    body: `
<p>A project keeps instructions, files, chats and creations together. Give it its background once, and every chat in it answers with all of that in mind.</p>
<h2 id="make">Make a project</h2>
<ol>
<li>Open <b>Projects</b> and press <b>New project</b>.</li>
<li>Give it a name and, if you like, a description.</li>
<li>Write <b>instructions</b>: who the audience is, the tone of voice, facts about the brand, what to avoid, the format you want.</li>
<li>Add <b>files</b>: brand guides, briefs, product sheets, reference photos (PDF, Word, text, code and images). Drop them anywhere on the page.</li>
</ol>
<h2 id="use">Use it</h2>
<ul>
<li>Start a chat, image, video or code build from the project page.</li>
<li>Or pick the project from the <b>Project</b> chip in any prompt bar.</li>
<li>Add things you already made with <b>Add existing</b>, the chat menu or the button on a creation.</li>
</ul>
<p>Chats in a project read its instructions, its files, the other chats in it and the prompts of its pictures and videos. Vision models also see a few of its pictures.</p>
<p>Deleting a project keeps its chats, pictures and videos; they only leave the project.</p>
${go('#/projects', 'Open Projects')}`,
  },
  {
    id: 'characters', cat: 'tools', title: 'Characters and face lock',
    sum: 'Save a person, product or logo once and keep it the same in every picture and video.',
    kw: 'character face lock same person consistent product logo reference photos save identity',
    body: `
<p>A character is a person, a product or a brand logo you save once. Pick it later and it stays the same across scenes, outfits and poses.</p>
<h2 id="save">Save a character</h2>
<ol>
<li>Open <b>Characters</b> and press <b>New character</b>.</li>
<li>Choose what it is: a person, a product or a brand logo.</li>
<li>Upload 1 to 4 photos and give it a name. Optionally add details to always keep, such as "round glasses" or "matte black, silver cap".</li>
<li>For a person, tick the box to confirm it is you, or that you have this person's permission.</li>
</ol>
<h2 id="use">Use a character</h2>
<ul>
<li>In <b>Image</b> and <b>Video Studio</b>: press the <b>Character</b> chip in the prompt bar. In video, the character's first photo becomes the first frame.</li>
<li>In <b>AI Apps</b> that use a person, product or logo: pick it from the saved box.</li>
<li>In the <b>Video Builder</b>: start a scene from the character's picture.</li>
<li>In <b>Studio Pro</b> (Agent, Video and Image): use <b>Face lock</b>, so every picture and every shot of a film keeps the same face, product or logo.</li>
</ul>
<p>Rename, change or delete characters on the Characters page, where tabs sort them into People, Products and Logos.</p>
${go('#/characters', 'Open Characters')}`,
  },
  {
    id: 'assets-recents', cat: 'tools', title: 'Assets and Recents',
    sum: 'Find everything you made, filter it, download it, and pick up where you left off.',
    kw: 'assets library gallery history recents download zip filter search star rename delete storage find',
    body: `
<h2 id="assets">Assets</h2>
<p>Assets holds every picture, video and sound you have made anywhere in Scenly, newest first.</p>
<ul>
<li>Filter by type: All, Videos, Images or Other (sound).</li>
<li>Filter by where it was made: Image, Video Studio, Studio Pro, Ad Studio, Video Agent, Video Builder, the editor, chats and each AI app you used.</li>
<li>Switch between grid and list.</li>
<li>Press <b>Select</b>, click several files, and download them as one ZIP.</li>
<li>Open an item to download it, reuse its prompt, edit it, animate it, or open the app or video project it came from. Reusing continues in the session it came from.</li>
<li>The page shows how much storage you use.</li>
</ul>
<h2 id="recents">Recents</h2>
<p>Recents in the sidebar lists your latest work of every kind together: chats, code builds, image and video sessions, AI apps, and (on paid plans) Video Builder and Video Agent projects, Studio Pro sessions and Ad Studio brands. Each has its own icon.</p>
<ul>
<li>A spinner means it is still working. A dot means it finished while you were elsewhere.</li>
<li>Press the search icon next to RECENTS to search your history.</li>
<li>Open the menu on an item to star, rename or delete it.</li>
</ul>
${go('#/assets', 'Open Assets')}`,
  },
  {
    id: 'prompt-enhancer', cat: 'tools', title: 'Prompt enhancer',
    sum: 'The sparkle button rewrites a short idea into a clear, detailed prompt. Undo any time.',
    kw: 'prompt enhancer sparkle improve rewrite better prompt auto enhance undo wording',
    body: `
<p>The sparkle button turns a short idea into a clear, detailed prompt. It adapts to what you are doing: a chat message, a picture, a video, a scene, an agent brief or a brand-kit field.</p>
<h2 id="use">Use it</h2>
<ol>
<li>Type a short idea in a prompt box.</li>
<li>Press the <b>sparkle</b>. In a prompt bar it sits next to the microphone; elsewhere it sits in the corner of the box.</li>
<li>A line above the box says it is working. Your words stay visible; press <b>Stop</b> to cancel.</li>
<li>When it is done, read the new prompt. Press <b>Undo</b> to get your own words back. Typing in the box drops the undo.</li>
</ol>
<p>In Image, when a photo is attached, it reads the photo too.</p>
<h2 id="auto">Auto-enhance (Image and Video)</h2>
<p>Open the small arrow next to the sparkle and turn on <b>Auto-enhance when I press Generate</b>. Every prompt is then improved before it is generated, and the bar shows <b>Auto</b>. Turn it off the same way.</p>
<p>It never runs by itself unless Auto-enhance is on. One press costs usually under 1 credit.</p>`,
  },
  {
    id: 'voice-input', cat: 'tools', title: 'Voice input',
    sum: 'Press the microphone and speak; your words are typed into the box.',
    kw: 'voice microphone mic dictation speak talk speech transcribe language',
    body: `
<p>Every prompt bar has a microphone button.</p>
<ol>
<li>Press the <b>microphone</b> and speak. Your words are written into the box.</li>
<li>Press it again, or <b>Done</b>, to stop. Then send as usual.</li>
</ol>
<ul>
<li>Text you already typed stays where it is, and you can keep editing while it listens.</li>
<li>In Chrome, Edge and Safari the words appear as you speak. In other browsers they arrive a few seconds behind your voice.</li>
<li>Use the language menu in the listening strip to set the spoken language. Auto follows your browser.</li>
<li>Listening stops after one minute without speech, and after 30 minutes in total.</li>
</ul>
${note('Your browser asks for permission to use the microphone the first time. If you said no, allow it in the browser settings for this site.')}`,
  },
  {
    id: 'expand-resize', cat: 'tools', title: 'Bigger text boxes and resizable panels',
    sum: 'Open any text box in a large editor, resize panels and move pop-ups.',
    kw: 'expand editor large text box resize panel drag divider move dialog popup fullscreen shortcut keyboard',
    body: `
<h2 id="expand">Large text editor</h2>
<p>When you point at or click in a text box, a small <b>expand</b> button appears. Press it, or press <b>⌘/Ctrl + Shift + E</b>, to edit the text in a large pop-up with a character count.</p>
<ul>
<li><b>Save</b> (⌘/Ctrl + Enter) puts the text back in the box.</li>
<li><b>Cancel</b> (Esc) leaves it as it was.</li>
</ul>
<p>The Image and Video prompt bars also have their own button to make the box taller.</p>
<h2 id="panels">Resize panels</h2>
<p>On a desktop, drag the divider between two panels to resize them; double-click it to go back to the default. Sizes are remembered on this device. This works for the sidebar, the chat list, the chat and its preview panel, Code, the Video Builder and the Studio Pro tools.</p>
<h2 id="whole-panel">Show a whole panel large</h2>
<p>Side panels in the Video Builder and Studio Pro have an expand button in their top-right corner. It shows the whole panel large in the middle of the screen. Press Esc, the button again, or click outside to return.</p>
<h2 id="dialogs">Move and resize pop-ups</h2>
<p>Drag a pop-up window by its header to move it, and by its bottom-right corner to resize it.</p>`,
  },

  // ---------------------------------------------------------------- Troubleshooting and FAQ
  {
    id: 'troubleshooting', cat: 'help', title: 'Troubleshooting',
    sum: 'Fixes for the most common problems.',
    kw: 'problem error fix not working failed stuck slow credits email microphone upload website refused locked',
    body: `
<h2 id="credits">"Not enough credits"</h2>
<p>The action needs more credits than you have. Press <b>Get credits</b> in the message, or open <a href="#/billing">Plans &amp; credits</a> and buy a pack or start a plan. On a plan, new credits arrive on your renewal date.</p>
<h2 id="failed">A picture, video or app run failed</h2>
<p>Your credits were returned automatically. Try again, maybe with a different model or a simpler prompt. Some models refuse certain content or pictures; another model may accept it.</p>
<h2 id="slow">My video is taking a long time</h2>
<p>Videos usually take 1 to 5 minutes, longer at high resolution or length. You can leave the page; it keeps going and you get a message when it is ready. Find it in Recents and Assets.</p>
<h2 id="locked">A studio shows the plans instead of opening</h2>
<p>Video Agent, Video Builder, Studio Pro and Ad Studio need a monthly plan. A credit pack alone does not open them. See <a href="#/help/paid-tools">Paid-only tools</a>.</p>
<h2 id="style">A style has a lock</h2>
<p>The Free plan includes 2 looks in each Design Library group. Any paid plan or credit pack unlocks all of them.</p>
<h2 id="picture-video">My own picture will not start a video</h2>
<p>Video models can only start from a picture with a public web address. Scenly takes care of this where it can. If a message says the picture could not be used, try the <b>Animate</b> button on a picture made in Scenly, or describe the scene in words instead.</p>
<h2 id="email">The confirmation or reset email has not arrived</h2>
<p>Check your spam folder, then use <b>Send the email again</b>. On the sign-up screen you can also type the 6-digit code. A reset link works for 1 hour and only once.</p>
<h2 id="mic">The microphone does not work</h2>
<p>Allow microphone access for this site in your browser, and make sure no other app is using the microphone. See <a href="#/help/voice-input">Voice input</a>.</p>
<h2 id="answer-stopped">A chat answer stopped</h2>
<p>Answers keep running while you move around Scenly, but reloading or closing the browser tab ends them. Press <b>Regenerate</b> to try again.</p>
<h2 id="website">Ad Studio cannot read my website</h2>
<p>Some sites block automated visitors. Fill in the brand kit by hand and upload your logo and product photos.</p>
<h2 id="upload">An upload is refused</h2>
<p>Check the file type the tool asks for. Uploads have a size limit per file (pictures 30 MB, documents 100 MB, sound 100 MB, videos 500 MB unless your Scenly server sets other limits).</p>
<h2 id="still">Still stuck?</h2>
<p>See <a href="#/help/contact">Contact support</a>.</p>`,
  },
  {
    id: 'faq', cat: 'help', title: 'Frequently asked questions',
    sum: 'Quick answers about credits, plans, models and your work.',
    kw: 'faq questions expire roll over refund cancel models which ai privacy watermark free',
    body: `
<h2 id="expire">Do credits expire?</h2>
<p>Credit pack credits never expire. Unused monthly plan credits roll over. If you cancel, you keep your credits.</p>
<h2 id="cost">How much is a credit?</h2>
<p>1 credit is $0.001, so $1 buys 1,000 credits. The Free plan's 1,000 welcome credits are worth $1 of use.</p>
<h2 id="charged-fail">Am I charged when something fails?</h2>
<p>No. Failed pictures, videos and app runs are refunded, and failed requests are never charged.</p>
<h2 id="free">What can I do on the Free plan?</h2>
<p>Chat, documents, Code, pictures and editing, Video Studio and the AI apps, paid from your credits. Video Agent, Video Builder, Studio Pro and Ad Studio need a monthly plan.</p>
<h2 id="models">Which AI models can I use?</h2>
<p>More than 30 chat models from makers such as Anthropic, OpenAI, Google, DeepSeek, Qwen, Kimi, GLM and xAI, plus picture models (Seedream, GPT Image, Nano Banana) and the Seedance video models. Each model menu lists what is available today with its price.</p>
<h2 id="cancel">Can I cancel any time?</h2>
<p>Yes. Your plan stays until the end of the period you paid for and you are not charged again. See <a href="#/help/billing">Billing</a>.</p>
<h2 id="where">Where is the thing I made?</h2>
<p>In <a href="#/help/assets-recents">Assets</a> (every picture, video and sound) and in Recents in the sidebar.</p>
<h2 id="voice">Can Scenly speak a voice-over for me?</h2>
<p>Not yet. Video Agent can write the voice-over script; record or upload the voice in the Video Builder.</p>
<h2 id="phone">Does it work on a phone?</h2>
<p>Yes. Scenly works in the browser on phones and tablets, with a tab bar at the bottom. See <a href="#/help/find-your-way">Finding your way around</a>.</p>
<h2 id="privacy">What happens to my data?</h2>
<p>Read the <a href="#/privacy">Privacy Policy</a> and the <a href="#/terms">Terms of Use</a>.</p>`,
  },
  {
    id: 'contact', cat: 'help', title: 'Contact support',
    sum: 'How to reach the Scenly team.',
    kw: 'contact support help email team question',
    body: `
<p>Could not find your answer here? Email the Scenly team at <a href="mailto:{{support}}">{{support}}</a>. Tell us what you were doing, what you expected and what happened. A screenshot helps.</p>
<p>Scenly is a product of ADXL PTY LTD, 447 Collins St, Melbourne VIC 3000, Australia.</p>
<p>Before you write, <a href="#/help/troubleshooting">Troubleshooting</a> and the <a href="#/help/faq">FAQ</a> may already have the answer.</p>`,
  },
];
