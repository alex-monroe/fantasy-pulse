import { act, fireEvent, render, screen } from '@testing-library/react';

const resetPasswordForEmail = jest.fn();

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/forgot-password',
}));

import ForgotPasswordPage from './page';

/** Fills in the address and submits, settling the Supabase promise. */
async function requestLink(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  });
}

beforeEach(() => {
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
});

describe('ForgotPasswordPage', () => {
  it('asks Supabase for a link pointed back at the reset form', async () => {
    render(<ForgotPasswordPage />);

    await requestLink('manager@test.com');

    expect(resetPasswordForEmail).toHaveBeenCalledWith('manager@test.com', {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
  });

  it('confirms without confirming the account exists', async () => {
    render(<ForgotPasswordPage />);

    await requestLink('manager@test.com');

    expect(screen.getByText('Check your email')).toBeInTheDocument();
    expect(
      screen.getByText(/If an account exists for manager@test\.com/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('surfaces a real failure instead of claiming an email went out', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: 'Email rate limit exceeded' },
    });
    render(<ForgotPasswordPage />);

    await requestLink('manager@test.com');

    expect(screen.getByText('Email rate limit exceeded')).toBeInTheDocument();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });
});
