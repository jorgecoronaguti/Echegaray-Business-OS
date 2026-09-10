// LA GRILLA DE LA QUINCENA, PROBADA EN LOS CASOS QUE TRABAN EL CIERRE.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filasDeGrilla, resumenDeGrilla, type DatosDeGrilla } from './grillaHorasQuincena.ts'

// 1 al 15 de septiembre de 2026: 9 días lun-jue + 2 viernes = 97 h esperadas (R2 del handoff).
const Q = { desde: '2026-09-01', hasta: '2026-09-15' } as const

const base = (extra: Partial<DatosDeGrilla> = {}): DatosDeGrilla => ({
  quincena: Q,
  personas: [{ id: 'p1', nombre: 'Maldonado', valorHora: 3650, convenio: 'UOCRA' }],
  registros: [],
  presencias: [],
  personaDeRegistro: () => 'p1',
  personaDePresencia: () => 'p1',
  hoy: '2026-09-15',
  ...extra,
})

test('ESPERADAS = 9 h L-J + 8 h V, NO 8,8 UNIFORMES', () => {
  // EL DEFECTO QUE ATRAPA: la app publicaba «61,6 h = 8,8 × 7 días hábiles». Con la jornada real,
  // la 1ª de septiembre de 2026 espera 97 h. Si alguien vuelve al promedio, esto se pone rojo.
  const [fila] = filasDeGrilla(base())
  assert.equal(fila.esperadas, 97)
  assert.notEqual(fila.esperadas, 61.6)
  // 13 columnas: la quincena sin domingos. El sábado entra en la grilla y espera 0 h.
  assert.equal(fila.celdas.length, 13)
})

test('UN DÍA SIN HORAS NO ES UNA FALTA, Y UNA AUSENCIA SIN MOTIVO VALE 0 h', () => {
  const [fila] = filasDeGrilla(base({
    registros: [{ fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 }],
    presencias: [{ fecha: '2026-09-02', estado: 'ausente', motivo: null }],
    hoy: '2026-09-02',
  }))
  assert.equal(fila.celdas[0].marca, 'horas')
  assert.equal(fila.celdas[0].horas, 9)
  assert.equal(fila.celdas[1].marca, 'ausencia')
  assert.equal(fila.celdas[1].horas, 0, 'sin motivo no paga')
  assert.equal(fila.celdas[1].sinMotivo, true)
  assert.equal(fila.celdas[2].marca, 'sin-cargar', 'el 3 no se cargó: es `·`, no una falta')
  assert.equal(fila.cargadas, 9)
  // Los días que todavía no pasaron no cuentan como trabajo administrativo pendiente.
  assert.equal(fila.diasSinCargar, 0, 'hoy es el 2: no hay días vencidos sin cargar')
  assert.equal(fila.estado, 'motivo')
})

test('SIN RETRIBUCIÓN CARGADA LA FILA NO ESTÁ «AL DÍA» AUNQUE TENGA TODAS LAS HORAS', () => {
  const dias = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
  const [fila] = filasDeGrilla(base({
    personas: [{ id: 'p1', nombre: 'Castillo', valorHora: null, convenio: 'UOCRA' }],
    registros: dias.map((fecha) => ({ fecha, tipo_hora: 'normal', horas: fecha === '2026-09-04' ? 8 : 9 })),
    hoy: '2026-09-04',
  }))
  assert.equal(fila.cargadas, 35)
  // EL DEFECTO QUE ATRAPA: publicar «al día» a quien no se puede liquidar. R1: null no es cero.
  assert.equal(fila.estado, 'tarifa')
})

test('EL CIERRE ESTÁ TRABADO MIENTRAS HAYA PENDIENTES, Y DICE POR QUÉ', () => {
  const filas = filasDeGrilla(base({
    personas: [
      { id: 'p1', nombre: 'Maldonado', valorHora: 3650, convenio: 'UOCRA' },
      { id: 'p2', nombre: 'Castillo', valorHora: null, convenio: 'UOCRA' },
    ],
    personaDeRegistro: () => 'p1',
    personaDePresencia: () => 'p1',
    presencias: [{ fecha: '2026-09-01', estado: 'ausente', motivo: null }],
    hoy: '2026-09-01',
  }))
  const r = resumenDeGrilla(Q, filas)
  assert.equal(r.puedeCerrar, false)
  assert.match(r.porQueNo, /1 ausencia\(s\) sin motivo/)
  assert.match(r.porQueNo, /1 sin retribución cargada/)
  // EL PIE SUMA PERSONAS: dos personas × 97 h. Este assert decía 97 —las de UNA— al lado de las
  // cargadas de las dos, y es lo que el dueño leyó como «Cargadas 206 · Esperadas 97».
  assert.equal(r.esperadas, 194)
  assert.equal(r.personas, 2)
  // Un día sin ninguna hora publica `null`, no 0: nadie cargó no es «trabajaron cero».
  assert.equal(r.porDia[5], null)
})

