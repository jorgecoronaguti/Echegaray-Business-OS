// Tests del catálogo de motivos. Todo puro: sin red, sin base, sin planilla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVO, AMBITO, CATALOGO, motivoDe, motivosPara, exigeMotivo, validarNovedad,
} from './asistencia-motivos.mjs'

const JORNADA = 9

// ── El catálogo como contrato ────────────────────────────────────────────────

test('el catálogo cubre exactamente las claves declaradas en MOTIVO, sin sobras ni faltantes', () => {
  const enCatalogo = CATALOGO.map((m) => m.clave).sort()
  const declaradas = Object.values(MOTIVO).sort()
  assert.deepEqual(enCatalogo, declaradas)
})

test('cada motivo trae los campos del contrato y un orden único', () => {
  const ordenes = new Set()
  for (const m of CATALOGO) {
    assert.equal(typeof m.etiqueta, 'string', `${m.clave} sin etiqueta`)
    assert.equal(typeof m.requiere_aclaracion, 'boolean')
    assert.equal(typeof m.implica_horas_cero, 'boolean')
    assert.equal(typeof m.orden, 'number')
    assert.ok(m.ambitos.length > 0, `${m.clave} sin ámbito`)
    assert.ok(!ordenes.has(m.orden), `orden repetido: ${m.orden}`)
    ordenes.add(m.orden)
  }
})

test('sólo la falta es falta injustificada: franco, vacaciones y suspensión no lo son', () => {
  const injustificadas = CATALOGO.filter((m) => m.falta_injustificada).map((m) => m.clave)
  assert.deepEqual(injustificadas, [MOTIVO.FALTA])
  for (const c of [MOTIVO.FRANCO, MOTIVO.VACACIONES, MOTIVO.SUSPENSION]) {
    assert.equal(motivoDe(c).falta_injustificada, false)
    assert.equal(motivoDe(c).implica_horas_cero, true, `${c} tiene que dar 0 horas`)
  }
})

test('el accidente queda marcado para ART y es el único además de «otro» que exige aclaración', () => {
  const conArt = CATALOGO.filter((m) => m.art).map((m) => m.clave)
  assert.deepEqual(conArt, [MOTIVO.ACCIDENTE])
  const exigen = CATALOGO.filter((m) => m.requiere_aclaracion).map((m) => m.clave).sort()
  assert.deepEqual(exigen, [MOTIVO.ACCIDENTE, MOTIVO.OTRO].sort())
})

test('un motivo que no existe no se resuelve a uno «parecido»', () => {
  assert.equal(motivoDe('vacacion'), null)
  assert.equal(motivoDe(''), null)
  assert.equal(motivoDe(undefined), null)
  assert.equal(motivoDe('FRANCO').clave, MOTIVO.FRANCO) // mayúsculas sí, invención no
})

// ── motivosPara ──────────────────────────────────────────────────────────────

test('ausencia: se ofrecen los motivos de día completo y NO llegó tarde / se retiró antes', () => {
  const claves = motivosPara({ presente: false, horas: 0, jornada: JORNADA }).map((m) => m.clave)
  assert.deepEqual(claves, [
    MOTIVO.FALTA, MOTIVO.ENFERMEDAD, MOTIVO.ACCIDENTE, MOTIVO.PERMISO,
    MOTIVO.VACACIONES, MOTIVO.SUSPENSION, MOTIVO.FRANCO, MOTIVO.OTRO,
  ])
})

test('jornada parcial: arranca por llegó tarde y no ofrece franco ni vacaciones', () => {
  const claves = motivosPara({ presente: true, horas: 6, jornada: JORNADA }).map((m) => m.clave)
  assert.equal(claves[0], MOTIVO.LLEGO_TARDE)
  assert.equal(claves[1], MOTIVO.SE_RETIRO_ANTES)
  for (const c of [MOTIVO.FRANCO, MOTIVO.VACACIONES, MOTIVO.SUSPENSION, MOTIVO.FALTA]) {
    assert.ok(!claves.includes(c), `${c} no corresponde a una jornada parcial`)
  }
})

test('jornada completa: no se ofrece ningún motivo', () => {
  assert.deepEqual(motivosPara({ presente: true, horas: JORNADA, jornada: JORNADA }), [])
})

