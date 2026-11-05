// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicExperience } from '@/lib/domain/availability';
import { HotelExperiences, experienceCopy } from './HotelExperiences';

/**
 * The guest half of Step 16A.47 — doc 67 §1's section 5.
 *
 * The section is text-only by owner decision, so these check that it reads well
 * as typography rather than that a picture arrived.
 */

const EN = experienceCopy('en');
const VI = experienceCopy('vi');

function experience(overrides: Partial<PublicExperience> = {}): PublicExperience {
  return {
    title: 'Rooftop at dusk',
    description: 'The hour the city turns gold.',
    ...overrides,
  };
}

afterEach(cleanup);

describe('HotelExperiences', () => {
  it('renders the hotel\'s experiences under a named heading', () => {
    render(<HotelExperiences experiences={[experience()]} copy={EN} />);

    expect(screen.getByRole('heading', { name: 'Signature experiences' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rooftop at dusk' })).toBeTruthy();
    expect(screen.getByText('The hour the city turns gold.')).toBeTruthy();
  });

  it('keeps the operator\'s order', () => {
    render(
      <HotelExperiences
        experiences={[
          experience({ title: 'Rooftop at dusk' }),
          experience({ title: 'Breakfast on the terrace' }),
        ]}
        copy={EN}
      />,
    );

    // The backend orders by sort_order and nothing re-sorts here — doc 67 §1
    // calls these "named, unique to this property", not a ranked list.
    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(items[0]).toContain('Rooftop at dusk');
    expect(items[1]).toContain('Breakfast on the terrace');
  });

  it('renders a title with no description', () => {
    render(<HotelExperiences experiences={[experience({ description: null })]} copy={EN} />);

    // The column is nullable and doc 23 §5 makes the description optional. A
    // title alone is a real thing to publish.
    expect(screen.getByRole('heading', { name: 'Rooftop at dusk' })).toBeTruthy();
    expect(screen.queryByText(/turns gold/)).toBeNull();
  });

  it('treats a whitespace-only description as absent', () => {
    render(<HotelExperiences experiences={[experience({ description: '   ' })]} copy={EN} />);

    const item = screen.getByRole('listitem');
    expect(item.querySelectorAll('p').length).toBe(0);
  });

  it('renders nothing at all when the hotel has none', () => {
    const { container } = render(<HotelExperiences experiences={[]} copy={EN} />);

    // The section disappears rather than announcing an absence — like the
    // facilities and landmarks, and unlike the policies, which a guest must be
    // shown before agreeing to terms.
    expect(container.innerHTML).toBe('');
  });

  it('speaks the reader\'s language', () => {
    render(
      <HotelExperiences
        experiences={[experience({ title: 'Sân thượng lúc hoàng hôn', description: null })]}
        copy={VI}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Trải nghiệm đặc trưng' })).toBeTruthy();
    expect(screen.getByText('Những điều chỉ có ở khách sạn này.')).toBeTruthy();
    // The console is Vietnamese-only; the guest surface is both, so the copy
    // must actually be Vietnamese rather than English left in place.
    expect(/[ăâđêôơưÀ-ỹ]/.test(VI.heading + VI.intro)).toBe(true);
  });

  it('carries no image and no time-of-day badge', () => {
    const { container } = render(<HotelExperiences experiences={[experience()]} copy={EN} />);

    // Step 16A.47 made V1 text-only: media_owner_type has no EXPERIENCE member
    // and timeOfDay has no vocabulary in any document. A placeholder box would
    // look like a broken image rather than a decision.
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.querySelectorAll('picture, figure, svg').length).toBe(0);

    // Structure, not text: a card is exactly a heading plus at most one
    // paragraph. Matching on words like "dusk" would fail on "Rooftop at dusk",
    // which is the Partner's own title rather than a rendered badge.
    const card = screen.getByRole('listitem');
    expect(card.querySelectorAll('h3').length).toBe(1);
    expect(card.querySelectorAll('p').length).toBe(1);
    expect(card.children.length).toBe(2);
  });

  it('gives each locale its own heading text', () => {
    expect(experienceCopy('vi').heading).toBe('Trải nghiệm đặc trưng');
    expect(experienceCopy('en').heading).toBe('Signature experiences');
    // Anything that is not 'vi' reads English, matching the other guest copy.
    expect(experienceCopy('fr').heading).toBe('Signature experiences');
  });
});
