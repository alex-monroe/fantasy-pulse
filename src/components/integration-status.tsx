'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { mockIntegrations, mockAlerts } from "@/lib/mock-data";
import type { Integration, Alert } from "@/lib/types";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const statusIcons = {
    ok: <CheckCircle2 className="h-5 w-5 text-primary" />,
    error: <XCircle className="h-5 w-5 text-destructive" />,
};

const alertIcons: { [key in Alert['type']]: React.ReactNode } = {
    success: <CheckCircle2 className="h-4 w-4 text-primary" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
    info: <AlertCircle className="h-4 w-4 text-accent" />,
}

/**
 * A component that displays the status of the integrations.
 * @returns A component that displays the status of the integrations.
 */
export function IntegrationStatus() {
    const { toast } = useToast();

    const handleSync = () => {
        toast({
            title: "Syncing Platforms",
            description: "Attempting to sync data from all platforms...",
        });
        setTimeout(() => {
            toast({
                title: "Sync Complete",
                description: "All platforms have been synced.",
            });
        }, 2000);
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle>Platform Status</CardTitle>
                <Button variant="outline" size="sm" onClick={handleSync}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync All
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {mockIntegrations.map((integration: Integration) => (
                        <div key={integration.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {statusIcons[integration.status]}
                                <div>
                                    <p className="font-medium">{integration.name}</p>
                                    <p className="text-sm text-muted-foreground">Last updated: {integration.lastUpdated}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <Separator className="my-4" />
                <div>
                    <h3 className="text-md font-medium mb-2">Alert Log</h3>
                    <ScrollArea className="h-48 w-full rounded-md border p-3">
                        <div className="space-y-3">
                        {mockAlerts.map((alert: Alert) => (
                            <div key={alert.id} className="flex items-start gap-3">
                                <span className="mt-0.5">{alertIcons[alert.type]}</span>
                                <div className="flex-1">
                                    <p className="text-sm">{alert.message}</p>
                                    <p className="text-xs text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            </div>
                        ))}
                        </div>
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>
    );
}
