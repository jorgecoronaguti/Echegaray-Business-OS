// DE QUIÉN ES ESTE CUIT — CON LA FUENTE Y LA CONFIANZA PEGADAS AL NOMBRE.
//
// POR QUÉ EXISTE (21/07). El dueño: "agregar al OS que si hay CUIT que lo busque en internet y
// traiga la razón social". Lo hago, pero internet es la ÚLTIMA fuente, no la primera, y el resultado
// nunca sale suelto: sale con de dónde vino.
//
// ═══ POR QUÉ NO ES "BUSCAR EN GOOGLE" A SECAS ═══
//
// La empresa YA SABE de quién son la mayoría de los CUIT que le importan. Hay 459 comprobantes de
// ARCA cargados, y cada uno trae el par (emisor_cuit, emisor_nombre) tal como lo declaró el emisor
// en la factura electrónica. Eso no es una búsqueda: es el padrón de ARCA congelado en el momento de
// emitir el comprobante. Salir a internet a averiguar un nombre que está en la base propia costaría
// plata (cada búsqueda tiene cargo), tardaría, y devolvería algo MENOS confiable que lo que ya se
// tenía.
//
// Por eso el orden es este, y no otro:
//
//   1. ARITMÉTICA (gratis, certeza total) → ¿el CUIT es siquiera válido? Si el dígito verificador no
//      cierra es un typo, y buscar el nombre de un número mal transcripto devuelve "no encontrado"
//      y esconde el problema real.
//   2. COMPROBANTES DE ARCA (0 API, alta) → el nombre que el propio emisor declaró en su factura.
//   3. PADRÓN DE PROVEEDORES (0 API, alta) → lo que la empresa ya confirmó a mano.
//   4. PADRÓN PÚBLICO DE ARCA (red, alta) → la fuente oficial. Al 21/07 el endpoint histórico
//      (soa.afip.gob.ar/sr-padron/v2) devuelve 404: se intenta igual y si falla se dice que falló,
//      no se tapa.
//   5. INTERNET (red + costo, MEDIA) → último recurso. Lo que vuelve de acá es una INFERENCIA, se
//      declara como tal y nunca se guarda en la base como si fuera dato confirmado.
//
// ═══ LA REGLA QUE NO SE NEGOCIA ═══
//
// Un nombre traído de internet NO se escribe en proveedores.cuit ni en ninguna tabla como verdad.
// Se muestra con su origen para que un humano lo confirme. La regla de oro dice "nunca presentar
// inferencias como hechos", y una razón social sacada de un directorio web es exactamente eso.
//
// Este archivo es núcleo puro: decide el ORDEN y juzga los candidatos. Quién hace las consultas es
// `tools/cuit-tool.mjs`.

import { analizar } from './cuit.mjs'

/** Las fuentes, en el orden en que se consultan. `red` marca las que cuestan tiempo o plata. */
export const FUENTES = [
  { id: 'comprobantes_arca', nombre: 'comprobantes de ARCA de la empresa', confianza: 'alta', red: false },
  { id: 'proveedores', nombre: 'padrón de proveedores del OS', confianza: 'alta', red: false },
  { id: 'padron_arca', nombre: 'padrón público de ARCA', confianza: 'alta', red: true },
  { id: 'internet', nombre: 'búsqueda en internet', confianza: 'media', red: true },
]

const ORDEN = new Map(FUENTES.map((f, i) => [f.id, i]))

/** Confianza de una fuente. Una fuente que no está en la lista no se cree. */
export function confianzaDe(fuenteId) {
  return FUENTES.find((f) => f.id === fuenteId)?.confianza ?? 'desconocida'
}

/**
 * NÚCLEO PURO: limpia una razón social para poder compararla.
 * Saca la forma societaria y la puntuación, que es donde difieren las fuentes entre sí
 * ("BALANZ CAPITAL VALORES S.A.U." vs "Balanz Capital Valores SAU").
 */
