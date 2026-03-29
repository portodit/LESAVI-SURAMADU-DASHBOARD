import React from "react";
import { Pencil, Trash2, Eye, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface RowActionItem {
  type: "edit" | "delete" | "view";
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}

interface RowActionsProps {
  actions: RowActionItem[];
  className?: string;
}

const ACTION_CONFIG = {
  edit: {
    icon: Pencil,
    label: "Edit",
    hover: "hover:text-primary hover:bg-primary/10",
    default: "text-muted-foreground/60",
  },
  delete: {
    icon: Trash2,
    label: "Hapus",
    hover: "hover:text-destructive hover:bg-destructive/10",
    default: "text-muted-foreground/60",
  },
  view: {
    icon: Eye,
    label: "Lihat",
    hover: "hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40",
    default: "text-muted-foreground/60",
  },
} as const;

export function RowActions({ actions, className }: RowActionsProps) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border/50 bg-background shadow-sm overflow-hidden", className)}>
      {actions.map((action, idx) => {
        const cfg = ACTION_CONFIG[action.type];
        const Icon = cfg.icon;
        const label = action.label ?? cfg.label;
        return (
          <React.Fragment key={action.type}>
            {idx > 0 && <div className="w-px self-stretch bg-border/50" />}
            <button
              type="button"
              title={label}
              aria-label={label}
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors duration-150",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                cfg.default,
                !action.disabled && !action.loading && cfg.hover
              )}
            >
              {action.loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Icon className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">{label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
