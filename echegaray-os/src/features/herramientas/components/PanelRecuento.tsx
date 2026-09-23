'use client'

// RECUENTO DEL LUGAR DESDE LA COMPUTADORA — el mismo M05 «Control físico» del teléfono, en el panel al
// costado de Ubicaciones (D04). Una sola implementación (`RecuentoDelLugar`): lo esperado, «Todo bien»,
// y las dos salidas del cierre se juzgan igual en las dos caras. Paridad funcional, dueño 23/09.

import { itemsDeRecuento, recuentoAbierto } from '../logica/recuento'
import { rotuloUbicacion } from '../logica/parque'
import { useHerramientas } from './Espacio'
import { PanelLateral } from './PanelLateral'
import { RecuentoDelLugar } from './RecuentoDelLugar'
import { ACCION } from '../logica/acciones-lugar'

export function PanelRecuento({ ubicacionId, onHecho }: { ubicacionId: string; onHecho: (t: string) => void }) {
  const { parque, cerrar } = useHerramientas()
  const u = parque.ubicacionPorId.get(ubicacionId)
  if (!u) return null
  const rotulo = rotuloUbicacion(parque, u.id)
  return (
    <PanelLateral testid="panel-recuento" titulo={ACCION.recuento} subtitulo={rotulo} onCerrar={cerrar}>
      <RecuentoDelLugar
        ubicacionId={u.id}
        rotulo={rotulo}
        items={itemsDeRecuento(parque, u.id)}
        sinBase={parque.recuentos == null}
        abiertoDesde={recuentoAbierto(parque.recuentos, u.id)?.iniciado_en ?? null}
        variante="escritorio"
        volverA={`/herramientas/ubicaciones?u=${u.id}`}
        onVolver={onHecho}
      />
    </PanelLateral>
  )
}
