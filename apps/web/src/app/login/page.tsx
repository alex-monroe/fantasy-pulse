'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AppNavigation } from '@/components/app-navigation';

/**
 * The login page for the application.
 * @returns The login page.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.replace('/');
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation
        endContent={(
          <Link href="/register" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Sign Up
          </Link>
        )}
      />
      <main className="flex flex-1 items-center justify-center p-4">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full">Sign In</Button>
          <p className="text-center text-sm">
            Need an account?{' '}
            <Link href="/register" className="underline">
              Sign Up
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
