#!/usr/bin/env node
// "Cheques Emitidos" — LA PESTAÑA CONTESTA UNA PREGUNTA:
//
//        DE LO QUE FIRMÉ, ¿CUÁNTO TODAVÍA NO SALIÓ Y CUÁNDO SALE?
//
// ═══ POR QUÉ SE REHIZO (23/07) ═══
//
// El dueño: "no se entiende qué carajo significan las cosas". La banda anterior mostraba
// "Comprometido no debitado / en echeq / en cheque físico / Cheques pendientes / Próximo a debitar".
// El número estaba bien y no servía para nada: no contestaba la única pregunta que un tesorero le
// hace a esta pestaña —¿esto lo puedo pagar?—. Faltaban las dos cosas que la contestan:
//
//   1. EL PUENTE contra el banco. El saldo bancario NO descontó los cheques firmados: el cheque
//      todavía no se presentó. La cifra con la que se decide es
//         saldo del banco − cheques emitidos no debitados = lo que realmente queda.
//      Es la "adjusted cash balance" del manual de conciliación bancaria; el saldo del banco es el
//      "book balance" y engaña (Sage / AccountingTools, ver Fuentes).
//   2. CUÁNDO sale cada peso. Un total sin fecha no es accionable. Los registros de cheques y las
//      cuentas por pagar se leen por TRAMOS DE ANTIGÜEDAD (aging buckets) — es la práctica estándar
//      de un AP aging report. Y el tramo que más importa es el primero: un cheque VENCIDO Y NO
//      DEBITADO es una alerta, no una línea más (stale-dated check: o el beneficiario no lo
//      presentó, o se perdió, o hay un problema — y la política es averiguarlo, no esperar).
//
// ═══ QUÉ SE ELIMINÓ, Y POR QUÉ (less is more) ═══
//
//   · "en echeq" / "en cheque físico" — el instrumento no cambia ninguna decisión de caja.
//   · "Cheques pendientes" (cantidad) — no es plata; los tramos dicen mucho más con las mismas filas.
//   · "Próximo a debitar" (una fecha) — la reemplaza el tramo "Vencido" + "Esta semana", que además
//     dicen CUÁNTO, no sólo cuándo.
//
// ═══ FORMATO (banca de inversión) ═══
// Negrita SÓLO en las líneas clave, sub-ítems indentados, borde arriba de los totales, cifras
// tabulares alineadas a la derecha, una sola tipografía con jerarquía por tamaño/peso, whitespace
// estructurado, sin reja ni barras de color. Ver lib/estilo-statement.mjs y la gramática común de
// lib/patron-pestana.mjs — las dos pestañas de cheques se leen IGUAL, con el mismo vocabulario.
//
// ═══ FUENTES (consultadas el 23/07/2026) ═══
//   · Sage — "Outstanding checks in bank reconciliation": el saldo del banco no refleja los cheques
//     emitidos que todavía no se presentaron.
//     https://www.sage.com/en-us/blog/outstanding-checks-bank-reconciliation/
//   · AccountingTools — bank balance vs book balance; adjusted cash balance =
//     saldo del extracto + depósitos en tránsito − cheques emitidos no debitados.
//     https://www.accountingtools.com/articles/the-difference-between-bank-balance-and-book-balance
//   · Intuit QuickBooks — stale-dated checks: hay que revisarlos, anularlos o reemitirlos.
//     https://quickbooks.intuit.com/r/accounting/how-to-handle-stale-dated-checks/
//   · AP aging report — tramos por vencimiento y acción por tramo.
//     https://invoicedataextraction.com/blog/accounts-payable-aging-report
//   · Formato de modelos de banca de inversión (negrita en líneas clave, borde sobre subtotales,
//     negativos entre paréntesis, indentación de sub-ítems).
//     https://ibinterviewquestions.com/guides/valuation-investment-banking/formatting-standards-color-conventions-ib-models
//
// ═══ REGLAS QUE ESTE SCRIPT NO PUEDE ROMPER ═══
//   · NO toca el registro (columnas A–L): las carga el dueño a mano. Sólo escribe la banda de arriba.
//   · Ni un número pegado: la banda es TODA fórmula sobre el propio registro. La única cifra que
//     viene de afuera —la plata disponible— se REFERENCIA a CAJA, que es su dueña (regla 9: un
//     concepto vive en un solo lugar), y se busca POR RÓTULO, nunca por celda: CAJA se reescribe
//     entera y sus filas se corren.
//   · Los valores van en la COLUMNA B. Nunca en la F: CAJA suma 'Cheques Emitidos'!F2:F400 y
//     cualquier cifra de la banda puesta ahí se sumaría como si fuera un cheque más.
//   · El ancla es el DATO (FISICO/ECHEQ), no un rótulo que una persona pueda borrar. Si no aparece,
//     el script ABORTA: insertar filas a ciegas deja la pestaña con dos bandas.
//
//   node orquestador/scripts/cheques-emitidos-tablero.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { skinRequests, MUTED, HAIR } from '../lib/estilo-statement.mjs'
import { seccion, total } from '../lib/patron-pestana.mjs'
import { conEdicionesRespetadas, guardarRegistro, autoRespetarReescritura } from '../lib/respetar-ediciones.mjs'
import { firmaGuardia, sellarFirma } from '../lib/firma-tab.mjs'
import { formulaUltimaFecha, formulaFrescuraDe, rotuloAlDia } from '../lib/fecha-de-frescura.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')

