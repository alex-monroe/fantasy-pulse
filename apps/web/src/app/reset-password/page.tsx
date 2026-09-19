'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AppNavigation } from '@/components/app-navigation';

/** OttoneuDB's Supabase project enforces a six-character minimum. */
const MIN_PASSWORD_LENGTH = 6;

type Status = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * The second half of the password reset flow: the form a recovery link
 * lands on once `/auth/callback` has turned its token into a session.
 *
 * Reaching this page at all is the authorization check — Supabase only
 * issues that session to whoever opened the emailed link, and
 * `updateUser` is scoped to it. Landing here without one (bookmarked
 * page, expired link, link opened in another browser) shows the
 * request-a-new-one path instead of a form that could only fail.
 *
 * @returns The reset-password page.
 */
export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // A `#access_token=…` link is parsed out of the URL asynchronously,
    // so the subscription can see a session that the getSession() below
    // raced past.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setStatus((current) => (current === 'done' ? current : 'ready'));
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setStatus((current) => {
        if (current !== 'checking') return current;
        return data.session ? 'ready' : 'invalid';
      });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError('Those passwords don’t match.');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      setStatus('done');
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
        {status === 'checking' && (
          <p className="text-sm text-muted-foreground">Checking your reset link…</p>
        )}

        {status === 'invalid' && (
          <div className="w-full max-w-sm space-y-4 text-center">
            <h1 className="text-lg font-semibold">This link has expired</h1>
            <p className="text-sm text-muted-foreground">
              Password reset links are single-use and only work in the browser
              that asked for them. Request a fresh one to try again.
            </p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          </div>
        )}

        {status === 'done' && (
          <div className="w-full max-w-sm space-y-4 text-center">
            <h1 className="text-lg font-semibold">Password updated</h1>
            <p className="text-sm text-muted-foreground">
              You&apos;re signed in with your new password.
            </p>
            <Button asChild className="w-full">
              <Link href="/">Go to your dashboard</Link>
            </Button>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Choose a new password</h1>
              <p className="text-sm text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
