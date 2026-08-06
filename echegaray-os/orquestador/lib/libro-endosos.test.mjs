// EL VALOR ENDOSADO, EN FRÍO — con las filas REALES de `_CHEQUES_RAW` y de Cobranzas del 06/08/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { endososDeCartera, emparejarEndosos, ENDOSADO } from './libro-endosos.mjs'
import { deCobranzas } from './libro-extractores-cobranzas.mjs'
import { FILA0 as FILA0_RAW } from '../scripts/cheques-raw-pestana.mjs'

// `_CHEQUES_RAW` tal cual está en el archivo: A tipo · B número · C banco · D librador · E contraparte
// · F fecha de pago · G importe · H estado · I cuenta · J orden de pago · K obra · L CUIT.
// Las filas 11 y 12 del archivo son los dos echeq endosados a Alumetal.
const CHEQUES_RAW = () => {
  const f = Array.from({ length: FILA0_RAW - 1 }, () => [])
  return [...f,
    ['recibido', '00000514', 'Santander', 'Mineral Del Rio SA', '', 46234, 290000, 'Depositado'],
    ['recibido', '90020099', 'Santander', 'Alimentos Del Sur SA', '', 46234, 10000000, 'Depositado'],
    ['recibido', '90020100', 'Santander', 'Alimentos Del Sur SA', '', 46249, 10000000, ENDOSADO],
    ['recibido', '90020101', 'Santander', 'Alimentos Del Sur SA', '', 46265, 10000000, ENDOSADO],
    ['emitido', '00000368', 'Santander', '', 'ALUMETAL S.A', 46264, 837210, 'Aceptado'],
  ]
}

test('sólo los RECIBIDOS y ENDOSADOS: un valor emitido no se endosa, se debita', () => {
  const e = endososDeCartera(CHEQUES_RAW())
  assert.equal(e.length, 2)
  assert.deepEqual(e.map((x) => x.numero), ['90020100', '90020101'])
  assert.deepEqual(e.map((x) => x.importe), [10000000, 10000000])
  assert.deepEqual(e.map((x) => x.fecha), [46249, 46265])
})

// Cobranzas: el encabezado real de la fila 4; los datos arrancan en la 5. La columna "Valor banco"
// (BB en el archivo) va última — y en el archivo VIVO está VACÍA para las dos filas del endoso: el
// dueño lo escribió en la nota. Ése es exactamente el defecto que la segunda puerta cierra.
const ENC_COB = ['x', 'Obra / Cliente', 'Estado', 'TOTAL a cobrar (neto de retenciones)',
  'Fecha cobro', 'Fecha cobro', 'Forma de Cobro', 'Valor banco']
const cobranzas = (extra = []) => [[], [], [], ENC_COB,
  ['', 'MESSINA', 'Cobrado', 500000, 46005, 46005, 'Transferencia', ''],
  ['', 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'Cobrado', 10000000, 46249, 46249, 'Echeq', ''],
  ['', 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'Cobrado', 10000000, 46265, 46265, 'Echeq', ''],
  ...extra]

test('COBRANZAS: los $20.000.000 endosados NO entran, aunque la columna BB esté vacía', () => {
  // MEDIDO EN VIVO (06/08): Cobranzas f43 y f48, LA ESTRELLA, $10.000.000 cada una, "Cobrado" con
  // fecha 15/08 y 31/08. `_CHEQUES_RAW` f11 y f12 dicen que esos echeq están Endosados: la plata se
  // entregó a Alumetal y no va a acreditar nunca. Con BB vacía la puerta 1 no disparaba y el libro
  // emitía $20.000.000 de ingreso REAL con fecha de agosto.
  const endosos = endososDeCartera(CHEQUES_RAW())
  const excluidos = []
  const ms = deCobranzas(cobranzas(), 46240, { endosos, excluidos })
  assert.deepEqual(ms.map((m) => m.concepto), ['MESSINA'], 'sólo queda el cobro que sí entró')
  assert.equal(excluidos.reduce((a, x) => a + x.importe, 0), 20000000, 'la exclusión se declara CON SU MONTO')
  assert.deepEqual(excluidos.map((x) => x.fila), [6, 7])
  // La fila que se nombra es la de la RÉPLICA (acá la 6; en el archivo vivo, la 11): sin el número de
  // fila el dueño no puede ir a mirar de dónde salió la exclusión.
  assert.match(excluidos[0].motivo, /_CHEQUES_RAW f6 declara el valor 90020100 como Endosado/)
})

