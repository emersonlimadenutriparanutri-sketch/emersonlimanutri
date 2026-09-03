import * as React from "react";
import { cn } from "@/lib/utils";

export const Progress = ({
  value = 0,
  className,
  indicatorClassName,
}: { value?: number; className?: string; indicatorClassName?: string }) => (
  <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
    <div
      className={cn("h-full rounded-full bg-secondary transition-all", indicatorClassName)}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);
