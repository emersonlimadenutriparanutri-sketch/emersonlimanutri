import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Carregando } from './components/Estado'

// As telas de entrada carregam junto com o app; o resto vem sob demanda para
// o primeiro acesso no celular não baixar tudo de uma vez.
import Entrar from './pages/Entrar'
import Convite from './pages/Convite'
import SemVinculo from './pages/SemVinculo'
import Inicio from './pages/Inicio'

const Jornada = lazy(() => import('./pages/Jornada'))
const CheckIn = lazy(() => import('./pages/CheckIn'))
const Evolucao = lazy(() => import('./pages/Evolucao'))
const Exames = lazy(() => import('./pages/Exames'))
const Questionarios = lazy(() => import('./pages/Questionarios'))
const ResponderQuestionario = lazy(() => import('./pages/ResponderQuestionario'))
const Chat = lazy(() => import('./pages/Chat'))
const Diario = lazy(() => import('./pages/Diario'))
const Materiais = lazy(() => import('./pages/Materiais'))
const Lembretes = lazy(() => import('./pages/Lembretes'))
const Mais = lazy(() => import('./pages/Mais'))
const Perfil = lazy(() => import('./pages/Perfil'))

const NutriEntrar = lazy(() => import('./pages/nutri/NutriEntrar'))
const NutriPacientes = lazy(() => import('./pages/nutri/NutriPacientes'))
const NutriConversas = lazy(() => import('./pages/nutri/NutriConversas'))

function RotaPaciente({ children }: { children: ReactNode }) {
  const { carregando, session, vinculo } = useAuth()
  const local = useLocation()

  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/entrar" state={{ de: local.pathname }} replace />
  if (!vinculo) return <Navigate to="/sem-vinculo" replace />
  return <>{children}</>
}

function RotaNutri({ children }: { children: ReactNode }) {
  const { carregando, session } = useAuth()

  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/nutri/entrar" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        {/* Públicas */}
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/convite/:token" element={<Convite />} />
        <Route path="/sem-vinculo" element={<SemVinculo />} />
        <Route path="/nutri/entrar" element={<NutriEntrar />} />

        {/* Área do paciente */}
        <Route path="/" element={<RotaPaciente><Inicio /></RotaPaciente>} />
        <Route path="/jornada" element={<RotaPaciente><Jornada /></RotaPaciente>} />
        <Route path="/checkin" element={<RotaPaciente><CheckIn /></RotaPaciente>} />
        <Route path="/evolucao" element={<RotaPaciente><Evolucao /></RotaPaciente>} />
        <Route path="/exames" element={<RotaPaciente><Exames /></RotaPaciente>} />
        <Route path="/questionarios" element={<RotaPaciente><Questionarios /></RotaPaciente>} />
        <Route path="/questionarios/:envioId" element={<RotaPaciente><ResponderQuestionario /></RotaPaciente>} />
        <Route path="/chat" element={<RotaPaciente><Chat /></RotaPaciente>} />
        <Route path="/diario" element={<RotaPaciente><Diario /></RotaPaciente>} />
        <Route path="/materiais" element={<RotaPaciente><Materiais /></RotaPaciente>} />
        <Route path="/lembretes" element={<RotaPaciente><Lembretes /></RotaPaciente>} />
        <Route path="/mais" element={<RotaPaciente><Mais /></RotaPaciente>} />
        <Route path="/perfil" element={<RotaPaciente><Perfil /></RotaPaciente>} />

        {/* Área do nutricionista */}
        <Route path="/nutri" element={<RotaNutri><NutriPacientes /></RotaNutri>} />
        <Route path="/nutri/conversas" element={<RotaNutri><NutriConversas /></RotaNutri>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
