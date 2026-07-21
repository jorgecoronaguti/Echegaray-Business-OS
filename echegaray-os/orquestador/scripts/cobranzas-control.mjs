#!/usr/bin/env node
// Detector permanente de cobros duplicados o sin fecha, adentro de la pestaña Cobranzas.
//
// "Revisá el tema cobranzas, no puede haber nada ni duplicado ni fuera de consideración" — y al
// auditarla aparecieron dos casos por $20.500.876, todos en julio:
//   · Filas 50 y 54: MISMO ID (47), mismo cliente, mismo monto ($16.200.000), misma fecha de cobro
//     (17/7), las dos "Cobrado" y en efectivo. Sólo cambia cómo está escrito el concepto.
//   · Filas 55 y 56: la misma factura de MESSINAS por $4.300.876. La 55 tiene número de comprobante
//     y está "Facturado"; la 56 no tiene comprobante y quedó "Proyectado". La proyección no se borró
//     cuando se facturó de verdad.
// En un mes en que las cobranzas Civil dan $105,8M, $20,5M de fantasma no es un detalle.
//
// NO BORRA NADA. El dueño fue explícito: "mucho cuidado con romper o perder información". Marcar y
// avisar es reversible; borrar una fila que resultó ser un cobro real, no. La decisión de cuál de
// las dos filas sobra es de quien conoce el cobro.
//
// LO QUE SÍ HACE: deja el detector escrito y vivo, así el próximo duplicado se ve el día que se
// carga y no seis meses después. Es la diferencia entre auditar una vez y tener un control.
//
// DÓNDE LO PONE, Y POR QUÉ IMPORTA: el bloque va a la DERECHA (columnas Y en adelante), no abajo.
// El cash flow suma Cobranzas!$5:$200; un bloque de control con números puesto en la fila 70 se
// sumaría a sí mismo como si fuera un cobro. Ya pasó una vez en esta planilla.
//
//   node orquestador/scripts/cobranzas-control.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { ECHEQS_TERCEROS, CORTE as BANCO_CORTE } from '../lib/banco-santander.mjs'
import { MARCA_ENDOSADO } from '../lib/cash-flow-lineas.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cobranzas'
const DRY = process.argv.includes('--dry')

