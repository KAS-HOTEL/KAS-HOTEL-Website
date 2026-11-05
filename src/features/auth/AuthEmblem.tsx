/**
 * The glyph a recovery screen leads with, inside {@code AuthShell}'s medallion.
 *
 * <h2>Drawn here and not added to the shared icon set</h2>
 *
 * Nothing outside these three screens uses an envelope-with-arrow, a
 * shield-with-check or a padlock at this size, and the shared set is a
 * vocabulary the whole product reads from — adding one-offs to it makes it
 * harder to find the icons that are genuinely shared.
 *
 * <p>Sized at 30px to sit in a 72px medallion. Stroked rather than filled, so it
 * stays legible against the soft accent disc at any zoom.
 */
export function AuthEmblem({ icon }: { readonly icon: 'mail' | 'shield' | 'lock' }) {
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  if (icon === 'mail') {
    return (
      <svg {...common}>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="m3 7 8.2 5.6a1.4 1.4 0 0 0 1.6 0L21 7" />
      </svg>
    );
  }

  if (icon === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 2.8 20 6v6c0 4.4-3.2 7.8-8 9.2C7.2 19.8 4 16.4 4 12V6Z" />
        <path d="m8.8 12 2.2 2.2 4.2-4.4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <path d="M12 14.4v2.2" />
    </svg>
  );
}
