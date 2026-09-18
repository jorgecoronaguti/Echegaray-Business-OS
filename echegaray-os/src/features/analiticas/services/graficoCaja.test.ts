import test from 'node:test'
import assert from 'node:assert/strict'
import { apilar, escala, indicesRotulados, paneles, rotuloEje } from './graficoCaja.ts'

const serie = (nombre: string, tipo: string, valores: (number | null)[]) => ({ nombre, tipo, eje: null, punteada: false, valores })

test('apilar: los positivos suben uno sobre otro, los negativos bajan, el nulo y el cero no ocupan lugar', () => {
  const t = apilar([serie('a', 'COLUMN', [10, null, -5]), serie('b', 'COLUMN', [5, 0, 3]), serie('c', 'COLUMN', [-2, 4, -1])], 3)
  assert.deepEqual(t, [
    { serie: 0, i: 0, y0: 0, y1: 10 }, { serie: 1, i: 0, y0: 10, y1: 15 }, { serie: 2, i: 0, y0: 0, y1: -2 },
    { serie: 2, i: 1, y0: 0, y1: 4 },
    { serie: 0, i: 2, y0: 0, y1: -5 }, { serie: 1, i: 2, y0: 0, y1: 3 }, { serie: 2, i: 2, y0: -5, y1: -6 },
  ])
})

test('escala: incluye el cero, termina en redondo y marca de a pasos parejos', () => {
  assert.deepEqual(escala([12_300_000, 43_000_000, 7_000_000]), { min: 0, max: 50_000_000, ticks: [0, 10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000] })
  assert.deepEqual(escala([-84_571_623, 147_348_614]).ticks, [-100_000_000, -50_000_000, 0, 50_000_000, 100_000_000, 150_000_000])
  assert.deepEqual(escala([]), { min: 0, max: 1, ticks: [0, 1] })
  assert.deepEqual(escala([0, 0]).max, 1)
})

test('los rótulos del eje son cortos y en millones', () => {
  assert.equal(rotuloEje(0), '0')
  assert.equal(rotuloEje(50_000_000), '$ 50 M')
  assert.equal(rotuloEje(-2_500_000), '−$ 2,5 M')
})

test('paneles: barras arriba, líneas abajo; una serie sin tipo hereda el del gráfico', () => {
  const g = { id: '1', titulo: '', subtitulo: '', tipo: 'COMBO', apilado: 'STACKED', fila: 1, dominio: ['a'],
    series: [serie('sale', 'COLUMN', [1]), serie('saldo', 'LINE', [2]), { ...serie('x', 'LINE', [3]), tipo: null }] }
  const p = paneles(g)
  assert.deepEqual(p.barras.map((s) => s.nombre), ['sale', 'x'])
  assert.deepEqual(p.lineas.map((s) => s.nombre), ['saldo'])
  assert.deepEqual(paneles({ ...g, tipo: 'LINE' }).lineas.map((s) => s.nombre), ['saldo', 'x'])
})

test('los rótulos del dominio se reparten: siempre el primero y el último, nunca más de ocho', () => {
  assert.deepEqual(indicesRotulados(5), [0, 1, 2, 3, 4])
  const r = indicesRotulados(60)
  assert.equal(r[0], 0)
  assert.equal(r.at(-1), 59)
  assert.ok(r.length <= 9 && r.length >= 7)
  assert.ok(r.at(-1)! - r.at(-2)! >= 4, `el último no se pega al anterior: ${r}`)
})

// ═══ AUDITORÍA 18/09/2026: fechas dd/mm/yy, celda vacía vacía, COMBO sin pisarse ═══
import { disposicion, fechaCorta, franjaDeRotulo, GEOMETRIA, rotulosDelEje, rotuloVentana, textoCelda } from './graficoCaja.ts'

