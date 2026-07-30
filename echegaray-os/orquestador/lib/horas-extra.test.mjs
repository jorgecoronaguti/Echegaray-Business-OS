import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarCarga, componerCarga, normalizarHoras, resolverCarga, estadoDeCarga,
  describirCarga, fmt, FORMA, ESTADO, HORAS_MAX,
} from './horas-extra.mjs'

const celda = (formula, valor, numero) => ({ formula, valor_crudo: valor, numero })

// ── INTERPRETACIÓN · las 12 formas REALES del archivo ───────────────────────

test('=9+2 se separa en normal 9 y extra 2', () => {
  const c = interpretarCarga(celda('=9+2', '11', 11))
  assert.equal(c.forma, FORMA.SUMA)
  assert.deepEqual({ n: c.normales, e: c.extras, t: c.total }, { n: 9, e: 2, t: 11 })
  assert.equal(c.inequivoca, true)
  assert.equal(c.editable, true)
})

test('=8+6 (caso real del archivo)', () => {
  const c = interpretarCarga(celda('=8+6', '14', 14))
  assert.deepEqual({ n: c.normales, e: c.extras, t: c.total }, { n: 8, e: 6, t: 14 })
})

test('=8+10 y =14+3 y =8+4,5 (casos reales)', () => {
  assert.deepEqual(pick(interpretarCarga(celda('=8+10', '18', 18))), { n: 8, e: 10, t: 18 })
  assert.deepEqual(pick(interpretarCarga(celda('=14+3', '17', 17))), { n: 14, e: 3, t: 17 })
  assert.deepEqual(pick(interpretarCarga(celda('=8+4,5', '12,5', 12.5))), { n: 8, e: 4.5, t: 12.5 })
})

const pick = (c) => ({ n: c.normales, e: c.extras, t: c.total })

test('=4+3*1,5 → normal 4, extras 4,5 (3 h al coeficiente 1,5)', () => {
  const c = interpretarCarga(celda('=4+3*1,5', '8,5', 8.5))
  assert.equal(c.forma, FORMA.SUMA_COEF)
  assert.deepEqual(pick(c), { n: 4, e: 4.5, t: 8.5 })
  assert.equal(c.cantidad_extra, 3)
  assert.equal(c.coeficiente, 1.5)
  assert.equal(c.inequivoca, true)
})

test('=4+2*1,5 y =8+4*1,5 (casos reales, coeficiente 1,5)', () => {
  assert.deepEqual(pick(interpretarCarga(celda('=4+2*1,5', '7', 7))), { n: 4, e: 3, t: 7 })
  assert.deepEqual(pick(interpretarCarga(celda('=8+4*1,5', '14', 14))), { n: 8, e: 6, t: 14 })
})

test('=9+4*1,3 y =9+2*1,3 (coeficiente 1,3) sin ruido de punto flotante', () => {
  const a = interpretarCarga(celda('=9+4*1,3', '14,2', 14.2))
  assert.deepEqual(pick(a), { n: 9, e: 5.2, t: 14.2 })
  const b = interpretarCarga(celda('=9+2*1,3', '11,6', 11.6))
  assert.deepEqual(pick(b), { n: 9, e: 2.6, t: 11.6 }, '2*1.3 = 2.6000000000000005 sin redondeo')
})

test('la MISMA fórmula con punto decimal se interpreta igual', () => {
  assert.deepEqual(pick(interpretarCarga(celda('=4+3*1.5', '8.5', 8.5))), { n: 4, e: 4.5, t: 8.5 })
  assert.deepEqual(pick(interpretarCarga(celda('=8+4.5', '12.5', 12.5))), { n: 8, e: 4.5, t: 12.5 })
})

test('=4 (fórmula que es sólo un número) es jornada normal sin extras', () => {
  const c = interpretarCarga(celda('=4', '4', 4))
  assert.equal(c.forma, FORMA.NUMERO)
  assert.deepEqual(pick(c), { n: 4, e: 0, t: 4 })
  assert.equal(c.editable, true)
})

test('=9-2,5+2 NO se descompone: total sí, composición no, y no es editable', () => {
  const c = interpretarCarga(celda('=9-2,5+2', '8,5', 8.5))
  assert.equal(c.forma, FORMA.NO_INTERPRETABLE)
  assert.equal(c.total, 8.5, 'el total lo calculó el Sheet y se respeta')
  assert.equal(c.normales, null)
  assert.equal(c.extras, null)
  assert.equal(c.inequivoca, false)
  assert.equal(c.editable, false, 'no se pisa sin confirmación explícita')
  assert.equal(c.formula_original, '=9-2,5+2')
})

