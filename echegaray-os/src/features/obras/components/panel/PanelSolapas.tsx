'use client'

// LAS SOLAPAS AVANCE · HISTORIAL · DOCUMENTOS del panel de la tarea (mockup 04).
//
// Están en su propio archivo porque `PanelTarea.tsx` con las seis adentro pasaba el tope de 500
// líneas del repo. La solapa AVANCE es la que cierra el defecto #1 del dueño: el registro se hace
// ACÁ, embebido, sin navegar a `/obras/x/avance/<id>`.

import type { ReactNode } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { Cifra, Titulo } from './PanelPiezas'
import { Pastilla } from '../canon/Piezas'
import { fecha, hh as fmtHH, porcentaje } from '../formato'
import { METODO_LABEL } from '../../types'
import type { NodoObra } from '../../services/wbs'
import { avancePorPasos, hhProyectadas, proyeccionExcedida } from '../../services/avance'
import type { PasoDeActividad, RegistroAvance } from '../../services/tareasService'

/** Una fila de lista del panel: `padding:9px 0; borderBottom:1px solid #F5F4F0`. */
function Fila({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={{
      display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0',
      borderBottom: `1px solid ${C.bordeLista}`,
    }}>{children}</div>
  )
}

/**
 * SOLAPA AVANCE — el formulario embebido arriba y los pasos ponderados abajo.
 *
 * ═══ EL REGISTRO NO SE VA A OTRA PANTALLA (defecto #1 del dueño) ═══
 *
 * El formulario que se dibuja acá es el MISMO componente de la pantalla completa (`FormAvance` con
 * `variante="panel"`) y la MISMA server action: no es una segunda manera de escribir el avance, es
 * el mismo acto sin el viaje. Lo que la pantalla completa agrega es espacio para la evidencia y el
 * historial largo — no una regla distinta.
 *
 * `formulario` llega ya armado desde el panel: acá no se decide QUIÉN puede escribir, sólo dónde se
 * dibuja lo que se pueda escribir.
 */
