'use client'

// LA FICHA DE REVISIÓN EN EL TELÉFONO — lo vigente arriba con su semáforo, el formulario grande y el
// historial plegado. La misma pieza de formulario que Mantenimiento (`FormularioRevision`): las dos caras
// escriben igual y leen lo mismo.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  NOMBRE_RESULTADO, NOMBRE_REVISION, semaforo, textoLecturaRevision, UNIDAD_LECTURA,
  type ClaseRevisable, type Revision, type RevisionVigente, type TipoRevision,
} from '../../logica/revision'
import { FormularioRevision } from '../FormularioRevision'
import { V, eyebrow } from '../estilo'
import { diaMesAnio } from '../formato'

const COLOR = { neg: V.neg, warn: V.warn, pos: V.pos, tenue: V.tenue } as const

export function RevisionTelefono({ activo, vigentes, historial, volverA }: {
  activo: { id: string; clase: ClaseRevisable; nombre: string }
  vigentes: { tipo: TipoRevision; revision: RevisionVigente | null }[]
  historial: Revision[]
  volverA: string
}) {
  const router = useRouter()
  const [hecho, setHecho] = useState<string | null>(null)
  const hoy = new Date()
  const unidad = UNIDAD_LECTURA[activo.clase]
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="revision-vigentes-telefono">
        <div style={eyebrow}>Vigente</div>
        {vigentes.map(({ tipo, revision: r }) => {
          const s = semaforo(r, hoy)
          return (
            <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, minHeight: 44, borderBottom: `1px solid ${V.linea}` }}>
              <span style={{ fontSize: '15px', fontWeight: 500 }}>{NOMBRE_REVISION[tipo]}</span>
              <span style={{ fontSize: '13.5px', color: COLOR[s.tono], fontStyle: s.tono === 'tenue' ? 'italic' : undefined, textAlign: 'right' }}>
                {s.texto}{r?.lectura != null ? ` · ${textoLecturaRevision(r.lectura, unidad)}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {hecho ? (
        <div role="status" style={{ fontSize: '14.5px', color: V.pos, lineHeight: 1.5 }} data-testid="revision-hecha">{hecho}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={eyebrow}>Cargar una revisión</div>
          <FormularioRevision
            activo={activo.id} clase={activo.clase} variante="telefono"
            onHecho={(t) => { setHecho(`${activo.nombre}: ${t}`); router.refresh(); router.push(volverA) }}
          />
        </div>
      )}

      <details>
        <summary style={{ minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', cursor: 'pointer', listStyle: 'none' }}>
          Historial <span style={{ marginLeft: 10, color: V.tenue }}>{historial.length}</span><span style={{ marginLeft: 'auto', color: V.tenue }}>›</span>
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14, fontSize: '13px' }} data-testid="historial-revision">
          {historial.length === 0 && <span style={{ fontStyle: 'italic', color: V.tenue }}>Ninguna revisión cargada todavía.</span>}
          {historial.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', gap: 10 }}>
              <span style={{ color: V.tenue }}>{diaMesAnio(r.fecha)}</span>
              <span style={{ color: V.tintaSuave }}>
                {NOMBRE_REVISION[r.tipo]}{r.resultado ? ` · ${NOMBRE_RESULTADO[r.resultado]}` : ''}{r.lectura != null ? ` · ${textoLecturaRevision(r.lectura, unidad)}` : ''}{r.lugar ? ` · ${r.lugar}` : ''}{r.vencimiento ? ` · vence ${diaMesAnio(r.vencimiento)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </details>
    </>
  )
}
