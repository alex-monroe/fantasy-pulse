'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { ReactNode, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/matchup-report', label: 'Matchup Report' },
  { href: '/integrations', label: 'Integrations' },
];

/**
 * The top navigation used across application pages.
 *
 * @param startContent - Optional content rendered before the brand, e.g. sidebar triggers.
 * @param endContent - Optional content rendered on the right side, e.g. page actions.
 * @returns The application navigation header.
 */
type HighlightedNavLink = (typeof NAV_LINKS)[number] & { isActive: boolean };

function MobileNavigation({
  links,
}: {
  links: HighlightedNavLink[];
}) {
  if (links.length === 0) {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col">
        <nav className="mt-6 flex flex-col gap-1 text-sm font-medium">
          {links.map((link) => (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                aria-current={link.isActive ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground',
                  link.isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
                )}
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function AppNavigation({
  startContent,
  endContent,
}: {
  startContent?: ReactNode;
  endContent?: ReactNode;
}) {
  const pathname = usePathname();

  const highlightedLinks = useMemo<HighlightedNavLink[]>(() => {
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
        <div className="flex flex-1 items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <MobileNavigation links={highlightedLinks} />
            {startContent}
            <Link href="/" className="text-base font-semibold tracking-tight">
              Roster Loom
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
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
