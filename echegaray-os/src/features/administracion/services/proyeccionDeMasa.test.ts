// LA MASA SALARIAL ESTIMADA, PROBADA EN LOS CASOS DONDE UNA PROYECCIÓN MIENTE.
//
// Los cuatro que importan: el día que todavía no llegó (se proyecta), el que faltó sin motivo (NO
// se proyecta: proyectarle la jornada sería pagarle por decisión de una pantalla), el que no tiene
// tarifa (null, nunca cero) y la oficina (cobra un neto mensual que no depende de las horas).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filasDeGrilla, type DatosDeGrilla, type PersonaDeGrilla } from './grillaHorasQuincena.ts'
import { proyeccionDeFila, proyeccionDeQuincena } from './proyeccionDeMasa.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'

// 1 al 15 de septiembre de 2026: 9 días lun-jue × 9 h + 2 viernes × 8 h = 97 h.
const Q = { desde: '2026-09-01', hasta: '2026-09-15' } as const
const MALDONADO: PersonaDeGrilla = {
  id: 'p1', nombre: 'Maldonado', valorHora: 3650, convenio: 'UOCRA', modalidad: 'hora',
}

const base = (extra: Partial<DatosDeGrilla> = {}): DatosDeGrilla => ({
  quincena: Q,
  personas: [MALDONADO],
  registros: [],
  presencias: [],
  personaDeRegistro: () => 'p1',
  personaDePresencia: () => 'p1',
  hoy: '2026-09-08',
  ...extra,
})

const nueveHoras = (fecha: string) => ({ fecha, tipo_hora: 'normal' as const, horas: 9 })

