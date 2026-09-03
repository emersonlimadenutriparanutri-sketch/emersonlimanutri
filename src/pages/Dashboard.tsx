import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Crown, CalendarClock, UserPlus, ListTodo, HeartPulse, Users2,
  Stethoscope, CalendarRange, BookOpen, Sparkles, MessagesSquare, ArrowRight,
} from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLista } from "@/hooks/use-crud";
import { usePacientes } from "@/hooks/use-pacientes";
import { useAuth } from "@/contexts/AuthContext";
import { fmtData, diasAte, faseCiclo, rotuloFase, hojeISO } from "@/lib/format";
import type { AgendaTask, Lead } from "@/types/db";

const atalhos = [
  { para: "/consultorio", titulo: "Consultório", texto: "Leads, pacientes, financeiro e questionários.", icone: Stethoscope },
  { para: "/agenda", titulo: "Torre de Controle", texto: "Calendário unificado, projetos e mapas mentais.", icone: CalendarRange },
  { para: "/consultorio?aba=questionarios", titulo: "Biblioteca", texto: "Modelos de questionário e materiais.", icone: BookOpen },
  { para: "/ia", titulo: "Área de IA", texto: "Relatórios clínicos e análises assistidas.", icone: Sparkles },
  { para: "/consultorio?aba=followup", titulo: "Follow Up", texto: "Recuperação de leads que esfriaram.", icone: MessagesSquare },
];

export default function Dashboard() {
  const { perfil } = useAuth();
  const { grupos, indicadores, isLoading } = usePacientes();
  const { data: leads = [] } = useLista<Lead>("leads");
  const { data: tarefas = [] } = useLista<AgendaTask>("agenda_tasks", { ordenarPor: "data", crescente: true });

  const leadsDoMes = useMemo(() => {
    const agora = new Date();
    return leads.filter((l) => {
      const d = new Date(l.created_at);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
  }, [leads]);

  const pendentes = useMemo(() => tarefas.filter((t) => !t.concluida), [tarefas]);
  const atrasadas = useMemo(() => pendentes.filter((t) => t.data < hojeISO()), [pendentes]);

  const primeiroNome = (perfil?.nome ?? "").split(" ")[0];

  return (
    <>
      <PageHero
        selo="Plataforma"
        titulo={primeiroNome ? `Olá, ${primeiroNome}.` : "Olá."}
        descricao="Este é o seu painel de comando. Aqui você enxerga, em uma tela só, quem precisa de atenção hoje: planos vencendo, leads esfriando, tarefas em aberto e pacientes em fase do ciclo que pede ajuste de conduta."
      />

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Indicadores</h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              rotulo="Pacientes ativos Premium" valor={indicadores.premium.length}
              detalhe="Plano contratado do tipo premium" icone={<Crown />} tom="neutro"
              para="/consultorio?aba=pacientes"
            />
            <StatCard
              rotulo="Pacientes ativos Mensal" valor={indicadores.mensal.length}
              detalhe="Demais pacientes com plano vigente" icone={<Users2 />} tom="info"
              para="/consultorio?aba=pacientes"
            />
            <StatCard
              rotulo="Pacientes a vencer" valor={indicadores.aVencer.length}
              detalhe="Plano vence nos próximos 7 dias" icone={<CalendarClock />}
              tom={indicadores.aVencer.length ? "alerta" : "neutro"}
              para="/consultorio?aba=pacientes"
            />
            <StatCard
              rotulo="Leads do mês" valor={leadsDoMes.length}
              detalhe="Novos leads criados neste mês" icone={<UserPlus />} tom="neutro"
              para="/consultorio?aba=leads"
            />
            <StatCard
              rotulo="Tarefas pendentes" valor={pendentes.length}
              detalhe={atrasadas.length ? `${atrasadas.length} em atraso` : "Nada em atraso"}
              icone={<ListTodo />} tom={atrasadas.length ? "perigo" : "sucesso"}
              para="/agenda"
            />
            <StatCard
              rotulo="Pacientes em TPM / menstrual" valor={indicadores.ciclo.length}
              detalhe="Fase do ciclo que pede ajuste de conduta" icone={<HeartPulse />}
              tom={indicadores.ciclo.length ? "alerta" : "neutro"}
            />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card-surface lg:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-display text-base font-semibold">Planos vencendo em até 7 dias</h2>
            <Link to="/consultorio?aba=pacientes" className="text-xs text-secondary hover:underline">Ver todos</Link>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {indicadores.aVencer.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhum plano vencendo nesta semana. Bom sinal.
              </p>
            ) : (
              indicadores.aVencer.map((p) => {
                const dias = diasAte(p.plano_vencimento) ?? 0;
                return (
                  <Link key={p.id} to={`/paciente/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">Vence em {fmtData(p.plano_vencimento)}</p>
                    </div>
                    <Badge variant={dias <= 2 ? "danger" : "warning"}>
                      {dias === 0 ? "vence hoje" : `${dias} dia${dias > 1 ? "s" : ""}`}
                    </Badge>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="card-surface">
          <div className="p-5 pb-3">
            <h2 className="font-display text-base font-semibold">Alerta de ciclo</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pacientes em TPM ou menstruação agora — momento de acolher, não de cobrar.
            </p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {indicadores.ciclo.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhuma paciente nessa fase hoje.
              </p>
            ) : (
              indicadores.ciclo.slice(0, 6).map((p) => {
                const f = faseCiclo(p.ciclo_ultima_menstruacao, p.ciclo_duracao ?? 28, p.ciclo_duracao_menstruacao ?? 5)!;
                return (
                  <Link key={p.id} to={`/paciente/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/60">
                    <p className="truncate text-sm font-medium">{p.nome}</p>
                    <Badge variant={f.fase === "tpm" ? "warning" : "danger"}>
                      {rotuloFase[f.fase]} · D{f.dia}
                    </Badge>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Atalhos rápidos</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {atalhos.map(({ para, titulo, texto, icone: Icone }) => (
            <Link key={para} to={para} className="card-surface group flex items-start gap-4 p-5 transition-shadow hover:shadow-lift">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-soft text-secondary">
                <Icone className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold">{titulo}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{texto}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