test('una fórmula fuera de la gramática queda protegida', () => {
  for (const f of ['=SUM(F7:F9)', '=A1', '=8+6+2', '=IF(A1>0,8,0)', '=-8']) {
    const c = interpretarCarga(celda(f, '0', 0))
    assert.equal(c.forma, FORMA.NO_INTERPRETABLE, f)
    assert.equal(c.editable, false, f)
  }
})

test('valor numérico simple: normal, sin extras', () => {
  const c = interpretarCarga(celda(null, '9', 9))
  assert.equal(c.forma, FORMA.NUMERO)
  assert.deepEqual(pick(c), { n: 9, e: 0, t: 9 })
})

test('el 0 explícito es una ausencia registrada, no una celda vacía', () => {
  const c = interpretarCarga(celda(null, '0', 0))
  assert.equal(c.forma, FORMA.NUMERO)
  assert.equal(c.total, 0)
  assert.equal(estadoDeCarga(c, { jornada: { horas: 9 } }), ESTADO.AUSENTE)
})

test('celda vacía: no es 0 y no tiene estado', () => {
  const c = interpretarCarga(celda(null, '', null))
  assert.equal(c.forma, FORMA.VACIA)
  assert.equal(c.total, null)
  assert.equal(c.editable, true)
  assert.equal(estadoDeCarga(c, { jornada: { horas: 9 } }), null)
})

test('texto libre queda protegido', () => {
  const c = interpretarCarga(celda(null, 'NO SE TOCA HASTA JUL', null))
  assert.equal(c.forma, FORMA.TEXTO)
  assert.equal(c.editable, false)
})

test('decimal con coma: 5,5 se lee 5.5', () => {
  assert.equal(interpretarCarga(celda(null, '5,5', 5.5)).normales, 5.5)
})

// ── COMPOSICIÓN · qué se escribe ────────────────────────────────────────────

test('sin extras se escribe un NÚMERO, no una fórmula (así está el 99% del archivo)', () => {
  const c = componerCarga({ normales: 9, extras: 0 })
  assert.equal(c.escribir, 9)
  assert.equal(typeof c.escribir, 'number')
  assert.equal(c.es_formula, false)
})

test('con extras se escribe una fórmula que PRESERVA la separación', () => {
  const c = componerCarga({ normales: 9, extras: 2 })
  assert.equal(c.escribir, '=9+2')
  assert.equal(c.total, 11)
  assert.equal(c.es_formula, true)
})

test('no se convierte 9+2 en un 11 opaco', () => {
  assert.notEqual(componerCarga({ normales: 9, extras: 2 }).escribir, 11)
})

test('la forma con coeficiente se preserva si sigue siendo cierta', () => {
  const c = componerCarga({ normales: 4, extras: 4.5, cantidad_extra: 3, coeficiente: 1.5 })
  assert.equal(c.escribir, '=4+3*1.5', 'canónico: el cliente lo localiza a =4+3*1,5')
  assert.equal(c.total, 8.5)
})

test('si el coeficiente ya no cuadra con las extras, se cae a la suma simple', () => {
  const c = componerCarga({ normales: 4, extras: 6, cantidad_extra: 3, coeficiente: 1.5 })
  assert.equal(c.escribir, '=4+6', '3*1,5 = 4,5 ≠ 6 → no se miente con la forma vieja')
})

test('los decimales salen en canónico (punto), que el cliente localiza', () => {
  assert.equal(componerCarga({ normales: 5.5, extras: 1.5 }).escribir, '=5.5+1.5')
  assert.equal(componerCarga({ normales: 5.5, extras: 0 }).escribir, 5.5)
})

test('componerCarga rechaza lo que no es número (no hay inyección posible)', () => {
  assert.throws(() => componerCarga({ normales: '=1+1', extras: 0 }), /no numéricas/)
  assert.throws(() => componerCarga({ normales: NaN, extras: 0 }), /no numéricas/)
  assert.throws(() => componerCarga({ normales: Infinity }), /no numéricas/)
  assert.throws(() => componerCarga({ normales: 9, extras: 'A1' }), /no numéricas/)
})

