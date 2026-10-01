// LO PURO DEL RECIBO FIRMADO EN PANTALLA — sin base, sin React, sin PDF.
//
// Lo usan tres caras y por eso vive acá una sola vez: la pantalla que muestra la frase antes de firmar, la
// acción del servidor que valida lo que viaja, y el PDF que estampa la firma. Si la frase se escribiera en la
// pantalla y otra vez en el PDF, lo que el proveedor LEE al firmar podría no ser lo que queda impreso.

import type { ReciboParaFirmar } from './recibo.ts'
import { RAZON_SOCIAL_RECIBO } from './recibo.ts'

const ZONA = 'America/Argentina/San_Juan'

/**
 * LA FRASE QUE SE FIRMA: «Recibí de … la suma de pesos … ($ …) en concepto de …, obra …, fecha …».
 * Lo que la rendición no sabe se OMITE (no se deja «___»): en pantalla no hay renglón para completar a mano.
 */
export function fraseDelRecibo(r: ReciboParaFirmar): string {
  const partes = [`Recibí de ${RAZON_SOCIAL_RECIBO} la suma de pesos ${r.montoEnLetras} ($ ${r.montoTexto})`]
  if (r.concepto) partes.push(` en concepto de ${r.concepto}`)
  // «sin obra» no es un dato: es la ausencia de uno. «Estructura» sí es un destino, pero no es «obra Estructura».
  if (r.obra === 'Estructura') partes.push(', gasto de Estructura')
  else if (r.obra !== 'sin obra') partes.push(`, obra ${r.obra}`)
  if (r.fecha) partes.push(`, fecha ${r.fecha}`)
  return `${partes.join('')}.`
}

/** `dd/mm/aaaa hh:mm` en hora de San Juan; vacío si no es una fecha. */
export function fechaHoraDeFirma(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).map((x) => [x.type, x.value]),
  )
  return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

export interface FirmaDelRecibo {
  /** El SVG que guardó `firmar_recibo_gasto_manual`. */
  trazo: string
  aclaracion: string
  dni: string | null
  firmado_en: string
}

export interface TrazoParaPdf { d: string; ancho: number; alto: number }

/**
 * El path y el lienzo del SVG guardado, para dibujarlo en el PDF con `drawSvgPath`. `null` si no tiene la
 * forma que escribe `svgDeFirma`: un recibo sin firma legible no se entrega como «firmado».
 */
export function trazoParaPdf(svg: string): TrazoParaPdf | null {
  const caja = /^<svg [^>]*viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  const d = /<path d="(M[\d ML l-]+)"/.exec(svg)
  if (!caja || !d) return null
  const ancho = Number(caja[1])
  const alto = Number(caja[2])
  if (!(ancho > 0) || !(alto > 0)) return null
  return { d: d[1], ancho, alto }
}

export interface BorradorFirma { aclaracion: string; dni: string }
export type ResultadoFirma = { ok: true; dato: { aclaracion: string; dni: string | null } } | { ok: false; error: string }

/** La misma regla que la función de la base, para decirlo antes de viajar: aclaración 3–120, DNI vacío o 6–8 números. */
export function validarFirmaDelRecibo(b: BorradorFirma): ResultadoFirma {
  const aclaracion = (b.aclaracion ?? '').replace(/\s+/g, ' ').trim()
  if (aclaracion.length < 3) return { ok: false, error: 'Escribí el nombre de quien firma.' }
  if (aclaracion.length > 120) return { ok: false, error: 'El nombre es demasiado largo.' }
  const dni = (b.dni ?? '').replace(/\D/g, '')
  if (dni && !/^\d{6,8}$/.test(dni)) return { ok: false, error: 'El DNI tiene entre 6 y 8 números (o dejalo vacío).' }
  return { ok: true, dato: { aclaracion, dni: dni || null } }
}
