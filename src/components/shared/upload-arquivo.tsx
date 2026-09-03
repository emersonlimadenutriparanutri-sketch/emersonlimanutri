import * as React from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { abrirArquivo, enviarArquivo, removerArquivo, type Bucket } from "@/lib/storage";

interface Props {
  bucket: Bucket;
  prefixo?: string;
  accept?: string;
  arquivoUrl?: string | null;
  arquivoNome?: string | null;
  aoEnviar: (dados: { caminho: string; nome: string } | null) => void;
  rotulo?: string;
}

/** Envia para bucket privado e devolve o caminho; a leitura usa URL assinada. */
export function UploadArquivo({
  bucket, prefixo, accept = ".pdf,image/*", arquivoUrl, arquivoNome, aoEnviar, rotulo = "Anexar arquivo",
}: Props) {
  const { user } = useAuth();
  const [enviando, setEnviando] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  const selecionar = async (file: File) => {
    if (!user) return;
    if (file.size > 20 * 1024 * 1024) return toast.error("Arquivo maior que 20 MB.");
    setEnviando(true);
    try {
      const dados = await enviarArquivo(bucket, user.id, file, prefixo);
      aoEnviar(dados);
      toast.success("Arquivo anexado.");
    } catch (erro: any) {
      toast.error(erro.message ?? "Falha no envio.");
    } finally {
      setEnviando(false);
    }
  };

  if (arquivoUrl) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
        <button type="button" onClick={() => abrirArquivo(bucket, arquivoUrl)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">
          {arquivoNome ?? "Ver arquivo"}
        </button>
        <Button
          type="button" variant="ghost" size="icon-sm" className="text-destructive"
          onClick={async () => {
            try { await removerArquivo(bucket, arquivoUrl); } catch { /* já removido */ }
            aoEnviar(null);
          }}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={input} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) selecionar(f); e.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => input.current?.click()}>
        {enviando ? <Loader2 className="animate-spin" /> : <Paperclip />} {rotulo}
      </Button>
    </>
  );
}
