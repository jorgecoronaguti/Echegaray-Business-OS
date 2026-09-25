// El adelanto de sueldo escrito en el canal Efectivo (dueño, 25/09/2026).
//
// Lo que se prueba es lo que cuesta plata si sale mal: que un adelanto se lea con el importe y la persona
// exactos, que ante la duda PREGUNTE con opciones, y que lo que no es un adelanto (una entrega, la libreta, un
// pago a un proveedor, un cobro de obra) NO se reclame. El padrón es el real del 25/09 con sus trampas: dos
// Emilianos, dos Quirogas, cuatro Juanes, tres Sebastianes, y Tello/Agüero que también son proveedores.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarPadron, elegirEmpleado, interpretarAdelanto, leerFechaAdelanto, leerImporte, leerRespuesta,
  numeroParaCuenta, pareceAdelanto, senalDeAdelanto, textoDePregunta,
} from './adelanto-sueldo-texto.mjs'

const PADRON = armarPadron([
  { id: 'aguero', nombre_completo: 'AGUERO CRISTIAN DOMINGO', nombre_para_mostrar: 'Cristian Aguero', apodos: ['Aguero Cristian'] },
  { id: 'castillo', nombre_completo: 'CASTILLO BENITEZ JUAN CARLOS', nombre_para_mostrar: 'Carlos Castillo', apodos: ['Castillo Carlos'] },
  { id: 'gcarlos', nombre_completo: 'GONZALEZ CARLOS SAMUEL', nombre_para_mostrar: 'Carlos Gonzalez', apodos: [] },
  { id: 'gemiliano', nombre_completo: 'GONZALEZ TOBARES EMILIANO', nombre_para_mostrar: 'Emiliano Gonzalez', apodos: ['Gonzalez Emiliano'] },
  { id: 'gjuan', nombre_completo: 'GONZALEZ TOBARES JUAN GUILLERMO', nombre_para_mostrar: 'Juan Gonzalez', apodos: [] },
  { id: 'maldonado', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Emiliano Maldonado', apodos: ['Emi Maldonado'] },
  { id: 'nievas', nombre_completo: 'NIEVAS VILLEGAS JUAN PABLO', nombre_para_mostrar: 'Juan Pablo Nievas', apodos: [] },
  { id: 'pastran', nombre_completo: 'PASTRAN MARCELO IVAN', nombre_para_mostrar: 'Marcelo Pastran', apodos: ['Pastran Marcelo'] },
  { id: 'qalex', nombre_completo: 'QUIROGA ALEXANDER SEBASTIAN', nombre_para_mostrar: 'Alexander Quiroga', apodos: ['Quiroga Alexander'] },
  { id: 'qseba', nombre_completo: 'QUIROGA SEBASTIAN ADOLFO', nombre_para_mostrar: 'Sebastian Quiroga', apodos: ['Quiroga Sebastian'] },
  { id: 'reta', nombre_completo: 'RETA RAMON HECTOR SEBASTIAN', nombre_para_mostrar: 'Sebastian Reta', apodos: ['Reta Sebastian'] },
  { id: 'tello', nombre_completo: 'TELLO JUAN ALBERTO', nombre_para_mostrar: 'Juan Tello', apodos: ['Tello Juan'] },
  { id: 'zogbe', nombre_completo: 'ZOGBE RAMOS WALTER LEONARDO', nombre_para_mostrar: 'Leonardo Zogbe', apodos: ['Leonardo Zogber'] },
])
const PROVEEDORES = ['AGUERO', 'Pedro Tello', 'Corralón Progreso', 'Victor Repuestos', 'ROSALES BISSIO VICTOR FEDERICO FABIAN']
const ctx = { padron: PADRON, proveedores: PROVEEDORES, hoy: '2026-09-25' }
const leer = (t) => interpretarAdelanto(t, ctx)

test('las frases del dueño: importe, persona y fecha exactos', () => {
  for (const [texto, id, importe, expresion] of [
    ['pagué 7600 a Nievas a cuenta', 'nievas', 7600, '7600'],
    ['le adelanté 20.000 a Pastrán', 'pastran', 20000, '20000'],
    ['adelanto 20 mil a Emiliano Gonzalez', 'gemiliano', 20000, '20000'],
    ['$20k de adelanto a Emiliano Maldonado', 'maldonado', 20000, '20000'],
    ['Emi Maldonado adelanto 30.000', 'maldonado', 30000, '30000'],
    ['adelanto a Sebastián Quiroga 15000', 'qseba', 15000, '15000'],
    ['adelanto 20 mil a juan gonzalez', 'gjuan', 20000, '20000'],
    ['adelanto 12 mil a Juan Pablo', 'nievas', 12000, '12000'],
    ['adelanto 5000 a Zogber', 'zogbe', 5000, '5000'],
    ['adelanto de sueldo 50 mil a Tello', 'tello', 50000, '50000'],
    ['le di 8.500 de adelanto a Castillo', 'castillo', 8500, '8500'],
  ]) {
    const r = leer(texto)
    assert.equal(r.estado, 'listo', texto)
    assert.equal(r.persona.id, id, texto)
    assert.equal(r.importe, importe, texto)
    assert.equal(r.expresion, expresion, texto)
    assert.equal(r.fecha, '2026-09-25', texto)
  }
})

test('la cuenta se escribe como la escribe el dueño: «8500*8» entra tal cual a la celda', () => {
  const r = leer('adelanto 8500*8 a pastran')
  assert.equal(r.estado, 'listo')
  assert.equal(r.importe, 68000)
  assert.equal(r.expresion, '8500*8')
  assert.deepEqual(leerImporte('adelanto 8.500 x 8 a pastran'), { importe: 68000, expresion: '8500*8' })
  assert.deepEqual(leerImporte('adelanto 20 mil'), { importe: 20000, expresion: '20000' })
  assert.deepEqual(leerImporte('adelanto $20k'), { importe: 20000, expresion: '20000' })
  assert.deepEqual(leerImporte('adelanto 20.000'), { importe: 20000, expresion: '20000' })
  assert.deepEqual(leerImporte('adelanto 7600,50 a reta'), { importe: 7600.5, expresion: '7600,5' })
  assert.equal(numeroParaCuenta(113200.5), '113200,5')
  assert.equal(numeroParaCuenta(20000), '20000')
})

test('la fecha: «ayer» y «el 24/9» mandan; el futuro o un mes atrás son un tipeo y queda hoy', () => {
  assert.equal(leer('ayer le di 5 mil de adelanto a Reta').fecha, '2026-09-24')
  assert.equal(leer('adelanto 20 mil a Pastrán el 16/9').fecha, '2026-09-16')
  assert.equal(leerFechaAdelanto('adelanto el 30/9', '2026-09-25'), '2026-09-25')
  assert.equal(leerFechaAdelanto('adelanto el 10/7', '2026-09-25'), '2026-09-25')
  assert.equal(leerFechaAdelanto('adelanto el 31/8', '2026-09-25'), '2026-08-31')
})

test('ante la duda PREGUNTA con opciones, y no elige solo', () => {
  const emi = leer('adelanto 20 mil a Emiliano')
  assert.equal(emi.estado, 'pregunta')
  assert.equal(emi.falta, 'persona_ambigua')
  assert.deepEqual(emi.candidatos.map((c) => c.id).sort(), ['gemiliano', 'maldonado'])
  assert.match(textoDePregunta(emi), /1 · Emiliano/)
  assert.match(textoDePregunta(emi), /2 · Emiliano/)

  assert.deepEqual(leer('adelanto 15 mil a Quiroga').candidatos.map((c) => c.id).sort(), ['qalex', 'qseba'])
  assert.deepEqual(leer('adelanto 15 mil a Sebastian').candidatos.map((c) => c.id).sort(), ['qalex', 'qseba', 'reta'])

  // «Juan Pérez» no está: no se lo carga al primer Juan. Se dice y se ofrecen los Juanes.
  const perez = leer('le di 8500 de adelanto a Juan Pérez')
  assert.equal(perez.falta, 'persona')
  assert.equal(perez.desconocido, 'Juan Perez')
  assert.deepEqual(perez.candidatos.map((c) => c.id).sort(), ['castillo', 'gjuan', 'nievas', 'tello'])
  assert.match(textoDePregunta(perez), /No encuentro a \*\*Juan Perez\*\*/)

  // Nadie del plantel.
  const nadie = leer('adelanto 20 mil a Fulano')
  assert.equal(nadie.falta, 'persona')
  assert.equal(nadie.desconocido, 'Fulano')
  assert.equal(leer('adelanto 20000').falta, 'persona')

  // Sin importe claro.
  assert.equal(leer('adelanto a Pastrán').falta, 'monto')
  assert.equal(leer('adelanto 20000 y 5000 a Pastrán').falta, 'monto')
})

test('un apellido que también es de un proveedor se pregunta, salvo que diga sueldo o el nombre', () => {
  const t = leer('a cuenta 1.250.000 a Tello')
  assert.equal(t.falta, 'proveedor')
  assert.equal(t.proveedor, 'Pedro Tello')
  assert.match(textoDePregunta(t), /1 · Adelanto de sueldo a Juan Tello/)
  assert.match(textoDePregunta(t), /2 · No es un adelanto/)
  assert.equal(leer('adelanto 10000 a Aguero').falta, 'proveedor')
  assert.equal(leer('adelanto 10000 a Cristian Aguero').estado, 'listo')
  assert.equal(leer('adelanto de quincena 10000 a Aguero').estado, 'listo')
})

test('lo que NO es un adelanto de sueldo no se reclama', () => {
  for (const texto of [
    'pagué 45000 al corralón',
    'Corralón Progreso 23/9 150.000 cemento',
    'entregué 250 mil a Rubén Sosa para el galpón 8',
    'le di 20 mil a Emiliano', // es una ENTREGA a rendir, como siempre
    '100 a jorge para combustible',
    'P. Tello 18/9 2.640.000',
    'adelanto de obra 2 millones Quattropani',
    'cobré el adelanto del cliente 500 mil',
    'más adelante le pago 20 mil a Tello',
    'anticipo 300 mil al corralón',
    'a cuenta 50.000 flete',
    'a cuenta 200.000 a Fulano Proveedor',
    'Tello 23/9 100.000',
  ]) {
    assert.equal(leer(texto).estado, 'nada', texto)
  }
  assert.equal(pareceAdelanto('le di 8500 de adelanto a Juan Pérez'), true)
  assert.equal(pareceAdelanto('le di 20 mil a Emiliano'), false)
  assert.equal(senalDeAdelanto('pagué 7600 a Nievas a cuenta'), 'debil')
})

test('la respuesta en el hilo: número, nombre, «no», o el importe que faltaba', () => {
  const emi = leer('adelanto 20 mil a Emiliano')
  const [a, b] = emi.candidatos
  assert.equal(leerRespuesta('1', emi).persona.id, a.id)
  assert.equal(leerRespuesta('el 2', emi).persona.id, b.id)
  assert.equal(leerRespuesta('Maldonado', emi).persona.id, 'maldonado')
  assert.equal(leerRespuesta('3', emi), null)
  assert.deepEqual(leerRespuesta('no', emi), { cancelar: true })
  assert.equal(leerRespuesta('cualquier cosa', emi), null)

  const prov = leer('a cuenta 1.250.000 a Tello')
  assert.equal(leerRespuesta('1', prov).persona.id, 'tello')
  assert.deepEqual(leerRespuesta('2', prov), { cancelar: true })

  const monto = leer('adelanto a Pastrán')
  assert.deepEqual(leerRespuesta('8500*8', monto), { importe: 68000, expresion: '8500*8' })
})

test('elegirEmpleado: la frase entera del nombre para mostrar desempata', () => {
  assert.equal(elegirEmpleado('adelanto a sebastian quiroga', PADRON).persona.id, 'qseba')
  assert.equal(elegirEmpleado('adelanto a alexander', PADRON).persona.id, 'qalex')
})
