import type { SVGProps } from 'react';

/**
 * The KAS icon set — local inline SVG, no dependency.
 *
 * <h2>Why no icon library</h2>
 *
 * The repository had none, so this was a choice. Nine icons are needed across the
 * whole shell, and every candidate library ships hundreds behind a build-time
 * tree-shake that has to actually work. The project has held **0 npm
 * vulnerabilities** through Steps 2 and 3, and a dependency earns its place by
 * saving more than it costs. Nine paths do not.
 *
 * Doc 74 lists the icon set among the tokens shared by the customer and
 * management surfaces, so these are deliberately plain: single stroke, no fill,
 * `currentColor`, 1.5px weight. They inherit colour and size from type, which is
 * what makes one set work at both densities.
 *
 * Every icon is `aria-hidden` by default. An icon is decoration unless a caller
 * gives it a label — a button with only an icon must supply its own accessible
 * name, and doc 82 forbids conveying state by shape or colour alone.
 */

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** Square size in px. Defaults to 1em so icons scale with their text. */
  readonly size?: number | string;
  /** Supply only when the icon is the sole carrier of meaning. */
  readonly title?: string;
};

function Icon({ size = '1em', title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m20 6-11 11-5-5" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icon>
);

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18" />
  </Icon>
);

export const BuildingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M15 21V10h3a2 2 0 0 1 2 2v9M2 21h20" />
    <path d="M8 8h3M8 12h3M8 16h3" />
  </Icon>
);

/**
 * The password-visibility pair.
 *
 * Two icons rather than one that rotates: "shown" and "hidden" are different
 * states, and doc 82 forbids carrying state by shape alone — so the button that
 * uses them also changes its accessible name.
 */
export const EyeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.6 6.7A8.9 8.9 0 0 1 12 6.6c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8" />
    <path d="M6.4 8.3A17 17 0 0 0 2.5 13s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 3.7-.73" />
    <path d="M10 10.4a2.6 2.6 0 0 0 3.7 3.7" />
    <path d="m3.5 3.5 17 17" />
  </Icon>
);

/** Field affordances for the sign-in form. Decorative — the label carries meaning. */
export const MailIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.75" y="5" width="18.5" height="14" rx="2" />
    <path d="m3.5 7 8.5 5.8L20.5 7" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2" />
    <path d="M8 10.5V7.75a4 4 0 0 1 8 0v2.75" />
  </Icon>
);

/**
 * The partner sidebar's own three.
 *
 * Added when the navigation gained icons; the set stays local and grows only
 * when a surface needs a glyph it does not have, which is the trade the header
 * comment describes.
 */
export const LayoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Icon>
);

export const InboxIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 13h4l1.5 2.5h7L17 13h4" />
    <path d="M5.2 5h13.6a2 2 0 0 1 1.9 1.4L22 13v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4l1.3-6.6A2 2 0 0 1 5.2 5Z" />
  </Icon>
);

/**
 * Two people — the reservation workspace's glyph.
 *
 * A guest and a companion rather than a magnifying glass: the navigation item is
 * "Khách hàng / Đặt phòng", and searching is what the screen offers rather than
 * what it is.
 */
export const GuestsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 6.2" />
    <path d="M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
  </Icon>
);

/** A gauge — the occupancy card's glyph. */
export const GaugeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 18 4-5" />
  </Icon>
);

/** A star outline — the rating card's glyph. Never a filled rating itself. */
export const StarIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 4 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7L6.9 19.4l1-5.6-4-3.9 5.6-.8Z" />
  </Icon>
);

/** A price tag — the voucher item's glyph. */
export const TagIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-7.7 7.7a1.5 1.5 0 0 1-2.12 0l-7.3-7.3A1.5 1.5 0 0 1 3 12.2Z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
);
