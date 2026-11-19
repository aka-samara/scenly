# Scenly

A multi-model AI app: chat, image generation, video generation and file reading, with a credit system. Every model is reached through one API key on the [AICredit API](https://aicreditapi.com/) gateway.

## Features

Scenly looks and works like a creative studio (dark theme, left navigation, one prompt bar at the bottom of the screen).

- **Home**: rotating banners, a quick "what do you want to create" bar, featured models, popular apps and your recent creations.
- **Image studio**: Seedream 5.0 Pro, GPT Image 2 and Nano Banana. Pick the model from a menu with a one-line pitch and price for each, set size and quality, add up to 2 reference images to edit or blend, and generate up to 4 at once. Results stack in a dated history feed.
- **Video studio**: every Seedance model on the gateway. Aspect ratio (21:9 to 9:16, or auto), resolution (480p to 4K where the model allows), a duration slider (up to 30 s on Seedance 2.5), batch of up to 4, image-to-video and video-to-video (restyle a clip from a public video link). Jobs run in the background and the feed updates when they finish.
- **Creation bar**: reference slot (upload, paste, drag and drop, or pick from your assets), mode switch (Image, Video, Chat), model menu, settings popover, **Prompt Enhancer** (AI rewrites a short idea into a detailed prompt, on demand or automatically), batch size, and a Generate button that shows the credit cost before you click.
- **AI Apps**: 14 one-click tools such as Product Photoshoot, Outfit Changer, Image Expander, Poster Maker, Image Blender, 360° Product Spin, Photo to Ad Video, Bring Photo to Life and Video Restyle. Each opens in a panel with its inputs on the left and your runs on the right. Apps are defined in `server/apps.js`; add one by adding an entry.
- **Assets**: every image and video you made, filterable, with a viewer that lets you download, reuse the prompt, edit an image, or animate it into a video.
- **Chat** with 30+ models (Claude, GPT, Gemini, DeepSeek, Qwen, Kimi, GLM, Grok and more), streamed live, with file reading (PDF, DOCX, XLSX, PPTX, code, CSV), vision, a chat history panel, and image or video models available inside chat too.
- **One sidebar, one history**: Chat, Image, Video and Code share a single sidebar. Under it, Recents lists every chat, code build, image session and video session together, each with its own icon. Image and video prompts are grouped into sessions (a conversation of kind image or video; each generation carries a sessionId), so earlier work can be reopened and continued. The app opens on Chat; the logo leads to the Home page.
- **Projects**: a project holds instructions, knowledge files (PDF, Word, text, code, images) and any chats, code builds, images and videos you assign to it. Every chat in a project is sent the instructions, the file text, recent messages from the project's other chats and the prompts of its creations, so it answers as one project. Vision models also get up to four project pictures. Assign from the Project chip in any prompt bar, the chat menu, a creation card, or "Add existing" on the project page.
- **Characters**: save a person, product or brand logo once from 1 to 4 photos, then pick it from the Character chip in Image or Video, or inside any app. Several photos are combined in the browser into one reference sheet, because the image models accept two reference pictures at most. In video the character's first photo becomes the first frame. Saving a person needs a permission tick.
- **Face, fashion and editing apps**: Character Scenes, Face Swap, Virtual Try-On, Hair & Makeup, AI Model Shoot, Headshot Studio, Magic Eraser, Replace Anything, Background Swap, Relight and Multi-Angle Views.
- **Downloads**: every chat reply can be saved as Word (.docx), PDF, Markdown or HTML. Asking for "word format" or "as a PDF" makes the reply a clean document with a download card. Word files are built on the server in `server/export.js`.
- **Docs Studio**: documents are built inside the chat. Pick **Create** in the message bar (or just ask for "a Word document"), and the file opens in a panel beside the chat with a live preview, version history with undo and restore, edits by prompt, editing by hand, brand kits (colours, fonts, logo, company details) and downloads. The model only plans the content; Scenly checks it and builds the real file, so it works with any chat model. Long documents are written section by section because the AICredit gateway cuts any single request at about 60 seconds. Code is in `server/docs/` and `public/docs.js`.
- **Live preview**: any HTML or SVG a model writes opens in a sandboxed preview panel beside the chat, so websites, charts and dashboards show as working pages.
- **Code**: a coding workspace in the style of Claude Code and Codex. Pick a coding model, describe what to build, and it writes and edits the project's files as one-line steps with line counts. The workspace has a file list, an editor, a live preview for web projects and a .zip download. It writes files only; it does not run commands.
- **Credits**: one balance for everything; images are charged after they arrive, videos reserve credits and settle to the real cost, failed jobs are refunded.

**Spreadsheets (Docs Studio).** Pick Create, then Spreadsheet, or attach an `.xlsx` or `.csv` file. The model plans the workbook (sheets, columns, formulas, charts); Scenly calculates every formula with HyperFormula before anything is delivered, sends failures back to the model once, and builds a real `.xlsx` with ExcelJS: live formulas, number formats, totals, frozen headers, filters, dropdowns, conditional formatting, named ranges, protected sheets and native Excel charts. The panel shows an editable grid with sheet tabs, a formula bar and the charts; each cell edit is a new version. Large uploads (over 2,000 rows a sheet) are stored in DuckDB under `data/docs/<id>/data.duckdb`; the model asks questions with read-only SQL and builds summary sheets from the answers, so millions of rows work. Five templates (budget, project tracker, financial model, sales dashboard, invoice) open without a model call. Code: `server/docs/kinds/sheet.js` and `server/docs/sheet/`, client grid in `public/docs-sheet.js`. New packages: `exceljs`, `hyperformula` (GPL v3 licence), `@duckdb/node-api`, so run `npm install` after updating.

**Word documents (Docs Studio).** Pick Create, then Word document, start from a template (proposal, service agreement, report, CV, letter), or attach a `.docx` and ask for a change to it. The model writes settings plus Markdown; Scenly builds a real `.docx` with the `docx` library: true heading styles, numbered and bulleted lists, tables, pictures, footnotes, a table of contents, cover page, headers and footers with page numbers, sections (portrait and landscape) and columns. Extra syntax on top of Markdown: `[^1]` footnotes, `[[pagebreak]]`, `[[section: landscape]]`, `[[columns: 2]]`, `[[center]]`, `![alt](file:ID "60%")` for uploaded pictures, `{{Field}}` for mail merge and `{==text==}{>>comment<<}` for review comments. An uploaded `.docx` is opened as version 1 (text, lists, tables, pictures and footnotes through mammoth, page setup, fonts, colours, header and footer read from the file) and then edited by prompt: rewrite, translate, summarise, restructure, review with comments. Download offers "Word with tracked changes", which compares the version with the one before it or with the first one and writes real Word revisions to accept or reject. Mail merge (in the Download menu) fills `{{Field}}` from a spreadsheet in the chat or an uploaded Excel or CSV file and gives one file or a zip of separate files. Code: `server/docs/kinds/word.js` and `server/docs/word/`. New packages: `docx`, `diff`, `turndown`, `turndown-plugin-gfm`, so run `npm install` after updating.

**PDF designer and PDF tools (Docs Studio).** Pick Create, then PDF, start from a template (invoice, certificate, one-pager, menu, brochure, report) or ask for "a brochure", "a flyer", "a fillable form". The model writes each page as HTML on Scenly's page stylesheet (grid, cards, bands, tables, stat tiles) with the tags `<chart>`, `<qr>`, `<field>` and `<img src="logo|file:ID">`; multi-page PDFs are planned first and every page is then designed in parallel from its brief and a shared art direction. Headless Chrome (Puppeteer, scripts off, network blocked) lays each page out and prints it. Before a version is saved every page is measured: a page that runs over is rewritten once or scaled to fit, tags left open by a cut-off reply are closed, and text that would be invisible on its background gets a readable colour. `<field>` boxes become real fillable form fields. Text can be edited directly on the page in the panel, or as HTML. Attach a PDF and say "make one like this" and its measured layout (page size, positions, type sizes, colours) is given to the model to rebuild. Downloads: PDF, page images, HTML. Word documents also download as PDF now.
**PDF tools** (Create menu, or the Download menu of a PDF) work on any uploaded PDF or on the PDF in the panel: merge, split and organise pages, rotate, compress, watermark, page numbers, fill a form, sign (drawn signature placed by clicking the page), OCR for scans (tesseract.js, English, offline data), and convert to Word (opens in Docs Studio), Excel, images or text. A scanned PDF uploaded to a chat is read with OCR so questions about it work; "convert this PDF to Word" in the chat opens it as a Word document. Code: `server/docs/kinds/pdf.js`, `server/docs/pdf/` (render, base stylesheet, components, charts, templates, tools, routes), client `public/docs-pdf.js`. New packages: `puppeteer` (downloads Chrome on `npm install`; if it cannot start run `npx puppeteer browsers install chrome`), `pdf-lib`, `pdfjs-dist`, `@napi-rs/canvas`, `qrcode`, `tesseract.js`, `@tesseract.js-data/eng`. On a server without Chrome's system libraries, set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome or Chromium.

**Presentations (Docs Studio).** Pick Create, then PowerPoint, start from a template (pitch deck, business update, sales proposal, project kickoff, lesson or training) or ask for "a 10 slide deck about…", with a document or data file attached if the deck should be made from it. The model writes each slide as short text (title, bullets, `<chart>`, `<stat>`, a table, `<image prompt="…">` for an AI picture, `<notes>` for speaker notes); Scenly lays every slide out itself, shrinks text until it fits, and builds a real `.pptx` with editable text, native charts and tables, and notes. The same layout draws the preview, so what you see is what PowerPoint opens. Edit by prompt ("add a slide about pricing after slide 3", "translate the deck into Kurdish", "make it dark") or by hand in the slide editor (reorder, duplicate, delete, layout, notes). Attach a `.pptx` to open it: its text, tables, charts, pictures and notes come in, together with its look (slide size, theme colours and fonts, backgrounds, logo and other fixed artwork, title and text positions), so new slides and whole new decks follow that look. Download as PowerPoint, PDF, a notes handout or slide images. Animations, transitions, SmartArt and video are not carried over.

**Format cloning (Docs Studio).** A brand kit can be made from a file you already have. In the brand kit menu of any document (the palette button) pick "Copy the look of a file…", or use "From a file" in Manage brand kits, and choose a Word, Excel, PowerPoint or PDF file. Scenly reads its colours, fonts and logo into a new brand kit, plus what each type needs: page size, margins, header, footer and text size from a Word file; header colours, banding and font from a workbook; slide size, backgrounds, fixed artwork and title positions from a deck; page size and colours by area from a PDF. Any document type can then follow the kit, so a deck can lend its look to a Word report or a spreadsheet. In chat, attach the file and ask for something "in the same format as this file": the kit is saved and applied in one step, and the same file is not cloned twice. "Save this look as a brand kit" keeps the look of the open document for other documents. A PDF has no editable header, footer or logo to copy, and fonts that are not installed fall back to a standard one.

**Voice input.** Every prompt bar has a microphone button. Click it, speak, and the words are written into the box; click again (or "Done") to stop, then send as usual. Text you typed stays where it is and you can keep editing while it listens. Chrome, Edge and Safari use the browser's own live dictation, so words appear as you speak. Firefox and any browser without dictation record the microphone instead and send short pieces to `POST /api/voice/transcribe`, which transcribes them with the gateway models in `VOICE_MODELS` (default `mimo-v2.6-flash,gemini-3.1-flash-lite`); there the text arrives a few seconds behind your voice. If dictation fails to start or loses its connection, the button switches to recording by itself. Listening ends after one minute without speech and after 30 minutes in total. The language menu in the listening strip sets the spoken language (Auto follows the browser). Microphones only work on https or localhost.

**Answers keep running in the background.** A chat or Code answer that is being written keeps going when you open another chat, start a new one or move to Image, Video, Code or any other page. Come back and the answer is shown where it has got to. Several chats can answer at the same time. In the side panel a chat that is working shows a small spinner in place of its icon, and a dot when it finished while you were elsewhere. Stop only stops the chat you are looking at. Reloading or closing the browser tab still ends a running answer, so the browser asks before you leave.

**Landing page for visitors.** Someone who is not signed in sees a landing page instead of the login form: a chat box with Chat, Image, Video and Code modes, starter ideas, the AI apps, features and plans. Their first message (or the app they pick) opens a "Create a free account to continue" step with a Start free trial button. After sign up or sign in the chat opens and that message is sent for them; an image or video idea is placed in the studio bar ready to generate, and a picked app opens. The message is kept in the browser tab until then, so closing the step or reloading does not lose it. `#/login` and `#/signup` are full pages, and signing out returns to the landing page.

**Model icons, legal pages.** Every model menu, model chip, reply header and price table shows the model maker's icon, the same icons the AICredit pricing page uses (copied into `public/icons/providers`, matched by the catalogue's `parent_provider`, with a letter badge as fallback). Visitors on the landing page can open the model list for Chat, Image, Video or Code; picking a model asks them to sign up and the chosen model is selected after sign up. The Terms of Use (`#/terms`) and Privacy Policy (`#/privacy`) are in `public/legal.js`, owned by ADXL PTY LTD, linked from the landing footer, the sign up forms and the user menu. New accounts store `acceptedTermsAt` and `termsVersion`. Set `SUPPORT_EMAIL` in `.env` to show a contact email on both pages.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env     # then put your AICredit project API key in .env
npm start                # open http://localhost:3000
```

Create an account in the app. You start with 100 free credits. Purchases run in **demo mode** (credits are added without a charge) until you add a Stripe key.

### Getting an AICredit API key

In the AICredit dashboard, open **Projects**, create a project with **All models** enabled, then create an API key in that project. Generation endpoints need a project key; the `sk_` account key will not work. A project's model selection limits its keys.

## How credits work

- 1 credit = $0.001 of retail usage (`CREDIT_USD`), so $1 = 1,000 credits. Until 2026-11-19 a credit was $0.01; an older database is converted once when the app starts (`server/creditscale.js`), and the file from before is kept as `data/db.json.before-credits-x10`.
- For each request the gateway returns the real cost in USD (`charge_amount`, already including AICredit's discount). The user is charged that cost plus `MARGIN_PCT` percent (default 5), divided by `CREDIT_USD`. If the price with the margin would be higher than the model's official price (an AICredit discount under about 4.8%), the user is charged the AICredit price with no margin. `AICREDIT_MASTER_DISCOUNT_PCT` is the extra account discount AICredit gives Scenly; it only affects the cost and margin shown in the admin console (System, Model pricing).
- Chat replies are capped so one answer can never cost more than the user's balance.
- Video credits are reserved when a job starts and settled to the real cost when it finishes. Failed jobs are refunded. Failed requests are never charged.

| Plan | Price | Credits |
|---|---|---|
| Free | $0 | 1,000 on sign-up |
| Pro | $20 / month | 20,000 |
| Max | $100 / month | 100,000 |
| Ultra | $200 / month | 200,000 |
| Packs | $10 / $25 / $50 | 10,000 / 25,000 / 50,000 |

Every offer sells credits at face value ($1 = 1,000 credits). There are no bonus credits: with a 5% margin they would be sold below cost. Edit plans in `server/credits.js`.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `AICREDIT_API_KEY` | | Project API key from aicreditapi.com (required) |
| `AICREDIT_BASE_URL` | `https://aicreditapi.com/api/v1` | Gateway URL |
| `PORT` | `3000` | Web server port |
| `CREDIT_USD` | `0.001` | Retail value of one credit |
| `MARGIN_PCT` | `5` | Percent added to the AICredit price (not added when it would pass the official price) |
| `AICREDIT_MASTER_DISCOUNT_PCT` | `0` | Extra account discount from AICredit; used for cost and margin in the admin console |
| `SIGNUP_BONUS_CREDITS` | `1000` | Free credits for new accounts |
| `STRIPE_SECRET_KEY` | | Turns on real Stripe Checkout payments |
| `STRIPE_WEBHOOK_SECRET` | | Optional. Stripe webhook signing secret for `<PUBLIC_URL>/api/stripe/webhook` |
| `FEATURE_SUBSCRIPTIONS` | off | Monthly plans as Stripe subscriptions (see Subscriptions below) |
| `PUBLIC_URL` | `http://localhost:3000` | Stripe return links; when it is a public https address, uploaded reference videos get signed links so video-to-video works with uploads (locally, paste a public video link instead) |
| `ADMIN_EMAILS` | | Comma-separated emails that see the Admin page |
| `ENHANCE_MODEL` | `deepseek-v4-flash` | Chat model used by the Prompt Enhancer |

