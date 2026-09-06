// UN CONTROL PUBLICADO CUYOS INSUMOS NO EXISTEN. NUNCA VA A DAR ROJO.
//
// ═══ EL DEFECTO, MEDIDO CELDA POR CELDA EL 06/09/2026 ═══
//
// `Estructura!A28` dice «⇒ Cobertura fiscal de esta pestaña» y `B28` tiene `=IF(B25=0;"";B26/B25)`.
// Las filas 23 a 27 de esa pestaña —la ventana comparable, «lo que esta pestaña lista», «con su
// comprobante en el libro de ARCA» y «sin comprobante»— están COMPLETAMENTE VACÍAS: ni valor ni
// fórmula. `B25` vacía entra en `B25=0` como cero, así que la fórmula devuelve `""` y la celda se ve
// en blanco. Lo mismo en `Recurrentes!B24` (`=IF(B21=0;"";B22/B21)`, filas 19 a 23 vacías).
//
// La comparación que lo prueba: `Materiales`, que corre EL MISMO `bloqueControlArca`, tiene las ocho
// filas y publica 60,8%. Las tres pestañas comparten generador; dos publican un control mudo.
//
// ═══ POR QUÉ HACÍA FALTA UN CONTROL NUEVO Y NO ALCANZABA CON LOS QUE HAY ═══
//
// Ninguno de los cuatro auditores del archivo puede ver esto, y no por descuido: cada uno mide algo
// que acá no pasa.
//
//   · `censo-numeros-pegados` busca números ESCRITOS donde debería haber fórmula. Acá no hay número
//     escrito: hay ausencia. Cuenta 0 pegados en Estructura y tiene razón.
//   · `auditar-diseno-unificado` busca PROSA de más. Acá falta texto, no sobra. Da conforme.
//   · `auditar-pantalla` busca texto cortado, apretado o mal formateado. Una celda vacía se dibuja
//     perfecto.
//   · `auditar-rangos-fosilizados` busca rangos que se quedaron cortos y dejan plata afuera. Este
//     rango no se quedó corto: apunta exactamente adonde tiene que apuntar, y ahí no hay nada.
//
// El resultado es el peor de los estados posibles: la pestaña muestra un renglón que promete medir la
// cobertura fiscal, los cuatro auditores dan verde, y el número que ese renglón publicaría si algo
// estuviera mal no puede existir. Es la forma exacta del patrón que este repositorio ya nombró: un
// control que no puede decir que no.
//
// ═══ QUÉ CUENTA Y QUÉ NO ═══
//
// Sólo se juzgan las referencias A LA MISMA PESTAÑA y de celda simple. Se dejan afuera a propósito:
//
//   · las referencias a otra pestaña (`Compras!$O$4`) — su grilla no está a la vista acá, y llamarlas
//     vacías sin haberlas leído sería inventar un hallazgo;
//   · los RANGOS (`B25:B30`) — un rango con parte vacía es normal (una tabla que todavía no se llenó
//     hasta el fondo) y marcarlos daría un ruido que haría dejar de mirar el control;
//   · los NOMBRES definidos (`ARCA_SIN_CARGAR_MONTO`) — de eso ya se ocupa
//     `auditar-rangos-fosilizados`, y dos controles para lo mismo es cómo se pierde el criterio.
//
// Con ese recorte el hallazgo es angosto y caro de ignorar: una fórmula de control cuyas referencias
// locales apuntan TODAS a celdas que no existen.

/** El prefijo con que este archivo marca una fila de total o de control. */
const ES_CONTROL = /^\s*⇒/

/**
 * Las referencias de celda SIMPLE y LOCAL de una fórmula.
 *
 * El orden de los descartes importa: primero se sacan las cadenas literales (un rótulo puede decir
 * "B25" adentro), después las referencias con pestaña, después los rangos. Lo que queda es una celda
 * de esta misma hoja.
 *
 * @param {string} formula
 * @returns {string[]} p.ej. `['B25','B26']`, en mayúsculas y sin `$`
 */
export function referenciasLocales(formula) {
  let f = String(formula ?? '')
  if (!f.startsWith('=')) return []
  f = f.replace(/"(?:[^"\\]|\\.)*"/g, '""')          // los literales no contienen referencias
  f = f.replace(/'[^']*'!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?/g, ' ')  // 'Otra hoja'!A1 o su rango
  f = f.replace(/\b[A-Za-z_][\w.]*!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?/g, ' ')  // Compras!$O$4
  f = f.replace(/\$?[A-Z]+\$?\d+\s*:\s*\$?[A-Z]+\$?\d*/g, ' ')          // B25:B30 — los rangos no
  f = f.replace(/\$?[A-Z]+\s*:\s*\$?[A-Z]+/g, ' ')                      // B:B — columna entera
  const out = new Set()
  for (const m of f.matchAll(/(?<![\w$!.])\$?([A-Z]{1,3})\$?(\d{1,5})\b/g)) out.add(`${m[1]}${m[2]}`)
  return [...out]
}

/** ¿La celda tiene ALGO —valor o fórmula—? Una celda con `""` de resultado igual existe. */
const existe = (c) => !!(c && (c.formula || String(c.valor ?? '').trim() !== '' || c.numero !== null && c.numero !== undefined))

/** Letra de columna a índice 0-based. */
const idx = (letra) => [...letra].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/**
 * NÚCLEO PURO: los controles de una pestaña que no pueden dar rojo.
 *
 * Un hallazgo por fila de control (`⇒ …`) cuya fórmula tiene al menos una referencia local y TODAS
 * apuntan a celdas que no existen. Con «todas» y no «alguna» a propósito: una fórmula que mezcla una
 * celda viva con una vacía todavía puede moverse, y marcarla llenaría el informe de casos que no son
 * el defecto. El que no puede moverse nunca es el que tiene el piso entero vacío.
 *
 * @param {{filas:Array<Array<{formula:?string,valor:?string,numero:?number}>>}} grid la de readSheetGrid
 * @returns {{fila:number, col:string, rotulo:string, formula:string, vacias:string[]}[]}
 */
export function controlesMudos(grid) {
  const filas = grid?.filas ?? []
  const celda = (ref) => {
    const m = ref.match(/^([A-Z]+)(\d+)$/)
    if (!m) return null
    return filas[Number(m[2]) - 1]?.[idx(m[1])] ?? null
  }
  const out = []
  filas.forEach((f, i) => {
    const rotulo = String(f?.[0]?.valor ?? '').trim()
    if (!ES_CONTROL.test(rotulo)) return
    ;(f || []).forEach((c, j) => {
      if (!c?.formula) return
      const refs = referenciasLocales(c.formula)
      if (!refs.length) return
      const vacias = refs.filter((r) => !existe(celda(r)))
      if (vacias.length !== refs.length) return
      const L = (n) => { let s = ''; for (let k = n; k >= 0; k = Math.floor(k / 26) - 1) s = String.fromCharCode(65 + (k % 26)) + s; return s }
      out.push({ fila: i + 1, col: L(j), rotulo, formula: c.formula, vacias })
    })
  })
  return out
}
