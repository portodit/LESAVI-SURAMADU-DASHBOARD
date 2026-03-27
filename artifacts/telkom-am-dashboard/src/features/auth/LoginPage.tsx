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
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 font-sans px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-10">

        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-3.5">
            <img
              src={`${import.meta.env.BASE_URL}logo-tr3.png`}
              alt="Logo TR3"
              className="h-12 object-contain"
            />
            <div className="leading-tight">
              <p className="text-[11px] font-semibold tracking-[0.15em] text-[#cc0000] uppercase">AM Performance Dashboard</p>
            </div>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-7">
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-1.5">Masuk ke Dashboard</h1>
          <p className="text-sm text-gray-500">Selamat datang kembali. Masukkan kredensial Anda untuk melanjutkan.</p>
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
        <p className="mt-8 text-xs text-gray-400 text-center">
          &copy; {new Date().getFullYear()} Telkom Indonesia · TREG 3 Suramadu · LESA VI
        </p>
      </div>
    </div>
  );
}
