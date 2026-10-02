'use client'

// «RECIBOS POR LA DIFERENCIA», EN LOTE — el panel al costado que se abre desde la barra de los tildados.
//
// Dueño, 02/10/2026: a once personas se les pagó de menos el efectivo de la quincena; les paga la diferencia y
// quiere que firmen que con eso queda cubierto, *«no voy a ir haciendo 11 recibos»*.
//
//   · De los tildados, entra quien tiene efectivo por pagar (`loteDeDiferencias`) o ya tiene su RP de la diferencia
//     de esta quincena. Los demás se listan como «sin diferencia» y no se les emite nada.
//   · QUIEN YA TIENE RP NO SE VUELVE A EMITIR: se lee al abrir (`diferenciasYaEmitidasAction`) y se muestra «ya
//     emitido RP-…». Mientras no se sabe —o si la lectura falla— no se puede emitir: un doble número es peor que
//     esperar. El saldo de esas personas sigue > 0 hasta que el dueño suma el pago, así que la lista los sigue trayendo.
//   · Importe editable por persona y un concepto común editable; un botón emite los que faltan.
//
// ═══ EL PAPEL ES EL DE LA QUINCENA, NO EL GENÉRICO (dueño, 02/10/2026) ═══
// *«necesito que sea como los demás recibos de liq de hs, esto no me sirve»* (vio el «Recibí de … la suma de pesos»
// del RP). «Imprimir» saca `HojasDeRecibosA4` —el mismo papel, encabezado, firmas y cuatro por hoja del recibo de la
// quincena— con el número y la fecha del RP, las horas, el efectivo, lo ya pagado y la diferencia
// (`reciboDeLaDiferencia`), y el concepto guardado en el RP. Sin duplicado. El PDF genérico de Efectivo no cambia.
//
// No anota el pago en la liquidación: el dueño suma cada importe al «Pagado» a mano.

import { useEffect, useRef, useState, useTransition } from 'react'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { tipoDeLiquidacion } from '../../../services/liquidacionPorTipo'
import {
  conceptoDeLaDiferencia, importeParaEscribir, loteDeDiferencias, marcaDeLaQuincena, reciboDeLaDiferencia,
} from '../../../services/reciboPorLaDiferencia'
import { diaAR } from '@/features/efectivo/logica/entregas'
import { validarReciboPago } from '@/features/efectivo/logica/reciboPago'
import { diferenciasYaEmitidasAction, emitirRecibosPorLaDiferenciaAction } from '@/features/efectivo/services/reciboPagoLoteAcciones'
import type { DiferenciaEmitida } from '@/features/efectivo/services/reciboPagoDatos'
import { rotuloCategoria } from './CeldaTarifa'
import { abrirVentanaDeImpresion, fechaCorta, imprimirEnVentana } from './HojaDelRecibo'
import { HojasDeRecibosA4, type ReciboParaLaHoja } from './HojasDeRecibosA4'

const MONO = "'IBM Plex Mono', monospace"
const CAMPO = { padding: '6px 8px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', color: V.tinta, background: '#FFFFFF' } as const
const mensualDe = (f: FilaDelEspejo) => tipoDeLiquidacion(f) === 'mensual'

