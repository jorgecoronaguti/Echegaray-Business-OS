import test from 'node:test'
import assert from 'node:assert/strict'
import { pielCashFlow, columnasProyectadas } from './cash-flow-piel.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL } from './formato-statement.mjs'
import { anchoConMeta, bandasMeta } from './cash-flow-columnas.mjs'

// Un cuadro de juguete con la misma FORMA que el real: encabezado en la fila 3, una actividad, un
// grupo con dos líneas de detalle, su subtotal, y el bloque de cierre.
const META = {
  cabFila: 3,
  actividades: [5],
  grupos: [{ fila0: 7, fila1: 8 }],
  subtotales: [9],
  variacion: 11,
  inicio: 12,
  cierre: 13,
  detalle: [{ fila: 7 }, { fila: 8 }],
  soloColumnaA: [1, 5, 15],
  vacias: [4, 10],
}
const BASE = {
  sheetId: 42,
  meta: META,
  n: 12,
  // A + 12 meses + Total + las columnas de metadatos. El ancho NO se escribe a mano: sale del mismo
  // contrato que usa el generador, que es justamente lo que estaba duplicado.
  ancho: anchoConMeta('mensual', 12),
  nFilas: 25,
  filaCtrl: 20,
  filaCtrlFin: 23,
  periodo: 'mensual',
  fechas: Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2026, m, 1))),
  hoy: new Date(Date.UTC(2026, 7, 4)),   // 04/08/2026
  filasHoja: 60,
  colsHoja: 30,
}

const reqs = () => pielCashFlow(BASE)
/** Los formatos aplicados a una fila (1-based), en orden de aplicación. */
const deFila = (rs, f) => rs.filter((r) => r.repeatCell && r.repeatCell.range.startRowIndex === f - 1 && r.repeatCell.range.endRowIndex === f)
const bordesDe = (rs, f) => rs.filter((r) => r.updateBorders && r.updateBorders.range.startRowIndex === f - 1 && r.updateBorders.range.endRowIndex === f)

test('ninguna fila del cuadro lleva relleno de color — la jerarquía es tipográfica', () => {
  // EL DEFECTO: la versión anterior pintaba cada ACTIVIDAD con una barra azul, cada categoría con una
  // barra gris, cada subtotal con un celeste y el efectivo al cierre con un rectángulo verde. Si
  // alguien vuelve a poner un backgroundColor que no sea blanco, esto se pone rojo.
  const conFondo = reqs().filter((r) => r.repeatCell?.cell?.userEnteredFormat?.backgroundColor)
  assert.equal(conFondo.length, 1, 'sólo el reset general puede declarar un fondo')
  assert.deepEqual(conFondo[0].repeatCell.cell.userEnteredFormat.backgroundColor, { red: 1, green: 1, blue: 1 })
})

test('el cuerpo no lleva "$" y el negativo va entre paréntesis, no con guion rojo', () => {
  const rs = reqs()
  const cuerpo = rs.find((r) => r.repeatCell?.range?.startColumnIndex === 1
    && r.repeatCell.range.endColumnIndex === BASE.n + 1
    && r.repeatCell.cell.userEnteredFormat.numberFormat)
  assert.ok(cuerpo, 'tiene que existir el formato del cuerpo')
  assert.deepEqual(cuerpo.repeatCell.cell.userEnteredFormat.numberFormat, MONEDA_CUERPO)
  // Ningún patrón del cuadro puede pintar de rojo un negativo: el rojo es del control, no del signo.
  for (const r of rs) {
    const pat = r.repeatCell?.cell?.userEnteredFormat?.numberFormat?.pattern
    if (pat) assert.ok(!pat.includes('[Red]'), `patrón con [Red] en el cuadro: ${pat}`)
  }
})

test('la columna de cierre del año declara la unidad — es lo que la separa de un mes', () => {
  const rs = reqs()
  const total = rs.find((r) => r.repeatCell?.range?.startColumnIndex === BASE.n + 1
    && r.repeatCell.range.endColumnIndex === BASE.n + 2
    && r.repeatCell.cell.userEnteredFormat.numberFormat?.type === 'CURRENCY')
  assert.ok(total, 'la columna Total tiene que tener su propio formato')
  assert.deepEqual(total.repeatCell.cell.userEnteredFormat.numberFormat, MONEDA_TOTAL)
})

