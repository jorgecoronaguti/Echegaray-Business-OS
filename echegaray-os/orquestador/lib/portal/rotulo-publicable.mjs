// EL PORTAL NO PUBLICA TEXTO INTERNO — la regla, una sola vez, para el sync y para la pantalla.
//
// ═══ EL DEFECTO (10/09/2026) ═══
//
// El portal de ARCOR mostraba, como concepto de un cobro de $9.491.440 del 03/02, la palabra
// «RECLAMAR OC!». No es un error de dato: es una nota que administración se escribió a sí misma en la
// columna I (Concepto) de Cobranzas, y el portal la copió tal cual a la cara del cliente. Al cliente
// se le está diciendo que hay que reclamarle a él una orden de compra.
//
// ═══ POR QUÉ ACÁ Y NO EN LA PANTALLA ═══
//
// Los dos consumidores son el portal (TypeScript) y el informe del sync (`.mjs`), que es el que le
// dice al dueño qué filas mover a la columna W (Notas). Si la regla viviera en la pantalla, el
// informe tendría que reimplementarla y podrían discrepar: el dueño limpiaría filas que el portal
// no estaba tapando, y el portal taparía filas que el informe no nombró.
//
// ═══ QUÉ SE DETECTA Y QUÉ NO, Y POR QUÉ ═══
//
// Se detecta lo que sólo puede ser una instrucción para adentro:
//
//   1. TERMINA EN «!». Un concepto de cobro no lleva signo de admiración: «RECLAMAR OC!»,
//      «FALTA LA FACTURA!».
//   2. LLEVA UN VERBO IMPERATIVO EN MAYÚSCULAS: RECLAMAR, REVISAR, OJO, PEDIR, FALTA… Se exige que
//      esté EN MAYÚSCULAS en el texto original: «se pidió el pago» es una descripción, «PEDIR» es una
//      orden. Y se exige palabra entera, para que «FALTANTE DE MATERIALES» —que describe un trabajo—
//      no se confunda con «FALTA».
//   3. NO TIENE NI UNA LETRA. Un concepto que es sólo signos no le dice nada a nadie.
//
// SE DESCARTA, POR ESCRITO, el tercer criterio del pedido original —«o no nombra obra/OC/factura»—.
// Aplicado a los datos reales tapaba conceptos legítimos: «BACHEO», «Compactacion de Terrenos» y
// «Rep de pisos - "canalizacion"» describen EXACTAMENTE el trabajo que se cobra y no nombran ni obra
// ni OC ni factura. Reemplazarlos por «Pago · ARCOR · 01/04/2026» le sacaría al cliente el único
// dato que le dice qué le hicimos. Un filtro que tapa lo bueno para atrapar lo malo publica menos
// verdad, no más.

/** Los verbos y avisos que sólo se le escriben a alguien de la empresa. Palabra entera y en MAYÚSCULAS. */
export const IMPERATIVOS_INTERNOS = [
  'RECLAMAR', 'RECLAMO', 'REVISAR', 'OJO', 'PEDIR', 'FALTA', 'FALTAN', 'AVISAR', 'CHEQUEAR',
  'CONTROLAR', 'CONSULTAR', 'PREGUNTAR', 'CORREGIR', 'VERIFICAR', 'URGENTE', 'PENDIENTE DE CARGA',
]

/** Sin tildes y en mayúsculas, para que «REVISÁ» y «REVISAR» se comparen igual. */
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * ¿ESTE CONCEPTO ES UNA NOTA INTERNA? Ver arriba los tres criterios y el que se descartó.
 *
 * Falla ABIERTA a propósito: ante la duda el concepto se publica. Tapar un concepto real deja al
 * cliente sin saber qué pagó; publicar una nota interna es feo y se corrige moviéndola a la columna
 * W. El primero es un dato que se pierde, el segundo un texto que se limpia.
 */
export function esNotaInterna(concepto) {
  const texto = sinTildes(concepto).trim()
  if (!texto) return true
  if (!/[A-Za-z]/.test(texto)) return true
  if (texto.endsWith('!')) return true
  return IMPERATIVOS_INTERNOS.some((v) => new RegExp(`(^|[^A-Z])${v}([^A-Z]|$)`).test(texto))
}

/** `2026-02-03` → `03/02/2026`. Cualquier otra cosa devuelve `null`: no se inventa una fecha. */
function diaMesAno(fecha) {
  const s = String(fecha ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : null
}

/**
 * EL RÓTULO QUE VE EL CLIENTE.
 *
 * Cuando el concepto sirve, es el concepto: nadie describe mejor el trabajo que quien lo escribió.
 * Cuando es una nota interna se arma uno DERIVADO de datos que ya son del cliente —su factura, su
 * obra, la fecha del cobro—, nunca inventado. Sin ninguno de los tres queda «Pago», que es lo único
 * que se puede afirmar.
 *
 * @param {{concepto?: string|null, obraNombre?: string|null, fecha?: string|null, facturaNumero?: string|null}} p
 */
export function rotuloPublicable(p) {
  const concepto = String(p?.concepto ?? '').trim()
  if (!esNotaInterna(concepto)) return concepto
  const factura = String(p?.facturaNumero ?? '').trim()
  if (factura) return `Factura ${factura}`
  const partes = ['Pago']
  const obra = String(p?.obraNombre ?? '').trim()
  if (obra) partes.push(obra)
  const fecha = diaMesAno(p?.fecha)
  if (fecha) partes.push(fecha)
  return partes.join(' · ')
}

/**
 * LAS FILAS PUBLICADAS CUYO CONCEPTO ES UNA NOTA INTERNA — para que el dueño las mueva a Notas (W).
 *
 * El portal ya no las muestra, y por eso hace falta este informe: un defecto tapado en pantalla y no
 * dicho en ningún lado es un defecto que nadie arregla nunca. Cada línea trae la CELDA exacta
 * (`Cobranzas!I<fila>`), que es lo único que hace falta para corregirlo.
 *
 * @param filas `[{ cliente, concepto, cobranza_fila, visible_portal, publicado_at }]`
 */
export function conceptosInternosPublicados(filas = []) {
  return filas
    .filter((f) => f?.visible_portal === true && f?.publicado_at != null && esNotaInterna(f?.concepto))
    .map((f) => ({
      cliente: f?.cliente ?? null,
      concepto: String(f?.concepto ?? ''),
      cobranza_fila: f?.cobranza_fila ?? null,
      celda: f?.cobranza_fila == null ? null : `Cobranzas!I${f.cobranza_fila}`,
      mover_a: f?.cobranza_fila == null ? null : `Cobranzas!W${f.cobranza_fila}`,
    }))
}
