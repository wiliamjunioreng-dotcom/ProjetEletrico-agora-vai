import './index.css'
import { useProjectStore } from './store/projectStore'
import { Shell }          from './components/layout/Shell'
import { Dashboard }      from './pages/Dashboard'
import { Projeto }        from './pages/Projeto'
import { Comodos }        from './pages/Comodos'
import { Circuitos }      from './pages/Circuitos'
import { Balanceamento }  from './pages/Balanceamento'
import { Protecao }       from './pages/Protecao'
import { QDFL }           from './pages/QDFL'
import Auditoria          from './pages/Auditoria'
import { Unifilar }       from './pages/Unifilar'
import { Materiais }      from './pages/Materiais'
import { Luminotecnico }  from './pages/Luminotecnico'
import { ART }           from './pages/ART'
import { Eletrodutos } from './pages/Eletrodutos'
import { Precos }        from './pages/Precos'
import { SimbologiaNBR5444 } from './pages/SimbologiaNBR5444'

const PAGES: Record<string, React.ComponentType> = {
  dashboard:     Dashboard,
  projeto:       Projeto,
  comodos:       Comodos,
  circuitos:     Circuitos,
  balanceamento: Balanceamento,
  protecao:      Protecao,
  auditoria:     Auditoria,
  qdfl:          QDFL,
  unifilar:      Unifilar,
  materiais:     Materiais,
  luminotecnico: Luminotecnico,
  art:           ART,
  precos:        Precos,
  eletrodutos:   Eletrodutos,
  simbologia:    SimbologiaNBR5444,
}

export default function App() {
  const pagina = useProjectStore(s => s.pagina_atual)
  const Page   = PAGES[pagina] ?? Dashboard
  return <Shell><Page /></Shell>
}
