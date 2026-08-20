// LA ENTRADA DE ADMINISTRACIÓN, PROBADA SIN BASE Y SIN NAVEGADOR.
//
// Las cuatro reglas que se ejercitan acá son las que se rompen en silencio: nadie ve una excepción,
// la pantalla se dibuja entera, y lo que muestra es falso.
//
//   1. UN CONTADOR QUE NO SE PUDO LEER NO ES CERO. «Proveedores 0» afirma que la empresa no tiene
//      ninguno; lo que pasó fue que la consulta falló.
//   2. UNA SEÑAL DE «0 SIN RESOLVER» NO ES UNA SEÑAL. Encendida siempre, deja de leerse.
//   3. EL ÁMBAR ES PARA LO QUE HAY QUE RESOLVER, no para todo lo que se puede contar. Estar sin
//      asignar entre dos obras es normal y no es trabajo pendiente.
//   4. «HOY» ES EL DÍA DE SAN JUAN, NO EL DEL PROCESO. Vercel corre en UTC, tres horas adelante.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  atencionesDe, cuandoCorto, maestrosDe, senal, terminoSeguro, type Conteos,
} from './entradaService.ts'

const CONTEOS: Conteos = {
  clientes: 9, personas: 17, personasSinAsignar: 2, proveedores: 64, proveedoresSinCuit: 3,
  nombresSinResolver: 79, textosSinImputar: 2, invitacionesSinUsar: null,
}
const de = (p: Partial<Conteos>): Conteos => ({ ...CONTEOS, ...p })
const maestro = (c: Conteos, clave: string) => maestrosDe(c).find((m) => m.clave === clave)!

test('una señal de cero no se escribe: «0 sin resolver» no es una señal', () => {
  assert.equal(senal(0, 'sin resolver', 'sin resolver'), null)
  assert.equal(senal(null, 'sin resolver', 'sin resolver'), null)
  assert.equal(senal(1, 'invitación sin usar', 'invitaciones sin usar'), '1 invitación sin usar')
  assert.equal(senal(4, 'invitación sin usar', 'invitaciones sin usar'), '4 invitaciones sin usar')
})

test('SIN LECTURA NO HAY CONTADOR — nunca un cero inventado', () => {
  // El servicio devuelve `null` cuando la consulta falla. Si esto se convirtiera en 0, la entrada
  // diría «Proveedores 0» sobre una empresa con 64 proveedores cargados.
  const m = maestro(de({ proveedores: null }), 'proveedores')
  assert.equal(m.cuenta, null)
  assert.notEqual(m.cuenta, 0)
})

test('el ámbar se enciende SÓLO donde hay algo que resolver', () => {
  const c = CONTEOS
  assert.equal(maestro(c, 'proveedores').resolver, true, 'proveedores sin CUIT sí hay que resolverlos')
  assert.equal(maestro(c, 'pendientes').resolver, true, 'los textos sin imputar sí hay que resolverlos')
  // Estar sin asignar es un estado normal entre dos obras: se DICE, pero en gris.
  assert.equal(maestro(c, 'personas').resolver, false)
  assert.equal(maestro(c, 'personas').senal, '2 sin asignar')
  assert.equal(maestro(c, 'clientes').senal, null)
})

test('sin nada que resolver, el ámbar se apaga y la señal desaparece', () => {
  const limpio = de({ proveedoresSinCuit: 0, nombresSinResolver: 0, textosSinImputar: 0 })
  for (const m of maestrosDe(limpio)) {
    assert.equal(m.resolver, false, `${m.clave} quedó en ámbar sin nada que resolver`)
  }
  assert.equal(maestro(limpio, 'proveedores').senal, null)
  assert.deepEqual(atencionesDe(limpio), [], 'la columna accionable no fabrica filas con cero')
})

test('«Requiere atención» sólo lista lo que se puede medir, y nunca en rojo si no es crítico', () => {
  const filas = atencionesDe(CONTEOS)
  assert.deepEqual(filas.map((f) => f.clave), ['nombres', 'imputacion', 'sin-cuit'])
  assert.deepEqual(filas.map((f) => f.numero), [79, 2, 3])
  // Rojo = problema real. Ninguna de las tres lo es: son datos que faltan.
  assert.equal(filas.some((f) => f.critico), false)
  // La documentación vencida del mockup NO está: `documentacion_legajo` no tiene vencimiento y una
  // alerta que no mide nada es peor que ninguna.
  assert.equal(filas.some((f) => /vencid/i.test(f.texto)), false)
})

test('una lectura fallida no se cuenta como «nada que resolver»', () => {
  // `null` es «no sé», y no puede producir una fila que diga que hay 0 pendientes ni una que invente
  // un número.
  assert.deepEqual(atencionesDe(de({ nombresSinResolver: null, textosSinImputar: null, proveedoresSinCuit: null })), [])
})

test('el término de búsqueda no puede partir el `or` de PostgREST', () => {
  // Una coma separa condiciones: «SA, S.R.L.» se convertiría en dos filtros y devolvería de más.
  assert.equal(terminoSeguro('CORRALON, S.R.L.'), 'CORRALON  S.R.L.')
  assert.equal(terminoSeguro('  hierro  '), 'hierro')
  assert.equal(terminoSeguro(undefined), '')
  assert.ok(!terminoSeguro('a,b(c)*d').includes(','))
  assert.ok(!terminoSeguro('a,b(c)*d').includes('('))
})

test('«hoy» y «ayer» se calculan en la hora de la empresa, no en la del proceso', () => {
  // El movimiento pasó el 19/08 a las 23:00 de San Juan → 20/08 02:00 UTC.
  // Se mira el 20/08 a las 11:00 de San Juan → 20/08 14:00 UTC.
  // En hora de la empresa fue AYER a las 23:00. Calculado con el reloj UTC del servidor de Vercel
  // diría «hoy 02:00»: día equivocado Y hora equivocada, sin un solo error visible.
  const ahora = new Date('2026-08-20T14:00:00Z')
  assert.equal(cuandoCorto('2026-08-20T02:00:00Z', ahora), 'ayer 23:00')
  assert.equal(cuandoCorto('2026-08-20T13:00:00Z', ahora), 'hoy 10:00')
  // Más viejo que ayer: día y mes, sin año, que es lo que entra en la línea.
  assert.equal(cuandoCorto('2026-08-14T13:00:00Z', ahora), '14/08 10:00')
  assert.equal(cuandoCorto('no es una fecha', ahora), 'sin fecha')
})
