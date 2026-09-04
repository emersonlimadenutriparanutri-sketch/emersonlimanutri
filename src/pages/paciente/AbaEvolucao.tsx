import * as React from "react";
import { toast } from "sonner";
import { LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelatorioIA } from "@/components/shared/relatorio-ia";
import { useLista, useSalvar } from "@/hooks/use-crud";
import { chamarIA } from "@/lib/ai";
import { fmtData, idade } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type {
  AnaliseExame, AvaliacaoFisica, RaioX, Rastreamento, RelatorioEvolucao, ResumoConsulta,
} from "@/types/db";

export default function AbaEvolucao({ paciente }: PropsAbaPaciente) {
  const filtros = { patient_id: paciente.id };
  const { data: avaliacoes = [] } = useLista<AvaliacaoFisica>("avaliacoes_fisicas", { filtros, ordenarPor: "data", crescente: true });
  const { data: raiosX = [] } = useLista<RaioX>("raio_x_semanal", { filtros, ordenarPor: "semana_ref", crescente: true });
  const { data: exames = [] } = useLista<AnaliseExame>("analise_exames", { filtros, ordenarPor: "data", crescente: true });
  const { data: rastreios = [] } = useLista<Rastreamento>("rastreamento_metabolico", { filtros, ordenarPor: "data", crescente: true });
  const { data: consultas = [] } = useLista<ResumoConsulta>("resumos_consulta", { filtros, ordenarPor: "data", crescente: true });
  const { data: relatorios = [] } = useLista<RelatorioEvolucao>("relatorios_evolucao", { filtros, ordenarPor: "created_at" });
  const salvar = useSalvar<RelatorioEvolucao>("relatorios_evolucao", "Relatório de evolução gerado.");
  const [gerando, setGerando] = React.useState(false);

  const serieComposicao = React.useMemo(
    () => avaliacoes.map((a) => ({
      data: fmtData(a.data, "dd/MM"),
      Peso: a.peso ?? null,
      "Gordura %": a.gordura_pct ?? null,
      "Massa magra": a.massa_magra ?? null,
    })),
    [avaliacoes],
  );

  const serieMedidas = React.useMemo(
    () => avaliacoes.map((a) => ({
      data: fmtData(a.data, "dd/MM"),
      Cintura: a.medidas?.cintura ?? null,
      Quadril: a.medidas?.quadril ?? null,
      Abdômen: a.medidas?.abdomen ?? null,
    })),
    [avaliacoes],
  );

  const serieSemanal = React.useMemo(
    () => raiosX.map((r) => ({
      data: fmtData(r.semana_ref, "dd/MM"),
      Peso: r.peso ?? null,
      "Adesão %": r.adesao_pct ?? null,
      Energia: r.respostas?.energia != null ? Number(r.respostas.energia) * 10 : null,
    })),
    [raiosX],
  );

  /**
   * O que a paciente quer ouvir em uma linha. Compara a primeira e a última
   * avaliação — inclusive quando a balança anda menos que a fita métrica.
   */
  const resultado = React.useMemo(() => {
    if (avaliacoes.length < 2) return [];
    const primeira = avaliacoes[0];
    const ultima = avaliacoes[avaliacoes.length - 1];

    const delta = (rotulo: string, de?: number | null, ate?: number | null, unidade = "kg", menorMelhor = true) => {
      if (de == null || ate == null) return null;
      const diferenca = Number((ate - de).toFixed(1));
      if (diferenca === 0) return { rotulo, texto: "sem mudança", bom: null as boolean | null };
      return {
        rotulo,
        texto: `${diferenca > 0 ? "+" : "−"}${Math.abs(diferenca).toLocaleString("pt-BR")} ${unidade}`,
        bom: menorMelhor ? diferenca < 0 : diferenca > 0,
      };
    };

    return [
      delta("Peso", primeira.peso, ultima.peso),
      delta("Gordura", primeira.gordura_pct, ultima.gordura_pct, "p.p."),
      delta("Massa magra", primeira.massa_magra, ultima.massa_magra, "kg", false),
      delta("Cintura", primeira.medidas?.cintura, ultima.medidas?.cintura, "cm"),
      delta("Abdômen", primeira.medidas?.abdomen, ultima.medidas?.abdomen, "cm"),
    ].filter(Boolean) as { rotulo: string; texto: string; bom: boolean | null }[];
  }, [avaliacoes]);

  const temDados = avaliacoes.length + raiosX.length + exames.length + rastreios.length > 0;
  const ultimo = relatorios[0];

  const gerar = async () => {
    setGerando(true);
    try {
      const { texto } = await chamarIA<{ texto: string }>("evolucao-paciente", {
        paciente: {
          nome: paciente.nome, idade: idade(paciente.data_nascimento), sexo: paciente.sexo,
          objetivo: paciente.objetivo, medicacoes: paciente.medicacoes,
          plano_inicio: paciente.plano_inicio,
        },
        avaliacoes: avaliacoes.map((a) => ({
          data: a.data, peso: a.peso, imc: a.imc, gordura_pct: a.gordura_pct,
          massa_magra: a.massa_magra, medidas: a.medidas,
        })),
        raio_x: raiosX.map((r) => ({ semana: r.semana_ref, peso: r.peso, adesao: r.adesao_pct, respostas: r.respostas })),
        exames: exames.map((e) => ({ data: e.data, marcadores: e.marcadores })),
        rastreamentos: rastreios.map((r) => ({ data: r.data, total: r.pontuacao_total, sistemas: r.pontuacao_sistemas })),
        consultas: consultas.map((c) => ({ data: c.data, anotacoes: c.anotacoes })),
      });
      await salvar.mutateAsync({
        patient_id: paciente.id,
        periodo_de: avaliacoes[0]?.data ?? paciente.plano_inicio ?? null,
        periodo_ate: avaliacoes[avaliacoes.length - 1]?.data ?? null,
        conteudo: texto,
        fontes: {
          avaliacoes: avaliacoes.length, raio_x: raiosX.length,
          exames: exames.length, rastreamentos: rastreios.length, consultas: consultas.length,
        },
      } as any);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setGerando(false);
    }
  };

  if (!temDados) {
    return (
      <EmptyState
        icone={<TrendingUp />} titulo="Ainda não há dados para evoluir"
        descricao="Registre avaliações físicas, Raio-X semanais ou exames e os gráficos aparecem aqui."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Avaliações", avaliacoes.length], ["Raio-X", raiosX.length], ["Exames", exames.length],
          ["Rastreamentos", rastreios.length], ["Consultas", consultas.length],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)} className="card-surface p-4">
            <span className="seal text-muted-foreground">{rotulo}</span>
            <p className="mt-2 font-display text-xl font-semibold">{valor}</p>
          </div>
        ))}
      </div>

      {resultado.length > 0 && (
        <div className="card-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-semibold">Resultado no período</h3>
            <p className="text-xs text-muted-foreground">
              {fmtData(avaliacoes[0].data)} até {fmtData(avaliacoes[avaliacoes.length - 1].data)}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {resultado.map((r) => (
              <div key={r.rotulo}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.rotulo}</p>
                <p className={cn(
                  "mt-0.5 font-display text-xl font-semibold",
                  r.bom === true && "text-success",
                  r.bom === false && "text-warning",
                )}>
                  {r.texto}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {serieComposicao.length > 1 && (
        <Grafico
          titulo="Composição corporal"
          descricao="Peso e massa magra em quilos (eixo da esquerda), gordura em percentual (direita)."
          dados={serieComposicao}
          series={[
            { chave: "Peso", eixo: "kg" },
            { chave: "Massa magra", eixo: "kg" },
            { chave: "Gordura %", eixo: "pct" },
          ]}
        />
      )}
      {serieMedidas.some((d) => d.Cintura || d.Quadril || d.Abdômen) && (
        <Grafico
          titulo="Medidas (cm)"
          descricao="Circunferências — muitas vezes mudam antes da balança."
          dados={serieMedidas}
          series={[{ chave: "Cintura", eixo: "kg" }, { chave: "Quadril", eixo: "kg" }, { chave: "Abdômen", eixo: "kg" }]}
        />
      )}
      {serieSemanal.length > 1 && (
        <Grafico
          titulo="Acompanhamento semanal"
          descricao="Peso em quilos (esquerda); adesão e energia em percentual (direita)."
          dados={serieSemanal}
          series={[
            { chave: "Peso", eixo: "kg" },
            { chave: "Adesão %", eixo: "pct" },
            { chave: "Energia", eixo: "pct" },
          ]}
        />
      )}

      <RelatorioIA
        titulo="Relatório de evolução"
        conteudo={ultimo?.conteudo}
        paciente={paciente.nome}
        data={ultimo?.created_at}
        gerando={gerando}
        aoGerar={gerar}
        rotuloGerar="Gerar relatório consolidado"
        vazio="Gere o relatório que cruza avaliações, exames, rastreamento e Raio-X em um texto só."
      />
    </div>
  );
}

const CORES = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--secondary))"];

