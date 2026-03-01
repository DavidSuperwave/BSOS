# Supermemory Reference (Vault)

This document explains how Supermemory is used in the Vault flow, why behavior can differ from a classic document system, and how to troubleshoot visibility issues.

## Canonical Docs

- Overview: [Supermemory Intro](https://supermemory.ai/docs/intro)

## Mental Model

Supermemory is primarily a memory/context system, not a traditional filesystem.

- A "document" in this app maps to a memory record in Supermemory.
- Project scoping is done via `containerTag`/`containerTags`, not directory paths.
- Metadata carries app-level structure (`project_id`, tags, stage, relationships, etc.).

In practice, the app treats memories as editable documents:

- Create: `POST /v3/memories`
- Read/List: `POST /v3/search` and `GET /v3/memories/:id`
- Update: `PATCH /v3/memories/:id`
- Delete: `DELETE /v3/memories/:id`

## Vault Mapping

App concept -> Supermemory mapping:

- Company -> key namespace via per-company API key + company slug
- Project -> project-specific container tag (`gtm_{company_slug}_project_{project_suffix}`)
- Document -> memory row in project container with metadata
- Folder UI label (legacy) -> derived metadata field (`folder`) + tag semantics

## Why "Created but Not Visible" Can Happen

Even when create succeeds, list can appear empty if:

- Search indexing is delayed.
- Container tag format differs across environments.
- Search filters are stricter than the created metadata.

To keep UX stable, this app also stores `knowledge_document_refs` as a local visibility cache.

## Current Reliability Pattern

1. Create memory in Supermemory (`/memories`).
2. Upsert reference row in `knowledge_document_refs`.
3. List endpoint tries Supermemory search first.
4. If search is empty/degraded, fallback to refs cache for immediate sidebar visibility.

## Troubleshooting Checklist

1. Confirm create request returns `201` from `/api/knowledge/projects/[id]/documents`.
2. Confirm a row exists in `knowledge_document_refs` for that `project_id`.
3. Confirm list request `/api/knowledge/projects/[id]/documents?companyId=...` returns `documents.length > 0`.
4. If still empty, inspect:
   - project container tag variants
   - metadata tags/folder fields
   - Supermemory key for selected company

## Notes for Future Changes

- Keep API responses backward compatible with `useProjectDocuments` (`documents`, `containerTag`, `count`, `total`).
- Prefer additive metadata changes; avoid removing existing keys used by filters.
- Treat `knowledge_document_refs` as a read-availability fallback, not the source of truth for full content.
