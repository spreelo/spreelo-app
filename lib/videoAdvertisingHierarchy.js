const words = value => String(value || '').normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/u).filter(Boolean);

// Product names and campaign wording are data; no product-category templates.
export function repeatsAdvertisingMessage(first, second) {
  const a = words(first), b = words(second);
  if (!a.length || !b.length) return false;
  const contains = (whole, part) => (` ${whole.join(' ')} `).includes(` ${part.join(' ')} `);
  return contains(a, b) || contains(b, a);
}

export function distinctProductEyebrow(productLabel, headline, closingLine = '') {
  const label = String(productLabel || '').replace(/\s+/gu, ' ').trim();
  if (!label || Array.from(label).length > 34 ||
      repeatsAdvertisingMessage(label, headline) || repeatsAdvertisingMessage(label, closingLine)) return '';
  return label;
}

export function isProductLabelHeadline(headline, productLabel) {
  const hook=words(headline), product=words(productLabel);
  if(!product.length || !hook.length) return false;
  if(hook.join(' ')===product.join(' ')) return true;
  // A generic one-word product type inside a real hook is not a catalogue label.
  return product.length>=2 && hook.length<=product.length+2 &&
    (` ${hook.join(' ')} `).includes(` ${product.join(' ')} `);
}

export const COMMERCIAL_COPY_HIERARCHY = `Write one short, complete advertising idea that adds meaning beyond the product name. The main hook should normally be 2–5 words, comfortably read as at most two lines on a phone. Never append a product-category word to the product title and call that the advertising hook. Use only verified claims; when a benefit is not established, write a specific, relevant invitation without inventing a factual benefit. Product naming is optional supporting identification, never a second copy of the hook. A supporting line is optional and visibly subordinate. The final invitation must be shorter and quieter than the headline, normally one line and never a second equally dominant slogan. Avoid repeating the same words in multiple roles. Prefer fewer complete words and more space. Do not shorten words or cut off a sentence to meet these goals. Choose the color relationship from the real product, scene and brand; no automatic cyan, arbitrary last-line gradients or repeated visual style across different businesses.`;
