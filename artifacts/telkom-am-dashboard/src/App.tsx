import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/shared/ui/toaster";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { AuthProvider, useAuth } from "@/shared/hooks/use-auth";
import { ImportGuardProvider } from "@/shared/hooks/use-import-guard";
import { DashboardLayout } from "@/shared/layout";
import { Loader2 } from "lucide-react";

import Login from "@/features/auth/LoginPage";
import EmbedPerforma from "@/features/performance/PresentationPage";
import PresentationLoginPage from "@/features/performance/PresentationLoginPage";
import { getPresentationSession } from "@/shared/hooks/use-presentation-auth";
import Dashboard from "@/features/dashboard/DashboardPage";
import ImportData from "@/features/import/ImportPage";
import ImportDetail from "@/features/import/ImportDetailPage";
import PerformaVis from "@/features/performance/PerformaPage";
import FunnelVis from "@/features/funnel/FunnelPage";
import ActivityVis from "@/features/activity/ActivityPage";
import TelegramBot from "@/features/telegram/TelegramPage";
import PengaturanPage from "@/features/settings/PengaturanPage";
import ManajemenAmPage from "@/features/am/ManajemenAmPage";
import CorporateCustomerPage from "@/features/corporate/CorporateCustomerPage";

function PublicAmPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <p className="text-lg font-medium text-muted-foreground">Public AM Profile (Dalam Pengembangan)</p>
    </div>
  );
}

function ProtectedApp() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/import" component={ImportData} />
        <Route path="/import/detail/:id">{(params: any) => <ImportDetail params={params} />}</Route>
        <Route path="/visualisasi/performa" component={PerformaVis} />
        <Route path="/visualisasi/funnel" component={FunnelVis} />
        <Route path="/visualisasi/activity" component={ActivityVis} />
        <Route path="/am" component={ManajemenAmPage} />
        <Route path="/corporate-customers" component={CorporateCustomerPage} />
        <Route path="/telegram" component={TelegramBot} />
        <Route path="/pengaturan" component={PengaturanPage} />
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route>
          <div className="p-8 text-center text-muted-foreground">Halaman tidak ditemukan</div>
        </Route>
      </Switch>
    </DashboardLayout>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function PresentationGuard() {
  const session = getPresentationSession();
  if (!session) return <Redirect to="/presentation/login" />;
  return <EmbedPerforma />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/am-public/:slug" component={PublicAmPage} />
      <Route path="/embed/performa" component={EmbedPerforma} />
      <Route path="/presentation/login" component={PresentationLoginPage} />
      <Route path="/presentation" component={PresentationGuard} />
      <Route component={ProtectedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ImportGuardProvider>
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </ImportGuardProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
