// LO QUE EL GENERADOR TIENE QUE ACERTAR ANTES DE ESCRIBIR UNA SOLA CELDA.
//
// El contenido de la banda se prueba en `lib/tarjeta-banda.test.mjs`. Acá se prueba lo otro: dónde
// arranca el registro del dueño y qué pasa si no se lo encuentra. Equivocarse en eso no deja una
// pestaña fea: deja la banda escrita ENCIMA de las cuotas que cargó una persona.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ubicarRegistro, ubicarBloqueViejo, ES_BLOQUE_VIEJO, cargadoEnElRegistro } from './tarjeta-pestana.mjs'
import { bandaFilas, datosDeLaBanda } from '../lib/tarjeta-banda.mjs'
import { FILA_HDR } from '../lib/tarjeta-geometria.mjs'

const RESUMEN = {
  tarjeta: 'Visa 3319', numero: '202120', cierre: '2026-08-20', vencimiento: '2026-09-01',
  aDebitarPesos: 2208958.42, aDebitarDolares: 544.99, cuentaDebito: '00000000913836',
  pagoMinimo: 1138130, pagoMinimoVerificado: true, tcCierre: 1497,
  consumosPesos: 1949747.67, consumosDolares: 544.99, cargosPesos: 259210.75,
  cargos: [{ concepto: 'sellos', importe: 10533.61 }], consumos: [],
  cuotasAVencer: [{ mes: '2026-09-01', importe: 1546611.33 }],
  proximoCierre: '2026-09-24', proximoVencimiento: '2026-10-05',
}

// ═══ EL REGISTRO SE UBICA POR EL DATO, NO POR UN RÓTULO QUE ALGUIEN PUEDE BORRAR ═══

test('el registro se encuentra por la fecha en A y el importe en E', () => {
  const filas = [
    ['Tarjeta de crédito'], ['subtítulo'], [], ['CUÁNTO HAY QUE PAGAR'],
    ['Fecha de Compra', 'fecha gral', 'Proveedor', 'Cuota', 'Monto'],
    ['16/1/2026', 'enero 26', 'Modica SA', 6, '$355.413,39'],
  ]
  assert.deepEqual(ubicarRegistro(filas), { primera: 6, hdr: 5 })
})

test('sin registro devuelve null, y el script aborta en vez de escribir a ciegas', () => {
  // Sin ancla, ajustar el alto de la banda deja la pestaña con dos bandas superpuestas.
  assert.equal(ubicarRegistro([['Tarjeta de crédito'], ['subtítulo']]), null)
  assert.equal(ubicarRegistro([]), null)
})

test('una fila con fecha pero sin importe NO es el registro', () => {
  // La banda tiene fechas en la columna C; si alcanzara con una fecha, el generador creería que el
  // registro empieza adentro de su propia banda.
  assert.equal(ubicarRegistro([['16/1/2026', '', '', '', '']]), null)
})

// ═══ EL RESIDUO DE UN GENERADOR VIEJO SE RECONOCE POR LO QUE DICE ═══

test('el bloque viejo se reconoce con o sin su número', () => {
  assert.ok(ES_BLOQUE_VIEJO.test('CONTROL — la tarjeta contra el banco'))
  assert.ok(ES_BLOQUE_VIEJO.test('2 · CONTROL — la tarjeta contra el banco'))
  assert.ok(ES_BLOQUE_VIEJO.test('LA TARJETA COMO DISPONIBILIDAD'))
  assert.equal(ubicarBloqueViejo([['x'], ['CONTROL — la tarjeta contra el banco']], 0), 2)
  assert.equal(ubicarBloqueViejo([['x'], ['otra cosa']], 0), null)
})

test('la banda NUEVA no se confunde con el bloque que tiene que borrar', () => {
  // Si un rótulo de la banda matcheara, el generador se borraría a sí mismo en la corrida siguiente.
  const { filas } = bandaFilas(FILA_HDR, datosDeLaBanda([RESUMEN], [], { hoy: '2026-08-28' }))
  assert.equal(ubicarBloqueViejo(filas, 0), null)
})

// ═══ LA PREVISUALIZACIÓN RECALCULA LA MISMA CUENTA QUE VA A HACER EL SHEET ═══

test('lo cargado en el registro para el mes del vencimiento se mide por la columna H', () => {
  // Es la MISMA columna que lee el cash flow (colFecha 'H'). Medir por otra haría que la brecha
  // compare contra algo que el cash flow no proyecta, y el control diría cualquier cosa.
  const filas = [
    ['banda'], [], ['Fecha de Compra', '', '', '', 'Monto', '', '', 'fecha de pago'],
    ['16/1/2026', '', 'Modica', 8, '$355.413,39', '', '', '2/9/2026'],
    ['6/7/2026', '', 'Pinturerías', 2, '$263.813,91', '', '', '2/9/2026'],
    ['5/8/2026', '', 'Grúas', 1, '$854.068,60', '', '', '2/10/2026'],
  ]
  assert.equal(cargadoEnElRegistro(filas, 2, '2026-09'), 619227.30)
  assert.equal(cargadoEnElRegistro(filas, 2, '2026-10'), 854068.60)
  assert.equal(cargadoEnElRegistro(filas, 2, '2026-11'), 0)
})

test('una fila del registro sin fecha de pago no se cuenta ni rompe la suma', () => {
  const filas = [['Fecha de Compra'], ['16/1/2026', '', '', '', '$100,00', '', '', '']]
  assert.equal(cargadoEnElRegistro(filas, 0, '2026-09'), 0)
})

// ═══ LA PUERTA DEL REDISEÑO ═══

test('--rediseniar apaga la comparación de rótulos y NADA más', () => {
  const src = readFileSync(new URL('./tarjeta-pestana.mjs', import.meta.url), 'utf8')
  const i = src.indexOf('const REDISENAR')
  const j = src.indexOf('if (bandaActual !== BANDA)')
  const tramo = src.slice(i, j)
  assert.match(tramo, /autoRespetarReescritura/, 'la bandera tiene que gobernar esa comparación y no otra')
  // La firma y el candado corren ARRIBA de la bandera: un rediseño autorizado no puede pasar por
  // encima de una pestaña que el dueño reescribió a mano.
  assert.ok(src.indexOf('firmaGuardia') < i, 'la firma tiene que seguir corriendo antes')
  assert.doesNotMatch(tramo, /firmaGuardia|clearValues/)
})

test('sin la bandera, la comparación de rótulos sigue corriendo', () => {
  const src = readFileSync(new URL('./tarjeta-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /} else if \(\(await autoRespetarReescritura\(/)
})

test('el generador aborta si la base no tiene ningún resumen', () => {
  // Antes los números vivían en una constante del código y "siempre había". Ahora vienen de Postgres
  // y puede no haber ninguno: dibujar la pestaña con ceros diría "no hay que pagar nada".
  const src = readFileSync(new URL('./tarjeta-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /if \(!resumenes\.length\) \{[\s\S]*process\.exit\(1\)/)
  assert.match(src, /importar-tarjeta\.mjs/)
})
