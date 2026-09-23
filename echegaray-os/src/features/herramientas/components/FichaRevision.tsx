'use client'

// LA FICHA DE REVISIÓN DE UN RODADO O MÁQUINA (Mantenimiento, lado derecho; dueño 23/09): qué revisión
// vence cuándo, el formulario para cargar la siguiente, y el historial que prueba que se hizo.
//
// El semáforo lo decide `logica/revision.ts` con la fecha de hoy; la base sólo dice los días. El
// historial no se borra: cada RTO o service nuevo es una fila más, y la vieja queda como evidencia.

import Link from 'next/link'
import { useState } from 'react'
import {
  historialDe, MIGRACION_REVISION, NOMBRE_RESULTADO, NOMBRE_REVISION, seRevisa, semaforo, textoLecturaRevision, TIPOS_POR_CLASE, UNIDAD_LECTURA, vigenteDe,
  type Revision, type TipoRevision,
} from '../logica/revision'
import { useHerramientas } from './Espacio'
import { FormularioRevision } from './FormularioRevision'
import { AZUL, MONO, V, botonPrimario, eyebrow, vacio } from './estilo'
import { diaMesAnio, pesos } from './formato'

const COLOR = { neg: V.neg, warn: V.warn, pos: V.pos, tenue: V.tenue } as const

export function FichaRevision({ id, onCerrar }: { id: string; onCerrar?: () => void }) {
  const { parque, avisar, refrescar } = useHerramientas()
  const [cargando, setCargando] = useState<TipoRevision | null>(null)
  const a = parque.activoPorId.get(id)
  if (!a) return null
  if (!seRevisa(a)) {
    return <div style={{ fontSize: '13px', color: V.apagado }}>La ficha de revisión es de rodados y máquinas vivos.</div>
  }
  const sinBase = parque.revisionesVigentes == null
  const historial = historialDe(parque.revisiones, a.id)
  const hoy = new Date()
  const unidad = UNIDAD_LECTURA[a.clase]

  return (
    <div data-testid="ficha-revision" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em' }}>{a.nombre}</div>
          <div style={{ fontSize: '12.5px', color: V.apagado }}>
            <span style={{ fontFamily: MONO }}>{a.codigo}</span>{a.patente ? ` · ${a.patente}` : ''} · ficha de revisión
            {' · '}<Link href={`/herramientas/inventario?clase=todo&activo=${encodeURIComponent(a.codigo)}`} prefetch={false} style={{ color: AZUL }}>ver la ficha del activo</Link>
          </div>
        </div>
        {onCerrar && (
          <button type="button" onClick={onCerrar} aria-label="Cerrar la ficha" data-testid="cerrar-ficha-revision"
            style={{ width: 28, height: 28, borderRadius: 6, fontSize: '18px', lineHeight: 1, color: V.tenue, border: `1px solid ${V.linea}` }}>×</button>
        )}
      </div>

      {sinBase ? (
        <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración {MIGRACION_REVISION} de la ficha de revisión: todavía no se puede cargar.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="revision-vigentes">
          <div style={eyebrow}>Vigente por tipo</div>
          {TIPOS_POR_CLASE[a.clase].map((tipo) => {
            const r = vigenteDe(parque.revisionesVigentes, a.id, tipo)
            const s = semaforo(r, hoy)
            return (
              <div key={tipo} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) auto', gap: 12, alignItems: 'baseline', minHeight: 30, borderBottom: `1px solid ${V.linea}`, fontSize: '13px' }} data-testid={`vigente-${tipo}`}>
                <span style={{ fontWeight: 500 }}>{NOMBRE_REVISION[tipo]}</span>
                <span style={{ color: COLOR[s.tono], fontWeight: s.alerta ? 500 : 400, ...(s.tono === 'tenue' ? vacio : {}) }}>
                  {s.texto}{r?.resultado && r.resultado !== 'rechazado' ? ` · ${NOMBRE_RESULTADO[r.resultado].toLowerCase()}` : ''}{r?.lectura != null ? ` · ${textoLecturaRevision(r.lectura, unidad)}` : ''}
                </span>
                <button type="button" onClick={() => setCargando(tipo)} style={{ fontSize: '12px', color: V.apagado, textDecoration: 'underline', textDecorationColor: V.linea }} data-testid={`cargar-${tipo}`}>
                  cargar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!sinBase && (cargando ? (
        <div style={{ paddingTop: 4, borderTop: `1px solid ${V.linea}` }}>
          <div style={{ ...eyebrow, padding: '10px 0' }}>Cargar {NOMBRE_REVISION[cargando]}</div>
          <FormularioRevision
            key={cargando} activo={a.id} clase={a.clase} tipoInicial={cargando}
            onCancelar={() => setCargando(null)}
            onHecho={(t) => { setCargando(null); avisar(`${a.nombre}: ${t}`); refrescar() }}
          />
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setCargando(TIPOS_POR_CLASE[a.clase][0])} style={botonPrimario} data-testid="nueva-revision">Cargar una revisión</button>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, borderTop: `1px solid ${V.linea}` }}>
        <div style={{ ...eyebrow, paddingTop: 10 }}>Historial <span style={{ color: V.tenue }}>{historial.length}</span></div>
        {historial.length === 0 && <div style={{ ...vacio, fontSize: '12.5px' }}>{sinBase ? 'sin la migración' : 'Ninguna revisión cargada todavía.'}</div>}
        {historial.map((r) => <UnaRevision key={r.id} r={r} unidad={unidad} quien={r.creado_por ? parque.nombres[r.creado_por] ?? null : null} />)}
      </div>
    </div>
  )
}

function UnaRevision({ r, unidad, quien }: { r: Revision; unidad: 'km' | 'h'; quien: string | null }) {
  const detalle = [
    r.resultado ? NOMBRE_RESULTADO[r.resultado] : null,
    r.lectura != null ? textoLecturaRevision(r.lectura, unidad) : null,
    r.numero ? `N° ${r.numero}` : null,
    r.lugar,
    r.costo != null ? pesos(r.costo) : null,
    r.vencimiento ? `vence ${diaMesAnio(r.vencimiento)}` : null,
  ].filter(Boolean)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: 12, fontSize: '12.5px' }} data-testid="revision-historial">
      <div style={{ color: V.tenue }}>{diaMesAnio(r.fecha)}</div>
      <div style={{ color: V.tintaSuave, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span><b style={{ fontWeight: 500 }}>{NOMBRE_REVISION[r.tipo]}</b>{detalle.length ? ` · ${detalle.join(' · ')}` : ''}{quien ? <span style={{ color: V.tenue }}> · {quien}</span> : null}</span>
        {r.observaciones && <span style={{ color: V.tenue }}>{r.observaciones}</span>}
        {r.adjunto_url && <a href={r.adjunto_url} target="_blank" rel="noreferrer" style={{ color: AZUL }}>Ver la foto</a>}
      </div>
    </div>
  )
}

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
        Ficha de revisión (Mantenimiento)
      </Link>
    </div>
  )
}
