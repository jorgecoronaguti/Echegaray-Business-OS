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

/**
 * Los nombres canónicos de las pestañas que el OS mantiene. Viven acá porque el mismo nombre lo
 * necesitan el script que la escribe, el cuadro que la referencia como detalle y el auditor que
 * verifica que alguien la rehaga. Estaba escrito en cinco archivos: renombrar la pestaña arreglaba
 * unos y rompía otros en silencio.
 */
export const NOMBRES = {
  proveedoresMateriales: 'Proveedores y Materiales',

  // ── LA PARTICIÓN DEL 21/07 ──────────────────────────────────────────────────────────────────
  // "Proveedores y Materiales" eran OCHO TABLAS sobre las mismas columnas: la E era "Modalidad" en
  // la primera, "Facturado según AFIP" en la segunda e "Importe" en la sexta. Ningún ancho podía
  // servirles a las tres, así que se veía cortada sin importar cómo se la formateara. El dueño:
  // "TODA LA PESTAÑA ES UNA MIERDA" — y la decisión fue partirla, respetando las reglas de oro.
  // Cada una tiene UNA tabla por tema y sus propias columnas. No se perdió ni una fila.
  // Y el 21/07, un rato después: "unificar todas las pestañas de proveedores". Tres pestañas para
  // el mismo interlocutor obligaban a saltar entre ellas para contestar una sola pregunta ("¿cuánto
  // le debo a Alumetal y qué me facturó?"). Quedan DOS: todo lo de proveedores junto, y materiales
  // aparte —que es otra pregunta: no con quién, sino en qué—. Lo que hace que una sola grilla les
  // sirva a las seis tablas es que todas arrancan por el proveedor.
  proveedores: 'Proveedores',
  materiales: 'Materiales',
}

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
