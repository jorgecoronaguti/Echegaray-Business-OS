// Cada test acá prueba un DEFECTO que la carga de quincenas ya cometió o podía cometer. Si se
// revierte la línea que lo arregla, el test se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALIAS_JORNALES, columnasDelBloque, columnasSinRotuloEntre, controlDeCierre, esError, importe,
  lineasDelBloque, primeraFecha, quincenaDeFecha, quincenaEnCurso, resolverPersona,
} from './liquidacion-jornales.mjs'
import { emparejarPersona, indicePersonas } from './jornales-a-registros-hh.mjs'

// La grilla mínima que reproduce el layout real de «Obreros 26»: rótulos en la fila de arriba de
// las fechas (así está de marzo en adelante), y una fila de persona con las cuatro cifras.
function grillaObreros({ total = '$632.800', banco = '$260.000,00', adelanto = '$100.000', efectivo = '$272.800', sinRotulo = '' } = {}) {
  const rot = []
  rot[21] = 'Hs'; rot[22] = '$/h'; rot[23] = 'BANCO'; rot[25] = 'ADELANTO'; rot[26] = 'EFECTIVO'; rot[27] = 'TOTAL'
  const fechas = []
  fechas[0] = 'n'; fechas[1] = 'Obrero'; fechas[5] = '3/8'; fechas[6] = '4/8'; fechas[16] = '15/8'
  const p = []
  p[0] = '1'; p[1] = 'Aguero Cristian'; p[21] = '113,0'; p[22] = '$5.600'
  p[23] = banco; p[24] = sinRotulo; p[25] = adelanto; p[26] = efectivo; p[27] = total
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
    { horas: 21, valorHora: 22, porBanco: 23, adelanto: 25, enEfectivo: 26, cobra: 27, yaTransferido: [24] })
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

test('el puente CUIL gana, la igualdad exacta resuelve, y el alias es una TABLA, no una corazonada', () => {
  assert.equal(resolverPersona('aguero cristian', ctx).via, 'puente')
  assert.equal(resolverPersona('ismael jofre', ctx).persona.id, 'p1')
  // «Emanuel Alaniz» está en ALIAS_JORNALES porque el dueño lo revisó el 09/09.
  const r = resolverPersona('alaniz emanuel', ctx)
  assert.equal(r.via, 'alias')
  assert.equal(r.persona.id, 'p2')
  assert.equal(ALIAS_JORNALES['Emanuel Alaniz'], 'ALANIZ EMANUEL ARIEL')
})

test('sin el índice del importador de horas, un nombre nuevo no se resuelve por subconjunto de tokens', () => {
  // La regla de subconjunto propia de esta función sigue sin decidir sola: sólo informa candidatos.
  // Lo que resuelve un nombre nuevo desde el 15/09/2026 es `emparejarPersona` —el test siguiente—,
  // el mismo que ya decidió a quién van las horas de esa fila.
  const r = resolverPersona('alaniz ariel', ctx)
  assert.equal(r.via, 'sin-persona')
  assert.equal(r.persona, null)
  assert.deepEqual(r.candidatos, ['ALANIZ EMANUEL ARIEL'])
})

