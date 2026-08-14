import { Link } from 'react-router-dom'
import { useAuth, usePaciente } from '../contexts/AuthContext'
import { Cabecalho, Pagina } from '../components/Layout'

type Item = { para: string; titulo: string; descricao: string; visivel: boolean }

export default function Mais() {
  const { permissoes } = usePaciente()
  const { nutri, sair } = useAuth()

  const itens: Item[] = [
    { para: '/evolucao', titulo: 'Minha evolução', descricao: 'Gráficos, avaliações e relatórios', visivel: permissoes.ver_evolucao },
    { para: '/exames', titulo: 'Meus exames', descricao: 'Análises liberadas pelo nutricionista', visivel: permissoes.ver_exames },
    { para: '/questionarios', titulo: 'Questionários', descricao: 'Formulários enviados para você', visivel: true },
    { para: '/diario', titulo: 'Diário alimentar', descricao: 'Registre refeições com foto', visivel: permissoes.diario_ativo },
    { para: '/materiais', titulo: 'Materiais e receitas', descricao: 'Conteúdos liberados para você', visivel: permissoes.materiais_ativo },
    { para: '/lembretes', titulo: 'Lembretes', descricao: 'Água, suplementos e notificações', visivel: true },
    { para: '/perfil', titulo: 'Meu perfil', descricao: 'Seus dados e sua conta', visivel: true },
  ]

  return (
    <>
      <Cabecalho titulo="Mais" subtitulo={nutri?.nome_completo ?? undefined} />
      <Pagina>
        <div className="space-y-3">
          {itens.filter((i) => i.visivel).map((item) => (
            <Link key={item.para} to={item.para} className="cartao flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-marca-900">{item.titulo}</p>
                <p className="text-sm text-marca-500">{item.descricao}</p>
              </div>
              <span className="shrink-0 text-marca-400">→</span>
            </Link>
          ))}

          <button type="button" onClick={sair} className="btn-secundario mt-2 w-full">
            Sair da minha conta
          </button>
        </div>
      </Pagina>
    </>
  )
}