// Los rangos de datos, iguales a los que usa el cash flow.
const F0 = 5, F1 = 200
const A = `$A$${F0}:$A$${F1}`   // ID
const G = `$G$${F0}:$G$${F1}`   // Obra / Cliente
const M = `$M$${F0}:$M$${F1}`   // TOTAL a cobrar, neto de retenciones (=J+K-L)
const Q = `$Q$${F0}:$Q$${F1}`   // Fecha de cobro
const O = `$O$${F0}:$O$${F1}`   // Estado
// LO QUE DISTINGUE UN COBRO DE OTRO cuando el cliente, el monto y la fecha coinciden.
// Se agregaron el 20/07 porque el detector marcó como duplicadas las filas 39 y 40 —dos cobros de
// $10.000.000 a LA ESTRELLA el mismo día— y el dueño avisó que son DOS CONCEPTOS DISTINTOS. Tenía
// razón: yo miraba tres columnas de una planilla que tiene diez. Un cobro se identifica por su
// comprobante, su orden de compra o su concepto; si alguno difiere, son cobros distintos y punto.
const E = `$E$${F0}:$E$${F1}`   // N° Comprobante
const H = `$H$${F0}:$H$${F1}`   // Orden de compra
const I = `$I$${F0}:$I$${F1}`   // Concepto
// DÓNDE VAN LAS COLUMNAS, Y POR QUÉ ESTÁS LEYENDO ESTO. La primera versión de este script escribió
// en X y Z:AB porque las vi vacías en las filas de abajo. NO estaban vacías: X, Y, Z y AA son el
// desglose de retenciones de las facturas de ARCOR, y la columna L es su SUMA — así que al pisarlas
// cambió el TOTAL Bruto de 9 filas. Pisé $2.487.910 de retenciones reales y los rótulos de X, Z y
// AA. Los importes se pudieron reconstruir contra la réplica de Supabase; los rótulos no.
// Por eso ahora el bloque va a BA en adelante, verificado vacío en toda la altura de la pestaña, y
// el script CHEQUEA que esté vacío antes de escribir. Mirar unas filas y suponer no alcanza.
const C_VALOR = 53              // BB: qué dice el BANCO de ese valor (endosado, en custodia, cobrado)
const C_FLAG = 52               // BA: la marca por fila
const C_CTRL = 54               // BC: el bloque de control

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// Marca de cada fila. Dos señales distintas, porque son dos errores distintos:
//   · ID repetido = la misma operación cargada dos veces.
//   · Mismo cliente + monto + fecha de cobro = el mismo cobro escrito de dos maneras (típico cuando
//     queda viva la proyección después de facturar).
// Una cuota legítima NO cae acá: comparte cliente y monto pero cobra en fechas distintas.
const flagPorFila = `=ARRAYFORMULA(IF(${M}=0;"";
  IF((COUNTIF(${A};${A})>1)*(${A}<>"")>0;"⚠ ID repetido — ¿es la misma operación cargada dos veces?";
  IF(COUNTIFS(${G};${G};${M};${M};${Q};${Q};${E};${E};${H};${H};${I};${I})>1;"⚠ Igual en TODO: cliente, monto, fecha, comprobante, orden de compra y concepto. Acá sí hay que revisar si se cargó dos veces.";
  IF((COUNTIFS(${G};${G};${M};${M};${Q};${Q})>1)*(${E}="")*(${H}="")*(${I}="")>0;"Otro cobro del mismo cliente, monto y día. No se puede distinguir de su par porque los dos están SIN concepto — completalo y esta marca se va sola.";
  IF((${O}="Proyectado")*(COUNTIFS(${G};${G};${M};${M})>1)>0;"⚠ Proyección con gemela ya facturada por el mismo monto — dar de baja o queda contada dos veces";
  ""))))))`.replace(/\s*\n\s*/g, '')

/** La firma que identifica el bloque como escrito por el OS. Permite rehacerlo sin pisar nada ajeno. */
const FIRMA = 'CONTROL DE COBRANZAS'

