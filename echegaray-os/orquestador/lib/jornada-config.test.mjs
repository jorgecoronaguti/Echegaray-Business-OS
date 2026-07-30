// Tests de la jornada por configuración. Sin red y sin base: el `port` es un doble con
// `query`, y la migración se lee como texto para chequear las fechas sembradas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  TIPO, ORIGEN, ALCANCE, CLASE,
  diaSemanaDe, jornadaConfigurada, jornadaEfectiva, esFeriado, tieneAviso,
} from './jornada-config.mjs'

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

// ── El calendario completo: feriado ≠ día no laborable ───────────────────────

test('un día no laborable NO precarga 0 horas: en el sector privado la obra trabaja', async () => {
  // Turístico, Jueves Santo, día del gremio, asueto provincial. La regla existe y se ve, pero
  // el número lo pone la planilla. Precargar 0 mandaría a la cuadrilla entera a franco.
  const port = puerto([{
    tipo: TIPO.DIA_NO_LABORABLE, horas: null, etiqueta: 'Día no laborable turístico',
    alcance: ALCANCE.NACIONAL, clase: CLASE.TURISTICO, nota: 'Resolución 164/2025 JGM',
    decide_empleador: true,
  }])
  const r = await jornadaConfigurada(port, { fecha: '2026-03-23' })
  assert.equal(r.horas, null)
  assert.equal(r.origen, ORIGEN.SIN_CONFIG, 'sin número: decide la calibración de la planilla')
  assert.equal(r.regla, TIPO.DIA_NO_LABORABLE, 'pero la regla existe, y hay que poder decirlo')
  assert.equal(r.decide_empleador, true)
  assert.equal(r.clase, CLASE.TURISTICO)
  assert.equal(esFeriado(r), false)
  assert.equal(tieneAviso(r), true)
})

test('«no hay ninguna regla» y «hay regla y no pone número» no son lo mismo', async () => {
  const sinRegla = await jornadaConfigurada(puerto([]), { fecha: '2026-07-30' })
  assert.equal(sinRegla.regla, undefined)
  assert.equal(tieneAviso(sinRegla), false)

  const conRegla = await jornadaConfigurada(
    puerto([{ tipo: TIPO.CONFIG_DIA, horas: null, etiqueta: 'Sábado: sin regla única' }]),
    { fecha: '2026-08-01' },
  )
  assert.equal(conRegla.regla, TIPO.CONFIG_DIA)
  assert.equal(tieneAviso(conRegla), true)
})

test('el feriado provincial de San Juan viaja con su alcance, no se confunde con el nacional', async () => {
  const port = puerto([{
    tipo: TIPO.DIA_NO_LABORABLE, horas: null, etiqueta: 'Fundación de la Ciudad de San Juan',
    alcance: ALCANCE.PROVINCIAL, clase: CLASE.ASUETO_ADMINISTRATIVO,
    nota: 'para el sector privado es día no laborable y NO se paga doble', decide_empleador: true,
  }])
  const r = await jornadaConfigurada(port, { fecha: '2026-06-13' })
  assert.equal(r.alcance, ALCANCE.PROVINCIAL)
  assert.equal(r.clase, CLASE.ASUETO_ADMINISTRATIVO)
  assert.match(r.nota, /NO se paga doble/)
})

test('un feriado trasladado dice que lo es: el calendario del año que viene no se copia', async () => {
  const port = puerto([{
    tipo: TIPO.FERIADO, horas: '0.00', etiqueta: 'Día de la Soberanía Nacional',
    alcance: ALCANCE.NACIONAL, clase: CLASE.TRASLADADO,
    nota: 'Trasladado desde el viernes 20/11/2026 al lunes siguiente · Ley 27.399 art. 7',
  }])
  const r = await jornadaConfigurada(port, { fecha: '2026-11-23' })
  assert.equal(r.horas, 0)
  assert.equal(r.clase, CLASE.TRASLADADO)
  assert.equal(esFeriado(r), true)
  assert.equal(r.decide_empleador, undefined, 'un feriado no lo decide el empleador')
})

