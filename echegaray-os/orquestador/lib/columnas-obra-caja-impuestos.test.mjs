// ANTES Y DESPUÉS DE INSERTAR «Obra» — CAJA, su anexo, la cartera, los duplicados, el cuadre e IMPUESTOS.
//
// Cada bloque arma la fórmula (o la lectura) con el encabezado de HOY y con «Obra» insertada en
// Cobranzas H y Compras L. Con el de hoy tiene que dar EXACTAMENTE el texto que el Sheet ya tiene
// (la migración no puede cambiar un número hoy); con el de después, cada rango tiene que caer en la
// columna del mismo rótulo. Si alguien vuelve a tipear una letra, uno de los dos lados da rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_HOY, COLUMNAS_CON_OBRA, MAPAS_HOY, MAPAS_CON_OBRA, COB_HOY, COB_CON_OBRA } from './columnas-caja.fixture.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA, COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'
import { COBRANZAS_1409_CON_CONTROL, COBRANZAS_CON_OBRA_Y_CONTROL } from './cobranzas-encabezado-control.fixture.mjs'
import { COMPRAS, columnasDe } from './columnas-por-encabezado.mjs'
import {
  formulaCobrosPosteriores, formulaComprasPagadasPosteriores, formulaCobrosEfectivoPosteriores,
  formulaComprasEfectivoPosteriores, formulaFrescuraCaja, mapaCobranzas, mapaCompras,
} from './caja-posterior-al-corte.mjs'
import { cobranzasEsperadasTramo } from './caja-calendario.mjs'
import { formulaControlCartera } from './caja-disponibilidades.mjs'
import { bloqueEfectivoDetalle, bloqueLiquidez, bloqueTrazabilidad, bloqueVencido } from './caja-anexo-controles.mjs'
import { esIndistinguible, factorSinYaRevisados } from './cobranzas-duplicado.mjs'
import { consultaPorCliente, formulaTotalEstado } from './cobranzas-cartera.mjs'
import { columnasDelCobro, leerCobro } from './cobranzas-en-cashflow.mjs'
import { celdasDeEfectivo, COLUMNAS_CARGA_TARDIA } from './caja-carga-tardia-compras.mjs'
import { bloqueRetenciones } from './impuestos-bloques.mjs'
import { ventaDe, ventasFacturadasDelMes } from './impuestos-base-libro.mjs'
import { retencionesDeFilas, ventasFacturadasPorMes } from './impuestos-fuentes.mjs'
import { conciliarCobranzasConArca } from './cobranzas-vs-arca.mjs'
import { grilla as grillaCaja } from './caja-grilla.mjs'
import { grillaAnexo } from './caja-anexo.mjs'

/** Una fila escrita por rótulo, alineada al encabezado que se le pase. */
const filaSegun = (encabezado, valores) => encabezado.map((r) => (r == null ? '' : valores[r] ?? ''))
/** El rótulo de la columna `letra` en el encabezado. */
const rotuloDe = (encabezado, letra) => encabezado[[...letra].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1]

// ── caja-posterior-al-corte ───────────────────────────────────────────────────────────────────────

test('CAJA · posteriores al corte: hoy el texto de siempre, con «Obra» cada rango en su rótulo', () => {
  assert.equal(formulaCobrosPosteriores('$F$19', MAPAS_HOY.cob),
    "SUMIFS('Cobranzas'!$M$5:$M;'Cobranzas'!$O$5:$O;\"Cobrado\";'Cobranzas'!$N$5:$N;\"<>Echeq\";'Cobranzas'!$N$5:$N;\"<>Cheque\";'Cobranzas'!$N$5:$N;\"<>Efectivo\";'Cobranzas'!$AA$5:$AA;\"<>USD\";'Cobranzas'!$Q$5:$Q;\">\"&$F$19)")
  const cob = formulaCobrosPosteriores('$F$19', MAPAS_CON_OBRA.cob)
  assert.match(cob, /^SUMIFS\('Cobranzas'!\$N\$5:\$N;'Cobranzas'!\$P\$5:\$P;"Cobrado";'Cobranzas'!\$O\$5:\$O;"<>Echeq"/)
  assert.match(cob, /'Cobranzas'!\$R\$5:\$R;">"&\$F\$19\)$/)
  for (const [l, r] of [['N', 'TOTAL a cobrar (neto de retenciones)'], ['O', 'Forma de Cobro'], ['P', 'Estado'], ['R', 'Fecha cobro']]) assert.equal(rotuloDe(COBRANZAS_CON_OBRA, l), r)

  const cmp = formulaComprasPagadasPosteriores('$F$19', MAPAS_CON_OBRA.cmp)
  assert.match(cmp, /\('Compras'!\$Y\$4:\$Y="Pagado"\)/)
  assert.match(cmp, /\('Compras'!\$Q\$4:\$Q="Transferencia"\)/)
  assert.match(cmp, /DATEVALUE\('Compras'!\$AE\$4:\$AE&""\)/)
  assert.match(cmp, /N\('Compras'!\$P\$4:\$P\)/)
  for (const [l, r] of [['Y', 'Estado'], ['Q', 'Tipo pago'], ['AE', 'Fecha de caja'], ['P', 'Total']]) assert.equal(rotuloDe(COMPRAS_CON_OBRA, l), r)
  assert.match(formulaComprasPagadasPosteriores('$F$19', MAPAS_HOY.cmp), /\('Compras'!\$X\$4:\$X="Pagado"\).*N\('Compras'!\$O\$4:\$O\)\)$/)
})

