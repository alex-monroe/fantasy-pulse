/**
 * Site-wide footer crediting our data providers.
 *
 * Yahoo's developer attribution requirements (https://sports.yahoo.com/developer/)
 * require web apps to show "Fantasy data
 * provided by Yahoo Fantasy" in the footer of every page that displays
 * Yahoo Fantasy data, hyperlinked to an official Yahoo Fantasy page. It is
 * rendered from the root layout so no page can forget it. Keep the wording
 * as-is and don't add Yahoo logos or other branding.
 */
export function DataAttributionFooter() {
  return (
    <footer className="mt-8 border-t border-border/50 px-4 py-4 text-center text-xs text-muted-foreground">
      Fantasy data provided by{' '}
      <a
        href="https://football.fantasysports.yahoo.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Yahoo Fantasy
      </a>
      .
    </footer>
  );
}
