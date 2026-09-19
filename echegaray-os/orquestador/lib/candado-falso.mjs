// ¿EL CANDADO AUTOMÁTICO ACUSA AL DUEÑO DE ALGO QUE HIZO EL OS?
//
// ═══ POR QUÉ EXISTE (01/08) ═══
//
// "Cash Flow Mensual" estuvo candada tres días con el motivo *"la firma difiere de mi última
// escritura: la editaste"*. El dueño no la editó. Comparadas celda a celda contra el snapshot que el
// OS guarda de su propia escritura, las 45 diferencias eran TODAS nuestras: rangos que otro generador
// del OS ensanchó (`$M$399`→`$M$400`), su calendario al pie y una fila de proyección que se movió
// sola. Cero celdas escritas por una persona.
//
// La causa es estructural y va a repetirse: una pestaña con DOS escritores del OS. El primero sella
// la firma de la pestaña entera, el segundo escribe su bloque y no sella, y el control siguiente ve
// una pestaña distinta de la registrada. El arreglo de fondo es que el que escribe último selle
// (hecho en cheques-cobertura-sheet.mjs), pero mientras existan generadores sin sellar el candado va
// a seguir disparando — y un candado que acusa al dueño de algo que hizo el OS gasta la confianza que
// lo hace útil. Es el mismo patrón que los "borrados falsos" de la Regla 0.
//
// ESTE MÓDULO NO DECIDE NADA SOLO. Clasifica la evidencia y la muestra. Levantar un candado sigue
// siendo del dueño: lo que cambia es que ahora la decisión se toma mirando QUÉ cambió y QUIÉN lo
// escribió, en vez de adivinar.
//
// LO QUE NO PUEDE HACER, DICHO ACÁ: sólo compara contra el snapshot que el OS guardó de SU escritura.
// Si no hay snapshot, no sabe nada y lo dice — nunca supone que "sin evidencia" significa "no lo
// editó". El default es siempre tratar la pestaña como del dueño.

/** Una celda que no es fórmula y tiene texto es la firma más clara de una mano humana. */
const esFormula = (v) => String(v ?? '').startsWith('=')

/**
 * NÚCLEO PURO: las diferencias entre lo que el OS dejó y lo que hay hoy, clasificadas.
 *
 * @param {any[][]} vivo   la pestaña hoy (render FORMULA)
 * @param {any[][]} delOS  el snapshot que guardó el OS en su última escritura
 * @returns {{fila:number, col:number, os:string, vivo:string, pegada:boolean}[]}
 */
export function diferencias(vivo = [], delOS = []) {
  const out = []
  const n = Math.max(vivo.length, delOS.length)
  for (let i = 0; i < n; i++) {
    const a = vivo[i] || []
    const b = delOS[i] || []
    const m = Math.max(a.length, b.length)
    for (let j = 0; j < m; j++) {
      const x = String(a[j] ?? '')
      const y = String(b[j] ?? '')
      if (x === y) continue
      // "Pegada" = hay contenido nuevo que NO es fórmula. Un generador escribe fórmulas y rótulos
      // suyos; un rótulo del OS aparece igual en el snapshot, así que un texto que sólo está en el
      // vivo es el candidato serio a edición humana.
      out.push({ fila: i + 1, col: j + 1, os: y, vivo: x, pegada: Boolean(x) && !esFormula(x) && !y })
    }
  }
  return out
}

/**
 * NÚCLEO PURO: el veredicto sobre una pestaña candada automáticamente.
 *
 * FALLA HACIA EL LADO CERRADO, SIEMPRE. Sin snapshot no se puede afirmar nada y el veredicto es
 * `desconocido` — que se trata igual que "es del dueño". Sólo se propone levantar el candado cuando
 * hay evidencia POSITIVA de que cada diferencia la escribió el OS.
 *
 * @param {{diffs:Array, huboSnapshot:boolean, rotulosDelOS?:Set<string>}} p
 * @returns {{veredicto:'falso'|'real'|'desconocido'|'sin-cambios', motivo:string, pegadas:number}}
 */
export function veredicto({ diffs = [], huboSnapshot = false, rotulosDelOS = new Set() }) {
  if (!huboSnapshot) {
    return { veredicto: 'desconocido', motivo: 'no hay snapshot de mi última escritura: no puedo afirmar quién la tocó', pegadas: 0 }
  }
  if (!diffs.length) {
    return { veredicto: 'sin-cambios', motivo: 'la pestaña es idéntica a la que dejé: el candado no tiene sustento', pegadas: 0 }
  }
  // Un texto pegado que además es un rótulo que produce el OS no es del dueño: es otro generador.
  const pegadas = diffs.filter((d) => d.pegada && !rotulosDelOS.has(String(d.vivo).trim()))
  if (pegadas.length) {
    return {
      veredicto: 'real',
      motivo: `${pegadas.length} celda(s) con contenido escrito a mano (no son fórmulas ni rótulos míos)`,
      pegadas: pegadas.length,
    }
  }
  return {
    veredicto: 'falso',
    motivo: `${diffs.length} diferencia(s), todas fórmulas o rótulos míos: las escribió otro generador del OS, no una persona`,
    pegadas: 0,
  }
}

/** NÚCLEO PURO: un resumen corto de dónde están las diferencias, para poder mirarlas. */
export function resumen(diffs = [], max = 8) {
  const porFila = new Map()
  for (const d of diffs) {
    if (!porFila.has(d.fila)) porFila.set(d.fila, [])
    porFila.get(d.fila).push(d)
  }
  return [...porFila.entries()].slice(0, max).map(([fila, ds]) => ({
    fila,
    cols: ds.map((d) => d.col),
    muestra: (ds[0].vivo || ds[0].os).slice(0, 70),
    pegada: ds.some((d) => d.pegada),
  }))
}