test('CAJA · efectivo: cobros «Efectivo» y pagos por MONTO PAGADO siguen a su rótulo, rubro vivo incluido', () => {
  assert.match(formulaCobrosEfectivoPosteriores('$F$4', MAPAS_CON_OBRA.cob), /'Cobranzas'!\$AB\$5:\$AB;"<>USD"/)
  const f = formulaComprasEfectivoPosteriores('$F$4', MAPAS_CON_OBRA.cmp)
  assert.match(f, /N\('Compras'!\$U\$4:\$U\)/)
  assert.match(f, /\('Compras'!\$AD\$4:\$AD<>"Nómina · Jornales de obra"\)/)
  assert.equal(rotuloDe(COMPRAS_CON_OBRA, 'U'), 'Monto Pagado')
  assert.equal(COMPRAS_CON_OBRA[29], 'Rubro de caja', 'el SEGUNDO «Rubro de caja», el vivo')
  assert.match(formulaFrescuraCaja({ bancoRaw: null, ...MAPAS_CON_OBRA }), /'Cobranzas'!\$R\$5:\$R/)
})

test('CAJA · sin columnas resueltas no hay fórmula: el default con letras era el defecto', () => {
  assert.throws(() => formulaCobrosPosteriores('$F$19'), /falta el mapa de Cobranzas/)
  assert.throws(() => formulaComprasEfectivoPosteriores('$F$4', MAPAS_HOY.cob), /falta el mapa de Compras/)
  assert.throws(() => mapaCobranzas({}), /faltan columnas de Cobranzas/)
  assert.throws(() => mapaCompras(columnasDe(COMPRAS_2508, { total: COMPRAS.total }, 'Compras')), /faltan columnas resueltas/)
})

// ── caja-calendario · caja-disponibilidades ───────────────────────────────────────────────────────

test('CAJA · cobranzas esperadas del tramo y control de la cartera: O/Q/M hoy, P/R/N con «Obra»', () => {
  assert.equal(cobranzasEsperadasTramo('A', 'B', COB_HOY),
    'SUMPRODUCT((LOWER(Cobranzas!$O$5:$O$400)<>"cobrado")*(LOWER(Cobranzas!$O$5:$O$400)<>"endosado")*ISNUMBER(Cobranzas!$Q$5:$Q$400)*(Cobranzas!$Q$5:$Q$400>=A)*(Cobranzas!$Q$5:$Q$400<B)*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))')
  assert.match(cobranzasEsperadasTramo('A', 'B', COB_CON_OBRA), /LOWER\(Cobranzas!\$P\$5:\$P\$400\).*ISNUMBER\(Cobranzas!\$R\$5:\$R\$400\).*Cobranzas!\$N\$5:\$N\$400/)
  assert.equal(formulaControlCartera(COB_HOY),
    '=SUMPRODUCT((Cobranzas!$N$5:$N$400="Echeq")*(Cobranzas!$Q$5:$Q$400>=TODAY())*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))')
  assert.equal(formulaControlCartera(COB_CON_OBRA),
    '=SUMPRODUCT((Cobranzas!$O$5:$O$400="Echeq")*(Cobranzas!$R$5:$R$400>=TODAY())*IF(ISNUMBER(Cobranzas!$N$5:$N$400);Cobranzas!$N$5:$N$400;0))')
  assert.throws(() => cobranzasEsperadasTramo('A', 'B'), /faltan columnas de Cobranzas/)
})

// ── caja-anexo-controles ──────────────────────────────────────────────────────────────────────────

