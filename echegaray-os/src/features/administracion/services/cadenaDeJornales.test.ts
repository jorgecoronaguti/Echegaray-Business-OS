// LOS ADELANTOS DE LA PLANILLA ENTRAN A LA CADENA DE PAGO. Y LO MANUAL LES SIGUE GANANDO.
//
// Dueño, 11/09/2026, textual: *«todo lo referente a adelantos de plata no está»*. Era cierto: la
// cadena calculaba COBRA y restaba lo que encontraba en `nomina_adelanto` (giros del extracto) y
// `nomina_recibo_neto`. Los adelantos que él escribe EN LA PLANILLA no entraban por ningún lado, así
// que la app le mostraba en efectivo plata que ya había entregado en mano.
//
// LA PRECEDENCIA, UNA SOLA Y ESCRITA: manual > JORNALES > calculado.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: dejar que JORNALES pise lo manual, o que un NULL de la planilla
// borre lo que la app calculó.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides, sinOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'

/** 80 h × $5.000 = $400.000 de COBRA, sin nada restado. */
const linea = (extra: Partial<Parameters<typeof liquidarLinea>[0]> = {}) => liquidarLinea({
  personaId: 'p1', nombre: 'Maldonado', horas: 80,
  tarifa: { valorHora: 5000, netoMensual: null, desde: '2026-01-01', origen: 'test' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  ...extra,
}, 'obreros')

test('SIN JORNALES Y SIN MANUAL, LA CADENA ES LA QUE ERA', () => {
  const l = aplicarOverrides(linea(), {}, 'obreros', null)
  assert.equal(l.cobra, 400000)
  assert.equal(l.adelanto, 0)
  assert.equal(l.enEfectivo, 400000)
  assert.equal(l.origen.adelanto, 'calculado')
})

test('UN ADELANTO DE 50.000 EN JORNALES ENTRA, SE MARCA, Y BAJA EL EFECTIVO', () => {
  // EL DEFECTO EXACTO QUE EL DUEÑO LEYÓ: $400.000 en la columna EN EFECTIVO de alguien a quien ya le
  // había adelantado $50.000 en mano.
  const l = aplicarOverrides(linea(), {}, 'obreros', { adelanto: 50000 })
  assert.equal(l.adelanto, 50000)
  assert.equal(l.origen.adelanto, 'jornales')
  assert.equal(l.manual.adelanto, false, 'no lo escribió nadie en la app: no es «manual»')
  assert.equal(l.enEfectivo, 350000, 'la cadena se rehace (R5)')
  assert.equal(l.total, 350000)
})

test('CON MANUAL 30.000, GANA LA APP — Y LA CADENA SE REHACE SOBRE ESE NÚMERO', () => {
  // Lo manual es MÁS NUEVO por definición: lo escribió alguien mirando esta pantalla, ya sabiendo lo
  // que dice la planilla. Si JORNALES pisara, la corrección desaparecería en la próxima corrida del
  // timer y el que la escribió creería que guardó.
  const l = aplicarOverrides(linea(), { adelanto: 30000 }, 'obreros', { adelanto: 50000 })
  assert.equal(l.adelanto, 30000)
  assert.equal(l.origen.adelanto, 'manual')
  assert.equal(l.manual.adelanto, true)
  assert.equal(l.enEfectivo, 370000)
  assert.equal(l.total, 370000)
})

test('UN CERO ESCRITO A MANO ES UNA AFIRMACIÓN Y TAMBIÉN LE GANA A JORNALES', () => {
  // «No le doy nada de adelanto» es algo que alguien dijo. R1 al revés: el 0 manual no es ausencia.
  const l = aplicarOverrides(linea(), { adelanto: 0 }, 'obreros', { adelanto: 50000 })
  assert.equal(l.adelanto, 0)
  assert.equal(l.origen.adelanto, 'manual')
  assert.equal(l.enEfectivo, 400000)
})

test('UN NULL DE LA PLANILLA NO BORRA LO QUE LA APP CALCULÓ', () => {
  // EL DEFECTO QUE ATRAPA: una columna que el archivo deja de rotular viaja NULL, y si NULL pisara,
  // TODOS los adelantos se irían a cero en silencio y la app pagaría de más. «No hay columna» y «no
  // le dieron nada» son dos afirmaciones distintas.
  const base = linea({ adelanto: 20000 })
  const l = aplicarOverrides(base, {}, 'obreros', { adelanto: null, porBanco: undefined })
  assert.equal(l.adelanto, 20000)
  assert.equal(l.origen.adelanto, 'calculado')
})

test('CUANDO JORNALES Y EL EXTRACTO NO DICEN LO MISMO, GANA JORNALES Y SE AVISA', () => {
  // El extracto vio un giro de $215.564 y la planilla dice $294.000. Se muestra la planilla y la
  // diferencia queda publicada: esconderla haría desaparecer una de las dos cifras.
  const base = linea({ reciboNeto: 215564, giroEnElLote: true })
  assert.equal(base.porBanco, 215564, 'el derivado')
  const l = aplicarOverrides(base, {}, 'obreros', { porBanco: 294000 })
  assert.equal(l.porBanco, 294000)
  assert.equal(l.origen.porBanco, 'jornales')
  assert.deepEqual(l.discrepancia.porBanco, { jornales: 294000, calculado: 215564 })
  assert.equal(l.enEfectivo, 106000, '400.000 − 294.000')
})

test('SIN DIFERENCIA NO HAY AVISO: un cartel permanente no dice nada', () => {
  const base = linea({ reciboNeto: 100000, giroEnElLote: true })
  const l = aplicarOverrides(base, {}, 'obreros', { porBanco: 100000 })
  assert.deepEqual(l.discrepancia, {})
  assert.equal(l.origen.porBanco, 'jornales')
})

test('LAS HORAS NO SE TRAEN DE JORNALES — SI SE TRAJERAN, EL COTEJO SE VALIDARÍA SOLO', () => {
  // Las horas de la app salen de `registros_hh` día por día, y el chip de la vista «Quincena» compara
  // esas dos fuentes. Si JORNALES pisara las horas, el chip compararía la planilla contra la planilla
  // y diría «coincide» siempre — un control validado contra la información que produce.
  const l = aplicarOverrides(linea(), {}, 'obreros', { adelanto: 10000 } as never)
  assert.equal(l.horas, 80)
  assert.equal(l.origen.horas, 'calculado')
  // Y el TOTAL sigue siendo POR BANCO + EN EFECTIVO, no un número traído.
  assert.equal(l.total, (l.porBanco ?? 0) + (l.enEfectivo ?? 0))
  assert.equal(l.origen.total, 'calculado')
})

test('COBRA DE JORNALES RESUELVE «SIN TARIFA»: alguien decidió el importe', () => {
  const base = liquidarLinea({
    personaId: 'p2', nombre: 'Sin tarifa', horas: 80, tarifa: null,
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros')
  assert.equal(base.sinTarifa, true)
  assert.equal(base.cobra, null)
  const l = aplicarOverrides(base, {}, 'obreros', { cobra: 396000 })
  assert.equal(l.cobra, 396000)
  assert.equal(l.sinTarifa, false)
  assert.equal(l.origen.cobra, 'jornales')
  assert.equal(l.enEfectivo, 396000)
})

test('UNA QUINCENA CERRADA NO RECIBE NADA: ni manual ni JORNALES', () => {
  // `sinOverrides` es lo que el servicio usa sobre un cuadro cerrado. Sus cifras son la foto del
  // cierre: si el espejo las pisara, el registro de lo que YA SE PAGÓ cambiaría solo, cada hora,
  // porque el timer volvió a leer la planilla.
  const l = sinOverrides(linea())
  assert.equal(l.adelanto, 0)
  assert.equal(l.origen.adelanto, 'calculado')
  assert.deepEqual(l.discrepancia, {})
})
