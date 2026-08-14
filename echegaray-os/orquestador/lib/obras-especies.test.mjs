// NINGUNA CELDA DE `OBRAS` SE PUBLICA SIN FORMATO DE NÚMERO — el control del defecto del 14/08/2026.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO IMPIDE QUE VUELVA ═══
//
// La columna `Vencido` publicó en el archivo del dueño `17449303,3143` crudo, alineado a la izquierda
// y derramando sobre la columna de al lado, mientras sus vecinas de la MISMA columna mostraban "—".
// Medido con `readSheetUserFormats` sobre `OBRAS!F1:F45`: seis celdas con
// `{numberFormat: TEXT, horizontalAlignment: LEFT, wrapStrategy: OVERFLOW_CELL}` en medio de una
// columna de moneda. Las seis eran, exactamente, las que valían distinto de cero.
//
// ESA ES LA PARTE VENENOSA: el tercer tramo del patrón dibuja el cero como "—", así que una columna
// entera puede estar mal formateada y verse impecable hasta el primer importe. El defecto no se
// descubre cuando se comete: se descubre meses después, cuando el número aparece.
//
// POR ESO EL TEST NO MIRA LA COLUMNA `Vencido`. Recorre las NUEVE columnas en TODAS las filas que el
// escritor va a tocar y exige que cada una reciba un `numberFormat` EN CADA CORRIDA. Un formato que
// nadie repone es estado que sobrevive —`estilo-pestana.reset()` repone fondo, fuente, alineación y
// ajuste, y a propósito NO repone el formato de número—, y ahí es donde el TEXTO viejo se queda
// esperando. Con el código anterior esto se ponía ROJO: la columna A no recibía `numberFormat` en
// ninguna corrida, y el título de bloque borraba con su máscara el de la fila entera.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaObras, conColaLimpiable, ANCHO_OBRAS, ANCHO_HISTORICO, ALTO_HISTORICO } from './obras-grilla.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import {
  ESPECIES, ESPECIES_DE_PLATA, matrizDeEspecies, celdasSinEspecie, celdasDePlataSinFormatoDeNumero,
} from './obras-especies.mjs'
import { formatear } from '../scripts/obras-pestana.mjs'

const L = 'ABCDEFGHI'
const g = grillaObras({ obras: OBRAS_FUTURAS })
/** La grilla TAL COMO SE ESCRIBE: con la cola limpiable, que es la que el escritor formatea. */
const filas = conColaLimpiable(g.filas, ANCHO_HISTORICO, ALTO_HISTORICO)

/**
 * EL FORMATO QUE CADA CELDA TIENE AL FINAL DE LA CORRIDA — no el que un request pidió.
 *
 * Es la única forma de juzgar un formateador que aplica en capas: la primera capa puede declarar
 * moneda y la última pisarla con texto, que es literalmente lo que pasaba. Se aplican los requests EN
 * ORDEN y se guarda, por celda, lo último que la tocó — igual que hace Google.
 */
async function formatoFinal() {
  let reqs = []
  await formatear({ spreadsheetBatchUpdate: async (_id, r) => { reqs = r } }, 0, { ...g, filas })
  const est = new Map()
  for (const q of reqs) {
    const rc = q.repeatCell
    if (!rc) continue
    const uf = rc.cell?.userEnteredFormat ?? {}
    const campos = String(rc.fields ?? '')
    const toca = (k) => campos === 'userEnteredFormat' || campos.includes(k)
    for (let f = rc.range.startRowIndex ?? 0; f < (rc.range.endRowIndex ?? 0); f++) {
      for (let c = rc.range.startColumnIndex ?? 0; c < (rc.range.endColumnIndex ?? 0); c++) {
        const cur = est.get(`${f}:${c}`) ?? {}
        if (toca('numberFormat')) cur.nf = uf.numberFormat ?? null
        if (toca('horizontalAlignment')) cur.al = uf.horizontalAlignment ?? null
        est.set(`${f}:${c}`, cur)
      }
    }
  }
  return est
}

