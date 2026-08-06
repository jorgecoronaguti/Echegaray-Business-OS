// LA MATRIZ SEMANAL — lo que este archivo impide que vuelva a pasar.
//
// Cada test nombra un defecto concreto que la vista podría tener sin dar un solo error visible: una
// cadena de saldos rota (las cinco semanas de agosto arrancando con el mismo saldo, $84M de desvío),
// un número pegado donde tiene que haber fórmula, una coma de separador en un archivo es-AR (que
// Sheets rechaza entera), una fórmula que derrama, o un hero que contradice al cuadro de abajo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaSemanal, vinculoHoy, PESTANA_SEMANAL } from './cash-flow-semanas.mjs'
import { FOOTPRINT, ESTADOS_PENDIENTES, conceptosDe, colTotal } from './cash-flow-matriz.mjs'
import { auditarPatron } from './patron-pestana.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5)) // miércoles 5 de agosto de 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const armar = (opts = {}) => grillaSemanal({ hoy: HOY, refs: REFS, ...opts })
const en = (filas, f, c) => String((filas[f - 1] || [])[c] ?? '')
/** El texto de una fórmula sin lo que va entre comillas: los patrones de número llevan comas legítimas. */
const fueraDeComillas = (s) => String(s).replace(/"[^"]*"/g, '""')

test('trece columnas de semana más TOTAL, y las siete filas de concepto en orden', () => {
  const { filas, meta } = armar()
  assert.equal(meta.pestana, PESTANA_SEMANAL)
  assert.equal(meta.cab.n, 13)
  assert.equal(meta.cab.colTotal, colTotal('semana'))
  assert.equal(en(filas, meta.cab.fila, 0), 'Concepto')
  assert.equal(en(filas, meta.cab.fila, meta.cab.colTotal), 'TOTAL')
  assert.deepEqual(
    conceptosDe('semana').map((c) => en(filas, meta.fila[c.clave], 0)),
    conceptosDe('semana').map((c) => c.rotulo))
})

test('los encabezados de tiempo son SERIALES de fecha, nunca texto', () => {
  const { filas, meta } = armar()
  for (let j = 0; j < meta.cab.n; j++) {
    const v = (filas[meta.cab.fila - 1] || [])[meta.cab.col0 + j]
    assert.equal(typeof v, 'number', `la columna ${j + 1} escribe un texto donde va la fecha`)
    assert.ok(v > 46000 && v < 47000, `${v} no es un serial de 2026`)
  }
  // Trece lunes consecutivos: el serial del siguiente es el anterior más siete.
  const seriales = filas[meta.cab.fila - 1].slice(meta.cab.col0, meta.cab.col0 + meta.cab.n)
  for (let j = 1; j < seriales.length; j++) assert.equal(seriales[j] - seriales[j - 1], 7)
})

test('la cadena de saldos: cada semana arranca donde cerró la anterior, y sólo la primera ancla en CAJA', () => {
  const { filas, meta } = armar()
  const ini = (j) => en(filas, meta.fila.saldoInicial, meta.cab.col0 + j)
  assert.ok(ini(0).includes('CAJA_TOTAL_DISPONIBLE'), 'la primera semana tiene que anclar en el saldo declarado')
  for (let j = 1; j < meta.cab.n; j++) {
    const col = String.fromCharCode(65 + meta.cab.col0 + j - 1)
    assert.equal(ini(j), `=N($${col}$${meta.fila.saldoFinal})`,
      `la semana ${j + 1} no encadena con el cierre de la anterior: es el defecto que dejó cinco semanas con el mismo saldo`)
    assert.ok(!ini(j).includes('CAJA_TOTAL_DISPONIBLE'),
      `la semana ${j + 1} se vuelve a pegar al saldo declarado: eso rompe la cadena sin dar ningún error`)
  }
})

