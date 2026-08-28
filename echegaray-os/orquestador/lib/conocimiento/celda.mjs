// UNA CELDA EN ERROR NO ES UN NÚMERO — y su valor cacheado miente.
//
// ═══ LO QUE PASÓ, MEDIDO ═══
//
// En `COTIZACION INTERNA.xlsm` de ARCOR (Concentrador Rossi) las tres celdas del cierre de la oferta
// —SUB TOTAL, IVA y TOTAL— son `#DIV/0!`. Excel guarda igual un valor cacheado, y ahí vale **7**.
// La biblioteca `xlsx`, leyendo `raw: true`, devuelve ese 7 como si fuera plata.
//
// Con eso, un control de aritmética habría dicho «el subtotal (7) no coincide con la suma de los
// ítems (10,1 M)» — un hallazgo falso que tapa el verdadero, que es MUCHO peor: **esa oferta no
// tiene total**. Lo mismo en LA ESTRELLA, donde el SUB TOTAL es `#NAME?` y el IVA está escrito a
// mano al lado del error.
//
// Por eso una celda en error viaja como lo que es —un error con su texto— y nunca como su número.
export const ERROR_DE_CELDA = Symbol.for('echegaray.celda.error')

/** ¿Esta celda es un error de fórmula? PURA. */
export const esErrorDeCelda = (v) => Boolean(v) && typeof v === 'object' && v[ERROR_DE_CELDA] === true

/** El texto del error (`#DIV/0!`, `#NAME?`, …), o `null`. PURA. */
export const textoDelError = (v) => (esErrorDeCelda(v) ? String(v.texto) : null)

/** Envuelve un error de celda. PURA. */
export const errorDeCelda = (texto) => ({ [ERROR_DE_CELDA]: true, texto: String(texto || '#ERROR'), toString() { return this.texto } })
