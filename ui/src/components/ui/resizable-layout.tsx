"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultSize?: number; // percentage
  minSize?: number; // pixels
  maxSize?: number; // pixels
  className?: string;
}

interface ResizableHandleProps {
  onResize: (delta: number) => void;
  direction?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Resizable Handle Component
 * Drag to resize panels
 */
export function ResizableHandle({
  onResize,
  direction = "horizontal",
  className,
}: ResizableHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  return (
    <div
      className={cn(
        "relative flex-shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors",
        direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        isDragging && "bg-primary/30",
        className
      )}
      onMouseDown={handleMouseDown}
    >
      <div
        className={cn(
          "absolute bg-border hover:bg-primary/50 transition-colors",
          direction === "horizontal"
            ? "left-1/2 top-0 h-full w-px -translate-x-1/2"
            : "left-0 top-1/2 h-px w-full -translate-y-1/2"
        )}
      />
    </div>
  );
}

/**
 * Resizable Panel Container
 */
export function ResizablePanel({
  children,
  defaultSize = 250,
  minSize = 200,
  maxSize = 500,
  className,
}: ResizablePanelProps) {
  const [size, setSize] = useState(defaultSize);

  const handleResize = useCallback(
    (delta: number) => {
      setSize((prev) => {
        const newSize = prev + delta;
        return Math.max(minSize, Math.min(maxSize, newSize));
      });
    },
    [minSize, maxSize]
  );

  return (
    <div
      className={cn("flex-shrink-0 overflow-hidden", className)}
      style={{ width: size }}
    >
      {children}
    </div>
  );
}

/**
 * Three-pane resizable layout
 * 
 * Usage:
 * ```tsx
 * <ThreePaneLayout
 *   left={<FolderSidebar />}
 *   middle={<DocumentEditor />}
 *   right={<ChatPanel />}
 *   defaultLeftWidth={280}
 *   defaultRightWidth={340}
 * />
 * ```
 */
interface ThreePaneLayoutProps {
  left: React.ReactNode;
  middle: React.ReactNode;
  right?: React.ReactNode;
  defaultLeftWidth?: number;
  defaultRightWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  maxLeftWidth?: number;
  maxRightWidth?: number;
}

export function ThreePaneLayout({
  left,
  middle,
  right,
  defaultLeftWidth = 280,
  defaultRightWidth = 340,
  minLeftWidth = 200,
  minRightWidth = 280,
  maxLeftWidth = 400,
  maxRightWidth = 500,
}: ThreePaneLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [rightWidth, setRightWidth] = useState(defaultRightWidth);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeLeft = useCallback(
    (delta: number) => {
      setLeftWidth((prev) => Math.max(minLeftWidth, Math.min(maxLeftWidth, prev + delta)));
    },
    [minLeftWidth, maxLeftWidth]
  );

  const handleResizeRight = useCallback(
    (delta: number) => {
      // For right panel, negative delta increases width
      setRightWidth((prev) => Math.max(minRightWidth, Math.min(maxRightWidth, prev - delta)));
    },
    [minRightWidth, maxRightWidth]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full min-h-0 overflow-hidden",
        (isResizingLeft || isResizingRight) && "select-none"
      )}
    >
      {/* Left Panel */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ width: leftWidth }}
      >
        {left}
      </div>

      {/* Left Resize Handle */}
      <ResizableHandle
        onResize={handleResizeLeft}
        onResizeStart={() => setIsResizingLeft(true)}
        onResizeEnd={() => setIsResizingLeft(false)}
      />

      {/* Middle Panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {middle}
      </div>

      {/* Right Resize Handle */}
      {right && (
        <>
          <ResizableHandle
            onResize={handleResizeRight}
            onResizeStart={() => setIsResizingRight(true)}
            onResizeEnd={() => setIsResizingRight(false)}
          />

          {/* Right Panel */}
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{ width: rightWidth }}
          >
            {right}
          </div>
        </>
      )}
    </div>
  );
}

// Helper components for resize handle with callbacks
interface ResizableHandleWithCallbacksProps extends ResizableHandleProps {
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

function ResizableHandle({
  onResize,
  onResizeStart,
  onResizeEnd,
  direction = "horizontal",
  className,
}: ResizableHandleWithCallbacksProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);
  const lastDelta = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      onResizeStart?.();
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      lastDelta.current = 0;
    },
    [direction, onResizeStart]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      const deltaChange = delta - lastDelta.current;
      lastDelta.current = delta;
      onResize(deltaChange);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onResizeEnd?.();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, direction, onResize, onResizeEnd]);

  return (
    <div
      className={cn(
        "relative flex-shrink-0 group",
        direction === "horizontal" ? "w-4 -mx-2 cursor-col-resize" : "h-4 -my-2 cursor-row-resize",
        className
      )}
      onMouseDown={handleMouseDown}
    >
      <div
        className={cn(
          "absolute bg-border group-hover:bg-primary/30 transition-colors",
          direction === "horizontal"
            ? "left-1/2 top-0 h-full w-px -translate-x-1/2"
            : "left-0 top-1/2 h-px w-full -translate-y-1/2",
          isDragging && "bg-primary/50"
        )}
      />
    </div>
  );
}
