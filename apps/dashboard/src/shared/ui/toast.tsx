import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react"

import { cn } from "@/shared/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-5 right-5 z-[100] flex flex-col gap-3 w-full max-w-[420px] outline-none",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-2xl",
    "ring-1",
    "transition-all duration-300",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[swipe=end]:animate-out data-[swipe=move]:transition-none",
    "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-full",
    "data-[state=open]:slide-in-from-right-full",
    "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-blue-100/80 ring-blue-300/60 shadow-xl shadow-blue-300/40 dark:bg-blue-950/50 dark:ring-blue-700/50 dark:shadow-blue-900/40",
        success:
          "bg-emerald-100/80 ring-emerald-300/60 shadow-xl shadow-emerald-300/40 dark:bg-emerald-950/50 dark:ring-emerald-700/50 dark:shadow-emerald-900/40",
        warning:
          "bg-amber-100/80 ring-amber-300/60 shadow-xl shadow-amber-300/40 dark:bg-amber-950/50 dark:ring-amber-700/50 dark:shadow-amber-900/40",
        error:
          "bg-red-100/80 ring-red-300/60 shadow-xl shadow-red-300/40 dark:bg-red-950/50 dark:ring-red-700/50 dark:shadow-red-900/40",
        destructive:
          "bg-red-100/80 ring-red-300/60 shadow-xl shadow-red-300/40 dark:bg-red-950/50 dark:ring-red-700/50 dark:shadow-red-900/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export const TOAST_ICONS: Record<string, React.ElementType> = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  destructive: XCircle,
}

export const TOAST_ICON_BG: Record<string, string> = {
  default:  "bg-blue-500",
  success:  "bg-emerald-500",
  warning:  "bg-amber-500",
  error:    "bg-red-500",
  destructive: "bg-red-500",
}

export const TOAST_PROGRESS_COLORS: Record<string, string> = {
  default:     "bg-blue-400",
  success:     "bg-emerald-400",
  warning:     "bg-amber-400",
  error:       "bg-red-400",
  destructive: "bg-red-400",
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "rounded-lg p-1.5 text-zinc-400 transition-all hover:text-zinc-600 hover:bg-black/5 focus:opacity-100 focus:outline-none",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-base font-bold text-zinc-800 dark:text-zinc-100 leading-snug", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mt-0.5", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
