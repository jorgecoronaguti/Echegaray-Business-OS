'use client'

// «RECIBOS POR LA DIFERENCIA», EN LOTE — el panel al costado que se abre desde la barra de los tildados.
//
// Dueño, 02/10/2026: a once personas se les pagó de menos el efectivo de la quincena; les paga la diferencia y
// quiere que firmen que con eso queda cubierto, *«no voy a ir haciendo 11 recibos»*. Mismo tildado y misma barra
// que «Vista previa» de los recibos de la quincena; distinto papel: el recibo de pago en efectivo (serie RP).
//
//   · De los tildados, entra quien tiene efectivo por pagar (`loteDeDiferencias`, la «resta» del recibo de la
//     quincena). Los demás se listan como «sin diferencia» y no se les emite nada.
//   · Importe editable por persona y un concepto común editable; un botón emite todos; una sola impresión con
//     todas las hojas (original y duplicado de cada uno).
//   · Si uno falla se lo nombra con el motivo; los demás quedan emitidos y entran en la impresión.
//
// Los ids nacen al abrir el panel: un doble clic o un reintento devuelve el mismo número. La impresión es un
// enlace (un clic del usuario): un `window.open` después de esperar a la base lo bloquea el navegador.
// No anota el pago en la liquidación: el dueño suma cada importe al «Pagado» a mano.

import { useState, useTransition } from 'react'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { tipoDeLiquidacion } from '../../../services/liquidacionPorTipo'
import {
  conceptoDeLaDiferencia, importeParaEscribir, loteDeDiferencias, type LoteDeDiferencias,
} from '../../../services/reciboPorLaDiferencia'
import { diaAR } from '@/features/efectivo/logica/entregas'
import { validarReciboPago } from '@/features/efectivo/logica/reciboPago'
import { emitirRecibosPorLaDiferenciaAction } from '@/features/efectivo/services/reciboPagoLoteAcciones'

type Resultado = { ok: true; codigo: string } | { ok: false; error: string }

const MONO = "'IBM Plex Mono', monospace"
const CAMPO = { padding: '6px 8px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', color: V.tinta, background: '#FFFFFF' } as const