export function SolapaAvance({ nodo, pasos, formulario }: {
  nodo: NodoObra
  pasos: PasoDeActividad[]
  formulario: ReactNode | null
}) {
  const avancePasos = avancePorPasos(pasos.map((p) => ({ peso: Number(p.peso), hecho: p.hecho_en !== null })))
  const proy = hhProyectadas(nodo.hh_real, nodo.avance_pct)
  const metodo = METODO_LABEL[nodo.metodo_avance]
  return (
    <section data-testid="panel-avance-solapa">
      {formulario && (
        <div style={{ marginBottom: '16px', borderBottom: `1px solid ${C.borde}`, paddingBottom: '16px' }}
          data-testid="panel-form-avance">{formulario}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: C.tinta }}>Método</div>
        <Pastilla tono={nodo.metodo_avance === 'pasos' ? 'curso' : 'neutro'}>{metodo}</Pastilla>
        <span title={nodo.metodo_avance === 'pasos'
          ? 'El avance sale de pasos definidos, no de un porcentaje libre'
          : `El avance de esta actividad se mide por ${metodo.toLowerCase()}`}
          style={{ display: 'flex', color: C.apagado, cursor: 'help' }}>
          <Ico d={P.info} s={13} />
        </span>
      </div>

      <div style={{ marginTop: '10px' }}>
        {pasos.length === 0 ? (
          <p style={{ fontSize: '12.5px', color: C.tintaSuave, margin: 0 }}>
            Sin pasos cargados: su avance se mide por <strong style={{ color: C.tinta }}>{metodo.toLowerCase()}</strong>.
          </p>
        ) : pasos.map((p) => (
          <Fila key={p.id}>
            <span style={{ display: 'flex', color: p.hecho_en ? C.pos : C.fantasma, flexShrink: 0 }}>
              <Ico d={p.hecho_en ? P.ok : P.pend} s={14} w={p.hecho_en ? 2.2 : 2} />
            </span>
            <span style={{
              fontSize: '12.5px', color: p.hecho_en ? C.tintaMedia : C.tintaSuave, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.nombre}</span>
            {p.tiempo_tecnico && <span style={{ fontSize: '10.5px', color: C.warn, flexShrink: 0 }}>tiempo técnico</span>}
            <span style={{
              marginLeft: 'auto', fontFamily: MONO, fontSize: '11.5px', color: C.tintaSuave, flexShrink: 0,
            }}>{p.peso}</span>
          </Fila>
        ))}
      </div>

      {pasos.length > 0 && (
        <>
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', color: C.tintaSuave }}>Avance resultante</span>
            <span style={{ fontFamily: MONO, fontSize: '17px', fontWeight: 600, color: C.tinta }}>
              {porcentaje(avancePasos) ?? 'sin base'}
            </span>
          </div>
          <div style={{ height: '6px', background: C.barraCanal, borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(100, Math.max(0, avancePasos ?? 0))}%`,
              background: nodo.es_critica ? C.warn : C.curso,
            }} />
          </div>
        </>
      )}

      {/* HH NO ES AVANCE: van al lado, con su propio rótulo. Es la regla del modelo. */}
      <section style={{ marginTop: '16px', borderTop: `1px solid ${C.borde}`, paddingTop: '12px' }}
        data-testid="hh-consumidas">
        <Titulo>HH consumidas — no es avance</Titulo>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <Cifra rotulo="Plan" valor={fmtHH(nodo.hh_plan)} falta="sin cargar" />
          <Cifra rotulo="Real" valor={fmtHH(nodo.hh_real)} falta="sin registro" />
          <Cifra rotulo="Proyectadas" valor={fmtHH(proy)} falta="sin base"
            alerta={proyeccionExcedida(proy, nodo.hh_plan)} />
        </div>
      </section>
    </section>
  )
}

/** SOLAPA HISTORIAL — lo que pasó, con quién lo firmó y de dónde entró. */
export function SolapaHistorial({ historial }: { historial: RegistroAvance[] }) {
  if (historial.length === 0) {
    return (
      <p data-testid="panel-historial" style={{ fontSize: '12.5px', color: C.tintaSuave, margin: 0 }}>
        Todavía no se registró un solo avance en esta actividad.
      </p>
    )
  }
  return (
    <section data-testid="panel-historial">
      {historial.slice(0, 30).map((h) => (
        <div key={h.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '9px 0',
          borderBottom: `1px solid ${C.bordeLista}`,
        }}>
          <span style={{ display: 'flex', color: C.tenue, marginTop: '1px', flexShrink: 0 }}>
            <Ico d={P.avance} s={14} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '12px', color: C.tinta }}>
              {h.criterio || h.comentario
                || (h.metodo ? METODO_LABEL[h.metodo as keyof typeof METODO_LABEL] ?? h.metodo : 'Avance registrado')}
            </div>
            <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>
              {fecha(h.fecha)} · {h.autor ?? 'sin firma'} · {h.fuente ?? 'sin origen'}
              {h.masivo && ' · en lote'}
            </div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tintaMedia, flexShrink: 0 }}>
            {h.avance_pct !== null ? porcentaje(h.avance_pct) : h.cantidad !== null ? String(h.cantidad) : '—'}
          </span>
        </div>
      ))}
    </section>
  )
}

/** SOLAPA DOCUMENTOS — los papeles colgados de esta actividad, más la puerta para colgar otro. */
export function SolapaDocumentos({ documentos, alSubir }: {
  documentos: { id: string; nombre: string; url: string }[]
  alSubir: ReactNode
}) {
  return (
    <section data-testid="panel-documentos">
      {documentos.length === 0 ? (
        <p style={{ fontSize: '12.5px', color: C.tintaSuave, margin: 0 }}>
          Ningún papel colgado de esta actividad.
        </p>
      ) : documentos.map((d) => (
        <a key={d.id} href={d.url} target="_blank" rel="noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0',
          borderBottom: `1px solid ${C.bordeLista}`,
        }}>
          <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}><Ico d={P.doc} s={14} /></span>
          <span style={{
            fontSize: '12.5px', color: C.tinta, minWidth: 0, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{d.nombre}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', color: C.fantasma, flexShrink: 0 }}>
            <Ico d={P.flecha} s={13} />
          </span>
        </a>
      ))}
      <div style={{ marginTop: '12px' }}>{alSubir}</div>
    </section>
  )
}

/**
 * EJECUCIÓN RECIENTE (mockup 03, dentro del Resumen del panel) — las últimas tres cargas se ven sin
 * cambiar de solapa: lo primero que se pregunta al abrir una actividad es cuándo se tocó por última
 * vez. La carga de HOY va sobre `#FEF9E6`, igual que la fila seleccionada del árbol.
 *
 * NO HAY COLUMNA DE HH aunque el zip la dibuje: `obra_ejecucion` no publica horas por registro, y
 * una columna vacía prometería un dato que la base no tiene. Queda declarado.
 */
export function EjecucionReciente({ historial, hoyISO, alVerHistorial }: {
  historial: RegistroAvance[]
  hoyISO: string
  alVerHistorial: () => void
}) {
  const cols = '64px 1fr 74px'
  return (
    <section style={{ marginTop: '18px' }} data-testid="ejecucion-reciente">
      <Titulo>Ejecución reciente</Titulo>
      <div style={{ border: `1px solid ${C.bordeTarjeta}`, borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: '6px', padding: '6px 9px',
          background: C.tenueFondo, borderBottom: `1px solid ${C.bordeTarjeta}`,
        }}>
          <span style={{ fontSize: '9.5px', color: C.tenue, letterSpacing: '.05em' }}>FECHA</span>
          <span style={{ fontSize: '9.5px', color: C.tenue, letterSpacing: '.05em' }}>CANT. / AVANCE</span>
          <span style={{ fontSize: '9.5px', color: C.tenue, letterSpacing: '.05em', textAlign: 'right' }}>QUIÉN</span>
        </div>
        {historial.slice(0, 3).map((h) => (
          <div key={h.id} title={h.criterio ?? h.comentario ?? undefined} style={{
            display: 'grid', gridTemplateColumns: cols, gap: '6px', padding: '7px 9px',
            borderBottom: `1px solid ${C.bordeLista}`,
            background: h.fecha.slice(0, 10) === hoyISO ? C.marcaSuave : 'transparent',
          }}>
            <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tintaSuave }}>{fecha(h.fecha)}</span>
            <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tinta }}>
              {h.avance_pct !== null ? porcentaje(h.avance_pct) : h.cantidad !== null ? String(h.cantidad) : '—'}
            </span>
            <span style={{
              fontSize: '11px', color: C.tintaMedia, textAlign: 'right', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{h.autor ?? 'sin firma'}</span>
          </div>
        ))}
        <button type="button" onClick={alVerHistorial} data-testid="ver-historial" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px',
          fontSize: '11.5px', color: C.tintaMedia, cursor: 'pointer', border: 'none',
          background: 'none', width: '100%', font: 'inherit',
        }}>
          Ver historial <Ico d={P.flecha} s={12} />
        </button>
      </div>
    </section>
  )
}
