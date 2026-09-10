import fs from 'node:fs';

const component = fs.readFileSync('components/HomeReferenceOverview.jsx', 'utf8');
const css = fs.readFileSync('app/styles/89-v144-93-home-mobile-reference.css', 'utf8');
const globals = fs.readFileSync('app/globals.css', 'utf8');

function expect(value, message) {
  if (!value) throw new Error(message);
}

expect(globals.includes('@import "./styles/89-v144-93-home-mobile-reference.css";'), 'v144.93 stylesheet must be imported last');
expect(component.includes('home-reference-review-primary-arrow'), 'approval CTA must expose a mobile-only arrow hook');
expect(component.includes('home-reference-plans-show-all'), 'Content plans must expose a mobile-only Visa alla hook');
expect(component.includes('href="/automation">{t("homeReference.showAll")}</a>'), 'Show-all action must keep navigation inside existing automation workspace');
expect(css.includes('@media (max-width:600px)'), 'new Home treatment must stay phone-scoped');
expect(css.includes('html body .home-reference-review-primary-arrow,\nhtml body .home-reference-plans-show-all {\n  display:none;'), 'new mobile-only UI must be hidden by default on desktop/tablet');
expect(css.includes('html body .home-reference-plans article > strong {\n    display:none !important;'), 'phone rows must omit the bulky status column from the supplied reference');
expect(css.includes('html body .home-reference-plans article::before {\n    display:none !important;'), 'phone rows must remove old corner accents');
expect(css.includes('grid-template-columns:32px minmax(0,1fr) auto !important;'), 'phone Content plans rows must use compact icon/copy/action columns');
expect(!css.includes('home-reference-stats'), 'v144.93 must not restyle Home stats');
expect(!css.includes('home-reference-coach'), 'v144.93 must not restyle the Home coach section');
expect(!css.includes('home-reference-focus'), 'v144.93 must not restyle focus section');

console.log('v144.93 Home mobile reference regression checks passed.');
