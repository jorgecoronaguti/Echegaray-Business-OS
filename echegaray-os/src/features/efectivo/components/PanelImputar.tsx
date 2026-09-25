'use client'

// IMPUTAR UN COMPROBANTE YA CARGADO (dueño, 24/09/2026) — panel sobre la ficha de la entrega (D03).
//
// Corrige el caso que se escapaba: un ticket pagado con plata de la entrega que entró a Compras como
// «Efectivo» (por #comprobantes-gastos sin número ni iniciales). Se elige la fila, se ve qué va a pasar y
// se imputa. La base lo verifica todo de nuevo y encola el cambio de Tipo pago; el ✓ en el Sheet lo dice
// la cola, no esta pantalla. Mismo patrón visual que D06 (PanelDevolucion).

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { Entrega } from '../types'
import { ddmm, numero, pesos } from '../logica/entregas'
import { efectoDeImputar, filtrarCandidatas, ROTULO_EN_SHEET, type Candidata } from '../logica/imputar'
import { urlEfectivo } from '../logica/url'
import { desimputarCompraAction, imputarCompraAction } from '../services/acciones'
import type { LecturaImputar } from '../services/imputar'
import { Cerrar, ErrorPanel, PANEL_CLASE } from './Piezas'
import { MONO, V, botonClaro, botonOscuroGrande, cajaConfirmar, campo, eyebrow, panel } from './estilo'

export function PanelImputar({ e, destino, lectura }: { e: Entrega; destino: string; lectura: LecturaImputar }) {
  const router = useRouter()
  const cerrarHref = urlEfectivo({ entrega: e.codigo })
  const [busca, setBusca] = useState('')
  const [elegida, setElegida] = useState<Candidata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const candidatas = useMemo(() => (lectura.estado === 'ok' ? filtrarCandidatas(lectura.candidatas, busca) : []), [lectura, busca])

  const imputar = () => {
    if (!elegida) return
    setError(null)
    empezar(async () => {
      const r = await imputarCompraAction({ entrega: e.id, fila: elegida.fila, clave: elegida.clave })
      if (!r.ok) { setError(r.error); return }
      setHecho(`Fila ${r.dato.fila} imputada a ${r.dato.codigo}. El cambio a «A rendir» quedó en cola para el Sheet.`)
      setElegida(null)
      router.refresh()
    })
  }
  const deshacer = (rendicion: string) => {
    setError(null)
    empezar(async () => {
      const r = await desimputarCompraAction(rendicion)
      if (!r.ok) { setError(r.error); return }
      setHecho(`Deshecho: la fila vuelve a «${r.dato}» por la cola del Sheet.`)
      router.refresh()
    })
  }

  const fila = { display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 110px', gap: 12, minHeight: 44, alignItems: 'center', fontSize: '13px' } as const
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Imputar un comprobante ya cargado" data-testid="panel-imputar">
      <Cerrar titulo="Imputar un comprobante ya cargado" bajada={`${e.codigo} · ${e.persona} · ${destino}`} href={cerrarHref} />
      <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }}>
        Compras cargadas en <strong>Efectivo</strong> en los últimos 30 días que no están imputadas a ninguna entrega.
        Si {e.persona} pagó alguna con esta plata, elegila: pasa a «A rendir» y baja lo que tiene en su poder.
      </div>

      {lectura.estado === 'error' && <ErrorPanel texto={`No pude leer las compras: ${lectura.mensaje}`} />}
      {lectura.estado === 'ok' && (
        <>
          <input
            type="search" value={busca} onChange={(x) => setBusca(x.target.value)} placeholder="Proveedor, obra, número o fila"
            style={campo} aria-label="Buscar compra" data-testid="imputar-buscar"
          />
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 360, overflowY: 'auto' }} data-testid="imputar-lista">
            {candidatas.map((c) => {
              const activa = elegida?.fila === c.fila
              return (
                <button
                  key={c.fila} type="button" disabled={c.conPagoEnCola || pendiente}
                  onClick={() => { setElegida(activa ? null : c); setHecho(null) }}
                  data-testid="imputar-candidata" data-fila={c.fila} aria-pressed={activa}
                  style={{
                    ...fila, textAlign: 'left', border: 'none', borderBottom: `1px solid ${V.lineaFila}`, padding: '6px 8px',
                    background: activa ? '#F1F4FA' : 'transparent', cursor: c.conPagoEnCola ? 'not-allowed' : 'pointer', opacity: c.conPagoEnCola ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: V.apagado }}>{ddmm(c.fecha)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block' }}>{c.proveedor ?? 'sin proveedor'}</span>
                    <span className="truncate" style={{ display: 'block', fontSize: '11.5px', color: V.tenue }}>
                      fila {c.fila}{c.obra ? ` · ${c.obra}` : ''}{c.conPagoEnCola ? ' · tiene un pago esperando al Sheet' : ''}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: MONO }}>{numero(c.total)}</span>
                </button>
              )
            })}
            {!candidatas.length && (
              <div style={{ padding: '14px 0', fontSize: '12.5px', color: V.apagado }} data-testid="imputar-vacia">
                {busca ? 'Ninguna compra en efectivo coincide con la búsqueda.' : 'No hay compras en efectivo sin imputar en los últimos 30 días.'}
              </div>
            )}
          </div>
          {lectura.sinNumero > 0 && (
            <div style={{ fontSize: '12px', color: V.warn }} data-testid="imputar-sin-numero">
              {lectura.sinNumero} {lectura.sinNumero === 1 ? 'compra en efectivo no tiene' : 'compras en efectivo no tienen'} número de comprobante:
              sin número no se pueden atar a una entrega desde acá.
            </div>
          )}

          {elegida && (
            <div style={cajaConfirmar} data-testid="imputar-efecto">
              {efectoDeImputar({ total: elegida.total, enSuPoder: e.en_su_poder, persona: e.persona, codigo: e.codigo }).map((t) => (
                <div key={t} style={{ fontSize: '12.5px', lineHeight: 1.5 }}>{t}</div>
              ))}
            </div>
          )}
          <ErrorPanel texto={error} />
          {hecho && <div role="status" style={{ fontSize: '12.5px', color: V.pos }} data-testid="imputar-hecho">{hecho}</div>}
          <button
            type="button" onClick={imputar} disabled={!elegida || pendiente}
            style={{ ...botonOscuroGrande, opacity: !elegida || pendiente ? 0.5 : 1 }} data-testid="imputar-confirmar"
          >
            {pendiente ? 'Imputando…' : elegida ? `Imputar ${pesos(elegida.total)} a ${e.codigo}` : 'Elegí una compra'}
          </button>

          {lectura.reimputadas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 14, borderTop: `1px solid ${V.linea}` }} data-testid="imputar-hechas">
              <div style={eyebrow}>Imputadas a mano o por iniciales</div>
              {lectura.reimputadas.map((r) => (
                <div key={r.rendicion} style={{ ...fila, gridTemplateColumns: '48px minmax(0,1fr) 90px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: V.apagado }}>{ddmm(r.fecha)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block' }}>{r.proveedor ?? r.clave} · {pesos(r.total)}</span>
                    <span style={{ display: 'block', fontSize: '11.5px', color: r.enSheet === 'rechazado' ? V.warn : V.tenue }}>{ROTULO_EN_SHEET[r.enSheet]}</span>
                  </span>
                  <button type="button" onClick={() => deshacer(r.rendicion)} disabled={pendiente} style={{ ...botonClaro, height: 28, fontSize: '12px' }} data-testid="imputar-deshacer">
                    Deshacer
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
