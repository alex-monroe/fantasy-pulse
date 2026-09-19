'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AppNavigation } from '@/components/app-navigation';

/**
 * Where the emailed link lands. The callback trades the token for a
 * session cookie and then forwards to the form that sets the new
 * password.
 */
const RESET_REDIRECT = '/auth/callback?next=/reset-password';

/**
 * The "I forgot my password" page: takes an email address and asks
 * Supabase to send a recovery link.
 *
 * The confirmation is deliberately the same whether or not an account
 * exists for that address — this form would otherwise be a way to find
 * out who has one.
 *
 * @returns The forgot-password page.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${RESET_REDIRECT}`,
    });
    setSending(false);
    if (error) {
      // Supabase doesn't report "no such user" here, so anything that
      // comes back is a real fault (rate limit, misconfigured SMTP)
      // worth showing rather than swallowing.
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation
        endContent={(
          <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Sign In
          </Link>
        )}
      />
      <main className="flex flex-1 items-center justify-center p-4">
        {sent ? (
          <div className="w-full max-w-sm space-y-4 text-center">
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for {email}, we&apos;ve sent it a link to
              reset the password. The link expires in an hour.
            </p>
            <p className="text-center text-sm">
              <Link href="/login" className="underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Reset your password</h1>
              <p className="text-sm text-muted-foreground">
                Enter the email address on your account and we&apos;ll send you
                a link to choose a new password.
              </p>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="text-center text-sm">
              Remembered it?{' '}
              <Link href="/login" className="underline">
                Sign In
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
