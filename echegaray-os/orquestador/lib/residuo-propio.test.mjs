import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formaDeGenerador, celdaEsPropia, filaTieneAncla, residuosPropios } from './residuo-propio.mjs'
import { preservarNoVacias, protegerBorrado, TOPE_VACIADO, MIA_PROBADA } from './no-borrar.mjs'

// LAS FILAS SON LAS DEL SHEET REAL, leídas el 13/08/2026 de 'Proveedores' con render FORMULA.
// 229-230 son el fragmento huérfano; 179-180 el bloque vivo que contradicen.
const FILA_229 = [
  '  · cargados en Compras, por N° de comprobante', '456', '179091614.15000004', '', '', '', '', '',
  'Conciliación del OS al 2026-08-04 — no es una fórmula: el cruce normaliza números escritos como fecha',
]
const FILA_230 = ['  · cargados SIN su N° de comprobante', '', '', '', '', '', '', '', '']
// El registro de rótulos REAL de la pestaña (`sheet_rotulos`): tiene el rótulo de la 229 y NO tiene
// el de la 230 ni el texto de conciliación, que lleva la fecha adentro y cambia todos los días.
const MIOS = new Set(['· cargados en Compras, por N° de comprobante', 'Comprobantes de compra (neto de notas)'])

test('el fragmento huérfano se prueba propio celda por celda, y la nota con fecha se conserva', () => {
  const { vaciables, conservadas } = residuosPropios([FILA_229], MIOS)
  assert.ok(vaciables.has('0:0'), 'el rótulo está en el registro: es mío')
  assert.ok(vaciables.has('0:1'), 'el "456" tiene forma de dato generado')
  assert.ok(vaciables.has('0:2'), 'el importe $179.091.614 tiene forma de dato generado')
  assert.equal(vaciables.has('0:8'), false, 'el texto de conciliación NO se puede probar mío: se conserva')
  assert.deepEqual(conservadas.map((c) => c.col), [8])
})

test('una fila sin rótulo mío ni marca de generador NO se toca, aunque cada celda parezca generada', () => {
  // El caso que hay que no romper: una tablita del dueño debajo del bloque. Todos los valores tienen
  // forma de dato (importes, fechas, un CUIT) y ninguno es rótulo mío: sin ancla, la fila es suya.
  const suya = ['Pagos que hice yo', '30-71037035-0', '12/07/2026', '$1.500.000']
  assert.equal(filaTieneAncla(suya, MIOS), false)
  const { vaciables } = residuosPropios([suya], MIOS)
  assert.equal(vaciables.size, 0)
})

test('sin registro de rótulos la marca tipográfica sigue anclando, y un número solo NUNCA ancla', () => {
  assert.equal(filaTieneAncla(['  · cargados SIN su N° de comprobante'], new Set()), true)
  assert.equal(filaTieneAncla(['456', '179091614.15', '12/07/2026'], new Set()), false)
  // Un guion largo lo tipea una persona al anotar: no alcanza para reclamar la fila.
  assert.equal(filaTieneAncla(['llamarlo el lunes — urgente'], new Set()), false)
})

