// EL DESIGN SYSTEM DEL BUSINESS OS, COMO CÓDIGO.
//
// Implementa `design/system/` —el handoff aprobado— en componentes reutilizables. La regla que lo
// gobierna es la 11 de `UX_PRINCIPLES.md`: *reutilizar patrones antes de crear nuevos*. Si una
// pantalla necesita una tabla, un tab, un panel, un estado o un vacío, ES ÉSTE. Un componente
// nuevo se justifica cuando el handoff describe algo que acá no está — no cuando conviene para
// una pantalla sola.
//
// Punto de entrada único: import { Tabla, Estado, Boton } from '@/shared/components/ds'
export { TituloPantalla, TituloPanel, Eyebrow, Num, Nulo, Valor } from './texto'
export { Estado, type TonoEstado } from './Estado'
export { Boton, BotonEnlace, Volver } from './Boton'
export { Tabla, THead, Th, Tr, Td, FilaTotal, Vacio } from './Tabla'
export { Tabs, SubTabs, type Tab } from './Navegacion'
export { EntityHeader, type CampoHeader } from './EntityHeader'
export { BarraContexto, MetaContexto, type KpiContexto } from './BarraContexto'
export { Plegable, FilaGrupo } from './Plegable'
export { Franja, type Metrica } from './Franja'
export { useSplit, Divisor, ZonaSplit } from './Split'
// `anchoSplit` NO se re-exporta acá A PROPÓSITO: usa `next/headers` y este barril lo importan
// componentes de cliente. Se importa por su ruta: '@/shared/components/ds/split-servidor'.
export { PanelDetalle, PlanVsReal, BarraAvance } from './Panel'
export { Aviso, ErrorCampo } from './Aviso'
export { CAMPO, Campo, Buscador, IconoBuscar, Filtros } from './Controles'
export { BuscadorURL, ESPERA_MS } from './BuscadorURL'
export { MenuContextual } from './Menu'
export { Timeline, type Evento } from './Timeline'
