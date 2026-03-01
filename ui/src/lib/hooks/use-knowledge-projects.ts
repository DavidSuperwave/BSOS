"use client";

import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("API request failed");
    (error as any).status = res.status;
    try {
      (error as any).info = await res.json();
    } catch {}
    throw error;
  }
  return res.json();
};

// Project types
export interface KnowledgeProject {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description?: string;
  type: "vault" | "knowledge_base" | "deal_room" | "campaign" | "research";
  container_tag_suffix: string;
  containerTag?: string; // Computed full tag: gtm_{slug}_project_{suffix}
  documentCount?: number; // Live count from Supermemory
  is_shared: boolean;
  collaborators?: string[];
  document_count: number;
  // Tag-based organization (replaces folder_structure)
  suggested_tags?: {
    primary: PrimaryTag[];
    secondary: string[];
  };
  created_by: string;
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
}

// Tag-based types
export type PrimaryTag = "profile" | "icp" | "campaign" | "research" | "asset" | "analysis";

export interface DocumentTags {
  primary: PrimaryTag;
  secondary: string[];
  vertical?: string;
  stage?: "draft" | "review" | "approved" | "archived";
}

export interface DocumentRelationships {
  derived_from?: string[];
  related_to?: string[];
  used_in?: string[];
  replaces?: string;        // ID of previous version
  replaced_by?: string;     // ID of newer version
}

export interface ProjectDocument {
  id: string;
  title: string;
  type: string;
  content: string;
  raw?: string;
  metadata?: {
    tags?: DocumentTags;
    relationships?: DocumentRelationships;
    version?: number;         // Version number (1, 2, 3...)
    status?: 'active' | 'superseded' | 'archived';
    [key: string]: any;
  };
  containerTag: string;
  createdAt?: string;
  updatedAt?: string;
}

// Get all projects for a company
export function useKnowledgeProjects(companyId?: string) {
  return useSWR<{ projects: KnowledgeProject[] }>(
    companyId ? `/api/knowledge/projects?companyId=${companyId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
}

// Get single project
export function useKnowledgeProject(projectId?: string, companyId?: string) {
  return useSWR<{ project: KnowledgeProject }>(
    projectId && companyId
      ? `/api/knowledge/projects/${projectId}?companyId=${companyId}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
}

// Get documents in a project
export function useProjectDocuments(
  projectId?: string,
  companyId?: string,
  folder?: string
) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (folder) params.set("folder", folder);

  return useSWR<{
    documents: ProjectDocument[];
    containerTag: string;
    folder: string;
    count: number;
  }>(
    projectId && companyId
      ? `/api/knowledge/projects/${projectId}/documents?${params.toString()}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
}

// Create project
export async function createProject(
  companyId: string,
  data: {
    name: string;
    type?: string;
    description?: string;
  }
) {
  const res = await fetch("/api/knowledge/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      ...data,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create project");
  }

  return res.json();
}

// Update project
export async function updateProject(
  projectId: string,
  companyId: string,
  data: Partial<KnowledgeProject>
) {
  const res = await fetch(`/api/knowledge/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      ...data,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update project");
  }

  return res.json();
}

// Delete project
export async function deleteProject(projectId: string, companyId: string) {
  const res = await fetch(
    `/api/knowledge/projects/${projectId}?companyId=${companyId}`,
    {
      method: "DELETE",
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete project");
  }

  return res.json();
}

// Create document in project (tag-based)
export async function createProjectDocument(
  projectId: string,
  data: {
    companyId: string;
    title: string;
    content: string;
    type?: string;
    metadata?: {
      tags?: DocumentTags;
      relationships?: DocumentRelationships;
      [key: string]: any;
    };
  }
) {
  const res = await fetch(`/api/knowledge/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create document");
  }

  return res.json();
}

// Update project document (tag-based)
export async function updateProjectDocument(
  projectId: string,
  documentId: string,
  data: {
    companyId: string;
    title?: string;
    content?: string;
    metadata?: {
      tags?: DocumentTags;
      relationships?: DocumentRelationships;
      [key: string]: any;
    };
  }
) {
  const res = await fetch(
    `/api/knowledge/projects/${projectId}/documents/${encodeURIComponent(documentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update document");
  }

  return res.json();
}

// Delete project document
export async function deleteProjectDocument(
  projectId: string,
  documentId: string,
  companyId: string
) {
  const res = await fetch(
    `/api/knowledge/projects/${projectId}/documents/${encodeURIComponent(
      documentId
    )}?companyId=${encodeURIComponent(companyId)}`,
    {
      method: "DELETE",
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete document");
  }

  return res.json();
}

// Create new version of a document (append-only editing)
export async function createDocumentVersion(
  projectId: string,
  currentDoc: ProjectDocument,
  data: {
    companyId: string;
    title: string;
    content: string;
  }
) {
  // Create new version with incremented version number
  const newVersion = await createProjectDocument(projectId, {
    companyId: data.companyId,
    title: data.title,
    content: data.content,
    type: currentDoc.type,
    metadata: {
      tags: currentDoc.metadata?.tags,
      relationships: {
        ...currentDoc.metadata?.relationships,
        replaces: currentDoc.id, // Link to previous version
      },
      version: (currentDoc.metadata?.version || 1) + 1,
      status: 'active',
    },
  });

  // Mark old version as superseded (fire and forget - non-critical)
  updateProjectDocument(projectId, currentDoc.id, {
    companyId: data.companyId,
    metadata: {
      ...currentDoc.metadata,
      status: 'superseded',
      replaced_by: newVersion.document.id,
    },
  }).catch(console.error);

  return newVersion;
}

// Project templates (tag-based)
export const PROJECT_TEMPLATES = {
  vault: {
    name: "General Vault",
    description: "General purpose document storage",
    icon: "folder",
    suggestedTags: {
      primary: ["research", "asset", "analysis"] as PrimaryTag[],
      secondary: ["general", "reference"],
    },
  },
  knowledge_base: {
    name: "Knowledge Base",
    description: "Organized knowledge with categories",
    icon: "book",
    suggestedTags: {
      primary: ["profile", "icp", "campaign", "asset"] as PrimaryTag[],
      secondary: ["playbook", "case-study", "analytics"],
    },
  },
  deal_room: {
    name: "Deal Room",
    description: "M&A or transaction documents",
    icon: "briefcase",
    suggestedTags: {
      primary: ["research", "asset", "analysis"] as PrimaryTag[],
      secondary: ["due-diligence", "contracts", "financials", "legal"],
    },
  },
  campaign: {
    name: "Campaign Project",
    description: "Marketing campaign workspace",
    icon: "megaphone",
    suggestedTags: {
      primary: ["campaign", "asset", "analysis"] as PrimaryTag[],
      secondary: ["creative", "copy", "results", "learnings"],
    },
  },
  research: {
    name: "Research Project",
    description: "Market or competitor research",
    icon: "microscope",
    suggestedTags: {
      primary: ["research", "analysis"] as PrimaryTag[],
      secondary: ["sources", "notes", "reports"],
    },
  },
} as const;

export type ProjectType = keyof typeof PROJECT_TEMPLATES;
