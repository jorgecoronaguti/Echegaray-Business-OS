import test from 'node:test'
import assert from 'node:assert/strict'

import {
  pagosGremialesDelBanco, boletasVigentes, lotesDeFondoDeCese, debitosDeUocra,
  periodoDeMMAAAA, TOLERANCIA_APAREO, COBRADORES_UOCRA, explicarPago,
} from './cargas-pagos-banco.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

// ═══ LOS DATOS SON LOS REALES, LEÍDOS EL 10/09/2026 ═══
//
// `_UOCRA_DDJJ_RAW` (Sheet vivo) y `public.banco_movimientos` / `_BANCO_RAW`. Julio está DOS veces
// porque tiene rectificativa, y su pago llegó partido en dos DEBIN a dos CUIT distintos: es el caso
// que rompe el apareo ingenuo «un débito = una boleta».
const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))

/** `_UOCRA_DDJJ_RAW`: 3 filas de encabezado y los datos desde la 4. A período · B boleta · H total · I FCL. */
const filaU = (periodo, boleta, total, fcl) => [periodo, boleta, 21, 0, 0, 0, 0, total, fcl, `${periodo}.pdf`]
const BOLETAS = [['título'], ['nota'], ['Período', 'Boleta'],
  filaU('2026-06', 'Original', 782995.57, 1482692.40),
  filaU('2026-07', 'Rectificativa', 1261611.38, 1319119.20),
  filaU('2026-07', 'Original', 649940.06, 1319119.20),
  filaU('2026-08', 'Original', 994941.26, 1379455.92),
]

const debito = (fecha, concepto, importe, fila) => ({ fecha: S(fecha), concepto, importe, fila })
const FCL_AGO = Array.from({ length: 3 }, (_, i) => debito('2026-09-10',
  'Acreditacion en cta pago volunt - Acreditacion fondo desempleo 082026 - cuit 30716304643',
  [1000000, 100000, 60400][i], 900 + i))
const DEBITOS = [
  // El lote del 18/08 llegó sin período: el banco escribió «000000».
  debito('2026-08-18', 'Pagos personalizados acred cuenta - Acreditacion fondo desempleo 000000 - cuit 30716304643', 2481098.40, 800),
  debito('2026-08-19', 'Debito debin - id debin 7l8gyknx4k0y0rqpnmprz5 cuit 30707743987', 649940.06, 801),
  debito('2026-08-27', 'Debito debin - id debin jmqkyz9qg10jq5rvnv50p3 cuit 30503049097', 611671.32, 802),
  debito('2026-09-10', 'Debito debin - id debin rd06zo9w4lqdwjv325gp7x cuit 30503049097', 994941.26, 803),
  ...FCL_AGO,
]

test('la boleta VIGENTE de un período es la rectificativa, no la que aparezca primero', () => {
  const v = boletasVigentes(BOLETAS)
  assert.equal(v.get('2026-07').boleta, 'Rectificativa')
  assert.equal(v.get('2026-07').totalDeterminado, 1261611.38,
    'con la original ($649.940,06) el apareo daría por impaga la diferencia que ya se pagó el 27/08')
  assert.equal(v.size, 3)
})

test('el período del Fondo de Cese lo dice el banco, y «000000» no es un período', () => {
  assert.equal(periodoDeMMAAAA('082026'), '2026-08')
  assert.equal(periodoDeMMAAAA('000000'), null)
  assert.equal(periodoDeMMAAAA('132026'), null, 'no existe el mes 13')
  const { lotes, sinPeriodo } = lotesDeFondoDeCese(DEBITOS)
  assert.equal(lotes.get('2026-08').importe, 1160400, 'las tres acreditaciones son UN lote')
  assert.equal(lotes.get('2026-08').filas.length, 3)
  assert.equal(sinPeriodo.length, 1, 'el lote del 18/08 no se atribuye a ningún mes')
})

test('sólo un DEBIN a un CUIT declarado puede pagar la boleta de UOCRA', () => {
  assert.equal(debitosDeUocra(DEBITOS).length, 3)
  const ajeno = [debito('2026-09-10', 'Transferencia a proveedor - cuit 30503049097', 994941.26, 1)]
  assert.deepEqual(debitosDeUocra(ajeno), [], 'sin DEBIN no es este canal')
  const otroCuit = [debito('2026-09-10', 'Debito debin - id debin xx cuit 30999999999', 994941.26, 1)]
  assert.deepEqual(debitosDeUocra(otroCuit), [], 'un DEBIN a un CUIT que nadie declaró no paga la boleta')
})