export function RecibosPorLaDiferencia({ filas, marcados, quincena, onCerrar }: {
  filas: readonly FilaDelEspejo[]
  marcados: ReadonlySet<string>
  quincena: { desde: string; hasta: string }
  onCerrar: () => void
}) {
  // EL LOTE SE FIJA AL ABRIR: si la grilla se refresca mientras se edita, los importes escritos no se pisan.
  const [lote] = useState<LoteDeDiferencias>(() => loteDeDiferencias(
    filas.map((f) => ({ personaId: f.personaId, nombre: f.nombre, linea: f.linea, mensual: tipoDeLiquidacion(f) === 'mensual' })),
    marcados,
  ))
  const [hoy] = useState(() => diaAR(new Date().toISOString()))
  const [ids] = useState(() => Object.fromEntries(lote.con.map((c) => [c.personaId, crypto.randomUUID()])))
  const [importes, setImportes] = useState(() => Object.fromEntries(lote.con.map((c) => [c.personaId, importeParaEscribir(c.resta)])))
  const [concepto, setConcepto] = useState(() => conceptoDeLaDiferencia(quincena))
  const [resultados, setResultados] = useState<Record<string, Resultado>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const emitido = (id: string) => resultados[id]?.ok === true
  const validos = lote.con.map((c) => ({
    c, v: validarReciboPago({ aNombreDe: c.nombre, documento: '', importe: importes[c.personaId] ?? '', fecha: hoy, concepto, obra: '' }, hoy),
  }))
  const malo = validos.find((x) => !emitido(x.c.personaId) && !x.v.ok)
  const total = validos.reduce((a, x) => a + (x.v.ok ? x.v.dato.importe : 0), 0)
  const porEmitir = lote.con.filter((c) => !emitido(c.personaId))
  const emitidos = lote.con.filter((c) => emitido(c.personaId))

  const emitirTodos = () => {
    if (pendiente || porEmitir.length === 0) return
    if (malo && !malo.v.ok) { setError(`${malo.c.nombre}: ${malo.v.error}`); return }
    setError(null)
    empezar(async () => {
      const r = await emitirRecibosPorLaDiferenciaAction({
        fecha: hoy, concepto,
        recibos: porEmitir.map((c) => ({ id: ids[c.personaId], personaId: c.personaId, importe: importes[c.personaId] ?? '' })),
      })
      if (!r.ok) { setError(r.error); return }
      setResultados((ant) => ({
        ...ant,
        ...Object.fromEntries(r.resultados.map((x) => [x.personaId, x.ok ? { ok: true, codigo: x.codigo } : { ok: false, error: x.error }])),
      }))
    })
  }

  const hrefImprimir = `/administracion/compras/recibo-pago/lote?ids=${emitidos.map((c) => ids[c.personaId]).join(',')}`

  return (
    <Drawer testid="recibos-diferencia" titulo={`Recibos por la diferencia · ${lote.con.length}`}
      subtitulo="Recibo de pago en efectivo · original y duplicado por persona" ancho={620} onCerrar={onCerrar}
      pie={(
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {porEmitir.length > 0 && (
            <button type="button" onClick={emitirTodos} disabled={pendiente} data-testid="recibos-diferencia-emitir"
              className="min-h-9 rounded-md border-0 px-4 text-[13px] font-semibold text-white max-[767px]:min-h-11 max-[767px]:flex-1"
              style={{ background: V.grafito, cursor: pendiente ? 'progress' : 'pointer', opacity: pendiente ? 0.5 : 1 }}>
              {pendiente ? 'Emitiendo…' : `Emitir ${porEmitir.length} recibo${porEmitir.length === 1 ? '' : 's'}`}
            </button>
          )}
          {emitidos.length > 0 && (
            <a href={hrefImprimir} target="_blank" rel="noopener" data-testid="recibos-diferencia-imprimir"
              className="inline-flex min-h-9 items-center rounded-md px-4 text-[13px] font-semibold max-[767px]:min-h-11 max-[767px]:flex-1"
              style={{ border: `1px solid ${V.lineaFuerte}`, color: V.tinta, textDecoration: 'none' }}>
              {`Imprimir ${emitidos.length === 1 ? 'el recibo' : `los ${emitidos.length} recibos`}`}
            </a>
          )}
        </div>
      )}>
      <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {lote.con.length === 0 ? (
          <p style={{ fontSize: '13px', color: V.tintaSuave }}>Ninguno de los tildados tiene efectivo por pagar en esta quincena.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} data-testid="recibos-diferencia-tabla">
            <tbody>
              {lote.con.map((c) => {
                const r = resultados[c.personaId]
                return (
                  <tr key={c.personaId} data-testid={`diferencia-${c.personaId}`} style={{ borderBottom: `1px solid ${V.linea}` }}>
                    <td style={{ padding: '6px 4px' }}>{c.nombre}</td>
                    <td style={{ padding: '6px 4px', width: 130 }}>
                      <input value={importes[c.personaId] ?? ''} disabled={r?.ok === true || pendiente} inputMode="decimal"
                        aria-label={`Importe de ${c.nombre}`} onChange={(e) => setImportes((v) => ({ ...v, [c.personaId]: e.target.value }))}
                        style={{ ...CAMPO, width: 120, fontFamily: MONO, textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '6px 4px', fontSize: '12px', color: r?.ok === false ? V.warn : V.tintaSuave }}>
                      {r?.ok ? <span style={{ fontFamily: MONO }}>{r.codigo}</span> : r?.ok === false ? r.error : ''}
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ padding: '8px 4px', fontWeight: 600 }}>Total</td>
                <td style={{ padding: '8px 4px', fontFamily: MONO, fontWeight: 600, textAlign: 'right' }}>{pesos(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}

        {lote.sin.length > 0 && (
          <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }} data-testid="recibos-diferencia-sin">
            {`Sin diferencia (no se les emite nada): ${lote.sin.map((s) => s.nombre).join(', ')}.`}
          </div>
        )}

        {lote.con.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.apagado }}>En concepto de (para todos)</span>
            <textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} rows={3} maxLength={400} disabled={pendiente || emitidos.length > 0}
              style={{ ...CAMPO, resize: 'vertical', lineHeight: 1.45 }} data-testid="recibos-diferencia-concepto" />
          </label>
        )}

        <p style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
          {`Fecha ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)}. A nombre de cada uno con su DNI del legajo. Cada recibo toma su número RP y no se borra: si sale mal, se anula desde Efectivo. No anota el pago en la liquidación: cada importe se suma a mano al Pagado en efectivo.`}
        </p>

        {error && <div style={{ fontSize: '12.5px', color: V.warn }} data-testid="recibos-diferencia-falla">{error}</div>}
      </div>
    </Drawer>
  )
}
