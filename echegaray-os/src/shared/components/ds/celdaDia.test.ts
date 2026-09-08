import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  combinarCeldaDia, decidirCeldaDia, formatearHoras, tituloDeConflicto,
  type EntradaCeldaDia, type FuentesDelDia,
} from './celdaDia.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN: que la capa de horas vuelva a hablar de presencia («sin horas»
// pintado como falta) o que la capa de presencia vuelva a inventar un «no fichó» donde sólo hay
// silencio. Cada capa mira su dato y nada más.

const habil = (x: Partial<EntradaCeldaDia>): EntradaCeldaDia =>
  ({ presencia: 'sin_marca', horas: null, dia: 'habil', ...x })

test('presente sin horas: ● verde arriba, abajo vacío con «sin cargar» neutro — no es una falta', () => {
  const c = decidirCeldaDia(habil({ presencia: 'ficho' }))
  assert.equal(c.arriba.simbolo, '●')
  assert.equal(c.arriba.tono, 'pos')
  assert.equal(c.abajo.texto, '')
  assert.equal(c.abajo.sinCargar, true)
  assert.match(c.titulo, /no es una falta/)
  assert.doesNotMatch(c.titulo, /ausen/i)
})

test('horas sin fichaje: el número en tinta y arriba NADA — jamás «no fichó»', () => {
  const c = decidirCeldaDia(habil({ horas: 8 }))
  assert.equal(c.abajo.texto, '8,0')
  assert.equal(c.abajo.tono, 'tinta')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.arriba.simbolo, '')
  assert.equal(c.arriba.tono, 'ninguno')
  assert.doesNotMatch(c.titulo, /no fich/i)
})

test('las dos verdades juntas: fichó Y tiene horas → ● y el número, cada uno en su capa', () => {
  const c = decidirCeldaDia(habil({ presencia: 'ficho', horas: 9.5 }))
  assert.equal(c.arriba.simbolo, '●')
  assert.equal(c.abajo.texto, '9,5')
  assert.equal(c.titulo, 'Fichó · 9,5 h cargadas')
})

test('ausencia declarada: A en rojo arriba, abajo vacío y SIN marco de «sin cargar»', () => {
  const c = decidirCeldaDia(habil({ presencia: 'ausente', motivo: 'Enfermedad' }))
  assert.equal(c.arriba.simbolo, 'A')
  assert.equal(c.arriba.tono, 'neg')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.titulo, 'Ausencia declarada: enfermedad')
})

test('licencia: L neutra — no es positivo ni problema', () => {
  const c = decidirCeldaDia(habil({ presencia: 'licencia', motivo: 'Vacaciones' }))
  assert.equal(c.arriba.simbolo, 'L')
  assert.equal(c.arriba.tono, 'neutro')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.titulo, 'Licencia: vacaciones')
})

test('día hábil pasado sin nada: nada arriba, «sin cargar» abajo — el silencio se ve, no se acusa', () => {
  const c = decidirCeldaDia(habil({}))
  assert.equal(c.arriba.simbolo, '')
  assert.equal(c.abajo.sinCargar, true)
  assert.equal(c.titulo, 'Sin marca de entrada/salida · Sin horas cargadas: no es una falta')
})

test('no laborable sin horas: guión inerte y sin reclamo; con horas (sábado trabajado) el número', () => {
  const sin = decidirCeldaDia(habil({ dia: 'no_laborable' }))
  assert.equal(sin.abajo.texto, '—')
  assert.equal(sin.abajo.tono, 'inerte')
  assert.equal(sin.abajo.sinCargar, false)
  assert.equal(sin.arriba.titulo, '')
  const con = decidirCeldaDia(habil({ dia: 'no_laborable', horas: 4 }))
  assert.equal(con.abajo.texto, '4,0')
})

test('futuro: no se pinta nada y no se reclama nada', () => {
  const c = decidirCeldaDia(habil({ dia: 'futuro' }))
  assert.equal(c.arriba.simbolo, '')
  assert.equal(c.abajo.texto, '')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.titulo, '')
})

test('HOY sin horas: ni marco punteado ni «—» — la jornada todavía está corriendo', () => {
  // EL DEFECTO QUE ATRAPA (captura del dueño, 08/09/2026 14:52): la columna del día en curso salía
  // entera en cajitas punteadas. «Sin cargar» es un día hábil YA PASADO; hoy no llegó tarde nadie.
  const c = decidirCeldaDia(habil({ dia: 'hoy' }))
  assert.equal(c.abajo.sinCargar, false, 'hoy no lleva marco punteado')
  assert.equal(c.abajo.texto, '', 'ni un «—»: hoy se puede cargar')
  assert.match(c.titulo, /todav/i)
  assert.doesNotMatch(c.titulo, /no es una falta/, 'no hace falta desmentir una falta que nadie afirmó')
})

