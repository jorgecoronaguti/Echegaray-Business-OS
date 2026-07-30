// Tests de la jornada por configuración. Sin red y sin base: el `port` es un doble con
// `query`, y la migración se lee como texto para chequear las fechas sembradas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TIPO, ORIGEN, diaSemanaDe, jornadaConfigurada, jornadaEfectiva } from './jornada-config.mjs'

/** Doble del port: devuelve las filas que se le den y registra qué se le consultó. */
function puerto(rows = []) {
  const llamadas = []
  return {
    llamadas,
    async query(sql, params) {
      llamadas.push({ sql, params })
      return { rows }
    },
  }
}

// ── diaSemanaDe ──────────────────────────────────────────────────────────────

test('el día de la semana se calcula en UTC: en San Juan (UTC−3) el horario local corría la fecha', () => {
  // 30/07/2026 es jueves. Con new Date(...).getDay() en UTC−3 daría miércoles, y un jueves de
  // 9 horas se habría cargado como el día anterior.
  assert.equal(diaSemanaDe('2026-07-30'), 4)
  assert.equal(diaSemanaDe('2026-01-01'), 4) // jueves
  assert.equal(diaSemanaDe('2026-08-17'), 1) // lunes
  assert.equal(diaSemanaDe('2026-11-20'), 5) // viernes
  assert.equal(diaSemanaDe('2026-06-20'), 6) // sábado
})

test('una fecha que no existe devuelve null en vez de desbordarse al mes siguiente', () => {
  assert.equal(diaSemanaDe('2026-02-30'), null)
  assert.equal(diaSemanaDe('2026-13-01'), null)
  assert.equal(diaSemanaDe('30/07/2026'), null)
  assert.equal(diaSemanaDe(''), null)
  assert.equal(diaSemanaDe(null), null)
})

// ── jornadaConfigurada ───────────────────────────────────────────────────────

test('un feriado devuelve 0 horas con su etiqueta: es una afirmación, no un vacío', async () => {
  const port = puerto([{ tipo: TIPO.FERIADO, horas: '0.00', etiqueta: 'Día del Trabajador' }])
  const r = await jornadaConfigurada(port, { fecha: '2026-05-01' })
  assert.deepEqual(r, { horas: 0, origen: 'feriado', etiqueta: 'Día del Trabajador' })
})

test('una media jornada devuelve sus horas', async () => {
  const port = puerto([{ tipo: TIPO.MEDIA_JORNADA, horas: '4.50', etiqueta: 'Nochebuena' }])
  const r = await jornadaConfigurada(port, { fecha: '2026-12-24' })
  assert.equal(r.horas, 4.5)
  assert.equal(r.origen, ORIGEN.MEDIA_JORNADA)
})

test('una regla por día de la semana devuelve config_dia', async () => {
  const port = puerto([{ tipo: TIPO.CONFIG_DIA, horas: '8.00', etiqueta: null }])
  const r = await jornadaConfigurada(port, { fecha: '2026-07-31' }) // viernes
  assert.deepEqual(r, { horas: 8, origen: 'config_dia' })
})

test('sin ninguna regla manda la calibración de la planilla: sin_config, nunca un número inventado', async () => {
  const r = await jornadaConfigurada(puerto([]), { fecha: '2026-07-30' })
  assert.deepEqual(r, { horas: null, origen: ORIGEN.SIN_CONFIG })
})

test('una regla cargada SIN horas (el sábado) dice «se carga a mano», no cero', async () => {
  const port = puerto([{ tipo: TIPO.CONFIG_DIA, horas: null, etiqueta: 'Sábado: sin regla única' }])
  const r = await jornadaConfigurada(port, { fecha: '2026-08-01' }) // sábado
  assert.equal(r.horas, null)
  assert.equal(r.origen, ORIGEN.SIN_CONFIG)
  assert.equal(r.etiqueta, 'Sábado: sin regla única')
})

test('la consulta recibe la fecha y su día de la semana, y resuelve la precedencia en SQL', async () => {
  const port = puerto([])
  await jornadaConfigurada(port, { fecha: '2026-08-17' })
  assert.deepEqual(port.llamadas[0].params, ['2026-08-17', 1]) // lunes
  // La regla de FECHA EXACTA gana sobre la de día de la semana: un feriado le gana a "los
  // lunes son de 9". Si este orden se toca, un feriado deja de precargarse en 0.
  assert.match(port.llamadas[0].sql, /order by \(c\.fecha is null\), t\.prioridad/)
})

