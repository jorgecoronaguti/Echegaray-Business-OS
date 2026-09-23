// /obras/gantt ES LA MISMA PÁGINA QUE /obras, ABIERTA EN EL GANTT (dueño, 23/09/2026: «cuando voy de
// tabla a gantt el diseño cambia, refresca, está mal»). Un solo encabezado, dos cuerpos; el conmutador
// cambia de vista en el cliente y reescribe la URL sin volver al servidor. La ruta se conserva porque
// otros enlaces, la cookie de vista recordada y los tests la apuntan.
import ObrasPage from '../page'

export const dynamic = 'force-dynamic'

export default async function GanttGlobalPage({ searchParams }: { searchParams: Promise<{ archivadas?: string }> }) {
  return <ObrasPage searchParams={searchParams} vistaInicial="gantt" />
}
