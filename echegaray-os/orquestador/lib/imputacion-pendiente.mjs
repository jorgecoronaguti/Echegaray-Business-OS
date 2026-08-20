// PENDIENTES DE IMPUTACIÓN — qué fila no sabe a qué obra pertenece, y cuándo se puede sugerir una.
//
// ═══ LA UNIDAD DE TRABAJO ES EL TEXTO, NO LA FILA ═══
//
// Compras, pedidos, herramientas y movimientos guardan la obra como TEXTO libre. Lo que traduce ese
// texto al eje canónico es `obra_alias`, y una fila de ese diccionario resuelve TODAS las filas que
// dicen lo mismo — las de hoy y las que entren mañana. Por eso esta capa agrupa por
// `norm_obra(texto)`: resolver de a una fila sería resolver la misma pregunta N veces, y peor,
// permitiría contestarla distinto cada vez.
//
// Esa es también la razón por la que la selección múltiple es segura acá y no lo sería en general:
// las N filas de un grupo comparten la clave EXACTA, así que confirmarlas juntas no es un lote, es
// la única resolución posible. Filas de claves distintas nunca se ofrecen juntas.
//
// ═══ POR QUÉ LA SUGERENCIA CASI NUNCA APARECE, Y ESO ESTÁ BIEN ═══
//
// El dueño: *"obra sugerida SÓLO si existe evidencia (…) Nunca por parecido de nombre."* La trampa
// concreta, medida en la base el 18/08/2026: el único texto realmente pendiente es «SERV. TECNICO»,
// y la herramienta que está ahí (5a432e23) tiene un movimiento anterior a «SAN FRANCISCO». Un
// sugeridor que mirara el historial de esa herramienta propondría San Francisco — pero la
// herramienta está en el SERVICIO TÉCNICO, y el alias que se escribiría mandaría a San Francisco
// todo lo que alguna vez diga «SERV. TECNICO». Una inferencia sobre UNA FILA aplicada a un TEXTO
// fabrica costo en la obra equivocada sin que nada avise.
//
// De ahí las dos únicas evidencias admitidas, y sus dos niveles de confianza:
//
//   A · TEXTO IDÉNTICO YA RESUELTO. Existe un alias que una persona ya resolvió y cuyo `ejemplo_raw`
//       es LITERALMENTE el mismo texto (salvo mayúsculas y espacios de borde) pero cuya clave
//       normalizada quedó distinta — pasa de verdad: «Quattropani (pestaña del tracker)» normaliza a
//       `quattropani pestana tracker` y no a `quattropani`. Es un juicio humano sobre ese mismo
//       texto, así que se PRESELECCIONA.
//   B · RECURSO UNÁNIME. Sólo para compras, y sólo si TODAS las filas del grupo son del mismo
//       proveedor y ese proveedor no tiene una sola compra imputada a otra obra. Es una inferencia,
//       no un hecho: se muestra el motivo y el número, pero NO se preselecciona nada. Quien resuelve
//       tiene que elegir la obra a mano.
//
// No hay una tercera. Nada de distancia de edición, substrings ni "¿quisiste decir?": «Estrella
// Norte» no es «La Estrella», y el test lo deja escrito.

import { normObra } from './obra-operacion.mjs'
import { normalizarNombreProveedor } from './proveedor-identidad.mjs'

/** Las dos clasificaciones que SÍ son una obra. `indirecto` y `excluido` son estructura: tienen
 *  respuesta, y por lo tanto no son un pendiente. Mismo recorte que `obra_costo_real`. */
export const CLASIFICACION_DE_OBRA = new Set(['obra', 'mantenimiento'])

/** Cuánto historial necesita un proveedor para que su unanimidad valga como evidencia. Con una o
 *  dos compras, "siempre a la misma obra" es una casualidad, no un patrón. */
export const MINIMO_HISTORIAL_RECURSO = 3