test('horas por encima de la jornada son horas extra: nunca se pide motivo', () => {
  assert.deepEqual(motivosPara({ presente: true, horas: 11, jornada: JORNADA }), [])
  assert.equal(exigeMotivo({ presente: true, horas: 11, jornada: JORNADA }), false)
})

test('sin jornada conocida (sábado) se ofrecen motivos parciales pero NO se exigen', () => {
  const claves = motivosPara({ presente: true, horas: 5, jornada: null }).map((m) => m.clave)
  assert.ok(claves.includes(MOTIVO.LLEGO_TARDE))
  assert.equal(exigeMotivo({ presente: true, horas: 5, jornada: null }), false)
})

// ── validarNovedad · ausencias ───────────────────────────────────────────────

test('el que no vino necesita motivo, y el error dice cuáles se aceptan', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA })
  assert.equal(r.ok, false)
  assert.match(r.error, /Falta el motivo/)
  assert.match(r.error, /Faltó/)
})

test('faltó sin aviso: queda registrado como falta injustificada', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.FALTA })
  assert.equal(r.ok, true)
  assert.equal(r.novedad.falta_injustificada, true)
  assert.equal(r.novedad.horas, 0)
  assert.equal(r.novedad.art, false)
})

test('vacaciones, franco y suspensión dan 0 horas y NO son falta injustificada', () => {
  for (const motivo of [MOTIVO.VACACIONES, MOTIVO.FRANCO, MOTIVO.SUSPENSION]) {
    const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo })
    assert.equal(r.ok, true, `${motivo}: ${r.error}`)
    assert.equal(r.novedad.falta_injustificada, false)
    assert.equal(r.novedad.motivo, motivo)
  }
})

test('un ausente con horas cargadas se rechaza: no se corrige en silencio', () => {
  const r = validarNovedad({ presente: false, horas: 4, jornada: JORNADA, motivo: MOTIVO.PERMISO })
  assert.equal(r.ok, false)
  assert.match(r.error, /las horas tienen que ser 0/i)
})

test('«llegó tarde» no es un motivo de ausencia', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.LLEGO_TARDE })
  assert.equal(r.ok, false)
  assert.match(r.error, /no corresponde para alguien que no vino/)
})

// ── validarNovedad · jornada parcial ─────────────────────────────────────────

test('media jornada sin motivo se rechaza; con «se retiró antes» entra', () => {
  const sin = validarNovedad({ presente: true, horas: 5, jornada: JORNADA })
  assert.equal(sin.ok, false)
  assert.match(sin.error, /Hizo menos que la jornada/)

  const con = validarNovedad({ presente: true, horas: 5, jornada: JORNADA, motivo: MOTIVO.SE_RETIRO_ANTES })
  assert.equal(con.ok, true)
  assert.equal(con.novedad.horas, 5)
  assert.equal(con.novedad.etiqueta, 'Se retiró antes')
})

test('vacaciones no es un motivo de jornada parcial: son 0 horas o no son vacaciones', () => {
  const r = validarNovedad({ presente: true, horas: 5, jornada: JORNADA, motivo: MOTIVO.VACACIONES })
  assert.equal(r.ok, false)
  assert.match(r.error, /día completo/)
})

test('el que se accidentó a media mañana: jornada parcial con motivo accidente y ART marcada', () => {
  const r = validarNovedad({
    presente: true, horas: 3, jornada: JORNADA, motivo: MOTIVO.ACCIDENTE,
    aclaracion: 'Se cortó la mano con la amoladora, lo llevaron a la clínica',
  })
  assert.equal(r.ok, true)
  assert.equal(r.novedad.art, true)
  assert.equal(r.novedad.falta_injustificada, false)
})

test('un accidente sin una línea de qué pasó no entra: hay que denunciarlo a la ART', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.ACCIDENTE })
  assert.equal(r.ok, false)
  assert.match(r.error, /ART/)
})

// ── validarNovedad · jornada completa y horas extra ──────────────────────────

test('jornada completa: no hace falta motivo, y ponerlo se rechaza', () => {
  const ok = validarNovedad({ presente: true, horas: JORNADA, jornada: JORNADA })
  assert.equal(ok.ok, true)
  assert.equal(ok.novedad.motivo, null)

  const mal = validarNovedad({ presente: true, horas: JORNADA, jornada: JORNADA, motivo: MOTIVO.PERMISO })
  assert.equal(mal.ok, false)
  assert.match(mal.error, /jornada completa/)
})