test('el ancla no cuenta dos veces lo que ya está adentro del saldo declarado, ni pierde lo que pasó después', () => {
  const { filas, meta } = armar()
  const f = en(filas, meta.fila.saldoInicial, meta.cab.col0)
  assert.ok(f.includes('CAJA_FECHA_SALDO+1'), 'las dos ventanas se cortan en el día siguiente al corte')
  assert.ok(f.includes('"REAL"'), 'sólo lo REAL puede ajustar el saldo de hoy: un proyectado vencido no es plata en la cuenta')
  // Lo vivido dentro de la semana se RESTA y lo posterior al corte se SUMA. Sin el primero, el saldo
  // declarado se suma encima de sus propios movimientos; sin el segundo, un corte viejo vacía el cuadro.
  assert.match(f, /^=N\(CAJA_TOTAL_DISPONIBLE\)-\(SUMPRODUCT\(.+\)\)\+\(SUMPRODUCT\(.+\)\)$/)
})

test('la identidad de cada columna: resultado = entra − sale, saldo final = inicial + resultado', () => {
  const { filas, meta } = armar()
  const c = meta.cab.col0 + 3 // la cuarta semana, para no probar sólo el borde
  const L = String.fromCharCode(65 + c)
  assert.equal(en(filas, meta.fila.resultado, c),
    `=N($${L}$9)+N($${L}$10)-N($${L}$11)-N($${L}$12)`)
  assert.equal(en(filas, meta.fila.saldoFinal, c), `=N($${L}$8)+N($${L}$13)`)
})

test('la columna TOTAL suma los flujos y NO suma los saldos: doce stocks sumados no son un stock', () => {
  const { filas, meta } = armar()
  const T = meta.cab.colTotal
  for (const cc of conceptosDe('semana')) {
    const v = en(filas, meta.fila[cc.clave], T)
    if (cc.total) assert.ok(v.startsWith('=SUM($B$') && v.includes(`:$N$${meta.fila[cc.clave]}`), `${cc.rotulo}: ${v}`)
    else assert.equal(v, '', `${cc.rotulo} no se puede totalizar`)
  }
})

test('cero números pegados: toda celda de plata es fórmula', () => {
  const { filas, meta } = armar()
  const pegados = []
  for (const cc of conceptosDe('semana')) {
    for (let c = meta.cab.col0; c <= meta.cab.colTotal; c++) {
      const v = (filas[meta.fila[cc.clave] - 1] || [])[c]
      if (v === undefined || v === '') continue
      if (typeof v === 'number' || !String(v).startsWith('=')) pegados.push(`${cc.rotulo} col ${c + 1}: ${v}`)
    }
  }
  assert.deepEqual(pegados, [], 'un número pegado no se puede auditar y deja de actualizarse en silencio')
  // Y el hero también: las cuatro cifras son fórmula o glosa, ninguna es un número escrito.
  for (const s of meta.hero.slots) {
    const v = en(filas, meta.hero.valor, s)
    assert.ok(v.startsWith('='), `la cifra del hero en la columna ${s + 1} no es fórmula: ${v}`)
  }
})

test('el hero: el mayor pago y el mayor cobro llevan el MISMO filtro de estados que la medida que representan', () => {
  const { filas, meta } = armar()
  const [, , s3, s4] = meta.hero.slots
  for (const s of [s3, s4]) {
    const imp = en(filas, meta.hero.valor, s)
    const quien = en(filas, meta.hero.valor, s + 1)
    for (const e of ESTADOS_PENDIENTES) {
      assert.ok(imp.includes(`="${e}"`), `el importe del hero no filtra ${e}: mostraría un pago YA hecho como si viniera`)
      assert.ok(quien.includes(`="${e}"`), `la contraparte del hero no filtra ${e}: contradice al importe de al lado`)
    }
    assert.ok(!imp.includes('"REAL"'), 'lo que "viene" no puede incluir lo ya movido')
  }
  assert.equal(en(filas, meta.hero.rotulo, s3), 'MAYOR PAGO · PRÓXIMOS 7 DÍAS')
})

test('el hero lee el propio cuadro: el piso sale de la fila de saldo final, no de otro cálculo', () => {
  const { filas, meta } = armar()
  const piso = en(filas, meta.hero.valor, meta.hero.slots[1])
  assert.equal(piso, `=MIN($B$${meta.fila.saldoFinal}:$N$${meta.fila.saldoFinal})`)
  const cuando = en(filas, meta.hero.valor, meta.hero.slots[1] + 1)
  // INDEX con la FILA explícita: sobre un rango de una sola fila, INDEX(rango;n) es "la fila n" y da #REF!.
  assert.ok(cuando.includes(`INDEX($B$${meta.cab.fila}:$N$${meta.cab.fila};1;MATCH(`), cuando)
})

