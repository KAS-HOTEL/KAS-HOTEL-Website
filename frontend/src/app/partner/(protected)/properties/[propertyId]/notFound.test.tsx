// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PropertyNotFound from './not-found';

afterEach(cleanup);

/**
 * The not-found page is security-relevant, so it is tested like one.
 *
 * It is what a caller sees for a malformed id, for an id that names nothing,
 * and for an id that names **another partner's hotel**. Doc 85 §6.3 has the
 * backend answer 404 rather than 403 for that last case precisely so the
 * existence of another partner's records is never disclosed — and this page is
 * the last place that could give it away.
 */
describe('property not-found page', () => {
  it('gives the page a heading', () => {
    render(<PropertyNotFound />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('never reframes a hidden property as a permission problem', () => {
    const { container } = render(<PropertyNotFound />);
    const text = container.textContent ?? '';

    // Any of these would tell the caller that the property exists and belongs
    // to someone else, which is exactly what the 404 is protecting.
    expect(text).not.toMatch(/quyền|permission|forbidden|403/i);
    expect(text).not.toMatch(/đối tác khác|another partner|thuộc về/i);
  });

  it('offers a way back to the caller’s own properties', () => {
    render(<PropertyNotFound />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/partner/properties');
  });
});
