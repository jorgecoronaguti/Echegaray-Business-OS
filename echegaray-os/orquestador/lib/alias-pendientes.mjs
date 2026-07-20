// NOMBRES VIVOS QUE EL EJE NO RECONOCE — la red contra el "$0 silencioso".
//
// QUÉ FALLA SIN ESTO (caso real, 20/07): el cuadro por cliente de Jornales por Quincena sumaba
// filtrando por "San Francisco", pero el archivo JORNALES escribe "JAVIER SANCHEZ". El eje canónico
// no sabía que eran el mismo cliente, así que el filtro no matcheó nada y la celda dio **$0**.
// Cero no se ve como un error: se ve como un cliente que no trabajó. $53.448.688 desaparecieron de
// un cuadro sin que nada avisara. Lo tuvo que ver el dueño.
//
// El problema de fondo no es esa fórmula: es que cada planilla escribe el mismo cliente distinto
// (la persona, la razón social, la obra) y nadie compara esas grafías contra el eje. Esto lo hace:
// recorre las columnas de cliente VIVAS, resuelve cada texto por el eje (public.obra_alias, la
// misma fuente que usan la web y el chat) y devuelve lo que NO resolvió, con la plata en juego.
//
// Lo que NO hace: inventar el alias. Decir "JAVIER SANCHEZ probablemente sea San Francisco" es una
// inferencia sobre a quién se le imputa la plata — eso lo confirma una persona. Acá se declara el
// hueco y se ordena por impacto; el alta al eje es una decisión, no un automatismo.

import { resolverObraCon } from './obras.mjs'
import { montoAR } from './egresos-por-area.mjs'

/** Textos que no son un cliente: encabezados repetidos, importes derramados, restos de la planilla. */
const RE_NO_CLIENTE = /^(cliente|obra|total|suma|[\s$.,\d-]*)$/i

/**
 * NÚCLEO PURO: qué grafías de cliente no resuelve el eje.
 * @param {Array<{fuente:string, texto:string, monto?:number|string}>} filas
 * @param {Map} aliasMap mapa alias→obra del eje canónico
 * @returns {{reconocidos:Array, pendientes:Array, filas:number, monto_pendiente:number}}
 */
export function detectarPendientes(filas = [], aliasMap = new Map()) {
  const rec = new Map()
  const pen = new Map()
  let monto_pendiente = 0

  for (const f of filas) {
    // Las tablas dinámicas repiten cada cliente como "Total X": es la misma grafía, no una nueva.
    const texto = String(f?.texto ?? '').trim().replace(/^(total|suma(\s+total)?)\s+/i, '')
    if (!texto || RE_NO_CLIENTE.test(texto)) continue
    const m = montoAR(f?.monto)
    const r = resolverObraCon(aliasMap, texto)
    // Un match APROXIMADO no cuenta como reconocido: es la contención por substring, que acierta
    // por casualidad tanto como falla. Si el eje no lo tiene exacto, es un alias que falta.
    const ok = r.resuelto && !r.aproximado
    const dest = ok ? rec : pen
    const k = `${texto}||${f?.fuente ?? ''}`
    const e = dest.get(k) ?? { texto, fuente: f?.fuente ?? '', filas: 0, monto: 0, resuelve_a: r.obra_id ? r.alias : null, aproximado: r.aproximado || undefined }
    e.filas++; e.monto += m
    dest.set(k, e)
    if (!ok) monto_pendiente += m
  }

  const orden = (a, b) => b.monto - a.monto || b.filas - a.filas
  return {
    filas: filas.length,
    reconocidos: [...rec.values()].sort(orden),
    pendientes: [...pen.values()].sort(orden),
    monto_pendiente,
  }
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Texto legible. PURO. */
export function formatPendientes(r) {
  if (!r || r.error) return `No pude revisar los nombres: ${r?.error ?? 'sin datos'}`
  const L = ['NOMBRES DE CLIENTE QUE EL OS NO RECONOCE', '']
  if (!r.pendientes.length) {
    L.push(`  Ninguno. Las ${r.filas} filas revisadas resuelven contra el eje canónico.`)
    return L.join('\n')
  }
  L.push(`  ⚠ ${r.pendientes.length} grafía(s) sin alias · ${$(r.monto_pendiente)} en juego`)
  L.push('')
  L.push('  TEXTO EN LA PLANILLA         DÓNDE                FILAS            MONTO')
  for (const p of r.pendientes) {
    L.push(`  ${p.texto.slice(0, 28).padEnd(28)} ${String(p.fuente).slice(0, 20).padEnd(20)} ${String(p.filas).padStart(5)} ${$(p.monto).padStart(16)}`)
  }
  L.push('')
  L.push('  Mientras falte el alias, cualquier cuadro que filtre por cliente le da $0 a estos —')
  L.push('  y $0 no se ve como un error, se ve como un cliente que no trabajó.')
  L.push('  Decime a qué obra/cliente canónico corresponde cada uno y lo cargo al eje.')
  return L.join('\n')
}

/** Las columnas de cliente VIVAS que hay que vigilar. Fuente única: si aparece otra, se agrega acá. */
export const FUENTES = [
  { fuente: 'JORNALES (obreros)', pestana: '_J_OBREROS', rango: 'AB1:AB990', monto: 'AA1:AA990' },
  { fuente: 'Compras', pestana: 'Compras', rango: 'J4:J1000', monto: 'O4:O1000' },
]

/** Revisa las columnas de cliente vivas del Cash Flow contra el eje canónico. */
export async function aliasPendientes(google, { file_id, aliasMap } = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }
  if (!file_id) return { error: 'falta file_id del Flujo de Caja' }
  let mapa = aliasMap
  if (!mapa) {
    const { cargarAliasMap } = await import('./obras.mjs')
    try { mapa = await cargarAliasMap() } catch { return { error: 'no pude leer el eje de obras (public.obra_alias)' } }
  }

  const filas = []
  for (const f of FUENTES) {
    try {
      const [txt, mon] = await Promise.all([
        google.readSheetValues(file_id, `${f.pestana}!${f.rango}`),
        google.readSheetValues(file_id, `${f.pestana}!${f.monto}`).catch(() => []),
      ])
      ;(txt ?? []).forEach((r, i) => filas.push({ fuente: f.fuente, texto: r?.[0], monto: (mon ?? [])[i]?.[0] }))
    } catch { /* una pestaña que no existe se informa por ausencia, no rompe la revisión */ }
  }
  return detectarPendientes(filas, mapa)
}
