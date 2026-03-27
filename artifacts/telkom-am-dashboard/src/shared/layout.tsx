import React from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/shared/hooks/use-auth";
import { useImportGuard } from "@/shared/hooks/use-import-guard";
import { cn } from "@/shared/lib/utils";
import {
  LayoutDashboard, Upload, BarChart2, Filter, Activity,
  Users, MessageSquare, Settings, LogOut, ChevronDown,
  Menu, X, Code2, Copy, Check, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Embed Modal ───────────────────────────────────────────────────────────────
function EmbedModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const baseUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "";
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const embedUrl = `${baseUrl}${basePath}/presentation`;
  const iframeCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  allowfullscreen\n  style="border:none; border-radius:12px;"\n></iframe>`;

  function handleCopy() {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Embed ke Canva / Website</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canva instructions */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5">Cara embed di Canva:</p>
          <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Di Canva, klik <strong>Embed</strong> → pilih <strong>Embed code</strong> (bukan URL)</li>
            <li>Salin kode HTML di bawah, lalu tempel ke kolom embed</li>
            <li>Klik <strong>Done / Selesai</strong></li>
          </ol>
          <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-2">⚠️ Gunakan fitur <em>Embed code</em>, bukan URL langsung — Canva membatasi domain yang bisa di-embed via URL.</p>
        </div>

        <p className="text-xs text-muted-foreground mb-2">Kode HTML iframe (tidak perlu login):</p>
        <div className="bg-secondary/60 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all mb-3 max-h-36 overflow-y-auto border border-border">
          {iframeCode}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
          >
            {copied
              ? <><Check className="w-3.5 h-3.5" /> Disalin!</>
              : <><Copy className="w-3.5 h-3.5" /> Salin Kode</>}
          </button>
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-lg bg-secondary border border-border text-xs font-semibold flex items-center gap-1.5 hover:bg-secondary/80 transition-colors text-foreground"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Buka Preview
          </a>
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import", label: "Import Data", icon: Upload },
  {
    label: "Visualisasi", icon: BarChart2,
    children: [
      { href: "/visualisasi/performa", label: "Performa AM", icon: BarChart2, pageTitle: "Performansi Account Manager LESA VI WITEL SURAMADU" },
      { href: "/visualisasi/funnel", label: "Sales Funnel", icon: Filter, pageTitle: "Sales Funneling LOP MYTENS LESA VI Witel Suramadu" },
      { href: "/visualisasi/activity", label: "Sales Activity", icon: Activity, pageTitle: "AM Sales Activity Report · LESA VI Witel Suramadu" },
    ]
  },
  { href: "/am", label: "Manajemen AM", icon: Users },
  { href: "/telegram", label: "Kirim Telegram", icon: MessageSquare },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
];

const SIDEBAR_W = 224;
const SIDEBAR_COLLAPSED = 56;

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { isImporting, setIsImporting } = useImportGuard();
  const [visOpen, setVisOpen] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [showEmbed, setShowEmbed] = React.useState(false);
  const [guardTarget, setGuardTarget] = React.useState<string | null>(null);

  function guardNav(href: string, extra?: () => void) {
    if (isImporting) { setGuardTarget(href); return; }
    extra?.();
    navigate(href);
  }

  const isPerformaPage = location === "/visualisasi/performa" || location.startsWith("/visualisasi/performa");

  if (!user) return null;

  const currentNavItem = NAV_ITEMS.flatMap(i => [i, ...(i.children || [])]).find(i => (i as any).href === location) as any;
  const currentLabel = currentNavItem?.pageTitle || currentNavItem?.label || "Dashboard";

  const SidebarInner = ({ isMobile = false }) => (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className={cn(
        "h-[60px] flex items-center shrink-0 border-b border-border",
        collapsed && !isMobile ? "px-0 justify-center" : "px-4 gap-2.5"
      )}>
        <button
          onClick={() => !isMobile && setCollapsed(prev => !prev)}
          title={!isMobile ? (collapsed ? "Perluas sidebar" : "Ciutkan sidebar") : undefined}
          className={cn(
            "flex items-center min-w-0",
            !isMobile && "cursor-pointer group",
            collapsed && !isMobile ? "gap-0" : "gap-2.5"
          )}
        >
          <img
            src={`${import.meta.env.BASE_URL}logo-tr3.png`}
            alt="Logo"
            className={cn("h-7 object-contain shrink-0 transition-opacity", !isMobile && "group-hover:opacity-70")}
          />
          <AnimatePresence initial={false}>
            {(!collapsed || isMobile) && (
              <motion.div
                key="label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap text-left"
              >
                <p className="text-[13px] font-display font-bold text-foreground leading-none tracking-tight">LESA VI SURAMADU</p>
                <p className="text-[9px] font-bold text-muted-foreground tracking-widest leading-none mt-0.5">TELKOM REGIONAL 3</p>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 py-3 overflow-y-auto", collapsed && !isMobile ? "px-1.5 space-y-0.5" : "px-2.5 space-y-0.5")}>
        {NAV_ITEMS.map((item, idx) => {
          if (item.children) {
            const isChildActive = item.children.some(c => location.startsWith(c.href));

            // ── Collapsed: show only child icons, no parent button (fixes duplicate icon bug)
            if (collapsed && !isMobile) {
              return (
                <div key={idx} className="space-y-0.5 pb-0.5">
                  {/* Thin divider instead of parent button */}
                  <div className="mx-2 my-1 h-px bg-border/60" />
                  {item.children.map(child => {
                    const isActive = location.startsWith(child.href);
                    return (
                      <a key={child.href} href={child.href}
                        title={child.label}
                        onClick={e => { e.preventDefault(); guardNav(child.href); }}
                        className={cn(
                          "flex justify-center items-center py-2.5 rounded-xl transition-all duration-150 cursor-pointer",
                          isActive
                            ? "bg-primary text-white shadow-sm shadow-primary/30"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        )}
                      >
                        <child.icon className="w-4 h-4" />
                      </a>
                    );
                  })}
                  <div className="mx-2 my-1 h-px bg-border/60" />
                </div>
              );
            }

            // ── Expanded: show parent toggle + animated sub-items
            return (
              <div key={idx}>
                <button
                  onClick={() => setVisOpen(!visOpen)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                    isChildActive
                      ? "text-primary bg-primary/10 font-medium"
                      : "text-foreground/70 hover:text-foreground hover:bg-secondary/70"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0", visOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {(visOpen || isChildActive) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-9 pr-1.5 pt-1 pb-1 space-y-0.5">
                        {item.children.map(child => {
                          const isActive = location.startsWith(child.href);
                          return (
                            <a key={child.href} href={child.href}
                              onClick={e => { e.preventDefault(); guardNav(child.href, () => setMobileOpen(false)); }}
                              className={cn(
                                "block px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer",
                                isActive
                                  ? "bg-primary text-white shadow-sm shadow-primary/25 font-medium"
                                  : "text-foreground/65 hover:text-primary hover:bg-primary/8"
                              )}
                            >
                              {child.label}
                            </a>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          const isActive = location === (item as any).href;
          return (
            <a key={(item as any).href} href={(item as any).href}
              onClick={e => { e.preventDefault(); guardNav((item as any).href, () => setMobileOpen(false)); }}
              title={collapsed && !isMobile ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                collapsed && !isMobile ? "justify-center" : "",
                isActive
                  ? "bg-primary text-white shadow-md shadow-primary/25 font-medium"
                  : "text-foreground/70 hover:text-foreground hover:bg-secondary/70"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {/* User + collapse toggle area */}
      <div className={cn("shrink-0 border-t border-border py-3", collapsed && !isMobile ? "px-1.5" : "px-2.5")}>

        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 bg-secondary/50 border border-border/50">
            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-[11px] text-primary shrink-0">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">Admin TR3</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          title={collapsed && !isMobile ? "Logout" : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors",
            collapsed && !isMobile ? "justify-center" : "justify-start"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Keluar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex font-sans">
      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_W }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="hidden md:flex flex-col shrink-0 overflow-hidden z-20 border-r border-border h-screen sticky top-0"
        style={{ background: "hsl(var(--sidebar))" }}
      >
        <SidebarInner />
      </motion.aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -SIDEBAR_W }}
            animate={{ x: 0 }}
            exit={{ x: -SIDEBAR_W }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-0 top-0 h-full z-40 md:hidden overflow-hidden flex flex-col border-r border-border"
            style={{ width: SIDEBAR_W, background: "hsl(var(--sidebar))" }}
          >
            <SidebarInner isMobile />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-card border-b border-border flex items-center px-5 gap-3 shrink-0 sticky top-0 z-10 shadow-sm">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-sm font-display font-bold text-foreground flex-1">{currentLabel}</h1>

          {/* Embed Code button — only on Performa page */}
          {isPerformaPage && (
            <button
              onClick={() => setShowEmbed(true)}
              className="h-8 px-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Code2 className="w-3.5 h-3.5" /> Embed Code
            </button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="max-w-[1400px] mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>

      {/* Embed Code Modal (triggered from topbar) */}
      {showEmbed && <EmbedModal onClose={() => setShowEmbed(false)} />}

      {/* Import Guard Dialog */}
      {guardTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <span className="text-lg">⚠️</span>
              </div>
              <div>
                <p className="font-display font-bold text-foreground text-[15px] leading-snug">Import sedang berjalan</p>
                <p className="text-sm text-muted-foreground mt-1">Proses import masih aktif di background. Pindah halaman sekarang tidak membatalkan proses di server, tapi kamu akan kehilangan status progresnya.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setGuardTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
              >
                Tetap di halaman
              </button>
              <button
                onClick={() => {
                  const dest = guardTarget;
                  setGuardTarget(null);
                  setIsImporting(false);
                  navigate(dest);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors"
              >
                Pindah halaman
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