test('EL QUE CUMPLE PROYECTA LA QUINCENA ENTERA: 36 h cargadas + 61 por cumplir = 97 h', () => {
  const datos = base({ registros: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-07'].map(nueveHoras) })
  const [fila] = filasDeGrilla(datos)
  const p = proyeccionDeFila(fila, MALDONADO, datos.hoy)
  assert.equal(p.horasCargadas, 36)
  assert.equal(p.horasPorCumplir, 61)
  assert.equal(p.horasProyectadas, 97, 'las esperadas de la quincena, no 36')
  assert.equal(p.importeProyectado, 97 * 3650)
  assert.equal(p.importeCargado, 36 * 3650)
  assert.equal(p.sinTarifa, false)
  // EL PASADO SIN CARGAR SE PROYECTA IGUAL PERO SE INFORMA APARTE: el viernes 4 (8 h) y el martes
  // 8 (9 h) ya pasaron y nadie los cargó — eso es trabajo administrativo pendiente, no futuro.
  assert.equal(p.horasSinCargar, 17)
})

test('UNA AUSENCIA SIN MOTIVO PROYECTA 0 h, NO LA JORNADA', () => {
  // EL DEFECTO QUE ATRAPA: rellenar con la jornada por defecto todo día sin horas. El 2 tiene una
  // ausencia declarada sin motivo (vale 0 h): la masa estimada NO puede incluir esas 9 h.
  const datos = base({
    registros: [nueveHoras('2026-09-01')],
    presencias: [{ fecha: '2026-09-02', estado: 'ausente', motivo: null }],
  })
  const [fila] = filasDeGrilla(datos)
  const p = proyeccionDeFila(fila, MALDONADO, datos.hoy)
  assert.equal(p.horasProyectadas, 88, '97 menos las 9 h del día que faltó sin motivo')
  assert.equal(p.importeProyectado, 88 * 3650)
})

test('UNA LICENCIA YA RESUELTA NO SE REEMPLAZA POR LA JORNADA POR DEFECTO', () => {
  // La licencia con motivo que paga ya trae sus horas cargadas. Si la proyección volviera a sumarle
  // la jornada del día, ese día valdría 18 h y la masa saldría inflada.
  const datos = base({
    presencias: [{ fecha: '2026-09-01', estado: 'licencia', motivo: 'enfermedad' }],
  })
  const [fila] = filasDeGrilla(datos)
  assert.equal(fila.celdas[0].marca, 'licencia')
  assert.equal(fila.celdas[0].horas, 9)
  const p = proyeccionDeFila(fila, MALDONADO, datos.hoy)
  assert.equal(p.horasProyectadas, 97, 'no 106: el día de licencia no se cuenta dos veces')
})

test('SIN TARIFA EL IMPORTE ES NULL Y LA MASA LO CUENTA APARTE, NUNCA COMO 0', () => {
  const castillo: PersonaDeGrilla = {
    id: 'p2', nombre: 'Castillo', valorHora: null, convenio: 'UOCRA', modalidad: 'hora',
  }
  const datos = base({
    personas: [MALDONADO, castillo],
    registros: [nueveHoras('2026-09-01')],
  })
  const filas = filasDeGrilla(datos)
  const sin = proyeccionDeFila(filas.find((f) => f.personaId === 'p2')!, castillo, datos.hoy)
  assert.equal(sin.importeProyectado, null)
  assert.equal(sin.importeCargado, null)
  assert.equal(sin.sinTarifa, true)
  const t = proyeccionDeQuincena(filas, datos.personas, datos.hoy)
  assert.equal(t.sinTarifa, 1, 'la fila sin tarifa se cuenta')
  assert.equal(t.personas, 2)
  // EL DEFECTO QUE ATRAPA: un total que suma null como 0 y parece completo. La masa es la de UNA
  // sola persona (Maldonado con sus 97 h proyectadas), y el «1 sin tarifa» es lo que lo dice.
  assert.equal(t.masaProyectada, 97 * 3650)
  assert.equal(t.obreros, 97 * 3650)
})

test('OFICINA COBRA SU NETO MENSUAL: EL MISMO IMPORTE QUE `liquidarLinea` DA HOY', () => {
  const nievas: PersonaDeGrilla = {
    id: 'p3', nombre: 'Nievas', valorHora: null, netoMensual: 1800000, convenio: 'fuera de convenio',
    modalidad: 'mensual', esJefe: true,
  }
  const datos = base({ personas: [nievas], personaDeRegistro: () => 'p3', personaDePresencia: () => 'p3' })
  const [fila] = filasDeGrilla(datos)
  const p = proyeccionDeFila(fila, nievas, datos.hoy)
  const esperado = liquidarLinea({
    personaId: 'p3', nombre: 'Nievas', horas: 0,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-01-01', origen: 'persona_tarifa' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'oficina').cobra
  assert.equal(p.importeProyectado, esperado)
  assert.equal(p.importeProyectado, 1800000, 'el neto mensual acordado, sin partir ni prorratear')
  assert.equal(p.sinTarifa, false, 'valor hora NULL en Oficina no es «sin tarifa»')
  const t = proyeccionDeQuincena([fila], [nievas], datos.hoy)
  assert.equal(t.oficina, 1800000)
  assert.equal(t.obreros, 0)
  // El neto mensual no depende de las horas: no hay nada «por cumplir» en pesos.
  assert.equal(t.masaCargada, 1800000)
  assert.equal(t.masaPorCumplir, 0)
})

test('LA MASA SE PARTE EN YA CARGADO Y POR CUMPLIR, Y LAS DOS DAN EL TOTAL', () => {
  const datos = base({ registros: ['2026-09-01', '2026-09-02'].map(nueveHoras) })
  const t = proyeccionDeQuincena(filasDeGrilla(datos), datos.personas, datos.hoy)
  assert.equal(t.masaCargada, 18 * 3650)
  assert.equal(t.masaProyectada, 97 * 3650)
  assert.equal(t.masaPorCumplir, (97 - 18) * 3650)
  assert.equal(t.masaCargada + t.masaPorCumplir, t.masaProyectada)
})