interface Serie {
  chave: string;
  /** "kg" usa o eixo da esquerda; "pct" usa o da direita, fixo em 0–100. */
  eixo: "kg" | "pct";
}

function Grafico({
  titulo, descricao, dados, series,
}: { titulo: string; descricao: string; dados: any[]; series: Serie[] }) {
  const temPercentual = series.some((s) => s.eixo === "pct");

  return (
    <div className="card-surface p-5">
      <h3 className="font-display text-base font-semibold">{titulo}</h3>
      <p className="mb-4 text-xs text-muted-foreground">{descricao}</p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="data" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            {/*
              O eixo NÃO parte do zero de propósito: com 0–100, uma perda real de
              3 kg em três meses vira uma linha reta e o resultado da paciente
              some no gráfico. A folga de 2 unidades evita a linha colada na borda.
            */}
            <YAxis
              yAxisId="kg" domain={["dataMin - 2", "dataMax + 2"]}
              tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v: number) => String(Math.round(v))}
            />
            {temPercentual && (
              <YAxis
                yAxisId="pct" orientation="right" domain={[0, 100]}
                tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v: number) => `${v}%`}
              />
            )}
            <ReTooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Line
                key={s.chave}
                yAxisId={s.eixo === "pct" && temPercentual ? "pct" : "kg"}
                type="monotone" dataKey={s.chave} stroke={CORES[i % CORES.length]}
                strokeWidth={2} dot={{ r: 3 }} connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
