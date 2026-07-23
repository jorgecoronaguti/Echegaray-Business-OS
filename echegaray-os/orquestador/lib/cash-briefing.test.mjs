#!/usr/bin/env node
// Test del briefing de caja: cálculos determinísticos sobre datos estructurados (mock google).
import { parseMonto, parseFecha, cashBriefing } from './cash-briefing.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// Mock del Cash Flow. hoy = 17/07/2026 (mes "jul-26"; ventana 17→24/07).
const HOY = new Date(2026, 6, 17)
const data = {
  // ESTRUCTURA REAL de la pestaña Caja: título, aclaración, un bloque resumen en G/H, y recién
  // en la fila 4 el encabezado — con una columna ID que se agregó DESPUÉS de escribir este parseo.
  // Bug real (2026-07-20): leyendo por posición fija, la FECHA se tomaba como cuenta y el NOMBRE
  // DE LA CUENTA como saldo → parseMonto de un texto = 0, y el briefing informaba caja $0 sin
  // fallar ni avisar. Por eso ahora las columnas se ubican por su encabezado.
  'Caja!A1:H200': [
    ['LEDGER DE SALDOS BANCARIOS Y EFECTIVO'],
    ['Una fila por actualización. No borres filas anteriores.'],
    ['', '', '', '', '', '', 'Banco Santander (último)', '$0'],
    ['ID', 'Fecha', 'Cuenta', 'Saldo', 'Estado', 'Fuente / Observación'],
    ['001', '10/07/2026', 'Santander', '$10.000.000', 'Confirmado', 'x'],
    ['002', '17/07/2026', 'Santander', '$17.691.359', 'Confirmado', 'x'],  // más nuevo → gana
    ['003', '17/07/2026', 'Efectivo', '$2.000.000', 'Confirmado', 'x'],
  ],
  '02_Cobranzas!A5:R2000': [
    // A..R (18 cols): idx12=M Total, idx14=O Estado, idx16=Q Fecha cobro, idx17=R Mes cobro
    [1, '', '', '', '', '', 'ARCOR', '', '', '', '', '', '$5.000.000', '', 'Cobrado', '', '', 'jul-26'],
    [2, '', '', '', '', '', 'LA ESTRELLA', '', '', '', '', '', '$3.000.000', '', 'Proyectado', '', '', 'jul-26'],
    [3, '', '', '', '', '', 'IMOTOR', '', '', '', '', '', '$9.999', '', 'Cobrado', '', '', 'jun-26'], // otro mes → no cuenta
    // VENCIDAS: fecha cobro (idx16) < hoy 17/7 y NO cobrado → cuenta como vencida
    [4, '', '', '', '', '', 'LA ESTRELLA', '', '', '', '', '', '$15.000.000', '', 'Pendiente', '', '2/7/2026', 'jul-26'],
    [5, '', '', '', '', '', 'MESSINAS', '', '', '', '', '', '$4.000.000', '', 'Facturado', '', '10/6/26', 'jun-26'],
    // NO vencida: fecha cobro futura
    [6, '', '', '', '', '', 'ARCOR', '', '', '', '', '', '$8.000.000', '', 'Pendiente', '', '31/7/2026', 'jul-26'],
    // NO vencida: fecha cobro pasada pero YA cobrado
    [7, '', '', '', '', '', 'IMOTOR', '', '', '', '', '', '$6.000.000', '', 'Cobrado', '', '1/7/2026', 'jul-26'],
    // NO vencida: monto 0 (ruido)
    [8, '', '', '', '', '', 'IMOTOR', '', '', '', '', '', '$0', '', 'Efectivo', '', '1/7/2026', 'jul-26'],
    // ENTRA esta semana: fecha cobro 20/7 (dentro de [17,24]), sin cobrar → suma a proyección
    [9, '', '', '', '', '', 'LA ESTRELLA', '', '', '', '', '', '$2.000.000', '', 'Pendiente', '', '20/7/2026', 'jul-26'],
  ],
  'Cheques!A2:J997': [
    // idx4=E prov, idx5=F monto, idx8=I fecha pago
    ['FISICO', '1', '', '', 'Corralon', '$470.945', '', '', '18/7/2026', 'julio 26'],  // dentro de 7d
    ['FISICO', '2', '', '', 'Viejo', '$999.999', '', '', '2/1/2026', 'enero 26'],       // fuera
  ],
  'Tarjeta de Credito!A3:J998': [
    // idx2=C prov, idx4=E monto, idx7=H fecha pago, idx9=J DEBITADO
    ['', '', 'Modica', '', '$355.413', '', '', '20/7/2026', 'julio 26', ''],   // dentro, no debitado
    ['', '', 'Modica', '', '$355.413', '', '', '20/7/2026', 'julio 26', 'SI'], // dentro pero DEBITADO → excluir
  ],
}
const google = { async readSheetValues(id, range) { return data[range] || [] } }