test('NINGUNA celda queda sin numberFormat: ni una columna, ni una fila, ni la cola', async () => {
  const est = await formatoFinal()
  const huerfanas = []
  for (let f = 0; f < filas.length; f++) {
    for (let c = 0; c < ANCHO_OBRAS; c++) {
      if (!est.get(`${f}:${c}`)?.nf) huerfanas.push(`${L[c]}${f + 1}`)
    }
  }
  assert.deepEqual(huerfanas, [],
    `${huerfanas.length} celda(s) no reciben formato de número en ninguna corrida: se quedan con el que `
    + `les dejó la anterior, y un número con formato de TEXTO se dibuja crudo. Primeras: ${huerfanas.slice(0, 12).join(' ')}`)
})

test('una celda que lleva plata NUNCA queda dibujada como texto', async () => {
  const est = await formatoFinal()
  const mal = []
  for (let f = 0; f < filas.length; f++) {
    for (let c = 0; c < ANCHO_OBRAS; c++) {
      const esp = g.especies?.[f]?.[c]
      if (!ESPECIES_DE_PLATA.includes(esp)) continue
      const t = est.get(`${f}:${c}`)?.nf?.type
      if (t !== 'CURRENCY') mal.push(`${L[c]}${f + 1} (especie ${esp}, quedó ${t ?? 'sin formato'})`)
    }
  }
  assert.deepEqual(mal, [], `celdas de plata dibujadas como otra cosa: ${mal.slice(0, 10).join(' · ')}`)
})

test('el importe queda a la DERECHA: alineado a la izquierda se lee como un rótulo', async () => {
  const est = await formatoFinal()
  const mal = []
  for (let f = 0; f < filas.length; f++) {
    for (let c = 1; c < ANCHO_OBRAS; c++) {
      if (!ESPECIES_DE_PLATA.includes(g.especies?.[f]?.[c])) continue
      // Las filas de encabezado son la excepción declarada: su rótulo se alinea CON su columna.
      if (est.get(`${f}:${c}`)?.al !== 'RIGHT') mal.push(`${L[c]}${f + 1}`)
    }
  }
  assert.deepEqual(mal, [], `importes alineados como texto: ${mal.slice(0, 10).join(' ')}`)
})

test('toda celda con contenido DECLARA su especie: el defecto no puede entrar por una columna nueva', () => {
  const sin = celdasSinEspecie(g.filas, g.especiesDeclaradas)
  assert.deepEqual(sin.map((x) => `${L[x.col]}${x.fila}`), [],
    'estas celdas escriben un valor sin decir qué es; su formato lo decidiría el defecto de la columna, '
    + `que es una adivinanza: ${sin.slice(0, 8).map((x) => `${L[x.col]}${x.fila}=${x.valor}`).join(' · ')}`)
})

test('ninguna fórmula que SUMA quedó declarada como texto o como fecha', () => {
  const mal = celdasDePlataSinFormatoDeNumero(g.filas, g.especies)
  assert.deepEqual(mal, [],
    `una fórmula que suma es plata y tiene que declararlo: ${mal.map((x) => `${L[x.col]}${x.fila} (${x.especie})`).join(' · ')}`)
})

test('la matriz de especies no tiene agujeros y todas sus especies existen', () => {
  const m = matrizDeEspecies(filas.length, g.especiesDeclaradas, ANCHO_OBRAS)
  assert.equal(m.length, filas.length)
  for (const [i, fila] of m.entries()) {
    assert.equal(fila.length, ANCHO_OBRAS, `la fila ${i + 1} no cubre las 9 columnas`)
    for (const [j, e] of fila.entries()) assert.ok(ESPECIES[e], `${L[j]}${i + 1}: especie "${e}" no existe`)
  }
})

test('la celda VACÍA también se formatea: es donde sobrevive el TEXTO de la corrida vieja', () => {
  // La cola limpiable son filas que este generador YA NO EMITE y que manda vaciar. Si no se les repone
  // el formato, el día que el cuadro vuelva a crecer esas filas publican con el formato de hace meses.
  const cola = filas.length - g.filas.length
  assert.ok(cola > 0, 'el fixture pierde sentido si la grilla no tiene cola')
  const m = matrizDeEspecies(filas.length, g.especiesDeclaradas, ANCHO_OBRAS)
  for (let f = g.filas.length; f < filas.length; f++) {
    assert.ok(filas[f].every((v) => v === VACIO), `la fila ${f + 1} debería ser cola vacía`)
    assert.equal(m[f][5], 'alerta', `F${f + 1}: la cola toma la especie de su columna`)
  }
})
