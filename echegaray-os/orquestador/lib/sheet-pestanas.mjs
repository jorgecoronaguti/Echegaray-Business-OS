// ENCONTRAR UNA PESTAÑA POR CÓMO EMPIEZA SU NOMBRE, NO POR EL NOMBRE EXACTO.
//
// POR QUÉ EXISTE (20/07). Dos veces en el mismo día un script se rompió porque el dueño renombró una
// pestaña: "Cheques" pasó a "Cheques Emitidos" y "Caja" a "CAJA". La primera vez el agente de cada 2
// horas venía fallando en silencio con un 400 de la API y nadie se enteraba.
//
// El nombre de una pestaña es del dueño, no del código. Renombrarla para que se entienda mejor es
// exactamente lo que hay que hacer con una planilla que se usa todos los días, y no puede romper
// nada. Por eso vive acá y no adentro de un script: lo necesita cualquiera que lea el archivo.
//
// SI HAY AMBIGÜEDAD, AVISA. Con dos pestañas que empiezan igual no elige una al azar: rompe. Elegir
// mal sería peor que fallar — escribiría datos correctos en la pestaña equivocada.

const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * NÚCLEO PURO: la pestaña cuyo nombre coincide, exacto primero y por prefijo después.
 * @param {Array<{title:string}>} hojas salida de getSheetMeta
 * @param {string} prefijo
 * @returns {{title:string, sheetId?:number}}
 */
export function hallarPestana(hojas, prefijo) {
  const exacta = hojas.find((h) => norm(h.title) === norm(prefijo))
  if (exacta) return exacta
  const cand = hojas.filter((h) => norm(h.title).startsWith(norm(prefijo)))
  if (cand.length === 1) return cand[0]
  if (cand.length > 1) throw new Error(`"${prefijo}" coincide con ${cand.length} pestañas: ${cand.map((c) => c.title).join(', ')}`)
  throw new Error(`no encontré ninguna pestaña que empiece con "${prefijo}"`)
}
