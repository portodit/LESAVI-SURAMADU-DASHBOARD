import React, { createContext, useContext, useEffect } from "react";
import { useGetMe, useLogin, useLogout, type AuthResponse, type LoginBody } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/shared/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: AuthResponse | null;
  isLoading: boolean;
  login: (data: LoginBody) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: user, isLoading: isUserLoading, refetch } = useGetMe({
    query: {
      retry: false,
      staleTime: Infinity,
    }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = async (data: LoginBody) => {
    try {
      await loginMutation.mutateAsync({ data });
      await refetch();
      toast({ title: "Login berhasil", description: "Selamat datang kembali.", variant: "success" });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ 
        title: "Login gagal", 
        description: err.error || "Email atau password salah", 
        variant: "destructive" 
      });
      throw err;
    }
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
      // Hapus semua cache query agar user data tidak tersimpan stale
      queryClient.clear();
      setLocation("/login");
    } catch (err) {
      toast({ title: "Logout gagal", variant: "destructive" });
    }
  };

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading: isUserLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
