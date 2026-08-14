import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bloqueControlArca, ALTO_BLOQUE, comprasDevengado, DIR, C, DESDE, HASTA, FILA_BLOQUE, MONTOS_BLOQUE,
} from './control-arca-bloque.mjs'

const armar = (rubros = ['Materiales Civil']) => bloqueControlArca({ titulo: '9 · RESPALDO FISCAL', rubros, fila0: 50 })

test('el bloque declara su alto real — una fila de más corre las fórmulas de abajo', () => {
  assert.equal(armar().length, ALTO_BLOQUE)
})

test('NI UN SOLO IMPORTE ESCRITO: toda celda de la columna B es fórmula', () => {
  for (const fila of armar()) {
    if (fila.length < 2) continue
    assert.equal(typeof fila[1], 'string')
    assert.ok(fila[1].startsWith('='), `la celda "${fila[0]}" no es una fórmula: ${fila[1]}`)
  }
})

test('EL BLOQUE NO MUESTRA EL TOTAL DEL LIBRO EN UNA VISTA PARCIAL', () => {
  // EL DEFECTO (04/08, visto ya escrito en el Sheet real). El bloque ponía en Recurrentes:
  //   "ARCA · libro de compras, neto de notas de crédito   $209.231.271"
  //   "Compras · lo de esta pestaña, por fecha de FACTURA    $5.638.835"
  //   "⇒ Diferencia agregada                              -$203.592.436"
  // Comparaba TODAS las compras del año contra los servicios recurrentes. La diferencia no era un
  // hallazgo: era la definición de que los dos universos no son el mismo.
  const texto = armar().map((f) => String(f[1] ?? '')).join(' ')
  assert.doesNotMatch(texto, /SUMPRODUCT\(\(_ARCA_RAW!\$B\$4:\$B="Compras"\)\*IF/,
    'el total del libro entero no puede aparecer en una vista de un solo rubro')
  const rotulos = armar().map((f) => String(f[0]))
  assert.equal(rotulos.some((r) => r.includes('Diferencia agregada')), false,
    'no puede haber una "diferencia agregada" entre universos distintos')
})

test('LOS TRES NÚMEROS SON PARTICIONES DEL MISMO CONJUNTO: respaldado + sin respaldo = lo que lista', () => {
  const filas = armar()
  const lista = filas.find((f) => String(f[0]).startsWith('Lo que esta pestaña lista'))
  const con = filas.find((f) => String(f[0]).includes('con su comprobante'))
  const sin = filas.find((f) => String(f[0]).includes('sin comprobante en el libro —'))
  assert.ok(lista && con && sin)
  // "con" se despeja de los otros dos: la identidad es exacta por construcción y no puede dejar un
  // residuo al que haya que inventarle una causa.
  assert.equal(con[1], '=B53-B55')
  assert.match(lista[1], /SUMIFS\(Compras!\$O\$4:\$O/)
  assert.match(sin[1], new RegExp(DIR.comprasSinArca))
})

test('NINGÚN RESIDUO LLEVA CAUSA INVENTADA', () => {
  // EL DEFECTO: la línea "· El resto — facturas cargadas por un IMPORTE distinto al que ARCA
  // registró  −$212.255.479". Es una INFERENCIA presentada como HECHO, sobre comprobantes que nunca
  // se identificaron uno por uno. Un número así hace desconfiar del archivo entero.
  const rotulos = armar().map((f) => String(f[0])).join(' | ')
  assert.doesNotMatch(rotulos, /IMPORTE distinto/, 'no se le pone causa a un residuo sin identificar')
  assert.doesNotMatch(rotulos, /El resto/)
})

test('LA COBERTURA SE MUESTRA COMO PROPORCIÓN, no sólo como monto', () => {
  const cob = armar().find((f) => String(f[0]).includes('Cobertura fiscal'))
  assert.ok(cob, 'la línea de cobertura existe')
  assert.equal(cob[1], '=IF(B53=0;"";B54/B53)')
})

test('EL NÚMERO GLOBAL VA REFERENCIADO POR NOMBRE, NO RECALCULADO', () => {
  // Recalcularlo acá daba $13.090.051 contra los $13,8M de ARCA_FALTAN_MONTO que publica Proveedores:
  // dos cifras parecidas, con nombres parecidos, respondiendo preguntas distintas.
  const g = armar().find((f) => String(f[0]).includes('ARCA facturó y Compras NO lo tiene'))
  assert.ok(g, 'la línea global existe')
  assert.equal(g[1], '=ARCA_FALTAN_MONTO')
  assert.match(String(g[0]), /Compras ENTERA, no de esta pestaña/, 'y dice de qué universo es')
})

test('LO SIN RESPALDO NO SE PRESENTA COMO ERROR mientras la cifra esté inflada', () => {
  const sin = armar().find((f) => String(f[0]).includes('sin comprobante en el libro —'))
  assert.match(String(sin[0]), /NO es error sin más/)
  const veredicto = String(armar().at(-1)[0])
  // El ✗ está reservado para lo inequívoco. Marcar en rojo una cifra que se sabe inflada entrena a
  // ignorar el control — que es justo lo que pasó con los −$212M.
  assert.doesNotMatch(veredicto, /"✗/, 'sin respaldo no lleva ✗')
  assert.match(veredicto, /ⓘ /)
  assert.match(veredicto, /inflada/, 'y el límite se declara en la propia pestaña')
})

test('LA VENTANA ES DEVENGADA: compara por fecha de FACTURA (col C), nunca por fecha de caja (col AD)', () => {
  const f = comprasDevengado(['Materiales Civil'])
  assert.match(f, /Compras!\$C\$4:\$C/)
  assert.doesNotMatch(f, /Compras!\$AD\$4:\$AD/, 'la fecha de caja no puede entrar en un control contra ARCA')
})

test('la ventana sale de _ARCA_RAW y no está escrita a mano — se estira sola al replicar un mes', () => {
  assert.match(DESDE, /_ARCA_RAW/)
  assert.match(HASTA, /_ARCA_RAW/)
  assert.doesNotMatch(armar().flat().join(' '), /2026-0\d\b/, 'ningún período literal en el bloque')
})

test('EL VEREDICTO NO SE PONE VERDE SIN FUENTE', () => {
  const v = String(armar().at(-1)[0])
  assert.match(v, /NO PUEDO VERIFICAR/)
  assert.match(v, /IF\(NOT\(COUNTIFS/, 'lo primero que evalúa es si la fuente llegó')
})

test('las fórmulas usan el separador es_AR (;) y no la coma', () => {
  for (const fila of armar()) {
    for (const celda of fila) {
      if (typeof celda !== 'string' || !celda.startsWith('=')) continue
      assert.doesNotMatch(celda, /SUMIFS\([^)]*,/, `coma como separador en: ${celda.slice(0, 80)}`)
    }
  }
})

test('un universo de varios rubros suma todos — Materiales cubre Civil y Mantenimiento', () => {
  const f = comprasDevengado(['Materiales Civil', 'Materiales Mantenimiento'])
  assert.match(f, /"Materiales Civil"/)
  assert.match(f, /"Materiales Mantenimiento"/)
  assert.equal(f.split('SUMIFS').length - 1, 2)
})

test('el detalle accionable se remite a la pestaña que lo tiene', () => {
  assert.equal(C, '_CRUCE_ARCA')
  assert.match(String(armar().at(-1)[0]), /_CRUCE_ARCA/)
})

test('la bajada avisa que NO compara totales — es lo que confundió al lector', () => {
  assert.match(String(armar()[1][0]), /No compara totales/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL "$1" DE Materiales!B52 — UNA FRACCIÓN DIBUJADA COMO PLATA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La cobertura fiscal es una FRACCIÓN (0,6614). Con el formato moneda que hereda la columna B, se
// redondea a pesos y se dibuja "$1": el número correcto, ilegible. Estructura y Recurrentes lo
// formateaban bien, cada una con el desplazamiento tipeado a mano — tres copias del mismo número.
// Estos tests atan los desplazamientos a los RÓTULOS que emite el bloque: reordenar una fila los
// pone en rojo antes de que nadie vea un "$1" en la pantalla.

test('FILA_BLOQUE apunta a la fila que dice: la cobertura, los montos y el veredicto', () => {
  const filas = armar()
  assert.match(filas[FILA_BLOQUE.cobertura][0], /^⇒ Cobertura fiscal/)
  assert.match(filas[FILA_BLOQUE.universo][0], /^Lo que esta pestaña lista/)
  assert.match(filas[FILA_BLOQUE.conRespaldo][0], /con su comprobante/)
  assert.match(filas[FILA_BLOQUE.sinRespaldo][0], /sin comprobante/)
  assert.match(filas[FILA_BLOQUE.global][0], /ARCA facturó y Compras NO lo tiene/)
  assert.equal(filas[FILA_BLOQUE.veredicto].length, 1, 'el veredicto es una sola celda de texto')
  assert.equal(Object.keys(FILA_BLOQUE).length, ALTO_BLOQUE, 'hay una fila del bloque sin nombre')
})

test('la cobertura NO es un importe: es la razón entre dos, y va fuera del rango de montos', () => {
  // Si algún día entra en el rango de montos, se vuelve a dibujar "$1".
  assert.ok(FILA_BLOQUE.cobertura >= MONTOS_BLOQUE.hasta,
    'la fila de cobertura cae dentro del rango que se pinta como moneda: ese es el defecto de Materiales!B52')
  for (let i = MONTOS_BLOQUE.desde; i < MONTOS_BLOQUE.hasta; i++) {
    assert.match(armar()[i][1], /^=/, 'toda fila del rango de montos tiene que ser una fórmula de importe')
  }
})

test('toda pestaña que inserta el bloque declara el formato de su cobertura', () => {
  // EL DEFECTO, TAL CUAL PASÓ: `Materiales` insertaba el bloque y NO lo formateaba. Las otras dos sí,
  // así que el "$1" apareció en una sola de las tres y nadie lo relacionó con el bloque compartido.
  // Un consumidor nuevo que se olvide del formato hereda la moneda de la columna y repite el defecto.
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
  const consumidores = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .filter((f) => /\bbloqueControlArca\b/.test(readFileSync(join(dir, f), 'utf8')))
  assert.ok(consumidores.length >= 3, `esperaba las tres pestañas del bloque y encontré ${consumidores.length}`)
  for (const f of consumidores) {
    const fuente = readFileSync(join(dir, f), 'utf8')
    assert.match(fuente, /FILA_BLOQUE\.cobertura/,
      `${f} inserta el bloque de ARCA y no declara el formato de la fila de cobertura: se va a dibujar "$1"`)
    assert.doesNotMatch(fuente, /g\.arca0 \+ \d/,
      `${f} todavía tipea a mano un desplazamiento del bloque: reordenar una fila lo desincroniza en silencio`)
  }
})
