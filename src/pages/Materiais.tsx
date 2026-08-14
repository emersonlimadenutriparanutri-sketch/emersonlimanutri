import { useState } from 'react'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Bloqueado, Carregando, Vazio } from '../components/Estado'
import { Markdown } from '../components/Markdown'
import { buscarMateriais } from '../lib/consultas'
import type { Material } from '../lib/types'

const ROTULO_TIPO: Record<Material['tipo'], string> = {
  pdf: 'PDF',
  video: 'Vídeo',
  link: 'Link',
  receita: 'Receita',
  texto: 'Leitura',
}

export default function Materiais() {
  const { paciente, vinculo, permissoes } = usePaciente()
  const [categoria, setCategoria] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const { dados, carregando, erro } = useDados(
    () =>
      permissoes.materiais_ativo
        ? buscarMateriais(vinculo.nutri_user_id, paciente.id)
        : Promise.resolve([]),
    [paciente.id, vinculo.nutri_user_id, permissoes.materiais_ativo]
  )

  if (!permissoes.materiais_ativo) {
    return (
      <>
        <Cabecalho titulo="Materiais" voltar />
        <Pagina><Bloqueado recurso="Os materiais" /></Pagina>
      </>
    )
  }

  const materiais = dados ?? []
  const categorias = Array.from(
    new Set(materiais.map((m) => m.categoria).filter((c): c is string => !!c))
  )
  const visiveis = categoria ? materiais.filter((m) => m.categoria === categoria) : materiais

  return (
    <>
      <Cabecalho titulo="Materiais e receitas" voltar />
      <Pagina>
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          materiais.length === 0 ? (
            <Vazio
              titulo="Nada publicado ainda"
              descricao="Seu nutricionista ainda não liberou materiais. Assim que publicar, aparecem aqui."
            />
          ) : (
            <div className="space-y-4">
              {categorias.length > 0 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setCategoria(null)}
                    className={`selo shrink-0 ${
                      categoria === null
                        ? 'bg-marca-700 text-white'
                        : 'bg-white text-marca-700 ring-1 ring-marca-100'
                    }`}
                  >
                    Tudo
                  </button>
                  {categorias.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategoria(c)}
                      className={`selo shrink-0 ${
                        categoria === c
                          ? 'bg-marca-700 text-white'
                          : 'bg-white text-marca-700 ring-1 ring-marca-100'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {visiveis.map((material) => {
                  const expandido = aberto === material.id
                  const temConteudo = !!material.conteudo

                  return (
                    <article key={material.id} className="cartao overflow-hidden">
                      {material.capa_url && (
                        <img
                          src={material.capa_url}
                          alt=""
                          loading="lazy"
                          className="-mx-4 -mt-4 mb-3 h-40 w-[calc(100%+2rem)] object-cover"
                        />
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-marca-900">{material.titulo}</p>
                          {material.descricao && (
                            <p className="mt-0.5 text-sm text-marca-500">{material.descricao}</p>
                          )}
                        </div>
                        <span className="selo shrink-0 bg-marca-50 text-marca-700">
                          {ROTULO_TIPO[material.tipo]}
                        </span>
                      </div>

                      <div className="mt-3 flex gap-2">
                        {material.url && (
                          <a
                            href={material.url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secundario flex-1 py-2.5 text-sm"
                          >
                            {material.tipo === 'video' ? 'Assistir' : 'Abrir'}
                          </a>
                        )}
                        {temConteudo && (
                          <button
                            type="button"
                            onClick={() => setAberto(expandido ? null : material.id)}
                            className="btn-secundario flex-1 py-2.5 text-sm"
                          >
                            {expandido ? 'Fechar' : 'Ler aqui'}
                          </button>
                        )}
                      </div>

                      {expandido && temConteudo && (
                        <div className="mt-3 border-t border-marca-100 pt-3">
                          <Markdown texto={material.conteudo!} />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          )
        )}
      </Pagina>
    </>
  )
}
