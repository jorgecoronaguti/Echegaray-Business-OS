// ESCRIBIR UNA COLUMNA DE MARCAS SIN PISAR LO AJENO — Y SIN QUE UNA CELDA AJENA APAGUE EL RESTO.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (13/08) ═══
//
// `cheques-cobertura-sheet.mjs` marcaba la columna M de "Cheques Emitidos" con un guard todo-o-nada:
// leía la columna entera y, si UNA celda tenía algo que el script no reconocía, tiraba
// `me niego a escribir: la columna M de Cheques Emitidos tiene contenido que no reconozco`
// y abortaba la corrida completa. Medido contra el archivo vivo: la columna tenía SÓLO marcas del
// propio generador salvo M132 —una nota tipeada por una carga puntual vía API—, y esa única celda
// dejó a los otros 105 cheques SIN marca. El calendario de CAJA sólo ve los cheques marcados: el
// piso proyectado quedó optimista por el total de todos ellos, sin un solo error a la vista.
//
// ═══ LA REGLA ═══
//
//     La detección es POR FILA. La fila ajena se preserva intacta y no se marca; las demás se marcan.
//
// Es el mismo principio que `escribirPreservando` ya aplica al contenido: fusionar, no bloquear en
// bloque. Acá no alcanza con fusionar celda a celda porque la escritura es un rango contiguo — así
// que la ventana se parte en TRAMOS y la fila ajena queda entre dos tramos, sin recibir ni valor ni
// formato. Que una fila salteada igual se formatee es el defecto de "escritura salteada que sigue
// formateando": una fila que no se escribió no cambió de forma.
//
// ═══ POR QUÉ SIGUE HABIENDO UN ABORTO ═══
//
// Saltear en silencio sería cambiar un error ruidoso por uno mudo, que es peor. Una celda
// contaminada es un accidente; media columna ajena significa que el contrato de la columna cambió
// —alguien la está usando para otra cosa— y ahí seguir marcando sería escribir sobre el trabajo de
// otro. Por eso: se saltea y se grita hasta un límite, y pasado el límite se aborta.

/**
 * HASTA DÓNDE ES UN ACCIDENTE.
 *
 * `max` en 5 filas: el caso real era 1. `fraccion` en 10% para que un registro chico no se salve por
 * el absoluto (3 filas ajenas sobre 12 no es una celda contaminada). El mínimo de 2 para que la
 * fracción actúe existe porque en un registro de 8 filas UNA sola ya supera el 10%, y una sola celda
 * es exactamente el caso que este cambio vino a tolerar.
 */
export const LIMITES_AJENAS = { max: 5, fraccion: 0.1, minParaFraccion: 2 }

/** ¿La cantidad de filas ajenas dejó de ser un accidente? PURA. */
export function excedeElLimite(ajenas, ventana, limites = LIMITES_AJENAS) {
  const { max, fraccion, minParaFraccion } = { ...LIMITES_AJENAS, ...limites }
  if (ajenas > max) return true
  return ajenas >= minParaFraccion && ventana > 0 && ajenas / ventana > fraccion
}

const textoDe = (f) => String((Array.isArray(f) ? f[0] : f) ?? '').trim()

/**
 * NÚCLEO PURO: en qué tramos se puede escribir la columna de marcas, y qué queda afuera.
 *
 * @param {object}   p
 * @param {any[]}    p.columna  la columna leída desde la fila 1 (índice 0 = fila 1 de la pestaña)
 * @param {any[][]}  p.marcas   una fila por celda a escribir, en el shape que espera batchUpdateValues
 * @param {number}   p.fila0    fila real (1-based) de la primera marca
 * @param {(t:string)=>boolean} p.esMio  ¿este texto lo escribe el propio generador?
 * @param {object}   [p.limites]
 * @returns {{tramos:{fila:number,valores:any[][]}[], salteadas:{fila:number,texto:string,marca:any}[],
 *            fuera:{fila:number,texto:string}[], aborto:null|{ajenas:number,ventana:number}}}
 */
export function planDeMarcado({ columna = [], marcas = [], fila0 = 1, esMio = () => false, limites } = {}) {
  const ajenaEn = (fila) => {
    const t = textoDe(columna[fila - 1])
    return t && !esMio(t) ? t : ''
  }

  const salteadas = []
  const tramos = []
  let tramo = null
  for (let i = 0; i < marcas.length; i++) {
    const fila = fila0 + i
    const ajena = ajenaEn(fila)
    if (ajena) {
      // La marca que NO se escribe viaja en el reporte: sin ella, "fila 132 salteada" no dice qué se
      // perdió el cash flow — y lo que se perdió es un cheque entero fuera de la descomposición.
      salteadas.push({ fila, texto: ajena, marca: Array.isArray(marcas[i]) ? marcas[i][0] : marcas[i] })
      tramo = null
      continue
    }
    if (!tramo) { tramo = { fila, valores: [] }; tramos.push(tramo) }
    tramo.valores.push(marcas[i])
  }

  // AJENAS FUERA DE LA VENTANA: no bloquean nada —no se escribe ahí— pero cuentan para el límite.
  // Es la señal que el guard viejo tenía razón en mirar: contenido ajeno repartido por toda la
  // columna no es una celda contaminada, es que la columna dejó de ser del generador.
  const fuera = []
  for (let fila = 1; fila <= columna.length; fila++) {
    if (fila >= fila0 && fila < fila0 + marcas.length) continue
    const t = ajenaEn(fila)
    if (t) fuera.push({ fila, texto: t })
  }

  const ajenas = salteadas.length + fuera.length
  const aborto = excedeElLimite(ajenas, marcas.length, limites) ? { ajenas, ventana: marcas.length } : null
  return { tramos, salteadas, fuera, aborto }
}

/**
 * El mensaje del aborto, con las filas y su texto: un aborto que no dice DÓNDE mirar obliga a abrir
 * la pestaña a mano, que es lo que costó una corrida entera la primera vez.
 * @returns {string}
 */
export function motivoDeAborto(plan, { columna: letraCol, pestaña } = {}) {
  const muestra = [...plan.salteadas, ...plan.fuera]
    .slice(0, 8)
    .map((x) => `${letraCol}${x.fila}="${String(x.texto).slice(0, 40)}"`)
    .join(' · ')
  return `me niego a escribir: la columna ${letraCol} de ${pestaña} tiene ${plan.aborto.ajenas} fila(s) con contenido que no reconozco `
    + `sobre ${plan.aborto.ventana} del registro — eso ya no es una celda contaminada, es que la columna cambió de dueño. ${muestra}`
}
