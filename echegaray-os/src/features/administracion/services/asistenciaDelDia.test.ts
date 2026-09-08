import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  asistenciaDelDia, clasificar, filtrarAsistencia, resumenAsistencia, resumenHoras, resumenFichaje,
  textoFichaje,
} from './asistenciaDelDia.ts'
import type { RegistroDelDia } from './asistenciaDelDia.ts'
import type { Esperado } from './presencia.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN, uno solo y grande: que la pantalla vuelva a decir «no fichó»
// —o cualquier variante de ausencia— sobre alguien a quien simplemente todavía no le cargaron las
// horas. Fichaje y carga de horas son dos hechos con dos fuentes, y ninguna de las dos funciones de
// abajo puede mirar la otra.

const reg = (p: Partial<RegistroDelDia> & { persona_id: string }): RegistroDelDia => ({
  nombre: null, categoria: null, obra_id: 'obra-1', obra: 'Obra Uno',
  horas: 8, tipo_hora: 'normal', notas: null, ...p,
})

const esp = (id: string, nombre: string, obra = 'obra-1'): Esperado => ({
  id, nombre_completo: nombre, categoria: 'oficial',
  obra_actual_id: obra, obra_actual: 'Obra Uno', cuadrilla: null,
})

test('las horas se suman como CANTIDAD y no escriben ninguna presencia', () => {
  const c = clasificar([reg({ persona_id: 'a', horas: 8 }), reg({ persona_id: 'a', horas: 1.5, tipo_hora: 'extra_50' })])
  assert.equal(c.horas, 9.5, 'las extras son horas trabajadas y suman')
  assert.equal(c.presencia, 'sin_marcar', 'nadie declaró ni fichó: 9,5 h no lo ponen presente')
  assert.equal(c.motivo, null)
})

test('ausencia declarada → ausente con su motivo, y sus horas NO son trabajo', () => {
  const c = clasificar([reg({ persona_id: 'a', horas: 8.8, tipo_hora: 'ausencia', notas: 'sin aviso' })])
  assert.equal(c.presencia, 'ausente')
  assert.equal(c.fuente, 'hh', 'la declaró la carga de horas, que es el camino viejo y sigue valiendo')
  assert.equal(c.motivo, 'sin aviso')
  // `registros_hh` exige horas > 0, así que la ausencia se guarda con la jornada entera. Contarlas
  // como trabajadas inflaría las HH de la obra con un día que nadie trabajó.
  assert.equal(c.horas, null)
})

test('licencia NO se colapsa dentro de ausente', () => {
  // Para quien liquida son dos novedades distintas: una licencia por enfermedad se paga y una
  // falta sin aviso no. Si alguien las vuelve a unificar, este test se pone rojo.
  const c = clasificar([reg({ persona_id: 'a', horas: 9, tipo_hora: 'licencia', notas: 'enfermedad' })])
  assert.equal(c.presencia, 'licencia')
  assert.equal(c.motivo, 'enfermedad')
})

test('la ausencia declarada gana sobre una imputación de horas del mismo día', () => {
  const c = clasificar([reg({ persona_id: 'a', horas: 8 }), reg({ persona_id: 'a', horas: 8.8, tipo_hora: 'ausencia' })])
  assert.equal(c.presencia, 'ausente', 'si alguien declaró que no vino, la pantalla no dice que trabajó')
  assert.equal(c.motivo, null, 'sin motivo cargado no se inventa uno')
})

test('sin ningún registro → SIN MARCAR, nunca ausente ni «no fichó»', () => {
  const c = clasificar([])
  assert.equal(c.presencia, 'sin_marcar')
  assert.equal(c.fuente, null)
  assert.equal(c.horas, null, 'sin horas cargadas no es cero horas')
})