test('HOY con horas cargadas: el número, igual que cualquier otro día', () => {
  const c = decidirCeldaDia(habil({ dia: 'hoy', horas: 8.8 }))
  assert.equal(c.abajo.texto, '8,8')
  assert.equal(c.abajo.tono, 'tinta')
  assert.equal(c.abajo.sinCargar, false)
})

test('cero horas NO es «sin cargar»: 0 es una afirmación y se escribe', () => {
  const c = decidirCeldaDia(habil({ horas: 0 }))
  assert.equal(c.abajo.texto, '0,0')
  assert.equal(c.abajo.sinCargar, false)
})

test('el color semántico vive SÓLO en la capa de presencia: la de horas nunca sale pos/neg', () => {
  const casos: EntradaCeldaDia[] = [
    habil({ presencia: 'ficho', horas: 8 }), habil({ presencia: 'ausente' }), habil({ horas: 12 }),
    habil({ presencia: 'licencia' }), habil({ dia: 'no_laborable' }), habil({ dia: 'futuro' }),
    habil({ dia: 'hoy' }), habil({ dia: 'hoy', horas: 8 }),
  ]
  for (const e of casos) {
    const c = decidirCeldaDia(e)
    assert.ok(['tinta', 'inerte', 'vacio'].includes(c.abajo.tono), JSON.stringify(e))
  }
})

test('SIN NÚMERO, EL SÍMBOLO VA CENTRADO; con número, arriba', () => {
  // EL DEFECTO QUE ATRAPA (dueño, 08/09/2026, sobre la grilla desplegada): *«se ve mal la L»*. Las
  // cinco «L» de una licencia quedaban pegadas al borde de arriba de su celda mientras la fila de
  // al lado tenía los números en el medio, y la letra se leía corrida. Cuando el símbolo es lo
  // único que la celda muestra, ocupa el lugar del número.
  assert.equal(decidirCeldaDia(habil({ presencia: 'licencia' })).arriba.centrado, true)
  assert.equal(decidirCeldaDia(habil({ presencia: 'ausente' })).arriba.centrado, true)
  assert.equal(decidirCeldaDia(habil({ presencia: 'ficho' })).arriba.centrado, true,
    'presente sin horas: el ● también es lo único que hay')
  assert.equal(decidirCeldaDia(habil({ presencia: 'ficho', horas: 8 })).arriba.centrado, false,
    'con número al lado, la presencia vuelve a ser una insignia arriba')
  assert.equal(decidirCeldaDia(habil({ presencia: 'licencia', dia: 'no_laborable' })).arriba.centrado, false,
    'el «—» es un número a los efectos del lugar: la L no se le monta encima')
  assert.equal(decidirCeldaDia(habil({})).arriba.centrado, false, 'sin símbolo no hay nada que centrar')
})