/** @typedef {{ alias: string, obra_id: string|null, clasificacion: string, ejemplo_raw: string|null }} FilaAlias */
/** @typedef {'compra'|'pedido'|'herramienta'|'movimiento'} TipoFila */
/** @typedef {Map<string, {obras:Set<string>, filas:number}>} Historial */
/** @typedef {{clave:string, textos:string[], filas:FilaImputable[], cantidad:number,
 *             importe:number, tipos:string[], origenes:string[]}} Grupo */
/** @typedef {{ tipo: TipoFila, id: string, tabla: string, referencia: string|null, fuente: string|null,
 *              fecha: string|null, descripcion: string, importe: number|null, recurso: string|null,
 *              texto: string }} FilaImputable */

/** `obra_alias` indexado por su clave. Es un Map y no un array porque se consulta una vez por fila.
 *  @param {FilaAlias[]} filas
 *  @returns {Map<string, FilaAlias>} */
export function indexarAlias(filas = []) {
  const indice = new Map()
  for (const f of filas ?? []) {
    if (f && typeof f.alias === 'string' && f.alias) indice.set(f.alias, f)
  }
  return indice
}

/**
 * En cuál de los cuatro estados está una fila.
 *
 * `sin_texto` NO es lo mismo que `pendiente`: una herramienta con la ubicación vacía tampoco está
 * imputada, pero ningún alias puede resolverla —no hay texto que traducir—, así que ofrecerla en la
 * cola sería ofrecer un trabajo imposible. Se cuenta aparte y se dice.
 * @param {unknown} texto
 * @param {Map<string, FilaAlias>} indice
 * @returns {'obra'|'estructura'|'pendiente'|'sin_texto'}
 */
export function estadoDeFila(texto, indice) {
  const clave = normObra(texto)
  if (!clave) return 'sin_texto'
  const alias = indice.get(clave)
  if (!alias) return 'pendiente'
  if (alias.obra_id && CLASIFICACION_DE_OBRA.has(alias.clasificacion)) return 'obra'
  return 'estructura'
}

/**
 * Cuántas filas de cada fuente están imputadas, cuántas son estructura y cuántas esperan.
 *
 * Existe porque el encargo llegó con "Compras 533/845" y ese 312 de diferencia NO son pendientes:
 * son filas que alguien ya declaró costo de estructura. Mostrar sólo el numerador y el total invita
 * a resolver algo que ya está resuelto.
 * @param {FilaImputable[]} filas
 * @param {Map<string, FilaAlias>} indice
 * @returns {Record<TipoFila, {total:number, obra:number, estructura:number, pendiente:number, sin_texto:number}>}
 */
export function resumirPorTipo(filas = [], indice = new Map()) {
  const resumen = {}
  for (const f of filas ?? []) {
    if (!f) continue
    const r = resumen[f.tipo] ?? (resumen[f.tipo] = { total: 0, obra: 0, estructura: 0, pendiente: 0, sin_texto: 0 })
    r.total++
    r[estadoDeFila(f.texto, indice)]++
  }
  return resumen
}

/**
 * Las filas pendientes agrupadas por su clave, ordenadas por la plata que mueven.
 *
 * El orden es el pedido: *"lo que más plata mueve, primero"*. Herramientas y movimientos no tienen
 * importe (mueven un recurso, no un peso) y caen al fondo, desempatados por cantidad de filas.
 * @param {FilaImputable[]} filas
 * @param {Map<string, FilaAlias>} indice
 * @returns {Grupo[]}
 */
export function agruparPendientes(filas = [], indice = new Map()) {
  const grupos = new Map()
  for (const f of filas ?? []) {
    if (!f || estadoDeFila(f.texto, indice) !== 'pendiente') continue
    const clave = normObra(f.texto)
    const g = grupos.get(clave) ?? { clave, textos: [], filas: [], cantidad: 0, importe: 0, tipos: [], origenes: [] }
    g.filas.push(f)
    g.cantidad++
    g.importe += Number(f.importe) || 0
    const texto = String(f.texto).trim()
    if (texto && !g.textos.includes(texto)) g.textos.push(texto)
    if (!g.tipos.includes(f.tipo)) g.tipos.push(f.tipo)
    if (f.tabla && !g.origenes.includes(f.tabla)) g.origenes.push(f.tabla)
    grupos.set(clave, g)
  }
  return [...grupos.values()].sort(
    (a, b) => b.importe - a.importe || b.cantidad - a.cantidad || a.clave.localeCompare(b.clave),
  )
}

