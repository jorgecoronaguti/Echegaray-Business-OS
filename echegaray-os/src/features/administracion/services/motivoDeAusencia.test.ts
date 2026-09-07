import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esMotivo, etiquetaDeMotivo, motivosDeDiaNoTrabajado, tipoDeMotivo,
} from './motivoDeAusencia.ts'

test('EL CATÁLOGO ES EL QUE YA EXISTE, no una lista nueva escrita en TypeScript', () => {
  // El defecto que atrapa: escribir acá los motivos «a mano». El bot de Mattermost usa
  // `orquestador/lib/asistencia-motivos.mjs` desde julio; una segunda lista discrepa el día que
  // alguien agrega un motivo en una sola de las dos, y nadie lo ve hasta que un informe de
  // ausentismo no cierra.
  const motivos = motivosDeDiaNoTrabajado()
  const claves = motivos.map((m) => m.clave)
  for (const esperada of ['falta', 'enfermedad', 'vacaciones', 'accidente', 'suspension']) {
    assert.ok(claves.includes(esperada), `falta ${esperada}: no se está leyendo el catálogo real`)
  }
  // Y las etiquetas salen de allá, no se reescriben.
  assert.equal(motivos.find((m) => m.clave === 'falta')?.etiqueta, 'Faltó sin avisar')
})

test('«LLEGÓ TARDE» NO ES UN DÍA QUE NO SE TRABAJÓ', () => {
  // El defecto que atrapa: ofrecer los motivos parciales en el botón «no vino». Llegar tarde es un
  // día TRABAJADO con menos horas, y se declara escribiendo el número — no marcando una ausencia,
  // que pondría las horas del día en cero cuando la persona sí estuvo.
  const claves = motivosDeDiaNoTrabajado().map((m) => m.clave)
  assert.ok(!claves.includes('llego_tarde'))
  assert.ok(!claves.includes('se_retiro_antes'))
})

test('LO QUE LA EMPRESA RECONOCE ES LICENCIA; LO DEMÁS ES AUSENCIA', () => {
  // La distinción que el dueño pidió («ausencias, parte médico, etc»). No es una etiqueta más
  // linda: una licencia tiene respaldo documental —parte médico, denuncia de ART, recibo de
  // vacaciones— y la decide alguien. Guardar las dos como el mismo cero borra esa diferencia, que
  // es la que después usa quien liquida.
  assert.equal(tipoDeMotivo('enfermedad'), 'licencia', 'el parte médico es una licencia')
  assert.equal(tipoDeMotivo('accidente'), 'licencia')
  assert.equal(tipoDeMotivo('accidente_in_itinere'), 'licencia')
  assert.equal(tipoDeMotivo('vacaciones'), 'licencia')
  assert.equal(tipoDeMotivo('licencia_especial'), 'licencia')
  assert.equal(tipoDeMotivo('suspension'), 'licencia')

  assert.equal(tipoDeMotivo('falta'), 'ausencia')
  assert.equal(tipoDeMotivo('falta_con_aviso'), 'ausencia')
  assert.equal(tipoDeMotivo('lluvia'), 'ausencia', 'la obra parada no es un derecho del trabajador')
  assert.equal(tipoDeMotivo('sin_tarea'), 'ausencia')
  assert.equal(tipoDeMotivo('paro'), 'ausencia')
})

test('UN MOTIVO DESCONOCIDO ES AUSENCIA, nunca licencia', () => {
  // El default más conservador. Si un motivo nuevo del catálogo entrara como licencia, el sistema
  // estaría afirmando que la empresa reconoce un derecho que nadie decidió reconocer.
  assert.equal(tipoDeMotivo('teletransportacion'), 'ausencia')
  assert.equal(tipoDeMotivo(null), 'ausencia')
  assert.equal(tipoDeMotivo(undefined), 'ausencia')
  assert.equal(tipoDeMotivo(''), 'ausencia')
})

test('CADA MOTIVO OFRECIDO LLEVA EL TIPO QUE LE VA A TOCAR', () => {
  // Para que la pantalla lo pueda decir ANTES de guardar: elegir «vacaciones» y descubrir después
  // que quedó como ausencia es la clase de sorpresa que hace que nadie confíe en la pantalla.
  const m = motivosDeDiaNoTrabajado()
  assert.equal(m.find((x) => x.clave === 'vacaciones')?.tipo, 'licencia')
  assert.equal(m.find((x) => x.clave === 'falta')?.tipo, 'ausencia')
})

test('LA ETIQUETA SALE DEL CATÁLOGO, y una clave inventada no se muestra', () => {
  // El defecto que atrapa: mostrar la clave cruda (`falta_con_aviso`) en el historial, o peor,
  // elegir un motivo «parecido» cuando la clave no existe.
  assert.equal(etiquetaDeMotivo('enfermedad'), 'Enfermedad')
  assert.equal(etiquetaDeMotivo('inventado'), null)
  assert.equal(etiquetaDeMotivo(null), null)
})

test('SÓLO ENTRA LO QUE ESTÁ EN EL CATÁLOGO', () => {
  // `notas` es texto libre: sin esta guarda, cualquier cosa se guardaría como si fuera un motivo y
  // después no se puede agrupar el ausentismo por causa, que es para lo que existe el campo.
  assert.equal(esMotivo('vacaciones'), true)
  assert.equal(esMotivo('se fue temprano nomás'), false)
  assert.equal(esMotivo(''), false)
  assert.equal(esMotivo(null), false)
  assert.equal(esMotivo(42), false)
})
