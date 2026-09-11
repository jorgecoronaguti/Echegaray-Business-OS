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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CUANDO LA PESTAÑA ES DEL DUEÑO: NO SE MIRA, NO SE ESCRIBE, Y SE DICE HASTA CUÁNDO VALE LO QUE HAY
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO QUE ESTO CIERRA (auditoría del 10/09/2026) ═══
//
// «Cheques Emitidos» quedó candada el 10/09 13:23 con el motivo «el dueño edita», y el candado hace
// exactamente lo que promete: la pestaña no se toca. Pero `cheques-cobertura-sheet.mjs` MIRABA la
// columna igual, armaba el plan, encontraba las ediciones del dueño en su propia columna de marcas y
// abortaba — y el aborto es un `throw`, así que el paso salía con código 1 y el TIMER ENTERO fallaba
// en cada corrida. Un candado que rompe el pipeline es un candado que alguien va a querer sacar.
//
// El orden correcto es el único orden posible: primero se pregunta de quién es la pestaña, y recién
// después se decide qué hacer con su contenido. Una pestaña candada no tiene «contenido ajeno»: es
// TODA ajena, por decisión escrita.
//
// Y NO SE SALE EN SILENCIO. Lo que queda congelado es un DIAGNÓSTICO —qué cheque tiene su factura
// cargada y cuál no—, y un diagnóstico sin fecha se lee como si fuera de hoy. Por eso el aviso
// declara la frescura que trae el propio rótulo de la columna («Estado en el OS · al …»): lo que se
// ve en la pestaña es de ESE día, no de esta corrida.

/** La acción que corresponde según de quién es la pestaña. PURA. */
export function accionDeMarcado({ candada = false, forzar = false } = {}) {
  if (!candada) return 'escribir'
  return forzar ? 'forzar' : 'saltar'
}

/** NÚCLEO PURO: la fecha que declara el rótulo «Estado en el OS · al DD/MM/AAAA», o null. */
export function frescuraDelRotulo(rotulo) {
  const m = /al\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(String(rotulo ?? ''))
  return m ? m[1] : null
}

/**
 * NÚCLEO PURO: las líneas del aviso ⏸. Devuelve texto, no imprime: así se puede probar.
 *
 * Sin fecha en el rótulo NO se inventa una ni se calla: se dice que no se puede saber de cuándo es
 * lo que está a la vista, que es el estado real. Un «al 10/09» falso sería peor que el hueco.
 */
export function avisoDeCandado({ pestana, columna, rotulo, congeladas = 0, monto = 0 } = {}) {
  const fecha = frescuraDelRotulo(rotulo)
  const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
  return [
    `⏸ "${pestana}" está bajo tu control (candado): no la miro ni la escribo.`,
    `   ${congeladas} fila(s) por ${$(monto)} se quedan con el diagnóstico de la columna ${columna} `
      + (fecha
        ? `tal como quedó el ${fecha}: lo que se ve NO es de esta corrida.`
        : 'que haya hoy — el rótulo no dice de cuándo es, así que NO puedo declarar su frescura.'),
    '   Para estamparlas igual: --forzar-candado (deja snapshot, escribe sólo esa columna y vuelve a candar).',
  ]
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CAPA FÓSIL DEL PROPIO SELLO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO MEDIDO EL 11/09/2026 SOBRE EL ARCHIVO VIVO ═══
//
// «Tarjeta de Credito» mostraba «Estado en el OS · al 24/7/2026» — 48 días de atraso— y la auditoría
// de consistencia lo anotó como «el sello de la pestaña no se actualiza». No era eso: el sello de HOY
// estaba estampado, en `L31`, y decía «al 11/9/2026». Los que se veían eran DOS FÓSILES, en `L2` y
// `L23`, los dos fechados «al 24/7/2026». El de `L2` se explica: hasta el 04/08
// `INSTRUMENTOS.tarjeta.filaCab` valía 2 y el sello se estampaba ahí. El de `L23` NO lo pude probar
// —`BANDA` fue 52 y después 31, nunca 23— y no hace falta: la regla no depende de la historia de
// cada fósil sino de una sola cosa, que la fila no sea la cabecera de HOY.
//
// POR QUÉ NO SE BORRABAN SOLOS. El generador de la pestaña (`tarjeta-pestana.mjs`) sí es dueño de la
// columna L de su banda, pero la guarda de borrado sólo vacía lo que puede PROBAR del OS
// (`residuo-propio.mjs`): un texto que arranca con «Estado en el OS» no tiene forma de generador y no
// está en el registro de rótulos —su fecha cambia en cada corrida, así que nunca coincide—. Bien
// conservado, entonces: el fósil quedaba blindado con el mismo blindaje que protege lo del dueño.
//
// POR QUÉ LO LIMPIA EL QUE LO ESCRIBE, Y NO EL GENERADOR DE LA PESTAÑA. Porque el generador corre
// DESPUÉS (`tarjeta-pestana.mjs` está más abajo en el pipeline que `cheques-cobertura-sheet.mjs`):
// ensanchar su guarda para que reconozca el sello le habría dado permiso para borrar el sello FRESCO
// de esta misma corrida. La basura la saca el que la generó, en su propia columna, y sólo la de las
// filas que ya no son la suya.

/** Con qué texto abre el sello que el OS estampa arriba de su columna de marcas. */
export const SELLO_OS = 'Estado en el OS'

/**
 * NÚCLEO PURO: en qué filas de la columna de marcas quedó un sello VIEJO del OS.
 *
 * Devuelve filas base 1, siempre distintas de `filaCab` —la de esta corrida no se toca— y siempre
 * ARRIBA de ella: por debajo de `filaCab` viven las marcas fila por fila, y una marca no es un sello.
 *
 * @param {Array} columna la columna releída en el destino (filas desde la 1), como la devuelve la API
 * @param {number} filaCab la fila donde este sello se estampa HOY
 * @returns {number[]} las filas a vaciar, en orden
 */
export function sellosViejos(columna = [], filaCab = 0) {
  const filas = []
  for (let i = 0; i < columna.length && i + 1 < filaCab; i++) {
    if (textoDe(columna[i]).startsWith(SELLO_OS)) filas.push(i + 1)
  }
  return filas
}

/**
 * NÚCLEO PURO: los TEXTOS de esos sellos viejos, para que el generador dueño de la banda los declare
 * suyos (`vaciarPropio.mios`) y `no-borrar` le permita vaciarlos.
 *
 * 11/09/2026: `cheques-cobertura-sheet.mjs` vaciaba L2/L23 de «Tarjeta de Credito» y 29 segundos
 * después `tarjeta-pestana.mjs` los REPONÍA: la banda relee el destino, no puede probar que ese
 * texto sea del OS (lo escribió otro script y no está en su registro de rótulos) y lo conserva como
 * si fuera del dueño. Es la trampa de la «celda vaciada falsa por forma»: el que corre último gana.
 * Con los textos exactos en `mios`, la celda es probadamente propia y se vacía.
 */
export function textosDeSellosViejos(columna = [], filaCab = 0) {
  return sellosViejos(columna, filaCab).map((f) => textoDe(columna[f - 1]))
}
