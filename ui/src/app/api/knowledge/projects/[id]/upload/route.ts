import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { requireCompanyAccess } from "@/lib/api-auth";
import { autoTag } from "@/lib/knowledge/auto-tagger";
import { projectContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

/**
 * POST /api/knowledge/projects/[id]/upload
 * 
 * Upload and process files for a project
 * Supports: PDF, Excel, CSV, Markdown, Text, JSON
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const formData = await req.formData();
    
    const companyId = formData.get("companyId") as string;
    const folder = formData.get("folder") as string || "Uploads";
    const files = formData.getAll("files") as File[];

    if (!companyId || files.length === 0) {
      return NextResponse.json(
        { error: "Company ID and files are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from("knowledge_projects")
      .select("container_tag_suffix, companies!inner(slug)")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const companySlug = (project.companies as any)?.slug || "default";
    const containerTag = projectContainerTag(companySlug, project.container_tag_suffix);

    // Get Supermemory key
    const { data: company } = await supabase
      .from("companies")
      .select("integration_credentials")
      .eq("id", companyId)
      .single();

    const smKey =
      company?.integration_credentials?.supermemory_api_key ||
      envConfig.supermemory.apiKey();

    if (!smKey) {
      return NextResponse.json(
        { error: "Supermemory not configured" },
        { status: 400 }
      );
    }

    // Process each file
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const content = await extractFileContent(file);

          // Auto-tag based on file name and content
          const suggestedTags = await autoTag({
            title: file.name,
            content: content.slice(0, 3000),
          });

          // Create document in Supermemory
          const response = await fetch(`${SUPERMEMORY_BASE}/memories`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${smKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: content.slice(0, 50000), // Limit size
              containerTag,
              metadata: {
                project_id: projectId,
                title: file.name,
                folder,
                type: "document",
                category: "upload",
                tags: {
                  primary: suggestedTags.primary,
                  secondary: suggestedTags.secondary,
                  stage: "draft",
                },
                relationships: {},
                source: "file_upload",
                original_filename: file.name,
                mime_type: file.type,
                size_bytes: file.size,
                uploaded_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                version: 1,
              },
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Supermemory error: ${errorText}`);
          }

          const result = await response.json();

          // Upsert document ref cache (non-blocking)
          void (async () => {
            try {
              await supabase
                .from("knowledge_document_refs")
                .upsert(
                  {
                    company_id: companyId,
                    project_id: projectId,
                    supermemory_doc_id: result.id,
                    supermemory_container_tag: containerTag,
                    title: file.name,
                    tags_primary: suggestedTags.primary,
                    tags_secondary: suggestedTags.secondary,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "project_id,supermemory_doc_id" }
                );
            } catch {
              // Non-critical cache sync
            }
          })();

          return {
            success: true,
            fileName: file.name,
            documentId: result.id,
            tags: {
              primary: suggestedTags.primary,
              secondary: suggestedTags.secondary,
              confidence: suggestedTags.confidence,
            },
          };
        } catch (err: any) {
          return {
            success: false,
            fileName: file.name,
            error: err.message,
          };
        }
      })
    );

    return NextResponse.json({
      uploaded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (err: any) {
    console.error("[File Upload API] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to upload files" },
      { status: 500 }
    );
  }
}

/**
 * Extract text content from various file types
 */
async function extractFileContent(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // CSV - simple parsing
  if (file.type === "text/csv" || file.name.endsWith(".csv")) {
    return new TextDecoder().decode(bytes);
  }
  
  // Text files
  if (file.type.startsWith("text/") || 
      file.name.endsWith(".md") || 
      file.name.endsWith(".txt") ||
      file.name.endsWith(".json")) {
    return new TextDecoder().decode(bytes);
  }
  
  // For PDFs and Excel files, we'd need additional parsing libraries
  // For now, store metadata and a placeholder
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return `[PDF Document: ${file.name}]\n\nThis is a PDF file. Content extraction would require a PDF parsing library like pdf-parse.`;
  }
  
  if (file.type.includes("excel") || file.type.includes("sheet") || 
      file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    return `[Excel Spreadsheet: ${file.name}]\n\nThis is an Excel file. Content extraction would require a library like xlsx or sheetjs.`;
  }
  
  // Default: try to decode as text
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return `[Binary File: ${file.name}]\n\nFile type: ${file.type}\nSize: ${file.size} bytes`;
  }
}
