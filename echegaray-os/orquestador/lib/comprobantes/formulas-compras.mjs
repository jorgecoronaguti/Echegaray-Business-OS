// LA FÓRMULA DE CADA COLUMNA, REPLICADA EN JS — PARA PODER DECIDIR SIN ESCRIBIR.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// `contrato-columnas.mjs` dice CUÁLES columnas son fórmula por fila. Este archivo dice QUÉ DEVUELVE
// esa fórmula, y existe por una razón muy concreta: para restaurar una fórmula sobre una celda que
// hoy tiene un número pegado hay que saber antes si restaurarla **cambia el número**. Si no lo
// cambia, la restauración es mecánica y no toca ningún dato. Si lo cambia, lo que hay pegado ahí es
// una decisión de una persona y borrarla es borrar trabajo del dueño.
//
// ═══ LA CORRECCIÓN DEL 30/09/2026: POR CLAVE, NUNCA POR LETRA ═══
//
// La primera versión (25/08) llaveaba los evaluadores por LETRA (`Q`, `R`, `U`) con las letras que
// tenía la pestaña ese día. El 14/09 el dueño insertó «Obra» en L y todas las de la derecha se
// corrieron una: el control siguió comparando contra `Q` (que hoy es «Tipo pago», texto que pone la
// persona) y contra `U` (que hoy es «Monto Pagado») creyendo que eran Fecha prevista y Monto
// Parcial 1. Salía «Q67: hoy "Efectivo" · la fórmula daría 46.055» — un dato humano tomado por daño —
// y, peor, `--reparar` habría pegado fórmulas en la columna equivocada. Además el rango se cortaba
// en la fila 1000 y la pestaña ya pasa de la 1037.
//
// Ahora cada evaluador se llama por la `clave` del contrato, la fórmula se declara con
// `[clave]` en lugar de letras y se RENDERIZA con las letras VIVAS (`contratoContra(encabezado)`
// sobre la fila 3 real). Una sola fuente: si el dueño inserta otra columna, este archivo no se entera
// porque no la nombra.
//
// Medido el 25/08/2026 (con las letras de entonces): la fórmula de Monto Parcial 1 tenía un número
// pegado en 312 filas; en 178 ya era el saldo (restaurar no mueve nada) y en 134 difería. Fecha
// prevista de pago tiene un número pegado desde la fila 4: es el vencimiento real del echeq, que ni
// la fórmula ni el cargador pueden saber. **Ese pegado es el estado normal de la pestaña, no un daño.**
//
// ═══ EL CONTROL NO SE VALIDA CONTRA SÍ MISMO ═══
//
// Cada evaluador declara el TEXTO de la fórmula que replica. Antes de reparar nada, el script lee la
// fórmula viva de una fila modelo del Sheet y la compara contra ese texto (ya con las letras vivas).
// Si el dueño cambió la fórmula, la réplica quedó vieja y el script aborta en vez de "reparar" hacia
// una definición que ya no rige.

import { indiceDe } from './contrato-columnas.mjs'

/** Normaliza una fórmula para compararla: sin la fila concreta, sin espacios, en mayúsculas. */
export function esqueletoDeFormula(formula) {
  return String(formula ?? '')
    .replace(/(\$?[A-Z]{1,2})\$?\d+/g, '$1') // A900 → A · $C$12 → $C
    .replace(/\s+/g, '')
    .toUpperCase()
}

