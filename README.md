# Northern External Cleaning Co — website

A plain HTML/CSS site. No build step, no framework. Edit a file, push, and GitHub Pages serves it.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Home page |
| `services.html` | Window, UPVC, gutter and jet-washing details |
| `commercial.html` | Page for facilities managers and industrial sites |
| `gallery.html` | Photo gallery with filter buttons |
| `contact.html` | Quote form and contact details |
| `privacy.html` | Short privacy notice (the quote form means you should have one) |
| `css/styles.css` | All styling. Colours and fonts are set at the top in `:root`. |
| `js/main.js` | Mobile menu, gallery filter, and the quote form |
| `img/` | Photos (resized to 1600px for the web), logo, favicon, share image |

The header, footer and mobile bar are repeated in every page, so a change to them (for example a new nav link) needs making in each HTML file. Search for the text and replace it in all files.

## Putting it live on GitHub Pages

1. Create a new repository on GitHub (public, for free Pages hosting), for example `northern-external-cleaning`.
2. Upload everything in this folder to the root of the repository, keeping the `css`, `js` and `img` folders as they are. The `.nojekyll` file must go up too.
3. In the repository go to **Settings → Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. After a minute the site is at `https://<your-username>.github.io/<repository-name>/`.
5. For a proper domain later: buy one, add it under **Settings → Pages → Custom domain**, and point the domain's DNS at GitHub Pages as that screen describes. Tick **Enforce HTTPS** once it has verified.

All links in the site are relative, so it works at a sub-path like `/northern-external-cleaning/` and at a custom domain without any changes.

## Quote form

The form on `contact.html` needs no server: on send it opens WhatsApp on the visitor's phone or computer with their answers typed in as a message to 07735 894261. The number is set once near the top of `js/main.js` (`WHATSAPP_NUMBER`).

To have the form email George instead:

1. Sign up at a form service such as Formspree (free tier is fine) and create a form pointing at his email address.
2. In `contact.html` add `action="https://formspree.io/f/YOUR_ID"` to the `<form>` tag. The JavaScript sees the action and lets the form submit normally.
3. Change the helper text under the button so it no longer mentions WhatsApp.

## Things still to fill in (as of October 2026)

- Email address: none shown on the site yet. Add it to the footer "Contact" column and `contact.html` when confirmed.
- Opening hours: not shown. Add to the top bar or the contact page aside.
- Service area: the site says "Halifax and across Calderdale". Add a list of towns once confirmed.
- Insurance: the commercial page says certificates are sent with the quote. Confirm George's public liability cover and insurer before relying on it, and consider adding "Fully insured" to the home page trust strip once confirmed.
- Reviews: no reviews section on the live site yet. When there are real Google or Facebook reviews, add a section to `index.html` (three cards with a star row, the quote, the customer's first name and area). Never invent any.
- Prices: none shown. If George wants "from £" prices, add a line under each service's button on `services.html`.
- Photos still needed: window cleaning with the water-fed pole, a UPVC fascia before/after, a driveway jet wash, and the van. Drop them in `img/`, then add `<figure>` blocks in `gallery.html` with the right `data-cat` (windows, upvc, jet) so the filter buttons pick them up.

## Editing tips

- Phone number appears as `07735 894261` (display), `tel:+447735894261` (links) and `447735894261` (WhatsApp links). Search for all three if it ever changes.
- To change the accent colour, edit `--accent` in `css/styles.css`.
- Keep new photos under about 300 KB each; resize to 1600px on the long edge before uploading.