test('es-AR: ninguna fórmula usa la coma como separador de argumentos', () => {
  const { filas } = armar()
  const malas = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (s.startsWith('=') && fueraDeComillas(s).includes(',')) malas.push(`fila ${i + 1} col ${j + 1}`)
  }))
  assert.deepEqual(malas, [], 'una coma de separador en un archivo es_AR hace que Sheets rechace la fórmula entera')
})

test('ninguna fórmula derrama: un ARRAYFORMULA suelto se rompe con #REF! cuando el generador reescribe', () => {
  const { filas } = armar()
  const derraman = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (!s.startsWith('=')) return
    if (/\bARRAYFORMULA\(/.test(s)) derraman.push(`fila ${i + 1} col ${j + 1}: ARRAYFORMULA`)
    if (/^=\s*(FILTER|SORTN|QUERY)\(/.test(s)) derraman.push(`fila ${i + 1} col ${j + 1}: ${s.slice(1, 12)}`)
  }))
  assert.deepEqual(derraman, [])
})

test('todo importe sale del libro o de una celda de la propia vista', () => {
  const { filas } = armar()
  const otras = new Set()
  for (const f of filas) {
    for (const c of f || []) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      for (const m of s.matchAll(/(?:'([^']+)'|\b([A-Za-z_][\w ]*))!/g)) {
        const pest = m[1] ?? m[2]
        if (pest !== '_MOVIMIENTOS') otras.add(pest)
      }
    }
  }
  assert.deepEqual([...otras], [], 'la matriz semanal sólo puede leer el libro de movimientos')
})

test('el patrón de la pestaña se cumple, salvo la única excepción declarada: una matriz no tiene secciones', () => {
  const { filas } = armar()
  // Se audita como se VE: las fórmulas evalúan a un número, así que se reemplazan por uno.
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: FOOTPRINT.semana.cols })
  // La gramática de `patron-pestana` está escrita para pestañas de statement (hero + secciones
  // numeradas). Una matriz ES una sola tabla: numerarla "1 · LA MATRIZ" sería ruido, y el dueño pidió
  // explícitamente que después del cuadro no haya nada más. Se declara acá, no se silencia: si
  // aparece CUALQUIER otro hallazgo, este test se pone rojo.
  assert.deepEqual(malos.map((m) => m.regla), ['sin-secciones'], JSON.stringify(malos))
})

test('el vínculo "hoy" apunta a la columna de la semana corriente, y sin gid no se inventa uno', () => {
  const { meta } = armar()
  assert.equal(vinculoHoy(null, meta), null, 'sin el gid de la pestaña no hay vínculo, no un vínculo a ningún lado')
  const v = vinculoHoy(1234, meta)
  assert.ok(v.startsWith('=HYPERLINK("#gid=1234&range="&ADDRESS('))
  assert.ok(v.includes('TODAY()-WEEKDAY(TODAY();3)'), 'el lunes de hoy se calcula igual que los encabezados')
  assert.ok(v.endsWith(';"📅 hoy")'))
  assert.ok(!v.includes('IFERROR'), 'un cuadro vencido tiene que gritar #N/A, no llevar a una celda cualquiera')
})

test('sin los rangos con nombre de CAJA, el ancla va VACÍA en vez de apuntar a una celda inventada', () => {
  const { filas, meta } = grillaSemanal({ hoy: HOY, refs: {} })
  assert.equal(en(filas, meta.fila.saldoInicial, meta.cab.col0), '')
  assert.equal(en(filas, meta.hero.valor, 0), '')
  assert.match(en(filas, meta.hero.valor, 1), /Falta el saldo declarado/)
})

test('después del saldo final no hay NADA: el dueño pidió no agregar información', () => {
  const { filas, meta } = armar()
  assert.equal(meta.filaFin, meta.fila.saldoFinal)
  assert.equal(filas.length, 14)
})
