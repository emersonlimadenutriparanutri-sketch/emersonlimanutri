import * as React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { LogOut, Menu, User2 } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { iniciais } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { perfil, user, sair } = useAuth();
  const navigate = useNavigate();
  const [recolhida, setRecolhida] = React.useState(
    () => localStorage.getItem("sidebar:recolhida") === "1",
  );
  const [menuMobile, setMenuMobile] = React.useState(false);

  const alternar = () => {
    setRecolhida((v) => {
      localStorage.setItem("sidebar:recolhida", v ? "0" : "1");
      return !v;
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar recolhida={recolhida} aoAlternar={alternar} />
      </div>

      <Dialog open={menuMobile} onOpenChange={setMenuMobile}>
        <DialogContent hideClose className="left-0 top-0 h-full max-w-64 translate-x-0 translate-y-0 rounded-none rounded-r-2xl p-0">
          <Sidebar recolhida={false} aoAlternar={() => setMenuMobile(false)} aoNavegar={() => setMenuMobile(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuMobile(true)}>
            <Menu />
          </Button>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm transition-colors hover:bg-muted">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {iniciais(perfil?.nome ?? user?.email)}
                </span>
                <span className="hidden max-w-[160px] truncate sm:inline">{perfil?.nome ?? user?.email}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
                <User2 /> Meu perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destrutivo onClick={() => sair()}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className={cn("flex-1 px-4 py-6 sm:px-6 lg:px-8")}>
          <div className="mx-auto w-full max-w-[1400px] space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
