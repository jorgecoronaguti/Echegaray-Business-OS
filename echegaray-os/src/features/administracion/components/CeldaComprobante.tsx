'use client'

// EL PAPEL DE LA FILA, EN 26px.
//
// ═══ POR QUÉ UN ÍCONO Y NO UNA MINIATURA ═══
//
// El canónico `24` reserva 26px en la última columna. Una miniatura ahí mide 20px: a ese tamaño una
// factura es una mancha gris y no distingue nada — el ícono al menos dice si hay papel y de qué tipo.
// Y hay una razón más dura: el bucket es PRIVADO, así que cada miniatura necesitaría su propia URL
// firmada. Dibujar 882 miniaturas serían 882 firmas por cada carga de la pantalla. La firma se pide
// cuando alguien quiere VER el papel, que es una vez y a pedido.
//
// El mockup pone ahí un `⋯` de «Más acciones» SIN handler: es decorativo. Se reemplaza por algo que
// funciona de verdad, que es lo que el dueño pidió — «no me sirve que me cargue y me lleve a otro
// lado». Acá el papel se abre desde la fila.
//
// ═══ LO QUE NO TIENE PAPEL LO DICE ═══
//
// Un hueco vacío se lee como «todavía no cargó la pantalla». Un guión apagado con su `title` se lee
// como «esta compra no tiene comprobante guardado», que es un dato y además es trabajo pendiente.

import { useState } from 'react'
import { C } from '@/shared/components/canon'
import { claseDeAdjunto } from '../services/comprasSheet'
import { urlDelAdjunto } from '../services/comprasAdjuntoActions'
import type { Adjunto } from '../services/comprasSheetService'

const IcoFoto = ({ s = 15 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" />
    <path d="M21 16l-5-5-5.5 5.5" />
  </svg>
)
const IcoPdf = ({ s = 15 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" />
  </svg>
)

/** Cuán firme es «este papel es de esta compra». Se muestra: una inferencia no puede verse igual. */
function rotuloDeVinculo(a: Adjunto): string {
  switch (a.vinculado_por) {
    case 'registro': return 'Lo cargó el OS desde este comprobante'
    case 'match_manual': return 'Lo vinculó Administración a mano'
    case 'match_numero': return `Emparejado por número (confianza ${Math.round((a.confianza ?? 0) * 100)} %)`
    default: return 'Sin vincular'
  }
}

export function CeldaComprobante({ adjuntos }: { adjuntos: Adjunto[] }) {
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!adjuntos.length) {
    return (
      <span
        title="Sin comprobante guardado"
        data-testid="sin-comprobante"
        style={{ display: 'flex', justifyContent: 'center', color: C.tenue, fontSize: 13 }}
      >
        —
      </span>
    )
  }

  const [a] = adjuntos
  const clase = claseDeAdjunto(a.media_type)
  // Un vínculo DEDUCIDO se dibuja apagado. El que es un hecho, en tinta. La diferencia se ve sin
  // pasar el mouse: presentar un cálculo con la misma cara que un hecho es el defecto de fondo.
  const firme = a.vinculado_por === 'registro' || a.vinculado_por === 'match_manual'
  const titulo = `${a.nombre} — ${rotuloDeVinculo(a)}`
    + (adjuntos.length > 1 ? ` (+${adjuntos.length - 1} más)` : '')

  async function abrir(e: React.MouseEvent) {
    // La fila entera es un enlace: sin esto, abrir el papel además navegaría.
    e.preventDefault(); e.stopPropagation()
    setAbriendo(true); setError(null)
    const r = await urlDelAdjunto(a.id)
    setAbriendo(false)
    if (!r.ok) { setError(r.error); return }
    window.open(r.dato, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={abriendo}
      data-testid="ver-comprobante"
      title={error ?? titulo}
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none',
        background: 'transparent', padding: 0, cursor: abriendo ? 'wait' : 'pointer',
        color: error ? '#B42318' : firme ? C.tintaSuave : C.tenue,
      }}
    >
      {clase === 'pdf' ? <IcoPdf /> : <IcoFoto />}
    </button>
  )
}