test('COBRANZAS: sin el cruce contra `_CHEQUES_RAW`, los $20.000.000 vuelven — el test prueba el defecto', () => {
  // Si mañana alguien saca la segunda puerta, esto se pone rojo: es el ingreso fantasma de agosto.
  const ms = deCobranzas(cobranzas(), 46240, { endosos: [] })
  const agosto = ms.filter((m) => m.fecha >= 46235).reduce((a, m) => a + m.signo * m.importe, 0)
  assert.equal(agosto, 20000000, 'éste es el número que el cruce tiene que hacer desaparecer')
})

test('COBRANZAS: la puerta 1 (la marca en BB) sigue valiendo y no necesita la réplica', () => {
  const marcada = [...cobranzas(), ['', 'OTRA SA', 'Cobrado', 5000000, 46250, 46250, 'Echeq', 'ENDOSADO A X']]
  const excluidos = []
  const ms = deCobranzas(marcada, 46240, { endosos: [], excluidos })
  assert.ok(!ms.some((m) => m.concepto === 'OTRA SA'))
  assert.equal(excluidos.length, 1)
  assert.match(excluidos[0].motivo, /Valor banco/)
})

test('COBRANZAS: una TRANSFERENCIA cobrada del mismo importe y fecha no se toca', () => {
  // El emparejamiento es por (importe, fecha) porque Cobranzas no trae número de valor. El instrumento
  // es la barrera que evita que un cobro acreditado se confunda con un echeq entregado.
  const conTransf = [[], [], [], ENC_COB,
    ['', 'OTRO CLIENTE', 'Cobrado', 10000000, 46249, 46249, 'Transferencia', '']]
  const ms = deCobranzas(conTransf, 46240, { endosos: endososDeCartera(CHEQUES_RAW()) })
  assert.equal(ms.length, 1, 'una transferencia acreditada no se endosa: ya es plata')
})

test('COBRANZAS: un cobro PENDIENTE con los mismos datos tampoco se excluye', () => {
  // Un valor endosado se cobró (el echeq entró) y después se entregó. Un pendiente no llegó todavía:
  // sigue siendo plata que se espera, y excluirlo borraría un ingreso real del cuadro.
  const pendiente = [[], [], [], ENC_COB,
    ['', 'LA ESTRELLA', 'Pendiente', 10000000, 46249, 46249, 'Echeq', '']]
  const ms = deCobranzas(pendiente, 46240, { endosos: endososDeCartera(CHEQUES_RAW()) })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].estado, 'PROYECTADO')
})

test('AMBIGUO: si un valor matchea DOS filas de Cobranzas no se excluye ninguna, y se declara', () => {
  // Excluir de más borra un cobro real del cuadro; excluir de menos deja el defecto visible. El
  // segundo se puede ver, así que ante la duda no se toca nada. Es la regla del repo: no escribir
  // donde el mapeo dice que no.
  const duplicada = [...cobranzas(),
    ['', 'OTRA ESTRELLA', 'Cobrado', 10000000, 46249, 46249, 'Echeq', '']]
  const excluidos = []
  const ms = deCobranzas(duplicada, 46240, { endosos: endososDeCartera(CHEQUES_RAW()), excluidos })
  assert.ok(ms.some((m) => m.fecha === 46249), 'las dos filas de 46249 quedan en el libro')
  assert.equal(ms.filter((m) => m.fecha === 46249).length, 2)
  assert.ok(excluidos.some((x) => /matchea 2 filas/.test(x.motivo)), 'la ambigüedad se declara')
})

test('emparejarEndosos: un valor se consume UNA vez', () => {
  const candidatas = [{ fila: 6, importe: 10000000, fecha: 46249, instrumento: 'echeq' }]
  const dosIguales = [
    { numero: 'A', importe: 10000000, fecha: 46249, fila: 11 },
    { numero: 'B', importe: 10000000, fecha: 46249, fila: 12 },
  ]
  const { excluidas, ambiguos } = emparejarEndosos(candidatas, dosIguales)
  assert.equal(excluidas.size, 1, 'una sola fila de Cobranzas, una sola exclusión')
  assert.equal(ambiguos.length, 1, 'el segundo valor no tiene contraparte y hay que decirlo')
  assert.match(ambiguos[0].motivo, /hay un cobro sin emparejar/)
})