// ═══ EL DEFECTO QUE MOTIVA TODO: AGOSTO 2026 ═══

test('con el débito presente, la boleta de agosto queda pagada el 10/09 y por su importe exacto', () => {
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS })
  const ago = porPeriodo.get('2026-08')
  const uocra = ago.detalle.find((d) => d.organismo === 'UOCRA')
  assert.equal(uocra.cubierto, 994941.26)
  assert.equal(uocra.fecha, S('2026-09-10'))
  assert.equal(ago.declarado, 2374397.18, 'la boleta entera: Total determinado + Fondo de Cese devengado')
  assert.equal(ago.cubierto, 994941.26 + 1160400, 'UOCRA entero + el lote de Fondo de Cese de 08/2026')
  assert.equal(ago.resto, 219055.92, 'lo declarado de Fondo de Cese que el banco no muestra depositado')
})

test('SIN EL DÉBITO, agosto no queda pagado — el control puede dar rojo', () => {
  const sinUocra = DEBITOS.filter((d) => d.fila !== 803)
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: sinUocra, boletas: BOLETAS })
  const ago = porPeriodo.get('2026-08')
  assert.ok(!ago.detalle.some((d) => d.organismo === 'UOCRA'), 'sin débito no hay pago de UOCRA')
  assert.equal(ago.cubierto, 1160400)
  assert.equal(ago.resto, 1213997.18, 'la boleta entera sigue sin respaldo bancario')
})

test('un débito de importe DISTINTO no aparea la boleta', () => {
  const otro = DEBITOS.map((d) => (d.fila === 803 ? { ...d, importe: 994000 } : d))
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: otro, boletas: BOLETAS })
  assert.ok(!porPeriodo.get('2026-08').detalle.some((d) => d.organismo === 'UOCRA'),
    `$941 de diferencia es más que la tolerancia de $${TOLERANCIA_APAREO}: ese débito es otra cosa`)
})

test('la rectificativa de julio se pagó en DOS débitos y los dos cuentan', () => {
  const { porPeriodo, avisos } = pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS })
  const jul = porPeriodo.get('2026-07')
  const uocra = jul.detalle.find((d) => d.organismo === 'UOCRA')
  assert.equal(uocra.cubierto, 1261611.38, '$649.940,06 (19/08) + $611.671,32 (27/08)')
  assert.equal(uocra.filas.length, 2)
  assert.equal(uocra.fecha, S('2026-08-27'), 'la obligación se cancela con el ÚLTIMO débito, no el primero')
  assert.ok(avisos.some((a) => a.includes('30707743987')),
    'el CUIT sin confirmar tiene que gritar cada vez que se usa, no colarse en silencio')
  assert.ok(!jul.detalle.some((d) => d.organismo === 'Fondo de Cese'),
    'el lote del 18/08 no dice de qué mes es: no se le atribuye a julio')
})

test('un débito respalda a UNA obligación: lo consumido no vuelve a servir', () => {
  const usados = new Set()
  pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS, usados })
  assert.ok(usados.has(803), 'el DEBIN de agosto queda reclamado');
  assert.ok(usados.has(801) && usados.has(802), 'los dos de julio también')
  // Con los débitos ya reclamados, una segunda pasada no puede volver a pagar nada.
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS, usados })
  assert.ok(!porPeriodo.get('2026-08')?.detalle.some((d) => d.organismo === 'UOCRA'))
})

test('junio no se aparea: su boleta existe pero ningún débito del extracto la paga', () => {
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS })
  assert.equal(porPeriodo.get('2026-06'), undefined,
    'sin evidencia bancaria el período no entra: lo cubre Compras, que es la fuente secundaria')
})

test('el CUIT a verificar viaja declarado, no escondido en una constante', () => {
  const dudoso = COBRADORES_UOCRA.find((c) => c.porVerificar)
  assert.equal(dudoso.cuit, '30707743987')
  assert.ok(dudoso.nota.length > 80, 'una inferencia sin su evidencia escrita es una invención')
})

test('la explicación del pago nombra los dos organismos y lo que quedó afuera', () => {
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS })
  const linea = explicarPago(porPeriodo.get('2026-08'))
  assert.match(linea, /UOCRA/)
  assert.match(linea, /Fondo de Cese/)
  assert.match(linea, /sin respaldo bancario/)
})