test('si la migración del calendario todavía no corrió, se cae sola a la consulta vieja', async () => {
  // Deploy en el orden equivocado: el código nuevo contra la base sin `clase`. Postgres tira
  // 42703 y el módulo reintenta sin esas columnas, en vez de dejar la asistencia sin funcionar.
  const llamadas = []
  const port = {
    async query(sql, params) {
      llamadas.push(sql)
      if (sql.includes('c.clase')) {
        const e = new Error('column c.clase does not exist')
        e.code = '42703'
        throw e
      }
      return { rows: [{ tipo: TIPO.FERIADO, horas: '0.00', etiqueta: 'Navidad', params }] }
    },
  }
  const r = await jornadaConfigurada(port, { fecha: '2026-12-25' })
  assert.equal(r.horas, 0)
  assert.equal(r.origen, TIPO.FERIADO)
  assert.equal(llamadas.length, 2)
})

test('un error de base que NO es «falta la columna» sigue cortando, no se enmascara', async () => {
  const port = {
    async query() {
      const e = new Error('connection terminated')
      e.code = '08006'
      throw e
    },
  }
  await assert.rejects(
    () => jornadaConfigurada(port, { fecha: '2026-05-01' }),
    /No pude leer la configuración de jornada/,
  )
})

// ── jornadaEfectiva con el calendario completo ───────────────────────────────

test('el día no laborable deja pasar la jornada de la planilla y arrastra el aviso', () => {
  const r = jornadaEfectiva({
    config: {
      horas: null, origen: ORIGEN.SIN_CONFIG, regla: TIPO.DIA_NO_LABORABLE,
      etiqueta: 'Día del Trabajador de la Construcción', alcance: ALCANCE.GREMIAL,
      clase: CLASE.NO_LABORABLE_CCT, decide_empleador: true,
    },
    calibrada: { horas: 9, origen: 'calibrado', muestras: 80 },
  })
  assert.equal(r.horas, 9, 'la obra trabaja: no se precarga franco')
  assert.equal(r.requiere_manual, false)
  assert.equal(r.decide_empleador, true, 'pero el jefe tiene que enterarse de qué día es')
  assert.equal(r.etiqueta, 'Día del Trabajador de la Construcción')
  assert.equal(r.clase, CLASE.NO_LABORABLE_CCT)
})

test('el feriado sigue ganándole a la planilla y no arrastra decide_empleador', () => {
  const r = jornadaEfectiva({
    config: { horas: 0, origen: ORIGEN.FERIADO, etiqueta: 'Año Nuevo', clase: CLASE.INAMOVIBLE },
    calibrada: { horas: 9, origen: 'calibrado', muestras: 40 },
  })
  assert.equal(r.horas, 0)
  assert.equal(r.clase, CLASE.INAMOVIBLE)
  assert.equal(r.decide_empleador, undefined)
})

// ── Los feriados sembrados ───────────────────────────────────────────────────

const AQUI = dirname(fileURLToPath(import.meta.url))
const DIR_MIGRACIONES = join(AQUI, '../../supabase/migrations')
const MIGRACION = join(DIR_MIGRACIONES, '20260731090000_asistencia_novedades_jornada.sql')
const CALENDARIO = join(DIR_MIGRACIONES, '20260731120000_jornada_calendario_alcance.sql')

