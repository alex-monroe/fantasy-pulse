'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useMemo } from 'react';

import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/matchup-report', label: 'Matchup Report' },
];

/**
 * The top navigation used across application pages.
 *
 * @param startContent - Optional content rendered before the brand, e.g. sidebar triggers.
 * @param endContent - Optional content rendered on the right side, e.g. page actions.
 * @returns The application navigation header.
 */
export function AppNavigation({
  startContent,
  endContent,
}: {
  startContent?: ReactNode;
  endContent?: ReactNode;
}) {
  const pathname = usePathname();

  const highlightedLinks = useMemo(() => {
    return NAV_LINKS.map((link) => {
      const isHome = link.href === '/';
      const isActive = isHome
        ? pathname === '/'
        : pathname.startsWith(link.href);

      return {
        ...link,
        isActive,
      };
    });
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 w-full items-center gap-4 px-4 sm:px-6">
        <div className="flex flex-1 items-center gap-6">
          <div className="flex items-center gap-2">
            {startContent}
            <Link href="/" className="text-base font-semibold tracking-tight">
              Roster Loom
            </Link>
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
            {highlightedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.isActive ? 'page' : undefined}
                className={cn(
                  'transition-colors hover:text-primary',
                  link.isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {endContent}
        </div>
      </div>
    </header>
  );
}