function bloque() {
  const L = (t, f = '', nota = '') => [t, f, nota]
  return [
    L(FIRMA),
    L('Se recalcula solo. Si algo da distinto de cero, es trabajo pendiente, no un error del control.'),
    L(''),
    L('Total bruto cargado', `=SUM(${M})`, 'Todo lo que hay en la pestaña.'),
    L('Lo que toma el Cash Flow', `=SUMPRODUCT((${G}<>"")*IF(ISNUMBER(${M});${M};0))`, 'Tiene que ser el mismo número: si no, hay cobros que el cash flow no está viendo.'),
    L('⇒ Diferencia (tiene que ser $0)', `=$${letra(C_CTRL + 1)}$4-$${letra(C_CTRL + 1)}$5`, ''),
    L(''),
    L('Cobros sin fecha de cobro', `=SUMPRODUCT((${G}<>"")*(${Q}="")*IF(ISNUMBER(${M});${M};0))`, 'Están cargados pero no caen en ninguna semana del cash flow.'),
    L('Cobros sin cliente', `=SUMPRODUCT((${G}="")*IF(ISNUMBER(${M});${M};0))`, 'El cash flow los clasifica por unidad de negocio; sin cliente no se sabe de qué obra son.'),
    L(''),
    L('⚠ POSIBLES DUPLICADOS'),
    L('Filas con ID repetido', `=SUMPRODUCT((COUNTIF(${A};${A})>1)*(${A}<>"")*(${M}<>0))`, 'Ver la marca en la columna X.'),
    L('Proyecciones con gemela ya facturada', `=SUMPRODUCT((${O}="Proyectado")*(COUNTIFS(${G};${G};${M};${M})>1)*(${M}<>0))`, 'La proyección quedó viva después de emitir la factura. Es el caso de MESSINAS filas 55/56.'),
    L('Filas idénticas en TODO (cliente, monto, fecha, comprobante, OC y concepto)', `=SUMPRODUCT((COUNTIFS(${G};${G};${M};${M};${Q};${Q};${E};${E};${H};${H};${I};${I})>1)*(${M}<>0))`, 'Esto sí amerita revisar si se cargó dos veces. Una cuota legítima NO cae acá: cobra en otra fecha.'),
    L('Filas que no se pueden distinguir (mismo cliente, monto y día, SIN concepto)', `=SUMPRODUCT((COUNTIFS(${G};${G};${M};${M};${Q};${Q})>1)*(${E}="")*(${H}="")*(${I}="")*(${M}<>0))`, 'NO son duplicados: son cobros a los que les falta el dato que los diferencia. Se arregla completando el concepto, no borrando filas.'),
    L('Plata en juego si esas filas idénticas fueran duplicados', `=SUMPRODUCT(((COUNTIF(${A};${A})>1)*(${A}<>"")+(COUNTIFS(${G};${G};${M};${M};${Q};${Q};${E};${E};${H};${H};${I};${I})>1)>0)*IF(ISNUMBER(${M});${M};0))/2`, 'Es la mitad del monto marcado: de cada par sobraría uno. Estimación, no un dato — sólo quien conoce el cobro sabe cuál sobra.'),
    L(''),
    L('Facturado y todavía no cobrado', `=SUMPRODUCT((${O}="Facturado")*IF(ISNUMBER(${M});${M};0))`, 'Plata emitida que la empresa está financiando.'),
    L('Proyectado (todavía ni facturado)', `=SUMPRODUCT((${O}="Proyectado")*IF(ISNUMBER(${M});${M};0))`, 'ESTIMACIÓN. Si una proyección ya se facturó, hay que darla de baja o queda contada dos veces.'),
  ]
}

/**
 * QUÉ PASÓ DESPUÉS CON CADA VALOR, según el banco.
 *
 * POR QUÉ (21/07). El dueño: "tenés que cruzar datos, no esperar que yo te diga". Tenía razón: yo
 * había detectado que dos echeq de $10.000.000 estaban ENDOSADOS a Alumetal y lo dejé anotado como
 * "pendiente de tu decisión", mientras el cuadro seguía esperando esos $20.000.000 como ingreso de
 * agosto. Detectar un error y no corregirlo es casi peor que no detectarlo.
 *
 * Cobranzas registra que el echeq se cobró, y es cierto. Lo que no puede saber es qué se hizo
 * después con el valor: eso sólo lo sabe el banco. La marca va al lado de la fila y el cash flow la
 * usa para NO contar como ingreso futuro algo que ya se entregó.
 *
 * EL CRUCE ES POR FECHA DE PAGO + IMPORTE, que es lo único que comparten las dos fuentes: el número
 * de echeq del banco (90020100) no está en ninguna columna de Cobranzas.
 */