test('el efectivo al cierre es el ancla: única fila con regla arriba Y abajo', () => {
  const rs = reqs()
  const b = bordesDe(rs, META.cierre)
  const lados = new Set(b.flatMap((r) => Object.keys(r.updateBorders).filter((k) => k !== 'range')))
  assert.deepEqual([...lados].sort(), ['bottom', 'top'])
  // Y ninguna otra fila tiene las dos.
  for (const f of [META.cabFila, ...META.actividades, ...META.subtotales, META.variacion, META.inicio]) {
    const l = new Set(bordesDe(rs, f).flatMap((r) => Object.keys(r.updateBorders).filter((k) => k !== 'range')))
    assert.ok(l.size <= 1, `la fila ${f} tiene reglas en ${[...l]} — sólo el cierre lleva las dos`)
  }
})

test('nunca se dibuja un borde vertical ni una caja', () => {
  for (const r of reqs()) {
    if (!r.updateBorders) continue
    for (const lado of ['left', 'right', 'innerVertical']) {
      const b = r.updateBorders[lado]
      if (b) assert.equal(b.style, 'NONE', `borde ${lado} con estilo ${b.style}`)
    }
  }
})

test('lo proyectado va en itálica y sólo toca el campo italic', () => {
  const rs = reqs()
  const italicas = rs.filter((r) => r.repeatCell?.fields === 'userEnteredFormat.textFormat.italic')
  // Agosto (índice 7) a diciembre (11) todavía no terminaron → 5 columnas.
  assert.equal(italicas.length, 5)
  const cols = italicas.map((r) => r.repeatCell.range.startColumnIndex).sort((a, b) => a - b)
  assert.deepEqual(cols, [8, 9, 10, 11, 12])   // 0-based: A=0, ene=1 … ago=8
  // Nunca hasta el final de la hoja: la itálica marca el flujo, no el bloque de control de texto.
  for (const r of italicas) assert.equal(r.repeatCell.range.endRowIndex, META.cierre)
})

test('el mes en curso cuenta como proyección: su ventana todavía no cerró', () => {
  const meses = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2026, m, 1)))
  const p = columnasProyectadas('mensual', meses, new Date(Date.UTC(2026, 7, 4)))
  assert.ok(p.has(7), 'agosto está en curso: es proyección')
  assert.ok(!p.has(6), 'julio ya cerró: es hecho')
})

test('la semana en curso también, y la ventana semanal son 7 días', () => {
  const lunes = [new Date(Date.UTC(2026, 7, 3)), new Date(Date.UTC(2026, 7, 10))]
  const p = columnasProyectadas('semanal', lunes, new Date(Date.UTC(2026, 7, 4)))
  assert.deepEqual([...p].sort(), [0, 1])
  // La semana anterior, cerrada.
  const q = columnasProyectadas('semanal', [new Date(Date.UTC(2026, 6, 27))], new Date(Date.UTC(2026, 7, 4)))
  assert.equal(q.size, 0)
})

test('ningún rango de alto o ancho cero — un 400 parte la pestaña al medio', () => {
  // Cuadro degenerado: sin columnas extra, cierre pegado al encabezado.
  const rs = pielCashFlow({ ...BASE, ancho: BASE.n + 2 })
  for (const r of rs) {
    const g = r.repeatCell?.range || r.updateBorders?.range
    if (!g) continue
    assert.ok(g.endRowIndex > g.startRowIndex, `alto cero: ${JSON.stringify(g)}`)
    assert.ok(g.endColumnIndex > g.startColumnIndex, `ancho cero: ${JSON.stringify(g)}`)
  }
})

test('la columna A entra: 340 px, no los 260 que cortaban los rótulos', () => {
  const a = reqs().find((r) => r.updateDimensionProperties?.range?.dimension === 'COLUMNS'
    && r.updateDimensionProperties.range.startIndex === 0)
  assert.equal(a.updateDimensionProperties.properties.pixelSize, 340)
})