test('formaDeGenerador no reclama un texto libre del dueño', () => {
  for (const propio of ['$1.234,56', '31/07/2026', '30-71037035-0', '0004-00006554', '=SUM(A1:A2)', '⚠ revisar']) {
    assert.equal(formaDeGenerador(propio), true, `"${propio}" lo escribe el generador`)
  }
  for (const suyo of ['llamar a Hormiserv', 'ojo con esta factura', 'Conciliación del OS al 2026-08-04 — el cruce']) {
    assert.equal(formaDeGenerador(suyo), false, `"${suyo}" no se puede probar del generador`)
  }
  assert.equal(celdaEsPropia('', MIOS), false, 'una celda vacía no es de nadie')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GUARDA: sin el pedido, nada cambia. Con el pedido, se vacía SÓLO lo probado.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('SIN vaciarPropio, no-borrar se comporta exactamente como antes: no vacía nada', () => {
  const actual = [FILA_229]
  const nuevo = [FILA_229.map(() => '')]
  const r = preservarNoVacias(actual, nuevo)
  assert.equal(r.vaciadas.length, 0)
  assert.equal(r.preservadas.length, 4, 'las 4 celdas con contenido se conservan')
  assert.deepEqual(r.values[0], FILA_229, 'el destino queda intacto')
})

test('CON el pedido verificado, se vacía el residuo y sobrevive la nota del costado', async () => {
  const cliente = { readSheetValues: async () => [FILA_229, FILA_230] }
  const data = [{ range: "'Proveedores'!A229", values: [FILA_229.map(() => ''), FILA_230.map(() => '')] }]
  const nb = await protegerBorrado(cliente, 'ID', data, { vaciarPropio: { mios: [...MIOS] } })
  const [f229, f230] = nb.data[0].values
  assert.equal(f229[0], '', 'el rótulo residual se limpia')
  assert.equal(f229[1], '', 'el 456 se limpia')
  assert.equal(f229[2], '', 'los $179.091.614 que contradicen al bloque vivo se limpian')
  assert.equal(f229[8], FILA_229[8], 'la nota que no se puede probar mía SIGUE AHÍ')
  assert.equal(f230[0], '', 'la fila 230 se limpia por su marca tipográfica')
  assert.equal(nb.vaciadas, 4)
  assert.equal(nb.preservadas, 1)
  assert.ok(nb.detalleVaciadas.some((d) => d.includes('A229')), `dice qué vació: ${nb.detalleVaciadas}`)
})

test('el pedido NO alcanza para vaciar lo que la guarda no puede probar', async () => {
  const suya = ['Pagos que hice yo', '30-71037035-0', '12/07/2026', '$1.500.000']
  const cliente = { readSheetValues: async () => [suya] }
  const data = [{ range: "'Proveedores'!A300", values: [suya.map(() => '')] }]
  const nb = await protegerBorrado(cliente, 'ID', data, { vaciarPropio: { mios: [...MIOS] } })
  assert.equal(nb.vaciadas, 0)
  assert.deepEqual(nb.data[0].values[0], suya, 'la fila del dueño vuelve entera')
})

test('un vaciado masivo se DESCARTA entero: eso no es un layout viejo, es un generador roto', async () => {
  const fila = ['  · cargados en Compras, por N° de comprobante', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const muchas = Array.from({ length: 40 }, () => fila)          // 40 × 10 = 400 celdas > TOPE_VACIADO
  assert.ok(muchas.length * fila.length > TOPE_VACIADO)
  const cliente = { readSheetValues: async () => muchas }
  const data = [{ range: "'Proveedores'!A214", values: muchas.map((f) => f.map(() => '')) }]
  const nb = await protegerBorrado(cliente, 'ID', data, { vaciarPropio: { mios: [...MIOS] } })
  assert.equal(nb.data.length, 0, 'no se escribe nada')
  assert.deepEqual(nb.descartados, ["'Proveedores'!A214"])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS DOS VÍAS DE PRUEBA CONVIVEN. Son evidencias distintas y ninguna reemplaza a la otra:
//   · la HUELLA (`MIA_PROBADA`) → "sellé esta celda y sigue con la forma que le dejé". Manda siempre.
//   · `vaciarPropio`            → "tiene forma de dato mío o es un rótulo de mi registro". Cubre la
//     región donde la huella no alinea — Proveedores se corre ±50 filas y la huella tolera ±5.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('las dos vías vacían en la MISMA escritura, y cada una se cuenta por separado', async () => {
  // A: la huella la probó (llega con el centinela). B: sólo la prueba por forma/registro. C: nada.
  const actual = [['residuo con huella', '  · cargados en Compras, por N° de comprobante', 'nota mía a mano']]
  const nuevo = [[MIA_PROBADA, '', '']]
  const cliente = { readSheetValues: async () => actual }
  const data = [{ range: "'Proveedores'!A229", values: nuevo }]
  const nb = await protegerBorrado(cliente, 'ID', data, { vaciarPropio: { mios: [...MIOS] } })
  assert.deepEqual(nb.data[0].values[0], ['', '', 'nota mía a mano'])
  assert.equal(nb.limpiadas, 1, 'la huella limpió una')
  assert.equal(nb.vaciadas, 1, 'la prueba por forma vació otra')
  assert.equal(nb.preservadas, 1, 'lo que ninguna de las dos pudo probar se conserva')
  // Los tres mensajes son distintos a propósito: si mañana algo se borró de más, cuál de las dos
  // decidió es lo que dice dónde mirar.
  assert.ok(nb.detalleLimpiadas[0].includes('A229'))
  assert.ok(nb.detalleVaciadas[0].includes('B229'))
  assert.ok(nb.detalle[0].includes('C229'))
})

test('cuando las dos podrían decidir, manda la huella: el centinela se resuelve primero', () => {
  const actual = [['  · cargados en Compras, por N° de comprobante']]
  const { vaciables } = residuosPropios(actual, MIOS)
  assert.ok(vaciables.has('0:0'), 'la segunda vía también la reclamaría')
  const r = preservarNoVacias(actual, [[MIA_PROBADA]], { vaciables })
  assert.equal(r.limpiadas.length, 1, 'la contabiliza la huella, que es la prueba más fuerte')
  assert.equal(r.vaciadas.length, 0, 'y NO se cuenta dos veces')
})

test('la huella sigue limpiando aunque no haya pedido de la segunda vía (frente de huella intacto)', () => {
  const r = preservarNoVacias([['artefacto del OS']], [[MIA_PROBADA]])
  assert.deepEqual(r.values[0], [''])
  assert.equal(r.limpiadas.length, 1)
  assert.equal(r.vaciadas.length, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CABLEADO: sin esto el arreglo existe en la biblioteca y la pestaña sigue igual.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('los tres avisos de la guarda son distintos: sin prueba nunca se dice "tuya"', () => {
  const src = readFileSync(new URL('./google.mjs', import.meta.url).pathname, 'utf8')
  const conservadas = /const avisoConservadas = [^\n]*\n[^\n]*\n[^\n]*/.exec(src)?.[0] ?? ''
  assert.doesNotMatch(conservadas, /tuya|tuyo/i,
    'la guarda ciega no sabe de quién es la celda: decir "tuya" hizo que nadie mirara un artefacto del propio OS')
  assert.match(conservadas, /no puedo probar de quién son/)
  assert.match(src, /const avisoLimpiadas = [^\n]*la huella probó mías/)
  assert.match(src, /const avisoVaciadas = /)
  for (const v of ['avisoConservadas(nb)', 'avisoLimpiadas(nb)', 'avisoVaciadas(nb)']) {
    assert.ok(src.includes(v), `batchUpdateValues tiene que loguear ${v}`)
  }
})

test('el barrido de cola de Proveedores pide el vaciado verificado, y mira la cola CON TECHO', () => {
  const src = readFileSync(new URL('../scripts/proveedores-materiales-pestana.mjs', import.meta.url).pathname, 'utf8')
  const cola = src.slice(src.indexOf('LA COLA DE UN DISEÑO ANTERIOR MÁS LARGO'))
  // El pedido viaja con el registro de rótulos y, desde el 14/08, con su tope por rango: 200 es el
  // tamaño de un residuo chico y acá el residuo son N capas — con el tope global el rango se descarta
  // entero y no se limpia una sola celda. Ver TOPE_VACIADO_MAX en no-borrar.mjs.
  assert.match(cola, /vaciarPropio:\s*\{\s*mios(,\s*tope:\s*TOPE_RESIDUO)?\s*\}/,
    'sin el pedido, `no-borrar` revierte la limpieza celda por celda y la cola es inmortal')
  assert.match(cola, /MAX_COLA/,
    'la cola se lee con techo: rellenar a ciegas hasta el borde de la hoja ya borró 14 fechas del dueño')
  assert.doesNotMatch(cola, /readSheetValues\([^)]*A\$\{filaFin \+ 1\}:\$\{letra\(anchoLeer - 1\)\}`/,
    'la lectura de la cola sin fila final es la que abría el barrido hasta el fin de la pestaña')
})

test('un espejo _RAW sigue pasando derecho, con o sin pedido', async () => {
  const cliente = { readSheetValues: async () => { throw new Error('no debería releerse') } }
  const data = [{ range: '_ARCA_RAW!A1', values: [['', '']] }]
  const nb = await protegerBorrado(cliente, 'ID', data, { vaciarPropio: { mios: [] } })
  assert.deepEqual(nb.data, data)
})
