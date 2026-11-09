// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicPolicy } from '@/lib/domain/availability';
import { HotelPolicies, policyCopy } from './HotelPolicies';

function policy(overrides: Partial<PublicPolicy> = {}): PublicPolicy {
  return {
    type: 'CANCELLATION',
    version: 3,
    summary: 'Huỷ miễn phí trước 48 giờ.',
    body: 'Huỷ trong vòng 48 giờ trước ngày nhận phòng sẽ bị tính một đêm đầu tiên.',
    ...overrides,
  };
}

afterEach(cleanup);

describe('the policies a guest is shown', () => {
  it('renders the hotel’s own words, unchanged', () => {
    render(<HotelPolicies policies={[policy()]} copy={policyCopy('vi')} />);

    // Doc 02 §4.2 makes policies factual fields where plain disclosure applies.
    // Nothing here shortens, reframes or summarises what the hotel wrote.
    expect(screen.getByText('Huỷ miễn phí trước 48 giờ.')).toBeTruthy();
    expect(screen.getByText(/bị tính một đêm đầu tiên/)).toBeTruthy();
  });

  it('shows the version, because a reservation pins the one accepted', () => {
    render(<HotelPolicies policies={[policy({ version: 7 })]} copy={policyCopy('en')} />);

    // Doc 58 §3.1: the endpoint "returns version for termsVersion".
    expect(screen.getByText(/Version\s*7/)).toBeTruthy();
  });

  it('labels each type in the reader’s locale', () => {
    render(<HotelPolicies policies={[policy()]} copy={policyCopy('en')} />);
    expect(screen.getByText(/Cancellation/)).toBeTruthy();

    cleanup();
    render(<HotelPolicies policies={[policy()]} copy={policyCopy('vi')} />);
    expect(screen.getByText(/Huỷ đặt phòng/)).toBeTruthy();
  });

  it('falls back to the backend’s own value for a type it does not know', () => {
    // A type added to the enum later must render, not vanish behind a lookup miss.
    render(
      <HotelPolicies policies={[policy({ type: 'RESORT_FEE' })]} copy={policyCopy('en')} />,
    );

    expect(screen.getByText(/RESORT_FEE/)).toBeTruthy();
  });

  it('lists every policy the server returned, in the order it returned them', () => {
    const { container } = render(
      <HotelPolicies
        policies={[
          policy({ type: 'BOOKING', version: 1 }),
          policy({ type: 'CANCELLATION', version: 2 }),
          policy({ type: 'CHILDREN', version: 1 }),
        ]}
        copy={policyCopy('en')}
      />,
    );

    // Ordering is the backend's; re-sorting here would rank one policy above
    // another, which is a judgement no document makes.
    const types = [...container.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(types[0]).toMatch(/Booking/);
    expect(types[1]).toMatch(/Cancellation/);
    expect(types[2]).toMatch(/Children/);
  });

  it('says a hotel has published none rather than inventing a default', () => {
    render(<HotelPolicies policies={[]} copy={policyCopy('en')} />);

    // An empty array is a success and common mid-onboarding. An invented
    // cancellation rule is the worst possible thing to guess.
    expect(screen.getByText(/has not published its policies yet/)).toBeTruthy();
    expect(screen.queryByText(/Cancellation/)).toBeNull();
  });

  it('omits an empty summary or body instead of rendering a blank paragraph', () => {
    const { container } = render(
      <HotelPolicies
        policies={[policy({ summary: '', body: 'Chỉ có nội dung chi tiết.' })]}
        copy={policyCopy('vi')}
      />,
    );

    const paragraphs = [...container.querySelectorAll('dd p')];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe('Chỉ có nội dung chi tiết.');
  });

  it('renders a policy whose summary key is absent entirely', () => {
    /*
      The wire shape, and the one that took the site down.

      The backend runs `spring.jackson.default-property-inclusion: non_null`, so
      an unwritten summary is not `''` — the key is **not there at all**. This
      component read `policy.summary.trim()` and threw, and it could not be
      caught until STEP L published a real property: every seeded hotel was
      DRAFT, so live policy data had never reached this component. Every real
      policy on the first published hotel arrives exactly like this.
    */
    const withoutSummary = { type: 'BOOKING', version: 1, body: 'Nội dung điều khoản.' };

    const { container } = render(
      <HotelPolicies
        policies={[withoutSummary as PublicPolicy]}
        copy={policyCopy('vi')}
      />,
    );

    const paragraphs = [...container.querySelectorAll('dd p')];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe('Nội dung điều khoản.');
  });

  it('renders a policy with neither summary nor body rather than throwing', () => {
    // Both keys absent is a legitimate mid-authoring state, and the type is the
    // one thing always present — so the row still says which policy it is.
    const bare = { type: 'CANCELLATION', version: 2 };

    render(<HotelPolicies policies={[bare as PublicPolicy]} copy={policyCopy('vi')} />);

    expect(screen.getByText('Huỷ đặt phòng')).toBeTruthy();
  });

  it('is a labelled section a screen reader can jump to', () => {
    render(<HotelPolicies policies={[policy()]} copy={policyCopy('en')} />);

    const section = screen.getByRole('region', { name: 'Hotel policies' });
    expect(within(section).getByRole('heading', { name: 'Hotel policies' })).toBeTruthy();
  });

  it('exposes no internal identifier', () => {
    const { container } = render(
      <HotelPolicies policies={[policy()]} copy={policyCopy('en')} />,
    );

    // PublicPolicyView deliberately omits the id, propertyId, status and every
    // timestamp — status in particular would disclose that a newer draft exists.
    expect(container.textContent).not.toMatch(/propertyId|policyId|DRAFT|ACTIVE|status/i);
  });
});

describe('the copy', () => {
  it('serves both frozen locales', () => {
    expect(policyCopy('vi').heading).toBe('Chính sách khách sạn');
    expect(policyCopy('en').heading).toBe('Hotel policies');
  });

  it('falls back to English for anything else', () => {
    expect(policyCopy('fr').heading).toBe('Hotel policies');
  });
});
