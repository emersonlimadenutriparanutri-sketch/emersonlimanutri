import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Stethoscope, CalendarRange, Users2, Wallet,
  ClipboardList, Sparkles, Settings, ShieldCheck, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: React.ElementType;
  feature?: string;
  somenteAdmin?: boolean;
  fim?: boolean;
}

const menu: ItemMenu[] = [
  { para: "/", rotulo: "Dashboard", icone: LayoutDashboard, fim: true },
  { para: "/consultorio", rotulo: "Consultório", icone: Stethoscope },
  { para: "/consultorio?aba=pacientes", rotulo: "Pacientes", icone: Users2 },
  { para: "/consultorio?aba=financeiro", rotulo: "Financeiro", icone: Wallet },
  { para: "/consultorio?aba=questionarios", rotulo: "Questionários", icone: ClipboardList },
  { para: "/agenda", rotulo: "Torre de Controle", icone: CalendarRange },
  { para: "/ia", rotulo: "Área de IA", icone: Sparkles, feature: "ia" },
  { para: "/admin", rotulo: "Administração", icone: ShieldCheck, somenteAdmin: true },
  { para: "/configuracoes", rotulo: "Configurações", icone: Settings },
];

export function Sidebar({
  recolhida,
  aoAlternar,
  aoNavegar,
}: {
  recolhida: boolean;
  aoAlternar: () => void;
  aoNavegar?: () => void;
}) {
  const { isAdmin, features, perfil } = useAuth();
  const location = useLocation();

  const visiveis = menu.filter((i) => {
    if (i.somenteAdmin && !isAdmin) return false;
    // Sem registro em user_features, o módulo fica visível por padrão.
    if (i.feature && features.length > 0 && !features.includes(i.feature)) return false;
    return true;
  });

  const ativo = (item: ItemMenu) => {
    const [caminho, busca] = item.para.split("?");
    if (location.pathname !== caminho) return false;
    if (!busca) return item.fim ? location.search === "" || !location.search.includes("aba=") : true;
    return location.search.includes(busca);
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200",
        recolhida ? "w-[68px]" : "w-64",
      )}
    >
      <div className={cn("flex items-center gap-3 px-4 py-5", recolhida && "justify-center px-0")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-xs font-semibold text-primary-foreground">
          {brand.iniciais}
        </div>
        {!recolhida && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold leading-tight">{brand.nome}</p>
            <p className="truncate text-[11px] text-muted-foreground">{brand.tagline}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {visiveis.map((item) => {
          const Icone = item.icone;
          const link = (
            <NavLink
              key={item.para}
              to={item.para}
              onClick={aoNavegar}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                recolhida && "justify-center px-0",
                ativo(item)
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icone className="h-[18px] w-[18px] shrink-0" />
              {!recolhida && <span className="truncate">{item.rotulo}</span>}
            </NavLink>
          );

          return recolhida ? (
            <Tooltip key={item.para} delayDuration={200}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.rotulo}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={aoAlternar}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
            recolhida && "justify-center px-0",
          )}
        >
          {recolhida ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!recolhida && <span>Recolher menu</span>}
        </button>
        {!recolhida && perfil?.nome && (
          <p className="mt-2 px-3 text-[11px] text-muted-foreground">
            Conectado como <span className="font-medium text-foreground">{perfil.nome}</span>
          </p>
        )}
      </div>
    </aside>
  );
}
