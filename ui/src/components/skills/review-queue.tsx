"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ReviewItem {
  id: string;
  skill_id: string;
  agent_type: string;
  output_summary: string;
  input_params: Record<string, any>;
  created_at: string;
}

export function ReviewQueue({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/skills/review`);
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const update = async (id: string, action: "approve" | "reject" | "modify") => {
    setBusyId(id);
    try {
      await fetch(`/api/companies/${companyId}/skills/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Insight Review Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
        {!loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items pending review.</p>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline">{item.skill_id}</Badge>
              <Badge variant="outline">{item.agent_type}</Badge>
            </div>
            <p className="text-sm whitespace-pre-wrap">{item.output_summary}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void update(item.id, "approve")}
                disabled={busyId === item.id}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void update(item.id, "modify")}
                disabled={busyId === item.id}
              >
                Modify
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void update(item.id, "reject")}
                disabled={busyId === item.id}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

