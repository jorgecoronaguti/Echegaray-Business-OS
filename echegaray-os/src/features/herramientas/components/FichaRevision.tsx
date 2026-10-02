'use client'

// EL RESUMEN DE REVISIÓN EN LA FICHA DEL ACTIVO (D02): cada tipo con su semáforo y la puerta a Mantenimiento,
// donde se cargan (`PanelRodado`). El semáforo lo decide `logica/revision.ts` con la fecha de hoy.

import Link from 'next/link'
import { MIGRACION_REVISION, NOMBRE_REVISION, seRevisa, semaforo, TIPOS_POR_CLASE, vigenteDe } from '../logica/revision'
import { useHerramientas } from './Espacio'
import { AZUL, V, eyebrow, vacio } from './estilo'

const COLOR = { neg: V.neg, warn: V.warn, pos: V.pos, tenue: V.tenue } as const

/** El resumen para la ficha del activo (D02): cada tipo con su semáforo y la puerta a la ficha de revisión. */
export function ResumenRevision({ id }: { id: string }) {
  const { parque } = useHerramientas()
  const a = parque.activoPorId.get(id)
  if (!a || !seRevisa(a)) return null
  const hoy = new Date()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-revision-resumen">
      <div style={{ ...eyebrow, paddingTop: 10 }}>Revisión técnica</div>
      {parque.revisionesVigentes == null ? (
        <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración {MIGRACION_REVISION} de la ficha de revisión.</div>
      ) : TIPOS_POR_CLASE[a.clase].map((tipo) => {
        const s = semaforo(vigenteDe(parque.revisionesVigentes, a.id, tipo), hoy)
        return (
          <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '12.5px' }}>
            <span style={{ color: V.apagado }}>{NOMBRE_REVISION[tipo]}</span>
            <span style={{ color: COLOR[s.tono], ...(s.tono === 'tenue' ? vacio : {}) }}>{s.texto}</span>
          </div>
        )
      })}
      <Link href={`/herramientas/mantenimiento?revision=${encodeURIComponent(a.codigo)}`} prefetch={false} style={{ fontSize: '12px', color: AZUL }} data-testid="ir-ficha-revision">
        Cargar revisiones o reportar una falla (Mantenimiento)
      </Link>
    </div>
  )
}