async function main() {
  check('parseMonto es-AR', parseMonto('$17.691.359') === 17691359 && parseMonto('$470.945,00') === 470945)
  check('parseFecha DD/MM/YYYY', parseFecha('18/7/2026')?.getMonth() === 6 && parseFecha('18/7/2026')?.getDate() === 18)
  check('parseFecha inválida → null', parseFecha('') === null && parseFecha('julio') === null)

  const b = await cashBriefing(google, HOY)
  check('caja: último saldo por cuenta (Santander 17.691.359, no el viejo)', b.caja.cuentas.find((c) => c.cuenta === 'Santander').saldo === 17691359)
  check('caja total = Santander + Efectivo', b.caja.total === 17691359 + 2000000)
  check('cobranzas mes en curso = jul-26', b.cobranzas_mes.mes === 'jul-26')
  check('cobrado del mes (jul-26 Cobrado: 5M + 6M)', b.cobranzas_mes.cobrado === 11000000)
  check('por cobrar del mes (jul-26 no cobrado: 3M+15M+8M+2M)', b.cobranzas_mes.por_cobrar === 28000000)
  check('NO cuenta cobranza de otro mes (jun-26 excluida)', b.cobranzas_mes.cobrado + b.cobranzas_mes.por_cobrar === 39000000)
  // VENCIDAS: por Fecha cobro (idx16) pasada y sin cobrar
  check('vencidas: 2 items (LA ESTRELLA 2/7 + MESSINAS 10/6)', b.cobranzas_vencidas.items.length === 2)
  check('total vencido = 15M + 4M', b.cobranzas_vencidas.total === 19000000)
  check('vencidas ordenadas por días desc (MESSINAS 37d primero)', b.cobranzas_vencidas.items[0].cliente === 'MESSINAS')
  check('días vencido calculados (LA ESTRELLA 2/7→17/7 = 15d)', b.cobranzas_vencidas.items.find((v) => v.cliente === 'LA ESTRELLA')?.dias === 15)
  check('vencida NO incluye cobrada (fecha pasada pero Cobrado)', !b.cobranzas_vencidas.items.some((v) => v.monto === 6000000))
  check('vencida NO incluye futura (fecha cobro 31/7)', !b.cobranzas_vencidas.items.some((v) => v.monto === 8000000))
  check('vencida NO incluye monto 0', !b.cobranzas_vencidas.items.some((v) => v.monto === 0))
  check('vencimiento cheque dentro de 7d', b.vencimientos_7dias.cheques.length === 1 && b.vencimientos_7dias.cheques[0].monto === 470945)
  check('cheque viejo (fuera de 7d) excluido', !b.vencimientos_7dias.cheques.some((c) => c.proveedor === 'Viejo'))
  check('tarjeta NO debitada incluida, DEBITADA excluida', b.vencimientos_7dias.tarjeta.length === 1)
  check('total vencimientos 7d = cheque + tarjeta', b.vencimientos_7dias.total === 470945 + 355413)
  // PROYECCIÓN 7 días: caja + lo que entra esta semana − lo que se paga esta semana
  check('proyección: entra esta semana (fecha cobro 20/7, sin cobrar)', b.proyeccion_7dias.entra === 2000000)
  check('proyección: NO cuenta vencido (2/7, 10/6) como entrada', b.proyeccion_7dias.entra === 2000000)
  check('proyección: sale = vencimientos 7d', b.proyeccion_7dias.sale === 826358)
  check('proyección: proyectado = caja + entra − sale', b.proyeccion_7dias.proyectado === 19691359 + 2000000 - 826358)

  // ═══ CANDADO: la pestaña CAJA rediseñada en secciones NO puede inflar la caja ═══
  //
  // Bug real (23/07): con el rediseño en secciones (1..10), el parseo sumaba filas de sección y
  // control ("⇒ TOTAL QUE SALIÓ", "Costo financiero del descubierto") y daba caja $384M falsa; y leía
  // "Saldo en moneda de origen" en vez de "Saldo en pesos", así que la cuenta USD entraba sin
  // convertir. Este mock reproduce el esquema real y exige: total = fila "Total disponibilidades",
  // USD convertida, y CERO filas de sección adentro.
  const cajaReal = [
    ['Cuenta', 'Moneda', 'Saldo en moneda de origen', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo', 'Antigüedad'],
    ['Caja en pesos', 'ARS', '$1.500.000', '', '$1.500.000', '23/07/2026', ''],
    ['Santander · cta cte USD', 'USD', '581,39', '1488,99', '$865.682', '23/07/2026', ''],
    ['Valores a depositar', 'ARS', '$10.000.000', '', '$10.000.000', '23/07/2026', ''],
    ['Total disponibilidades', '', '', '', '$12.365.682', '', ''],
    ['(−) Cheques emitidos, no debitados', 'ARS', '', '', '$13.076.832', '', ''],
    ['⇒ TOTAL QUE SALIÓ DE LA CUENTA', '', '', '', '$41.751.582', '', ''],
    ['Costo financiero del descubierto', '', '', '', '$285.374', '', ''],
  ]
  const google2 = { async readSheetValues(id, range) { return range.startsWith('Caja!') ? cajaReal : [] } }
  const b2 = await cashBriefing(google2, HOY)
  check('CAJA secciones: total = "Total disponibilidades" ($12.365.682), NO la suma de secciones', b2.caja.total === 12365682)
  check('CAJA secciones: la cuenta USD entra CONVERTIDA a pesos ($865.682), no en dólares', b2.caja.cuentas.find((c) => /usd/i.test(c.cuenta))?.saldo === 865682)
  check('CAJA secciones: NO se cuela ninguna fila de sección/control como cuenta', !b2.caja.cuentas.some((c) => /TOTAL QUE SALIÓ|Costo financiero|Cheques emitidos/i.test(c.cuenta)))
  check('CAJA secciones: sólo las 3 cuentas antes del total', b2.caja.cuentas.length === 3)

  console.log(`\ncash-briefing.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}
main()
