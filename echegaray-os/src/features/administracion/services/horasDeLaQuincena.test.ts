// UN MISMO RÓTULO CON TRES NÚMEROS NO SE AUDITA.
//
// QA visual en producción (11/09/2026), 1ª quincena de septiembre: «Horas» decía 1.289, «Pagos» y
// «Cierre» 1.129, «Costo a la obra» 1.227. Los tres correctos, ninguno mentía, y la única lectura
// posible para el dueño era «uno de los tres está mal».
//
// LA MUTACIÓN QUE PONE ESTO ROJO: que una solapa vuelva a calcular su total por su cuenta, o que la
// resta deje de cerrar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cierraLaResta, filasDeHoras, horasDeLaQuincena, leyendaDeHoras,
  MOTIVO_NO_TRABAJADAS, MOTIVO_OFICINA, type FilaDeHoras,
} from './horasDeLaQuincena.ts'
import { filasDeGrilla } from './grillaHorasQuincena.ts'

/** Los tres números medidos en producción, reproducidos con quince obreros y dos jefes. */
const PLANTEL: FilaDeHoras[] = [
  // Dos de Oficina: 80 h cada uno, neto mensual. Sus horas existen y no se liquidan por hora.
  { personaId: 'of1', nombre: 'Maldonado', cargadas: 80, noTrabajadas: 0, modalidad: 'mensual' },
  { personaId: 'of2', nombre: 'Nievas', cargadas: 80, noTrabajadas: 0, modalidad: 'mensual' },
  // Trece obreros de 80 h sin licencias.
  ...Array.from({ length: 13 }, (_, i) => ({
    personaId: `ob${i}`, nombre: `Obrero ${i}`, cargadas: 80, noTrabajadas: 0, modalidad: 'hora' as const,
  })),
  // Dos con licencia paga: 62 h en total que se pagan y no las paga ninguna obra.
  { personaId: 'ob13', nombre: 'Quiroga', cargadas: 49, noTrabajadas: 44, modalidad: 'hora' },
  { personaId: 'ob14', nombre: 'Tello', cargadas: 40, noTrabajadas: 18, modalidad: 'hora' },
]

test('LOS TRES NÚMEROS SALEN DE UNA SOLA CUENTA, Y LA RESTA CIERRA', () => {
  const q = horasDeLaQuincena(PLANTEL)
  assert.equal(q.cargadas, 1289)
  assert.equal(q.liquidables, 1129, 'cargadas − 160 de Oficina')
  assert.equal(q.aObra, 1227, 'cargadas − 62 de licencia paga')
  assert.equal(q.cargadas - q.liquidables, 160)
  assert.equal(q.cargadas - q.aObra, 62)
  assert.equal(cierraLaResta(q), true)
})

test('CADA EXCLUSIÓN SE NOMBRA Y SE CUENTA — sin eso la resta hay que adivinarla', () => {
  const q = horasDeLaQuincena(PLANTEL)
  assert.equal(q.excluidas.length, 2)
  const of = q.excluidas.find((e) => e.motivo === MOTIVO_OFICINA)
  assert.deepEqual(of, { motivo: MOTIVO_OFICINA, horas: 160, personas: 2 })
  const lic = q.excluidas.find((e) => e.motivo === MOTIVO_NO_TRABAJADAS)
  assert.deepEqual(lic, { motivo: MOTIVO_NO_TRABAJADAS, horas: 62, personas: 2 })
})

test('LAS DOS RESTAS SON INDEPENDIENTES: no es una escalera', () => {
  // EL DEFECTO QUE ATRAPA: encadenarlas (1.289 − 160 − 62 = 1.067) daría un número que ninguna
  // pantalla publica. Las horas TRABAJADAS de la gente de Oficina SÍ le cuestan a una obra.
  const q = horasDeLaQuincena(PLANTEL)
  assert.notEqual(q.aObra, 1067)
  assert.notEqual(q.liquidables, 1067)
  // Un jefe de Oficina con licencia resta de las dos, cada una por su lado.
  const conLicencia = horasDeLaQuincena([
    { personaId: 'of1', nombre: 'Jefe', cargadas: 80, noTrabajadas: 9, modalidad: 'mensual' },
  ])
  assert.equal(conLicencia.cargadas, 80)
  assert.equal(conLicencia.liquidables, 0)
  assert.equal(conLicencia.aObra, 71)
})

