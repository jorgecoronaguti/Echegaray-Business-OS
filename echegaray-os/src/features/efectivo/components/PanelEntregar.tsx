'use client'

// D02 · ENTREGAR EFECTIVO — cuatro datos, y lo que va a pasar dicho antes de confirmar.
//
// Del diseño NO se construye (dueño, 22/09/2026): «Rinde antes de», el estado «Bloqueado» y el chip de
// canal. No hay plazo ni bloqueo: si la persona ya tiene plata sin rendir, se le AVISA debajo del nombre y
// se puede entregar igual. El canal de Mattermost es uno nuevo que arma el dueño; la frase no lo nombra.

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { Entrega, ObraOpcion, PersonaOpcion } from '../types'
import { pesos, sinRendirDe } from '../logica/entregas'
import { frasesAlEntregar, validarEntrega, validarMonto, verboEntregar, type BorradorEntrega } from '../logica/formularios'
import { urlEfectivo } from '../logica/url'
import { entregarEfectivoAction } from '../services/acciones'
import { Campo, Cerrar, ErrorPanel, PANEL_CLASE } from './Piezas'
import {
  SUPERFICIE, V, areaTexto, botonClaroGrande, botonOscuroGrande, cajaConfirmar, campo, campoMonto, panel,
} from './estilo'