async function marcarValoresSegunBanco(google) {
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F0}:Q${F1}`)
  const clave = (f, m) => `${f}|${Math.round(m)}`
  const banco = new Map()
  for (const e of ECHEQS_TERCEROS) {
    const [a, mm, d] = e.pago.split('-').map(Number)
    banco.set(clave(`${d}/${mm}/${a}`, e.importe), e)
  }
  const marcas = []
  let endosados = 0
  for (let i = 0; i < F1 - F0 + 1; i++) {
    const f = v[i] ?? []
    const forma = String(f?.[13] ?? '').trim()
    const fecha = String(f?.[16] ?? '').trim()
    const monto = parseMonto(f?.[12])
    if (!/eche?q/i.test(forma) || !fecha || !monto) { marcas.push(['']); continue }
    const e = banco.get(clave(fecha, monto))
    if (!e) { marcas.push(['⚠ el banco no tiene un echeq con esta fecha e importe']); continue }
    if (e.estado === 'endosado') {
      endosados++
      marcas.push([`${MARCA_ENDOSADO} a ${e.beneficiario} · echeq ${e.numero} — se entregó, NO va a entrar a la cuenta`])
    } else if (e.estado === 'custodia') marcas.push([`EN CUSTODIA · echeq ${e.numero} — sigue siendo de la empresa`])
    else marcas.push([`COBRADO · echeq ${e.numero} — ya está en el saldo del banco`])
  }
  const col = letra(C_VALOR)
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!${col}4`, values: [[`Qué dice el banco de este valor · al ${BANCO_CORTE}`]] },
    { range: `${PESTAÑA}!${col}${F0}:${col}${F1}`, values: marcas },
  ])
  console.log(`  valores marcados según el banco: ${endosados} endosados (no cuentan como ingreso futuro)`)
}

/**
 * El rótulo de la columna M dice "TOTAL Bruto" y la fórmula es =J+K-L: neto + IVA MENOS retenciones.
 * O sea, lo que efectivamente entra a la cuenta. Bruto sería J+K.
 *
 * POR QUÉ IMPORTA Y NO ES COSMÉTICO: es la columna que el cash flow usa como ingreso. Quien lee
 * "bruto" asume que todavía hay que descontarle retenciones y presupuesta de menos dos veces la
 * misma plata. Un rótulo equivocado en la columna que decide es un error de datos, no de redacción.
 *
 * SE VERIFICA ANTES DE RENOMBRAR. Se lee la fórmula real de la primera fila: sólo si de verdad es
 * J+K-L se corrige el rótulo. Renombrar por lo que yo creo que hace la columna sería exactamente el
 * error que este cambio arregla.
 */