test('fechas en dd/mm/yy: ISO, dd/mm/yyyy y d/m/yyyy; lo que no es fecha queda igual', () => {
  assert.equal(fechaCorta('2026-09-19'), '19/09/26')
  assert.equal(fechaCorta('19/09/2026'), '19/09/26')
  assert.equal(fechaCorta('3/9/2026'), '03/09/26')
  assert.equal(fechaCorta('Santander · cta cte USD'), 'Santander · cta cte USD')
  assert.equal(fechaCorta('$ 1.234'), '$ 1.234')
})

test('celda vacía es vacía (no «—»); la fecha de una celda va en dd/mm/yy; el «—» que escribe la pestaña se respeta', () => {
  assert.equal(textoCelda({ texto: '' }), '')
  assert.equal(textoCelda({ texto: '', fecha: null }), '')
  assert.equal(textoCelda({ texto: '03/09/2026', fecha: '2026-09-03' }), '03/09/26')
  assert.equal(textoCelda({ texto: '—' }), '—')
  assert.equal(textoCelda({ texto: 'U$S 507,53' }), 'U$S 507,53')
})

test('la ventana del gasto en dd/mm/yy y una sola vez', () => {
  assert.equal(rotuloVentana('últimos 30 días', { desde: '2026-08-20', hasta: '2026-09-18' }), 'últimos 30 días · 20/08/26 – 18/09/26')
  assert.equal(rotuloVentana('01/08/26 – 31/08/26', { desde: '2026-08-01', hasta: '2026-08-31' }), '01/08/26 – 31/08/26')
  assert.equal(rotuloVentana('todo', { desde: null, hasta: null }), 'todo · desde el inicio')
  assert.doesNotMatch(rotuloVentana('mes', { desde: '2026-08-01', hasta: null }), /\d{4}-\d{2}/)
})

test('COMBO: el panel de líneas empieza debajo del de barras, y ningún rótulo de eje pisa al del otro panel ni al pie', () => {
  const d = disposicion(true, true)
  assert.ok(d.barras && d.lineas && d.separador != null)
  const pisoBarras = franjaDeRotulo(d.barras.abajo)
  const techoLineas = franjaDeRotulo(d.lineas.arriba)
  assert.ok(pisoBarras[1] + 4 <= techoLineas[0], `rótulos encimados: barras hasta ${pisoBarras[1]}, líneas desde ${techoLineas[0]}`)
  assert.ok(d.separador > pisoBarras[1] && d.separador < techoLineas[0], 'la línea que separa va entre los dos rótulos')
  const pisoLineas = franjaDeRotulo(d.lineas.abajo)
  assert.ok(pisoLineas[1] + 2 <= d.yPie - GEOMETRIA.LETRA, 'el pie de fechas no pisa el piso de las líneas')
  assert.ok(d.yPie <= d.alto, 'el pie entra en el SVG')
  assert.ok(d.barras.arriba - GEOMETRIA.LETRA + GEOMETRIA.BAJA >= 0, 'el techo no se corta')
  // Un solo panel: sin separador y el pie debajo.
  const s = disposicion(false, true)
  assert.equal(s.barras, null)
  assert.equal(s.separador, null)
  assert.ok(s.lineas && s.lineas.abajo < s.yPie)
})

test('los rótulos del eje de días no se pisan entre sí, van en dd/mm/yy y quedan adentro del ancho', () => {
  for (const n of [2, 7, 8, 15, 31, 45, 62, 90]) {
    const dominio = Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 8, 1 + i)); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` })
    const r = rotulosDelEje(dominio)
    assert.equal(r[0].i, 0, `n=${n}: el primero`)
    assert.equal(r[r.length - 1].i, n - 1, `n=${n}: el último`)
    for (const x of r) assert.match(x.texto, /^\d\d\/\d\d\/\d\d$/)
    for (let k = 1; k < r.length; k++) assert.ok(r[k - 1].hasta + 4 <= r[k].desde, `n=${n}: «${r[k - 1].texto}» pisa a «${r[k].texto}»`)
    assert.ok(r[0].desde >= GEOMETRIA.IZQ - 30 && r[r.length - 1].hasta <= GEOMETRIA.ANCHO, `n=${n}: afuera del ancho`)
  }
})
