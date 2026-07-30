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
    assert.equal(typeof m.paraliza_obra, 'boolean', `${m.clave} sin paraliza_obra`)
    assert.equal(typeof m.orden, 'number')
    assert.ok(m.ambitos.length > 0, `${m.clave} sin ámbito`)
    assert.ok(!ordenes.has(m.orden), `orden repetido: ${m.orden}`)
    ordenes.add(m.orden)
  }
})

test('sólo faltar es falta injustificada: franco, vacaciones y suspensión no lo son', () => {
  const injustificadas = CATALOGO.filter((m) => m.falta_injustificada).map((m) => m.clave).sort()
  assert.deepEqual(injustificadas, [MOTIVO.FALTA, MOTIVO.FALTA_CON_AVISO].sort())
  for (const c of [MOTIVO.FRANCO, MOTIVO.VACACIONES, MOTIVO.SUSPENSION, MOTIVO.LICENCIA_ESPECIAL]) {
    assert.equal(motivoDe(c).falta_injustificada, false)
    assert.equal(motivoDe(c).implica_horas_cero, true, `${c} tiene que dar 0 horas`)
  }
})

test('avisar no justifica la falta, pero queda distinguible del que no apareció', () => {
  // Las dos son injustificadas: avisar no es una justificación. Lo que cambia es lo que el
  // jefe pudo hacer esa mañana, y sin el dato la planificación no puede aprender nada.
  assert.equal(motivoDe(MOTIVO.FALTA_CON_AVISO).falta_injustificada, true)
  assert.notEqual(motivoDe(MOTIVO.FALTA_CON_AVISO).clave, motivoDe(MOTIVO.FALTA).clave)
})

test('los dos accidentes van a ART, y son los únicos', () => {
  const conArt = CATALOGO.filter((m) => m.art).map((m) => m.clave).sort()
  assert.deepEqual(conArt, [MOTIVO.ACCIDENTE, MOTIVO.ACCIDENTE_IN_ITINERE].sort())
  // Separados a propósito: el in itinere se denuncia igual pero NO ocurrió en el obrador, y
  // sumarlos juntos falsearía el índice de siniestralidad de la obra.
  assert.notEqual(motivoDe(MOTIVO.ACCIDENTE).clave, motivoDe(MOTIVO.ACCIDENTE_IN_ITINERE).clave)
})

test('exigen aclaración exactamente los motivos donde el texto es la mitad del dato', () => {
  const exigen = CATALOGO.filter((m) => m.requiere_aclaracion).map((m) => m.clave).sort()
  assert.deepEqual(exigen, [
    MOTIVO.ACCIDENTE, MOTIVO.ACCIDENTE_IN_ITINERE, MOTIVO.LICENCIA_ESPECIAL, MOTIVO.OTRO,
  ].sort())
})

test('paralizar la obra es una lectura distinta del ausentismo: la gente estaba', () => {
  const paran = CATALOGO.filter((m) => m.paraliza_obra).map((m) => m.clave).sort()
  assert.deepEqual(paran, [MOTIVO.LLUVIA, MOTIVO.SIN_TAREA, MOTIVO.PARO].sort())
  // Ninguna es falta injustificada: el trabajador se presentó y no hubo trabajo.
  for (const c of paran) assert.equal(motivoDe(c).falta_injustificada, false, c)
  // Y ninguna falta (la persona ausente) paraliza la obra.
  for (const c of [MOTIVO.FALTA, MOTIVO.FALTA_CON_AVISO, MOTIVO.VACACIONES]) {
    assert.equal(motivoDe(c).paraliza_obra, false, c)
  }
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
    MOTIVO.FALTA, MOTIVO.FALTA_CON_AVISO, MOTIVO.LLUVIA, MOTIVO.SIN_TAREA, MOTIVO.PARO,
    MOTIVO.ENFERMEDAD, MOTIVO.ACCIDENTE, MOTIVO.ACCIDENTE_IN_ITINERE, MOTIVO.PERMISO,
    MOTIVO.LICENCIA_ESPECIAL, MOTIVO.VACACIONES, MOTIVO.SUSPENSION, MOTIVO.FRANCO, MOTIVO.OTRO,
  ])
})

test('jornada parcial: arranca por llegó tarde y no ofrece franco ni vacaciones', () => {
  const claves = motivosPara({ presente: true, horas: 6, jornada: JORNADA }).map((m) => m.clave)
  assert.equal(claves[0], MOTIVO.LLEGO_TARDE)
  assert.equal(claves[1], MOTIVO.SE_RETIRO_ANTES)
  for (const c of [
    MOTIVO.FRANCO, MOTIVO.VACACIONES, MOTIVO.SUSPENSION, MOTIVO.FALTA,
    MOTIVO.FALTA_CON_AVISO, MOTIVO.LICENCIA_ESPECIAL,
  ]) {
    assert.ok(!claves.includes(c), `${c} no corresponde a una jornada parcial`)
  }
})

