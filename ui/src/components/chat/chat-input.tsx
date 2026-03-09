"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Send,
  Loader2,
  Search,
  Lightbulb,
  FileText,
  PenLine,
  FolderOpen,
  Globe,
  Tag,
  Paperclip,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  Database,
  Check,
  X,
} from "lucide-react";
import { SuggestionChip } from "@/components/ui/text-effects";
import {
  Target,
  Mail,
  Brain,
  Wrench,
} from "lucide-react";

/** Tool definitions for slash command autocomplete */
const SLASH_TOOLS = [
  {
    command: "/search",
    tool: "search_documents",
    label: "Search Knowledge Base",
    description: "Search for documents by content or tags",
    icon: Search,
    params: [{ name: "query", required: true, placeholder: "Search query..." }],
  },
  {
    command: "/create",
    tool: "create_document",
    label: "Create Document",
    description: "Create a new knowledge document",
    icon: PenLine,
    params: [
      { name: "title", required: true, placeholder: "Document title..." },
      { name: "content", required: true, placeholder: "Content..." },
    ],
  },
  {
    command: "/get",
    tool: "get_document",
    label: "Get Document",
    description: "Retrieve a document by ID",
    icon: FileText,
    params: [{ name: "document_id", required: true, placeholder: "Document ID..." }],
  },
  {
    command: "/tags",
    tool: "list_tags",
    label: "List Tags",
    description: "List all knowledge base tags with counts",
    icon: Tag,
    params: [],
  },
  {
    command: "/research",
    tool: "web_search",
    label: "Web Research",
    description: "Research a topic using web search",
    icon: Globe,
    params: [{ name: "query", required: true, placeholder: "Research topic..." }],
  },
  {
    command: "/analyze",
    tool: "analyze_campaign",
    label: "Analyze Campaign",
    description: "Analyze campaign performance",
    icon: Target,
    params: [{ name: "campaign", required: false, placeholder: "Campaign name (optional)..." }],
  },
  {
    command: "/draft",
    tool: "draft_email",
    label: "Draft Email",
    description: "Draft an outreach email",
    icon: Mail,
    params: [{ name: "context", required: false, placeholder: "Context or recipient..." }],
  },
  {
    command: "/folders",
    tool: "list_folders",
    label: "List Folders",
    description: "List knowledge base folders with document counts",
    icon: FolderOpen,
    params: [],
  },
];

const SUGGESTIONS = [
  { id: "research", label: "Research an ICP", icon: <Brain className="h-4 w-4" /> },
  { id: "campaign", label: "Create Campaign", icon: <Target className="h-4 w-4" /> },
  { id: "optimize", label: "Optimize Outreach", icon: <Mail className="h-4 w-4" /> },
  { id: "strategy", label: "GTM Strategy", icon: <FileText className="h-4 w-4" /> },
  { id: "analyze", label: "Analyze Results", icon: <Wrench className="h-4 w-4" /> },
];

interface ChatInputProps {
  onSend: (
    message: string,
    options?: { referencedDocs?: Array<{ id: string; title: string }> }
  ) => void;
  isProcessing: boolean;
  showSuggestions?: boolean;
  variant?: "default" | "modern";
  compact?: boolean;
  placeholder?: string;
  mentionChips?: string[];
  optionsLabel?: string;
  modeLabel?: "Chat" | "Research";
  onModeChange?: (mode: "Chat" | "Research") => void;
  vaultDocuments?: Array<{ id: string; title: string; updatedAt?: string }>;
  vaultLoading?: boolean;
}