/** Lee una celda de la fila como número; lo que no es número vale 0, igual que `N()` en el Sheet. */
function n(fila, clave) {
  const v = fila[clave]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Cómo se recalcula cada columna de fórmula por fila que este archivo sabe replicar, por CLAVE.
 *
 * `formula` es el texto medido en el Sheet, con `[clave]` donde va una columna; `formulaVigente`
 * lo resuelve contra el contrato vivo. `evaluar` recibe la fila como objeto por clave
 * `{modalidad: 'Pago', fecha: 46293, neto: …}` con valores SIN formatear (`UNFORMATTED_VALUE`).
 *
 * Una clave sin entrada acá NO se puede reparar automáticamente (las ARRAYFORMULA y las órdenes de
 * pago dependen de otras columnas derramadas). Reparar a ciegas ahí es peor que no reparar.
 */
export const EVALUADORES = Object.freeze({
  prevDia: Object.freeze({
    formula: '=IF([modalidad]="pago";[fecha];"Pendiente")',
    evaluar: (fila) => (String(fila.modalidad ?? '').toLowerCase() === 'pago' ? (fila.fecha ?? '') : 'Pendiente'),
  }),
  prevMes: Object.freeze({
    formula: '=[prevDia]',
    evaluar: (fila) => fila.prevDia ?? '',
  }),
  total: Object.freeze({
    formula: '=[iva]+[neto]',
    evaluar: (fila) => n(fila, 'iva') + n(fila, 'neto'),
  }),
  pagado: Object.freeze({
    formula: '=IF([modalidad]="pago";[total];0)',
    evaluar: (fila) => (String(fila.modalidad ?? '').toLowerCase() === 'pago' ? n(fila, 'total') : 0),
  }),
  parcial1: Object.freeze({
    formula: '=[pagado]-[total]',
    evaluar: (fila) => n(fila, 'pagado') - n(fila, 'total'),
  }),
  estado: Object.freeze({
    formula: '=IF($[proveedor]="";"";IF(ABS(N($[pagado])+N($[parcial2])-N($[total]))<1;"Pagado";IF(N($[pagado])+N($[parcial2])<N($[total]);"Pendiente";"Revisar")))',
    evaluar: (fila) => {
      if (String(fila.proveedor ?? '').trim() === '') return ''
      const cubierto = n(fila, 'pagado') + n(fila, 'parcial2')
      if (Math.abs(cubierto - n(fila, 'total')) < 1) return 'Pagado'
      return cubierto < n(fila, 'total') ? 'Pendiente' : 'Revisar'
    },
  }),
})

/**
 * El texto de la fórmula con las letras VIVAS. `contrato` sale de `contratoContra(encabezado)`.
 * Si una clave del texto no está en la pestaña, lanza: no se compara contra letras inventadas.
 */
export function formulaVigente(clave, contrato) {
  const ev = EVALUADORES[clave]
  if (!ev) return null
  return ev.formula.replace(/\[(\w+)\]/g, (_, k) => {
    const col = contrato.find((c) => c.clave === k)
    if (!col) throw new Error(`la fórmula de «${clave}» nombra «${k}», que no está en el contrato de Compras`)
    return col.letra
  })
}

/**
 * La fila cruda de la API (`fila[indice]`) como objeto por CLAVE del contrato vivo, que es lo que
 * leen los evaluadores. Sólo las columnas declaradas; el resto no se toca.
 */
export function filaPorClave(filaCruda, contrato) {
  const o = {}
  for (const c of contrato) if (c.clave) o[c.clave] = filaCruda[indiceDe(c.letra)]
  return o
}

/** Dos valores del Sheet son el mismo dato. Los números toleran el medio centavo del redondeo. */
export function mismoValor(a, b) {
  const na = typeof a === 'number', nb = typeof b === 'number'
  if (na && nb) return Math.abs(a - b) < 0.005
  if (na !== nb) return false
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

export const VEREDICTO = Object.freeze({
  /** La celda ya tiene su fórmula. No hay nada que hacer. */
  YA_ES_FORMULA: 'ya_es_formula',
  /** Tiene un valor pegado, pero es EXACTAMENTE el que la fórmula devuelve: restaurar no mueve nada. */
  NO_OP: 'no_op',
  /** Tiene un valor pegado que la fórmula no reproduce: es un dato que puso una persona. */
  DATO_HUMANO: 'dato_humano',
  /** No hay evaluador para esta columna: no se puede decidir sin escribir, así que no se decide. */
  SIN_EVALUADOR: 'sin_evaluador',
  /** La celda está vacía. */
  VACIA: 'vacia',
})

/**
 * Qué hacer con UNA celda. Es una función pura sobre la fila ya leída — de ahí que se pueda testear
 * sin red y sin Sheet, que es justamente lo que un control sobre una fuente de verdad necesita.
 *
 * @param clave clave del contrato (`pagado`, `prevDia`…), no la letra
 * @param formulaCruda lo que devuelve la API con `valueRenderOption=FORMULA` (`'=U900-P900'` o `0`)
 * @param fila valores SIN formatear de la fila, por clave, como `{fecha: 46264, modalidad: 'pago', total: 304515.98, …}`
 */
export function veredictoDeCelda(clave, formulaCruda, fila) {
  const cruda = String(formulaCruda ?? '').trim()
  if (cruda.startsWith('=')) return { veredicto: VEREDICTO.YA_ES_FORMULA }
  if (cruda === '') return { veredicto: VEREDICTO.VACIA }

  const ev = EVALUADORES[clave]
  if (!ev) return { veredicto: VEREDICTO.SIN_EVALUADOR, actual: fila[clave] }

  const esperado = ev.evaluar(fila)
  const actual = fila[clave]
  return {
    veredicto: mismoValor(actual, esperado) ? VEREDICTO.NO_OP : VEREDICTO.DATO_HUMANO,
    actual,
    esperado,
  }
}