function hoja(columnas) {
  const rows = []
  return { rows, refs: { columnas, cab: 'CF_MESES', cierre: 'CF_SALDO_CIERRE', inicio: 'CF_SALDO_INICIO' }, ch: 'Cheques Emitidos', get n() { return rows.length }, push(r) { rows.push(r); return rows.length } }
}
const celdasDe = (h) => h.rows.flat().map(String).join('\n')

test('ANEXO · A4/A6/A7: el efectivo cobrado, el ritmo de egreso y el vencido leen su rótulo', () => {
  const hoy = hoja(COLUMNAS_HOY)
  bloqueLiquidez(hoy); bloqueVencido(hoy); bloqueTrazabilidad(hoy, { yaRevisados: [] }); bloqueEfectivoDetalle(hoy)
  const t = celdasDe(hoy)
  assert.ok(t.includes('(Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$AA$5:$AA$400<>"USD")*ISNUMBER(Cobranzas!$Q$5:$Q$400)'), 'hoy: el CONEF de siempre, por ventana de conteo a conteo')
  assert.ok(t.includes("SUMIFS('Compras'!$O$4:$O;'Compras'!$AD$4:$AD;\">=\"&TODAY()-90"))
  assert.ok(t.includes("N('Compras'!$T$4:$T)"))

  const obra = hoja(COLUMNAS_CON_OBRA)
  bloqueLiquidez(obra); bloqueVencido(obra); bloqueTrazabilidad(obra, { yaRevisados: [] }); bloqueEfectivoDetalle(obra)
  const u = celdasDe(obra)
  assert.ok(u.includes('(Cobranzas!$O$5:$O$400="Efectivo")*(Cobranzas!$P$5:$P$400="Cobrado")*(Cobranzas!$AB$5:$AB$400<>"USD")*ISNUMBER(Cobranzas!$R$5:$R$400)'))
  assert.ok(u.includes("SUMIFS('Compras'!$P$4:$P;'Compras'!$AE$4:$AE;\">=\"&TODAY()-90"))
  assert.ok(u.includes("N('Compras'!$U$4:$U)"))
  assert.ok(u.includes('(Cobranzas!$P$5:$P$400="Pendiente")'), 'el vencido filtra por «Estado», no por «Forma de Cobro»')
  assert.ok(!u.includes('Cobranzas!$M$5:$M$400'), 'con «Obra», la M es «Retenciones / descuentos»: no puede quedar ninguna')
})

// ── cobranzas-duplicado · cobranzas-cartera ───────────────────────────────────────────────────────

