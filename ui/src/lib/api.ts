/**
 * BLITZSCALE OS - API Layer
 *
 * All calls go through local Next.js API routes
 * which proxy to external services server-side.
 */

// ============================================
// CAMPAIGNS (PlusVibe)
// ============================================

export async function fetchCampaigns() {
  const res = await fetch("/api/plusvibe/campaigns");
  if (!res.ok) throw new Error("Failed to fetch campaigns");
  return res.json();
}

export async function createCampaign(data: any) {
  const res = await fetch("/api/plusvibe/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create campaign");
  return res.json();
}

export async function updateCampaign(campaignId: string, data: any) {
  const res = await fetch(`/api/plusvibe/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update campaign");
  return res.json();
}

// ============================================
// DASHBOARD
// ============================================

export async function fetchDashboardMetrics() {
  const res = await fetch("/api/dashboard/metrics");
  if (!res.ok) throw new Error("Failed to fetch metrics");
  return res.json();
}

// ============================================
// KNOWLEDGE BASE
// ============================================

export async function fetchKnowledgeDocuments(category?: string) {
  const params = category ? `?category=${category}` : "";
  const res = await fetch(`/api/knowledge/documents${params}`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function createKnowledgeDocument(data: {
  title: string;
  content: string;
  category: string;
  companyId?: string;
}) {
  const res = await fetch("/api/knowledge/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create document");
  return res.json();
}

export async function updateKnowledgeDocument(
  id: string,
  data: Partial<{ title: string; content: string; category: string }>
) {
  const res = await fetch(`/api/knowledge/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update document");
  return res.json();
}

export async function deleteKnowledgeDocument(id: string) {
  const res = await fetch(`/api/knowledge/documents/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete document");
  return res.json();
}

// ============================================
// RESEARCH (Perplexity)
// ============================================

export async function runResearch(query: string) {
  const res = await fetch("/api/perplexity/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error("Failed to run research");
  return res.json();
}

// ============================================
// CHAT (OpenClaw)
// ============================================

export async function sendChatMessage(message: string, sessionId?: string) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });
  return res;
}

// ============================================
// SETTINGS
// ============================================

export async function fetchApiStatus() {
  const res = await fetch("/api/settings/status");
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}
