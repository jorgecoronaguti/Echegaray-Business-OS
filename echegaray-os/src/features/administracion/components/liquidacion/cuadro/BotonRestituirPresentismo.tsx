'use client'

// RESTITUIR EL PRESENTISMO DESDE LA CELDA (dueño, 30/09/2026: «quiero que ahí donde dice "perdido xxx" sea un botón que si
// aprieto le considera automáticamente el presentismo nuevamente»).
//
// ═══ SEGUNDA VUELTA — POR QUÉ SE REHIZO (dueño, 30/09/2026: «esos "botones" que ni siquiera lo son como tal») ═══
//
// La primera versión convirtió el TEXTO «perdido 24/09» en el botón: un chip de borde ámbar redondeado que se leía como
// una etiqueta de estado, no decía qué pasaba al apretarlo y con varias fechas se estiraba. Ahora son dos cosas:
//
//   ESTADO   «Perdido 22/09, 24/09» — texto ámbar, sin borde ni fondo: se lee, no se aprieta.
//   ACCIÓN   [Restituir] — un <button> de verdad, con el mismo estilo que los secundarios del panel (blanco, filo
//            `line-strong`, radio 6), hover, foco visible y «Restituyendo…» mientras guarda.
//
// SIN DIÁLOGO DE CONFIRMACIÓN: el dueño pidió «automáticamente», y la acción se deshace en un clic desde la misma celda
// con quién y cuándo sellados (la tabla no borra: `deshecho_en`). Un paso más sería fricción sobre algo reversible.
// El motivo sigue siendo opcional en el servidor; desde la celda no se pide.
//
// Qué se restituye lo decide el servidor (`restituirPresentismo`): acá no viaja ninguna fecha. Quien no puede editar
// (quincena cerrada) ve sólo el estado: el botón no existe donde la base diría que no.

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { V } from '@/shared/components/v2/patron'
import { fechasCortas, type RestitucionDePresentismo } from '../../../services/presentismo'
import { deshacerRestitucion, restituirPresentismo } from '../../../services/presentismoRestitucionActions'
import { diaCortoDe, primerNombre } from './presentismoEnElPanel'

/**
 * El botón chico de la celda: 24 px de alto (grid de 8), y en pantallas táctiles el área que se toca crece a 40 px con
 * un `::after` invisible, sin agrandar la fila (58 px). Tokens del tema, nada de hex.
 */
const BOTON_CELDA = [
  'relative inline-flex items-center justify-center h-6 px-2 rounded-md border border-line-strong bg-surface',
  'text-[12px] leading-4 font-medium text-ink whitespace-nowrap cursor-pointer select-none',
  'hover:bg-surface-sunken hover:border-muted active:bg-surface-sunken',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
  'disabled:cursor-wait disabled:opacity-60',
  "after:absolute after:content-[''] after:-inset-y-2 after:-inset-x-1",
].join(' ')

const LINEA: React.CSSProperties = {
  fontSize: '11px', lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
}
const PILA: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }

export interface VentanaRestitucion { personaId: string; nombre: string; desde: string; hasta: string }

/** Presentismo PERDIDO en una quincena abierta: el estado (texto) y, debajo, el botón que lo restituye. */
export function PerdidoConRestituir({ v, perdido, titulo, testid, sinMotivo }: {
  v: VentanaRestitucion; perdido: readonly string[]; titulo: string; testid: string; sinMotivo: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()
  const router = useRouter()
  const restituir = () => empezar(async () => {
    const r = await restituirPresentismo({ persona_id: v.personaId, desde: v.desde, hasta: v.hasta })
    if (!r.ok) { setError(r.error); return }
    setError(null)
    router.refresh()
  })
  return (
    <div data-testid={testid} data-presentismo="perdido" data-sin-motivo={sinMotivo ? '1' : undefined} style={PILA}>
      {error
        ? <span role="alert" title={error} style={{ ...LINEA, color: V.neg }}>No se guardó</span>
        : (
          <span title={titulo} style={{ ...LINEA, color: V.warn }}>
            <span style={{ fontWeight: 600 }}>Perdido</span> {fechasCortas(perdido)}
          </span>
        )}
      <button type="button" data-testid={`${testid}-restituir`} onClick={restituir} disabled={enCurso} aria-busy={enCurso}
        aria-label={`Restituir el presentismo a ${v.nombre} (perdido ${fechasCortas(perdido)})`}
        title={`Restituir el presentismo a ${v.nombre}: vuelve a cobrar el 0425 en el blanco. Se puede deshacer.`}
        className={BOTON_CELDA}>
        {enCurso ? 'Restituyendo…' : 'Restituir'}
      </button>
    </div>
  )
}

/**
 * Presentismo RESTITUIDO: el importe que vuelve a cobrar, quién y cuándo, y —si la quincena está abierta— «Deshacer».
 * Sin `v` (quincena cerrada) es sólo lectura.
 */
export function RestituidoConDeshacer({ r, importe, v, cuenta, testid }: {
  r: RestitucionDePresentismo; importe: string; v: VentanaRestitucion | null; cuenta: string; testid: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()
  const router = useRouter()
  const deshacer = () => empezar(async () => {
    if (!v) return
    const res = await deshacerRestitucion({ persona_id: v.personaId, desde: v.desde, hasta: v.hasta })
    if (!res.ok) { setError(res.error); return }
    setError(null)
    router.refresh()
  })
  const dia = diaCortoDe(r.en)
  const detalle = `Restituido por ${r.por} el ${dia} (perdonó ${fechasCortas(r.fechas)})${r.motivo ? ` · ${r.motivo}` : ''}`
  return (
    <div data-testid={testid} data-presentismo="restituido" title={`${cuenta}. ${detalle}`} style={PILA}>
      <span style={{ whiteSpace: 'nowrap', color: V.tintaSuave, lineHeight: '16px' }}>{importe}</span>
      {error
        ? <span role="alert" title={error} style={{ ...LINEA, color: V.neg }}>No se deshizo</span>
        : <span style={{ ...LINEA, color: V.pos }}>Restituido {dia} · {primerNombre(r.por)}</span>}
      {v && (
        <button type="button" data-testid={`${testid}-deshacer`} onClick={deshacer} disabled={enCurso} aria-busy={enCurso}
          aria-label={`Deshacer la restitución del presentismo de ${v.nombre}`}
          title={`Deshacer: ${v.nombre} vuelve a perder el presentismo (${fechasCortas(r.fechas)}).`}
          className={BOTON_CELDA}>
          {enCurso ? 'Deshaciendo…' : 'Deshacer'}
        </button>
      )}
    </div>
  )
}
