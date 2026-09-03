import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/app-layout";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { supabaseConfigurado } from "@/lib/supabase";

import Setup from "@/pages/Setup";
import Entrar from "@/pages/Entrar";
import AguardandoAprovacao from "@/pages/AguardandoAprovacao";
import Dashboard from "@/pages/Dashboard";
import Consultorio from "@/pages/Consultorio";
import CentralPaciente from "@/pages/CentralPaciente";
import TorreDeControle from "@/pages/TorreDeControle";
import AreaIA from "@/pages/AreaIA";
import Configuracoes from "@/pages/Configuracoes";
import Admin from "@/pages/Admin";
import QuestionarioPublico from "@/pages/QuestionarioPublico";
import NaoEncontrado from "@/pages/NaoEncontrado";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-secondary" />
    </div>
  );
}

function RotaPrivada({ children }: { children: React.ReactNode }) {
  const { session, perfil, carregando } = useAuth();
  if (carregando) return <Carregando />;
  if (!session) return <Navigate to="/entrar" replace />;
  // Todo cadastro entra pendente: só um admin libera o acesso.
  if (perfil && !perfil.aprovado) return <Navigate to="/aguardando" replace />;
  return <>{children}</>;
}

/**
 * Data router (createBrowserRouter), não <BrowserRouter>: é o que habilita
 * o useBlocker da guarda de alterações não salvas.
 */
const rotas = createBrowserRouter([
  { path: "/entrar", element: <Entrar /> },
  { path: "/aguardando", element: <AguardandoAprovacao /> },
  { path: "/q/:token", element: <QuestionarioPublico /> },
  {
    element: (
      <RotaPrivada>
        <AppLayout />
      </RotaPrivada>
    ),
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/consultorio", element: <Consultorio /> },
      { path: "/paciente/:id", element: <CentralPaciente /> },
      { path: "/agenda", element: <TorreDeControle /> },
      { path: "/ia", element: <AreaIA /> },
      { path: "/configuracoes", element: <Configuracoes /> },
      { path: "/admin", element: <Admin /> },
    ],
  },
  { path: "*", element: <NaoEncontrado /> },
]);

export default function App() {
  if (!supabaseConfigurado) return <Setup />;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={rotas} />
            <Toaster
              position="top-right"
              richColors
              closeButton
              toastOptions={{ className: "font-sans text-sm" }}
            />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
