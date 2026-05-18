import Link from 'next/link';

import { AppNavigation } from '@/components/app-navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The integrations page, where users can connect their fantasy football accounts.
 * @returns The integrations page.
 */
export default function IntegrationsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              Connect your fantasy football accounts to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    Connect by providing your public team URL.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
