import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // This is a placeholder for the Yahoo OAuth callback.
  // In a real application, you would handle the OAuth callback here,
  // exchanging the authorization code for an access token and storing it.
  return NextResponse.json({ message: 'Yahoo OAuth callback received' });
}
