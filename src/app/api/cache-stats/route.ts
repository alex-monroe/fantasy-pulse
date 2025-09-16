import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/cache';

export async function GET() {
  const stats = await getCacheStats();
  return NextResponse.json(stats);
}
