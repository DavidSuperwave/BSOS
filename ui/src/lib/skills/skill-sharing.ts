import crypto from "crypto";
import { normalizeSkillSlug } from "./common";
import { parseSkillFrontmatter } from "./frontmatter";

function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export interface ShareLinkOptions {
  label?: string;
  expiresInHours?: number;
  maxImports?: number | null;
  allowDownload?: boolean;
  allowImport?: boolean;
  metadata?: Record<string, any>;
}

export async function createSkillShareLink(params: {
  admin: any;
  companyId: string;
  skillSlug: string;
  createdBy?: string | null;
  options?: ShareLinkOptions;
}) {
  const token = newToken();
  const expiresInHours = params.options?.expiresInHours;
  const expiresAt =
    typeof expiresInHours === "number" && Number.isFinite(expiresInHours)
      ? new Date(Date.now() + Math.max(1, expiresInHours) * 3600000).toISOString()
      : null;

  const { data, error } = await params.admin
    .from("skill_share_links")
    .insert({
      company_id: params.companyId,
      skill_slug: normalizeSkillSlug(params.skillSlug),
      token,
      label: params.options?.label || null,
      allow_download: params.options?.allowDownload !== false,
      allow_import: params.options?.allowImport !== false,
      max_imports:
        typeof params.options?.maxImports === "number"
          ? Math.max(1, params.options.maxImports)
          : null,
      expires_at: expiresAt,
      created_by: params.createdBy || null,
      metadata: params.options?.metadata || {},
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function resolveSkillShareToken(params: {
  admin: any;
  token: string;
}) {
  const token = String(params.token || "").trim();
  if (!token) throw new Error("Share token is required");

  const { data: link, error: linkErr } = await params.admin
    .from("skill_share_links")
    .select("*")
    .eq("token", token)
    .single();
  if (linkErr || !link) throw new Error("Share link not found");

  if (link.revoked_at) throw new Error("Share link is revoked");
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    throw new Error("Share link has expired");
  }
  if (
    typeof link.max_imports === "number" &&
    Number.isFinite(link.max_imports) &&
    link.import_count >= link.max_imports
  ) {
    throw new Error("Share link import limit reached");
  }

  const { data: skill, error: skillErr } = await params.admin
    .from("company_skill_registry")
    .select("*")
    .eq("company_id", link.company_id)
    .eq("slug", link.skill_slug)
    .single();
  if (skillErr || !skill) throw new Error("Shared skill no longer exists");

  return { link, skill };
}

export async function markShareLinkUsed(params: {
  admin: any;
  linkId: string;
  incrementImportCount?: boolean;
}) {
  const payload: Record<string, any> = {
    last_used_at: new Date().toISOString(),
  };

  if (params.incrementImportCount) {
    const { data: link, error: linkErr } = await params.admin
      .from("skill_share_links")
      .select("import_count")
      .eq("id", params.linkId)
      .single();
    if (linkErr) throw new Error(linkErr.message);
    payload.import_count = (link?.import_count || 0) + 1;
  }

  const { error } = await params.admin
    .from("skill_share_links")
    .update(payload)
    .eq("id", params.linkId);
  if (error) throw new Error(error.message);
}

export async function importSharedSkillIntoCompany(params: {
  admin: any;
  targetCompanyId: string;
  token: string;
  importedBy?: string | null;
  slugOverride?: string;
  nameOverride?: string;
  descriptionOverride?: string;
  replaceExisting?: boolean;
}) {
  const { link, skill } = await resolveSkillShareToken({
    admin: params.admin,
    token: params.token,
  });

  if (!link.allow_import) {
    throw new Error("Share link cannot be used for imports");
  }

  const parsed = parseSkillFrontmatter(skill.skill_md || "");
  const targetSlug = normalizeSkillSlug(
    params.slugOverride || skill.slug || parsed.name || ""
  );
  if (!targetSlug) throw new Error("Could not determine target skill slug");

  if (!params.replaceExisting) {
    const { data: existing } = await params.admin
      .from("company_skill_registry")
      .select("id")
      .eq("company_id", params.targetCompanyId)
      .eq("slug", targetSlug)
      .maybeSingle();
    if (existing) {
      throw new Error(`Skill '${targetSlug}' already exists in this company`);
    }
  }

  const { data: upserted, error: upsertErr } = await params.admin
    .from("company_skill_registry")
    .upsert(
      {
        company_id: params.targetCompanyId,
        slug: targetSlug,
        name: params.nameOverride || skill.name || parsed.name || targetSlug,
        description:
          params.descriptionOverride || skill.description || parsed.description || "",
        version: skill.version || "1.0.0",
        skill_md: skill.skill_md,
        metadata: {
          ...(skill.metadata || {}),
          import: {
            source_company_id: link.company_id,
            source_skill_slug: link.skill_slug,
            share_link_id: link.id,
            imported_at: new Date().toISOString(),
          },
        },
        created_by: params.importedBy || null,
      },
      { onConflict: "company_id,slug" }
    )
    .select("*")
    .single();
  if (upsertErr) throw new Error(upsertErr.message);

  const { error: provenanceErr } = await params.admin
    .from("company_skill_imports")
    .insert({
      company_id: params.targetCompanyId,
      skill_slug: targetSlug,
      source_type: "share_link",
      source_company_id: link.company_id,
      source_skill_slug: link.skill_slug,
      share_link_id: link.id,
      imported_by: params.importedBy || null,
    });
  if (provenanceErr) throw new Error(provenanceErr.message);

  await markShareLinkUsed({
    admin: params.admin,
    linkId: link.id,
    incrementImportCount: true,
  });

  return { shareLink: link, skill: upserted };
}