export function PanelEntregar({ personas, obras, entregas, cerrarHref }: {
  personas: PersonaOpcion[]
  obras: ObraOpcion[]
  entregas: Entrega[]
  cerrarHref: string
}) {
  const router = useRouter()
  const [b, setB] = useState<BorradorEntrega>({ persona: '', destino: 'obra', obra: '', monto: '', paraQue: '', esPrueba: false })
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const set = (x: Partial<BorradorEntrega>) => { setB((v) => ({ ...v, ...x })); setError(null) }

  const persona = personas.find((p) => p.id === b.persona) ?? null
  const obra = obras.find((o) => o.id === b.obra) ?? null
  const debe = useMemo(() => (b.persona ? sinRendirDe(b.persona, entregas) : null), [b.persona, entregas])
  const monto = (() => { const m = validarMonto(b.monto); return m.ok ? m.dato : null })()
  const activas = obras.filter((o) => o.activa)
  // LA OBRA YA SE SABE: la persona está asignada a una. Se propone sola (si está activa y no se eligió
  // otra); se puede cambiar. Un dato que la base ya tiene no se vuelve a preguntar.
  const conObraDe = (id: string): Partial<BorradorEntrega> => {
    const suya = personas.find((p) => p.id === id)?.obraActual ?? null
    const propone = !b.obra && b.destino === 'obra' && suya && activas.some((o) => o.id === suya)
    return propone ? { persona: id, obra: suya } : { persona: id }
  }

  const confirmar = () => {
    const v = validarEntrega(b)
    if (!v.ok) { setError(v.error); return }
    empezar(async () => {
      const r = await entregarEfectivoAction(b)
      if (!r.ok) { setError(r.error); return }
      router.push(urlEfectivo({ entrega: r.dato }))
    })
  }

  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Entregar efectivo" data-testid="panel-entregar">
      <Cerrar titulo="Entregar efectivo" bajada="Sale de la caja. No es gasto de obra hasta que se rinda." href={cerrarHref} />

      <Campo rotulo="A quién">
        <select
          value={b.persona} onChange={(e) => set(conObraDe(e.target.value))} style={{ ...campo, borderColor: V.grafito }}
          data-testid="entregar-persona" aria-label="A quién"
        >
          <option value="">Elegí a la persona</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ''}</option>)}
        </select>
        {debe && debe.total > 0 && (
          <div style={{ fontSize: '12px', color: V.apagado }} data-testid="entregar-ya-tiene">
            Ya tiene {pesos(debe.total)} sin rendir de {debe.codigos.join(', ')}.
          </div>
        )}
      </Campo>

      <Campo rotulo="Destino económico">
        <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label="Destino económico">
          {(['obra', 'estructura'] as const).map((d) => (
            <button
              key={d} type="button" role="radio" aria-checked={b.destino === d} onClick={() => set({ destino: d })}
              data-testid={`entregar-destino-${d}`}
              style={{
                flex: 1, height: 34, borderRadius: 6, fontSize: '13px', cursor: 'pointer',
                border: `1px solid ${b.destino === d ? V.grafito : V.lineaFuerte}`,
                background: b.destino === d ? SUPERFICIE : '#FFFFFF',
                color: b.destino === d ? V.tinta : V.apagado, fontWeight: b.destino === d ? 500 : 400,
              }}
            >
              {d === 'obra' ? 'Una obra' : 'Estructura'}
            </button>
          ))}
        </div>
        {b.destino === 'obra' && (
          <select value={b.obra} onChange={(e) => set({ obra: e.target.value })} style={campo} data-testid="entregar-obra" aria-label="Obra">
            <option value="">Elegí la obra</option>
            {activas.map((o) => <option key={o.id} value={o.id}>{o.nombre}{o.cliente ? ` · ${o.cliente}` : ''}</option>)}
          </select>
        )}
        <div style={{ fontSize: '12px', color: V.apagado }}>Obligatorio: una de las dos. Sin destino la plata queda sin imputar, y eso ya pasó.</div>
      </Campo>

      <Campo rotulo="Monto">
        <input
          value={b.monto} onChange={(e) => set({ monto: e.target.value })} inputMode="decimal" placeholder="$ 0"
          style={campoMonto} data-testid="entregar-monto" aria-label="Monto"
        />
      </Campo>

      <Campo rotulo="Para qué">
        <textarea
          value={b.paraQue} onChange={(e) => set({ paraQue: e.target.value })} rows={2} maxLength={400}
          style={areaTexto} data-testid="entregar-para-que" aria-label="Para qué"
        />
      </Campo>

      {/* ═══ PROBAR SIN ENSUCIAR (dueño, 23/09/2026) ═══
          «voy a hacer muchas pruebas del modulo efectivo por todos lados […] q se quite de pestañas
          compras caja y no quede guardado». La marca va acá y no en una pantalla de configuración
          porque se decide al crear la entrega y no se puede cambiar después: una entrega que ya salió
          a la caja no puede volverse prueba para poder borrarla. */}
      <label
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '12.5px', color: V.tintaSuave,
          border: `1px solid ${b.esPrueba ? V.warn : V.lineaFuerte}`, borderRadius: 10, padding: '10px 12px',
          background: b.esPrueba ? '#FDF6EE' : 'transparent', cursor: 'pointer',
        }}
        data-testid="entregar-es-prueba"
      >
        <input
          type="checkbox" checked={b.esPrueba === true} onChange={(e) => set({ esPrueba: e.target.checked })}
          style={{ marginTop: 2 }} aria-label="Es una prueba"
        />
        <span>
          <span style={{ fontWeight: 600, color: b.esPrueba ? V.warn : V.tinta }}>Es una prueba</span>
          <span style={{ display: 'block', marginTop: 2, lineHeight: 1.45 }}>
            No sale de la CAJA, no escribe en Compras y se borra entera cuando quieras. Una entrega
            real no se borra: se anula.
          </span>
        </span>
      </label>

      <div style={cajaConfirmar} data-testid="entregar-al-confirmar">
        <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Al confirmar</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
          {frasesAlEntregar({
            monto, persona: persona?.nombre ?? null, obra: b.destino === 'obra' ? (obra?.nombre ?? null) : null,
            estructura: b.destino === 'estructura',
          }).map((f) => <div key={f}>{f}</div>)}
        </div>
      </div>

      <ErrorPanel texto={error} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" onClick={confirmar} disabled={pendiente} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="entregar-confirmar">
          {pendiente ? 'Entregando…' : verboEntregar(monto)}
        </button>
        <button type="button" onClick={() => router.push(cerrarHref)} style={botonClaroGrande}>Cancelar</button>
      </div>
    </aside>
  )
}