test('una marca de fichaje sin horas deja las DOS verdades: fichó, y sigue sin cargar', () => {
  // Las dos funciones son independientes a propósito. Ésta es la afirmación que la pantalla vieja
  // no podía hacer: alguien puede haber fichado Y estar sin cargar al mismo tiempo.
  const f = resumenFichaje([{ entrada: '2026-09-08T07:05:00-03:00', salida: null }])
  assert.equal(f.hayMarcas, true)
  assert.equal(f.entradas, 1)
  assert.equal(f.salidas, 0)

  const dia = asistenciaDelDia({ esperados: [esp('a', 'GONZALEZ JUAN')], registros: [] })
  assert.equal(dia.obras[0].gente[0].presencia, 'sin_marcar')
  assert.equal(dia.sinMarcar, 1)
  assert.equal(dia.sinHoras, 1)
  assert.equal(dia.ausentes + dia.licencias, 0, 'fichar no crea una ausencia, y no fichar tampoco')
})

test('sin una sola marca el fichaje se dice UNA vez y no acusa a nadie', () => {
  const f = resumenFichaje([])
  assert.equal(f.hayMarcas, false)
  const texto = textoFichaje(f)
  assert.match(texto, /sin marcas de entrada\/salida/i)
  assert.match(texto, /todavía no está en uso/i)
  // EL DEFECTO ORIGINAL: 17 tarjetas «No fichó» y un «0 de 17». Ninguna de las dos cosas puede
  // volver a salir de esta función.
  assert.doesNotMatch(texto, /fich[oó]|ausent/i)
  assert.doesNotMatch(texto, /\d+\s+de\s+\d+/)
})

test('con marcas el fichaje cuenta entradas y salidas, y nunca contra el plantel', () => {
  const f = resumenFichaje([
    { entrada: '2026-09-08T07:00:00-03:00', salida: '2026-09-08T17:00:00-03:00' },
    { entrada: '2026-09-08T07:10:00-03:00', salida: null },
  ])
  assert.equal(textoFichaje(f), '2 entradas · 1 salida')
  assert.doesNotMatch(textoFichaje(f), /\d+\s+de\s+\d+/, 'un denominador convertiría el desuso en falta')
})

test('el día se agrupa por obra y los tres conteos cierran contra la gente dibujada', () => {
  const dia = asistenciaDelDia({
    esperados: [esp('a', 'AGUERO C'), esp('b', 'BENITEZ L'), esp('c', 'CORONA M'), esp('d', 'DIAZ N', 'obra-2')],
    registros: [
      reg({ persona_id: 'a', horas: 9 }),
      reg({ persona_id: 'b', horas: 8.8, tipo_hora: 'ausencia', notas: 'sin aviso' }),
      reg({ persona_id: 'd', horas: 8, obra_id: 'obra-2', obra: 'Obra Dos' }),
    ],
  })
  assert.equal(dia.plantel, 4)
  assert.equal(dia.conHoras, 2, 'la carga de horas se cuenta aparte de la presencia')
  assert.equal(dia.ausentes, 1)
  assert.equal(dia.presentes, 0, 'nadie declaró a nadie presente: dos personas con horas no son dos presentes')
  assert.equal(dia.sinMarcar, 3)
  assert.equal(dia.horas, 17, 'las 8,8 de la ausencia no suman horas trabajadas')

  const uno = dia.obras.find((o) => o.obraId === 'obra-1')
  assert.ok(uno)
  assert.equal(uno.gente.length, 3)
  assert.equal(uno.presentes + uno.ausentes + uno.licencias + uno.sinMarcar, uno.gente.length,
    'el conteo de presencia no puede decir otra cosa que la lista')
  assert.equal(uno.conHoras + uno.sinHoras, uno.gente.length, 'el conteo de carga tampoco')
  assert.deepEqual(uno.gente.map((g) => g.nombre), ['AGUERO C', 'BENITEZ L', 'CORONA M'])
})

