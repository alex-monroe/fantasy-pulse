import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function IntegrationsPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Manage Integrations</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Sleeper</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/integrations/sleeper">
              <Button>Manage Sleeper Integration</Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Yahoo</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/integrations/yahoo">
              <Button>Manage Yahoo Integration</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
