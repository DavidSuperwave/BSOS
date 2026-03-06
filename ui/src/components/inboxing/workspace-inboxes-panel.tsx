"use client";

import { useMemo } from "react";
import { AlertCircle, ArrowRightLeft, Building2, Mail, Server, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlusVibeAccounts } from "@/lib/hooks";

interface WorkspaceInboxesPanelProps {
  companyId: string;
}

function espLabel(esp: string) {
  if (esp === "gmail") return "Gmail";
  if (esp === "microsoft") return "Microsoft";
  return "SMTP";
}

export function WorkspaceInboxesPanel({ companyId }: WorkspaceInboxesPanelProps) {
  const { data, isLoading } = usePlusVibeAccounts(companyId);
  const accounts = useMemo(() => data?.accounts || [], [data?.accounts]);
  const domainRows = data?.summary?.by_domain || [];

  const summary = useMemo(() => {
    return {
      gmail: accounts.filter((account) => account.esp === "gmail").length,
      microsoft: accounts.filter((account) => account.esp === "microsoft").length,
      smtp: accounts.filter((account) => account.esp === "smtp").length,
      managed: accounts.filter((account) => account.is_managed_domain).length,
      external: accounts.filter((account) => !account.is_managed_domain).length,
      domains: new Set(accounts.map((account) => account.domain).filter(Boolean)).size,
    };
  }, [accounts]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Loading workspace inboxes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Inboxes</p>
            <p className="mt-1 text-lg font-semibold">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Domains</p>
            <p className="mt-1 text-lg font-semibold">{summary.domains}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gmail</p>
            <p className="mt-1 text-lg font-semibold">{summary.gmail}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Microsoft</p>
            <p className="mt-1 text-lg font-semibold">{summary.microsoft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">SMTP</p>
            <p className="mt-1 text-lg font-semibold">{summary.smtp}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">External Providers</p>
            <p className="mt-1 text-lg font-semibold">{summary.external}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Inboxes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              No inbox accounts were found in this PlusVibe workspace.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Inbox</th>
                    <th className="p-3 text-left">Domain</th>
                    <th className="p-3 text-left">ESP</th>
                    <th className="p-3 text-left">Access</th>
                    <th className="p-3 text-left">Agent Capability</th>
                    <th className="p-3 text-left">Transfer</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-t border-border">
                      <td className="p-3 text-foreground">{account.email || account.id}</td>
                      <td className="p-3 text-muted-foreground">{account.domain || "—"}</td>
                      <td className="p-3">
                        <Badge variant="outline">{espLabel(account.esp)}</Badge>
                      </td>
                      <td className="p-3">
                        {account.is_managed_domain ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Managed
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                            <Building2 className="mr-1 h-3 w-3" />
                            External Provider
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {account.is_managed_domain ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <Mail className="h-3 w-3" />
                            Full agent actions
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Server className="h-3 w-3" />
                            Read-only / limited
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {account.is_managed_domain ? (
                          <span className="text-xs text-emerald-700">Already managed</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled
                            title="Transfer flow is planned but not yet enabled"
                          >
                            <ArrowRightLeft className="mr-1 h-3 w-3" />
                            Transfer (soon)
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {domainRows.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Domain</th>
                    <th className="p-2 text-left">Users</th>
                    <th className="p-2 text-left">Domain Type</th>
                  </tr>
                </thead>
                <tbody>
                  {domainRows.map((row) => (
                    <tr key={row.domain} className="border-t border-border">
                      <td className="p-2 text-foreground">{row.domain}</td>
                      <td className="p-2 text-muted-foreground">{row.user_count}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={row.managed ? "text-emerald-700" : "text-amber-700"}>
                          {row.managed ? "Managed Domain" : "External Provider"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Inboxes imported from domains not managed in our inboxing system are treated as
                external providers: the agent cannot modify infrastructure or run full automation.
                Managed domains keep full usability. Transfer to managed inboxing will be enabled
                in a follow-up flow.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