export function normNombre(v) {
  return String(v ?? '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(S\.?\s?A\.?\s?U?\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|S\.?H\.?)\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * NÚCLEO PURO: elige la respuesta entre los candidatos que devolvieron las fuentes.
 *
 * @param {string} cuit
 * @param {Array<{fuente:string, nombre:string, detalle?:string}>} candidatos
 * @returns {{cuit:string, formateado:string, valido:boolean, tipo:string|null, problema:string|null,
 *            razon_social:string|null, fuente:string|null, confianza:string,
 *            coincide:boolean, candidatos:Array}}
 */
export function elegir(cuit, candidatos = []) {
  const base = analizar(cuit)
  const utiles = candidatos
    .filter((c) => c && String(c.nombre ?? '').trim() && ORDEN.has(c.fuente))
    .sort((a, b) => ORDEN.get(a.fuente) - ORDEN.get(b.fuente))

  if (!utiles.length) {
    return { ...base, razon_social: null, fuente: null, confianza: 'desconocida', coincide: false, candidatos: [] }
  }

  const ganador = utiles[0]
  // ¿LAS FUENTES SE CONTRADICEN? Dos fuentes independientes que dan el mismo nombre valen mucho más
  // que una sola; dos que dan nombres distintos son una alerta, no un promedio. Se informa cuál es
  // el caso en vez de elegir en silencio.
  const nombres = new Set(utiles.map((c) => normNombre(c.nombre)))
  return {
    ...base,
    razon_social: String(ganador.nombre).trim(),
    fuente: ganador.fuente,
    confianza: confianzaDe(ganador.fuente),
    coincide: utiles.length > 1 && nombres.size === 1,
    candidatos: utiles.map((c) => ({ fuente: c.fuente, nombre: String(c.nombre).trim(), detalle: c.detalle ?? null })),
  }
}

/**
 * NÚCLEO PURO: ¿hace falta salir a la red?
 * Si una fuente local ya contestó, no. Es lo que evita pagar una búsqueda por un dato propio.
 */
export function necesitaRed(candidatos = []) {
  return !candidatos.some((c) => c && String(c.nombre ?? '').trim() && FUENTES.find((f) => f.id === c.fuente && !f.red))
}

/**
 * NÚCLEO PURO: saca la razón social del texto que devuelve una búsqueda en internet.
 *
 * POR QUÉ ES CONSERVADOR: prefiere no contestar antes que contestar cualquier cosa. Un directorio
 * web devuelve párrafos enteros, y quedarse con la primera línea que parezca un nombre inventaría
 * un proveedor. Sólo acepta una secuencia en MAYÚSCULAS que termine en forma societaria, que es
 * como los directorios argentinos escriben la razón social, o un nombre pegado al CUIT buscado.
 *
 * @returns {string|null}
 */
export function extraerDeTexto(texto, cuit) {
  const s = String(texto ?? '')
  if (!s.trim()) return null

  // 1) Un nombre inmediatamente antes o después del CUIT que estamos buscando.
  const c = String(cuit ?? '').replace(/\D/g, '')
  if (c.length === 11) {
    const pat = `${c[0]}${c[1]}-?${c.slice(2, 10)}-?${c[10]}`
    const antes = new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .&'-]{3,70}?)\\s*[(\\-–—,]?\\s*(?:CUIT\\s*:?\\s*)?${pat}`)
    const m = antes.exec(s)
    if (m) {
      const n = m[1].replace(/\b(CUIT|cuit)\b/g, '').trim()
      if (n.length >= 4) return n
    }
  }

  // 2) Una razón social con forma societaria explícita.
  const soc = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&'-]{3,70}\s(?:S\.?\s?A\.?\s?U?\.?|S\.?R\.?L\.?|S\.?A\.?S\.?))/
  const m2 = soc.exec(s)
  return m2 ? m2[1].trim() : null
}