test('DUPLICADOS y CARTERA: la identidad dura y el ranking siguen a su rótulo', () => {
  assert.equal(esIndistinguible(COB_HOY, 'Cobranzas', 5, 400),
    'COUNTIFS(Cobranzas!$G$5:$G$400;Cobranzas!$G$5:$G$400;Cobranzas!$M$5:$M$400;Cobranzas!$M$5:$M$400;Cobranzas!$N$5:$N$400;Cobranzas!$N$5:$N$400;Cobranzas!$O$5:$O$400;Cobranzas!$O$5:$O$400;Cobranzas!$Q$5:$Q$400;Cobranzas!$Q$5:$Q$400)>1')
  const obra = esIndistinguible(COB_CON_OBRA, 'Cobranzas', 5, 400)
  for (const l of ['G', 'N', 'O', 'P', 'R']) assert.ok(obra.includes(`Cobranzas!$${l}$5:$${l}$400`), l)
  assert.ok(!obra.includes('$M$'))
  const fx = factorSinYaRevisados(COB_CON_OBRA, [{ forma: { fila: 39, cliente: 'LA ESTRELLA', importe: 10000000 } }])
  assert.match(fx, /INDEX\(Cobranzas!\$N\$5:\$N\$400;35\)=10000000/)

  assert.ok(consultaPorCliente(COB_HOY).startsWith('QUERY(Cobranzas!$G$5:$O$400;"select Col1,sum(Col7) where Col9 = \'Pendiente\''))
  const q = consultaPorCliente(COB_CON_OBRA)
  assert.ok(q.startsWith('QUERY(Cobranzas!$G$5:$P$400;"select Col1,sum(Col8) where Col10 = \'Pendiente\''), q)
  assert.ok(q.includes("label sum(Col8) ''"))
  assert.match(formulaTotalEstado(COB_CON_OBRA, 'pendiente'), /\(Cobranzas!\$P\$5:\$P\$400="Pendiente"\)\*IF\(ISNUMBER\(Cobranzas!\$N\$5:\$N\$400\)/)
})

// ── cobranzas-en-cashflow (cuadre, control y repaso) ─────────────────────────────────────────────

test('CUADRE · el cobro se lee por rótulo: la misma fila da el mismo cobro antes y después', () => {
  const antes = columnasDelCobro(COBRANZAS_1409_CON_CONTROL)
  const despues = columnasDelCobro(COBRANZAS_CON_OBRA_Y_CONTROL)
  assert.deepEqual([antes.total, antes.fechaCobro, antes.moneda, antes.banco], [12, 16, 26, 53])
  assert.deepEqual([despues.total, despues.fechaCobro, despues.moneda, despues.banco], [13, 17, 27, 54])
  const grid = (encabezado) => encabezado.map((r) => {
    const v = { 'Obra / Cliente': 'ARCOR', 'TOTAL a cobrar (neto de retenciones)': 5000, Estado: 'Cobrado', 'Fecha cobro': 46266, Unidad: 'Civil', 'Forma de Cobro': 'Echeq' }[r]
    const banco = String(r ?? '').startsWith('Qué dice el banco') ? 'ENDOSADO a Alumetal' : null
    return { valor: banco ?? (v == null ? '' : String(v)), numero: typeof v === 'number' ? v : null, formula: null }
  })
  const a = leerCobro(grid(COBRANZAS_1409_CON_CONTROL), 7, { cols: antes })
  const b = leerCobro(grid(COBRANZAS_CON_OBRA_Y_CONTROL), 7, { cols: despues })
  assert.deepEqual(b, a)
  assert.equal(a.monto, 5000)
  assert.equal(a.endosado, true, 'la marca de endosado se lee de la columna del banco, que también se corre')
  assert.throws(() => leerCobro([], 1), /faltan las columnas de Cobranzas/)
})

// ── caja-carga-tardia-compras ─────────────────────────────────────────────────────────────────────

test('CARGA TARDÍA · el monto pagado en efectivo sale de «Monto Pagado» (T hoy, U con «Obra»)', () => {
  const pedidas = Object.fromEntries(COLUMNAS_CARGA_TARDIA.map((k) => [k, COMPRAS[k]]))
  const vals = { 'Fecha factura': 46200, Proveedor: 'CORRALON', 'Tipo pago': 'Efectivo', 'Monto Pagado': 250000, Estado: 'Pagado', 'Fecha de caja': 46210, Total: 999 }
  const hoy = celdasDeEfectivo([filaSegun(COMPRAS_2508, vals)], columnasDe(COMPRAS_2508, pedidas, 'Compras'))
  const obra = celdasDeEfectivo([filaSegun(COMPRAS_CON_OBRA, vals)], columnasDe(COMPRAS_CON_OBRA, pedidas, 'Compras'))
  assert.deepEqual(hoy, [{ referencia: 'Compras!T4', valor: 250000, fecha: 46210, etiqueta: 'CORRALON' }])
  assert.deepEqual(obra, [{ referencia: 'Compras!U4', valor: 250000, fecha: 46210, etiqueta: 'CORRALON' }])
})

// ── impuestos-bloques · impuestos-base-libro · impuestos-fuentes · cobranzas-vs-arca ─────────────

test('IMPUESTOS · retenciones sufridas: X/Y/Z por fecha Q hoy, Y/Z/AA por R con «Obra»', () => {
  const armar = (cob) => {
    const filas = []
    const G = { push() {}, cabecera() {}, blanco() {}, n: () => 0, mensual: (rot, fn) => { filas.push([rot, fn(9)]); return filas.length } }
    bloqueRetenciones(G, { anio: 2026, cob })
    return Object.fromEntries(filas)
  }
  const hoy = armar(COB_HOY)
  assert.equal(hoy.IVA, '=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q)=2026)*(MONTH(Cobranzas!$Q$5:$Q)=9)*IF(ISNUMBER(Cobranzas!$X$5:$X);Cobranzas!$X$5:$X;0))')
  const obra = armar(COB_CON_OBRA)
  assert.equal(obra.IVA, '=SUMPRODUCT((YEAR(Cobranzas!$R$5:$R)=2026)*(MONTH(Cobranzas!$R$5:$R)=9)*IF(ISNUMBER(Cobranzas!$Y$5:$Y);Cobranzas!$Y$5:$Y;0))')
  assert.match(obra.Ganancias, /Cobranzas!\$Z\$5:\$Z/)
  assert.match(obra['Ingresos Brutos'], /Cobranzas!\$AA\$5:\$AA/)
  assert.equal(rotuloDe(COBRANZAS_CON_OBRA, 'AA'), 'Retención 2,5%/3,5% del neto ▲ rótulo original perdido')
})

test('IMPUESTOS · la venta del mes: los rangos de hoy son los de siempre; con «Obra», neto K, IVA L, factura Q', () => {
  assert.deepEqual({ ...ventaDe(COB_HOY) }, {
    categoria: 'Cobranzas!$B$5:$B', comprobante: 'Cobranzas!$E$5:$E', fecha: 'Cobranzas!$P$5:$P',
    cobro: 'Cobranzas!$Q$5:$Q', neto: 'Cobranzas!$J$5:$J', iva: 'Cobranzas!$K$5:$K',
  })
  const o = ventaDe(COB_CON_OBRA)
  assert.deepEqual([o.neto, o.iva, o.fecha, o.cobro], ['Cobranzas!$K$5:$K', 'Cobranzas!$L$5:$L', 'Cobranzas!$Q$5:$Q', 'Cobranzas!$R$5:$R'])
  assert.match(ventasFacturadasDelMes(2026, 10, 'iva', { hoy: '2026-09-04', cob: COB_CON_OBRA }), /N\(Cobranzas!\$L\$5:\$L\)/)
})

test('IMPUESTOS · lecturas por fila (ventas, retenciones, ARCA): mismo resultado antes y después', () => {
  const V = {
    'Categoría': 'B', 'Fecha de Venta': '15/09/2026', 'N° Comprobante': '01-00000228', 'Obra / Cliente': 'ARCOR',
    'Monto neto': 1000000, IVA: 210000, 'Fecha de Factura': 46280, 'Fecha cobro': 46300,
    'Retención 16,8% del neto ▲ rótulo original perdido': 168000, 'Ret Ganancias': 20000,
  }
  const hoy = [filaSegun(COBRANZAS_1409, V)]
  const obra = [filaSegun(COBRANZAS_CON_OBRA, { ...V, Obra: 'OB-0001' })]
  assert.deepEqual(ventasFacturadasPorMes(obra, COB_CON_OBRA), ventasFacturadasPorMes(hoy, COB_HOY))
  assert.equal(ventasFacturadasPorMes(hoy, COB_HOY).porMes['2026-09'], 1000000)
  assert.deepEqual(retencionesDeFilas(obra, COB_CON_OBRA), retencionesDeFilas(hoy, COB_HOY))
  assert.equal(retencionesDeFilas(hoy, COB_HOY)[0].retenciones.iva, 168000)
  const arca = [['2026-09', 'Ventas', 46280, 'Factura A', '1', 1, '1', '999', '30', 'R', 5, 1]]
  const cHoy = conciliarCobranzasConArca(hoy, arca, { hoy: '2026-09-20', cols: COB_HOY })
  assert.deepEqual(conciliarCobranzasConArca(obra, arca, { hoy: '2026-09-20', cols: COB_CON_OBRA }), cHoy)
  assert.equal(cHoy.noEstaEnArca[0].comprobante, '1-228')
  assert.equal(cHoy.noEstaEnArca[0].neto, 1000000)
})

// ── caja-grilla · caja-anexo (las grillas enteras) ────────────────────────────────────────────────

test('GRILLAS · CAJA y el anexo enteros: con «Obra», ninguna fórmula sobre Cobranzas cita la M ni la Q', () => {
  const refs = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 }, cierre: 60, inicio: 50, cab: 5 }
  const texto = (g) => g.filas.flat().map((c) => String(c ?? '')).join('\n')
  for (const [cols, total, fecha] of [[COLUMNAS_HOY, 'M', 'Q'], [COLUMNAS_CON_OBRA, 'N', 'R']]) {
    const t = texto(grillaCaja(new Map(), { ...refs, columnas: cols })) + texto(grillaAnexo({ refs: { ...refs, columnas: cols } }))
    assert.ok(t.includes(`'Cobranzas'!$${total}$5:$${total}`), `el total en ${total}`)
    assert.ok(t.includes(`'Cobranzas'!$${fecha}$5:$${fecha}`), `la fecha de cobro en ${fecha}`)
  }
  const t = texto(grillaCaja(new Map(), { ...refs, columnas: COLUMNAS_CON_OBRA })) + texto(grillaAnexo({ refs: { ...refs, columnas: COLUMNAS_CON_OBRA } }))
  assert.ok(!/Cobranzas'?!\$[MQ]\$5/.test(t), 'con «Obra», M es «Retenciones / descuentos» y Q «Fecha de Factura»')
  assert.throws(() => grillaCaja(new Map(), refs), /faltan columnas/)
})
