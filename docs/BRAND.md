# Tradentra Brand

**Tradentra**

The Complete Business Management Platform

- [Full logo with wordmark and tagline](../public/branding/tradentra-lockup.svg) — use on light backgrounds in product materials and handoffs.
- [Standalone mark](../public/branding/tradentra-mark.svg) — use when space is limited, such as favicons and app headers.

The mark uses a geometric T with a mint accent to suggest movement. Brand colors
are ink navy (`#10243A`), mint (`#35D6B2`), and off-white (`#F8FAFC`).
The app uses its existing Instrument Sans typography for the wordmark and tagline.

Light mode uses off-white surfaces, navy actions, and mint-tinted selections.
Dark mode uses deep navy surfaces with mint actions. Shared colors live in
`resources/css/app.css`; use those tokens for new screens. Appearance changes
apply to the workspace and its open tabs without reloading them. Charts use deep blue
for sales and teal for profit (dashed on trend charts). Keep red for negatives
and errors, amber for warnings, and green for success. PDF accents use the
print-friendly light palette and retain the configured customer letterhead.

Product display copy comes from `config/branding.php`. Keep existing production
`APP_NAME` values unchanged: Laravel uses them for default cookie names and
cache prefixes. Rebranding does not change the database, host, license keys,
Artisan commands, or customer PDF letterheads.