// ═══ UNA FILA DE LA PLANILLA, UNA PERSONA, EN LOS DOS IMPORTADORES (15/09/2026) ═══
// «Ruben Palacio» y «Gonzalez Valentin» tenían sus horas en PALACIOS RUBEN y GONZALES ABEL VALENTIN
// (emparejarPersona, jornales-a-registros-hh) y su plata en `excluidas` como «no existen» ($2,42 M).
// MUTACIÓN QUE PONE ESTO ROJO: quitar el nivel `emparejado` de resolverPersona.
const padron = [
  { id: 'r1', nombre_completo: 'PALACIOS RUBEN', es_prueba: false },
  { id: 'v1', nombre_completo: 'GONZALES ABEL VALENTIN', es_prueba: false },
  { id: 'c1', nombre_completo: 'GONZALEZ CARLOS SAMUEL', es_prueba: false },
  { id: 'c2', nombre_completo: 'GONZALEZ CARLOS OTRO', es_prueba: false },
  { id: 'cb', nombre_completo: 'CASTILLO BENITEZ JUAN CARLOS', es_prueba: false },
  { id: 'e2e', nombre_completo: 'PABLO RAMOS', es_prueba: true },
]
const ctxHH = {
  puente: new Map(), porCuil: new Map(), indice: indicePersonas(padron),
  personas: padron.map((p) => {
    const clave = p.nombre_completo.toLowerCase().split(' ').sort().join(' ')
    return { id: p.id, nombre: p.nombre_completo, clave, tokens: clave.split(' ') }
  }),
}
test('resolverPersona usa el MISMO emparejamiento que el importador de horas', () => {
  for (const [nombre, clave, id] of [['Ruben Palacio', 'palacio ruben', 'r1'], ['Gonzalez Valentin', 'gonzalez valentin', 'v1']]) {
    const r = resolverPersona(clave, { ...ctxHH, nombre })
    assert.equal(r.via, 'emparejado', nombre)
    assert.equal(r.persona.id, id)
    assert.equal(r.persona.id, emparejarPersona(nombre, ctxHH.indice).persona.id, 'misma persona que sus horas')
  }
  // Lo que el importador de horas tampoco resuelve sigue afuera: ambiguo, inexistente o de prueba.
  assert.equal(resolverPersona('carlos gonzalez', { ...ctxHH, nombre: 'Carlos Gonzalez' }).persona, null)
  assert.equal(resolverPersona('carlos castillo', { ...ctxHH, nombre: 'Castillo Carlos' }).persona.id, 'cb')
  assert.equal(resolverPersona('balmaceda jose luis', { ...ctxHH, nombre: 'Jose Luis Balmaceda' }).persona, null)
  assert.equal(resolverPersona('pablo ramos', { ...ctxHH, personas: [], nombre: 'Pablo Ramos' }).persona, null, 'una persona de prueba no recibe plata')
})

test('con dos candidatos NO elige: «Castillo Carlos» no se vuelve un González', () => {
  // El defecto histórico: emparejar por parecido metió a «Castillo Carlos» en «GONZALEZ CARLOS
  // SAMUEL». Acá, ante ambigüedad, la función se abstiene y la quincena entera queda sin cargar.
  const r = resolverPersona('carlos gonzalez', ctx)
  assert.equal(r.via, 'sin-persona')
  assert.equal(r.persona, null)
  // Los candidatos se informan para que un humano decida y los escriba en ALIAS_JORNALES.
  assert.deepEqual(r.candidatos, ['GONZALEZ CARLOS SAMUEL', 'GONZALEZ CARLOS OTRO'])
  assert.equal(resolverPersona('castillo carlos', ctx).persona, null)
  // Dos personas con el MISMO nombre exacto en la base tampoco se desempatan solas.
  const dobles = [{ id: 'x', nombre: 'A', clave: 'juan perez', tokens: ['juan', 'perez'] },
    { id: 'y', nombre: 'B', clave: 'juan perez', tokens: ['juan', 'perez'] }]
  assert.equal(resolverPersona('juan perez', { ...ctx, personas: dobles }).via, 'ambiguo')
})

test('la línea sin persona ya no voltea la quincena, pero su plata SIEMPRE queda declarada', () => {
  // Decisión del dueño 09/09: a esas personas no se las da de alta. La quincena entra parcial —
  // el defecto que hay que evitar ahora es el contrario: que el total corto se lea como completo.
  const ok = [{ cobra: 100, persona_id: 'p1' }, { cobra: 50, persona_id: 'p2' }]
  assert.equal(controlDeCierre(ok).completa, true)
  assert.equal(controlDeCierre(ok).montoExcluido, 0)
  const parcial = controlDeCierre([
    { cobra: 100, persona_id: 'p1' }, { cobra: 50, persona_id: null, nombre: 'Pablo Ramos' },
  ])
  assert.equal(parcial.cierra, true)          // se carga
  assert.equal(parcial.completa, false)       // pero NO es completa
  assert.equal(parcial.montoExcluido, 50)     // y el faltante tiene número
  assert.equal(parcial.excluidas[0].nombre, 'Pablo Ramos')
  assert.equal(parcial.totalCargable, 100)
})

