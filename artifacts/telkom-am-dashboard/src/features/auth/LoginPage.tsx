import React, { useState } from "react";
import { useAuth } from "@/shared/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Eye, EyeOff, Lock, User } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { login, user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (user && !isAuthLoading) {
      setLocation("/dashboard");
    }
  }, [user, isAuthLoading, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login({ email, password });
    } catch {
      setError("Email atau password salah. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthLoading) return null;

  return (
    <div className="min-h-screen w-full flex font-sans">

      {/* ─── Left: Form Panel ──────────────────────────────── */}
      <div className="relative z-10 flex flex-col justify-center w-full lg:w-[45%] xl:w-[40%] bg-white px-8 sm:px-12 xl:px-16 py-12 shrink-0">

        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}logo-tr3.png`}
              alt="Logo TR3"
              className="h-9 object-contain"
            />
            <div className="leading-none">
              <p className="text-[10px] font-black tracking-[0.2em] text-[#cc0000] uppercase">LESA VI · WITEL SURAMADU</p>
              <p className="text-base font-display font-bold text-gray-900 tracking-tight">AM Performance Dashboard</p>
            </div>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-1.5">Masuk</h1>
          <p className="text-sm text-gray-500">Selamat datang kembali. Masukkan kredensial Anda.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@telkom.co.id"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#cc0000] focus:ring-4 focus:ring-red-50 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-11 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#cc0000] focus:ring-4 focus:ring-red-50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-[#cc0000] hover:bg-[#b50000] active:scale-[0.98] shadow-lg shadow-red-200 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Masuk...</>
            ) : (
              "Masuk ke Dashboard"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-12 text-xs text-gray-400 text-center">
          &copy; {new Date().getFullYear()} Telkom Indonesia · TREG 3 Suramadu · LESA VI
        </p>
      </div>

      {/* ─── Right: Photo Panel ────────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">

        {/* Background Photo */}
        <img
          src={`${import.meta.env.BASE_URL}telkom-building.webp`}
          alt="Gedung Telkom Indonesia"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />

        {/* Top badge */}
        <div className="absolute top-8 left-8 right-8 flex items-center justify-between">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2">
            <p className="text-white/90 text-xs font-semibold tracking-widest uppercase">Telkom Indonesia · TREG 3</p>
          </div>
        </div>

        {/* Bottom branding text */}
        <div className="absolute bottom-0 left-0 right-0 p-10">
          <div className="max-w-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-0.5 bg-[#cc0000]" />
              <span className="text-white/70 text-xs font-bold uppercase tracking-[0.2em]">Witel Suramadu · LESA VI</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-display font-bold text-white leading-tight mb-3">
              Pantau Performa.<br />Raih Target.
            </h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Dashboard terpadu untuk monitoring Account Manager — revenue, funneling, activity, dan reminder otomatis via Telegram.
            </p>

            {/* Stats row */}
            <div className="flex items-center gap-6 mt-8">
              {[
                { label: "Account Manager", value: "30+" },
                { label: "Divisi Aktif", value: "4" },
                { label: "Update Real-time", value: "✓" },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-2xl font-display font-bold text-white">{stat.value}</p>
                  <p className="text-white/60 text-xs mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
