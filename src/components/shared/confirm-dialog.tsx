import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  descricao?: string;
  confirmar?: string;
  cancelar?: string;
  destrutivo?: boolean;
  onConfirmar: () => void;
}

/** Substitui window.confirm em todo o app. */
export const ConfirmDialog = ({
  aberto, onOpenChange, titulo, descricao,
  confirmar = "Confirmar", cancelar = "Cancelar", destrutivo, onConfirmar,
}: Props) => (
  <AlertDialog open={aberto} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{titulo}</AlertDialogTitle>
        {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{cancelar}</AlertDialogCancel>
        <AlertDialogAction
          className={cn(destrutivo && buttonVariants({ variant: "destructive" }))}
          onClick={onConfirmar}
        >
          {confirmar}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
