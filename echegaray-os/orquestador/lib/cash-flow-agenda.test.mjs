// LA AGENDA DIARIA — lo que este archivo impide que vuelva a pasar.
//
// Cada test de acá nombra un defecto concreto que la vista podría tener sin dar un solo error visible:
// una cadena de saldos rota (las cinco semanas de agosto arrancando con el mismo saldo, un desvío de
// $84M), un número pegado donde tiene que haber fórmula, una fórmula con coma de separador en un
// archivo es-AR (que Sheets rechaza entera), una fila con importes y sin rótulo, o una fórmula que
// derrama sobre las celdas de abajo y se rompe con #REF! en la corrida siguiente.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaAgenda, diasDeLaAgenda, semanasSiguientes, DIAS_AGENDA } from './cash-flow-agenda.mjs'
import { auditarPatron } from './patron-pestana.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5)) // miércoles 5 de agosto de 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const armar = (opts = {}) => grillaAgenda({ hoy: HOY, refs: REFS, ...opts })

/** El texto de una fórmula sin lo que va entre comillas: los patrones de número llevan comas legítimas. */
const fueraDeComillas = (s) => String(s).replace(/"[^"]*"/g, '""')

test('los 14 días son consecutivos y arrancan hoy: la agenda no puede saltearse un día', () => {
  const dias = diasDeLaAgenda(HOY)
  assert.equal(dias.length, DIAS_AGENDA)
  assert.equal(dias[0].getTime(), HOY.getTime())
  for (let i = 1; i < dias.length; i++) {
    assert.equal(dias[i].getTime() - dias[i - 1].getTime(), 86400000, `entre el día ${i} y el ${i + 1} hay un salto`)
  }
})

test('las semanas del resumen arrancan DESPUÉS del último día abierto: nada se cuenta dos veces', () => {
  const dias = diasDeLaAgenda(HOY)
  const finAgenda = dias[dias.length - 1].getTime() + 86400000
  const semanas = semanasSiguientes(HOY)
  assert.ok(semanas.length > 0)
  assert.ok(semanas[0].getTime() >= finAgenda,
    'el primer lunes del resumen pisa días que ya tienen su bloque: esos movimientos se contarían dos veces')
})

test('la cadena de saldos: cada día arranca en el cierre del anterior, y sólo el primero ancla en CAJA', () => {
  const { filas, meta } = armar()
  const inicio = (b) => String(filas[b.filaInicio - 1][1])
  assert.ok(inicio(meta.dias[0]).includes('CAJA_TOTAL_DISPONIBLE'), 'el primer día tiene que anclar en el saldo declarado')
  for (let i = 1; i < meta.dias.length; i++) {
    const esperado = `=N($B$${meta.dias[i - 1].filaCierre})`
    assert.equal(inicio(meta.dias[i]), esperado,
      `el día ${i + 1} no encadena con el cierre del anterior: es el defecto que dejó cinco semanas con el mismo saldo`)
    assert.ok(!inicio(meta.dias[i]).includes('CAJA_TOTAL_DISPONIBLE'),
      `el día ${i + 1} vuelve a pegarse al saldo declarado: eso rompe la cadena sin dar ningún error`)
  }
})

test('el ancla no cuenta dos veces lo que ya está adentro del saldo declarado', () => {
  const { filas, meta } = armar()
  const f = String(filas[meta.dias[0].filaInicio - 1][1])
  assert.ok(f.includes('CAJA_FECHA_SALDO+1'),
    'la puesta al día arranca DESPUÉS del corte, o los movimientos del día del corte se suman dos veces')
  assert.ok(f.includes("\"REAL\""), 'sólo lo REAL puede sumarse al saldo de hoy: un proyectado vencido no es plata en la cuenta')
})

test('el saldo al cierre es la identidad del bloque: inicial más lo que entra menos lo que sale', () => {
  const { filas, meta } = armar()
  const b = meta.dias[3]
  const cierre = String(filas[b.filaCierre - 1][1])
  assert.equal(cierre, `=N($B$${b.filaInicio})+N($B$${b.filasMedida[0]})+N($B$${b.filasMedida[1]})-N($B$${b.filasMedida[2]})-N($B$${b.filasMedida[3]})`)
})

test('cero números pegados: toda celda de plata es fórmula o está vacía', () => {
  const { filas } = armar()
  const pegados = []
  filas.forEach((f, i) => {
    const v = (f || [])[1]
    if (v === undefined || v === null || v === '') return
    if (typeof v === 'number') pegados.push(`fila ${i + 1}: ${v}`)
    else if (!String(v).startsWith('=') && /[0-9]/.test(String(v))) pegados.push(`fila ${i + 1}: ${v}`)
  })
  assert.deepEqual(pegados, [], 'un número pegado en la columna de importes no se puede auditar y deja de actualizarse en silencio')
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
        if (pest !== '_MOVIMIENTOS' && pest !== '_BANCO_RAW' && pest !== 'Compras') otras.add(pest)
      }
    }
  }
  assert.deepEqual([...otras], [],
    'la agenda sólo puede leer el libro (y los módulos de costo financiero, que leen _BANCO_RAW/Compras)')
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

test('la maquinaria no deja filas mudas: ninguna fila tiene números sin decir qué son', () => {
  const { filas } = armar()
  // Se audita como se VE: las fórmulas evalúan a un número, así que se reemplazan por uno.
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: 3 }).filter((m) => m.regla === 'fila-sin-concepto')
  assert.deepEqual(malos, [], 'una fila con importes en columnas ocultas y la columna A vacía es lo que el auditor marca')
})

test('el patrón de la pestaña: título en oración, subtítulo, y secciones numeradas y corridas', () => {
  const { filas } = armar()
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: 3 })
    .filter((m) => ['sin-titulo', 'titulo-versalita', 'sin-subtitulo', 'seccion-desordenada', 'seccion-repetida', 'sin-secciones'].includes(m.regla))
  assert.deepEqual(malos, [])
})

test('el costo financiero va declarado aparte, nunca escondido adentro de un día', () => {
  const { filas, meta } = armar()
  assert.equal(meta.costoFinanciero.length, 3)
  const rotulos = meta.costoFinanciero.map((f) => String(filas[f - 1][0]))
  assert.ok(rotulos.some((r) => /descubierto/i.test(r)))
  assert.ok(rotulos.some((r) => /comisiones/i.test(r)))
  assert.ok(rotulos.some((r) => /impuesto al cheque/i.test(r)))
  for (const d of meta.dias) {
    const cierre = String(filas[d.filaCierre - 1][1])
    for (const f of meta.costoFinanciero) {
      assert.ok(!cierre.includes(`$B$${f}`), 'un costo modelado se coló en el saldo de un día')
    }
  }
})

test('sin rango con nombre de CAJA, la vista lo DICE en vez de inventar una celda', () => {
  const { filas, meta } = grillaAgenda({ hoy: HOY, refs: {} })
  assert.equal(filas[meta.dias[0].filaInicio - 1][1], '', 'sin ancla, el saldo inicial va vacío')
  assert.match(String(filas[meta.hero - 1][2]), /Falta el saldo declarado/)
})