test('una fecha ilegible se rechaza con un mensaje en castellano, sin llegar a la base', async () => {
  const port = puerto([])
  await assert.rejects(
    () => jornadaConfigurada(port, { fecha: '32/13/2026' }),
    /No entendí la fecha/,
  )
  assert.equal(port.llamadas.length, 0)
})

test('si la base no responde NO se degrada a sin_config: un feriado invisible precargaría a todos presentes', async () => {
  const port = { async query() { throw new Error('connection terminated') } }
  await assert.rejects(
    () => jornadaConfigurada(port, { fecha: '2026-05-01' }),
    /No pude leer la configuración de jornada/,
  )
})

// ── jornadaEfectiva ──────────────────────────────────────────────────────────

test('el feriado de 0 horas le gana a la calibración de la planilla', () => {
  const r = jornadaEfectiva({
    config: { horas: 0, origen: ORIGEN.FERIADO, etiqueta: 'Navidad' },
    calibrada: { horas: 9, origen: 'calibrado', muestras: 40, requiere_manual: false },
  })
  assert.equal(r.horas, 0)
  assert.equal(r.origen, ORIGEN.FERIADO)
  assert.equal(r.etiqueta, 'Navidad')
  assert.equal(r.requiere_manual, false)
})

test('sin configuración manda la planilla, que sigue siendo la fuente de verdad', () => {
  const r = jornadaEfectiva({
    config: { horas: null, origen: ORIGEN.SIN_CONFIG },
    calibrada: { horas: 9, origen: 'calibrado', muestras: 120, requiere_manual: false },
  })
  assert.equal(r.horas, 9)
  assert.equal(r.origen, 'calibrado')
  assert.equal(r.muestras, 120)
})

test('sin configuración y sin calibración: se pide a mano, no se inventa un número', () => {
  const r = jornadaEfectiva({
    config: { horas: null, origen: ORIGEN.SIN_CONFIG },
    calibrada: { horas: null, origen: 'piso', requiere_manual: true },
  })
  assert.equal(r.horas, null)
  assert.equal(r.requiere_manual, true)
  assert.equal(r.origen, ORIGEN.SIN_CONFIG)
})

test('sin ningún insumo tampoco se inventa nada', () => {
  const r = jornadaEfectiva()
  assert.deepEqual(r, { horas: null, origen: ORIGEN.SIN_CONFIG, requiere_manual: true })
})

// ── Los feriados sembrados ───────────────────────────────────────────────────

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRACION = join(AQUI, '../../supabase/migrations/20260731090000_asistencia_novedades_jornada.sql')

test('todos los feriados sembrados en la migración son fechas que existen, de 2026 y con 0 horas', () => {
  const sql = readFileSync(MIGRACION, 'utf8')
  const filas = [...sql.matchAll(/\('feriado', '(\d{4}-\d{2}-\d{2})', (\d+), '([^']+)'/g)]
  assert.ok(filas.length >= 14, `se esperaban al menos 14 feriados sembrados, hay ${filas.length}`)
  for (const [, fecha, horas, etiqueta] of filas) {
    assert.notEqual(diaSemanaDe(fecha), null, `fecha inexistente sembrada: ${fecha} (${etiqueta})`)
    assert.ok(fecha.startsWith('2026-'), `feriado fuera de 2026: ${fecha}`)
    assert.equal(horas, '0', `${etiqueta}: un feriado no tiene jornada ordinaria`)
  }
})

test('los trasladables cuya fecha final no se pudo verificar NO están sembrados', () => {
  const sql = readFileSync(MIGRACION, 'utf8')
  // Güemes (17/06) y Soberanía Nacional (20/11) se trasladan y las fuentes no coinciden.
  // Sembrar una fecha equivocada precargaría a toda la empresa en franco un día laborable.
  for (const fecha of ['2026-06-15', '2026-06-17', '2026-11-20', '2026-11-23']) {
    assert.ok(!sql.includes(`'feriado', '${fecha}'`), `no debería estar sembrado: ${fecha}`)
  }
})
