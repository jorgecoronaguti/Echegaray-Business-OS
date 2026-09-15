// EL P&L IMPORTA COMPRAS COMO TEXTO: al insertar «Obra» en Compras L, Google no lo ajusta. Esto sí.
//
// ═══ POR QUÉ (15/09/2026) ═══
//
// «Ingresos y Egresos - P&L» tiene una pestaña `CF_GAS` con `IMPORTRANGE(<Flujo de Caja>;"Compras!A:Y")`.
// Ese rango es un TEXTO: la inserción en el otro archivo no lo toca. Y las fórmulas de
// `05_Dashboard_P&L` citan `CF_GAS!$M:$M` (Importe) y `CF_GAS!$O:$O` (Total), que son referencias a
// la COPIA importada, no a Compras: tampoco se ajustan. Después de insertar, `$M` lee «Concepto»
// (texto, suma 0) y `$O` lee «IVA». Números mal y sin un solo error.
//
// ═══ QUÉ HACE, Y QUÉ SE NIEGA A HACER ═══
//
//   · el texto `"Compras!A:Y"` de un IMPORTRANGE → cada letra desde la L, una a la derecha (`A:Z`);
//   · `Col13` de un QUERY sobre ese IMPORTRANGE (si arranca en A) → `Col14`;
//   · `CF_GAS!$M:$M` → `CF_GAS!$N:$N`; desde la L, todas; A..K no se tocan.
//   · NO transforma lo que no puede probar: un número de columna (VLOOKUP, INDEX, OFFSET, MATCH…) sobre
//     `CF_GAS`, un `INDIRECT`, o un `CF_GAS!` escrito adentro de un texto. Eso es una DUDA, con su celda,
//     y la corrida no escribe nada mientras haya una.
//   · `CF_COB` (la copia de Cobranzas) no se toca: hoy apunta a `02_Cobranzas`, que no existe, y ya
//     devuelve `#REF!` antes de la inserción. Se cuenta y se informa.

import { letra } from './compras-columnas.mjs'

/** «Ingresos y Egresos - P&L». */
export const PYL_ID = process.env.ORQ_PYL_ID || '1-NAqlEuKoB0IqCY4res5OiJhbbz_7-F2M-zmpnkpMYg'
/** La pestaña del P&L que es la copia importada de Compras. */
export const HOJA_COPIA = 'CF_GAS'
/** La copia de Cobranzas: rota desde antes (`#REF!`), fuera de alcance. */
export const HOJA_COPIA_COBRANZAS = 'CF_COB'
/** Índice (0 = A) de la primera columna de Compras que se corre: la L, donde entra «Obra». */
export const DESDE = 11
/**
 * Índice de la última columna que trae el IMPORTRANGE ANTES de correr (la Y de `A:Y`). Lo que
 * `05_Dashboard_P&L` cita más a la derecha (`CF_GAS!$AC$15`, `$AD$15`: 24 celdas medidas el 15/09) no es
 * Compras: es una celda PROPIA de la copia, fuera del derrame del import, y no se mueve con la inserción.
 * Correrla a AD/AE apuntaría a otra celda de CF_GAS.
 */
export const HASTA = 24