test('la fórmula compuesta sólo contiene dígitos, punto, + y *', () => {
  for (const c of [
    componerCarga({ normales: 9, extras: 2 }),
    componerCarga({ normales: 4, extras: 4.5, cantidad_extra: 3, coeficiente: 1.5 }),
    componerCarga({ normales: 5.5, extras: 1.25 }),
  ]) {
    if (c.es_formula) assert.match(c.formula, /^=[\d.+*]+$/, c.formula)
  }
})

test('ida y vuelta: componer y volver a interpretar da lo mismo', () => {
  for (const [nor, ext] of [[9, 0], [9, 2], [8, 6], [5.5, 1.5], [4, 4.5]]) {
    const c = componerCarga({ normales: nor, extras: ext })
    const leido = c.es_formula
      ? interpretarCarga(celda(c.formula, String(c.total), c.total))
      : interpretarCarga(celda(null, String(c.escribir), c.escribir))
    assert.deepEqual(pick(leido), { n: nor, e: ext, t: nor + ext }, `${nor}+${ext}`)
  }
})

// ── VALIDACIÓN Y ESTADOS ────────────────────────────────────────────────────

const J9 = { horas: 9, origen: 'calibrado', requiere_manual: false }
const JMANUAL = { horas: null, requiere_manual: true }

test('presente toma la jornada detectada; las extras son opcionales', () => {
  assert.deepEqual(resolverCarga({ estado: 'presente', jornada: J9 }), { ok: true, estado: 'presente', normales: 9, extras: 0, total: 9 })
  assert.deepEqual(resolverCarga({ estado: 'presente', extras: 2, jornada: J9 }), { ok: true, estado: 'presente', normales: 9, extras: 2, total: 11 })
})

test('presente en un día sin jornada inferible pide horas, no las inventa', () => {
  assert.equal(resolverCarga({ estado: 'presente', jornada: JMANUAL }).motivo, 'jornada_requiere_manual')
  assert.deepEqual(resolverCarga({ estado: 'presente', normales: '5,5', jornada: JMANUAL }), { ok: true, estado: 'presente', normales: 5.5, extras: 0, total: 5.5 })
})

test('ausente es 0 y 0', () => {
  assert.deepEqual(resolverCarga({ estado: 'ausente', jornada: J9 }), { ok: true, estado: 'ausente', normales: 0, extras: 0, total: 0 })
})

test('un AUSENTE con horas extra se rechaza: es incoherente', () => {
  assert.equal(resolverCarga({ estado: 'ausente', extras: 2, jornada: J9 }).motivo, 'ausente_con_extras')
})

test('llegada tarde: horas normales trabajadas, obligatorias', () => {
  assert.deepEqual(resolverCarga({ estado: 'tarde', normales: 7, jornada: J9 }), { ok: true, estado: 'tarde', normales: 7, extras: 0, total: 7 })
  assert.equal(resolverCarga({ estado: 'tarde', jornada: J9 }).motivo, 'faltan_horas_normales')
})

test('llegada tarde CON horas extra (se fue más tarde de lo previsto)', () => {
  assert.deepEqual(resolverCarga({ estado: 'tarde', normales: 7, extras: 2, jornada: J9 }), { ok: true, estado: 'tarde', normales: 7, extras: 2, total: 9 })
})

test('jornada parcial con y sin extras, y con coma decimal', () => {
  assert.deepEqual(resolverCarga({ estado: 'parcial', normales: '5,5', jornada: J9 }), { ok: true, estado: 'parcial', normales: 5.5, extras: 0, total: 5.5 })
  assert.deepEqual(resolverCarga({ estado: 'parcial', normales: '4', extras: '1,5', jornada: J9 }), { ok: true, estado: 'parcial', normales: 4, extras: 1.5, total: 5.5 })
  assert.equal(resolverCarga({ estado: 'parcial', jornada: J9 }).motivo, 'faltan_horas_normales')
})

test('horas negativas, texto, NaN e Infinity se rechazan', () => {
  assert.equal(resolverCarga({ estado: 'parcial', normales: -1, jornada: J9 }).motivo, 'negativo')
  assert.equal(resolverCarga({ estado: 'parcial', normales: 'ocho', jornada: J9 }).motivo, 'no_numerico')
  assert.equal(resolverCarga({ estado: 'parcial', normales: NaN, jornada: J9 }).motivo, 'no_numerico')
  assert.equal(resolverCarga({ estado: 'parcial', normales: Infinity, jornada: J9 }).motivo, 'no_numerico')
  assert.equal(resolverCarga({ estado: 'presente', extras: -2, jornada: J9 }).motivo, 'negativo')
})