async function corregirRotuloTotal(google) {
  const CORRECTO = 'TOTAL a cobrar (neto de retenciones)'
  const g = await google.readSheetGrid(ID, `${PESTAÑA}!M4:M${F0}`)
  const rotulo = String(g.filas?.[0]?.[0]?.valor ?? '').trim()
  const formula = String(g.filas?.[1]?.[0]?.formula ?? '')
  if (rotulo === CORRECTO) return
  if (!/^=J\d+\+K\d+-L\d+$/.test(formula)) {
    console.log(`  ⚠ no toco el rótulo de M: esperaba =J+K-L y encontré "${formula || '(sin fórmula)'}"`)
    return
  }
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!M4`, values: [[CORRECTO]] }])
  console.log(`  rótulo de M corregido: "${rotulo}" → "${CORRECTO}" (la fórmula es ${formula}: descuenta retenciones)`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const b = bloque()
  console.log(`${PESTAÑA}: marca por fila en ${letra(C_FLAG)}, control en ${letra(C_CTRL)}1:${letra(C_CTRL + 2)}${b.length}`)
  if (DRY) { for (const f of b) console.log('  ', f[0], '|', String(f[1]).slice(0, 50)); return }

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)

  // Nunca más escribir sobre una columna sin haber mirado TODA su altura.
  //
  // Pero el control se rehace todos los días, así que la zona va a tener contenido: el MÍO. Se
  // distingue por la firma que este mismo script deja. Si está la firma, es nuestro y se pisa; si
  // hay algo que no reconozco, me niego. Un guard que también bloquea la reejecución no protege
  // nada — sólo obliga a desactivarlo, que es peor.
  const zona = await google.readSheetValues(ID, `${PESTAÑA}!${letra(C_FLAG)}1:${letra(C_CTRL + 2)}${F1}`)
  const firma = String(zona?.[0]?.[C_CTRL - C_FLAG] ?? '').trim()
  const esMio = firma === FIRMA
  if (!esMio) {
    const ocupadas = new Set()
    zona.forEach((f) => (f || []).forEach((c, j) => { if (String(c ?? '').trim()) ocupadas.add(letra(C_FLAG + j)) }))
    if (ocupadas.size) {
      throw new Error(`me niego a escribir: las columnas ${[...ocupadas].join(', ')} tienen contenido que no reconozco (esperaba la firma "${FIRMA}" en ${letra(C_CTRL)}1). Elegí otra zona antes de pisar datos del dueño.`)
    }
  } else {
    await google.clearValues(ID, `${PESTAÑA}!${letra(C_FLAG)}1:${letra(C_CTRL + 2)}${F1}`)
  }

  await corregirRotuloTotal(google)
  await marcarValoresSegunBanco(google)

  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!${letra(C_FLAG)}4:${letra(C_FLAG)}4`, values: [['⚠ Control automático']] },
    { range: `${PESTAÑA}!${letra(C_FLAG)}${F0}`, values: [[flagPorFila]] },
    { range: `${PESTAÑA}!${letra(C_CTRL)}1:${letra(C_CTRL + 2)}${b.length}`, values: b },
  ])

  const sheetId = hoja.sheetId
  const rg = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })

  // El formato de la columna de importes va celda por celda, con updateCells, NO con repeatCell.
  // Con repeatCell sobre el rango entero, seis celdas quedaban sin formato y otras sí — no
  // contiguas, así que no era un rango mal calculado. No encontré la causa; lo que sí es cierto es
  // que mandando valor y formato juntos en la misma celda funciona siempre. Preferí una escritura
  // que anda a seguir gastando en entender por qué la otra no.
  const MONEDA = { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' }
  const CANTIDAD = { numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT' }
  // Las tres filas que cuentan FILAS y no pesos: los dos detectores de duplicados y el de gemelas.
  const esCantidad = (etiqueta) => /^Filas con|^Proyecciones con/.test(etiqueta)
  const celdas = b.map(([etiqueta, formula]) => ({
    values: [{
      ...(formula ? { userEnteredValue: { formulaValue: formula } } : {}),
      userEnteredFormat: esCantidad(etiqueta) ? CANTIDAD : MONEDA,
    }],
  }))
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: { range: rg(0, b.length, C_CTRL + 1, C_CTRL + 2), rows: celdas, fields: 'userEnteredValue,userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: rg(3, 4, C_FLAG, C_FLAG + 1), cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(4, F1, C_FLAG, C_FLAG + 1), cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: { red: 0.7, green: 0.3, blue: 0.1 } }, numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.numberFormat' } },
    { repeatCell: { range: rg(0, 1, C_CTRL, C_CTRL + 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(10, 11, C_CTRL, C_CTRL + 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(0, b.length, C_CTRL + 2, C_CTRL + 3), cell: { userEnteredFormat: { textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_FLAG, endIndex: C_FLAG + 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_CTRL, endIndex: C_CTRL + 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_CTRL + 1, endIndex: C_CTRL + 2 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
  ])

  const v = await google.readSheetValues(ID, `${PESTAÑA}!${letra(C_CTRL)}1:${letra(C_CTRL + 1)}${b.length}`)
  console.log('\nCONTROL:')
  for (const f of v) if (f?.[0] && f?.[1] !== undefined) console.log(`  ${String(f[0]).slice(0, 42).padEnd(44)}${String(f[1] ?? '').padStart(16)}`)
  const marcas = await google.readSheetValues(ID, `${PESTAÑA}!A${F0}:${letra(C_FLAG)}${F1}`)
  console.log('\nFILAS MARCADAS:')
  marcas.forEach((f, i) => { if (f?.[C_FLAG]) console.log(`  fila ${i + F0} | ${String(f[6] ?? '').slice(0, 26).padEnd(28)} ${String(f[12] ?? '').padStart(14)}  ${f[C_FLAG]}`) })
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