test('la reja se apaga y el encabezado queda anclado', () => {
  const s = reqs().find((r) => r.updateSheetProperties)
  assert.equal(s.updateSheetProperties.properties.gridProperties.hideGridlines, true)
  assert.equal(s.updateSheetProperties.properties.gridProperties.frozenRowCount, 3)
  assert.equal(s.updateSheetProperties.properties.gridProperties.frozenColumnCount, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO QUE ESTOS TRES TESTS ATRAPAN — 34 de los 42 de pantalla del Semanal
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La piel pintaba de moneda la banda `[colTotal+1, colTotal+3)` y de texto la de ahí en adelante. Eso
// suponía que la primera columna después del Total era "Real (Compras)". Cuando se insertó "Naturaleza
// del dato" delante, la banda quedó corrida una columna: 33 glosas de texto con formato CURRENCY, y
// "Proyectado" —que es plata— con formato TEXT. Ninguna celda daba error.
//
// El test no compara contra números escritos a mano: le pregunta al contrato qué especie tiene cada
// columna y verifica que el ÚLTIMO formato que la toca sea el suyo. Volver a la aritmética a mano lo
// pone rojo con cualquier lista de columnas.

/** El numberFormat que efectivamente queda en (fila, col): gana el último request que la toca. */
function formatoEfectivo(rs, fila, col) {
  let out = null
  for (const r of rs) {
    const g = r.repeatCell?.range
    const nf = r.repeatCell?.cell?.userEnteredFormat?.numberFormat
    if (!g || !nf) continue
    if (fila - 1 >= g.startRowIndex && fila - 1 < g.endRowIndex && col >= g.startColumnIndex && col < g.endColumnIndex) out = nf
  }
  return out
}

test('una columna de texto declara que es texto: ninguna glosa cae en la banda de moneda', () => {
  const rs = reqs()
  for (const b of bandasMeta('mensual', BASE.n)) {
    for (const f of [7, 8]) {           // las dos filas de detalle del cuadro de juguete
      const nf = formatoEfectivo(rs, f, b.indice)
      assert.ok(nf, `la columna "${b.clave}" (índice ${b.indice}) quedó sin formato declarado`)
      if (b.tipo === 'texto') {
        assert.equal(nf.type, 'TEXT', `"${b.clave}" es texto y quedó como ${nf.type}: es el defecto "texto_en_numero"`)
      } else {
        assert.equal(nf.type, 'CURRENCY', `"${b.clave}" es plata y quedó como ${nf.type}: un importe dibujado como texto`)
      }
    }
  }
})

test('cada columna de metadatos pide su propio ancho — 96 px cortaban las glosas', () => {
  const rs = reqs()
  const anchos = new Map()
  for (const r of rs) {
    const d = r.updateDimensionProperties
    if (d?.range?.dimension !== 'COLUMNS') continue
    for (let c = d.range.startIndex; c < d.range.endIndex; c++) anchos.set(c, d.properties.pixelSize)
  }
  for (const b of bandasMeta('mensual', BASE.n)) {
    assert.equal(anchos.get(b.indice), b.px, `"${b.clave}" quedó en ${anchos.get(b.indice)} px y pide ${b.px}`)
    if (b.tipo === 'texto') assert.ok(b.px > 96, `"${b.clave}" en 96 px corta la glosa`)
  }
  // Y las de período siguen siendo angostas: ensanchar todo sería la otra forma de romperlo.
  for (let c = 1; c <= BASE.n + 1; c++) assert.equal(anchos.get(c), 96, `la columna de período ${c} cambió de ancho`)
})

test('un título puede desbordar porque a su derecha el generador garantiza vacío', () => {
  const rs = reqs()
  const over = rs.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.wrapStrategy === 'OVERFLOW_CELL')
  assert.equal(over.length, META.soloColumnaA.length)
  for (const r of over) {
    assert.equal(r.repeatCell.range.startColumnIndex, 0, 'el desborde es de la columna A y de ninguna otra')
    assert.equal(r.repeatCell.range.endColumnIndex, 1)
  }
  // Sin filas declaradas como "sólo columna A" no se autoriza ningún desborde: OVERFLOW sobre una fila
  // con datos a la derecha taparía una cifra, que es peor que un título cortado.
  assert.equal(pielCashFlow({ ...BASE, meta: { ...META, soloColumnaA: [] } })
    .filter((r) => r.repeatCell?.cell?.userEnteredFormat?.wrapStrategy === 'OVERFLOW_CELL').length, 0)
})

test('los encabezados que no son período no llevan formato de fecha', () => {
  const rs = reqs()
  const cab = deFila(rs, META.cabFila)
  const ultimo = cab.filter((r) => r.repeatCell.range.startColumnIndex >= BASE.n + 1
    && r.repeatCell.cell.userEnteredFormat.numberFormat)
  assert.ok(ultimo.length >= 1)
  assert.equal(ultimo.at(-1).repeatCell.cell.userEnteredFormat.numberFormat.type, 'TEXT')
})
