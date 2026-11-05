// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertySwitcher } from './PropertySwitcher';

afterEach(cleanup);

/**
 * The switcher's whole job is to reflect the partner's real scope, whatever its
 * size. These cases exist because "eight properties" is the tempting assumption
 * and the wrong one.
 */
describe('PropertySwitcher', () => {
  const many = [
    { id: 'p1', label: 'hotel-alpha' },
    { id: 'p2', label: 'hotel-beta' },
    { id: 'p3', label: 'hotel-gamma' },
  ];

  it('lists exactly the properties it was given — no assumed count', () => {
    render(<PropertySwitcher properties={many} activeId="p1" onChange={vi.fn()} />);

    const select = screen.getByLabelText('Khách sạn đang chọn');
    // Three options plus the placeholder; nothing padded to eight.
    expect(within(select).length).toBe(4);
  });

  it('reports the chosen property id', async () => {
    const onChange = vi.fn();
    render(<PropertySwitcher properties={many} activeId="p1" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Khách sạn đang chọn'), 'p3');
    expect(onChange).toHaveBeenCalledWith('p3');
  });

  it('renders a single property as a label, not a one-option dropdown', () => {
    render(
      <PropertySwitcher
        properties={[{ id: 'only', label: 'hotel-solo' }]}
        activeId="only"
        onChange={vi.fn()}
      />,
    );

    // A dropdown with one choice invites a click that does nothing.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('hotel-solo')).toBeTruthy();
  });

  it('treats an empty scope as a real state, not an error', () => {
    render(<PropertySwitcher properties={[]} activeId={null} onChange={vi.fn()} />);

    // A partner with nothing yet is normal — the eight seed properties are DRAFT.
    expect(screen.getByText('Chưa có khách sạn nào')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a busy state while the scoped list is loading', () => {
    render(<PropertySwitcher properties={[]} activeId={null} onChange={vi.fn()} loading />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('announces a load failure without pretending the list is empty', () => {
    render(
      <PropertySwitcher
        properties={[]}
        activeId={null}
        onChange={vi.fn()}
        error="Không thể tải danh sách khách sạn."
      />,
    );

    // Distinct from the empty state: "you have no hotels" and "we could not ask"
    // are different facts, and conflating them would be a lie.
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Không thể tải danh sách khách sạn.');
    expect(screen.queryByText('Chưa có khách sạn nào')).toBeNull();
  });
});

/** Local helper — the options of a select element. */
function within(select: HTMLElement): HTMLOptionsCollection {
  return (select as HTMLSelectElement).options;
}
