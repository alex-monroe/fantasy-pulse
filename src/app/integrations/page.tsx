import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

/**
 * The integrations page, where users can connect their fantasy football accounts.
 * @returns The integrations page.
 */
export default function IntegrationsPage() {
  return (
    <main className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect your fantasy football accounts to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/integrations/sleeper">
            <Card className="hover:bg-muted">
              <CardHeader>
                <CardTitle>Sleeper</CardTitle>
                <CardDescription>
                  Connect your Sleeper account to import your leagues.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/integrations/yahoo">
            <Card className="hover:bg-muted">
              <CardHeader>
                <CardTitle>Yahoo</CardTitle>
                <CardDescription>
                  Connect your Yahoo account to import your leagues.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/integrations/ottoneu">
            <Card className="hover:bg-muted">
              <CardHeader>
                <CardTitle>Ottoneu</CardTitle>
                <CardDescription>
                  Connect your Ottoneu team by providing a public team link.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