test('formatearHoras: una sola forma de escribir horas', () => {
  assert.equal(formatearHoras(8), '8,0')
  assert.equal(formatearHoras(7.25), '7,3')
  assert.equal(formatearHoras(10), '10,0')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS TRES FUENTES COMBINADAS — `combinarCeldaDia`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO QUE ATRAPAN, uno solo y grande: que una de las tres fuentes hable por otra. Que las
// horas declaren presencia, que el silencio declare ausencia, o que una contradicción entre la
// presencia declarada y las horas cargadas quede tapada — que es la peor, porque una de las dos
// se liquida y la pantalla habría elegido cuál sin decirlo.

const f = (p: Partial<FuentesDelDia>): FuentesDelDia => ({
  declarada: null, horas: null, dia: 'habil', ...p,
})

test('presencia declarada sin horas: ● presente, y la carga de horas queda pendiente', () => {
  const c = combinarCeldaDia(f({ declarada: 'presente' }))
  assert.equal(c.entrada.presencia, 'presente')
  assert.equal(c.origen, 'declarada')
  assert.equal(c.conflicto, false)
  const capas = decidirCeldaDia(c.entrada)
  assert.equal(capas.arriba.simbolo, '●')
  assert.equal(capas.arriba.tono, 'pos')
  assert.equal(capas.abajo.sinCargar, true, 'el marco punteado es lo que dice «faltan las horas»')
})

test('horas sin presencia declarada: el número se ve y arriba NO se escribe nada', () => {
  const c = combinarCeldaDia(f({ horas: 8 }))
  assert.equal(c.entrada.presencia, 'sin_marca', 'las horas declararon una presencia que nadie afirmó')
  assert.equal(c.origen, 'ninguno')
  const capas = decidirCeldaDia(c.entrada)
  assert.equal(capas.arriba.simbolo, '')
  assert.equal(capas.abajo.texto, '8,0')
  assert.equal(capas.abajo.sinCargar, false)
})

test('las dos verdades válidas se ven DISTINTAS', () => {
  const soloPresencia = decidirCeldaDia(combinarCeldaDia(f({ declarada: 'presente' })).entrada)
  const soloHoras = decidirCeldaDia(combinarCeldaDia(f({ horas: 8 })).entrada)
  assert.notDeepEqual(soloPresencia.arriba, soloHoras.arriba)
})

test('lo declarado en asistencia_dia le gana a lo declarado en la carga de horas', () => {
  const c = combinarCeldaDia(f({ declarada: 'presente', enHoras: 'ausente' }))
  assert.equal(c.entrada.presencia, 'presente')
  assert.equal(c.origen, 'declarada')
})

test('los días viejos conservan su ausencia: sin asistencia_dia manda la carga de horas', () => {
  const c = combinarCeldaDia(f({ declarada: null, enHoras: 'ausente', motivo: 'lluvia' }))
  assert.equal(c.entrada.presencia, 'ausente')
  assert.equal(c.origen, 'horas')
  assert.match(decidirCeldaDia(c.entrada).arriba.titulo, /lluvia/)
})

test('el fichaje se muestra cuando no hay declaración, y no la reemplaza cuando la hay', () => {
  assert.equal(combinarCeldaDia(f({ ficho: true })).entrada.presencia, 'ficho')
  assert.equal(combinarCeldaDia(f({ ficho: true })).origen, 'fichaje')
  const conAmbas = combinarCeldaDia(f({ declarada: 'presente', ficho: true }))
  assert.equal(conAmbas.entrada.presencia, 'ficho', 'con marca real se muestra la marca, que trae la hora')
  assert.equal(conAmbas.origen, 'fichaje')
})

test('el silencio de las tres fuentes NUNCA se lee como ausente', () => {
  const c = combinarCeldaDia(f({}))
  assert.equal(c.entrada.presencia, 'sin_marca')
  assert.equal(c.conflicto, false)
  assert.doesNotMatch(decidirCeldaDia(c.entrada).titulo, /ausen/i)
})

// ── EL CONFLICTO ES VISIBLE, NUNCA SILENCIOSO ────────────────────────────────────────────────────

// ═══ SALVO EL QUE LA LIQUIDACIÓN YA RESUELVE (dueño, 08/09/2026 18:50) ═══
//
// *«no quiero que al momento de hacer una liquidación de hs las ausencias y licencias sean un
// conflicto de hs que se suman y que no»*. Una ausencia declarada con horas cargadas el mismo día
// era marco rojo: alguien tenía que elegir a mano cuál valía antes de pagar. Ahora la regla elige
// —se liquidan las horas cargadas y la ausencia de ese día vale 0—, así que la celda muestra los
// dos datos, sin alarma. Si alguien devuelve el rojo, este test se pone en rojo.
test('ausencia declarada + horas cargadas NO es conflicto: la liquidación ya decidió', () => {
  const fuentes = f({ declarada: 'ausente', horas: 8, motivo: 'falta' })
  const c = combinarCeldaDia(fuentes)
  assert.equal(c.conflicto, false, 'volvió el marco rojo sobre un día que la regla ya resuelve')
  assert.equal(c.entrada.presencia, 'ausente', 'la «A» sigue arriba: el dato no se borró')
  const capas = decidirCeldaDia(c.entrada)
  assert.equal(capas.abajo.texto, '8,0', 'se escondieron las horas cargadas, que son las que se pagan')
  assert.match(capas.titulo, /se liquidan las horas cargadas/)
  assert.doesNotMatch(tituloDeConflicto(fuentes) ?? '', /conflicto/i)
})

test('licencia declarada + marca de entrada el mismo día también es conflicto', () => {
  const fuentes = f({ declarada: 'licencia', ficho: true })
  assert.equal(combinarCeldaDia(fuentes).conflicto, true)
  assert.match(tituloDeConflicto(fuentes) ?? '', /licencia declarada y marca de entrada/)
})

test('una ausencia declarada SIN horas no es un conflicto: es el caso normal', () => {
  const fuentes = f({ declarada: 'ausente', motivo: 'falta' })
  assert.equal(combinarCeldaDia(fuentes).conflicto, false)
  assert.equal(tituloDeConflicto(fuentes), null)
})

test('una ausencia vieja cargada por horas no se acusa a sí misma de conflicto', () => {
  // `enHoras` y `horas` salen de la MISMA tabla: si esto diera conflicto, cada ausencia histórica
  // —que se guarda con las horas de la jornada y tipo_hora='ausencia'— aparecería en rojo.
  assert.equal(combinarCeldaDia(f({ enHoras: 'ausente', horas: 8.8 })).conflicto, false)
})

test('un presente declarado con horas no es un conflicto', () => {
  assert.equal(combinarCeldaDia(f({ declarada: 'presente', horas: 8 })).conflicto, false)
})

test('en un día futuro o no laborable la combinación no inventa nada', () => {
  const futuro = combinarCeldaDia(f({ dia: 'futuro' }))
  assert.equal(decidirCeldaDia(futuro.entrada).abajo.texto, '')
  const feriado = combinarCeldaDia(f({ dia: 'no_laborable' }))
  assert.equal(decidirCeldaDia(feriado.entrada).abajo.texto, '—')
})
