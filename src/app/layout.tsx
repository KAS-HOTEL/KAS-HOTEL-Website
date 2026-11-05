import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/ui/globals.css';

/**
 * The two faces `tokens.css` has always named.
 *
 * Doc 76 §4 specifies Be Vietnam Pro for text and Source Serif 4 for display,
 * and `--font-text` / `--font-display` have named them since the tokens were
 * written — but nothing ever loaded them, so every surface in the product has
 * been rendering in a system fallback. On Vietnamese that is not merely
 * off-brand: Georgia and Times render the stacked marks in `ố` and `ề` as
 * detached glyphs, so the headline of a Vietnamese-first product came apart.
 *
 * The `vietnamese` subset is requested explicitly. It is the reason for
 * choosing these faces and it is not in either family's default subset.
 *
 * `display: 'swap'` so text is readable while the face loads, and `variable` so
 * the families arrive as CSS custom properties that the tokens can point at
 * rather than being hard-coded into a `body` rule.
 */
export const metadata: Metadata = {
  title: 'KAS',
  description: 'KAS Hotel Platform',
};

/**
 * The single application root.
 *
 * Doc 12 §170 puts the consoles and the customer site in one Next.js
 * application; the three route groups below differ in layout and density, not
 * in deployment.
 *
 * `lang` is set per route group — the customer tree is locale-prefixed
 * (doc 22 §3), the consoles run in one language in V1 (doc 22 §8, OQ-057).
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