const indiceDe = (l) => [...String(l).toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/** Una letra de columna de Compras, corrida si está desde la L. */
export const correrLetra = (l, desde = DESDE) => (indiceDe(l) >= desde ? letra(indiceDe(l) + 1) : l)

const FUNCIONES_CON_POSICION = /\b(VLOOKUP|HLOOKUP|XLOOKUP|INDEX|OFFSET|MATCH|XMATCH|INDIRECT|COLUMNS?|CHOOSECOLS|QUERY|BUSCARV|BUSCARH|INDICE|DESREF|COINCIDIR|INDIRECTO|COLUMNAS?)\s*\(/i
const RE_TEXTO_COMPRAS = /^"('?Compras'?)!(\$?)([A-Z]{1,3})(\$?\d*)(?::(\$?)([A-Z]{1,3})(\$?\d*))?"$/

const reRefDeHoja = (hoja) => new RegExp(
  `((?:'${hoja}'|(?<![A-Za-z0-9_'])${hoja})!)(\\$?)([A-Z]{1,3})(\\$?\\d*)(?::(\\$?)([A-Z]{1,3})(\\$?\\d*))?(?![A-Za-z0-9_(])`, 'g')

/** Separa código y literales de texto (`"…"`, con `""` adentro). Los impares son textos. */
const partir = (formula) => String(formula).split(/("(?:[^"]|"")*")/)

/**
 * La transformación de UNA fórmula. NÚCLEO PURO.
 * @param {string} formula tal como la devuelve el render FORMULA (en el locale del archivo: `;`)
 * @returns {{formula:string, cambio:boolean, columnas:{antes:string[], despues:string[]}, dudas:string[], avisos:string[], importa:string|null}}
 */
export function correrFormula(formula, { hoja = HOJA_COPIA, desde = DESDE, hasta = HASTA } = {}) {
  const partes = partir(formula)
  const codigo = partes.filter((_, i) => i % 2 === 0).join(' ')
  const dudas = []
  const avisos = []
  const antes = new Set()
  const despues = new Set()
  const tieneImport = /\bIMPORTRANGE\s*\(/i.test(codigo)
  const citaCopia = reRefDeHoja(hoja).test(codigo)
  let importa = null
  let inicioImport = null

  const salida = partes.map((p, i) => {
    if (i % 2 === 0) {
      return p.replace(reRefDeHoja(hoja), (m, pref, d1, l1, n1, d2, l2, n2) => {
        const mover = (l) => (indiceDe(l) > hasta ? l : correrLetra(l, desde))
        for (const l of [l1, l2].filter(Boolean)) {
          antes.add(l); despues.add(mover(l))
          if (indiceDe(l) > hasta) avisos.push(`${m}: ${l} está fuera de lo importado (hasta ${letra(hasta)}), es una celda propia de ${hoja}: no se corre`)
        }
        if (l2 && indiceDe(l1) <= hasta && indiceDe(l2) > hasta) dudas.push(`${m} empieza adentro de lo importado y termina afuera: revisarlo a mano`)
        if (l2 && indiceDe(l1) < desde && indiceDe(l2) >= desde && indiceDe(l2) <= hasta) avisos.push(`${m} cruza la columna insertada: se ensancha, como lo haría Google`)
        return `${pref}${d1}${mover(l1)}${n1}${l2 ? `:${d2}${mover(l2)}${n2}` : ''}`
      })
    }
    const t = RE_TEXTO_COMPRAS.exec(p)
    if (t && tieneImport) {
      const [, nombre, d1, l1, n1, d2, l2, n2] = t
      importa = `${l1}${n1}${l2 ? `:${l2}${n2}` : ''}`
      inicioImport = indiceDe(l1)
      if (l1 && indiceDe(l1) >= desde) dudas.push(`el IMPORTRANGE arranca en ${l1}, a la derecha de la inserción: revisarlo a mano`)
      return `"${nombre}!${d1}${correrLetra(l1, desde)}${n1}${l2 ? `:${d2}${correrLetra(l2, desde)}${n2}` : ''}"`
    }
    if (new RegExp(`${hoja}!|Compras!`).test(p)) dudas.push(`referencia adentro de un texto: ${p.slice(0, 60)}`)
    return p
  })

  // `Col13` de un QUERY sobre el IMPORTRANGE de Compras: la columna N del rango importado.
  if (tieneImport && importa && /\bQUERY\s*\(/i.test(codigo)) {
    for (let i = 1; i < salida.length; i += 2) {
      salida[i] = salida[i].replace(/\bCol(\d+)\b/g, (m, n) => {
        const abs = inicioImport + Number(n) - 1
        return abs >= desde ? `Col${Number(n) + 1}` : m
      })
    }
  } else if (citaCopia && FUNCIONES_CON_POSICION.test(codigo)) {
    dudas.push(`usa una función con posición de columna (${codigo.match(FUNCIONES_CON_POSICION)[1]}) sobre ${hoja}: no la transformo a ciegas`)
  }

  const nueva = salida.join('')
  return {
    formula: nueva, cambio: nueva !== formula, importa, dudas, avisos,
    columnas: { antes: [...antes].sort(), despues: [...despues].sort() },
  }
}

/**
 * El plan para el archivo entero. NÚCLEO PURO.
 * @param {{hoja:string, celda:string, formula:string}[]} formulas todas las fórmulas del P&L
 * @param {{rangoEsperado?:string}} [o] el rango que tiene que decir el IMPORTRANGE ANTES de correr
 */
export function planDelPyl(formulas = [], { rangoEsperado = 'A:Y', desde = DESDE } = {}) {
  const hasta = indiceDe(rangoEsperado.split(':').pop().replace(/\d+$/, ''))
  const cambios = []
  const dudas = []
  const imports = []
  let citanCob = 0
  for (const f of formulas) {
    if (reRefDeHoja(HOJA_COPIA_COBRANZAS).test(f.formula)) citanCob++
    const r = correrFormula(f.formula, { desde, hasta })
    if (r.importa) imports.push({ hoja: f.hoja, celda: f.celda, rango: r.importa })
    if (r.dudas.length) dudas.push({ ...f, dudas: r.dudas })
    if (r.cambio) cambios.push({ hoja: f.hoja, celda: f.celda, antes: f.formula, despues: r.formula, columnas: r.columnas, avisos: r.avisos })
  }
  const problemas = []
  if (!imports.length) problemas.push('no encontré el IMPORTRANGE de Compras: el P&L cambió, no corro nada')
  for (const i of imports) {
    if (i.rango !== rangoEsperado) {
      problemas.push(`${i.hoja}!${i.celda} importa Compras!${i.rango} y esperaba ${rangoEsperado}: ¿ya se corrió? No lo corro dos veces`)
    }
  }
  for (const d of dudas) problemas.push(`${d.hoja}!${d.celda}: ${d.dudas.join(' · ')}`)
  return { cambios, dudas, imports, citanCob, problemas }
}
