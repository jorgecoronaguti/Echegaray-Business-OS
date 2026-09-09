// Cada test acá prueba un DEFECTO que la carga de quincenas ya cometió o podía cometer. Si se
// revierte la línea que lo arregla, el test se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  columnasDelBloque, controlDeCierre, esError, importe, lineasDelBloque,
  primeraFecha, quincenaDeFecha, quincenaEnCurso, resolverPersona,
} from './liquidacion-jornales.mjs'

// La grilla mínima que reproduce el layout real de «Obreros 26»: rótulos en la fila de arriba de
// las fechas (así está de marzo en adelante), y una fila de persona con las cuatro cifras.
function grillaObreros({ total = '$632.800', banco = '$260.000,00', adelanto = '$100.000', efectivo = '$272.800' } = {}) {
  const rot = []
  rot[21] = 'Hs'; rot[22] = '$/h'; rot[23] = 'BANCO'; rot[25] = 'ADELANTO'; rot[26] = 'EFECTIVO'; rot[27] = 'TOTAL'
  const fechas = []
  fechas[0] = 'n'; fechas[1] = 'Obrero'; fechas[5] = '3/8'; fechas[6] = '4/8'; fechas[16] = '15/8'
  const p = []
  p[0] = '1'; p[1] = 'Aguero Cristian'; p[21] = '113,0'; p[22] = '$5.600'
  p[23] = banco; p[25] = adelanto; p[26] = efectivo; p[27] = total
  return { grid: [rot, fechas, p], bloque: { inicio: 3, fin: 3, filaFecha: 2 } }
}

test('importe: una celda rota NO vale cero — vale null', () => {
  assert.equal(importe('#REF!'), null)
  assert.equal(importe(''), null)
  assert.equal(importe('$260.000,00'), 260000)
  assert.equal(importe('-$260.000'), -260000)
  assert.ok(esError('#REF!'))
  assert.ok(!esError('$0'))
})

test('las columnas se leen del rótulo, no se tipean: si se corren, la lectura las sigue', () => {
  const { grid, bloque } = grillaObreros()
  assert.deepEqual(columnasDelBloque(grid, bloque).cols,
    { horas: 21, valorHora: 22, porBanco: 23, adelanto: 25, enEfectivo: 26, cobra: 27 })
  // El defecto: con los índices tipeados, correr las columnas dos lugares haría que ADELANTO se
  // liquide como TOTAL en silencio. Acá el mapa se corre con ellas.
  const corrido = grid.map((f) => [null, null, ...f.slice(1)])
  corrido[1] = grid[1]
  assert.equal(columnasDelBloque(corrido, bloque).cols.cobra, 28)
})

test('un bloque sin rótulos NO hereda el layout del vecino: se informa y no se carga', () => {
  const { bloque } = grillaObreros()
  const { faltan } = columnasDelBloque([[], ['n', 'Obrero'], []], bloque)
  assert.deepEqual(faltan.sort(), ['adelanto', 'cobra', 'enEfectivo', 'horas', 'porBanco', 'valorHora'])
})

test('la quincena sale de la PRIMERA fecha: 4/5..16/5 es la primera de mayo, no la segunda', () => {
  // El defecto: rotular por la última fecha mandaba el bloque del 4/5 (que termina el 16) a la
  // segunda quincena de mayo, donde ya vive el bloque del 18/5 → dos bloques con la misma clave.
  assert.deepEqual(quincenaDeFecha('4/5'), { desde: '2026-05-01', hasta: '2026-05-15' })
  assert.deepEqual(quincenaDeFecha('18/5'), { desde: '2026-05-16', hasta: '2026-05-31' })
  assert.deepEqual(quincenaDeFecha('16/2'), { desde: '2026-02-16', hasta: '2026-02-28' })
  assert.deepEqual(quincenaDeFecha('1/9'), { desde: '2026-09-01', hasta: '2026-09-15' })
  assert.equal(quincenaDeFecha('nada'), null)
})

test('la quincena en curso es la de hoy — y es la que no se carga', () => {
  assert.deepEqual(quincenaEnCurso(new Date('2026-09-09T12:00:00Z')),
    { desde: '2026-09-01', hasta: '2026-09-15' })
  assert.deepEqual(quincenaEnCurso(new Date('2026-08-31T12:00:00Z')),
    { desde: '2026-08-16', hasta: '2026-08-31' })
})

test('la línea reproduce la cuenta del papel: TOTAL = BANCO + ADELANTO + EFECTIVO', () => {
  const { grid, bloque } = grillaObreros()
  const [l] = lineasDelBloque(grid, bloque, columnasDelBloque(grid, bloque).cols)
  assert.equal(l.cobra, 632800)
  assert.equal(l.adelanto, 100000)
  assert.equal(l.horas, 113)
  assert.equal(l.valorHora, 5600)
  // El CHECK de la base: total = por_banco + en_efectivo (lo que se paga tras descontar el adelanto)
  assert.equal(l.total, 532800)
  assert.equal(l.incompleta, null)
})

