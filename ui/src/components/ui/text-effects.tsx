"use client";

import { cn } from "@/lib/utils";

interface TextShimmerProps {
  children: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

export function TextShimmer({ 
  children, 
  className,
  as: Component = "span" 
}: TextShimmerProps) {
  return (
    <Component
      className={cn(
        "inline-block",
        "bg-gradient-to-r from-primary via-info to-primary",
        "bg-[length:200%_100%]",
        "bg-clip-text text-transparent",
        "animate-shimmer",
        className
      )}
    >
      {children}
    </Component>
  );
}

// Animated dots for loading states
interface LoadingDotsProps {
  className?: string;
}

export function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" 
        style={{ animationDelay: "0ms" }} 
      />
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" 
        style={{ animationDelay: "150ms" }} 
      />
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" 
        style={{ animationDelay: "300ms" }} 
      />
    </span>
  );
}

// Typing indicator with cursor
interface TypingIndicatorProps {
  text: string;
  className?: string;
  showCursor?: boolean;
}

export function TypingIndicator({ 
  text, 
  className,
  showCursor = true 
}: TypingIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="text-primary">{text}</span>
      {showCursor && (
        <span className="ml-0.5 h-4 w-0.5 bg-primary animate-pulse" />
      )}
    </span>
  );
}

// Fade in text animation
interface FadeInTextProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FadeInText({ 
  children, 
  className,
  delay = 0 
}: FadeInTextProps) {
  return (
    <div
      className={cn("animate-fade-in", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Message bubble with shimmer effect for AI
interface AIMessageProps {
  children: React.ReactNode;
  isThinking?: boolean;
  className?: string;
}

export function AIMessage({ 
  children, 
  isThinking = false,
  className 
}: AIMessageProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl rounded-tl-sm bg-muted/50 border border-border p-4",
        className
      )}
    >
      {isThinking ? (
        <div className="flex items-center gap-2">
          <TextShimmer>Thinking</TextShimmer>
          <LoadingDots />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// Suggestion chips for campaign creation
interface SuggestionChipProps {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function SuggestionChip({ 
  label, 
  onClick, 
  icon,
  className 
}: SuggestionChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2",
        "rounded-full border border-border bg-muted/50",
        "text-sm font-medium text-foreground",
        "hover:bg-primary/10 hover:border-primary/30 hover:text-primary",
        "transition-all duration-200",
        className
      )}
    >
      {icon && <span className="text-primary">{icon}</span>}
      {label}
    </button>
  );
}

// Template card for saved campaign templates
interface TemplateCardProps {
  name: string;
  description: string;
  industry: string;
  persona: string;
  framework: string;
  performance?: {
    replyRate: number;
    positiveRate: number;
  };
  onUse?: () => void;
  onSave?: () => void;
  className?: string;
}

export function TemplateCard({
  name,
  description,
  industry,
  persona,
  framework,
  performance,
  onUse,
  onSave,
  className,
}: TemplateCardProps) {
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-4",
        "hover:border-primary/30 transition-all duration-200",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-foreground">{name}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {performance && (
          <div className="text-right">
            <div className="text-lg font-bold text-success">
              {performance.replyRate}%
            </div>
            <div className="text-xs text-muted-foreground">reply rate</div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {industry}
        </span>
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {persona}
        </span>
        <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-medium">
          {framework}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onUse}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Use Template
        </button>
        <button
          onClick={onSave}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