test('la plata ILEGIBLE sí voltea la quincena entera: no se sabe cuánto es', () => {
  const c = controlDeCierre([{ cobra: 100, persona_id: 'p1', incompleta: 'no cierra por 200' }])
  assert.equal(c.cierra, false)
  assert.equal(c.bloqueantes.length, 1)
  assert.equal(c.cargables.length, 0)
})

test('--incluir-bajas: la BAJA ilegible se declara afuera; una línea ACTIVA ilegible sigue volteando la quincena', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar `if (l.baja && l.incompleta)` → la BAJA vuelve a bloquear; ampliarlo a
  // cualquier `incompleta` → la línea activa rota deja de bloquear.
  const baja = { cobra: 86652.06, persona_id: 'p-aguirre', baja: true, incompleta: 'no cierra por -383347.94' }
  const sana = { cobra: 1000, persona_id: 'p1' }
  const c = controlDeCierre([sana, baja], { incluirBajas: true })
  assert.equal(c.cierra, true)
  assert.deepEqual(c.excluidas.map((l) => l.motivo), ['baja_ilegible'])
  assert.equal(c.montoExcluido, 86652.06)
  assert.equal(c.bajasCargadas, 0)
  const activaRota = controlDeCierre([sana, { cobra: 100, persona_id: 'p2', incompleta: 'no cierra por 200' }], { incluirBajas: true })
  assert.equal(activaRota.cierra, false)
  // Sin --incluir-bajas la misma fila sigue siendo «baja», como antes.
  assert.deepEqual(controlDeCierre([baja]).excluidas.map((l) => l.motivo), ['baja'])
})

test('LA COLUMNA 24 SIN RÓTULO SE DESCUENTA: si no, cinco filas de agosto no cierran', () => {
  // Fila 531 del 17/8/2026: TOTAL 586.476 = BANCO 192.887,48 + Y 200.000 + ADELANTO 60.000 +
  // EFECTIVO 133.589. Ignorar Y dejaba un residuo de exactamente $200.000 por cabeza.
  const { grid, bloque } = grillaObreros({
    total: '$586.476', banco: '$192.887,48', sinRotulo: '$200.000',
    adelanto: '$60.000', efectivo: '$133.589',
  })
  const cols = columnasDelBloque(grid, bloque).cols
  assert.deepEqual(cols.yaTransferido, [24])
  const [l] = lineasDelBloque(grid, bloque, cols)
  assert.equal(l.yaTransferido, 200000)
  assert.equal(l.incompleta, null)
  // Y si se revierte la lectura de esa columna, la línea vuelve a no cerrar por $200.000:
  const [sinY] = lineasDelBloque(grid, bloque, { ...cols, yaTransferido: [] })
  assert.match(sinY.incompleta, /no cierra por 199999\.52/)  // los centavos del BANCO real
})

test('no se inventa una columna intermedia donde no la hay', () => {
  const rot = []
  rot[21] = 'Hs'; rot[22] = '$/h'; rot[23] = 'BANCO'; rot[24] = 'ADELANTO'
  rot[25] = 'EFECTIVO'; rot[26] = 'TOTAL'
  assert.deepEqual(columnasDelBloque([rot, []], { filaFecha: 2 }).cols.yaTransferido, [])
  assert.deepEqual(columnasSinRotuloEntre([rot, []], { filaFecha: 2 }, 23, 24), [])
})

test('EFECTIVO borrado se DERIVA de la cadena de pago; EFECTIVO roto NO se deriva', () => {
  // Filas 401/407/414 de la 2ª de junio: alguien borró la fórmula y la celda quedó vacía. La
  // planilla no dice $0 — no dice nada — y la fila de totales del bloque confirma el derivado.
  const { grid, bloque } = grillaObreros({ total: '$408.000', banco: '', adelanto: '', efectivo: '' })
  const [l] = lineasDelBloque(grid, bloque, columnasDelBloque(grid, bloque).cols)
  assert.equal(l.enEfectivo, 408000)
  assert.equal(l.efectivoDerivado, true)
  assert.equal(l.incompleta, null)
  // Una celda ROTA es otra cosa: ahí la planilla sí dice algo y dice que está mal.
  const roto = grillaObreros({ efectivo: '#REF!' })
  const [r] = lineasDelBloque(roto.grid, roto.bloque, columnasDelBloque(roto.grid, roto.bloque).cols)
  assert.match(r.incompleta, /enEfectivo roto/)
  assert.equal(r.efectivoDerivado, false)
})

