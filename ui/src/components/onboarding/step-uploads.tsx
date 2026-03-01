"use client";

import { useState, useCallback } from "react";
import { FileUploadZone, UploadedFileCard } from "@/components/knowledge/file-upload";
import { FileText, Sparkles, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  status: "uploading" | "processing" | "complete" | "error";
  progress?: number;
  error?: string;
  file: File;
  classification?: {
    document_type: string;
    title: string;
    summary: string;
    key_points: string[];
    insights_count: number;
  };
}

interface StepUploadsProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

const TYPE_LABELS: Record<string, string> = {
  case_study: "Case Study",
  playbook: "Playbook",
  sop: "SOP",
  brand_guide: "Brand Guide",
  other: "Document",
};

export function StepUploads({ data, onChange }: StepUploadsProps) {
  const [files, setFiles] = useState<UploadedFile[]>(data._uploaded_files || []);
  const [uploading, setUploading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const syncToForm = useCallback(
    (updatedFiles: UploadedFile[]) => {
      setFiles(updatedFiles);
      onChange({
        _uploaded_files: updatedFiles,
        _uploaded_file_count: updatedFiles.filter((f) => f.status === "complete").length,
      });
    },
    [onChange]
  );

  const handleUpload = useCallback(
    async (newFiles: File[]) => {
      setUploading(true);

      const incoming: UploadedFile[] = newFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
        status: "processing" as const,
        file: f,
      }));

      const merged = [...files, ...incoming];
      setFiles(merged);

      // Classify each file client-side using a lightweight API call
      const classified = await Promise.all(
        incoming.map(async (entry) => {
          try {
            const formData = new FormData();
            formData.append("file", entry.file);

            const res = await fetch("/api/documents/analyze", {
              method: "POST",
              body: formData,
            });

            if (res.ok) {
              const analysis = await res.json();
              return {
                ...entry,
                status: "complete" as const,
                classification: {
                  document_type: analysis.document_type || "other",
                  title: analysis.title || entry.name.replace(/\.[^.]+$/, ""),
                  summary: analysis.summary || "",
                  key_points: analysis.key_points || [],
                  insights_count: analysis.extracted_insights?.length || 0,
                },
              };
            }

            // If the classify endpoint doesn't exist or fails, fall back to basic metadata
            return {
              ...entry,
              status: "complete" as const,
              classification: {
                document_type: "other",
                title: entry.name.replace(/\.[^.]+$/, ""),
                summary: "",
                key_points: [],
                insights_count: 0,
              },
            };
          } catch {
            return {
              ...entry,
              status: "complete" as const,
              classification: {
                document_type: "other",
                title: entry.name.replace(/\.[^.]+$/, ""),
                summary: "",
                key_points: [],
                insights_count: 0,
              },
            };
          }
        })
      );

      const all = [...files, ...classified];
      syncToForm(all);
      setUploading(false);
    },
    [files, syncToForm]
  );

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    syncToForm(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditTitle(files[index].classification?.title || files[index].name);
  };

  const saveEdit = (index: number) => {
    const updated = [...files];
    if (updated[index].classification) {
      updated[index] = {
        ...updated[index],
        classification: {
          ...updated[index].classification!,
          title: editTitle,
        },
      };
    }
    syncToForm(updated);
    setEditingIndex(null);
  };

  const completedFiles = files.filter((f) => f.status === "complete");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Upload Documents</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload case studies, playbooks, SOPs, or brand guides. Julian will analyze them to personalize your outreach.
        </p>
      </div>

      <FileUploadZone
        onUpload={handleUpload}
        uploading={uploading}
        accept={{
          "application/pdf": [".pdf"],
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
          "text/markdown": [".md"],
          "text/plain": [".txt"],
          "text/csv": [".csv"],
        }}
        maxSize={15 * 1024 * 1024}
      />

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Uploaded Files ({completedFiles.length})
            </h3>
            {completedFiles.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Click edit to modify classifications
              </span>
            )}
          </div>

          {files.map((file, i) => (
            <div key={`${file.name}-${i}`}>
              {file.status === "processing" ? (
                <UploadedFileCard
                  file={file}
                />
              ) : file.classification ? (
                <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      {editingIndex === i ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(i)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingIndex(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium truncate">
                          {file.classification.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[file.classification.document_type] || "Document"}
                      </Badge>
                      {editingIndex !== i && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(i)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {file.classification.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2 pl-7">
                      {file.classification.summary}
                    </p>
                  )}

                  {file.classification.key_points.length > 0 && (
                    <div className="pl-7 flex flex-wrap gap-1">
                      {file.classification.key_points.slice(0, 3).map((point, j) => (
                        <span key={j} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {point.length > 50 ? point.slice(0, 50) + "..." : point}
                        </span>
                      ))}
                    </div>
                  )}

                  {file.classification.insights_count > 0 && (
                    <div className="pl-7 flex items-center gap-1 text-xs text-primary">
                      <Sparkles className="h-3 w-3" />
                      {file.classification.insights_count} insight{file.classification.insights_count > 1 ? "s" : ""} extracted
                    </div>
                  )}
                </div>
              ) : (
                <UploadedFileCard
                  file={file}
                  onRemove={() => removeFile(i)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          This step is optional. You can always upload more documents later from the Knowledge page.
          Supported formats: PDF, DOCX, Markdown, TXT, CSV.
        </p>
      </div>
    </div>
  );
}
