import { act, fireEvent, render, screen } from '@testing-library/react';

const getSession = jest.fn();
const updateUser = jest.fn();
const unsubscribe = jest.fn();
const onAuthStateChange = jest.fn(() => ({
  data: { subscription: { unsubscribe } },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, updateUser, onAuthStateChange } }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/reset-password',
}));

import ResetPasswordPage from './page';

/** Renders the page with the session an opened recovery link leaves behind. */
async function renderWithRecoverySession() {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  render(<ResetPasswordPage />);
  await act(async () => {});
}

/** Fills both fields and submits, settling the Supabase promise. */
async function submit(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: confirmation },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  });
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
  updateUser.mockReset().mockResolvedValue({ error: null });
  unsubscribe.mockReset();
  onAuthStateChange.mockClear();
});

describe('ResetPasswordPage', () => {
  it('sets the new password once both fields agree', async () => {
    await renderWithRecoverySession();

    await submit('newpassword', 'newpassword');

    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(screen.getByText('Password updated')).toBeInTheDocument();
  });

  it('catches a typo in the confirmation before calling Supabase', async () => {
    await renderWithRecoverySession();

    await submit('newpassword', 'newpasswrod');

    expect(screen.getByText('Those passwords don’t match.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects a password below the project minimum before calling Supabase', async () => {
    await renderWithRecoverySession();

    await submit('short', 'short');

    expect(
      screen.getByText('Password must be at least 6 characters.'),
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('reports a password Supabase rejects', async () => {
    await renderWithRecoverySession();
    updateUser.mockResolvedValue({
      error: { message: 'New password should be different from the old password.' },
    });

    await submit('newpassword', 'newpassword');

    expect(
      screen.getByText('New password should be different from the old password.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Password updated')).not.toBeInTheDocument();
  });

  it('offers a fresh link instead of a form when the session is missing', async () => {
    render(<ResetPasswordPage />);
    await act(async () => {});

    expect(screen.getByText('This link has expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('shows the form once a session arrives late from the URL fragment', async () => {
    render(<ResetPasswordPage />);
    await act(async () => {});
    expect(screen.getByText('This link has expired')).toBeInTheDocument();

    const [handler] = onAuthStateChange.mock.calls[0] as unknown as [
      (event: string, session: unknown) => void,
    ];
    act(() => handler('PASSWORD_RECOVERY', { user: { id: 'u1' } }));

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('drops its auth subscription on unmount', async () => {
    const { unmount } = render(<ResetPasswordPage />);
    await act(async () => {});

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
