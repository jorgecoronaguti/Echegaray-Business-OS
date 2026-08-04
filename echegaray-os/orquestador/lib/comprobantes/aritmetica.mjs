// LA ARITMÉTICA DEL COMPROBANTE ES UN CONTROL, NO UN ADORNO. NÚCLEO PURO.
//
// ═══ LOS $201 MILLONES (04/08) ═══
//
// El bot cargó una factura de ALUMETAL por **$201.494.007** cuando el papel decía **$2.014.940,07**.
// Un error de coma: exactamente ×100. Entró al Flujo de Caja y hubo que sacarla a mano. En el mismo
// fajo, VILLA DEL PINO entró por $10.500.067 cuando decía $105.000,67 —otra vez ×100— y una nota de
// crédito de HORMISERV entró por $686,07 cuando decía $686.070,00 —÷1000 y con el signo cambiado—.
//
// Los tres papeles tenían la respuesta impresa: **neto gravado + IVA + otros tributos = total**. Es
// una identidad, no una estimación, y se cumple en los siete comprobantes de ese día (verificado a
// mano, uno por uno). Un error de escala la rompe casi siempre, porque rompe UN sumando y no los
// otros:
//
//   ALUMETAL:      1.624.951,67 + 341.239,85 + 48.748,55 = 2.014.940,07  ≠ 201.494.007,00
//   VILLA DEL PINO:   73.458,37 +  15.426,26 + 16.116,04 =   105.000,67  ≠  10.500.067,00
//   HORMISERV (NC):  567.000,00 + 119.070,00             =   686.070,00  ≠        686,07
//
// El control ya existía —`necesitaRevision` en `vision.mjs` lo miraba— pero su única reacción era
// pedir una segunda lectura. Si la segunda lectura tampoco cerraba, se cargaba igual. Un control cuya
// consecuencia es "insistir" no es un control: es un comentario.
//
// ═══ POR QUÉ ESTO VIVE EN SU PROPIO ARCHIVO ═══
//
// Porque lo tienen que usar las DOS caras y en DOS momentos distintos: `vision.mjs` sobre la lectura
// cruda —para decidir si pide el modelo grande— y `faltantes.mjs` sobre el comprobante ya
// normalizado —para decidir si se escribe—. Si cada una tuviera su fórmula, la que decide y la que
// avisa dirían cosas distintas sobre el mismo papel, que es cómo empieza todo control que no
// controla.
//
// CERO MODELO, CERO RED, CERO RELOJ.

/** Diferencia tolerada. $0,50 es el redondeo del propio comprobante, no un error de lectura. */
export const TOLERANCIA = 0.5

/**
 * ¿Los importes leídos cierran entre sí?
 *
 * Todos los sumandos van CON SU SIGNO: una nota de crédito llega con los tres en negativo y la
 * identidad se cumple igual. Si falta el neto o el total, la respuesta es `verificable:false` — no
 * "cierra" ni "no cierra". Un tique que no imprime subtotal no puede quedar bloqueado por un control
 * que no tiene con qué opinar; y tratar "no sé" como "está bien" es cómo pasó el que sí se podía
 * verificar.
 *
 * @param {{neto?:number|null, iva?:number|null, otros?:number|null, total?:number|null}} c
 * @returns {{verificable:boolean, suma:number|null, total:number|null, diferencia:number|null, cierra:boolean|null}}
 */
export function identidadDelComprobante({ neto, iva, otros, total } = {}) {
  const n = numero(neto)
  const t = numero(total)
  if (n == null || t == null) return { verificable: false, suma: null, total: t, diferencia: null, cierra: null }
  const suma = red2(n + (numero(iva) ?? 0) + (numero(otros) ?? 0))
  const diferencia = red2(suma - t)
  return { verificable: true, suma, total: t, diferencia, cierra: Math.abs(diferencia) <= TOLERANCIA }
}

