"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Filter,
  MoreHorizontal,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Natural language filter result
interface NLFilterResult {
  column?: string;
  operator: "equals" | "contains" | "greaterThan" | "lessThan" | "between" | "in";
  value: any;
  secondaryValue?: any; // For "between" operator
}

interface AgenticTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  onNaturalLanguageFilter?: (query: string) => Promise<NLFilterResult | null>;
  savedViews?: SavedView[];
  onSaveView?: (name: string, filters: ColumnFiltersState) => void;
  onLoadView?: (view: SavedView) => void;
}

interface SavedView {
  id: string;
  name: string;
  filters: ColumnFiltersState;
  sortBy?: SortingState;
}

/**
 * Agentic Table Component
 * 
 * Features:
 * - Natural language filtering via AI
 * - Saved views
 * - Column sorting
 * - Pagination
 */
export function AgenticTable<TData>({
  data,
  columns,
  onNaturalLanguageFilter,
  savedViews = [],
  onSaveView,
  onLoadView,
}: AgenticTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [nlQuery, setNlQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAiFilter, setActiveAiFilter] = useState<string | null>(null);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const handleNaturalLanguageQuery = async () => {
    if (!nlQuery.trim() || !onNaturalLanguageFilter) return;

    setIsProcessing(true);
    try {
      const result = await onNaturalLanguageFilter(nlQuery);
      
      if (result && result.column) {
        // Apply the AI-generated filter
        setColumnFilters((prev) => [
          ...prev.filter((f) => f.id !== result.column),
          { id: result.column, value: result.value },
        ]);
        setActiveAiFilter(nlQuery);
      }
    } catch (err) {
      console.error("AI filter failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAiFilter = () => {
    setNlQuery("");
    setActiveAiFilter(null);
    setColumnFilters([]);
  };

  const activeFiltersCount = columnFilters.length + (activeAiFilter ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* AI Filter Bar */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/50">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <Input
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            placeholder="Ask AI to filter... (e.g., 'Show me deals over $10k' or 'Hot leads from last week')"
            className="border-0 bg-transparent focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleNaturalLanguageQuery();
              }
            }}
          />
        </div>
        
        {activeAiFilter && (
          <Button variant="ghost" size="sm" onClick={clearAiFilter}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
        
        <Button
          size="sm"
          onClick={handleNaturalLanguageQuery}
          disabled={isProcessing || !nlQuery.trim()}
        >
          {isProcessing ? (
            <>Processing...</>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1" />
              Filter
            </>
          )}
        </Button>
      </div>

      {/* Active Filters Display */}
      {activeAiFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">AI Filter:" "</span>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">
            {activeAiFilter}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Global Search */}
          <Input
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search all columns..."
            className="max-w-sm"
          />

          {/* Saved Views */}
          {savedViews.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Saved Views
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {savedViews.map((view) => (
                  <DropdownMenuItem key={view.id} onClick={() => onLoadView?.(view)}>
                    {view.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Save View Button */}
          {onSaveView && columnFilters.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const name = prompt("Enter view name:");
                if (name) onSaveView(name, columnFilters);
              }}
            >
              <Save className="h-4 w-4 mr-1" />
              Save View
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} of {data.length} rows
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <table className="w-full">
          <thead className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-sm font-medium"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          header.column.getCanSort() && "cursor-pointer select-none"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <span>
                            {header.column.getIsSorted() === "asc" ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronsUpDown className="h-4 w-4 opacity-50" />
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-t hover:bg-muted/50 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            Last
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
      </div>
    </div>
  );
}

/**
 * Parse natural language filter query
 * 
 * Example queries:
 * - "Show me deals over $10k" → { column: "value", operator: "greaterThan", value: 10000 }
 * - "Hot leads from last week" → { column: "status", operator: "equals", value: "hot" }
 * - "Deals closing this month" → { column: "close_date", operator: "between", value: "2026-02-01", secondaryValue: "2026-02-28" }
 */
export async function parseNaturalLanguageFilter(
  query: string,
  availableColumns: string[]
): Promise<NLFilterResult | null> {
  // This would call an LLM to parse the query
  // For now, return a simple rule-based parser
  
  const lowerQuery = query.toLowerCase();
  
  // Value filters
  if (lowerQuery.includes("over $") || lowerQuery.includes("more than $") || lowerQuery.includes("> $")) {
    const match = query.match(/\$?([\d,]+(?:k)?)/i);
    if (match) {
      let value = parseInt(match[1].replace(/,/g, "").replace(/k/i, "000"));
      return {
        column: availableColumns.find((c) => c.includes("value") || c.includes("amount")) || availableColumns[0],
        operator: "greaterThan",
        value,
      };
    }
  }
  
  // Status filters
  const statusKeywords = ["hot", "warm", "cold", "new", "closed", "won", "lost"];
  for (const status of statusKeywords) {
    if (lowerQuery.includes(status)) {
      return {
        column: availableColumns.find((c) => c.includes("status")) || availableColumns[0],
        operator: "equals",
        value: status,
      };
    }
  }
  
  // Date filters
  if (lowerQuery.includes("last week")) {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      column: availableColumns.find((c) => c.includes("date")) || availableColumns[0],
      operator: "greaterThan",
      value: lastWeek.toISOString().split("T")[0],
    };
  }
  
  if (lowerQuery.includes("this month")) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      column: availableColumns.find((c) => c.includes("date")) || availableColumns[0],
      operator: "between",
      value: startOfMonth.toISOString().split("T")[0],
      secondaryValue: endOfMonth.toISOString().split("T")[0],
    };
  }
  
  return null;
}
