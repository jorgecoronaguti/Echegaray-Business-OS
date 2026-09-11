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

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// IERIC Y FODECO (11/09/2026) — el «SIN_APAREO» era falso: hay boleta y hay dos débitos iguales
// ═════════════════════════════════════════════════════════════════════════════════════════════════
//
// Los datos son los reales. Boletas `ContribucionIERIC/FODECO30716304643202608.pdf` (Drive,
// archivo-fiscal/2026/IERIC): $13.794,56 cada una, vencen 15/09. El dueño las pagó el 11/09 por Pago
// Mis Cuentas «IERIC CONT 1P»: dos comprobantes de $13.794,56, trx 889015905659 (09:16:55) y
// 493817674210 (09:16:57). El extracto de Santander todavía no los trae (último importado: 10/09);
// cuando entren van a decir «Pago de servicios - Ieric cont.1p: 30716304643 - tarj nro. 3537», que es
// el texto con que entraron los de julio (18/08, 2 × $13.191,19).

import { debitosDeIeric, RE_IERIC, cubiertoDelBanco, SIN_APAREO } from './cargas-pagos-banco.mjs'

const boletaIeric = (organismo, periodo, total, boleta) => ({ organismo, periodo, total, boleta, vence: null })
const BOLETAS_IERIC = [
  boletaIeric('IERIC', '2026-07', 13191.19, '5736249'), boletaIeric('FODECO', '2026-07', 13191.19, '5736247'),
  boletaIeric('IERIC', '2026-08', 13794.56, '5776268'), boletaIeric('FODECO', '2026-08', 13794.56, '5776271'),
]
const PMC = 'Pago de servicios - Ieric cont.1p: 30716304643 - tarj nro. 3537'
const IERIC_JUL = [debito('2026-08-18', PMC, 13191.19, 820), debito('2026-08-18', PMC, 13191.19, 821)]
const IERIC_AGO = [debito('2026-09-11', PMC, 13794.56, 830), debito('2026-09-11', PMC, 13794.56, 831)]

test('el descriptor del banco: Pago Mis Cuentas y la tarjeta escriben distinto y los dos son IERIC', () => {
  assert.ok(RE_IERIC.test(PMC))
  assert.ok(RE_IERIC.test('Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077'))
  assert.ok(!RE_IERIC.test('Debito debin - id debin rd06zo9w4lqdwjv325gp7x cuit 30503049097'), 'el DEBIN de UOCRA no es IERIC')
  assert.deepEqual(debitosDeIeric([...DEBITOS, ...IERIC_AGO, ...IERIC_JUL]).map((d) => d.fila), [820, 821, 830, 831])
  assert.deepEqual(SIN_APAREO, {}, 'ya no queda ningún organismo declarado sin apareo')
})

test('EL CASO DE HOY: los dos débitos del 11/09 pagan IERIC y FODECO de agosto, y no tocan lo de UOCRA', () => {
  const usados = new Set()
  const { porPeriodo, avisos } = pagosGremialesDelBanco({
    debitos: [...DEBITOS, ...IERIC_AGO], boletas: BOLETAS, boletasIeric: BOLETAS_IERIC, usados,
  })
  const ago = porPeriodo.get('2026-08')
  const ieric = ago.detalle.find((d) => d.organismo === 'IERIC')
  const fodeco = ago.detalle.find((d) => d.organismo === 'FODECO')
  assert.equal(ieric.cubierto, 13794.56)
  assert.equal(fodeco.cubierto, 13794.56)
  assert.equal(ieric.fecha, S('2026-09-11'))
  assert.deepEqual([ieric.filas, fodeco.filas].flat().sort(), [830, 831], 'los dos débitos, uno por boleta')
  assert.equal(ago.fueraDelDeclarado, 27589.12, 'IERIC + FODECO viajan aparte del declarado')
  assert.equal(ago.cubierto, 2155341.26, 'UOCRA + Fondo de Cese no cambian: el declarado de la pestaña no incluye IERIC')
  assert.equal(ago.resto, 219055.92, 'el Fondo de Cese sin respaldo sigue visible — no lo tapa la plata de IERIC')
  assert.ok(usados.has(830) && usados.has(831), 'consumidos: no pueden respaldar otra obligación')
  assert.ok(!avisos.some((a) => /IERIC/.test(a)), `no hay nada que avisar: ${avisos.join(' | ')}`)
  assert.match(explicarPago(ago), /IERIC \$13\.795 \(débito de \$13\.795 el 2026-09-11 · boleta nº 5776268\)/)
})