test('SIN PENDIENTES SE PUEDE CERRAR — el control puede dar verde', () => {
  // Un control que nunca puede decir que sí es una constante disfrazada de control.
  const dias = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07']
  const filas = filasDeGrilla(base({
    registros: dias.map((fecha) => ({ fecha, tipo_hora: 'normal', horas: fecha === '2026-09-04' ? 8 : 9 })),
    hoy: '2026-09-07',
  }))
  const r = resumenDeGrilla(Q, filas)
  assert.equal(r.puedeCerrar, true)
  assert.equal(r.porQueNo, '')
  assert.equal(filas[0].estado, 'al-dia')
})

test('LA LICENCIA CARGADA EN `registros_hh` CUENTA — Asistencia la ve y la grilla la veía «·»', () => {
  // DEFECTO REAL (captura del dueño, 10/09/2026): QUIROGA ALEXANDER SEBASTIAN tiene cinco días de
  // `tipo_hora = 'licencia'` con motivo «enfermedad» en `registros_hh` y NINGUNA fila en
  // `asistencia_dia`. Asistencia sumaba 62 h y la grilla de Liquidación 18: la celda buscaba la
  // licencia sólo en la tabla de presencia declarada. Si vuelve a mirar una sola de las dos, rojo.
  const [fila] = filasDeGrilla(base({
    registros: [
      { fecha: '2026-09-01', tipo_hora: 'licencia', horas: 9, notas: 'enfermedad' },
      { fecha: '2026-09-02', tipo_hora: 'licencia', horas: 9, notas: 'enfermedad' },
      { fecha: '2026-09-03', tipo_hora: 'licencia', horas: 9, notas: 'enfermedad' },
      { fecha: '2026-09-04', tipo_hora: 'licencia', horas: 8, notas: 'enfermedad' },
      { fecha: '2026-09-07', tipo_hora: 'licencia', horas: 9, notas: 'enfermedad' },
      { fecha: '2026-09-08', tipo_hora: 'normal', horas: 9 },
      { fecha: '2026-09-09', tipo_hora: 'normal', horas: 9 },
    ],
    presencias: [],
    hoy: '2026-09-09',
  }))
  assert.equal(fila.celdas[0].marca, 'licencia')
  assert.equal(fila.celdas[0].horas, 9)
  assert.equal(fila.cargadas, 62, 'la grilla publicaba 18 sobre las mismas filas que Asistencia lee')
  assert.equal(fila.diasSinMotivo, 0)
})

test('LO TRABAJADO LE SIGUE GANANDO A LA LICENCIA DEL MISMO DÍA — sin doble conteo', () => {
  // GONZALEZ TOBARES tiene el 10/09 cargado dos veces: licencia 9 h y normal 9 h. El día vale 9,
  // no 18. Es la regla contra el doble conteo, y esta celda no puede tener su propia versión.
  const [fila] = filasDeGrilla(base({
    registros: [
      { fecha: '2026-09-01', tipo_hora: 'licencia', horas: 9, notas: 'enfermedad' },
      { fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
    ],
    hoy: '2026-09-01',
  }))
  assert.equal(fila.celdas[0].marca, 'horas')
  assert.equal(fila.celdas[0].horas, 9)
})

test('LA GRILLA ORDENA COMO EL PLANTEL Y LA ASISTENCIA: POR NOMBRE, Y PUBLICA QUIÉN ES JEFE', () => {
  // EL DEFECTO QUE ATRAPA (dueño, 10/09/2026): el directorio llegaba en el orden de la base y la
  // grilla de Horas lo publicaba tal cual —Maldonado, Nievas, Quiroga, Reta, Ochoa…— mientras
  // Plantel y Asistencia iban alfabéticas y separadas en Jefes / Obreros. La misma persona estaba
  // en un lugar distinto en cada solapa.
  const filas = filasDeGrilla(base({
    personas: [
      { id: 'p3', nombre: 'Reta', valorHora: 1, convenio: null },
      { id: 'p1', nombre: 'Álvarez', valorHora: 1, convenio: null, esJefe: true },
      { id: 'p2', nombre: 'Maldonado', valorHora: 1, convenio: null },
    ],
    personaDeRegistro: () => 'nadie',
    personaDePresencia: () => 'nadie',
  }))
  assert.deepEqual(filas.map((f) => f.nombre), ['Álvarez', 'Maldonado', 'Reta'], 'alfabético en español: la tilde no manda a Álvarez al final')
  assert.deepEqual(filas.map((f) => f.esJefe), [true, false, false])
})
