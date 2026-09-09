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

// EL NOMBRE DEL RANGO NO SE TIPEA ACÁ: lo publica el módulo que escribe las fórmulas que lo leen.
import { RANGO_ALICUOTA_IVA } from './iva-libre-disponibilidad.mjs'

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
 * EL PARÁMETRO, TAL COMO LO ESPERA `asegurarParametros` — que es quien lo crea en «Parámetros» y
 * apunta ahí el rango con nombre.
 *
 * ═══ POR QUÉ SE MUDÓ (09/09/2026) ═══
 *
 * Vivía en la fila B53 de «Impuestos y Financieros», adentro de un bloque llamado «Supuestos y
 * huecos» que el dueño mandó eliminar entero. Pero además estaba mal ubicado desde antes: una
 * alícuota que él FIRMA no es un renglón del cuadro que la consume, es una ENTRADA — la misma
 * categoría que `F931_DIA_DE_PAGO`, las dos alícuotas del FCL o los días de vacaciones, que ya viven
 * en «Parámetros» con su rango con nombre. Un parámetro escondido al pie de la pestaña que lo usa es
 * un parámetro que nadie encuentra para cambiar.
 *
 * `asegurarParametros` NO PISA UN VALOR EXISTENTE: cuando el rótulo ya está en «Parámetros», deja lo
 * que el dueño escribió y sólo reapunta el nombre. Por eso el valor que se pasa acá es el que hoy
 * declara la celda vieja: la migración conserva su firma en vez de resembrar el 21%.
 *
 * @param {number} valor la alícuota vigente resuelta (fracción)
 */
export const parametroAlicuota = (valor = ALICUOTA_POR_DEFECTO) => ({
  rango: RANGO_ALICUOTA_IVA,
  rotulo: ROTULO_ALICUOTA,
  valor,
  nota: 'PARÁMETRO EDITABLE · lo lee la proyección de IVA de «Impuestos y Financieros» por el rango '
    + `con nombre ${RANGO_ALICUOTA_IVA}. El OS NO afirma que esta alícuota esté vigente: la lee de acá. `
    + 'Si cambia la norma, se cambia esta celda y el cuadro se recalcula solo. Confirmala con el '
    + 'estudio contable. Un 0 no es «cero por ciento»: es «no declarada», y la corrida siembra el 21%.',
})

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA MUDANZA A «Parámetros», DE PUNTA A PUNTA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const TAB_PARAMETROS = 'Parámetros'
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/** La fila (0-based) del parámetro en la grilla de «Parámetros», o -1. */
const filaDelParametro = (filas = []) => filas.findIndex((f) => norm(f?.[0]) === norm(ROTULO_ALICUOTA))

/** Lee «Parámetros» entero, una vez. Sin FORMATO: un 0,21 vestido de moneda se lee "$0". */
const leerParametros = (google, fileId) =>
  google.readSheetValues(fileId, `'${TAB_PARAMETROS}'!A1:C400`, { render: 'UNFORMATTED_VALUE' }).catch(() => [])

/**
 * QUÉ ALÍCUOTA USA LA CORRIDA — la de «Parámetros», y si todavía no está ahí, la de la celda vieja.
 *
 * EL FALLBACK NO ES OPCIONAL Y CADUCA SOLO. La celda se mudó el 09/09/2026: mientras el archivo vivo
 * todavía tenga el valor en la fila retirada de «Impuestos y Financieros», leer sólo «Parámetros»
 * devolvería null y la corrida resembraría el 21% — borrando en silencio la alícuota que el dueño
 * firmó. En cuanto la fila existe en «Parámetros», gana esa y el fallback deja de mirarse.
 *
 * @param {object} google
 * @param {string} fileId
 * @param {unknown} crudoDeLaPestana el valor de la fila vieja, si la pestaña todavía la tiene
 * @returns {Promise<{alicuota:number, sembrada:boolean, motivo:string, donde:string}>}
 */
export async function alicuotaVigente(google, fileId, crudoDeLaPestana = null) {
  const filas = await leerParametros(google, fileId)
  const i = filaDelParametro(filas)
  const crudo = i >= 0 ? filas[i]?.[1] : crudoDeLaPestana
  return {
    ...resolverAlicuota(crudo),
    donde: i >= 0 ? `${TAB_PARAMETROS}!B${i + 1}` : 'la fila vieja de la pestaña (todavía sin migrar)',
  }
}

/**
 * DEJA EL PARÁMETRO PUBLICADO EN «Parámetros» Y VERIFICA EL EFECTO.
 *
 * Corre ANTES de escribir la pestaña: `ALICUOTA_IVA` apunta hoy a una fila que el rediseño elimina, y
 * entre escribir la grilla nueva y reapuntar el nombre el rango señalaría lo que quedó en esa fila
 * —otra cosa, o nada— dejando todo el IVA proyectado en $0 sin un solo error.
 *
 * SE RELEE LA CELDA DE DESTINO. Que `asegurarParametros` no haya tirado excepción no prueba nada: la
 * escritura puede haberse salteado por candado o por edición de una persona, y un nombre apuntando a
 * una celda vacía devuelve 0, que es una alícuota válida para Sheets y falsa para el negocio.
 *
 * @returns {Promise<{ok:boolean, motivo:string, alicuota:number|null, celda:string}>}
 */
export async function publicarAlicuotaEnParametros(google, fileId, hojas, asegurar, valor) {
  await asegurar(google, hojas, [parametroAlicuota(valor)])
  const filas = await leerParametros(google, fileId)
  const i = filaDelParametro(filas)
  const leida = i >= 0 ? alicuotaDeclarada(filas[i]?.[1]) : null
  const celda = i >= 0 ? `${TAB_PARAMETROS}!B${i + 1}` : `${TAB_PARAMETROS} (la fila no existe)`
  if (leida === null) {
    return {
      ok: false,
      alicuota: null,
      celda,
      motivo: `${celda} no publica una alícuota de IVA válida`
        + `${i >= 0 ? `: dice ${JSON.stringify(filas[i]?.[1])}` : ''}. Con ALICUOTA_IVA apuntando ahí, `
        + 'todo el IVA proyectado saldría $0 sin dar un error.',
    }
  }
  return { ok: true, alicuota: leida, celda, motivo: `${celda} = ${(leida * 100).toFixed(2)}%` }
}
