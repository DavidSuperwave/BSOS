/* eslint-disable no-console */
require("dotenv").config({ path: ".env.local" });

const BASE_URL = process.env.SKILLS_SMOKE_BASE_URL || "http://localhost:3000";
const COMPANY_ID = process.env.SKILLS_SMOKE_COMPANY_ID || "";
const TARGET_COMPANY_ID = process.env.SKILLS_SMOKE_TARGET_COMPANY_ID || "";
const AUTH_COOKIE = process.env.SKILLS_SMOKE_COOKIE || "";

function assertConfigured() {
  if (!COMPANY_ID || !AUTH_COOKIE) {
    console.log("[skills-smoke] Skipping network smoke test.");
    console.log("[skills-smoke] Set SKILLS_SMOKE_COMPANY_ID and SKILLS_SMOKE_COOKIE to run.");
    process.exit(0);
  }
}

async function api(path, method = "GET", body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: AUTH_COOKIE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `[${method} ${path}] ${payload.error || res.statusText || "Request failed"}`
    );
  }
  return payload;
}

async function main() {
  assertConfigured();

  const slug = `skills-smoke-${Date.now()}`;
  const skillMd = `---
name: ${slug}
description: Skills store smoke test skill
metadata: {"openclaw":{"requires":{"env":[],"bins":[],"config":[]}}}
---

# ${slug}

Smoke test skill.
`;

  console.log("[skills-smoke] Creating skill...");
  await api(`/api/companies/${COMPANY_ID}/agent/skills`, "POST", {
    slug,
    skillMd,
    description: "Skills store smoke test",
  });

  console.log("[skills-smoke] Learning skill via paste_docs quick flow...");
  const learned = await api(`/api/companies/${COMPANY_ID}/agent/skills/learn`, "POST", {
    sourceType: "paste_docs",
    mode: "quick",
    query: "Smoke learned skill",
    content: "Simple API docs for smoke flow.\nEndpoint: GET /v1/ping\nAuth: none",
    save: true,
  });
  if (!learned.success || !learned.skill?.slug) {
    throw new Error("Expected learned skill to be created");
  }
  const learnedSlug = learned.skill.slug;

  console.log("[skills-smoke] Installing to main + campaigns...");
  await api(`/api/companies/${COMPANY_ID}/agent/skills/install`, "POST", {
    slug,
    agentTypes: ["main", "campaigns"],
  });

  console.log("[skills-smoke] Validating status + sync...");
  const status = await api(`/api/companies/${COMPANY_ID}/agent/skills`, "GET");
  const skill = (status.skills || []).find((s) => s.slug === slug);
  if (!skill) throw new Error("Skill not found in status response");

  const mainAssignment = (skill.assignments || []).find((a) => a.agentType === "main");
  const campaignsAssignment = (skill.assignments || []).find((a) => a.agentType === "campaigns");
  if (!mainAssignment || !campaignsAssignment) {
    throw new Error("Expected main and campaigns assignments");
  }
  if (!mainAssignment.synced || !campaignsAssignment.synced) {
    throw new Error("Expected synced skill file on both assigned agents");
  }

  console.log("[skills-smoke] Creating share link...");
  const share = await api(`/api/companies/${COMPANY_ID}/agent/skills/share`, "POST", {
    slug,
    expiresInHours: 24,
    maxImports: 5,
  });
  const shareToken = share?.link?.token;
  if (!shareToken) {
    throw new Error("Expected share token");
  }

  console.log("[skills-smoke] Resolving share token...");
  const resolved = await api(`/api/skills/share/${encodeURIComponent(shareToken)}`, "GET");
  if (!resolved?.skill?.slug) {
    throw new Error("Expected resolved shared skill payload");
  }

  if (TARGET_COMPANY_ID) {
    console.log("[skills-smoke] Importing shared skill to target company...");
    await api(`/api/companies/${TARGET_COMPANY_ID}/agent/skills/import`, "POST", {
      type: "share_link",
      token: shareToken,
      replaceExisting: true,
    });

    const targetStatus = await api(`/api/companies/${TARGET_COMPANY_ID}/agent/skills`, "GET");
    const imported = (targetStatus.skills || []).find((s) => s.slug === slug);
    if (!imported) {
      throw new Error("Expected imported skill in target company");
    }
  } else {
    console.log("[skills-smoke] SKILLS_SMOKE_TARGET_COMPANY_ID not set; skipping cross-company import check.");
  }

  console.log("[skills-smoke] Checking default skill pack presence...");
  const hasDefaultPack = (status.skills || []).some(
    (s) => s.slug === "gtm-engine-core-skill" || /default/i.test(s.description || "")
  );
  if (!hasDefaultPack) {
    console.warn("[skills-smoke] Default skill pack not detected in this company (non-fatal warning).");
  }

  console.log("[skills-smoke] Uninstalling from campaigns...");
  await api(`/api/companies/${COMPANY_ID}/agent/skills/uninstall`, "POST", {
    slug,
    agentTypes: ["campaigns"],
  });

  console.log("[skills-smoke] Deleting skill from registry...");
  await api(
    `/api/companies/${COMPANY_ID}/agent/skills?slug=${encodeURIComponent(slug)}`,
    "DELETE"
  );

  console.log("[skills-smoke] Deleting learned skill...");
  await api(
    `/api/companies/${COMPANY_ID}/agent/skills?slug=${encodeURIComponent(learnedSlug)}`,
    "DELETE"
  );

  console.log("[skills-smoke] SUCCESS");
}

main().catch((err) => {
  console.error("[skills-smoke] FAILED:", err.message || err);
  process.exit(1);
});