## Project layout

```
server/
  index.js        routes: auth, chat (SSE), studio generations, apps, files, billing, admin
  generate.js     image and video generation, video task polling, prompt enhancer
  projects.js     Projects (shared context for chats) and Characters (reference lock for images and video)
  export.js       Word (.docx) export, project .zip, and the Code file-block parser
  docs/           Docs Studio: pipeline.js (model call, checks, retry), store.js (documents and versions in data/docs),
                  brand.js (brand kits), clone.js (format cloning), routes.js (API), kinds/ (one module per document type), slides/ (slide
                  text, layout engine, .pptx builder, deck import)
  apps.js         the AI Apps catalog (prompt templates, inputs, models)
  catalog.js      model list, limits and credit pricing from the gateway's /models
  credits.js      plans, packs, ledger
  gateway.js      AICredit API client (key stays on the server)
  files.js        uploads and text extraction (PDF, DOCX, code…)
  payments.js     Stripe Checkout or demo mode (credit packs)
  billing.js      Subscriptions: plans, upgrade/downgrade, cancel, Stripe billing page, webhook, sync
  db.js           JSON file storage in ./data
public/           the web app (no build step)
```

## Production (Stage 1: one server)

- **Domain and brand.** The app is Scenly, at `https://scenly.ai`. On the server set `PUBLIC_URL=https://scenly.ai`, `MAIL_FROM=Scenly <no-reply@scenly.ai>` (verify scenly.ai with your mail service: SPF, DKIM and DMARC records), `SUPPORT_EMAIL` (for example `support@scenly.ai`), add `https://scenly.ai/api/auth/google/callback` to the Google OAuth client and `https://scenly.ai/api/stripe/webhook` to Stripe. In Cloudflare, point `scenly.ai` (and `www`, redirected to the bare domain) at the server with the proxy on and SSL set to Full (strict). The logo is `public/logo.svg`, with PNG copies (`favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) for browsers, phones and emails.
- **Kept from the old name (Polymind) on purpose:** the Docker volume `polymind-data`, the Stripe price lookup keys `polymind_<plan>_<cents>_month`, the fallback link-signing secret, the `pm-` browser storage keys and the folder name. Renaming them would detach existing data, prices, links or saved preferences.

- **Run it with Docker.** `Dockerfile` installs Node 22, ffmpeg and Chromium. Mount a volume at `/app/data` (database, files, temp work). `docker-compose.yml` does this for a plain Docker host; on Coolify use the Dockerfile build pack and add a persistent volume at `/app/data`.
- **Files on Cloudflare R2.** Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. The local disk stays the working copy (ffmpeg, PDF and image tools need it); every file is also copied to R2, and downloads, images and videos are handed out with short-lived R2 links, so big files do not travel through the server. A sweep every 10 minutes copies anything missed. Code: `server/objectstore.js` (S3 signing without an SDK), the bucket section of `server/storage.js`.
- **Database backups.** Hourly to R2 (24 rolling hourly copies, daily copies kept 30 days, `latest.json.gz`); without a bucket, daily to `data/backups`. `server/backup.js`.
- **Restore or move to a new server:** run `npm run restore` (on Coolify: the app's Terminal), then restart the app. Forms: `npm run restore` (latest), `npm run restore -- 2026-11-20` (a day), or `npm run restore -- --files-only`.
- **Move a local install to the server:** stop the app, add the R2 settings to `.env`, run `npm run push` (copies every file and the database), remove those settings again, then `npm run restore` on the server and restart it.
- **Health:** `GET /healthz` (public, for Coolify and uptime monitors) and `GET /api/admin/health` (admins: disk, bucket copies, backups, jobs).
- **Security basics:** security headers, cross-site request check, sign-in/sign-up attempt limits, `trust proxy`, expired sign-ins removed daily, clean shutdown that saves the database on deploys. At start in production, missing settings are listed in the log.
- **Database:** still the JSON file (`data/db.json`), fine for one server. Before Stage 2 (several web servers behind a load balancer) it must move to Postgres, sign-in limits and the job queue to Redis, and video exports to a separate worker.
- Stripe: before going live, switch to live keys and add the webhook (see Subscriptions).
- **Load test (2026-11-19, 4 CPUs/8 GB like a Hetzner CPX32, AI answers 6 s):** with saves every 5 s (`DB_SAVE_MS`, default in Docker) 5,000 people at once ran with no errors; 10,000 gave 8 to 16% errors. The file database cannot grow past about 512 MB; `/healthz` turns red if saving fails and the admin health page shows its size. Tools in `devtools/load/`.
- Tests: `devtools/t-bucket.mjs` (bucket copy, bucket downloads, backup, restore, limits; needs an S3 test server such as `moto_server -p 5055`).

## AI Apps in Recents and Assets

Each AI App you run gets one entry in Recents, named after the app. Opening it shows the app with every past run. A run belongs to the app and not to the pop-up, so closing the pop-up (or clicking outside it) leaves it working: the pop-up says so while it works, Recents shows a spinner, and a dot plus a short message appear when the result is ready. Assets has a second row of filters under All, Images and Videos, one for each place things were made (Image and Video pages, chats, and each app you used). The "New" button in an app that takes a product or a logo opens "New product" or "New brand logo" and only offers those types. Tests: `devtools/uiapps.mjs` and `devtools/uiapps2.mjs`.

## AI Apps revision (24 apps)

Six apps were retired because they duplicated another tool or could not be relied on: Age & Style Changer, Group Photo Fix, Pet Screen Escape, Storyboard Shot (the Video page does this), Video Restyle (needs a public video link) and Character Video (Bring Photo to Life and the Video page cover it). What they made stays in Assets.

- The gateway only makes square (1024x1024) and portrait (1024x1536) pictures. Apps that edit a photo now ask for the shape closest to that photo ("Match my photo"), where before every edit came back square. Enhance & Upscale is now Photo Restore, since no real upscaling is available.
- Every app has output options taken from what the chosen model accepts: Shape and How many for pictures; Shape, Length and Quality for videos. The price on the button follows them.
- A photo dropped into an app is used for that run only. Saved characters, products and logos sit in their own labelled box, because they are shared by every app.
- `devtools/mockgw.mjs` is a stand-in gateway for tests that must not spend money; `devtools/uiapps3.mjs` runs against it.

## Sign-in, Design Library and image editor (November 2026)

**Sign-in**
- *Continue with Google* appears on the sign-in and sign-up screens. It works once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are in `.env` (steps are in `.env.example`). Without them the button explains what is missing locally and is hidden in production.
- With an email service set (`SMTP_HOST` and friends), a new email account must open the confirmation link before it can sign in. The sign-up tab continues by itself once the link is opened. Without an email service accounts work at once, as before.
- *Forgot password?* emails a link that works once, for one hour. *Account & password* in the user menu changes the password, or adds one to a Google account.

**Image page**
- Sizes, quality and batch come from the gateway's model list. Today every image model offers 1024 × 1024 and 1024 × 1536 only, quality (low, medium, high) exists only on GPT Image, and batches of 1 to 4 are sent as separate requests so they work on every model.
- *Style* opens the Design Library: 36 looks in four groups. One click adds the look to the prompt. Photo Transform looks work on an uploaded photo with no typed prompt. Free accounts get `STYLE_FREE_PER_CATEGORY` looks per group (default 2); any paid plan or credit pack unlocks all of them. Add a picture at `public/styles/<style id>.jpg` and it replaces the drawn tile.
- The sparkle button rewrites the prompt as a few short points. When a photo is attached it is read by a vision model first. Press it again to undo.

**Image editor** (click any image)
- Describe a change, Remove background, Upscale to 4K, Resize, Add text, Translate, Mockup, Restyle, Animate. Every result is a new version in the strip under the picture and in the same session.
- Remove background, Upscale and Resize run on this server (`server/edit.js`) because the gateway has no such endpoints. Plain backgrounds are cut out for free; busy ones use one AI edit to put the subject on white, then the white is made see-through. Upscale is a sharpened enlargement to 4096 pixels on the long side, not AI detail. Resize keeps the whole picture and fills spare room with a blur of it.

**Lists**
- Projects and Assets have a grid / list switch, remembered per device. Assets has a back-to-top button. Reuse or edit from Assets continues in the session or chat the picture came from, which moves to the top of Recents.


## Subscriptions (FEATURE_SUBSCRIPTIONS=1)

- New accounts start on the **free trial**: the welcome credits, no card.
- Plans (Pro, Max, Ultra) are monthly Stripe subscriptions. Each paid invoice adds that plan's credits once; unused credits roll over.
- When an action fails for lack of credits, the app shows an upgrade prompt with the plans (or packs and bigger plans for paying accounts).
- Billing page: current plan with status and renewal date, Upgrade (charges the rest of this month's difference now and adds the matching share of extra credits), Switch to a smaller plan (from the next renewal, no refund), Cancel plan / Keep my plan, Manage billing (Stripe's page for card, invoices, address).
- Credit packs stay one-time purchases for every account.
- Prices are created in Stripe on first use (lookup key `polymind_<plan>_<cents>_month`); set `STRIPE_PRICE_PRO` etc. to use your own.
- Stripe is the record of truth. The app reads it back after checkout, from the webhook when set, when the billing page opens, and every 30 minutes for plans that are due. Grants are keyed by invoice id, so nothing is added twice.
- With no Stripe key the same flow runs in demo mode (no card).
- Local webhook (optional): install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, then put the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.


## Admin console (`#/admin`, admins only)

Open **Admin** in the sidebar (only accounts listed in `ADMIN_EMAILS` see it; every `/api/admin/*` route checks the same list on the server). Code: `server/admin.js` (routes and sums), `server/monitor.js` (request tracking and the gateway log), `public/admin.js` and `public/admin.css` (the amber "operations desk" look, so it is never mistaken for the app). Tests: `test/admin.test.mjs`.

- **Overview:** users, paying people and MRR, revenue, credits used, API cost and margin, active people, credits owed, gateway calls in the last 24 h; charts per day for credits by area, revenue, sign-ups and active people; people by status, usage by area, top models, plans, biggest spenders. 7 / 30 / 90 / 365 days.
- **Users:** search, filter by status (free, upgraded, downgraded, cancelling, cancelled, paused, payment failed, banned) and plan, sort; sign-up, first upgrade, last active, credits used (30 days, all time), credits left, paid. CSV export.
- **One person:** plan and Stripe state, plan history, payments, usage by area and by model, credit history, their failures, admin actions on the account. Actions: pause / resume, cancel at period end / undo, cancel now, change plan, start or restart a plan (charges their saved card in Stripe; demo mode without a key), sync billing, add or remove promo credits, ban / unban (signs them out everywhere; admins cannot be banned), sign out everywhere, mark email confirmed, private admin note.
- **Usage:** credits spent after refunds per area (Chat, Code, Docs, Image, Video, Video Agent, Video Builder, Studio Pro, AI Apps, Prompt enhance) per person and per model. Each charge now records the page that spent it (`via` on the ledger row); older rows are sorted by their description.
- **Errors & speed:** every AICredit gateway call is logged (model, endpoint, status, time to answer; last 4,000 calls) and every failure keeps its real reason (last 2,000): model failures, response/stream failures, API/gateway errors (quota, key, 5xx, network), failed video tasks, failed background jobs and server errors. Per model and endpoint: calls, fail rate, average, p50 and p95. Most common reasons, search and filters. People still only see the calm wording from `gateway.js`.
- **Admin activity:** every change made from the console, who made it and before → after.
- **System:** feature switches, Stripe mode and webhook, pricing, email, Google sign-in, gateway key, health (database size, disk, memory, ffmpeg, jobs).

Data added to `data/db.json`: `monitor.calls`, `monitor.failures`, `adminAudit`, and on users `planHistory`, `banned*`, `adminNote`, `lastSeenAt`, `sub.paused`. Banned accounts get `code: "banned"` from every signed-in route. Pausing uses Stripe's `pause_collection` (no invoices, no monthly credits while paused).

## Studio Pro (FEATURE_STUDIO_PRO=1)

A second image and video studio at `#/pro`, added beside the existing pages. Image, Video Studio, Video Agent and Video Builder are unchanged, so the two can be compared. Everything it makes goes through the same generation, credit and asset code, so results appear in Assets and Recents.

- **Home**: one prompt box, the four tools and 26 starting templates in six groups (Ads, UGC, Short drama, Social, Branding, Explainers).
- **Agent**: one line in, a finished piece out. It writes a production plan (about 6 seconds, under 1 credit), shows the shots and the price, and after approval makes it: a set of pictures, one video take filmed from an opening frame, or a film of several shots that is generated and cut together through the Video Builder. It also writes the post copy (hook, caption, call to action, hashtags). **Autopilot** skips the approvals. **Draft / Standard / High** sets the video model and resolution. It asks a question only when the brief leaves a choice that changes everything. Sessions are saved and reopen where they were.
- **Video**: a settings panel with modes (Generate, Frame to Video, Camera Control, Edit Video, Style Transfer), every video model, duration, shape, resolution, 10 camera bodies, 10 lenses and 14 camera moves. Camera and lens are added to the prompt as words, so they work with every model.
- **Image**: Generate, Edit, Product Shoot and Style Transfer with every image model.
- **Ad Studio**: paste a website and it is opened in a headless browser (`server/pro-site.js`), so JavaScript sites read fully, and up to three key pages (pricing, products, features, about) are followed. It becomes an editable brand kit (name, tagline, colours taken from the site's buttons and headings, look, tone, audience, selling points, products with prices) plus the site's logo and up to seven product pictures, each matched to its product. Pick a placement (feed 1:1, stories 9:16, or video ad) and products, and it writes the ad ideas and generates the pictures with the headline in them; a product that has a photo is shown as it really looks, and the logo is placed in the ad. "Read the site again" rebuilds the kit. Each ad has a "Video version" button that hands it to the Agent. The reader loads no video or fonts, refuses any request into the local network, clicks nothing, and falls back to a plain download if the browser cannot start. Sites that block automated visitors cannot be read.
- **Ad Studio is a main sidebar item** at `#/ads`, under Studio Pro. When generating, an **ad template** can be picked: Bold hook, Before / After, Us vs Them, POV moment, UGC testimonial, Unboxing, 3 reasons why, Behind the scenes, Problem solved, Product showcase, Offer / Sale, or "Mix it up". Templates are in `AD_TEMPLATES` in `server/pro-data.js`; each has one instruction for picture ads and one for video ads.
- **Enhancer**: AI detail (the picture is redrawn with finer texture), upscale to 4K, or both, with a before/after slider. Pictures only: the gateway has no video upscaler.

What the gateway decides (checked 2026-11-19):
- **A start picture for a video must be a public web link ending in an image extension.** A picture sent inline is refused with a 400. `pictureLink()` in `server/generate.js` finds a link in this order: the file bucket (R2), this server's public address (`/pp/<file>/<signature>.<ext>`, needs a public https `PUBLIC_URL`), or the image provider's own link. The agent makes its frames with a model that returns a link (`/api/pro/frame`), so picture-to-video works on localhost for a few hours after the picture is made. A person's own upload can only start a video once the app has a bucket or a public address.
- **The API key's project decides which video models can be called**, and the gateway only says so on a real request. `/api/pro/clip` skips a refused model and remembers it for a day. A model whose take the provider fails (credits are returned) is reported by the agent and the next model films it.
- No lip-sync, motion transfer, start-and-end frame, video upscale or live streaming generation exists on the gateway, so those Krea modes are not offered.

Code: `server/pro.js` (routes), `server/pro-data.js` (templates, cameras, lenses, moves), `public/pro.js`, `public/pro.css`. Outside those files the change is one line each in `server/flags.js`, the sidebar, the router and the export list of `public/app.js`, the mount in `server/index.js`, and in `server/generate.js` the picture link for video starts and reading the gateway's `fail_reason`.

## Expand editor (large pop-up for text boxes)

`public/expand.js` + `public/expand.css`, installed once from `app.js` (`installExpandEditors()`). Every `<textarea>` in the app gets a small expand button while it is hovered or focused (or press ⌘/Ctrl + Shift + E). It opens the text in a large pop-up editor with a character count; Save (⌘/Ctrl + Enter) writes it back and fires a normal `input` event so each page's own handler stores it, Cancel (Esc) leaves it untouched. Opt a box out with `data-no-expand`, set the pop-up title with `data-expand-title`, or call `openExpandEditor({ value, title, maxLength, onSave })` directly. The code editor (`.cx-edit`) is excluded. Check: `node devtools/expand-shots.mjs <outdir> <builderProjectId>`.

## Resizable panels and movable pop-ups

`public/resize.js` + `public/resize.css`, installed once from `app.js` (`installResizers()`). Drag the divider between panels to resize them; double-click it to go back to the default. Sizes are remembered per area in localStorage (`pm-size-<area>`). Areas (desktop widths only): sidebar, chat list, chat ↔ preview panel, Code list and workspace, Video Builder scene list and scene panel, Studio Pro Agent split, Image/Video tool settings, Enhancer panel. Add an area by adding an entry to `AREAS` and a matching grid rule in resize.css. Every dialog (`.modal-bg .modal`) and the expand editor can be moved by its header and resized from the bottom-right corner; the expand editor remembers its size. Check: `node devtools/resize-shots.mjs <outdir> <builderProjectId>`.
Side panels (Video Builder scene panel, Studio Pro Image/Video/Enhancer settings) also get an expand button in their top-right corner: it shows the whole panel large and centred over a dimmed page (Esc, the button again, or a click outside returns it). Add one via `PANELS` in resize.js. Check: `node devtools/panel-shots.mjs <outdir> <builderProjectId>`.

## Help centre (`#/help`)

A searchable user manual inside the app. Code: `public/help.js` (pages, search), `public/help-content.js` (every article, static HTML in plain language), `public/help.css` (linked in index.html, so the top-bar button is styled everywhere). 25 articles in six groups: Getting started, Credits and plans, Create, Pro studios, Workspace and tools, Troubleshooting and FAQ.

- Addresses: `#/help`, `#/help/<article>`, `#/help/<article>/<section>` (a section is an `<h2 id>` in the article). Works signed in (inside the app) and signed out (with the landing page's header and footer; "Open …" buttons become "Create a free account").
- Reached from: Help in the sidebar (so also the phone Menu), Help in the account menu, the **?** button in the top bar of every page (opens that page's article; the map is `HELP_FOR` / `HELP_PRO` in `public/app.js`), "How Docs Studio works" in the chat Create menu, and "Help centre" in the landing page footer.
- Search runs in the browser over titles, summaries, keywords and article text, shows snippets with the words marked, and jumps to the matching section.
- When a feature changes, update its article in `help-content.js`. Describe only what the app really does. Check: `node devtools/help-shots.mjs <outDir>` (screenshots desktop, phone, light mode and signed out, checks every help link and every page's ? button).