export function ChatInput({
  onSend,
  isProcessing,
  showSuggestions = true,
  variant = "default",
  compact = false,
  placeholder = "Ask anything. Type @ for mentions.",
  mentionChips = ["Mention 1", "Mention 2"],
  optionsLabel = "Options",
  modeLabel = "Chat",
  onModeChange,
  vaultDocuments = [],
  vaultLoading = false,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedSlashIdx, setSelectedSlashIdx] = useState(0);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  const [vaultQuery, setVaultQuery] = useState("");
  const [selectedVaultDocs, setSelectedVaultDocs] = useState<Array<{ id: string; title: string }>>([]);
  const [activeMode, setActiveMode] = useState<"Chat" | "Research">(modeLabel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const vaultMenuRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveMode(modeLabel);
  }, [modeLabel]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Filter slash commands based on input
  const filteredTools = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const query = input.slice(1).toLowerCase();
    return SLASH_TOOLS.filter(
      (t) =>
        t.command.slice(1).startsWith(query) ||
        t.label.toLowerCase().includes(query) ||
        t.tool.includes(query)
    );
  }, [input]);

  // Show/hide slash menu
  useEffect(() => {
    const shouldShow = input.startsWith("/") && filteredTools.length > 0 && !input.includes(" ");
    setShowSlashMenu(shouldShow);
    if (shouldShow) {
      setSelectedSlashIdx(0);
    }
  }, [input, filteredTools]);

  const filteredVaultDocuments = useMemo(() => {
    const normalizedQuery = vaultQuery.trim().toLowerCase();
    const sorted = [...vaultDocuments].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    if (!normalizedQuery) return sorted.slice(0, 20);
    return sorted
      .filter((doc) => {
        const title = doc.title.toLowerCase();
        return title.includes(normalizedQuery) || doc.id.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 20);
  }, [vaultDocuments, vaultQuery]);

  useEffect(() => {
    if (vaultDocuments.length === 0) {
      setSelectedVaultDocs([]);
      return;
    }
    setSelectedVaultDocs((previous) =>
      previous.filter((selected) => vaultDocuments.some((doc) => doc.id === selected.id))
    );
  }, [vaultDocuments]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (showAddMenu && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setShowAddMenu(false);
      }

      if (showVaultMenu && vaultMenuRef.current && !vaultMenuRef.current.contains(target)) {
        setShowVaultMenu(false);
      }

      if (showOptionsMenu && optionsMenuRef.current && !optionsMenuRef.current.contains(target)) {
        setShowOptionsMenu(false);
      }

      if (
        showSlashMenu &&
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !(textareaRef.current && textareaRef.current.contains(target))
      ) {
        setShowSlashMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showAddMenu, showVaultMenu, showOptionsMenu, showSlashMenu]);

  const selectSlashCommand = useCallback(
    (tool: (typeof SLASH_TOOLS)[number]) => {
      if (tool.params.length === 0) {
        // No params needed — send as a natural language request
        onSend(`Use the ${tool.tool} tool`);
        setInput("");
        setShowSlashMenu(false);
      } else {
        // Has params — insert command with space for user to type params
        setInput(`${tool.command} `);
        setShowSlashMenu(false);
        textareaRef.current?.focus();
      }
    },
    [onSend]
  );

  const handleSubmit = () => {
    if (!input.trim() || isProcessing) return;

    let message = input.trim();

    if (variant === "modern" && activeMode.toLowerCase() !== "chat") {
      message = `[${activeMode}] ${message}`;
    }

    // If it's a slash command with params, convert to natural language
    const matchedTool = SLASH_TOOLS.find((t) => message.startsWith(t.command + " "));
    if (matchedTool) {
      const args = message.slice(matchedTool.command.length + 1).trim();
      if (args) {
        // Convert slash command to natural language request
        message = `Use the ${matchedTool.tool} tool with ${matchedTool.params[0]?.name || "input"}: ${args}`;
      }
    }

    onSend(
      message,
      selectedVaultDocs.length > 0
        ? {
            referencedDocs: selectedVaultDocs.map((doc) => ({
              id: doc.id,
              title: doc.title,
            })),
          }
        : undefined
    );
    setInput("");
    setShowSlashMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setShowAddMenu(false);
    setShowOptionsMenu(false);
    setShowVaultMenu(false);
  };

  const appendInput = (snippet: string) => {
    setInput((prev) => {
      const normalized = prev.trim();
      if (!normalized) return snippet;
      return `${normalized} ${snippet}`.trim();
    });
    textareaRef.current?.focus();
  };

  const applyAddAction = (action: "attach" | "connectors" | "tools" | "vault") => {
    if (action === "attach") {
      appendInput("[attached context]");
    } else if (action === "connectors") {
      appendInput("@source");
    } else if (action === "vault") {
      setShowVaultMenu(true);
    } else {
      setInput("/");
      setShowSlashMenu(true);
      textareaRef.current?.focus();
    }
    setShowAddMenu(false);
  };

  const toggleVaultDocument = (doc: { id: string; title: string }) => {
    setSelectedVaultDocs((previous) => {
      if (previous.some((item) => item.id === doc.id)) {
        return previous.filter((item) => item.id !== doc.id);
      }
      return [...previous, doc];
    });
  };

  const applyOption = (option: "research" | "chat" | "fact-check") => {
    if (option === "research") {
      setActiveMode("Research");
      onModeChange?.("Research");
    }
    if (option === "chat") {
      setActiveMode("Chat");
      onModeChange?.("Chat");
    }
    if (option === "fact-check") appendInput("fact-check");
    setShowOptionsMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && showVaultMenu) {
      e.preventDefault();
      setShowVaultMenu(false);
      return;
    }

    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSlashIdx((prev) =>
          prev < filteredTools.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSlashIdx((prev) =>
          prev > 0 ? prev - 1 : filteredTools.length - 1
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const selected = filteredTools[selectedSlashIdx];
        if (selected) {
          selectSlashCommand(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderModernCompactInput = () => (
    <div className="w-full rounded-[1.15rem] border border-[#e3e5eb] bg-white p-2.5 shadow-[0_8px_30px_rgba(16,24,40,0.04)]">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isProcessing}
        rows={1}
        className="max-h-24 min-h-[34px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-[#232a39] placeholder:text-[#737b8c] focus:outline-none disabled:opacity-50"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-[#dfe4ee] bg-[#fafbfe] p-1">
          <button
            type="button"
            onClick={() => appendInput("@")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#52607a] hover:bg-[#eef2fa]"
            aria-label="Search mode"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => appendInput("@web")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#52607a] hover:bg-[#eef2fa]"
            aria-label="Web mode"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => appendInput("idea:")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#52607a] hover:bg-[#eef2fa]"
            aria-label="Thinking mode"
          >
            <Lightbulb className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyAddAction("attach")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#52607a] hover:bg-[#eef2fa]"
            aria-label="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing || !input.trim()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0e1320] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Send message"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderModernInput = () => (
    <div className="w-full rounded-[2rem] border border-[#e3e5eb] bg-white p-4 shadow-[0_8px_30px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => appendInput("@")}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl border border-[#e4e6ed] bg-[#f8f9fc] px-2 text-base text-[#2f3747]"
        >
          @
        </button>
        {mentionChips.slice(0, 2).map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              appendInput(`"${chip}"`);
            }}
            className="inline-flex h-8 items-center rounded-xl border border-[#e4e6ed] bg-[#f8f9fc] px-3 text-sm font-medium text-[#2f3747] transition-colors hover:bg-[#f1f3f9]"
          >
            {chip}
          </button>
        ))}
      </div>
      {selectedVaultDocs.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {selectedVaultDocs.map((doc) => (
            <span
              key={doc.id}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#dbe3f4] bg-[#f4f7ff] px-3 text-xs font-medium text-[#32405f]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="max-w-[220px] truncate">{doc.title}</span>
              <button
                type="button"
                onClick={() => toggleVaultDocument(doc)}
                className="rounded-full p-0.5 text-[#516083] hover:bg-[#e8eefc]"
                aria-label={`Remove ${doc.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isProcessing}
        rows={2}
        className="min-h-[88px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-7 text-[#232a39] placeholder:text-[#737b8c] focus:outline-none disabled:opacity-50"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div ref={addMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setShowAddMenu((value) => !value);
                setShowOptionsMenu(false);
                setShowVaultMenu(false);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e2e5ec] bg-white text-[#2f3747] hover:bg-[#f8f9fc]"
            >
              <Plus className="h-5 w-5" />
            </button>
            {showAddMenu ? (
              <div className="absolute bottom-14 left-0 z-30 w-52 rounded-2xl border border-[#e2e6ef] bg-white p-1 shadow-[0_10px_30px_rgba(16,24,40,0.12)]">
                <button
                  type="button"
                  onClick={() => applyAddAction("vault")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Vault documents
                </button>
                <button
                  type="button"
                  onClick={() => applyAddAction("attach")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Upload files or images
                </button>
                <button
                  type="button"
                  onClick={() => applyAddAction("connectors")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Connectors and sources
                </button>
                <button
                  type="button"
                  onClick={() => applyAddAction("tools")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Tool commands
                </button>
              </div>
            ) : null}
          </div>
          <div ref={vaultMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setShowVaultMenu((value) => !value);
                setShowAddMenu(false);
                setShowOptionsMenu(false);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e2e5ec] bg-white px-4 text-sm font-medium text-[#2f3747] hover:bg-[#f8f9fc]"
            >
              <Database className="h-4 w-4" />
              Vault
              <ChevronDown className="h-4 w-4 text-[#697185]" />
            </button>
            {showVaultMenu ? (
              <div className="absolute bottom-14 left-0 z-30 w-80 rounded-2xl border border-[#e2e6ef] bg-white p-2 shadow-[0_10px_30px_rgba(16,24,40,0.12)]">
                <div className="px-1 pb-2">
                  <input
                    value={vaultQuery}
                    onChange={(e) => setVaultQuery(e.target.value)}
                    placeholder="Search vault files..."
                    className="h-9 w-full rounded-lg border border-[#e2e6ef] bg-white px-3 text-sm text-[#2f3747] outline-none focus:border-[#c8d2ea]"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {vaultLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-[#697185]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading vault documents...
                    </div>
                  ) : filteredVaultDocuments.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[#697185]">
                      No documents found in your vault.
                    </div>
                  ) : (
                    filteredVaultDocuments.map((doc) => {
                      const isSelected = selectedVaultDocs.some((selected) => selected.id === doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => toggleVaultDocument({ id: doc.id, title: doc.title })}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                            isSelected
                              ? "bg-[#eef3ff] text-[#1f2430]"
                              : "text-[#2f3747] hover:bg-[#f6f8fd]"
                          }`}
                        >
                          <span className="min-w-0 truncate">{doc.title}</span>
                          {isSelected ? <Check className="h-4 w-4 shrink-0 text-[#32405f]" /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div ref={optionsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setShowOptionsMenu((value) => !value);
                setShowAddMenu(false);
                setShowVaultMenu(false);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e2e5ec] bg-white px-4 text-sm font-medium text-[#2f3747] hover:bg-[#f8f9fc]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {optionsLabel}
              <ChevronDown className="h-4 w-4 text-[#697185]" />
            </button>
            {showOptionsMenu ? (
              <div className="absolute bottom-14 left-0 z-30 w-52 rounded-2xl border border-[#e2e6ef] bg-white p-1 shadow-[0_10px_30px_rgba(16,24,40,0.12)]">
                <button
                  type="button"
                  onClick={() => applyOption("research")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Switch to Research
                </button>
                <button
                  type="button"
                  onClick={() => applyOption("chat")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Switch to Chat
                </button>
                <button
                  type="button"
                  onClick={() => applyOption("fact-check")}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#2f3747] hover:bg-[#f6f8fd]"
                >
                  Fact-check focus
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex h-11 items-center rounded-full border border-[#e2e5ec] bg-white p-1">
            {(["Chat", "Research"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={activeMode === mode}
                onClick={() => {
                  setActiveMode(mode);
                  onModeChange?.(mode);
                  setShowAddMenu(false);
                  setShowOptionsMenu(false);
                  setShowVaultMenu(false);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeMode === mode
                    ? "bg-[#0f172a] text-white"
                    : "text-[#384152] hover:bg-[#f4f6fb]"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing || !input.trim()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#0e1320] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Suggestions */}
      {variant === "default" && showSuggestions && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUGGESTIONS.map((s) => (
            <SuggestionChip
              key={s.id}
              label={s.label}
              icon={s.icon}
              onClick={() => {
                setInput(s.label);
                textareaRef.current?.focus();
              }}
            />
          ))}
        </div>
      )}

      {/* Slash command autocomplete menu */}
      {showSlashMenu && (
        <div
          ref={menuRef}
          className="rounded-lg border border-border bg-card shadow-lg overflow-hidden"
        >
          {filteredTools.map((tool, idx) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.command}
                onClick={() => selectSlashCommand(tool)}
                onMouseEnter={() => setSelectedSlashIdx(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  idx === selectedSlashIdx
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono">
                      {tool.command}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {tool.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 truncate">
                    {tool.description}
                  </p>
                </div>
              </button>
            );
          })}
          <div className="border-t border-border px-4 py-1.5 text-xs text-muted-foreground/50">
            <kbd className="font-mono">Tab</kbd> to select &middot;{" "}
            <kbd className="font-mono">Esc</kbd> to dismiss
          </div>
        </div>
      )}

      {/* Input */}
      {variant === "modern" ? (
        compact ? renderModernCompactInput() : renderModernInput()
      ) : (
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Julian anything about your GTM... (type / for commands)"
            disabled={isProcessing}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          />
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || !input.trim()}
            size="icon"
            className="h-11 w-11 shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