test('un total incoherente (mayor al máximo) se rechaza', () => {
  assert.equal(resolverCarga({ estado: 'parcial', normales: 20, extras: 8, jornada: J9 }).motivo, 'total_mayor_al_maximo')
  assert.equal(resolverCarga({ estado: 'parcial', normales: 25, jornada: J9 }).motivo, 'mayor_al_maximo')
  assert.equal(HORAS_MAX, 24)
})

test('un estado desconocido se rechaza (nada de defaults silenciosos)', () => {
  assert.equal(resolverCarga({ estado: 'P', jornada: J9 }).motivo, 'estado_desconocido')
  assert.equal(resolverCarga({ jornada: J9 }).motivo, 'estado_desconocido')
})

test('normalizarHoras acepta coma y punto, rechaza el resto', () => {
  assert.equal(normalizarHoras('5,5').horas, 5.5)
  assert.equal(normalizarHoras('5.5').horas, 5.5)
  assert.equal(normalizarHoras(0).horas, 0)
  assert.equal(normalizarHoras('').motivo, 'vacio')
  assert.equal(normalizarHoras('', { permitirVacio: true }).horas, 0)
  assert.equal(normalizarHoras('=1+1').motivo, 'no_numerico')
})

test('no se afirma un estado sobre una carga que no se entendió', () => {
  const c = interpretarCarga(celda('=9-2,5+2', '8,5', 8.5))
  assert.equal(estadoDeCarga(c, { jornada: J9 }), null)
})

test('describirCarga es legible y no expone coordenadas', () => {
  assert.equal(describirCarga(interpretarCarga(celda('=9+2', '11', 11))), '9 + 2 extra = 11 h')
  assert.equal(describirCarga(interpretarCarga(celda(null, '9', 9))), '9 h')
  assert.equal(describirCarga(interpretarCarga(celda(null, '', null))), 'sin cargar')
  assert.match(describirCarga(interpretarCarga(celda('=9-2,5+2', '8,5', 8.5))), /no se puede separar/)
})

test('fmt muestra coma decimal', () => {
  assert.equal(fmt(5.5), '5,5')
  assert.equal(fmt(9), '9')
  assert.equal(fmt(null), '—')
})

// ── CORRECCIONES DE PRODUCCIÓN ──────────────────────────────────────────────

test('los decimales son los MISMOS en la fórmula y en el valor: nada se pierde en silencio', () => {
  const c = interpretarCarga(celda('=8+4,125', '12,125', 12.125))
  assert.equal(c.forma, FORMA.SUMA)
  assert.deepEqual({ n: c.normales, e: c.extras, t: c.total }, { n: 8, e: 4.125, t: 12.125 })
  assert.equal(c.inequivoca, true, 'antes daba 8 + 0 y se declaraba inequívoco')

  const d = interpretarCarga(celda('=9,125+2', '11,125', 11.125))
  assert.deepEqual({ n: d.normales, e: d.extras, t: d.total }, { n: 9.125, e: 2, t: 11.125 })
})

test('una fórmula CON ERROR es su propia forma, no un cero ni una ausencia', () => {
  for (const [f, v] of [['=F26/0', '#DIV/0!'], ['=A1', '#REF!'], ['=SI(1;"x";"y")', 'x']]) {
    const c = interpretarCarga({ formula: f, valor_crudo: v, numero: null })
    assert.equal(c.forma, FORMA.ERROR, `${f} → ${v}`)
    assert.equal(c.total, null, 'no hay total que sumar')
    assert.equal(c.editable, false)
    assert.equal(c.inequivoca, false)
  }
})

test('una fórmula fuera de gramática PERO con total sigue siendo no_interpretable', () => {
  const c = interpretarCarga(celda('=9-2,5+2', '8,5', 8.5))
  assert.equal(c.forma, FORMA.NO_INTERPRETABLE)
  assert.equal(c.total, 8.5)
})

test('un valor inválido se RECHAZA con su rango, no se recorta', () => {
  assert.equal(normalizarHoras('-5').ok, false)
  assert.equal(normalizarHoras('-5').motivo, 'negativo')
  assert.equal(normalizarHoras('99').ok, false)
  assert.equal(normalizarHoras('99').motivo, 'mayor_al_maximo')
  assert.equal(normalizarHoras('abc').ok, false)
  assert.equal(normalizarHoras(Infinity).ok, false)
  assert.equal(normalizarHoras(NaN).ok, false)
  // válido con decimales del archivo
  assert.deepEqual(normalizarHoras('5,555'), { ok: true, horas: 5.555 })
})
