// LO QUE YA SE PREGUNTÓ NO SE VUELVE A PREGUNTAR — el núcleo puro del arrastre.
//
// ═══ EL DEFECTO (08/09/2026, 16:35) ═══
//
// Dos recibos de Movistar del 03/09 que la visión leyó SIN NÚMERO volvieron a preguntarse HOY,
// cinco días después, dentro de un fajo nacido hace un rato (`fa779ea0`), con el renglón
// «(Se me había quedado sin contestar hace 18 minutos)». El dueño: «borrá eso viejo que quedó
// pegado de antes, es desesperante».
//
// El mecanismo: cuando se abre un fajo nuevo, los pendientes del anterior SE MUDAN para no perder
// el gasto (regla del 05/08, correcta y no se toca). Pero se mudaban TODOS, para siempre. Un ítem
// sin número no se puede cargar sin que una persona conteste, así que nunca se resolvía, se mudaba
// otra vez, el fajo nuevo quedaba mudo, el vigía publicaba su pregunta… y así cada vez que llegaba
// una foto cualquiera. Cada fajo nuevo era un `aviso_post_id` nuevo: la guarda contra repetir el
// aviso funcionaba, y aun así el dueño veía la misma pregunta una y otra vez.
//
// ═══ LA REGLA ═══
//
// Se pregunta UNA vez. Después el ítem sigue viajando —para que la respuesta tenga dónde caer y el
// gasto no se pierda— pero CALLADO: no entra en la pregunta ni despierta al vigía. A las 72 h sin
// respuesta se descarta solo, con un aviso único.
//
// Sigue preguntándose todas las veces lo que SÍ se puede resolver mirando: un duplicado probable,
// una imputación en blanco. Eso tiene número y tiene plata; callarlo sería esconder trabajo.

/** Horas que un ítem preguntado espera una respuesta antes de descartarse solo. */
export const HORAS_ESPERA = Number(process.env.ORQ_COMPROBANTES_HORAS_ESPERA || 72)

/**
 * UN ÍTEM QUE NADIE PUEDE RESOLVER SIN ESCRIBIR EL DATO A MANO.
 *
 * Sin número canónico no hay clave: no se puede deduplicar, no se puede cruzar con ARCA y no se
 * puede escribir en Compras. Es exactamente el ítem «ilegible / sin clave» del reclamo. Un ítem con
 * número pero con la obra en blanco NO entra acá: ése se resuelve con un desplegable.
 */
export function sinClave(it = {}) {
  const c = it?.comprobante ?? {}
  return !it?.clave && !c.numero && !c.numeroCanonico
}

/** ¿Ya se le preguntó al dueño por este ítem? */
export function yaPreguntado(it = {}) {
  return Boolean(it?.preguntadoEn)
}

/** Horas transcurridas desde que se preguntó, o null si nunca se preguntó. */
export function horasEsperando(it = {}, ahora = new Date()) {
  const t = it?.preguntadoEn ? Date.parse(it.preguntadoEn) : NaN
  if (!Number.isFinite(t)) return null
  return (Number(ahora) - t) / 3_600_000
}

/**
 * ¿Este ítem tiene que quedarse callado en el fajo nuevo?
 *
 * Sólo el que no tiene clave Y al que ya se le preguntó. El resto grita todo lo que quiera.
 */
export function silenciado(it = {}) {
  return yaPreguntado(it) && sinClave(it)
}

/**
 * REPARTE LOS PENDIENTES DE UN FAJO QUE SE CIERRA.
 *
 * @param {Array} items los ítems del fajo viejo
 * @param {{ahora?:Date, horas?:number}} o
 * @returns {{mudan:Array, vencidos:Array}}
 *   `mudan` — viajan al fajo nuevo, ya sellados con `preguntadoEn` y, si corresponde, `silenciado`.
 *   `vencidos` — 72 h sin respuesta: se descartan, y se avisa UNA vez.
 */
export function repartirPendientes(items = [], { ahora = new Date(), horas = HORAS_ESPERA } = {}) {
  const mudan = []; const vencidos = []
  for (const it of items) {
    if (!it || it.yaCargado) continue
    if (!yaPreguntado(it)) {
      // PRIMER VIAJE. El fajo del que viene ya publicó su pregunta —es lo que hace `mensajeFajo` al
      // abrirlo—, así que a partir de acá cuenta el reloj. Se sella al MUDARSE y no al preguntar
      // porque es el único punto por el que pasan todos los caminos.
      mudan.push({ ...it, preguntadoEn: new Date(ahora).toISOString() })
      continue
    }
    if (!sinClave(it)) { mudan.push(it); continue }
    const h = horasEsperando(it, ahora)
    if (h !== null && h >= horas) { vencidos.push(it); continue }
    mudan.push({ ...it, silenciado: true })
  }
  return { mudan, vencidos }
}

/** El aviso único de lo que se descartó solo. `null` si no venció nada. */
export function avisoDeVencidos(vencidos = [], { horas = HORAS_ESPERA } = {}) {
  if (!vencidos.length) return null
  const n = vencidos.length
  return `🗑 Descarté ${n === 1 ? 'un comprobante' : `${n} comprobantes`} que no pude leer y `
    + `${n === 1 ? 'quedó' : 'quedaron'} ${horas} horas sin respuesta. `
    + `Si ${n === 1 ? 'todavía va' : 'todavía van'}, mandámel${n === 1 ? 'o' : 'os'} de nuevo.`
}