/** Alto exacto de la banda. Misma gramática que 'Cheques Recibidos'. */
const BANDA = 19
/** La fila del titular dentro de la banda (1-based): la cifra con la que se decide. */
const TITULAR = 8

const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }

/**
 * NÚCLEO PURO: las filas de la banda, dado dónde arranca el registro.
 * Devuelve la grilla de 13 columnas lista para escribir. Todo fórmula: 0 números pegados.
 */
export function bandaFilas(HDR) {
  const F = `$F$${HDR}:$F` // Monto
  const K = `$K$${HDR}:$K` // DEBITADO SI/No
  const I = `$I$${HDR}:$I` // fecha de pago
  const C = `$C$${HDR}:$C` // fecha de emisión
  // NO DEBITADO = todo lo que NO dice "SI", no sólo lo que dice "No": un DEBITADO en blanco es un
  // cheque que todavía no se debitó (default seguro, mismo criterio que CAJA). El IF(ISNUMBER(F))
  // evita que las filas vacías del rango abierto sumen.
  const noDeb = `(UPPER(${K})<>"SI")`
  const num = `IF(ISNUMBER(${F});${F};0)`
  const outstanding = `SUMPRODUCT(${noDeb}*${num})`
  // Los cortes de los tramos. EOMONTH(...)+1 para que un cheque fechado el último día del mes caiga
  // DENTRO de "hasta fin de mes" y no en "más adelante".
  const finMes = 'MAX(TODAY()+7;EOMONTH(TODAY();0)+1)'
  // Con el "=" adentro del helper: sin él la celda queda como TEXTO y el tramo muestra la fórmula
  // en vez del importe, sin dar error (defecto real detectado en el --dry).
  const tramo = (cond) => `=SUMPRODUCT(${noDeb}*ISNUMBER(${I})*${cond}*${num})`

  const fila = (a = '', b = '', c = '') => [a, b, c, '', '', '', '', '', '', '', '', '', '']
  return [
    fila('Cheques emitidos'),
    // El subtítulo entra en UNA línea que desborda sobre las columnas vacías: envuelto en la
    // columna A necesitaría cinco renglones y una fila alta, que es lo que hace ver "apretado".
    //
    // LA FECHA DE CORTE SALE DEL REGISTRO, NO DEL RELOJ (03/08). Era `al ${new Date()}`: el día que
    // corría el script. El registro lo carga el DUEÑO a mano y cambia sin que corra nadie, así que
    // el rótulo se quedaba atrás — medido en vivo: decía "al 24/7/2026" con el registro ya movido.
    //
    // ESTA PESTAÑA TIENE DOS PUERTAS, NO UNA (03/08). La primera versión miró sólo la emisión
    // (columna C) y eso deja afuera la mitad del pedido del dueño: *"siempre q modifiques valores de
    // caja con el extracto q te envio […] las fechas que aparecen se deben actualizar de manera
    // automatica"*. MARCAR DEBITADO=SI ES UNA MODIFICACIÓN QUE VIENE DEL EXTRACTO —así se marcó el
    // cheque FISICO 223— y con la emisión como única fuente ese hecho no movía nada, aunque sí
    // mueve los dos números grandes de arriba (el comprometido y "con esto podés pagar").
    //
    //   frescura = MAX( última emisión ya ocurrida ; última fecha de pago de un cheque DEBITADO )
    //
    // POR QUÉ LA SEGUNDA PUERTA VA FILTRADA POR DEBITADO=SI y no es un MAX pelado de la columna I.
    // La columna I trae la fecha de pago de TODOS los cheques, debitados o no, y para los que no se
    // debitaron es una PREVISIÓN. Un cheque diferido a hoy que el banco todavía no debitó haría que
    // el rótulo declarara frescura por algo que no ocurrió (Regla de Oro 2). Con el filtro, sólo
    // cuenta el hecho: el banco lo debitó y alguien lo registró.
    //
    // `<=TODAY()` en las dos: la columna I trae diferidos a septiembre y un MAX crudo haría que el
    // corte dijera septiembre.
    fila(rotuloAlDia(
      'Cuánto de lo firmado todavía no salió de la cuenta, y cuándo sale · registro de tesorería',
      formulaFrescuraDe([
        formulaUltimaFecha(C),
        formulaUltimaFecha(I, { cuando: `(UPPER(${K})="SI")` }),
      ]),
      { cola: 'en pesos' },
    )),
    fila(),
    fila(seccion(1, '¿me alcanza? — lo que firmé contra lo que hay en el banco')),
    fila('Concepto', 'Monto', 'Qué significa'),
    // La plata disponible es de CAJA: no se recalcula acá. Se busca POR RÓTULO (CAJA se reescribe
    // entera y sus filas se mueven); si el rótulo cambia, la celda lo GRITA en vez de mentir.
    fila('Plata disponible hoy — todas las cuentas',
      '=IFERROR(INDEX(CAJA!$E$1:$E$200;MATCH("Total disponibilidades";CAJA!$A$1:$A$200;0));"⚠ no está en CAJA")',
      'Bancos, caja y valores a depositar. Sale de la pestaña CAJA, que es su dueña.'),
    fila('   · (−) cheques firmados, no debitados', `=${outstanding}`,
      'Ya lo firmaste y lo entregaste: salió de tus manos, todavía no de la cuenta.'),
    fila(total('Con esto podés pagar'), `=IF(ISNUMBER(B${TITULAR - 2});B${TITULAR - 2}-B${TITULAR - 1};"⚠ falta el saldo de CAJA")`,
      'El saldo que muestra el banco todavía no descontó los cheques firmados. Éste sí.'),
    fila(),
    fila(seccion(2, '¿cuándo sale? — los cheques no debitados, por su fecha de pago')),
    fila('Concepto', 'Monto', 'Qué significa'),
    fila('Vencido — averiguar por qué', tramo(`(${I}<TODAY())`),
      'Pasó la fecha y el banco no lo debitó: o el proveedor no lo presentó, o se perdió. No es plata que sobra.'),
    fila('Esta semana — próximos 7 días', tramo(`(${I}>=TODAY())*(${I}<TODAY()+7)`),
      'Los fondos tienen que estar ahora.'),
    fila('Hasta fin de este mes', tramo(`(${I}>=TODAY()+7)*(${I}<${finMes})`),
      ''),
    fila('Más adelante', tramo(`(${I}>=${finMes})`),
      'Diferidos: todavía hay tiempo para conseguir los fondos.'),
    fila('Sin fecha de pago cargada', `=SUMPRODUCT(${noDeb}*(NOT(ISNUMBER(${I})))*${num})`,
      'No se puede ubicar en ningún tramo: falta completar la fecha en el registro.'),
    fila(total('Comprometido, no debitado'), '=SUM(B12:B16)',
      'Control: tiene que dar exactamente igual que la línea de la sección 1.'),
    fila(),
    fila(seccion(3, 'el registro, cheque por cheque')),
  ]
}