// ── ORDEN DE MAGNITUD CONTRA LA HISTORIA DEL PROVEEDOR ───────────────────────
//
// La identidad aritmética necesita que el papel traiga el subtotal. Cuando no lo trae —o cuando el
// modelo lee mal DOS números de forma coherente— no hay identidad que romper, y ahí entra el segundo
// control: **este proveedor nunca nos facturó nada ni remotamente parecido**.
//
// EL CRITERIO, Y POR QUÉ ES ÉSTE:
//
//   · Se compara contra el **máximo histórico** de ESE proveedor, no contra el promedio ni contra la
//     mediana. El máximo es la vara más conservadora que existe: sólo suena cuando el comprobante es
//     más grande que todo lo que ese proveedor facturó alguna vez.
//   · El umbral es **×5**. Un error de escala de OCR nunca es ×2 ni ×3: es ×10, ×100 o ×1000, porque
//     lo que se pierde o se agrega es una coma o un cero. El 5 queda cómodo por debajo del error más
//     chico posible y cómodo por encima de la variación real de una compra grande —incluso con la
//     inflación argentina, una factura CINCO VECES más grande que la mayor que ese proveedor emitió
//     nunca es un evento, no una rutina—. Medido contra los dos casos reales: ALUMETAL fue ×12,1
//     sobre su máximo de $16,6M y VILLA DEL PINO ×92 sobre su máximo de $114k. Los dos caían.
//   · Hacen falta **5 comprobantes previos** con total legible. Es el mismo umbral con el que
//     `imputacion-aprendida.mjs` decide que un proveedor tiene historia suficiente para hablar firme,
//     y no es casualidad: es la misma pregunta. Con menos, este control NO OPINA — un proveedor nuevo
//     no puede quedar bloqueado por no tener pasado, y una alarma que suena en la primera compra de
//     cada proveedor deja de leerse en una semana.
//   · **Sólo mira para arriba.** Un ÷1000 (el caso HORMISERV) deja un total ridículamente CHICO, y
//     por abajo no hay umbral posible: comprarle $500 de tornillos a un proveedor cuyo máximo son
//     $10M es completamente normal. Ese caso lo caza la identidad aritmética, que es la que
//     corresponde.
//
// NO DECIDE: marca sospecha. Lo que se hace con ella —preguntar en vez de escribir— lo decide
// `faltantes.mjs`, que es donde vive esa política.

/** Cuántos comprobantes previos del proveedor hacen falta para que este control opine. */
export const MIN_HISTORIA_ESCALA = 5

/** Cuántas veces el máximo histórico convierte a un total en sospechoso. */
export const FACTOR_FUERA_DE_ESCALA = 5

/**
 * La escala histórica de un proveedor: cuántos comprobantes suyos se conocen y cuál fue el mayor.
 * Se trabaja en valor ABSOLUTO: una nota de crédito de $686.070 dice tanto sobre el tamaño de lo que
 * factura ese proveedor como una factura de $686.070.
 *
 * @param {Array<number|null>} totales
 * @returns {{n:number, max:number}}
 */
export function escalaDeTotales(totales = []) {
  let n = 0
  let max = 0
  for (const v of totales) {
    const t = numero(v)
    if (t == null || t === 0) continue
    n++
    if (Math.abs(t) > max) max = Math.abs(t)
  }
  return { n, max }
}

/**
 * ¿Este total está fuera de la escala de lo que este proveedor factura?
 *
 * @param {number|null} total
 * @param {{n?:number, max?:number}} escala  la de `escalaDeTotales`
 * @returns {{opina:boolean, sospechoso:boolean, factor:number|null, n:number, max:number}}
 */
export function fueraDeEscala(total, escala = {}) {
  const t = numero(total)
  const n = Number(escala?.n ?? 0)
  const max = Number(escala?.max ?? 0)
  const nada = { opina: false, sospechoso: false, factor: null, n, max }
  if (t == null || !Number.isFinite(max) || max <= 0) return nada
  if (n < MIN_HISTORIA_ESCALA) return nada
  const factor = Math.abs(t) / max
  return { opina: true, sospechoso: factor > FACTOR_FUERA_DE_ESCALA, factor: red2(factor), n, max }
}

/** Importe en castellano, para poder decir los números concretos en el mensaje. */
export function pesos(n) {
  const v = numero(n)
  if (v == null) return '?'
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const red2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
