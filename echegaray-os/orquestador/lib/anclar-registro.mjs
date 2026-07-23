// ANCLAR UNA CITA A OTRA PESTAÑA POR SU ENCABEZADO, NUNCA POR UN NÚMERO DE FILA A MANO.
//
// POR QUÉ EXISTE (23/07). CAJA cita el registro de "Cheques Emitidos" para saber cuánta plata está
// firmada y todavía no salió de la cuenta. Esa cita arrancaba en una fila ESCRITA A MANO
// ('Cheques Emitidos'!$F$9:$F$407, y antes $F$2:$F$400). El día que "Cheques Emitidos" se rediseñó
// —su banda de resumen creció y el registro bajó de la fila 9 a la 20— la cita de CAJA quedó
// apuntando a la banda: empezó a leer filas que NO son cheques. Hoy el total todavía cruza de
// casualidad, porque la banda guarda sus importes en la columna B y no en la F; el día que un número
// caiga en la F de la banda, CAJA lo suma como si fuera un cheque, sin un solo error a la vista.
//
// Este repositorio ya se comió esta clase de defecto tres veces (el rango fosilizado $G$5:$G$58, el
// cash flow leyendo 'Jornales por Quincena'!$B$3:$B$16 tras un rediseño, una fecha en la columna del
// importe). El patrón que sobrevive a que la pestaña de origen se rediseñe es UNO SOLO: encontrar la
// fila del encabezado del registro y derivar el rango de ahí. Un número de fila a mano no sobrevive.

/**
 * NÚCLEO PURO: la fila (1-based) del encabezado de un registro, buscándolo por su rótulo.
 *
 * Busca la PRIMERA fila cuya primera celda coincide (sin distinguir mayúsculas/acentos de borde) con
 * alguno de los rótulos candidatos. Se pasan varios candidatos porque un encabezado se escribe de
 * formas distintas ("Tipo", "TIPO") y no queremos que un cambio cosmético rompa la cita.
 *
 * @param {any[][]} colA  las filas de la columna A (o de la grilla; sólo se mira la celda [0]).
 * @param {string[]} rotulos rótulos aceptables del encabezado, en orden de preferencia.
 * @returns {number} la fila 1-based del encabezado, o 0 si no se encontró.
 */
export function filaEncabezado(colA = [], rotulos = []) {
  const quiere = new Set(rotulos.map((r) => norm(r)))
  for (let i = 0; i < colA.length; i++) {
    const t = norm(colA[i]?.[0])
    if (t && quiere.has(t)) return i + 1
  }
  return 0
}

/** Normaliza un rótulo para comparar: recorta, baja a minúsculas. Los acentos se conservan tal cual
 *  porque los encabezados reales del archivo son estables en eso; sólo neutralizamos caja y espacios. */
function norm(v) {
  return String(v ?? '').trim().toLowerCase()
}

/**
 * NÚCLEO PURO: un rango A1 ABIERTO anclado a la fila de datos que sigue al encabezado.
 *
 * Abierto ($col$desde:$col, sin fila final) a propósito: además de no fijar el INICIO a mano, no fija
 * el FINAL. Un registro que crece de 400 a 410 cheques no deja a ninguno afuera, y uno que se acota a
 * $400 sobre una pestaña de 409 filas —como está hoy— no vuelve a perder los últimos. Debajo del
 * registro no hay nada más en estas pestañas, así que el rango abierto no toma de más.
 *
 * @param {string} hoja  nombre de la pestaña (se cita con comillas simples si tiene espacios).
 * @param {string} col   letra de columna.
 * @param {number} filaDatos primera fila de DATOS (encabezado + 1), 1-based.
 * @returns {string} p.ej. `'Cheques Emitidos'!$F$21:$F`
 */
export function rangoAbierto(hoja, col, filaDatos) {
  const ref = /\s/.test(hoja) ? `'${hoja}'` : hoja
  return `${ref}!$${col}$${filaDatos}:$${col}`
}
