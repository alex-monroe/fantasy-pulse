import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

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
        <CardContent>
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
        </CardContent>
      </Card>
    </main>
  );
}