test('quien cargó horas en una obra a la que ya no está asignado igual aparece', () => {
  // Sus horas existen y le pesan a esa obra: esconderlo dejaría HH imputadas que ninguna pantalla
  // muestra, que es como se pierde el costo de mano de obra de una obra entera.
  const dia = asistenciaDelDia({
    esperados: [],
    registros: [reg({ persona_id: 'x', nombre: 'SOSA R', horas: 7, obra_id: 'obra-9', obra: 'Obra Nueve' })],
  })
  assert.equal(dia.plantel, 1)
  assert.equal(dia.obras[0].nombre, 'Obra Nueve')
  assert.equal(dia.obras[0].gente[0].nombre, 'SOSA R')
})

test('la persona cargada en otra obra se cuenta en la obra donde imputó, no en la asignada', () => {
  const dia = asistenciaDelDia({
    esperados: [esp('a', 'AGUERO C')],
    registros: [reg({ persona_id: 'a', horas: 8, obra_id: 'obra-2', obra: 'Obra Dos' })],
  })
  assert.equal(dia.obras.length, 1)
  assert.equal(dia.obras[0].obraId, 'obra-2', 'las horas pesan donde se imputaron')
})

test('el resumen del titular nombra las tres cosas y ninguna se llama ausencia sin serlo', () => {
  const dia = asistenciaDelDia({
    esperados: [esp('a', 'A'), esp('b', 'B')],
    registros: [reg({ persona_id: 'a', horas: 8 })],
  })
  assert.equal(resumenAsistencia(dia), '0 presentes · 0 ausentes · 0 licencia · 2 sin marcar')
  assert.equal(resumenHoras(dia), '8 h cargadas · 1 persona sin horas')
  assert.doesNotMatch(resumenAsistencia(dia), /fich/i, 'el titular de la asistencia no habla de fichaje')
  assert.doesNotMatch(resumenAsistencia(dia), /\bh\b|hora/i, 'la frase de la presencia no puede hablar de horas')
})

test('la búsqueda no puede borrarle las horas a nadie ni cambiarle la presencia', () => {
  // EL DEFECTO: filtrar los registros crudos antes de clasificar sacaría la fila de horas de la
  // persona y la dejaría sin cargar — la pantalla afirmaría que no se le cargó el día porque el
  // texto tipeado no coincide.
  const dia = asistenciaDelDia({
    esperados: [esp('a', 'AGUERO C'), esp('b', 'BENITEZ L')],
    registros: [reg({ persona_id: 'a', horas: 9 })],
  })
  const f = filtrarAsistencia(dia, 'aguero')
  assert.equal(f.plantel, 1)
  assert.equal(f.conHoras, 1)
  assert.equal(f.sinHoras, 0)
  assert.equal(f.obras[0].gente[0].horas, 9)
  assert.equal(f.obras[0].gente[0].presencia, 'sin_marcar')
  assert.equal(f.obras[0].conHoras, 1, 'el conteo de la obra se rehace sobre lo visible')
})

test('sin nadie esperado ni nada cargado, el resumen lo dice sin inventar un cero de fichaje', () => {
  const dia = asistenciaDelDia({ esperados: [], registros: [] })
  assert.equal(dia.plantel, 0)
  assert.match(resumenAsistencia(dia), /Nadie con asignación vigente/)
})

// ── LA PRESENCIA DECLARADA (`asistencia_dia`, 08/09/2026) ────────────────────────────────────────
//
// El defecto que atrapan: que la pantalla siga diciendo «sin cargar» de alguien a quien el jefe
// declaró presente esta mañana, o que tape una ausencia declarada que tiene horas cargadas encima.

test('declarado presente y sin horas NO es «sin cargar»: alguien lo miró y dijo que estaba', () => {
  const c = clasificar([], 'presente')
  assert.equal(c.presencia, 'presente')
  assert.equal(c.fuente, 'declarada')
  assert.equal(c.horas, null)
  assert.equal(c.conflicto ?? false, false)
})

test('declarado presente y con horas: sigue presente Y tiene 8 h. Las dos cosas son ciertas', () => {
  const c = clasificar([reg({ persona_id: 'a', horas: 8 })], 'presente')
  assert.equal(c.presencia, 'presente', 'las horas no pueden pisar la declaración del jefe')
  assert.equal(c.horas, 8)
})