export function RecibosPorLaDiferencia({ filas, marcados, quincena, onCerrar }: {
  filas: readonly FilaDelEspejo[]
  marcados: ReadonlySet<string>
  quincena: { desde: string; hasta: string }
  onCerrar: () => void
}) {
  // EL LOTE SE FIJA AL ABRIR: si la grilla se refresca mientras se edita, los importes escritos no se pisan.
  const [tildadas] = useState(() => filas.filter((f) => marcados.has(f.personaId)))
  const [lote] = useState(() => loteDeDiferencias(
    tildadas.map((f) => ({ personaId: f.personaId, nombre: f.nombre, linea: f.linea, mensual: mensualDe(f) })), marcados))
  const [hoy] = useState(() => diaAR(new Date().toISOString()))
  const [ids] = useState(() => Object.fromEntries(lote.con.map((c) => [c.personaId, crypto.randomUUID()])))
  const [importes, setImportes] = useState(() => Object.fromEntries(lote.con.map((c) => [c.personaId, importeParaEscribir(c.resta)])))
  const [concepto, setConcepto] = useState(() => conceptoDeLaDiferencia(quincena))
  const [rps, setRps] = useState<Record<string, DiferenciaEmitida> | 'leyendo' | { error: string }>('leyendo')
  const [fallas, setFallas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const [paraImprimir, setParaImprimir] = useState<ReciboParaLaHoja[] | null>(null)
  const hoja = useRef<HTMLDivElement>(null)
  const ventana = useRef<Window | null>(null)

  useEffect(() => {
    let vivo = true
    const personaIds = tildadas.map((f) => f.personaId)
    if (personaIds.length === 0) { setRps({}); return }
    diferenciasYaEmitidasAction({ personaIds, marca: marcaDeLaQuincena(quincena) }).then((r) => {
      if (!vivo) return
      setRps(r.ok ? Object.fromEntries(r.recibos.map((x) => [x.personaId, x])) : { error: r.error })
    })
    return () => { vivo = false }
  }, [tildadas, quincena])

  // La hoja se dibuja fuera de pantalla a tamaño real y recién entonces se copia a la ventana (`outerHTML`).
  useEffect(() => {
    if (!paraImprimir || !hoja.current || !ventana.current) return
    imprimirEnVentana(ventana.current, hoja.current,
      `Recibos por la diferencia ${fechaCorta(quincena.desde)} al ${fechaCorta(quincena.hasta)}`, { horizontal: true })
    ventana.current = null
    setParaImprimir(null)
  }, [paraImprimir, quincena.desde, quincena.hasta])

  const conocidos = typeof rps === 'object' && !('error' in rps) ? rps as Record<string, DiferenciaEmitida> : null
  const rpDe = (pid: string): DiferenciaEmitida | null => conocidos?.[pid] ?? null
  // Quien ya tiene RP entra aunque su saldo diga otra cosa: hay que poder imprimirle su papel.
  const sinDiferencia = lote.sin.filter((s) => !rpDe(s.personaId))
  const renglones = tildadas.filter((f) => lote.con.some((c) => c.personaId === f.personaId) || rpDe(f.personaId))
  const porEmitir = conocidos ? lote.con.filter((c) => !rpDe(c.personaId)) : []
  const conRp = renglones.filter((f) => rpDe(f.personaId))
  const validos = porEmitir.map((c) => ({
    c, v: validarReciboPago({ aNombreDe: c.nombre, documento: '', importe: importes[c.personaId] ?? '', fecha: hoy, concepto, obra: '' }, hoy),
  }))
  const total = renglones.reduce((a, f) => {
    const rp = rpDe(f.personaId)
    if (rp) return a + rp.importe
    const v = validos.find((x) => x.c.personaId === f.personaId)?.v
    return a + (v?.ok ? v.dato.importe : 0)
  }, 0)

  const emitirTodos = () => {
    if (pendiente || !conocidos || porEmitir.length === 0) return
    const malo = validos.find((x) => !x.v.ok)
    if (malo && !malo.v.ok) { setError(`${malo.c.nombre}: ${malo.v.error}`); return }
    setError(null)
    empezar(async () => {
      const r = await emitirRecibosPorLaDiferenciaAction({
        fecha: hoy, concepto,
        recibos: porEmitir.map((c) => ({ id: ids[c.personaId], personaId: c.personaId, importe: importes[c.personaId] ?? '' })),
      })
      if (!r.ok) { setError(r.error); return }
      const nuevos: Record<string, DiferenciaEmitida> = {}
      const malos: Record<string, string> = {}
      for (const x of r.resultados) {
        const v = validos.find((y) => y.c.personaId === x.personaId)?.v
        if (x.ok && v?.ok) nuevos[x.personaId] = { personaId: x.personaId, id: x.id, codigo: x.codigo, fecha: hoy, importe: v.dato.importe, concepto: v.dato.concepto }
        else if (!x.ok) malos[x.personaId] = x.error
      }
      setRps((ant) => ({ ...(ant as Record<string, DiferenciaEmitida>), ...nuevos }))
      setFallas(malos)
    })
  }

  const imprimir = () => {
    const hojas: ReciboParaLaHoja[] = []
    const sinPapel: string[] = []
    for (const f of conRp) {
      const rp = rpDe(f.personaId) as DiferenciaEmitida
      const recibo = reciboDeLaDiferencia(f.linea, mensualDe(f), rp.importe, pesos)
      if (!recibo) { sinPapel.push(f.nombre); continue }
      hojas.push({
        personaId: f.personaId, nombre: f.nombre, categoria: f.categoria ? rotuloCategoria(f.categoria) : null,
        recibo, codigo: rp.codigo, fecha: rp.fecha, leyenda: rp.concepto,
      })
    }
    setError(sinPapel.length ? `Sin papel (la quincena no trae el efectivo con lo ya pagado): ${sinPapel.join(', ')}.` : null)
    if (hojas.length === 0) return
    ventana.current = abrirVentanaDeImpresion()
    if (!ventana.current) { setError('El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes de app.ecsas.com.ar.'); return }
    setParaImprimir(hojas)
  }

  return (
    <Drawer testid="recibos-diferencia" titulo={`Recibos por la diferencia · ${renglones.length}`}
      subtitulo="Mismo papel que el recibo de la quincena · cuatro por hoja" ancho={620} onCerrar={onCerrar}
      pie={(
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {porEmitir.length > 0 && (
            <button type="button" onClick={emitirTodos} disabled={pendiente} data-testid="recibos-diferencia-emitir"
              className="min-h-9 rounded-md border-0 px-4 text-[13px] font-semibold text-white max-[767px]:min-h-11 max-[767px]:flex-1"
              style={{ background: V.grafito, cursor: pendiente ? 'progress' : 'pointer', opacity: pendiente ? 0.5 : 1 }}>
              {pendiente ? 'Emitiendo…' : `Emitir ${porEmitir.length} recibo${porEmitir.length === 1 ? '' : 's'}`}
            </button>
          )}
          {conRp.length > 0 && (
            <button type="button" onClick={imprimir} disabled={pendiente} data-testid="recibos-diferencia-imprimir"
              className="min-h-9 rounded-md bg-transparent px-4 text-[13px] font-semibold max-[767px]:min-h-11 max-[767px]:flex-1"
              style={{ border: `1px solid ${V.lineaFuerte}`, color: V.tinta, cursor: 'pointer' }}>
              {`Imprimir ${conRp.length === 1 ? 'el recibo' : `los ${conRp.length} recibos`}`}
            </button>
          )}
        </div>
      )}>
      <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rps === 'leyendo' && <p style={{ fontSize: '12.5px', color: V.apagado }}>Buscando quién ya tiene su recibo de esta quincena…</p>}
        {typeof rps === 'object' && 'error' in rps && (
          <p style={{ fontSize: '12.5px', color: V.warn }}>{`No pude saber quién ya tiene recibo, así que no emito nada: ${rps.error as string}`}</p>
        )}
        {renglones.length === 0 ? (
          <p style={{ fontSize: '13px', color: V.tintaSuave }}>Ninguno de los tildados tiene efectivo por pagar en esta quincena.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} data-testid="recibos-diferencia-tabla">
            <tbody>
              {renglones.map((f) => {
                const rp = rpDe(f.personaId)
                return (
                  <tr key={f.personaId} data-testid={`diferencia-${f.personaId}`} style={{ borderBottom: `1px solid ${V.linea}` }}>
                    <td style={{ padding: '6px 4px' }}>{f.nombre}</td>
                    <td style={{ padding: '6px 4px', width: 130, textAlign: 'right' }}>
                      {rp ? <span style={{ fontFamily: MONO }}>{pesos(rp.importe)}</span> : (
                        <input value={importes[f.personaId] ?? ''} disabled={pendiente || !conocidos} inputMode="decimal"
                          aria-label={`Importe de ${f.nombre}`} onChange={(e) => setImportes((v) => ({ ...v, [f.personaId]: e.target.value }))}
                          style={{ ...CAMPO, width: 120, fontFamily: MONO, textAlign: 'right' }} />
                      )}
                    </td>
                    <td style={{ padding: '6px 4px', fontSize: '12px', color: fallas[f.personaId] ? V.warn : V.tintaSuave }}>
                      {rp ? <span style={{ fontFamily: MONO }}>{`emitido ${rp.codigo}`}</span> : fallas[f.personaId] ?? ''}
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

        {sinDiferencia.length > 0 && (
          <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }} data-testid="recibos-diferencia-sin">
            {`Sin diferencia (no se les emite nada): ${sinDiferencia.map((s) => s.nombre).join(', ')}.`}
          </div>
        )}

        {porEmitir.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.apagado }}>En concepto de (para los que se emiten)</span>
            <textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} rows={3} maxLength={400} disabled={pendiente}
              style={{ ...CAMPO, resize: 'vertical', lineHeight: 1.45 }} data-testid="recibos-diferencia-concepto" />
          </label>
        )}

        <p style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
          {`Fecha ${fechaCorta(hoy)}. Cada recibo toma su número RP y no se borra: si sale mal, se anula desde Efectivo. No anota el pago en la liquidación: cada importe se suma a mano al Pagado en efectivo.`}
        </p>

        {error && <div style={{ fontSize: '12.5px', color: V.warn }} data-testid="recibos-diferencia-falla">{error}</div>}
      </div>
      {paraImprimir && (
        <div aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: '281mm', pointerEvents: 'none' }}>
          <HojasDeRecibosA4 hoja={hoja} recibos={paraImprimir} quincena={quincena} />
        </div>
      )}
    </Drawer>
  )
}
