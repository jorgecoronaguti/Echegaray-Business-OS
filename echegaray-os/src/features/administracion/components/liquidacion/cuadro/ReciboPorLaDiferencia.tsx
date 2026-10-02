'use client'

// «RECIBO POR LA DIFERENCIA» EN EL PANEL DE LA PERSONA (dueño, 02/10/2026).
//
// Lo que se pagó de menos en efectivo se paga ahora, y la persona firma que con eso queda cubierto. El papel es el
// recibo de pago en efectivo de Efectivo (serie RP): la misma función de la base, el mismo PDF original + duplicado,
// la misma lista en el legajo. Acá sólo se precarga: importe = la «resta» del efectivo del recibo de la quincena
// (`restaDeEfectivo`), fecha = hoy, concepto = el texto del dueño; a nombre de y DNI salen del legajo.
//
// ═══ NO ANOTA EL PAGO ═══
// El dueño suma el importe al «Pagado» del efectivo a mano. Escribirlo desde acá haría dos caminos para el mismo
// pago, y uno de los dos terminaría contándolo dos veces.
//
// El id del recibo nace al abrir: si «Emitir» llega dos veces, la base devuelve el mismo número. El PDF se abre con
// un clic (un `window.open` después de esperar a la base lo bloquea el navegador como ventana emergente).

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { borradorDeLaDiferencia } from '../../../services/reciboPorLaDiferencia'
import { diaAR } from '@/features/efectivo/logica/entregas'
import { fraseDelReciboPago, validarReciboPago, type BorradorReciboPago } from '@/features/efectivo/logica/reciboPago'
import { emitirReciboPagoAction, personaParaReciboAction } from '@/features/efectivo/services/reciboPagoAcciones'

const BOTON = { padding: '9px 16px', lineHeight: '20px', borderRadius: 6, fontSize: '13px', fontWeight: 600 } as const
const CAMPO = { width: '100%', padding: '8px 10px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', color: V.tinta, background: '#FFFFFF' } as const
const ROTULO = { fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.apagado } as const

export function ReciboPorLaDiferencia({ fila, quincena, resta }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  /** Lo que resta pagar en efectivo, del recibo de la quincena (> 0: el panel no ofrece el botón si no). */
  resta: number
}) {
  const [hoy] = useState(() => diaAR(new Date().toISOString()))
  const [id] = useState(() => crypto.randomUUID())
  const [b, setB] = useState<BorradorReciboPago>(() =>
    borradorDeLaDiferencia({ importe: resta, quincena, hoy, aNombreDe: '', documento: null }))
  const [legajo, setLegajo] = useState<'leyendo' | { error: string } | 'ok'>('leyendo')
  const [emitido, setEmitido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const set = (x: Partial<BorradorReciboPago>) => { setB((v) => ({ ...v, ...x })); setError(null) }

  // A NOMBRE DE Y DNI, DEL LEGAJO: es un papel que se firma, va el nombre legal y no el de pantalla.
  useEffect(() => {
    let vivo = true
    personaParaReciboAction(fila.personaId).then((r) => {
      if (!vivo) return
      if (!r.ok) { setLegajo({ error: r.error }); return }
      setB((v) => ({ ...v, aNombreDe: r.dato.nombre, documento: r.dato.documento ?? '' }))
      setLegajo('ok')
    })
    return () => { vivo = false }
  }, [fila.personaId])

  const v = validarReciboPago(b, hoy)
  const emitir = () => {
    if (legajo !== 'ok' || pendiente) return
    if (!v.ok) { setError(v.error); return }
    empezar(async () => {
      const r = await emitirReciboPagoAction({
        id, ...b, obraId: null, proveedorId: null, personaId: fila.personaId, compraFila: null,
      })
      if (!r.ok) { setError(r.error); return }
      setEmitido(r.dato)
    })
  }

  if (emitido) {
    return (
      <section data-testid="recibo-diferencia-emitido" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>{`Recibo ${emitido} emitido`}</div>
        <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.5 }}>
          Imprimilo (original y duplicado) y que lo firme. Queda en el legajo, solapa Retribución. Acordate de sumar
          {` ${pesos(v.ok ? v.dato.importe : resta)} `}al Pagado en efectivo de la quincena.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href={`/administracion/compras/recibo-pago/${id}`} target="_blank" rel="noopener" data-testid="recibo-diferencia-imprimir"
            style={{ ...BOTON, background: V.grafito, color: '#FFFFFF', textDecoration: 'none' }}>
            {`Imprimir ${emitido}`}
          </a>
          <Link href={`/administracion/personas/${fila.personaId}?v=retribucion`} prefetch={false}
            style={{ fontSize: '12.5px', color: V.tinta, textDecoration: 'underline' }}>Ver el legajo</Link>
        </div>
      </section>
    )
  }

  return (
    <section data-testid="recibo-diferencia" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.5 }}>
        {legajo === 'leyendo' ? 'Leyendo el legajo…'
          : legajo === 'ok' ? `A nombre de ${b.aNombreDe}${b.documento ? ` · DNI/CUIL ${b.documento}` : ' · sin DNI en el legajo (queda el renglón para completar a mano)'}`
            : legajo.error}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={ROTULO}>Importe</span>
          <input value={b.importe} onChange={(e) => set({ importe: e.target.value })} inputMode="decimal"
            style={{ ...CAMPO, fontFamily: "'IBM Plex Mono', monospace" }} data-testid="recibo-diferencia-importe" />
        </label>
        <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={ROTULO}>Fecha</span>
          <input type="date" value={b.fecha} max={hoy} onChange={(e) => set({ fecha: e.target.value })}
            style={CAMPO} data-testid="recibo-diferencia-fecha" />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={ROTULO}>En concepto de</span>
        <textarea value={b.concepto} onChange={(e) => set({ concepto: e.target.value })} rows={4} maxLength={400}
          style={{ ...CAMPO, resize: 'vertical', lineHeight: 1.45 }} data-testid="recibo-diferencia-concepto" />
      </label>

      <div style={{ border: `1px solid ${V.linea}`, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>El papel dice</div>
        <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }} data-testid="recibo-diferencia-frase">
          {v.ok ? fraseDelReciboPago(v.dato) : v.error}
        </div>
        <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.45 }}>
          Toma el próximo número RP y no se borra: si sale mal, se anula desde Efectivo. No anota el pago en la
          liquidación: el importe se suma a mano al Pagado en efectivo.
        </div>
      </div>

      {error && <div style={{ fontSize: '12.5px', color: V.warn }} data-testid="recibo-diferencia-falla">{error}</div>}

      <button type="button" onClick={emitir} disabled={legajo !== 'ok' || pendiente} data-testid="recibo-diferencia-emitir"
        style={{ ...BOTON, border: 0, background: V.grafito, color: '#FFFFFF', cursor: legajo !== 'ok' || pendiente ? 'default' : 'pointer', opacity: legajo !== 'ok' || pendiente ? 0.5 : 1 }}>
        {pendiente ? 'Emitiendo…' : v.ok ? `Emitir recibo por ${pesos(v.dato.importe)}` : 'Emitir recibo'}
      </button>
    </section>
  )
}
