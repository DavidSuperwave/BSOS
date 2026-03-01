"use client";

import { ArrowUpLeft, Link2, ArrowDownRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RelatedDoc {
  id: string;
  title: string;
}

interface RelationshipSectionProps {
  derivedFrom?: RelatedDoc[];
  relatedTo?: RelatedDoc[];
  usedIn?: RelatedDoc[];
  onRelationshipClick?: (documentId: string) => void;
}

function RelationshipGroup({
  label,
  icon: Icon,
  docs,
  color,
  onClick,
}: {
  label: string;
  icon: typeof ArrowUpLeft;
  docs: RelatedDoc[];
  color: string;
  onClick?: (id: string) => void;
}) {
  if (docs.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="space-y-1 pl-5">
        {docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onClick?.(doc.id)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors w-full text-left"
          >
            <span className="truncate">{doc.title}</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
              {doc.id.slice(0, 6)}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RelationshipSection({
  derivedFrom = [],
  relatedTo = [],
  usedIn = [],
  onRelationshipClick,
}: RelationshipSectionProps) {
  const totalLinks = derivedFrom.length + relatedTo.length + usedIn.length;

  if (totalLinks === 0) {
    return null;
  }

  return (
    <details className="mt-4 rounded-lg border border-border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
        <span>
          Relationships{" "}
          <span className="text-xs text-muted-foreground font-normal">
            ({totalLinks} link{totalLinks !== 1 ? "s" : ""})
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3">
        <RelationshipGroup
          label="Derived from"
          icon={ArrowUpLeft}
          docs={derivedFrom}
          color="text-blue-400"
          onClick={onRelationshipClick}
        />
        <RelationshipGroup
          label="Related to"
          icon={Link2}
          docs={relatedTo}
          color="text-amber-400"
          onClick={onRelationshipClick}
        />
        <RelationshipGroup
          label="Used in"
          icon={ArrowDownRight}
          docs={usedIn}
          color="text-green-400"
          onClick={onRelationshipClick}
        />
      </div>
    </details>
  );
}
