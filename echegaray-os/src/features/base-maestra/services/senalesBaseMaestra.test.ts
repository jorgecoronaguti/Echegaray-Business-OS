import test from 'node:test'
import assert from 'node:assert/strict'
import { senalesDeBaseMaestra } from './senalesBaseMaestra.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. EL CARO: que a un jefe de obra se le publique «409 recursos sin precio». `recurso_precio` sólo
//    abre para `ve_economia()`, así que él recibe CERO FILAS sin error y todos los precios se leen
//    en null. Esa cifra lo mandaría a cargar de nuevo 409 precios que están cargados. Una lectura
//    recortada por permiso NO es una ausencia de dato.
// 2. Que una lectura fallida se dibuje como base maestra completa.
// 3. Que un cero ocupe la primera línea de la pantalla para no pedir nada.

const HREFS = {
  sinAnalisis: '/administracion/base-maestra/tareas?c=sin-analisis',
  sinPrecio: '/administracion/base-maestra/recursos?c=sin-precio',
}
const con = (x: Partial<Parameters<typeof senalesDeBaseMaestra>[0]> = {}) =>
  senalesDeBaseMaestra({ tareas: [], recursos: [], economia: true, hrefs: HREFS, ...x })

test('el jefe de obra NO recibe la señal de precios: no los ve, no que falten', () => {
  const sinPrecios = Array.from({ length: 409 }, () => ({ costo_base: null }))
  const suyo = con({ recursos: sinPrecios, economia: false })
  assert.equal(suyo.find((s) => s.clave === 'sin-precio'), undefined)

  // Y a quien sí ve economía, la misma lectura sí le dice los 409.
  const admin = con({ recursos: sinPrecios, economia: true })
  assert.equal(admin.find((s) => s.clave === 'sin-precio')?.numero, 409)
})

test('la señal de análisis NO depende del permiso económico: la composición no es precio', () => {
  const tareas = [{ analisis_id: null }, { analisis_id: 'a1' }]
  for (const economia of [true, false]) {
    assert.equal(con({ tareas, economia }).find((s) => s.clave === 'sin-analisis')?.numero, 1)
  }
})

test('no pude leer SE DIBUJA sin cifra; cero no se dibuja', () => {
  assert.deepEqual(con({ tareas: [{ analisis_id: 'a1' }], recursos: [{ costo_base: 900 }] }), [])

  const sinLeer = con({ tareas: null, recursos: null })
  assert.equal(sinLeer.length, 2)
  assert.deepEqual(sinLeer.map((s) => s.numero), [null, null])
  for (const s of sinLeer) assert.match(s.bloquea, /No pude leer/)
})

test('cada verbo aterriza en el recorte que produjo su número', () => {
  const s = con({ tareas: [{ analisis_id: null }], recursos: [{ costo_base: null }] })
  assert.deepEqual(s.map((x) => x.href), [HREFS.sinAnalisis, HREFS.sinPrecio])
  assert.deepEqual(s.map((x) => x.icono), ['presupuesto', 'compra'])
})

test('el singular y el plural se escriben, no se abrevian con «(s)»', () => {
  const s = con({ tareas: [{ analisis_id: null }], recursos: [{ costo_base: null }] })
  assert.equal(s[0].texto, 'tarea tipo sin análisis')
  assert.equal(s[1].texto, 'recurso sin precio')
})
