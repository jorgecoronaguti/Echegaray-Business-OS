'use client'

// IMPRIMIR VARIOS RECIBOS DE UNA (dueño, 01/10/2026): se tilda a quién, y una barra al pie de la grilla saca los
// recibos de todos en A4 horizontal, cuatro por hoja. El de UNA persona sigue siendo el panel «Pagar»: esto no lo toca.
//
// ═══ MISMA REGLA QUE EL INDIVIDUAL ═══
//
// Cada recibo se arma con la elección por defecto del panel (`lotesDeRecibos.ts`) y se REGISTRA en el legajo con
// `aceptarRecibo` antes de imprimir: un papel que sale sin rastro está prohibido en este repo (cabecera de
// `ArmarRecibo.tsx`). Al que no se pudo registrar se lo nombra y NO entra en la hoja. Los que no tienen nada que
// cobrar se saltean y se nombran. Ya registrados, salen de la selección: un segundo clic no los duplica en el legajo.

import { useEffect, useRef, useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { rotuloCategoria } from './CeldaTarifa'
import { aceptarRecibo } from '../../../services/recibosEmitidosActions'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { abrirVentanaDeImpresion, imprimirEnVentana, fechaCorta } from './HojaDelRecibo'
import { HojasDeRecibosA4, type ReciboParaLaHoja } from './HojasDeRecibosA4'
import { armarLote, RECIBOS_POR_HOJA, textoDeSeleccion, type EstadoDeSeccion, type ReciboDeLaFila } from './lotesDeRecibos'

/** El checkbox de una fila o de un cuadro. El área táctil es de 44 px en el teléfono; el cuadrito es de 16. */
export function CasillaDeRecibo({ estado, alternar, etiqueta, testid }: {
  estado: EstadoDeSeccion
  alternar: () => void
  etiqueta: string
  testid: string
}) {
  return (
    <label title={etiqueta} className="inline-flex min-h-8 min-w-8 flex-none cursor-pointer items-center justify-center max-[767px]:min-h-11 max-[767px]:min-w-11">
      <input type="checkbox" checked={estado === 'todas'} aria-label={etiqueta} data-testid={testid} onChange={alternar}
        ref={(el) => { if (el) el.indeterminate = estado === 'algunas' }}
        style={{ width: 16, height: 16, accentColor: V.grafito, cursor: 'pointer' }} />
    </label>
  )
}

interface Aviso { tono: 'ok' | 'mal'; lineas: string[] }

export function BarraDeRecibos({ filas, marcados, quincena, alRegistrar, quitar }: {
  /** Las filas visibles, en el orden de la grilla. */
  filas: readonly FilaDelEspejo[]
  marcados: ReadonlySet<string>
  quincena: { desde: string; hasta: string }
  /** Los que quedaron registrados en el legajo: salen de la selección. */
  alRegistrar: (ids: readonly string[]) => void
  quitar: () => void
}) {
  const [trabajando, setTrabajando] = useState(false)
  const [, empezar] = useTransition()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [paraImprimir, setParaImprimir] = useState<ReciboParaLaHoja[] | null>(null)
  const ventana = useRef<Window | null>(null)
  const hoja = useRef<HTMLDivElement>(null)

  // La hoja se dibuja en el DOM (fuera de pantalla) y recién entonces se copia a la ventana: `outerHTML` necesita el nodo.
  useEffect(() => {
    if (!paraImprimir || !hoja.current || !ventana.current) return
    imprimirEnVentana(ventana.current, hoja.current,
      `Recibos ${fechaCorta(quincena.desde)} al ${fechaCorta(quincena.hasta)}`, { horizontal: true })
    ventana.current = null
    setParaImprimir(null)
  }, [paraImprimir, quincena.desde, quincena.hasta])

  const imprimir = () => {
    if (trabajando) return
    const lote = armarLote(filas, marcados, quincena, pesos, rotuloCategoria)
    if (lote.listos.length === 0) {
      setAviso({ tono: 'mal', lineas: [`Ninguno de los marcados tiene algo que cobrar: ${lote.sinNada.join(', ')}.`] })
      return
    }
    // LA VENTANA SE ABRE EN EL CLIC, antes de registrar: después de los `await` el navegador ya no la deja abrir.
    // Si la bloquea no se registra nada: es mejor frenar acá que dejar recibos en el legajo sin papel.
    const v = abrirVentanaDeImpresion()
    if (!v) {
      setAviso({ tono: 'mal', lineas: ['El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes de app.ecsas.com.ar y probá de nuevo. No registré nada.'] })
      return
    }
    setTrabajando(true)
    setAviso(null)
    empezar(async () => {
      const salieron = await registrarUno(lote.listos)
      setTrabajando(false)
      alRegistrar(salieron.ok.map((r) => r.fila.personaId))
      setAviso(avisoDelLote(salieron.ok.length, lote.sinNada, salieron.fallos))
      if (salieron.ok.length === 0) { v.close(); return }
      ventana.current = v
      setParaImprimir(salieron.ok.map(({ fila, categoria, recibo }) => ({ personaId: fila.personaId, nombre: fila.nombre, categoria, recibo })))
    })
  }

  if (marcados.size === 0 && !aviso) return null
  return (
    // PEGADA AL PIE de la grilla, en el flujo: no tapa la barra de navegación del teléfono ni empuja el cuadro de arriba.
    <div data-testid="barra-recibos" className="bg-surface" style={{ position: 'sticky', bottom: 0, zIndex: 5, borderTop: `1px solid ${V.lineaFuerte}`, padding: '8px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px', fontSize: '12.5px' }}>
      {marcados.size > 0 && (
        <>
          <span data-testid="barra-recibos-cuenta" style={{ color: V.tinta, fontWeight: 600 }}>{textoDeSeleccion(marcados.size)}</span>
          <button type="button" onClick={imprimir} disabled={trabajando} data-testid="recibos-lote-imprimir"
            className="min-h-9 rounded-md border-0 px-4 text-[13px] font-semibold text-white max-[767px]:min-h-11 max-[767px]:flex-1"
            style={{ background: V.grafito, cursor: trabajando ? 'progress' : 'pointer', opacity: trabajando ? 0.5 : 1 }}>
            {trabajando ? 'Registrando…' : 'Guardar e imprimir · 4 por hoja'}
          </button>
        </>
      )}
      <button type="button" onClick={() => { setAviso(null); quitar() }} data-testid="recibos-lote-quitar"
        className="min-h-9 border-0 bg-transparent px-1 text-[12.5px] underline max-[767px]:min-h-11"
        style={{ color: V.apagado, cursor: 'pointer' }}>
        {marcados.size > 0 ? 'quitar selección' : 'cerrar aviso'}
      </button>
      {aviso && (
        <div data-testid={aviso.tono === 'ok' ? 'recibos-lote-ok' : 'recibos-lote-falla'} style={{ width: '100%', color: aviso.tono === 'ok' ? V.tinta : V.warn, lineHeight: 1.5 }}>
          {aviso.lineas.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      {paraImprimir && (
        <div aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: '281mm', pointerEvents: 'none' }}>
          <HojasDeRecibosA4 hoja={hoja} recibos={paraImprimir} quincena={quincena} />
        </div>
      )}
    </div>
  )
}

/** Registra de a uno, en orden: separa los que quedaron en el legajo de los que no, con el motivo. */
async function registrarUno(listos: readonly ReciboDeLaFila[]): Promise<{ ok: ReciboDeLaFila[]; fallos: string[] }> {
  const ok: ReciboDeLaFila[] = []
  const fallos: string[] = []
  for (const r of listos) {
    const x = await aceptarRecibo(r.sellado)
    if (x.ok) ok.push(r)
    else fallos.push(`${r.fila.nombre}: ${x.error}`)
  }
  return { ok, fallos }
}

function avisoDelLote(registrados: number, sinNada: readonly string[], fallos: readonly string[]): Aviso {
  const lineas: string[] = []
  if (registrados > 0) {
    const hojas = Math.ceil(registrados / RECIBOS_POR_HOJA)
    lineas.push(`${registrados} recibo${registrados === 1 ? '' : 's'} registrado${registrados === 1 ? '' : 's'} en los legajos y enviado${registrados === 1 ? '' : 's'} a imprimir (${hojas} hoja${hojas === 1 ? '' : 's'}).`)
  }
  if (sinNada.length > 0) lineas.push(`Sin nada que cobrar, no se incluyeron: ${sinNada.join(', ')}.`)
  for (const f of fallos) lineas.push(`No se registró ni se imprimió. ${f}`)
  return { tono: fallos.length > 0 || registrados === 0 ? 'mal' : 'ok', lineas }
}