test('declarado ausente con horas cargadas: conflicto, y las horas SE SIGUEN VIENDO', () => {
  const c = clasificar([reg({ persona_id: 'a', horas: 8 })], 'ausente')
  assert.equal(c.presencia, 'ausente')
  assert.equal(c.conflicto, true, 'la contradicción quedó tapada')
  assert.equal(c.horas, 8, 'se escondieron las horas que contradicen la ausencia declarada')
})

test('la ausencia declarada en asistencia_dia le gana a las horas cargadas como normales', () => {
  assert.equal(clasificar([reg({ persona_id: 'a', horas: 8 })], 'licencia').presencia, 'licencia')
})

test('sin presencia declarada la ausencia vieja de `registros_hh` sigue valiendo', () => {
  assert.equal(clasificar([]).presencia, 'sin_marcar')
  assert.equal(clasificar([]).conflicto ?? false, false)
  assert.equal(clasificar([reg({ persona_id: 'a', tipo_hora: 'ausencia', notas: 'faltó' })]).presencia, 'ausente')
})

test('el presente declarado sin horas es PRESENTE arriba y SIN HORAS abajo, en dos cuentas', () => {
  const d = asistenciaDelDia({
    esperados: [esp('p1', 'Uno'), esp('p2', 'Dos')],
    registros: [reg({ persona_id: 'p2', horas: 8 })],
    presencia: [{ persona_id: 'p1', estado: 'presente', motivo: null }],
  })
  assert.equal(d.conHoras, 1)
  assert.equal(d.sinHoras, 1, 'un presente sin horas infló el conteo de la carga')
  assert.equal(d.presentes, 1)
  assert.equal(d.sinMarcar, 1, 'p2 tiene 8 h y nadie lo declaró: sigue sin marcar')
  assert.equal(d.obras[0].gente.find((g) => g.personaId === 'p1')?.presencia, 'presente')
})

// ── PRESENCIA Y HORAS SON DOS CAMPOS, NUNCA UNO (08/09/2026, tercera marca del dueño) ────────────
//
// *«todas las pantallas en donde aparezca el concepto de fichado no tiene que resolverse con las
// hs; está mal: una cosa es asistencia o activo en el día y otra cosa son las cantidades de hs»*.
//
// EL DEFECTO QUE ATRAPAN: que un número de horas vuelva a fabricar una presencia. `clasificar`
// devolvía un solo `estado` donde `con_horas` era una CANTIDAD disfrazada de ESTADO — nadie había
// mirado a esa persona, sólo le habían cargado el día— y `sin_cargar` mezclaba «no hay horas» con
// «nadie declaró nada». Con un solo campo la pantalla no puede decir las dos verdades a la vez.

test('9 h cargadas y nadie que lo haya declarado: SIN MARCAR, con sus 9 h al lado', () => {
  const c = clasificar([reg({ persona_id: 'a', horas: 9 })])
  assert.equal(c.presencia, 'sin_marcar', 'las horas fabricaron una presencia que nadie afirmó')
  assert.equal(c.horas, 9, 'la cantidad se sigue viendo: es el otro hecho, no el mismo')
  assert.equal(c.fuente, null, 'sin declaración ni fichaje no hay fuente de presencia')
})

test('ausencia declarada y ni una fila de horas: AUSENTE y horas en null, que no es cero', () => {
  const c = clasificar([], 'ausente')
  assert.equal(c.presencia, 'ausente')
  assert.equal(c.horas, null)
  assert.equal(c.fuente, 'declarada')
  assert.equal(c.conflicto ?? false, false)
})

test('declarado presente sin horas y sin marcar con horas son DOS filas distintas y las dos válidas', () => {
  const declarado = clasificar([], 'presente')
  assert.equal(declarado.presencia, 'presente')
  assert.equal(declarado.horas, null)

  const conHoras = clasificar([reg({ persona_id: 'b', horas: 8 })])
  assert.equal(conHoras.presencia, 'sin_marcar')
  assert.equal(conHoras.horas, 8)
})
