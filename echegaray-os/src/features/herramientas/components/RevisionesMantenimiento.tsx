'use client'

// RODADOS Y MÁQUINAS · REVISIÓN TÉCNICA (Mantenimiento; dueño 23/09) — cada uno con lo que vence antes.
// Lo vencido arriba en rojo, lo por vencer en ámbar, lo al día en verde y lo sin cargar al final, tenue:
// «sin cargar» no es «al día». Tocar una fila abre la ficha de revisión al costado.

import { usePathname, useRouter } from 'next/navigation'
import { cuantosConAlerta, listaDeRevision, MIGRACION_REVISION, NOMBRE_REVISION, textoLecturaRevision, UNIDAD_LECTURA } from '../logica/revision'
import { rotuloUbicacion, type Parque } from '../logica/parque'
import { SUPERFICIE, V, eyebrow } from './estilo'

const COLS = 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr) 110px'
const COLOR = { neg: V.neg, warn: V.warn, pos: V.pos, tenue: V.tenue } as const

export function RevisionesMantenimiento({ parque, elegido }: { parque: Parque; elegido: string | null }) {
  const router = useRouter()
  const ruta = usePathname()
  const sinBase = parque.revisionesVigentes == null
  const filas = listaDeRevision(parque.activos, parque.revisionesVigentes, new Date())
  if (filas.length === 0) return null
  const alerta = cuantosConAlerta(filas, sinBase)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="revisiones-mantenimiento">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600 }}>Rodados y máquinas · revisión técnica</h2>
        <span style={{ fontSize: '12.5px', color: alerta ? V.neg : V.apagado }}>
          {filas.length} · {sinBase ? `falta la migración ${MIGRACION_REVISION}` : alerta === 0 ? 'nada vencido ni por vencer' : `${alerta} con algo vencido o por vencer`}
        </span>
      </div>
      <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 30, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
        <div>Activo</div><div>Dónde está</div><div>Próximo vencimiento</div><div style={{ textAlign: 'right' }}>Lectura</div>
      </div>
      {filas.map(({ activo: a, proximo }) => {
        const on = elegido === a.codigo
        const s = proximo?.semaforo ?? { tono: 'tenue' as const, texto: sinBase ? 'sin la migración' : 'sin cargar', alerta: false }
        return (
          <button
            key={a.id} type="button" data-testid="item-revision" className="hover:bg-surface-quiet"
            onClick={() => router.replace(`${ruta}?revision=${encodeURIComponent(a.codigo)}`, { scroll: false })}
            style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 42, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '13.5px', textAlign: 'left', background: on ? SUPERFICIE : undefined }}
          >
            <div style={{ fontWeight: 500 }}>{a.nombre}{a.patente && !a.nombre.includes(a.patente) ? <span style={{ color: V.apagado, fontWeight: 400 }}> · {a.patente}</span> : null}</div>
            <div style={{ color: a.ubicacion_id ? V.tintaSuave : V.tenue, fontStyle: a.ubicacion_id ? undefined : 'italic' }}>{rotuloUbicacion(parque, a.ubicacion_id)}</div>
            <div style={{ color: COLOR[s.tono], fontWeight: s.alerta ? 500 : 400, fontStyle: s.tono === 'tenue' ? 'italic' : undefined }}>
              {proximo ? `${NOMBRE_REVISION[proximo.tipo]} ${s.texto}` : s.texto}
            </div>
            <div style={{ textAlign: 'right', color: proximo?.revision.lectura != null ? V.tintaSuave : V.tenue, fontStyle: proximo?.revision.lectura != null ? undefined : 'italic' }}>
              {textoLecturaRevision(proximo?.revision.lectura, UNIDAD_LECTURA[a.clase as 'rodado' | 'equipo'])}
            </div>
          </button>
        )
      })}
      <div style={{ fontSize: '12.5px', color: V.apagado }}>Se avisa a 30 días. Una RTO rechazada va en rojo aunque el certificado tenga fecha: no circula.</div>
    </div>
  )
}