/** Filas sembradas en un .sql, en el orden de columnas (tipo, fecha, horas, etiqueta, …). */
function filasSembradas(ruta) {
  const sql = readFileSync(ruta, 'utf8')
  return [...sql.matchAll(/\('(feriado|dia_no_laborable)', '(\d{4}-\d{2}-\d{2})', (null|\d+), '([^']+)'/g)]
    .map(([, tipo, fecha, horas, etiqueta]) => ({ tipo, fecha, horas, etiqueta }))
}

test('todos los feriados sembrados en la migración son fechas que existen, de 2026 y con 0 horas', () => {
  const filas = filasSembradas(MIGRACION)
  assert.ok(filas.length >= 14, `se esperaban al menos 14 feriados sembrados, hay ${filas.length}`)
  for (const { fecha, horas, etiqueta } of filas) {
    assert.notEqual(diaSemanaDe(fecha), null, `fecha inexistente sembrada: ${fecha} (${etiqueta})`)
    assert.ok(fecha.startsWith('2026-'), `feriado fuera de 2026: ${fecha}`)
    assert.equal(horas, '0', `${etiqueta}: un feriado no tiene jornada ordinaria`)
  }
})

test('los dos trasladables se sembraron en la fecha CORRIDA, no en la original', () => {
  // La migración anterior los dejó afuera porque las fuentes discrepaban. Se verificaron contra
  // la regla del art. 7 de la Ley 27.399 y el calendario oficial de 2026:
  //   · Güemes: miércoles 17/06 → LUNES ANTERIOR 15/06.
  //   · Soberanía: viernes 20/11 → LUNES SIGUIENTE 23/11.
  // El Decreto 614/2025, que sembró la duda, sólo alcanza a los que caen sábado o domingo.
  const sql = readFileSync(CALENDARIO, 'utf8')
  for (const fecha of ['2026-06-15', '2026-11-23']) {
    assert.ok(sql.includes(`'feriado', '${fecha}'`), `falta el trasladable ${fecha}`)
    assert.equal(diaSemanaDe(fecha), 1, `${fecha} tiene que ser lunes: un traslado va al lunes`)
  }
  for (const original of ['2026-06-17', '2026-11-20']) {
    assert.ok(!sql.includes(`'feriado', '${original}'`), `la fecha original no se siembra: ${original}`)
  }
})

test('el día de la semana de cada fecha sembrada es el que la fuente dice: un typo se ve acá', () => {
  const ESPERADO = {
    '2026-03-23': 1, // lunes previo al feriado del 24/03
    '2026-04-02': 4, // Jueves Santo
    '2026-04-22': 3, // miércoles · día del gremio
    '2026-06-13': 6, // sábado · Fundación de San Juan
    '2026-06-15': 1, // lunes · Güemes trasladado
    '2026-07-10': 5, // viernes posterior al 09/07
    '2026-11-23': 1, // lunes · Soberanía trasladada
    '2026-12-07': 1, // lunes previo al 08/12
  }
  const sembradas = new Set(filasSembradas(CALENDARIO).map((f) => f.fecha))
  for (const [fecha, dow] of Object.entries(ESPERADO)) {
    assert.ok(sembradas.has(fecha), `falta sembrar ${fecha}`)
    assert.equal(diaSemanaDe(fecha), dow, `${fecha} no cae el día que dice la fuente`)
  }
})

test('los días no laborables se siembran SIN horas: cero sería afirmar que la obra no trabaja', () => {
  const noLaborables = filasSembradas(CALENDARIO).filter((f) => f.tipo === 'dia_no_laborable')
  assert.equal(noLaborables.length, 6, '3 turísticos + Jueves Santo + día del gremio + San Juan')
  for (const { fecha, horas, etiqueta } of noLaborables) {
    assert.equal(horas, 'null', `${etiqueta} (${fecha}): un día no laborable no precarga 0`)
  }
})

test('cada fila sembrada lleva su fundamento: ninguna fecha entra sin decir de dónde sale', () => {
  const sql = readFileSync(CALENDARIO, 'utf8')
  const notas = [...sql.matchAll(/'migracion_20260731120000',\s*\n?\s*'([^']+)'/g)].map((m) => m[1])
  assert.equal(notas.length, filasSembradas(CALENDARIO).length, 'hay filas sin nota')
  for (const nota of notas) {
    assert.match(nota, /Ley 27\.399|Resolución 164\/2025|CCT 76\/75|administración pública/,
      `nota sin norma que la sostenga: «${nota}»`)
  }
})

test('lo que NO se pudo verificar no se sembró: ni municipales ni provinciales sin norma', () => {
  const sql = readFileSync(CALENDARIO, 'utf8')
  assert.match(sql, /QUÉ QUEDÓ AFUERA/, 'el hueco se documenta, no se tapa')
  // Un solo provincial: el 13/06. Si aparece otro sin fuente, este test lo caza.
  const provinciales = [...sql.matchAll(/'([^']*)',\s*'provincial'/g)]
  assert.equal(provinciales.length, 1, 'sólo la Fundación de San Juan está verificada')
})
