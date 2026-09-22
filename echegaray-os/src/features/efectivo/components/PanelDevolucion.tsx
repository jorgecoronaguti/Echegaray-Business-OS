'use client'

// D06 · DEVOLUCIÓN Y CIERRE — el vuelto vuelve a caja y la entrega queda en cero.
//
// «Registrar y cerrar» cierra SÓLO si la devolución deja la entrega en cero (lo decide la base); si devuelve
// menos, sigue abierta con el resto. «Sólo registrar» nunca cierra. El comprobante de devolución con las
// dos firmas es de la etapa de recibos y no se promete acá.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Entrega, PersonaOpcion } from '../types'
import { pesos } from '../logica/entregas'
import { efectoDevolucion, validarDevolucion, validarMonto } from '../logica/formularios'
import { urlEfectivo } from '../logica/url'
import { registrarDevolucionAction } from '../services/acciones'
import { Campo, Cerrar, ErrorPanel, PANEL_CLASE } from './Piezas'
import { CAJA_POS, MONO, V, botonClaroGrande, botonOscuroGrande, cajaConfirmar, campo, campoMonto, panel } from './estilo'

export function PanelDevolucion({ e, destino, porImputar, personas, miPersona }: {
  e: Entrega
  destino: string
  porImputar: number
  personas: PersonaOpcion[]
  miPersona: string | null
}) {
  const router = useRouter()
  const cerrarHref = urlEfectivo({ entrega: e.codigo })
  const [monto, setMonto] = useState(e.en_su_poder > 0 ? String(e.en_su_poder).replace('.', ',') : '')
  const [recibe, setRecibe] = useState(miPersona && personas.some((p) => p.id === miPersona) ? miPersona : '')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const leido = validarMonto(monto)
  const efecto = efectoDevolucion(leido.ok ? leido.dato : null, e.en_su_poder)

  const registrar = (cerrar: boolean) => {
    const v = validarDevolucion(monto, e.en_su_poder)
    if (!v.ok) { setError(v.error); return }
    empezar(async () => {
      const r = await registrarDevolucionAction({ entrega: e.id, monto, recibidaPor: recibe || null, cerrar })
      if (!r.ok) { setError(r.error); return }
      router.push(cerrarHref, { scroll: false })
    })
  }

  const fila = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px', gap: 18, minHeight: 38, alignItems: 'center', fontSize: '13.5px' } as const
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Registrar devolución" data-testid="panel-devolucion">
      <Cerrar titulo="Registrar devolución" bajada={`${e.codigo} · ${e.persona} · ${destino}`} href={cerrarHref} />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...fila, borderBottom: `1px solid ${V.lineaFila}` }}>
          <span style={{ color: V.tintaSuave }}>En su poder hoy</span>
          <span style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 600 }}>{pesos(e.en_su_poder)}</span>
        </div>
        <div style={fila}>
          <span style={{ color: V.tintaSuave }}>Comprobantes por imputar</span>
          <span style={{ textAlign: 'right', fontFamily: MONO, color: porImputar ? V.warn : V.tenue }}>{porImputar || 'ninguno'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 170px', gap: 14 }}>
        <Campo rotulo="Devuelve">
          <input
            value={monto} onChange={(x) => { setMonto(x.target.value); setError(null) }} inputMode="decimal"
            style={{ ...campoMonto, borderColor: V.grafito }} aria-label="Devuelve" data-testid="devolucion-monto"
          />
        </Campo>
        {/* LA DEVOLUCIÓN ENTRA A EFECTIVO: es la única caja que la base registra para esto (`efectivo_movimiento_caja`). */}
        <Campo rotulo="Entra a">
          <select value="Efectivo" disabled style={{ ...campo, color: V.tinta, background: '#FFFFFF' }} aria-label="Entra a">
            <option>Efectivo</option>
          </select>
        </Campo>
      </div>

      <Campo rotulo="Quién la recibe">
        <select value={recibe} onChange={(x) => setRecibe(x.target.value)} style={campo} aria-label="Quién la recibe" data-testid="devolucion-recibe">
          <option value="">Elegí quién la recibe</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ''}</option>)}
        </select>
      </Campo>

      {leido.ok && (efecto.cierra ? (
        <div style={{ ...cajaConfirmar, ...CAJA_POS }} data-testid="devolucion-efecto">
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: V.pos }}>La entrega queda en cero y se cierra</div>
          <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>Entran {pesos(leido.dato)} a Efectivo.</div>
        </div>
      ) : (
        <div style={cajaConfirmar} data-testid="devolucion-efecto">
          <div style={{ fontSize: '12.5px', fontWeight: 600 }}>La entrega sigue abierta</div>
          <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
            Entran {pesos(leido.dato)} a Efectivo y le quedan {pesos(efecto.resto)} en su poder.
          </div>
        </div>
      ))}

      {/* EN CERO NO HAY NADA QUE DEVOLVER, y la base no tiene hoy cómo cerrar una entrega rendida entera
          (`registrar_devolucion_efectivo` pide monto > 0). Se dice en vez de ofrecer un botón que rebota. */}
      {e.en_su_poder <= 0 && (
        <div style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="devolucion-sin-saldo">
          No tiene efectivo en su poder: no hay nada que devolver.
        </div>
      )}

      <ErrorPanel texto={error} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => registrar(true)} disabled={pendiente || e.en_su_poder <= 0} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="devolucion-cerrar">
          {pendiente ? 'Registrando…' : 'Registrar y cerrar'}
        </button>
        <button type="button" onClick={() => registrar(false)} disabled={pendiente || e.en_su_poder <= 0} style={botonClaroGrande} data-testid="devolucion-solo">
          Sólo registrar
        </button>
      </div>
      <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
        Si devolviera menos de lo que tiene, la entrega sigue abierta con el resto: el cierre no fuerza el cero.
      </div>
    </aside>
  )
}