test('UNA LIQUIDACIÓN FINAL TAMPOCO SE LIQUIDA POR HORA', () => {
  // Sale de la mitad blanca del recibo del estudio × 2, no de horas × tarifa.
  const q = horasDeLaQuincena([
    { personaId: 'f1', nombre: 'Se fue', cargadas: 40, noTrabajadas: 0, modalidad: 'ninguna' },
  ])
  assert.equal(q.liquidables, 0)
  assert.equal(q.aObra, 40, 'pero sus horas trabajadas sí las pagó una obra')
  assert.equal(q.excluidas[0].motivo, MOTIVO_OFICINA)
})

test('SIN NADA QUE RESTAR NO HAY LEYENDA: un cartel permanente es ruido', () => {
  const q = horasDeLaQuincena([
    { personaId: 'ob1', nombre: 'Uno', cargadas: 80, noTrabajadas: 0, modalidad: 'hora' },
  ])
  assert.deepEqual(q.excluidas, [])
  assert.equal(cierraLaResta(q), true)
  assert.equal(leyendaDeHoras(q, 'liquidables'), '')
  assert.equal(leyendaDeHoras(q, 'aObra'), '')
})

test('LA LEYENDA DE CADA SOLAPA EXPLICA SU PROPIO NÚMERO, NO LOS TRES', () => {
  const q = horasDeLaQuincena(PLANTEL)
  // «Horas» publica el total: no tiene nada que explicar.
  assert.equal(leyendaDeHoras(q, 'cargadas'), '')
  // «Pagos» y «Cierre» publican 1.129: les falta Oficina.
  const pagos = leyendaDeHoras(q, 'liquidables')
  assert.match(pagos, /^1\.289 h cargadas · 160 h de Oficina/)
  assert.ok(!pagos.includes('licencia'), 'la licencia no explica el número de Pagos')
  // «Costo a la obra» publica 1.227: le falta la licencia paga.
  const obra = leyendaDeHoras(q, 'aObra')
  assert.match(obra, /^1\.289 h cargadas · 62 h de licencia/)
  assert.ok(!obra.includes('Oficina'), 'Oficina no explica el número de Costo a la obra')
})

test('`cierraLaResta` PUEDE DAR FALSO — un control que no puede decir que no es una constante', () => {
  const roto = { ...horasDeLaQuincena(PLANTEL), liquidables: 999 }
  assert.equal(cierraLaResta(roto), false)
})

test('LAS FILAS SALEN DE LA GRILLA, NO DE UNA SEGUNDA LECTURA', () => {
  // Una ausencia SIN motivo vale 0 h (R4): no resta nada, y contarla como exclusión inflaría la
  // resta con horas que no existen.
  const Q = { desde: '2026-09-01', hasta: '2026-09-15' } as const
  const grilla = filasDeGrilla({
    quincena: Q,
    personas: [{ id: 'p1', nombre: 'Quiroga', valorHora: 3650, convenio: null }],
    registros: [
      { fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
      { fecha: '2026-09-02', tipo_hora: 'licencia', horas: 9, notas: 'enfermedad' },
    ],
    presencias: [{ fecha: '2026-09-03', estado: 'ausente', motivo: null }],
    personaDeRegistro: () => 'p1',
    personaDePresencia: () => 'p1',
    hoy: '2026-09-15',
  })
  const [f] = filasDeHoras(grilla, () => 'hora')
  assert.equal(f.cargadas, 18, '9 trabajadas + 9 de licencia paga')
  assert.equal(f.noTrabajadas, 9, 'sólo la licencia; la ausencia sin motivo vale 0')
  const q = horasDeLaQuincena([f])
  assert.equal(q.aObra, 9, 'la obra paga las 9 trabajadas')
  assert.equal(q.liquidables, 18, 'a la persona se le pagan las 18')
})
