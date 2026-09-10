'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { reabrirQuincena } from '../../../services/liquidacionActions'
import type { DiferenciaDeReapertura } from '../../../services/liquidacionCierre'
import { ALTO_LIQ } from './tabla'

// REABRIR CON MOTIVO — y con la diferencia A LA VISTA ANTES de guardar (R6).
//
// El dueño lo pidió con esas palabras: «recalcula con la retribución vigente y avisa la diferencia
// ANTES de guardar». Por eso el aviso no es la respuesta de la acción: llega calculado desde el
// servidor (`avisoDeReapertura`, núcleo puro) y se dibuja al abrir el panel. Mostrarlo después de
// reabrir sería pedirle a alguien que compare contra un número que ya no existe.

const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`

export interface VentanaDeReapertura { desde: string; hasta: string; grupo: string }

export function ReabrirQuincena({ ventanas, cambian, total, sinCambios }: {
  ventanas: readonly VentanaDeReapertura[]
  cambian: readonly DiferenciaDeReapertura[]
  total: number
  sinCambios: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()

  const confirmar = () => empezar(async () => {
    for (const v of ventanas) {
      const r = await reabrirQuincena({ ...v, motivo })
      if (!r.ok) { setAviso(r.error); return }
    }
    setAviso('Quincena reabierta.')
    setAbierto(false)
  })

  return (
    <>
      <button type="button" data-testid="reabrir-boton" onClick={() => setAbierto((v) => !v)} style={boton}>
        {abierto ? 'Cancelar' : 'Reabrir con motivo'}
      </button>
      {abierto && (
        <div data-testid="reabrir-panel" style={{
          marginTop: 14, border: `1px solid ${V.lineaFuerte}`, borderRadius: 10,
          background: '#FFFFFF', padding: '16px 18px',
        }}>
          <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: 8 }}>
            Lo que cambiaría al recalcular con la retribución vigente
          </div>
          {sinCambios ? (
            <p data-testid="reapertura-sin-cambios" style={{ margin: '0 0 12px', fontSize: '12.5px', color: V.apagado }}>
              Ninguna línea cambia: recalcular con el $/h de hoy no mueve un peso.
            </p>
          ) : (
            <div data-testid="reapertura-diferencias" style={{ marginBottom: 12 }}>
              {cambian.map((f) => (
                <div key={f.personaId} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 16, minHeight: ALTO_LIQ.renglonBajo,
                  alignItems: 'center', borderBottom: `1px solid ${V.lineaFila}`,
                  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
                }}>
                  <span>{f.nombre}</span>
                  <span style={{ color: V.apagado }}>
                    {pesos(f.valorHoraSellado)} → {pesos(f.valorHoraHoy)}
                  </span>
                  <span style={{ color: V.warn }}>
                    {f.diferencia == null ? 'sin dato' : `${f.diferencia > 0 ? '+' : ''}${pesos(f.diferencia)}`}
                  </span>
                </div>
              ))}
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 16, minHeight: ALTO_LIQ.renglonAlto,
                alignItems: 'center', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
                fontSize: '13px', fontVariantNumeric: 'tabular-nums',
              }}>
                <span>{cambian.length} línea(s) cambian</span>
                <span data-testid="reapertura-total">{total > 0 ? '+' : ''}{pesos(total)}</span>
              </div>
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' }}>
              Por qué se reabre
            </span>
            <textarea
              value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
              data-testid="reabrir-motivo"
              placeholder="Una quincena cerrada ya se pagó: el motivo es lo único que explica el cambio."
              style={{
                border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: '6px 8px',
                fontSize: '12.5px', fontFamily: 'inherit', color: V.tinta, resize: 'vertical',
              }}
            />
          </label>
          <button
            type="button" onClick={confirmar} disabled={guardando || motivo.trim().length < 10}
            data-testid="reabrir-confirmar"
            style={{
              marginTop: 12, height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
              background: motivo.trim().length < 10 ? V.lineaFuerte : V.marca,
              color: motivo.trim().length < 10 ? V.apagado : V.grafito,
              fontSize: '12.5px', fontWeight: 600,
              cursor: motivo.trim().length < 10 ? 'not-allowed' : 'pointer',
            }}
          >
            {guardando ? 'Reabriendo…' : 'Reabrir y dejar el motivo'}
          </button>
          {motivo.trim().length < 10 && (
            <span style={{ fontSize: '11.5px', color: V.apagado, marginLeft: 12 }}>
              El motivo se escribe: diez caracteres es el piso donde «ok» deja de pasar.
            </span>
          )}
          {aviso && <div data-testid="reabrir-aviso" style={{ marginTop: 10, fontSize: '11.5px', color: V.apagado }}>{aviso}</div>}
        </div>
      )}
    </>
  )
}

const boton = {
  marginLeft: 'auto', height: 26, padding: '0 12px', border: `1px solid ${V.lineaFuerte}`,
  borderRadius: 6, background: '#FFFFFF', fontSize: '11.5px', cursor: 'pointer', color: V.tinta,
}