/**
 * NÚCLEO PURO: dónde arranca el registro. Se ancla en el DATO (FISICO/ECHEQ en la columna A), no en
 * un rótulo: el dueño ya borró la columna de rótulos una vez y el generador insertó 12 filas a
 * ciegas, dejando la pestaña con dos bandas superpuestas.
 * @returns {{primera:number, hdr:number}|null} filas 1-based, o null si no encuentra el registro
 */
export function ubicarRegistro(colA = []) {
  const i = colA.findIndex((f) => /^(FISICO|ECHEQ)$/i.test(String(f?.[0] ?? '').trim()))
  if (i < 0) return null
  return { primera: i + 1, hdr: i } // hdr = la fila del encabezado, justo arriba del primer dato
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) { console.error(`No existe la pestaña ${PESTANA}`); process.exit(1) }
  const sheetId = hoja.sheetId

  const colA = await google.readSheetValues(ID, `${PESTANA}!A1:A60`)
  const ubic = ubicarRegistro(colA)
  if (!ubic) {
    console.error(`ABORTA: no encuentro el registro (ninguna fila con FISICO/ECHEQ en la columna A de ${PESTANA}).`)
    console.error('Sin ancla, insertar filas dejaría la pestaña con dos bandas. Revisar la pestaña a mano.')
    process.exit(1)
  }
  const bandaActual = ubic.hdr - 1 // filas de banda hoy (encabezado del registro no incluido)
  const HDR = BANDA + 1

  if (DRY) {
    console.log(`(--dry) banda actual ${bandaActual} filas → ${BANDA}. Encabezado del registro: fila ${ubic.hdr} → ${HDR}.`)
    bandaFilas(HDR).forEach((f, i) => console.log(String(i + 1).padStart(3), JSON.stringify(f.slice(0, 3))))
    return
  }

  // Ajustar la banda al alto exacto: insertar las que faltan o quitar las que sobran.
  if (bandaActual < BANDA) {
    await google.spreadsheetBatchUpdate(ID, [{
      insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: BANDA - bandaActual }, inheritFromBefore: false },
    }])
  } else if (bandaActual > BANDA) {
    await google.spreadsheetBatchUpdate(ID, [{
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: bandaActual - BANDA } },
    }])
  }

  const filas = bandaFilas(HDR)

  // ═══ DESARMAR LOS MERGES DE LA BANDA ANTES DE ESCRIBIR ═══
  // Una celda COMBINADA sólo acepta escritura en su ancla: escribir en cualquier otra celda del
  // merge se ignora EN SILENCIO —sin error, sin valor—. Es la trampa que la skill de Sheets llama
  // "el asesino silencioso" en zonas de datos.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: 13 } },
  }]).catch(() => {})

  // ═══ REGLA 0 — SI EL DUEÑO REESCRIBIÓ O BORRÓ UN RÓTULO, GANA ÉL ═══
  // La banda se escribe en crudo (no por fusión con VACIO), así que la Regla 0 se aplica acá a mano:
  // respeta los rótulos que una persona editó, comparando contra el TEXTO QUE SE VE (no la fórmula).
  // Sin techo de filas: ver la nota de caja-pestana.mjs. Un rótulo que hoy vive más abajo de la
  // grilla nueva no está borrado, está fuera de la ventana que yo leí.
  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA (31/07). Con `.catch(() => [])` un 429 de la API se
  // convertía en "la pestaña está vacía": la Regla 0 daba TODOS mis rótulos por borrados por el dueño y
  // la fusión escribía encima de lo que él tenía. Es el mismo defecto que dejó Proveedores con las filas
  // entrelazadas. Si no se puede leer, no se puede decidir: falla cerrado y la corrida siguiente lo hace
  // bien. Ver lib/google.mjs, donde el 429 ahora espera la ventana del minuto antes de rendirse.
  const previo = await google.readSheetValues(ID, `'${PESTANA}'!A1:M`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA}" (${e.message}). NO escribo: la fusión tomaría la pestaña por vacía y pisaría lo tuyo.`)
  })
  // LA FIRMA primero (respeto más fuerte: cualquier edición tuya). Después, la reescritura total.
  if ((await firmaGuardia(google, ID, PESTANA, `'${PESTANA}'`)).editada) return
  // AUTO-RESPETO (24/07): si reescribiste esta pestaña entera, la tomo como tuya y no la piso.
  if ((await autoRespetarReescritura(ID, PESTANA, filas, previo)).reescrita) return
  const { grid: filasFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA, filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}") en vez de "${String(r.mio).slice(0, 44)}"`)
  await google.batchUpdateValues(ID, [{ range: `${PESTANA}!A1`, values: filasFinal }])
  await sellarFirma(google, ID, PESTANA, `'${PESTANA}'`)
  await guardarRegistro(ID, PESTANA, filasFinal, ediciones, previo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // ── FORMATO ───────────────────────────────────────────────────────────────────────────────────
  // El formato se calcula sobre la grilla que QUEDÓ ESCRITA (`filas`), no sobre otra: si se le pasa
  // una grilla distinta de la escrita, las reglas aterrizan una fila corrida.
  const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, fontSize: size, italic, fontFamily: 'Arial' })
  const money = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' } // negativos entre paréntesis (norma IB)
  const rg = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    // Las dos pestañas congelan lo mismo: título + subtítulo. Congelar hasta el encabezado del
    // registro comería media pantalla con una banda de 19 filas.
    ...skinRequests({ sheetId, filas: filasFinal, cols: 13, congeladas: 2, titular: TITULAR }),
    // La banda DESBORDA, no se corta: un título de sección o un titular partido al medio no es un
    // rótulo, es un error de imprenta. Las columnas de la derecha de la banda están vacías.
    { repeatCell: { range: rg(0, BANDA, 0, 13), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    // La nota bajo el título: gris, chica, con aire para que respire.
    { repeatCell: { range: rg(1, 2, 0, 13), cell: { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } },
    // TODOS los importes de la banda: moneda, a la derecha, tabulares. Una sola regla para las dos
    // secciones — misma columna, mismo significado en toda la pestaña.
    // Desde la fila del PRIMER encabezado: el rótulo "Monto" se alinea con sus cifras. Empezando una
    // fila después, el "Monto" de la sección 1 quedaba a la izquierda y el de la sección 2 a la
    // derecha —dos cuadros que se leen distinto en la misma pestaña— (defecto visto en el render).
    { repeatCell: { range: rg(4, BANDA, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // La columna "Qué significa": explicación, nunca plata. Desborda sobre las columnas de la
    // derecha, que en la banda están vacías — así se lee entera sin ensanchar una columna que abajo
    // el registro necesita angosta. Se aplica SÓLO a las filas de datos: si tocara los encabezados,
    // "Qué significa" saldría en redonda al lado de "Concepto" y "Monto" en versalita.
    ...[[5, 8], [11, 17]].map(([r0, r1]) => ({ repeatCell: { range: rg(r0, r1, 2, 3), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat,wrapStrategy)' } })),
    // EL TITULAR: la cifra en 16 pt y acento (nadie más usa ese color), y su RÓTULO en 12 pt — no en
    // los 13 que pone la piel: a 13 el rótulo del titular no entra en su columna y se corta a la
    // mitad. Un rótulo cortado no es un titular, es un error de imprenta. Mismo criterio en las dos
    // pestañas, para que se lean igual.
    { repeatCell: { range: rg(TITULAR - 1, TITULAR, 0, 1), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 12 }) } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(TITULAR - 1, TITULAR, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT', textFormat: txt(ACENTO, { bold: true, size: 16 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // ANCHOS: la banda y el registro comparten las mismas tres primeras columnas y necesitan cosas
    // distintas. Gana el compromiso: A y B alcanzan para el concepto y el importe de la banda (que
    // es lo que se lee primero) sin dejar el registro desparramado, y la explicación desborda.
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 270 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
    // Encabezado del registro: versalita apagada con hairline, igual que en Recibidos.
    { repeatCell: { range: rg(HDR - 1, HDR, 0, 13), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    { updateBorders: { range: rg(HDR - 1, HDR, 0, 13), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── VERIFICACIÓN: releer y probar que el control cierra ────────────────────────────────────────
  const chk = await google.readSheetValues(ID, `${PESTANA}!A1:C${BANDA}`)
  const n = (s) => Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  const errores = (chk || []).flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  const outstanding = n(chk?.[6]?.[1])
  const totalTramos = n(chk?.[16]?.[1])
  console.log(`✔ ${PESTANA}`)
  console.log(`  disponible ${chk?.[5]?.[1]} · comprometido ${chk?.[6]?.[1]} · ⇒ con esto podés pagar ${chk?.[TITULAR - 1]?.[1]}`)
  console.log(`  tramos: vencido ${chk?.[11]?.[1]} · esta semana ${chk?.[12]?.[1]} · fin de mes ${chk?.[13]?.[1]} · más adelante ${chk?.[14]?.[1]} · sin fecha ${chk?.[15]?.[1]}`)
  console.log(`  control tramos vs comprometido: ${totalTramos === outstanding ? '✓ cierra' : `✖ NO cierra (${totalTramos} vs ${outstanding})`}`)
  console.log(`  ${errores} celda(s) en error`)
  if (errores || totalTramos !== outstanding) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