test('si la planilla no cierra consigo misma, la línea NO se carga', () => {
  const { grid, bloque } = grillaObreros({ efectivo: '$1' })
  const [l] = lineasDelBloque(grid, bloque, columnasDelBloque(grid, bloque).cols)
  assert.match(l.incompleta, /no cierra por /)
})

test('BANCO en #REF! no se lee como $0: la línea sale marcada', () => {
  const { grid, bloque } = grillaObreros({ banco: '#REF!' })
  const [l] = lineasDelBloque(grid, bloque, columnasDelBloque(grid, bloque).cols)
  assert.match(l.incompleta, /porBanco roto/)
})

test('el nombre dado vuelta de abril es la MISMA persona', () => {
  const rot = []; rot[21] = 'Hs'; rot[22] = '$/h'; rot[23] = 'BANCO'
  rot[25] = 'ADELANTO'; rot[26] = 'EFECTIVO'; rot[27] = 'TOTAL'
  const f = []; f[5] = '1/4'
  const a = []; a[1] = 'Marcelo Pastran'; a[27] = '$1'; a[26] = '$1'
  const b = []; b[1] = 'Pastran Marcelo'; b[27] = '$1'; b[26] = '$1'
  const cols = columnasDelBloque([rot, f], { filaFecha: 2 }).cols
  const [la] = lineasDelBloque([rot, f, a], { inicio: 3, fin: 3 }, cols)
  const [lb] = lineasDelBloque([rot, f, b], { inicio: 3, fin: 3 }, cols)
  assert.equal(la.clave, lb.clave)
})

const personas = [
  { id: 'p1', nombre: 'JOFRE ISMAEL', clave: 'ismael jofre', tokens: ['ismael', 'jofre'] },
  { id: 'p2', nombre: 'ALANIZ EMANUEL ARIEL', clave: 'alaniz ariel emanuel', tokens: ['alaniz', 'ariel', 'emanuel'] },
  { id: 'p3', nombre: 'GONZALEZ CARLOS SAMUEL', clave: 'carlos gonzalez samuel', tokens: ['carlos', 'gonzalez', 'samuel'] },
  { id: 'p4', nombre: 'GONZALEZ CARLOS OTRO', clave: 'carlos gonzalez otro', tokens: ['carlos', 'gonzalez', 'otro'] },
]
const ctx = { puente: new Map([['aguero cristian', '20294271067']]), porCuil: new Map([['20294271067', { id: 'pc', nombre: 'AGUERO CRISTIAN DOMINGO' }]]), personas }

test('el puente CUIL gana, la igualdad exacta resuelve, el subconjunto único se marca', () => {
  assert.equal(resolverPersona('aguero cristian', ctx).via, 'puente')
  assert.equal(resolverPersona('ismael jofre', ctx).persona.id, 'p1')
  const r = resolverPersona('alaniz emanuel', ctx)
  assert.equal(r.via, 'subconjunto')
  assert.equal(r.persona.id, 'p2')
})

test('con dos candidatos NO elige: «Castillo Carlos» no se vuelve un González', () => {
  // El defecto histórico: emparejar por parecido metió a «Castillo Carlos» en «GONZALEZ CARLOS
  // SAMUEL». Acá, ante ambigüedad, la función se abstiene y la quincena entera queda sin cargar.
  const r = resolverPersona('carlos gonzalez', ctx)
  assert.equal(r.via, 'ambiguo')
  assert.equal(r.persona, null)
  assert.deepEqual(r.candidatos, ['GONZALEZ CARLOS SAMUEL', 'GONZALEZ CARLOS OTRO'])
  assert.equal(resolverPersona('castillo carlos', ctx).via, 'sin-persona')
})

test('una quincena entra COMPLETA o no entra: una línea sin persona la bloquea entera', () => {
  const ok = [{ cobra: 100, persona_id: 'p1' }, { cobra: 50, persona_id: 'p2' }]
  assert.equal(controlDeCierre(ok).cierra, true)
  assert.equal(controlDeCierre(ok).totalCargable, 150)
  const falla = [{ cobra: 100, persona_id: 'p1' }, { cobra: 50, persona_id: null }]
  const c = controlDeCierre(falla)
  assert.equal(c.cierra, false)
  assert.equal(c.diferencia, 50)
  assert.equal(c.cargables.length, 1)
})

test('primeraFecha toma la primera escrita, no la mínima', () => {
  const f = []; f[5] = '16/7'; f[8] = '20/7'
  assert.equal(primeraFecha([f], { filaFecha: 1 }), '16/7')
})
