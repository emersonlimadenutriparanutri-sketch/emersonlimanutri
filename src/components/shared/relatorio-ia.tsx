import * as React from "react";
import { FileDown, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportarRelatorioPDF } from "@/lib/pdf";
import { fmtData } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  titulo: string;
  conteudo?: string | null;
  paciente: string;
  data?: string | null;
  gerando?: boolean;
  aoGerar?: () => void;
  rotuloGerar?: string;
  vazio?: string;
  className?: string;
}

/**
 * Bloco padrão de relatório clínico.
 * O texto é apresentado como relatório do profissional — em nenhum
 * momento o app anuncia ao paciente que houve geração automática.
 */
export function RelatorioIA({
  titulo, conteudo, paciente, data, gerando, aoGerar,
  rotuloGerar = "Gerar relatório", vazio = "Ainda não há relatório para este registro.", className,
}: Props) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <span className="seal text-secondary">{titulo}</span>
          {data && <p className="mt-0.5 text-xs text-muted-foreground">{fmtData(data)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {conteudo && (
            <Button
              variant="outline" size="sm"
              onClick={() =>
                exportarRelatorioPDF({
                  titulo, subtitulo: `${paciente}${data ? ` · ${fmtData(data)}` : ""}`,
                  conteudo, rodape: paciente,
                  arquivo: `${titulo.toLowerCase().replace(/\s+/g, "-")}-${paciente.split(" ")[0].toLowerCase()}.pdf`,
                })
              }
            >
              <FileDown /> PDF
            </Button>
          )}
          {aoGerar && (
            <Button size="sm" onClick={aoGerar} disabled={gerando}>
              {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {conteudo ? "Refazer" : rotuloGerar}
            </Button>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {conteudo ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{conteudo}</p>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">{gerando ? "Analisando…" : vazio}</p>
        )}
      </div>
    </div>
  );
}
