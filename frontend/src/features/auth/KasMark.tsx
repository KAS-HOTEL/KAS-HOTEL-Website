/**
 * The KAS badge that opens every authentication screen.
 *
 * <h2>Drawn, not fetched</h2>
 *
 * There is no logo file in the repository and generating one is out of bounds,
 * so this is built from the brand's own tokens: a deep-green disc, a gold ring
 * inset from its edge, and a keystone form in the centre. It is geometry, not a
 * picture of a hotel, which is what lets it sit at 28px in a header and at 44px
 * on a sign-in page without ever looking like a placeholder.
 *
 * <p>`currentColor` is deliberately not used: the badge keeps its own palette so
 * it reads the same on the ivory bar and on the deep-green panel.
 */
export function KasMark({ size = 36 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="KAS"
      focusable="false"
    >
      <circle cx="20" cy="20" r="20" fill="var(--accent-700)" />
      <circle
        cx="20"
        cy="20"
        r="16.5"
        fill="none"
        stroke="var(--gold-500)"
        strokeWidth="1"
        opacity="0.85"
      />
      {/*
        A keystone: the wedge at the top of an arch, and the piece that holds the
        rest in place. Abstract enough to be a mark rather than an illustration.
      */}
      <path d="M20 10.5 L27 17 L24.5 29 L15.5 29 L13 17 Z" fill="var(--gold-500)" opacity="0.92" />
      <path d="M20 15 L23.2 18 L21.9 25 L18.1 25 L16.8 18 Z" fill="var(--accent-700)" />
    </svg>
  );
}
