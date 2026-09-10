// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A QUÉ OBRA PERTENECE UNA FILA DE COBRANZAS — la regla PURA, especificación de la SQL
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN (10/09/2026) ═══
//
// `obra_cobranza` resolvía la obra de cada cobro por `norm_obra(cobranzas.obra_cliente)`. Pero esa
// columna NO nombra una obra: nombra al CLIENTE —«MESSINA», «ARCOR», «Quattropani - Melisa García
// SAS»—. Las 24 filas de Messina caían enteras en la obra bolsa `messina` y las cinco obras vivas
// del cliente (BSA, Bases Tanque SO2, Pisos 120 m², Playón de Azufre, Limpieza de Escombros)
// publicaban `cobrado = NULL`. El cobro POR OBRA no existía en la base: la barra de /clientes salía
// vacía para Messina y para San Francisco, y el dueño la reclamó.
//
// ═══ LA CADENA, EN ORDEN, Y POR QUÉ ESE ORDEN ═══
//
//   1 · LA ORDEN DE COMPRA (columna H del Sheet, `cobranzas.orden_compra`). Es el ÚNICO eslabón
//       documental: el cliente emitió esa OC por una obra concreta y el papel está en
//       `cliente_orden` con su `obra_id`. No se adivina nada — se lee.
//   2 · EL TEXTO QUE NOMBRA LA OBRA. «PILON», «BASES TANQUE SO2 - Cancelación», «Playon Azufre -
//       Negro - Certificación 1/2» nombran la obra aunque no haya OC cargada. Se resuelve contra el
//       MISMO diccionario `obra_alias`, restringido a las obras DEL MISMO CLIENTE y sólo con los
//       alias marcados `en_texto_libre`.
//   3 · LA BOLSA DEL CLIENTE, exactamente como hasta hoy. No es un logro: es lo que queda cuando no
//       se pudo, y por eso la fila sale marcada `imputacion = 'cliente'` — la pantalla tiene que
//       poder decir «sin obra asignada» en vez de dibujar una barra que afirma un cobro por obra
//       que nadie probó.
//
// EL ORDEN NO ES ESTÉTICO. La fila 94 de Messina («Adicional tercer muro … Playon de Azufre», OC
// 00002-00002256) NOMBRA el Playón en el texto y PERTENECE al Adicional Tercer Muro según la OC. Si
// el alias ganara, ese cobro se imputaría a la obra equivocada del mismo cliente. El papel gana.
//
// ═══ DOS OBRAS ⇒ NINGUNA ═══
//
// Ni la OC ni el alias reparten: si el texto nombra dos obras del cliente, o si la misma OC aparece
// con dos obras distintas, la fila cae a la bolsa con su motivo escrito. Repartir sería inventar, y
// la dirección de inventar acá es afirmar plata cobrada de una obra — la peor.
//
// ═══ POR QUÉ ESTA REGLA VIVE DOS VECES (JS Y SQL) Y CÓMO NO SE DESINCRONIZA ═══
//
// La que MANDA es la SQL: la vista `obra_cobranza` corre en Postgres y es la que ven las tres caras.
// Este módulo es la ESPECIFICACIÓN ejecutable —el corpus de textos reales de la columna H vive en
// `cobranza-obra.test.mjs`— y `cobranza-obra.pg.test.mjs` corre las dos implementaciones sobre las
// MISMAS filas de `public.cobranzas` y exige que coincidan fila por fila. Si alguien toca una sola
// de las dos, ese test se pone rojo. El mismo argumento que `obra-operacion.mjs` con `norm_obra()`.

import { numeroCanonico } from './ordenes-identidad.mjs'
import { normObra } from './obra-operacion.mjs'

// ── QUÉ OC DECLARA LA COLUMNA H ─────────────────────────────────────────────────────────────────
//
// H no tiene formato: el mismo dato se escribe de cinco maneras medidas hoy en el Sheet —
//
//     'OC 53239034'                              ARCOR, con rótulo
//     'OC 53241303 - 50%'                        con rótulo y una coletilla que también es número
//     '00002-00002097'                           Messina, el número pelado del cliente
//     '53312775 6A'                              pelado con el ítem de la OC pegado atrás
//     '00002-00002256 · cta. cte. 30 días'        pelado con la condición de pago pegada atrás
//     'Anticipo … Playon de Azufre. OC 00002-00002173 (11/08/2026) — 50% …'   rótulo dentro de una frase
//     'RECLAMAR OC!'                             el rótulo SIN número: no declara ninguna OC
//
// De ahí las dos reglas: el RÓTULO en cualquier parte del texto, y —sólo si no hay rótulo— el
// número AL PRINCIPIO. «Al principio» y no «en cualquier parte» porque «Resto 50% s/ total
// 65.000.000 — certificación quincenal 1/2» tiene tres números y ninguno es una orden de compra.

