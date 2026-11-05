// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { PasswordRules, passwordSatisfiesRules } = await import('./PasswordRules');
const { OtpBoxes } = await import('./OtpBoxes');
const { ResetPasswordForm } = await import('./ResetPasswordForm');

const PASSWORD = 'Passphrase91';

function button(name: RegExp | string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the password rules', () => {
  it('states the rules the backend actually enforces', () => {
    render(<PasswordRules />);

    expect(screen.getByText(/8 ký tự/)).toBeTruthy();
    expect(screen.getByText(/chữ hoa, chữ thường và số/)).toBeTruthy();
    // Nothing compares against a stored hash, so this cannot be checked.
    expect(screen.queryByText(/mật khẩu cũ/)).toBeNull();
  });

  it('claims nothing about an empty field', () => {
    const { container } = render(<PasswordRules password="" />);
    expect(container.querySelector('[data-met]')).toBeNull();
    expect(container.querySelector('[data-live]')).toBeNull();
  });

  it('reports each rule separately once there is something to report', () => {
    const { container } = render(<PasswordRules password="alllowercase" />);

    expect(container.querySelectorAll('li')).toHaveLength(2);
    // Long enough, but no upper case and no digit.
    expect(container.querySelectorAll('li[data-met]')).toHaveLength(1);
    expect(screen.getByText('— chưa đạt')).toBeTruthy();
  });

  it('agrees with the predicate the form uses', () => {
    expect(passwordSatisfiesRules(PASSWORD)).toBe(true);
    expect(passwordSatisfiesRules('Short1')).toBe(false);
    expect(passwordSatisfiesRules('nouppercase91')).toBe(false);
    expect(passwordSatisfiesRules('NoDigitsHere')).toBe(false);
  });
});

describe('the verification code boxes', () => {
  function boxes(): HTMLInputElement[] {
    return screen.getAllByRole('textbox') as HTMLInputElement[];
  }

  it('renders six labelled boxes in one named group', () => {
    render(<OtpBoxes />);

    expect(boxes()).toHaveLength(6);
    expect(screen.getByRole('group', { name: 'Mã xác thực' })).toBeTruthy();
    expect(boxes()[0]?.getAttribute('aria-label')).toBe('Ô 1 trong 6');
  });

  it('advances as digits are typed', async () => {
    render(<OtpBoxes />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard('12');

    expect(boxes()[0]?.value).toBe('1');
    expect(boxes()[1]?.value).toBe('2');
    expect(document.activeElement).toBe(boxes()[2]);
  });

  it('ignores anything that is not a digit', async () => {
    render(<OtpBoxes />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard('a');

    expect(boxes()[0]?.value).toBe('');
  });

  it('steps back and clears on Backspace in an empty box', async () => {
    render(<OtpBoxes />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard('12');
    // Focus is on box 3, which is empty.
    await userEvent.keyboard('{Backspace}');

    expect(boxes()[1]?.value).toBe('');
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('moves with the arrow keys', async () => {
    render(<OtpBoxes />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(boxes()[1]);

    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(boxes()[0]);
  });

  it('fills every box from a pasted code, punctuation and all', async () => {
    render(<OtpBoxes />);
    await userEvent.click(boxes()[0]!);
    await userEvent.paste('12-34 56');

    // Without the paste handler the browser drops all of it into one box.
    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('reports the code once, when all six are present', async () => {
    const onComplete = vi.fn();
    render(<OtpBoxes onComplete={onComplete} />);
    await userEvent.click(boxes()[0]!);
    await userEvent.paste('123456');

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('can be disabled, which is how the page renders it today', () => {
    render(<OtpBoxes disabled />);

    // The `disabled` attribute is on the fieldset, so `input.disabled` — which
    // reflects the input's own attribute — stays false. `:disabled` is the
    // pseudo-class that accounts for the inherited state, and it is what
    // actually decides whether the box can be typed into.
    expect(screen.getByRole('group', { name: 'Mã xác thực' })).toHaveProperty('disabled', true);
    expect(boxes()[0]?.matches(':disabled')).toBe(true);
  });
});

describe('the reset-password form', () => {
  it('checks the confirmation against the password', async () => {
    render(<ResetPasswordForm />);

    await userEvent.type(screen.getByLabelText(/Mật khẩu mới/), PASSWORD);
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'Different91');

    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeTruthy();
  });

  it('says nothing about a confirmation that has not been typed yet', async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/Mật khẩu mới/), PASSWORD);

    expect(screen.queryByText('Mật khẩu xác nhận không khớp.')).toBeNull();
  });

  it('ticks the rules live', async () => {
    const { container } = render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/Mật khẩu mới/), PASSWORD);

    expect(container.querySelectorAll('li[data-met]')).toHaveLength(2);
  });

  it('keeps the submit inert, because no endpoint would receive it', async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/Mật khẩu mới/), PASSWORD);
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), PASSWORD);

    // Every rule is satisfied and the button is still disabled: there is no
    // password-reset endpoint and no email transport behind it.
    expect(button('Đặt lại mật khẩu').disabled).toBe(true);
  });
});
