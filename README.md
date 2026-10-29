# Novella — Free Book Discovery & Reader

A responsive book website built with plain HTML, CSS and JavaScript. No build tools or paid hosting required.

## What's included
- Professional mobile-friendly lavender / blue UI
- Google Books catalog (search by author, title, topic), book descriptions, covers, metadata and previews
- Project Gutenberg discovery, legitimate free EPUB / plain-text downloads, in-browser plain-text reader with adjustable themes and font size
- Amazon India book shopping search links (or official Google Books purchase links where available)
- Related-book recommendations by topic/author
- Email/password signup, sign-in, email confirmation, forgot-password and user sessions through Supabase
- Private multi-user shelves and reading history, publicly visible reviews with authenticated writing and deletion
- Guest browsing, even before setting up your own database

## 1. Start locally
Open `index.html` in a browser to preview, or use VS Code Live Server. Catalog fetches require internet access. For authentication and email flows, use a hosted HTTPS site rather than a file:// URL.

## 2. Create free Supabase backend
1. Create a free project at https://supabase.com/ .
2. Open **SQL Editor**, paste all of `schema.sql`, then **Run**.
3. Open **Project Settings → API** (sometimes named **API Keys**). Copy the **Project URL** and the **publishable/anon key**.
4. Edit `config.js` to set `supabaseUrl` and `supabaseAnonKey`.
5. Under **Authentication → Providers → Email**, enable email/password signup and **Confirm email**. Do not turn confirmation off to simplify setup.
6. In **Authentication → URL Configuration**, set your published website URL as **Site URL**. Add your URL as an allowed **Redirect URL** (e.g. `https://YOURNAME.github.io/novella/`). Add local development URLs only when necessary.
7. Optional: Under **Authentication → Security and Protection**, configure CAPTCHA and account protection to reduce abusive signups.
8. Test: register a fresh email, click its verification email, sign in, save a book, open history and publish a review. Use two different accounts to verify privacy.

**Email limitation:** The default Supabase email provider has strict limits and may only deliver to addresses approved by your project. For genuine public signups, configure a custom SMTP provider (for example a free-tier provider subject to its current limits). New Supabase free projects cannot customize their default auth email templates; customized branded templates require custom SMTP or a paid tier. A custom email address at your own domain usually requires buying a domain. You can still use free hosted authentication email defaults.

**Security:** Supabase `anon`/publishable key is intended for browser use with Row Level Security. NEVER expose the service_role/secret key. Do not disable Row Level Security. Do not store passwords yourself.

## 3. Publish for free with GitHub Pages
1. Make a new **public repository** on GitHub, for example `novella`.
2. Upload `index.html`, `style.css`, `app.js`, `config.js`, `schema.sql`, `README.md` to the repository root, and commit.
3. Open the repo's **Settings → Pages**. For **Build and deployment**, use **Deploy from a branch**, branch `main`, folder `/ (root)`, then save.
4. GitHub will display a live public address such as `https://YOURNAME.github.io/novella/` once Pages deploys.
5. Return to Supabase and configure the *exact* URL in **Authentication → URL Configuration**.
6. Visit your live site, verify email signup and password reset from a second account/device.

GitHub Pages is a free option for a non-commercial project. It does not run a private backend; all privacy enforcement is provided by Supabase. GitHub Pages repositories are public on free personal accounts—never commit private secrets.

## 4. Important content and service notes
- **No website can legally promise free full-text/download for every copyrighted book.** Google Books listings may have metadata or limited previews only. Gutenberg books are offered where authorized. Copyright terms vary by country.
- Some Project Gutenberg text files may reject browser cross-origin fetching, in which case the Download option still provides an external link. The site offers an in-browser plain-text reader only where the source permits fetching.
- Amazon purchase links use book searches and may not resolve to the exact edition. Verify edition and seller before purchase.
- Google Books / Gutenberg service availability and quotas are external. Open Library is not used as a high-traffic backend.
- Third-party cover and book information may differ by edition or region.
- Free Supabase plans have capacity, mail and inactivity limits; free hosting is not unlimited or guaranteed permanent.
- Reader history records opened books, not searches typed into the search bar. Reviews are user-generated and are not actively moderated. Public production operation should add reporting, moderation, privacy/terms pages, cookie policies if needed, accessibility testing and monitoring.
- This is an MVP foundation and not an audited production-scale website. Add abuse controls (CAPTCHA, rate limiting, moderation, anti-spam, deletion workflows) before inviting a large public audience.

## 5. Customize
- Change the site name, footer, headline and text in `index.html` and `app.js`.
- Change colors in the top `:root` CSS variables in `style.css`.
- To choose another Amazon storefront, update `amazon` URL in `openBook()` in `app.js`.
- Use Supabase's dashboard to review user count and database usage. Configure a custom SMTP provider when moving from private testing to public registrations.

## Developer sanity checks
- `node --check app.js`
- `node --check config.js`
- Open in a browser, search a book title, inspect a details page, click download on a Gutenberg classic, and check signup with a real configured Supabase project.

## License
Original website code is provided for your project. Book covers, descriptions, book texts and API content remain subject to their respective source licenses and rights.
