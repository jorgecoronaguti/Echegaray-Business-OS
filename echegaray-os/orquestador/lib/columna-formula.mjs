// UNA FÓRMULA PISADA A MANO NO GRITA. ESTE ARCHIVO LA ENCUENTRA.
//
// POR QUÉ EXISTE (21/07). El dueño pidió renumerar los IDs de Cobranzas porque el ID 47 lo usaban
// tres filas distintas. Al ir a hacerlo apareció que la columna NUNCA tuvo IDs cargados a mano: es
// una fórmula autonumerada, `=IF(C51="";"";ROW()-4)`, que por construcción no puede repetirse.
//
// Lo que había pasado es otra cosa, y peor: en DOS celdas —las filas 50 y 54, justamente el par de
// San Francisco que estaba duplicado— alguien pegó el valor "47" encima de la fórmula. Un pegado de
// valores sobre una columna calculada.
//
// Así que renumerar habría sido el arreglo equivocado: habría escrito a mano 54 números donde había
// una fórmula que se mantiene sola, y el próximo pegado habría vuelto a romperla en silencio. El
// arreglo correcto es devolver la fórmula a las dos celdas y dejar el control puesto.
//
// ═══ POR QUÉ ESTE DEFECTO ES INVISIBLE ═══
//
// Una fórmula rota grita: muestra #REF! o #ERROR!. Una fórmula PISADA no. La celda sigue mostrando
// un número perfectamente creíble —"47"— que simplemente dejó de actualizarse. Se ve igual que sus
// vecinas. Los controles que suman tampoco la ven: el total sigue dando bien hasta el día en que la
// fila de al lado cambia y ésta no.
//
// Es la misma familia que el espejo de JORNALES congelado y que el IPC sin datos del INDEC: fuentes
// que se quedan calladas mientras envejecen. Por eso el chequeo es genérico y no específico de
// Cobranzas: cualquier columna del archivo que sea calculada puede tener esto.
//
// ═══ CÓMO SABE CUÁL ES LA FÓRMULA CORRECTA ═══
//
// No la declara nadie: se DEDUCE de la propia columna. Se toma la fórmula de cada celda, se
// reemplazan los números de fila por un comodín, y el patrón que aparece en la mayoría de las
// celdas es el canónico. Una columna con dos patrones distintos no se repara sola: se informa, porque
// puede ser legítimo (un bloque con otra regla) y adivinar sería peor que avisar.
//
// Este archivo es núcleo puro. Quién lee y quién escribe es el script.

/** El comodín con que se compara una fórmula contra otra de la misma columna. */
const patron = (f) => String(f ?? '').replace(/\d+/g, '#')

/**
 * NÚCLEO PURO: reescribe una fórmula canónica para otra fila.
 *
 * Reemplaza los números de fila de las referencias (C51 → C77, $A$5 no se toca si es absoluta).
 * Sólo toca lo que sigue a una letra de columna: `ROW()-4` mantiene el 4, que es un desplazamiento
 * y no una fila. Esa distinción es la que hace que el arreglo no invente una fórmula distinta.
 */
export function reescribir(formula, filaOrigen, filaDestino) {
  const d = Number(filaDestino) - Number(filaOrigen)
  if (!Number.isFinite(d)) return formula
  return String(formula ?? '').replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (m, d1, col, d2, fila) => {
    if (d2) return m                       // fila absoluta: no se mueve
    return `${d1}${col}${d2}${Number(fila) + d}`
  })
}

/**
 * NÚCLEO PURO: encuentra las celdas de una columna que deberían tener fórmula y tienen un valor
 * pegado a mano.
 *
 * @param {Array<{fila:number, formula:string|null, valor:any}>} celdas la columna, en orden
 * @returns {{canonica:{formula:string, fila:number, n:number}|null, pisadas:Array, patrones:Array,
 *            ambigua:boolean}}
 */
export function detectar(celdas = []) {
  const conFormula = celdas.filter((c) => String(c?.formula ?? '').trim())
  if (!conFormula.length) return { canonica: null, pisadas: [], patrones: [], ambigua: false }

  const cuenta = new Map()
  for (const c of conFormula) {
    const p = patron(c.formula)
    const a = cuenta.get(p) ?? { patron: p, n: 0, ejemplo: c }
    a.n++
    cuenta.set(p, a)
  }
  const patrones = [...cuenta.values()].sort((a, b) => b.n - a.n)

  // DOS PATRONES CON PESO PARECIDO = NO SE REPARA. Puede ser un bloque con otra regla, y elegir el
  // más frecuente sobreescribiría el otro. Se informa y decide un humano.
  const ambigua = patrones.length > 1 && patrones[1].n > patrones[0].n * 0.25

  const top = patrones[0]
  const canonica = { formula: top.ejemplo.formula, fila: top.ejemplo.fila, n: top.n }

  // Una celda está PISADA si no tiene fórmula pero sí un valor, y la columna es mayoritariamente
  // calculada. Una celda vacía no es un defecto: es una fila sin usar.
  const pisadas = celdas
    .filter((c) => !String(c?.formula ?? '').trim() && String(c?.valor ?? '').trim() !== '')
    .map((c) => ({
      fila: c.fila,
      valor: c.valor,
      deberia: reescribir(canonica.formula, canonica.fila, c.fila),
    }))

  return { canonica, pisadas, patrones, ambigua }
}

/** NÚCLEO PURO: el resumen en una línea, para el log y para el bloque de control del Sheet. */
export function resumen(d, rotulo = 'la columna') {
  if (!d?.canonica) return `${rotulo}: no es una columna calculada, no aplica`
  if (d.ambigua) return `${rotulo}: ${d.patrones.length} fórmulas distintas conviviendo — NO la reparo sola, mirala`
  if (!d.pisadas.length) return `${rotulo}: ✓ las ${d.canonica.n} celdas calculadas conservan su fórmula`
  return `${rotulo}: ⚠ ${d.pisadas.length} celda(s) con un valor pegado encima de la fórmula (fila ${d.pisadas.map((p) => p.fila).join(', ')})`
}