test('las causas de obra parada quedan arriba en las dos listas: se cargan cuarenta veces seguidas', () => {
  const ausencia = motivosPara({ presente: false, horas: 0, jornada: JORNADA }).map((m) => m.clave)
  const parcial = motivosPara({ presente: true, horas: 4, jornada: JORNADA }).map((m) => m.clave)
  for (const lista of [ausencia, parcial]) {
    assert.ok(lista.indexOf(MOTIVO.LLUVIA) >= 0 && lista.indexOf(MOTIVO.LLUVIA) <= 2)
    assert.ok(lista.includes(MOTIVO.SIN_TAREA))
    assert.ok(lista.includes(MOTIVO.PARO))
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

// ── Los casos que se viven en obra ───────────────────────────────────────────
// Uno por cada situación real. Si mañana alguien saca un motivo del catálogo, el que se rompe
// es el caso de obra, no un test abstracto sobre una lista.

test('llovió y la obra paró a media mañana: la gente estaba, no es ausentismo', () => {
  const r = validarNovedad({ presente: true, horas: 3, jornada: JORNADA, motivo: MOTIVO.LLUVIA })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.paraliza_obra, true)
  assert.equal(r.novedad.falta_injustificada, false)
})

test('llovió todo el día y se mandó a todos a la casa: 0 horas y sigue sin ser falta', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.LLUVIA })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.paraliza_obra, true)
  assert.equal(r.novedad.falta_injustificada, false)
})

test('no llegó el material: la obra se paró por culpa nuestra y queda registrado como tal', () => {
  const r = validarNovedad({ presente: true, horas: 2, jornada: JORNADA, motivo: MOTIVO.SIN_TAREA })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.paraliza_obra, true)
  assert.equal(r.novedad.motivo, MOTIVO.SIN_TAREA)
})

test('paro gremial: no mancha el legajo de la cuadrilla entera como falta injustificada', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.PARO })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.falta_injustificada, false)
  assert.equal(r.novedad.paraliza_obra, true)
})

test('accidente in itinere: va a ART igual, pero NO como accidente de obra', () => {
  const r = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.ACCIDENTE_IN_ITINERE,
    aclaracion: 'Lo chocaron en la moto viniendo a la obra, está en el hospital',
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.art, true)
  assert.notEqual(r.novedad.motivo, MOTIVO.ACCIDENTE)
})

test('un in itinere sin contar qué pasó tampoco entra: la denuncia necesita el relato', () => {
  const r = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.ACCIDENTE_IN_ITINERE,
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /aclaración/i)
})

test('licencia por fallecimiento: día completo, pagada por ley, y exige decir cuál es', () => {
  const sin = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.LICENCIA_ESPECIAL,
  })
  assert.equal(sin.ok, false, 'sin decir cuál licencia no se puede saber cuántos días corresponden')

  const con = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.LICENCIA_ESPECIAL,
    aclaracion: 'Fallecimiento del padre',
  })
  assert.equal(con.ok, true, con.error)
  assert.equal(con.novedad.falta_injustificada, false)
  assert.equal(con.novedad.horas, 0)
})

test('una licencia especial no es media jornada: son días enteros', () => {
  const r = validarNovedad({
    presente: true, horas: 5, jornada: JORNADA, motivo: MOTIVO.LICENCIA_ESPECIAL, aclaracion: 'Examen',
  })
  assert.equal(r.ok, false)
})

test('faltó con aviso: sigue siendo injustificada y se distingue del que no apareció', () => {
  const conAviso = validarNovedad({
    presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.FALTA_CON_AVISO,
  })
  const sinAviso = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.FALTA })
  assert.equal(conAviso.ok, true, conAviso.error)
  assert.equal(conAviso.novedad.falta_injustificada, true)
  assert.equal(sinAviso.novedad.falta_injustificada, true)
  assert.notEqual(conAviso.novedad.motivo, sinAviso.novedad.motivo)
})

test('cambio de obra con jornada completa: no hace falta motivo y la obra queda registrada', () => {
  const r = validarNovedad({
    presente: true, horas: JORNADA, jornada: JORNADA, obra_realizada: 'San Francisco',
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.motivo, null)
  assert.equal(r.novedad.obra_realizada, 'San Francisco')
})

test('feriado trabajado: jornada 0 y horas cargadas son horas extra, no una novedad', () => {
  // Con el calendario, un feriado llega con jornada 0. El que igual fue a la obra hizo horas
  // por encima de la jornada del día: eso lo calcula el núcleo, no se le pide motivo.
  const r = validarNovedad({ presente: true, horas: 8, jornada: 0 })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.motivo, null)
  assert.equal(r.novedad.jornada, 0)
})

test('feriado no trabajado: 0 horas con motivo franco, y no es falta', () => {
  const r = validarNovedad({ presente: false, horas: 0, jornada: 0, motivo: MOTIVO.FRANCO })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.falta_injustificada, false)
})

test('día no laborable trabajado normal: la jornada es la de siempre y no hay novedad', () => {
  // Un turístico o el Jueves Santo NO precargan 0: la obra trabaja. Sin novedad que explicar.
  const r = validarNovedad({ presente: true, horas: JORNADA, jornada: JORNADA })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.novedad.motivo, null)
})

test('edición histórica: cargar un día pasado valida igual, las reglas no miran el calendario', () => {
  // El jefe carga el lunes lo que pasó el viernes. `validarNovedad` es pura y no recibe fecha:
  // la ventana de fechas permitida la decide la pantalla, no el catálogo de motivos.
  const r = validarNovedad({
    presente: true, horas: 4, jornada: JORNADA, motivo: MOTIVO.SE_RETIRO_ANTES,
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(Object.keys(r.novedad).includes('fecha'), false)
})

test('la novedad trae las tres marcas que la base materializa, siempre booleanas', () => {
  const { novedad } = validarNovedad({ presente: false, horas: 0, jornada: JORNADA, motivo: MOTIVO.FALTA })
  for (const k of ['falta_injustificada', 'art', 'paraliza_obra']) {
    assert.equal(typeof novedad[k], 'boolean', `${k} tiene que llegar a la base como booleano`)
  }
})