/**
 * A qué obras fue imputado cada recurso que YA tiene respuesta.
 *
 * Sólo cuenta filas de compras cuya clave resuelve a una obra: una compra declarada estructura no
 * dice nada sobre a qué obra iría la siguiente.
 * @param {FilaImputable[]} filas
 * @param {Map<string, FilaAlias>} indice
 * @returns {Historial}
 */
export function historialDeRecurso(filas = [], indice = new Map()) {
  const historial = new Map()
  for (const f of filas ?? []) {
    if (!f || f.tipo !== 'compra') continue
    const clave = normObra(f.texto)
    const alias = clave ? indice.get(clave) : null
    if (!alias?.obra_id || !CLASIFICACION_DE_OBRA.has(alias.clasificacion)) continue
    const recurso = normalizarNombreProveedor(f.recurso)
    if (!recurso) continue
    const h = historial.get(recurso) ?? { obras: new Set(), filas: 0 }
    h.obras.add(alias.obra_id)
    h.filas++
    historial.set(recurso, h)
  }
  return historial
}

const mismoTexto = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/** EVIDENCIA A: alguien ya resolvió este MISMO texto bajo otra clave. */
function porTextoIdentico(grupo, aliasFilas) {
  const candidatos = []
  for (const a of aliasFilas ?? []) {
    if (!a?.obra_id || !CLASIFICACION_DE_OBRA.has(a.clasificacion)) continue
    if (a.alias === grupo.clave) continue
    if (!grupo.textos.some((t) => mismoTexto(t, a.ejemplo_raw))) continue
    candidatos.push(a)
  }
  if (candidatos.length === 0) return null
  // Dos resoluciones humanas que se contradicen sobre el mismo texto no son evidencia de nada:
  // son un conflicto, y lo resuelve una persona mirando las dos.
  const obras = new Set(candidatos.map((a) => a.obra_id))
  if (obras.size !== 1) return null
  const a = candidatos[0]
  return {
    obra_id: a.obra_id,
    evidencia: 'texto_identico',
    preseleccionar: true,
    motivo: `El texto «${a.ejemplo_raw}» ya fue resuelto a mano bajo la clave «${a.alias}».`,
  }
}

/** EVIDENCIA B: todas las filas son del mismo proveedor y ese proveedor nunca compró para otra obra. */
function porRecursoUnanime(grupo, historial) {
  if (!grupo.filas.every((f) => f.tipo === 'compra')) return null
  const recursos = new Set(grupo.filas.map((f) => normalizarNombreProveedor(f.recurso) ?? ''))
  if (recursos.size !== 1) return null
  const recurso = [...recursos][0]
  if (!recurso) return null
  const h = historial?.get(recurso)
  if (!h || h.filas < MINIMO_HISTORIAL_RECURSO || h.obras.size !== 1) return null
  const obra_id = [...h.obras][0]
  return {
    obra_id,
    evidencia: 'recurso_unanime',
    // A propósito NO se preselecciona: es una inferencia sobre las filas, y el alias que se escribiría
    // vale para el texto entero, incluidas las compras futuras de otro proveedor.
    preseleccionar: false,
    motivo: `Las ${grupo.cantidad} filas son de «${recurso}», y sus otras ${h.filas} compras imputadas están todas en la misma obra.`,
  }
}

/**
 * La obra sugerida para un grupo, o `null` si no hay evidencia — que es la respuesta más frecuente.
 * @param {Grupo} grupo
 * @param {{aliasFilas?: FilaAlias[], historial?: Historial}} [ctx]
 * @returns {{obra_id:string, evidencia:string, preseleccionar:boolean, motivo:string}|null}
 */
export function sugerirObra(grupo, { aliasFilas = [], historial = new Map() } = {}) {
  if (!grupo || grupo.cantidad === 0) return null
  return porTextoIdentico(grupo, aliasFilas) ?? porRecursoUnanime(grupo, historial) ?? null
}
