// EL EXCEL CONTRA LO MIGRADO — Y CADA DIFERENCIA EXPLICADA. NÚCLEO PURO: SIN FS NI BASE.
//
// ═══ POR QUÉ NO SE EXIGE IGUALDAD ═══
//
// La tentación al migrar es hacer que los números den iguales. En este libro eso sería un error:
// `Presupuesto!H37` vale 1.775.728 porque multiplica dólares por 1450 y llama a ese 1450
// «coeficiente de ajuste». El sistema nuevo llega al mismo número por otro camino —convierte USD a
// ARS con una cotización fechada— y a otros números NO llega a propósito, porque se niega a
// aplicar un multiplicador que nadie puede explicar.
//
// Entonces el criterio de cierre no es «coinciden»: es **cada diferencia tiene nombre**.
//
//   MATCH               los dos llegan al mismo número por el mismo camino
//   CORRECCION_DE_ERROR el Excel estaba roto y lo migrado no lo repite
//   CAMBIO_DE_MODELO    los dos son defendibles y el modelo nuevo eligió otro
//   PENDIENTE           falta un dato para poder comparar
//   CONFLICTO           difieren y ninguna de las dos explicaciones alcanza  ← lo único que frena
//
// `CONFLICTO` es el único estado que no se puede cerrar solo. Los otros cuatro se cierran con su
// motivo escrito, y un cotejo sin motivo escrito no es un cotejo: es un número al lado de otro.

/** Cómo se explica una diferencia. `CONFLICTO` es el único que bloquea. */
export const COTEJO = Object.freeze({
  MATCH: 'MATCH',
  CORRECCION_DE_ERROR: 'CORRECCION_DE_ERROR',
  CAMBIO_DE_MODELO: 'CAMBIO_DE_MODELO',
  PENDIENTE: 'PENDIENTE',
  CONFLICTO: 'CONFLICTO',
})

/** Un centavo de diferencia es el redondeo de Excel, no un hallazgo. */
export const TOLERANCIA = 0.01

/**
 * LA TOLERANCIA RELATIVA, Y POR QUÉ HACE FALTA.
 *
 * `Análisis!F` redondea a dos decimales el `costo × (1 + desperdicio)` de CADA línea antes de
 * multiplicarlo por la cantidad. Una composición de seis líneas acumula así hasta unos centavos de
 * deriva contra la misma cuenta hecha con precisión completa: T1126.1 da 38,27 en el libro y
 * 38,2556 acá. Comparar eso con una tolerancia de un centavo clasificaría el redondeo de Excel
 * como un cambio de modelo, que es ruido con nombre de hallazgo. Un milésimo separa el redondeo
 * de una diferencia que importa, y sigue siendo mil veces más chico que cualquiera de los cambios
 * reales de este libro —el más chico duplica una partida—.
 */
export const TOLERANCIA_RELATIVA = 0.001

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/**
 * COTEJAR UN VALOR. PURA.
 *
 * `explicacion` no es opcional cuando los números difieren: sin ella, una diferencia explicada y
 * una diferencia no vista se ven igual, y ése es exactamente el modo de falla que este archivo
 * viene a cerrar. Sin explicación, difieren ⇒ `CONFLICTO`.
 *
 * @param {object} p
 * @param {number|null} p.excel      lo que dice el libro
 * @param {number|null} p.xsas       lo que dice el sistema
 * @param {string|null} [p.explicacion]  por qué difieren, si difieren
 * @param {string} [p.clase]         la clase que reclama quien explica (se valida contra el hecho)
 * @param {number} [p.tolerancia]           absoluta, en pesos
 * @param {number} [p.toleranciaRelativa]   fracción del valor del Excel; manda la más ancha
 */
export function cotejar({ excel, xsas, explicacion = null, clase = null, tolerancia = TOLERANCIA, toleranciaRelativa = TOLERANCIA_RELATIVA, que = null } = {}) {
  const e = num(excel)
  const x = num(xsas)
  const base = { que, excel: e, xsas: x, diferencia: e !== null && x !== null ? Number((x - e).toFixed(6)) : null }

  if (e === null || x === null) {
    return { ...base, cotejo: COTEJO.PENDIENTE, porque: explicacion ?? (e === null ? 'el Excel no da un número' : 'lo migrado todavía no da un número') }
  }
  const margen = Math.max(tolerancia, Math.abs(e) * toleranciaRelativa)
  if (Math.abs(x - e) <= margen) {
    return { ...base, cotejo: COTEJO.MATCH, porque: explicacion ?? `los dos llegan al mismo número (margen ${margen})` }
  }
  if (!explicacion) {
    return { ...base, cotejo: COTEJO.CONFLICTO, porque: 'difieren y nadie explicó por qué' }
  }
  // La clase la reclama quien explica, pero sólo se acepta si es una de las que puede cerrar sola.
  const permitidas = [COTEJO.CORRECCION_DE_ERROR, COTEJO.CAMBIO_DE_MODELO, COTEJO.PENDIENTE]
  if (!permitidas.includes(clase)) {
    return { ...base, cotejo: COTEJO.CONFLICTO, porque: `hay explicación («${explicacion}») pero la clase «${clase ?? '∅'}» no cierra una diferencia` }
  }
  return { ...base, cotejo: clase, porque: explicacion }
}

/** ¿Este cotejo cierra? PURA. */
export const cierra = (r) => r.cotejo !== COTEJO.CONFLICTO

/**
 * EL RESUMEN DE UNA TANDA. `pasa` es false mientras quede un solo CONFLICTO.
 *
 * @param {Array<ReturnType<typeof cotejar>>} resultados
 */
export function resumirCotejo(resultados = []) {
  const porClase = {}
  for (const r of resultados) porClase[r.cotejo] = (porClase[r.cotejo] ?? 0) + 1
  const conflictos = resultados.filter((r) => r.cotejo === COTEJO.CONFLICTO)
  return {
    total: resultados.length,
    porClase,
    conflictos: conflictos.map((c) => ({ que: c.que, excel: c.excel, xsas: c.xsas, diferencia: c.diferencia, porque: c.porque })),
    pasa: conflictos.length === 0,
  }
}