const CON_ROTULO = /\b(?:o\/?c|orden(?:es)?\s+de\s+compra)\s*(?:n[°ºo.r]*)?\s*[:#-]?\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})/gi
const AL_PRINCIPIO = /^\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})/

/**
 * El número de OC —canónico, ver `numeroCanonico`— que declara este texto, o `null`.
 *
 * DOS OC DISTINTAS CON RÓTULO ⇒ `null`: una fila que cita dos órdenes no pertenece a una de las dos.
 * @param {unknown} texto
 * @returns {string|null}
 */
export function ocDeclarada(texto) {
  const t = String(texto ?? '')
  const rotuladas = new Set()
  for (const m of t.matchAll(CON_ROTULO)) {
    const canon = numeroCanonico(m[1])
    if (canon) rotuladas.add(canon)
  }
  if (rotuladas.size === 1) return [...rotuladas][0]
  if (rotuladas.size > 1) return null
  const suelta = t.match(AL_PRINCIPIO)
  return suelta ? numeroCanonico(suelta[1]) : null
}

/**
 * Las obras que este texto NOMBRA, según los alias habilitados para texto libre.
 *
 * El alias se busca con borde de palabra sobre el texto YA normalizado: «pilon» no puede matchear
 * dentro de otra palabra, y «playon azufre» matchea «Playon de Azufre» porque `normObra` tira el
 * artículo en los dos lados. Los alias vienen normalizados de la base —lo garantiza la migración—,
 * así que ninguno puede traer un metacarácter a la expresión.
 *
 * @param {unknown} texto
 * @param {{alias: string, obraId: string}[]} aliases
 * @returns {string[]} ids de obra, sin repetir
 */
export function obrasNombradas(texto, aliases) {
  const t = normObra(texto)
  if (!t) return []
  const halladas = new Set()
  for (const a of aliases ?? []) {
    if (!a?.alias || !a.obraId) continue
    if (new RegExp(`\\b${a.alias}\\b`).test(t)) halladas.add(a.obraId)
  }
  return [...halladas]
}

/** @typedef {{cliente_id: string|null, obra_cliente: string|null, orden_compra: string|null, concepto: string|null}} FilaCobranza */
/**
 * El diccionario, ya recortado AL CLIENTE de la fila — el mismo recorte que hace la SQL:
 *  - `obraPorOc`      número canónico de OC → id de obra viva (de `cliente_orden` del cliente)
 *  - `aliasesLibres`  alias `en_texto_libre` de las obras del cliente
 *  - `bolsa`          id de obra al que resuelve `norm_obra(obra_cliente)` en `obra_alias`, o null
 * @typedef {{obraPorOc: Map<string,string>, aliasesLibres: {alias:string,obraId:string}[], bolsa: string|null}} Diccionario
 */

/**
 * A qué obra va esta cobranza y CON QUÉ FUERZA. `imputacion` es el dato que le falta a la pantalla:
 * 'oc' es un papel, 'alias' es un texto que nombra la obra, 'cliente' es «no se pudo, quedó con el
 * cliente». `obraId: null` es «no se pudo ni eso» — el cliente no tiene bolsa en el diccionario.
 *
 * @param {FilaCobranza} fila
 * @param {Diccionario} dicc
 * @returns {{obraId: string|null, imputacion: 'oc'|'alias'|'cliente'|null, porque: string}}
 */
export function resolverObraDeCobranza(fila, dicc) {
  const oc = ocDeclarada(fila?.orden_compra)
  const porOc = oc ? dicc?.obraPorOc?.get(oc) : null
  if (porOc) return { obraId: porOc, imputacion: 'oc', porque: `la OC ${oc} está cargada en esa obra` }

  const nombradas = obrasNombradas(
    `${fila?.concepto ?? ''} ${fila?.orden_compra ?? ''}`, dicc?.aliasesLibres ?? [])
  if (nombradas.length === 1) {
    return { obraId: nombradas[0], imputacion: 'alias', porque: 'el texto nombra esa obra del cliente' }
  }

  const bolsa = dicc?.bolsa ?? null
  const porque = nombradas.length > 1
    ? `el texto nombra ${nombradas.length} obras del cliente (${nombradas.join(', ')}) y no distingue`
    : oc
      ? `la OC ${oc} no está cargada con obra`
      : 'no declara OC ni nombra ninguna obra del cliente'
  if (bolsa) return { obraId: bolsa, imputacion: 'cliente', porque }
  return { obraId: null, imputacion: null, porque: `${porque}, y el cliente no tiene obra bolsa` }
}
