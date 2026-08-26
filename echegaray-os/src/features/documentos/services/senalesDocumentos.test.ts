import test from 'node:test'
import assert from 'node:assert/strict'
import { senalesDeDocumentos, silencioDeVencimientos } from './senalesDocumentos.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Que «nadie cargó ninguna fecha» se dibuje como «ninguno vencido». Es el estado REAL de hoy —
//    847 filas de `documentacion_legajo` sin `fecha_vencimiento`— y las dos frases se leen igual de
//    tranquilas, pero una afirma que se revisó y la otra que nadie está mirando.
// 2. Que un error de lectura publique un 0. Una consulta rechazada dibujaría una pantalla en orden.
// 3. Que la cifra no lleve a sus filas. Un contador sin destino obliga a buscarlas entre 3.128.

const HREFS = { vencidos: '/documentos?vence=vencido', esteMes: '/documentos?vence=mes' }

test('cero vencidos no es una señal: no se dibuja', () => {
  assert.deepEqual(senalesDeDocumentos({ vencidos: 0, venceEsteMes: 0, conFecha: 12 }, HREFS), [])
})

test('sin ninguna fecha cargada la pantalla NO dice que no hay vencidos', () => {
  const sinControl = { vencidos: 0, venceEsteMes: 0, conFecha: 0 }
  assert.deepEqual(senalesDeDocumentos(sinControl, HREFS), [])
  // Y el silencio explica POR QUÉ está callada, que es lo único que la distingue de una al día.
  const texto = silencioDeVencimientos(sinControl)
  assert.match(texto, /todavía no puede avisar/)
  assert.doesNotMatch(texto, /ninguno vencido/i)

  // Con fechas cargadas y nada en riesgo, ahí sí se puede afirmar — y el número lo respalda.
  assert.match(silencioDeVencimientos({ vencidos: 0, venceEsteMes: 0, conFecha: 12 }), /12 documentos con vencimiento controlado/)
})

test('no pude contar SE DIBUJA, sin cifra y diciendo por qué', () => {
  const s = senalesDeDocumentos(null, HREFS)
  assert.equal(s.length, 2)
  assert.deepEqual(s.map((x) => x.numero), [null, null])
  for (const x of s) assert.match(x.bloquea, /No pude contarlos/)
  assert.match(silencioDeVencimientos(null), /No pude contar/)
})

test('el vencido es el único rojo, y cada cifra aterriza en sus filas', () => {
  const s = senalesDeDocumentos({ vencidos: 3, venceEsteMes: 2, conFecha: 40 }, HREFS)
  assert.deepEqual(s.map((x) => [x.clave, x.numero, x.tono, x.href]), [
    ['vencidos', 3, 'neg', HREFS.vencidos],
    ['por-vencer', 2, undefined, HREFS.esteMes],
  ])
})

test('el singular y el plural no se escriben con una «(s)»', () => {
  const s = senalesDeDocumentos({ vencidos: 1, venceEsteMes: 1, conFecha: 9 }, HREFS)
  assert.equal(s[0].texto, 'papel vencido')
  assert.equal(s[1].texto, 'vence este mes')
})
