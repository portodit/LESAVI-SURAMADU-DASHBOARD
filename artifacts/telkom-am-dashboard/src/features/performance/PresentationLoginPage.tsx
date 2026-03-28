import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, CreditCard } from "lucide-react";
import { storePresentationSession, getPresentationSession } from "@/shared/hooks/use-presentation-auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export default function PresentationLoginPage() {
  const [nik, setNik] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (getPresentationSession()) {
      setLocation("/presentation");
    }
  }, [setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedNik = nik.trim();
    if (!trimmedNik) {
      setError("NIK tidak boleh kosong.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/am`);
      if (!res.ok) throw new Error("Gagal mengambil data");
      const data: any[] = await res.json();
      const found = data.find((row: any) => row.nik && String(row.nik).trim() === trimmedNik);
      if (!found) {
        setError("NIK tidak ditemukan. Pastikan NIK Anda sudah terdaftar di sistem.");
        setIsLoading(false);
        return;
      }
      storePresentationSession(found.nik, found.nama ?? trimmedNik);
      setLocation("/presentation");
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "linear-gradient(90deg, #f6f7f9 0%, #f6f7f9 100%)" }}>

      {/* ── Left panel: Form ── */}
      <div className="relative z-10 flex w-full flex-col justify-center bg-white px-10 py-12 lg:w-[42%] xl:w-[40%] overflow-y-auto">
        <div className="mx-auto w-full max-w-[418px]">

          {/* Logo + Brand */}
          <div className="mb-10 flex items-center gap-3.5">
            <img
              src={`${import.meta.env.BASE_URL}logo-tr3.png`}
              alt="Logo TR3"
              className="h-14 object-contain shrink-0"
            />
            <div className="flex flex-col leading-tight">
              <p
                className="text-[18px] font-bold text-[#101828] tracking-[-0.45px]"
                style={{ fontFamily: "'Montserrat', sans-serif", lineHeight: "24.75px" }}
              >
                LESA VI · WITEL SURAMADU
              </p>
              <p
                className="text-[11px] font-semibold tracking-[1.65px] uppercase text-[#cc0000]"
                style={{ fontFamily: "'Inter', sans-serif", lineHeight: "13.75px" }}
              >
                Monitoring Dashboard
              </p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1
              className="text-[30px] font-bold text-[#101828] tracking-[-0.75px] leading-9 mb-1.5"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              Lihat Performa Anda
            </h1>
            <p className="text-sm text-[#6a7282] tracking-[-0.16px] leading-5">
              Masukkan NIK Anda untuk mengakses laporan performa dan pencapaian target penjualan.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-2xl">
                {error}
              </div>
            )}

            {/* NIK */}
            <div className="flex flex-col gap-[2.5px] pt-[5.5px]">
              <label
                className="text-[12px] font-semibold text-[#4a5565] uppercase tracking-[0.6px]"
                style={{ fontFamily: "'Inter', sans-serif", lineHeight: "16px" }}
              >
                NIK
              </label>
              <div className="relative">
                <CreditCard className="absolute left-[14px] top-1/2 -translate-y-1/2 h-4 w-4 text-[#99a1af]" />
                <input
                  type="text"
                  required
                  autoComplete="off"
                  inputMode="numeric"
                  value={nik}
                  onChange={e => setNik(e.target.value)}
                  placeholder="Masukkan NIK Anda"
                  className="w-full bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl py-[14px] pl-[42px] pr-4 text-sm text-[#101828] placeholder:text-[#99a1af] outline-none focus:border-[#cc0000] focus:ring-4 focus:ring-red-50 transition-all"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ boxShadow: "0px 10px 15px -3px #ffc9c9, 0px 4px 6px -4px #ffc9c9" }}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="relative w-full flex items-center justify-center gap-2 bg-[#cc0000] hover:bg-[#b50000] active:scale-[0.98] text-white rounded-2xl py-[14px] px-4 text-sm font-bold tracking-[-0.16px] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Memverifikasi...</>
                ) : (
                  "Lihat Dashboard Saya"
                )}
              </button>
            </div>
          </form>

          {/* Footer */}
          <p
            className="mt-12 text-[12px] text-[#99a1af] text-center tracking-[-0.16px]"
            style={{ fontFamily: "'Inter', sans-serif", lineHeight: "16px" }}
          >
            © 2026 Large Enterprise Service Area VI Witel Suramadu Telkom Indonesia
          </p>
        </div>
      </div>

      {/* ── Right panel: Image with overlay ── */}
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <img
          src={`${import.meta.env.BASE_URL}login-bg.jpg`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ left: "-7.74%", width: "115.47%" }}
        />
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(204, 0, 0, 0.7)", mixBlendMode: "multiply" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)"
          }}
        />
      </div>

    </div>
  );
}
