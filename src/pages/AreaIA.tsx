import { Link } from "react-router-dom";
import { Sparkles, FlaskConical, Activity, NotebookPen, TrendingUp, Brain, ClipboardList } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";

const RECURSOS = [
  { icone: FlaskConical, titulo: "Leitura de exames", texto: "Envie o laudo em PDF ou foto: os marcadores são extraídos, comparados com a referência do laboratório e com a faixa ótima funcional.", para: "/consultorio?aba=pacientes" },
  { icone: Activity, titulo: "Rastreamento metabólico", texto: "A pontuação por sistema vira uma leitura interpretativa, apontando os eixos que merecem atenção primeiro.", para: "/consultorio?aba=pacientes" },
  { icone: NotebookPen, titulo: "Resumo de anamnese e consulta", texto: "Suas anotações viram um relatório clínico organizado, cruzando avaliação física e exames recentes.", para: "/consultorio?aba=pacientes" },
  { icone: TrendingUp, titulo: "Relatório de evolução", texto: "Consolida avaliações, Raio-X semanais, exames e rastreamentos em um texto único de acompanhamento.", para: "/consultorio?aba=pacientes" },
  { icone: ClipboardList, titulo: "Resumo de questionário", texto: "As respostas do paciente chegam resumidas, com o que muda conduta em destaque.", para: "/consultorio?aba=questionarios" },
  { icone: Brain, titulo: "Mapas mentais", texto: "Estrutura de aula, protocolo ou raciocínio clínico montada a partir de um tema — e expansível nó a nó.", para: "/agenda?t=mapas" },
];

export default function AreaIA() {
  return (
    <>
      <PageHero
        selo="Inteligência"
        titulo="Área de IA"
        descricao="A IA aqui não substitui o seu raciocínio clínico: ela organiza informação, poupa digitação e devolve o texto pronto para você revisar, ajustar e assinar."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {RECURSOS.map(({ icone: Icone, titulo, texto, para }) => (
          <Link key={titulo} to={para} className="card-surface flex flex-col p-5 transition-shadow hover:shadow-lift">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-soft text-secondary">
              <Icone className="h-[18px] w-[18px]" />
            </span>
            <h3 className="mt-4 font-display text-base font-semibold">{titulo}</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{texto}</p>
          </Link>
        ))}
      </div>

      <div className="card-surface flex items-start gap-4 p-5">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
        <div className="text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Como funciona por baixo</p>
          <p className="mt-1">
            Toda chamada de IA passa por uma Edge Function no seu próprio Supabase. A chave da API
            fica nos secrets do projeto — nunca no navegador, nunca no código do app. Os relatórios
            saem em linguagem clínica, sem anunciar que foram gerados automaticamente, e podem ser
            exportados em PDF.
          </p>
        </div>
      </div>
    </>
  );
}