test('un EFECTIVO derivado NEGATIVO no se tapa: la línea sale marcada', () => {
  const { grid, bloque } = grillaObreros({ total: '$100.000', banco: '$500.000', adelanto: '', efectivo: '' })
  const [l] = lineasDelBloque(grid, bloque, columnasDelBloque(grid, bloque).cols)
  assert.equal(l.enEfectivo, null)
  assert.match(l.incompleta, /EFECTIVO/)
})

test('primeraFecha toma la primera escrita, no la mínima', () => {
  const f = []; f[5] = '16/7'; f[8] = '20/7'
  assert.equal(primeraFecha([f], { filaFecha: 1 }), '16/7')
})

// ═══ LOS CENTAVOS: LA LECTURA FORMATEADA LOS TIRABA ═══
//
// La carga de las 274 líneas cerraba $3,62 corta y la fila 568 de la 1ª de septiembre se rechazaba
// entera con «no cierra por 1». No era la planilla: era leerla con el formato de la celda puesto.
// Estos tests fallan si alguien vuelve a leer sólo la grilla formateada.
test('importe: un number crudo se devuelve tal cual, con centavos', () => {
  assert.equal(importe(260000.05), 260000.05)
  assert.equal(importe(3650.5), 3650.5)
  // El parser de miles en castellano destruiría "260000.05": el punto es separador de miles.
  assert.equal(importe('260000.05'), 26000005)
})

test('importe: un number no finito no es cero', () => {
  assert.equal(importe(Number.NaN), null)
  assert.equal(importe(Number.POSITIVE_INFINITY), null)
})

test('lineasDelBloque: la plata sale de la grilla cruda y el nombre de la formateada', () => {
  const cols = { horas: 2, valorHora: 3, cobra: 4, adelanto: 5, porBanco: 6, enEfectivo: 7 }
  const bloque = { inicio: 2, fin: 2, filaFecha: 1 }
  // Formateada: Sheets ya redondeó al formato de la celda y la línea NO cierra.
  const formateada = [[], ['', 'PEREZ JUAN', '10', '$3.650', '$36.500', '$0', '$0', '$36.499']]
  // Cruda: los mismos centavos que la fórmula calculó, y la línea cierra.
  const cruda = [[], ['', 'PEREZ JUAN', 10, 3650.05, 36500.5, 0, 0, 36500.5]]
  const soloFormateada = lineasDelBloque(formateada, bloque, cols)[0]
  assert.ok(soloFormateada.incompleta, 'con formato la línea no cierra y queda afuera')

  const conCruda = lineasDelBloque(formateada, bloque, cols, cruda)[0]
  assert.equal(conCruda.nombre, 'PEREZ JUAN', 'el nombre sigue saliendo de la grilla formateada')
  assert.equal(conCruda.incompleta, null)
  assert.equal(conCruda.cobra, 36500.5)
  assert.equal(conCruda.valorHora, 3650.05)
})

test('TOTAL roto corregido por Hs × $/h SÓLO en BAJA: una línea activa con el mismo cuadro sigue incompleta', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar `linea.baja &&` en lineasDelBloque → la activa se corrige sola.
  // 113 h × $5.600 = 632.800 = BANCO 260.000 + ADELANTO 100.000 + EFECTIVO 272.800; el TOTAL dice 86.652,06.
  const activa = grillaObreros({ total: '$86.652,06' })
  const [a] = lineasDelBloque(activa.grid, activa.bloque, columnasDelBloque(activa.grid, activa.bloque).cols)
  assert.match(a.incompleta ?? '', /no cierra/)
  assert.equal(a.cobra, 86652.06)
  const baja = grillaObreros({ total: '$86.652,06' })
  baja.grid[2][0] = 'BAJA'
  const [b] = lineasDelBloque(baja.grid, baja.bloque, columnasDelBloque(baja.grid, baja.bloque).cols)
  assert.equal(b.incompleta, null)
  assert.equal(b.cobra, 632800)
  assert.equal(b.totalDeLaPlanilla, 86652.06)
})
