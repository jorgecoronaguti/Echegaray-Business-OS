// EL PARÁMETRO EDITABLE DE "IMPUESTOS Y FINANCIEROS": CÓMO SE LEE SIN QUE EL DISFRAZ LO CAMBIE.
//
// ═══ EL DEFECTO MEDIDO EL 04/09/2026 ═══
//
// La celda "Alícuota general de IVA" tenía 0,21 adentro y la pestaña la dibujaba con formato de
// MONEDA sin decimales: en pantalla decía "$0". El generador leía esa celda con el render por
// defecto —el FORMATEADO— así que recibía la cadena "$0", la convertía a 0, y con eso:
//
//   1. la proyección de IVA se detenía con «alícuota no declarada o fuera de rango (0<a<1)»;
//   2. si no se hubiera detenido, habría VUELTO A ESCRIBIR ese 0 en la misma celda —el generador
//      siembra `alicuotaVigente ?? 0.21`— y el rango con nombre ALICUOTA_IVA habría publicado cero.
//      El cuadro entero de IVA proyectado da $0 con alícuota 0, sin una sola celda en error.
//
// O sea: un formato equivocado en UNA celda apagaba el impuesto más caro de la empresa, y el
// generador colaboraba escribiendo el número falso que acababa de leer mal. Un parámetro no puede
// depender de cómo está vestido: se lee UNFORMATTED_VALUE y se interpreta acá, una sola vez.
//
// ═══ POR QUÉ 0 NO ES "CERO POR CIENTO" SINO "NO DECLARADA" ═══
//
// No existe una alícuota general de IVA del 0%. Un 0 en esa celda sólo puede venir de un borrado, de
// un formato que la aplastó o de una corrida que escribió lo que leyó mal. Tratarlo como un valor
// legítimo es lo que convierte el defecto en permanente: se lee 0, se escribe 0, se vuelve a leer 0.

/**
 * EL RÓTULO, DEFINIDO UNA SOLA VEZ. El generador ESCRIBE esta fila y, en la corrida siguiente, la
 * BUSCA POR ESTE TEXTO para leer lo que el dueño dejó. Con el texto tipeado en los dos lados, una
 * mejora de redacción en uno rompe la lectura del otro en silencio: la búsqueda no encuentra nada,
 * la alícuota pasa a "no declarada" y la celda editada del dueño se pisa con la semilla.
 */
export const ROTULO_ALICUOTA = 'Alícuota general de IVA'

/** El valor por defecto. NO es una afirmación de vigencia: es la semilla de la celda que firma el dueño. */
export const ALICUOTA_POR_DEFECTO = 0.21

/**
 * NÚCLEO PURO: la alícuota que declara la celda, o `null` si la celda no declara ninguna.
 *
 * Acepta las tres formas en que un humano o la API pueden dejar el valor:
 *   · 0,21            → la fracción, que es como Sheets guarda un porcentaje
 *   · 21  ·  "21%"    → el porcentaje escrito como tal (Sheets lo guarda como 21 si no hay formato %)
 *   · "$0" · 0 · ""   → NO DECLARADA. Devuelve null para que el llamador siembre el valor por defecto.
 *
 * El corte entre las dos primeras formas es el 1: una alícuota de IVA nunca es ≥ 100% ni ≤ 0%, y
 * entre 1 y 100 sólo puede ser un porcentaje sin dividir. Es la única lectura que no inventa.
 *
 * @param {unknown} crudo el valor de la celda leído con UNFORMATTED_VALUE
 * @returns {number|null} la fracción declarada, o null
 */
export function alicuotaDeclarada(crudo) {
  const n = aFraccionNumero(crudo)
  if (n === null) return null
  if (n > 0 && n < 1) return n
  if (n > 1 && n <= 100) return n / 100
  // 0, negativo, exactamente 1 o más de 100: la celda no declara una alícuota de IVA.
  return null
}

/**
 * NÚCLEO PURO: qué alícuota usa la corrida — la del dueño si la declaró, la semilla si no.
 * Devuelve además POR QUÉ, para que el `--dry` lo diga en vez de que haya que deducirlo.
 */
export function resolverAlicuota(crudo) {
  const declarada = alicuotaDeclarada(crudo)
  if (declarada !== null) return { alicuota: declarada, sembrada: false, motivo: 'la declara la celda' }
  return {
    alicuota: ALICUOTA_POR_DEFECTO,
    sembrada: true,
    motivo: crudo === undefined || crudo === null || crudo === ''
      ? 'la celda está vacía: se siembra el valor por defecto'
      : `la celda dice ${JSON.stringify(crudo)}, que no es una alícuota de IVA: se siembra el valor por defecto`,
  }
}

/** Un número, venga como number o como texto con símbolos. Devuelve null si no hay número adentro. */
function aFraccionNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  // es-AR: el punto es separador de miles y la coma el decimal. "$1.234,56" → 1234.56
  const limpio = t.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!/\d/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}