test('trabajó de más: son horas extra, no una novedad', () => {
  const ok = validarNovedad({ presente: true, horas: 11, jornada: JORNADA })
  assert.equal(ok.ok, true)
  assert.equal(ok.novedad.motivo, null)

  const mal = validarNovedad({ presente: true, horas: 11, jornada: JORNADA, motivo: MOTIVO.OTRO, aclaracion: 'x' })
  assert.equal(mal.ok, false)
  assert.match(mal.error, /horas extra/)
})

test('sábado sin jornada configurada: 5 horas entran sin motivo, y con motivo también', () => {
  const sin = validarNovedad({ presente: true, horas: 5, jornada: null })
  assert.equal(sin.ok, true)
  assert.equal(sin.novedad.motivo, null)
  assert.equal(sin.novedad.jornada, null)

  const con = validarNovedad({ presente: true, horas: 5, jornada: null, motivo: MOTIVO.LLEGO_TARDE })
  assert.equal(con.ok, true)
  assert.equal(con.novedad.motivo, MOTIVO.LLEGO_TARDE)
})

// ── validarNovedad · «otro», horas y obra realizada ──────────────────────────

test('«otro» sin aclaración se rechaza; con aclaración se guarda recortada', () => {
  const sin = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.OTRO })
  assert.equal(sin.ok, false)
  assert.match(sin.error, /aclaración/i)

  const con = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.OTRO, aclaracion: '  Trámite en IERIC  ',
  })
  assert.equal(con.ok, true)
  assert.equal(con.novedad.aclaracion, 'Trámite en IERIC')
})

test('«otro» con una aclaración de sólo espacios no cuenta como aclaración', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.OTRO, aclaracion: '   ' })
  assert.equal(r.ok, false)
})

test('un motivo inexistente se rechaza nombrándolo, no se elige el más parecido', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: 'licencia' })
  assert.equal(r.ok, false)
  assert.match(r.error, /«licencia»/)
})

test('horas con coma decimal (el archivo usa coma) se interpretan bien', () => {
  const r = validarNovedad({ presente: true, horas: '8,5', jornada: JORNADA, motivo: MOTIVO.LLEGO_TARDE })
  assert.equal(r.ok, true)
  assert.equal(r.novedad.horas, 8.5)
})

test('horas imposibles se rechazan con un mensaje que se le puede mostrar al jefe', () => {
  assert.match(validarNovedad({ presente: true, horas: -2, jornada: JORNADA }).error, /negativas/)
  assert.match(validarNovedad({ presente: true, horas: 30, jornada: JORNADA }).error, /superar/)
  assert.match(validarNovedad({ presente: true, horas: 'ocho', jornada: JORNADA }).error, /número/)
  assert.match(validarNovedad({ presente: true, horas: '', jornada: JORNADA }).error, /Faltan las horas/)
})

test('presente con 0 horas es una contradicción: se pide marcarlo ausente', () => {
  const r = validarNovedad({ presente: true, horas: 0, jornada: JORNADA, motivo: MOTIVO.FALTA })
  assert.equal(r.ok, false)
  assert.match(r.error, /ausente/)
})

test('sin decir si estuvo o no, no se valida nada', () => {
  const r = validarNovedad({ horas: 9, jornada: JORNADA })
  assert.equal(r.ok, false)
  assert.match(r.error, /estuvo/)
})

test('la obra realizada se guarda cuando trabajó en otra obra, y se rechaza si no trabajó', () => {
  const ok = validarNovedad({
    presente: true, horas: 4, jornada: JORNADA, motivo: MOTIVO.PERMISO, obra_realizada: 'Messina',
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.novedad.obra_realizada, 'Messina')

  const mal = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.FALTA, obra_realizada: 'Messina',
  })
  assert.equal(mal.ok, false)
  assert.match(mal.error, /no corresponde indicar en qué obra/)
})

test('la novedad devuelta no trae undefined: lo que falta viene en null, listo para guardar', () => {
  const { novedad } = validarNovedad({ presente: true, horas: JORNADA, jornada: JORNADA })
  for (const [k, v] of Object.entries(novedad)) assert.notEqual(v, undefined, `${k} vino undefined`)
  assert.equal(novedad.aclaracion, null)
  assert.equal(novedad.obra_realizada, null)
})

test('AMBITO expone los dos contextos que usa la pantalla', () => {
  assert.deepEqual(Object.values(AMBITO).sort(), ['ausencia', 'parcial'])
})
