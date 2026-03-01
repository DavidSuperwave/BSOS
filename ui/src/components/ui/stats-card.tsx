"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    label: string;
    direction: "up" | "down" | "neutral";
  };
  icon?: React.ReactNode;
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  trend,
  icon,
  className,
}: StatsCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-[34px] font-bold leading-none tracking-tight text-foreground">
                {value}
              </h3>
              {trend && (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                    trend.direction === "up" &&
                      "bg-emerald-500/10 text-emerald-600",
                    trend.direction === "down" &&
                      "bg-red-500/10 text-red-600",
                    trend.direction === "neutral" &&
                      "bg-muted text-muted-foreground"
                  )}
                >
                  {trend.direction === "up" && (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  )}
                  {trend.direction === "down" && (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  {trend.direction === "neutral" && (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  <span>{trend.value}%</span>
                </div>
              )}
            </div>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
            {trend?.label && (
              <p className="text-xs text-muted-foreground/90">{trend.label}</p>
            )}
          </div>
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Grid layout for multiple stats cards
interface StatsGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: 2 | 3 | 4;
}

export function StatsGrid({ children, className, columns = 4 }: StatsGridProps) {
  const gridCols = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns], className)}>
      {children}
    </div>
  );
}