test('SIN los débitos del 11/09 (el extracto de hoy), agosto NO tiene IERIC ni FODECO pagados — el control da rojo', () => {
  const { porPeriodo } = pagosGremialesDelBanco({ debitos: DEBITOS, boletas: BOLETAS, boletasIeric: BOLETAS_IERIC })
  const ago = porPeriodo.get('2026-08')
  assert.deepEqual(ago.detalle.map((d) => d.organismo), ['UOCRA', 'Fondo de Cese'])
  assert.equal(ago.fueraDelDeclarado, 0)
})

test('con UN solo débito no se aparea ninguno: no se sabe cuál organismo cobró', () => {
  const { porPeriodo, avisos } = pagosGremialesDelBanco({
    debitos: [...DEBITOS, IERIC_AGO[0]], boletas: BOLETAS, boletasIeric: BOLETAS_IERIC,
  })
  assert.equal(porPeriodo.get('2026-08').fueraDelDeclarado, 0)
  assert.ok(avisos.some((a) => /UN solo débito de \$13\.795/.test(a)), avisos.join(' | '))
})

test('un débito de OTRO importe no paga la boleta de agosto (el de julio, $13.191,19, no sirve)', () => {
  const { porPeriodo, avisos } = pagosGremialesDelBanco({
    debitos: [...DEBITOS, debito('2026-09-11', PMC, 13191.19, 840), debito('2026-09-11', PMC, 13191.19, 841)],
    boletas: BOLETAS, boletasIeric: BOLETAS_IERIC.filter((b) => b.periodo === '2026-08'),
  })
  assert.equal(porPeriodo.get('2026-08').fueraDelDeclarado, 0)
  assert.ok(avisos.some((a) => /2 débito\(s\) a IERIC sin boleta/.test(a)), 'los débitos sin boleta se nombran')
})

test('un débito ANTERIOR al fin del período no puede ser su pago', () => {
  const tempranos = [debito('2026-08-20', PMC, 13794.56, 850), debito('2026-08-20', PMC, 13794.56, 851)]
  const { porPeriodo } = pagosGremialesDelBanco({
    debitos: [...DEBITOS, ...tempranos], boletas: BOLETAS, boletasIeric: BOLETAS_IERIC.filter((b) => b.periodo === '2026-08'),
  })
  assert.equal(porPeriodo.get('2026-08').fueraDelDeclarado, 0, 'la boleta de agosto se genera en septiembre: un débito del 20/08 no la pagó')
})

test('julio y agosto se aparean cada uno con SU par y los débitos no se reutilizan', () => {
  const usados = new Set()
  const { porPeriodo } = pagosGremialesDelBanco({
    debitos: [...DEBITOS, ...IERIC_AGO, ...IERIC_JUL], boletas: BOLETAS, boletasIeric: BOLETAS_IERIC, usados,
  })
  assert.deepEqual(porPeriodo.get('2026-07').filas.filter((f) => f >= 820 && f < 900).sort(), [820, 821])
  assert.deepEqual(porPeriodo.get('2026-08').filas.filter((f) => f >= 820 && f < 900).sort(), [830, 831])
  assert.equal(porPeriodo.get('2026-07').fueraDelDeclarado, 26382.38)
})

test('un período con boletas de IERIC pero SIN boleta de UOCRA también entra — y con una sola de las dos, avisa', () => {
  const { porPeriodo, avisos } = pagosGremialesDelBanco({
    debitos: [debito('2026-10-13', PMC, 10882.13, 860), debito('2026-10-13', PMC, 10882.13, 861)],
    boletas: BOLETAS,
    boletasIeric: [boletaIeric('IERIC', '2026-09', 10882.13, '1'), boletaIeric('FODECO', '2026-09', 10882.13, '2'),
      boletaIeric('IERIC', '2026-10', 11000, '3')],
  })
  const sep = porPeriodo.get('2026-09')
  assert.equal(sep.declarado, 0, 'sin boleta de UOCRA no hay declarado de la pestaña')
  assert.equal(sep.fueraDelDeclarado, 21764.26)
  assert.ok(!porPeriodo.has('2026-10'))
  assert.ok(avisos.some((a) => /2026-10 tiene la boleta de IERIC pero no la del otro organismo/.test(a)))
})

test('lo que descuenta el Libro depende de dónde salió la obligación: la declarada no trae IERIC, la proyectada sí', () => {
  const banco = { cubierto: 2155341.26, fueraDelDeclarado: 27589.12 }
  assert.equal(cubiertoDelBanco(banco, 'COMPROMETIDO'), 2155341.26)
  assert.equal(cubiertoDelBanco(banco, 'PROYECTADO'), 2182930.38)
  assert.equal(cubiertoDelBanco({ cubierto: 0, fueraDelDeclarado: 27589.12 }, 'PROYECTADO'), 27589.12)
  assert.equal(cubiertoDelBanco(null, 'PROYECTADO'), 0)
})
