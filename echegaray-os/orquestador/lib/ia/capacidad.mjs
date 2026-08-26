// QUÉ CAPACIDAD PIDE CADA TRABAJO — no qué modelo lo hace.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// Hasta hoy cada camino que hablaba con un modelo elegía el suyo con una variable de entorno propia:
// `ORQ_COMPROBANTES_MODELO`, `ORQ_COMPROBANTES_MODELO_REVISION`, `ORQ_RUTEO_MODELO`,
// `ORQ_ASISTENTE_MODELO`, más los tres alias de `anthropic-api.mjs`. Siete lugares donde cambiar de
// modelo, y ninguno que dijera POR QUÉ ese modelo y no otro.
//
// Un caller no sabe —ni tiene que saber— qué modelo conviene. Sabe qué tan difícil es su trabajo.
// Eso es lo que declara acá, y la traducción a un modelo concreto es infraestructura que puede
// cambiar sin tocar una sola línea de quien pide.
//
//   SIMPLE   clasificar, extraer un campo, transformar, resumir corto. Error barato de detectar.
//   NORMAL   la conversación del asistente y el ruteo: entender qué pide una persona.
//   COMPLEX  el Director, el CFO, Ingeniería. Razonamiento con consecuencia económica.
//
// ═══ Y POR QUÉ LA LECTURA DE UN COMPROBANTE ES COMPLEX ═══
//
// Parece extracción —sacar seis campos de una foto— y arrancó en `haiku`. El dueño lo subió a mano a
// `claude-opus-5` (está en `anthropic.env`) y tenía razón: leer mal el neto de una factura no es un
// error de formato, es plata mal imputada en el Cash Flow, y el papel llega torcido, con sol y
// escrito a mano. La dificultad no la da el tamaño de la salida sino lo que cuesta equivocarse.

/** Los tres niveles. Es un enum, no una escala: no se interpolan. */
export const CAPACIDAD = Object.freeze({
  SIMPLE: 'simple',
  NORMAL: 'normal',
  COMPLEX: 'complex',
})

/**
 * Alias por capacidad. Son ALIAS —'haiku'/'sonnet'/'opus'—, no IDs: el ID concreto lo resuelve el
 * proveedor, que es el único que sabe cómo se llama hoy su modelo. Cambiar de proveedor cambia esa
 * tabla, no ésta.
 */
const ALIAS = Object.freeze({
  [CAPACIDAD.SIMPLE]: 'haiku',
  [CAPACIDAD.NORMAL]: 'haiku',
  [CAPACIDAD.COMPLEX]: 'opus',
})

/** El nivel que declara un caller, validado. Lo que no se reconoce cae en NORMAL, nunca en COMPLEX:
 *  un typo no puede escalar solo al modelo más caro. */
export function normalizarCapacidad(v) {
  const s = String(v ?? '').trim().toLowerCase()
  return Object.values(CAPACIDAD).includes(s) ? s : CAPACIDAD.NORMAL
}

/**
 * El alias de modelo para una capacidad.
 *
 * `override` es la escotilla para las variables de entorno que YA existen y que el dueño usa para
 * mover un camino puntual sin tocar código (`ORQ_COMPROBANTES_MODELO=claude-opus-5`). Si viene, gana
 * — pero pasa por acá, así que queda registrado en el costo junto al resto.
 */
export function modeloPara(capacidad, override = null) {
  const o = String(override ?? '').trim()
  if (o) return o
  return ALIAS[normalizarCapacidad(capacidad)]
}
