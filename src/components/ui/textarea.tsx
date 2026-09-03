import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea com auto-resize: cresce com o conteúdo e nunca mostra
 * barra de rolagem interna (requisito de UX do app).
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, value, onChange, rows = 3, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const ajustar = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    React.useLayoutEffect(ajustar, [value, ajustar]);

    return (
      <textarea
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }}
        rows={rows}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          ajustar();
        }}
        className={cn(
          "flex w-full overflow-hidden rounded-lg border border-input bg-card px-3 py-2 text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
