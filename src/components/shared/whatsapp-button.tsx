import { MessageCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { linkWhatsapp } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props extends Omit<ButtonProps, "asChild"> {
  telefone?: string | null;
  mensagem?: string;
  rotulo?: string;
}

export const WhatsappButton = ({ telefone, mensagem, rotulo, className, ...rest }: Props) => {
  const href = linkWhatsapp(telefone, mensagem);
  if (!href) return null;
  return (
    <Button
      asChild
      variant="outline"
      size={rotulo ? "sm" : "icon-sm"}
      className={cn("text-success hover:bg-success/10", className)}
      {...rest}
    >
      {/* target="_top" garante abertura correta mesmo dentro de iframe/preview */}
      <a href={href} target="_top" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Abrir no WhatsApp">
        <MessageCircle />
        {rotulo}
      </a>
    </Button>
  );
};
