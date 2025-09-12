import { NextResponse } from 'next/server';
import { mockTeams } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({ teams: mockTeams });
}
