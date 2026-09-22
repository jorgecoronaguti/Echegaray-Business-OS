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
import { cerrarEntregaAction, registrarDevolucionAction } from '../services/acciones'
import { FirmaEnElPanel } from './FirmaEnElPanel'
import { Campo, Cerrar, ErrorPanel, PANEL_CLASE } from './Piezas'
import { CAJA_POS, MONO, V, botonClaroGrande, botonOscuroGrande, cajaConfirmar, campo, campoMonto, panel } from './estilo'

/**
 * QUÉ VA A QUEDAR DEL COMPROBANTE, DICHO ANTES DE APRETAR.
 *
 * El diseño promete el comprobante «con las dos firmas». La de quien recibe se toma acá; la de quien
 * devolvió es de su teléfono. Si acá no se firmó, el papel nace sin ninguna: se dice, no se promete.
 */
export function textoDelComprobante(firma: string | null): string {
  return firma
    ? 'Queda el comprobante de devolución firmado por quien recibe; falta la firma de quien devolvió, que la da desde su teléfono.'
    : 'Sin firmar, el comprobante de devolución queda sin ninguna de las dos firmas.'
}

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
  const [firma, setFirma] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const leido = validarMonto(monto)
  const efecto = efectoDevolucion(leido.ok ? leido.dato : null, e.en_su_poder, porImputar)
  // QA 22/09: con más que el saldo la vista previa decía «le quedan −$ 3,50» y los botones seguían activos.
  const valida = validarDevolucion(monto, e.en_su_poder)
  const excede = leido.ok && !valida.ok

  const registrar = (cerrar: boolean) => {
    const v = validarDevolucion(monto, e.en_su_poder)
    if (!v.ok) { setError(v.error); return }
    empezar(async () => {
      const r = await registrarDevolucionAction({ entrega: e.id, monto, recibidaPor: recibe || null, cerrar, firmaRecibe: firma })
      if (!r.ok) { setError(r.error); return }
      router.push(cerrarHref, { scroll: false })
    })
  }

  // Rendida entera: no hay nada que devolver, se cierra (migración 20260922T1700).
  const cerrarRendida = () => {
    empezar(async () => {
      const r = await cerrarEntregaAction(e.id)
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
        {/* ═══ «ENTRA A» NO ES UNA ELECCIÓN, Y DECIRLO ES MEJOR QUE UN DESPLEGABLE MUDO ═══
            El diseño dibuja un menú. La base tiene UNA sola caja para esto: `efectivo_movimiento_caja`
            alimenta la réplica de CAJA del Sheet y no conoce otra. Una devolución «al banco» sería un
            depósito —otro hecho económico, con su movimiento bancario— y no existe. Un desplegable con
            una sola opción, apagado, obliga a abrirlo para descubrir que no hay nada: se dice el destino
            y por qué es el único. */}
        <Campo rotulo="Entra a">
          <div style={{ ...campo, display: 'flex', alignItems: 'center' }} data-testid="devolucion-entra-a">Efectivo</div>
        </Campo>
      </div>
      <div style={{ fontSize: '11.5px', color: V.apagado, marginTop: -8 }}>
        El vuelto vuelve al cajón. Depositarlo es otro movimiento y se registra en el banco.
      </div>

      <Campo rotulo="Quién la recibe">
        <select value={recibe} onChange={(x) => setRecibe(x.target.value)} style={campo} aria-label="Quién la recibe" data-testid="devolucion-recibe">
          <option value="">Elegí quién la recibe</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ''}</option>)}
        </select>
      </Campo>

      {/* EL COMPROBANTE SE FIRMA ACÁ, con la persona enfrente. La otra firma es de su teléfono. */}
      {e.en_su_poder > 0 && <FirmaEnElPanel rotulo="Firma de quien recibe" onCambio={setFirma} />}

      {excede && !valida.ok && (
        <div style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="devolucion-excede">{valida.error}</div>
      )}
      {leido.ok && !excede && (efecto.cierra ? (
        <div style={{ ...cajaConfirmar, ...CAJA_POS }} data-testid="devolucion-efecto">
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: V.pos }}>La entrega queda en cero y se cierra</div>
          <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
            Entran {pesos(leido.dato)} a Efectivo. {textoDelComprobante(firma)}
          </div>
        </div>
      ) : (
        <div style={cajaConfirmar} data-testid="devolucion-efecto">
          <div style={{ fontSize: '12.5px', fontWeight: 600 }}>La entrega sigue abierta</div>
          <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
            {efecto.frena
              // NO SE PROMETE UN CIERRE QUE LA BASE VA A NEGAR (20260922T3000).
              ? `Entran ${pesos(leido.dato)} a Efectivo y le queda $ 0 en su poder, pero la entrega NO se cierra: ${porImputar === 1 ? 'queda un ticket' : `quedan ${porImputar} tickets`} sin llegar a Compras. Se cierra cuando estén imputados o descartados.`
              : `Entran ${pesos(leido.dato)} a Efectivo y le quedan ${pesos(efecto.resto)} en su poder.`}
            {' '}{textoDelComprobante(firma)}
          </div>
        </div>
      ))}

      {/* EN CERO NO HAY NADA QUE DEVOLVER: la entrega rendida entera se cierra con su propia función
          (`cerrar_entrega_efectivo`, 20260922T1700), que la rechaza si queda un ticket en camino. */}
      {e.en_su_poder === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} data-testid="devolucion-sin-saldo">
          <span style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.5 }}>No tiene efectivo en su poder: no hay nada que devolver.</span>
          <button type="button" onClick={cerrarRendida} disabled={pendiente} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="entrega-cerrar-rendida">
            {pendiente ? 'Cerrando…' : 'Cerrar la entrega'}
          </button>
        </div>
      )}
      {e.en_su_poder < 0 && (
        <div style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="devolucion-rindio-de-mas">
          Rindió más de lo que se le entregó: no hay nada que devolver.
        </div>
      )}

      <ErrorPanel texto={error} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => registrar(true)} disabled={pendiente || excede || e.en_su_poder <= 0} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="devolucion-cerrar">
          {pendiente ? 'Registrando…' : 'Registrar y cerrar'}
        </button>
        <button type="button" onClick={() => registrar(false)} disabled={pendiente || excede || e.en_su_poder <= 0} style={botonClaroGrande} data-testid="devolucion-solo">
          Sólo registrar
        </button>
      </div>
      <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
        Si devolviera menos de lo que tiene, la entrega sigue abierta con el resto: el cierre no fuerza el cero.
      </div>
    </aside>
  )
}
