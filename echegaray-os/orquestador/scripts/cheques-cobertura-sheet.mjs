#!/usr/bin/env node
// Escribe en el Cash Flow Mensual el bloque que contesta: ¿los cheques y la tarjeta están o no?
//
// "¿Qué pasó con los cheques a cubrir en los cash flows, en qué concepto están?" y "¿todo lo que se
// contempla en Compras está en algún concepto del cash flow?".
//
// LA RESPUESTA CORTA: lo que está en Compras sí está — el control de partición da $0 y eso ya está
// escrito al pie de las dos pestañas. Pero la pregunta buena era la otra: hay pagos que NO están en
// Compras, y por lo tanto no están en ninguna línea del cash flow. Son cheques y tarjeta sin factura
// registrada. Por eso este bloque no suma nada al cash flow: MIDE lo que falta cargar.
//
// POR QUÉ NO SE SUMA UNA LÍNEA "CHEQUES". Porque 39 de los 89 cheques ($38.388.505) pagan facturas
// que YA están en Compras y ya viajaron al cash flow por su rubro. Sumarlos otra vez sería duplicar
// $38,4M — exactamente lo que la regla de oro prohíbe. El cheque es el instrumento, no el concepto.
//
//   node orquestador/scripts/cheques-cobertura-sheet.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { repartirCobertura, aCubrirPorMes, normComprobante, esLlaveUtil, hallarPestana, MARCAS, marcaDe, inferirRespaldo } from '../lib/cheques-cobertura.mjs'
import { normNombre } from '../lib/razon-social.mjs'
import { INSTRUMENTOS, formulasInstrumento } from '../lib/cash-flow-lineas.mjs'
import { ARCA as N_ARCA } from '../lib/rangos-nombrados.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cash Flow Mensual'
const DRY = process.argv.includes('--dry')
const ANCHO = 6
const FIRMA = '¿QUÉ NO ESTÁ EN ESTE CUADRO? — cobertura contra todas las fuentes'

/** dd/mm/yyyy → Date. La pestaña es es-AR: el 2/1/2026 es el 2 de enero, no el 1 de febrero. */
const fechaAR = (s) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(s ?? '').trim())
  if (!m) return null
  const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(a, Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(+d) ? null : d
}

const num = (s) => parseFloat(String(s ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const ars = (x) => Math.round(x)
/** LAS CIFRAS DE ARCA NO SE CALCULAN ACÁ. Viven en "Proveedores y Materiales" —una pestaña réplica,
 *  cuyo origen declarado es el libro de IVA— y este bloque las referencia por RANGO CON NOMBRE.
 *
 *  POR QUÉ CAMBIÓ (21/07). Antes se calculaban acá y se escribían como números: el auditor marcó
 *  8 números pegados en el Cash Flow Mensual, que es una pestaña "calculada" donde TODO tiene que
 *  ser fórmula. Un número pegado no se puede auditar y el día que ARCA trae un comprobante nuevo,
 *  miente sin avisar. Además el cruce contra Compras estaba escrito dos veces, una en cada script,
 *  y las copias ya habían divergido. Ahora hay una sola definición (lib/cobertura-arca.mjs), un
 *  solo lugar donde el número existe, y acá una referencia.
 *
 *  El orden de los pasos lo garantiza: proveedores-materiales corre ANTES que este script. */
const ref = (nombre) => `=${nombre}`

async function leer(google) {
  const hojas = await google.getSheetMeta(ID)
  const CH = hallarPestana(hojas, 'Cheques Emitidos').title
  const compras = await google.readSheetValues(ID, 'Compras!A4:AD')
  // La llave: el número de comprobante de la factura. Es lo único que comparten las tres planillas.
  const enCompras = new Set(
    compras.filter((f) => num(f?.[14]) > 0).map((f) => normComprobante(f?.[7])).filter(esLlaveUtil),
  )
  // SE GUARDA LA FILA DE CADA UNO. La marca que el OS escribe al lado tiene que caer en SU fila, y
  // filtrar antes de saber la fila corría todas las marcas hacia arriba en cuanto aparecía un
  // importe en cero. Una marca en la fila equivocada es peor que ninguna: acusa al cheque de al lado.
  const crudoCh = await google.readSheetValues(ID, `${CH}!A2:L400`)
  const crudoTj = await google.readSheetValues(ID, `${INSTRUMENTOS.tarjeta.pestaña}!A3:K400`)
  // fecha = la fecha REAL de pago (columna I). fecha_pago es su rótulo "julio 26", que es formato.
  const cheques = crudoCh.map((f, i) => ({ fila: i + 2, tipo: f[0], proveedor: f[4], monto: num(f[5]), comprobante: f[7], fecha: fechaAR(f[8]), fecha_pago: f[9], debitado: f[10], marca: f[12] })).filter((c) => c.monto > 0)
  const tarjeta = crudoTj.map((f, i) => ({ fila: i + 3, proveedor: f[2], monto: num(f[4]), comprobante: f[6], fecha_pago: f[8], debitado: f[9], marca: f[10] })).filter((c) => c.monto > 0)
  // ── EL LADO DE COMPRAS QUE NECESITA EL CRUCE DE RESPALDO, EN CRUDO ────────────────────────────────
  // SE LEE APARTE Y CON UNFORMATTED_VALUE A PROPÓSITO. La lectura de arriba viene formateada y `num()`
  // desarma "$1.234,50" a mano; sobre un número crudo esa misma función borra el punto decimal y
  // devuelve 12345. Y la fecha formateada es "05/08/26", que no se puede restar contra otra fecha.
  // Dos lecturas del mismo rango es barato; una lectura mal parseada en el cruce que decide si un
  // cheque entra o no al calendario, no.
  const crudoCompras = await google.readSheetValues(ID, 'Compras!C4:O', { render: 'UNFORMATTED_VALUE' })
  const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const filasCompras = crudoCompras.map((f, i) => ({
    fila: i + 4, prov: normNombre(f?.[2]), fecha: numero(f?.[0]) || null, total: numero(f?.[12]),
  })).filter((f) => f.prov && f.total > 0)
  return { enCompras, filasCompras, cheques, tarjeta, pestanaCheques: CH, filasCh: crudoCh.length + 1, filasTj: crudoTj.length + 2 }
}

/**
 * El cruce de respaldo de los DOS instrumentos, en una sola pasada por cada uno.
 *
 * Se hace acá y no adentro de `grilla` porque su resultado lo necesitan los dos consumidores: el
 * bloque del cash flow (para contar) y el marcado fila por fila (para escribir). Calcularlo dos veces
 * podría dar dos repartos distintos —el criterio consume cada fila de Compras una sola vez— y la
 * pestaña terminaría diciendo una cosa y el bloque otra.
 */
export function respaldos({ cheques, tarjeta, filasCompras }) {
  return {
    cheques: inferirRespaldo(cheques, filasCompras),
    tarjeta: inferirRespaldo(tarjeta, filasCompras),
  }
}

export function grilla({ enCompras, cheques, tarjeta }, resp) {
  const ch = repartirCobertura(cheques, enCompras, { inferidos: resp.cheques.inferidos })
  const tj = repartirCobertura(tarjeta, enCompras, { inferidos: resp.tarjeta.inferidos })
  const cubrir = aCubrirPorMes(cheques)
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }

  push([FIRMA])
  push(['"Los cash flows deben reflejar todo, todo el tiempo, y cada gasto o ingreso debe estar en algún concepto." El control de partición del pie ya prueba que TODO lo que está en Compras está en una línea del cuadro. Este bloque contesta la otra mitad, que es la que duele: qué existe FUERA de Compras y por lo tanto el cuadro no puede ver.'])
  push()
  const fHdr1 = push(['FUENTE', 'Cantidad', 'Monto', '', '', 'Qué significa'])
  push(['AFIP — libro de IVA compras (neto de notas de crédito)', ref(N_ARCA.comprobantes), ref(N_ARCA.total), '', '', 'Lo que le facturaron a la empresa con CAE. Es la única fuente fiscal: Compras es lo que alguien cargó. El número vive en Proveedores y Materiales; acá se referencia.'])
  push(['  · de los cuales, notas de crédito', ref(N_ARCA.notasN), ref(N_ARCA.notasMonto), '', '',
    'RESTAN: es plata que el proveedor devolvió, no una compra. Cuáles anulan una factura y cuáles son una refacturación está en Proveedores y Materiales, bloque 3 bis.'])
  push(['  · con su comprobante cargado en Compras', ref(N_ARCA.enComprasN), ref(N_ARCA.enComprasMonto), '', '', 'Ya viajó al cash flow por el rubro de esa factura.'])
  push(['  · cargados SIN su N° de comprobante', ref(N_ARCA.sinNumeroN), ref(N_ARCA.sinNumeroMonto), '', '',
    'Están en Compras: se los reconoce por proveedor + importe. Poner el N° de comprobante es lo que permite imputar un pago a su factura y reclamar un saldo.'])
  push(['  · ⚠ SIN cargar en Compras', ref(N_ARCA.faltanN), ref(N_ARCA.faltanMonto), '', '',
    '⚠ Facturado a la empresa con CAE y ausente de TODO el archivo. El detalle, proveedor por proveedor, está en Proveedores y Materiales.'])
  push([])
  push(['AFIP — libro de IVA ventas', ref(N_ARCA.ventasN), ref(N_ARCA.ventasMonto), '', '', 'Lo que la empresa facturó. Su detalle con número de comprobante está en Proveedores y Materiales.'])
  push([])
  push(['Compras sin fecha de caja', '', `=SUMIFS(Compras!$O$4:$O;Compras!$AC$4:$AC;"<>";Compras!$AD$4:$AD;"")`, '', '',
    '⚠ Están clasificadas y suman en el total del año, pero sin fecha no caen en ningún mes ni semana: el cuadro no las puede ubicar en el tiempo.'])
  push(['Compras con rubro pero sin importe numérico', '', `=SUMPRODUCT((Compras!$AC$4:$AC<>"")*(NOT(ISNUMBER(Compras!$O$4:$O))))`, '', '',
    '⚠ Cantidad de filas, no pesos: su Total no es un número (moneda extranjera o texto), así que no suman en ningún lado.'])
  push([])
  const fHdr2 = push(['', 'Cantidad', 'Monto', '', '', 'Qué significa'])
  // TODO ESTE BLOQUE ES FÓRMULA. Antes eran veinte números calculados acá y pegados: el día que se
  // cargaba una factura que faltaba, el bloque seguía acusando el faltante hasta la próxima corrida
  // del agente. Ahora cuenta las marcas que el OS escribe al lado de cada cheque, así que se mueve
  // solo y cualquiera puede verificarlo filtrando la pestaña.
  const F = { cheques: formulasInstrumento(INSTRUMENTOS.cheques, MARCAS), tarjeta: formulasInstrumento(INSTRUMENTOS.tarjeta, MARCAS) }
  const NOTA_INFERIDO = 'INFERENCIA, no hecho: no tienen N°, pero hay una factura del mismo proveedor por exactamente el mismo importe y con fecha cercana. Se los cuenta aparte de los verificados y NO bajan el piso de caja: el piso se calcula con las dos puntas, arriba en CAJA.'
  const NOTA_SIN_MARCA = '⚠ Filas que el OS todavía no miró: se cargaron después de la última corrida de "cheques-cobertura". Mientras la marca esté vacía, el término de cheques del calendario NO las ve. Tiene que dar cero.'
  // LAS FILAS DE LOS TOTALES SE GUARDAN AL EMPUJARLAS, NO SE CUENTAN HACIA ATRÁS (05/08).
  // Acá había `fFalta - 8` y `fFalta - 3`: desplazamientos escritos a mano desde la fila del total.
  // Agregar dos renglones a cada instrumento —los inferidos y los todavía sin marcar— los habría
  // dejado apuntando a "ya contemplados", y el total "FALTA CARGAR" habría publicado la plata que SÍ
  // está cubierta sin dar un solo error. Es el mismo defecto que ya rompió Estructura!$15.
  const fil = {}
  push(['CHEQUES — total emitido', F.cheques.total.cantidad, F.cheques.total.monto, '', '', ''])
  push(['  · ya contemplados (su factura está en Compras)', F.cheques.contemplados.cantidad, F.cheques.contemplados.monto, '', '', 'Ya están en el cash flow, en el rubro de esa factura. Sumarlos de nuevo sería duplicar.'])
  push(['  · ≈ atribuidos por proveedor + importe (inferencia)', F.cheques.inferidos.cantidad, F.cheques.inferidos.monto, '', '', NOTA_INFERIDO])
  fil.faltaCh = push(['  · FALTA la factura en Compras (confirmado)', F.cheques.falta.cantidad, F.cheques.falta.monto, '', '', '⚠ Tienen número de comprobante y ese número NO está en Compras. Plata que sale y que ninguna línea del cash flow ve.'])
  fil.sinNumCh = push(['  · sin N° de comprobante — no se puede saber', F.cheques.sinNumero.cantidad, F.cheques.sinNumero.monto, '', '', 'Su factura puede estar en Compras perfectamente. Cargando el N° de comprobante en la pestaña Cheques se resuelve solo.'])
  fil.sinMarcaCh = push(['  · ⚠ todavía SIN MARCAR por el OS (no debitados)', F.cheques.sinMarca().cantidad, F.cheques.sinMarca().monto, '', '', NOTA_SIN_MARCA])
  push()
  push(['TARJETA DE CRÉDITO — total', F.tarjeta.total.cantidad, F.tarjeta.total.monto, '', '', ''])
  push(['  · ya contemplados', F.tarjeta.contemplados.cantidad, F.tarjeta.contemplados.monto, '', '', ''])
  push(['  · ≈ atribuidos por proveedor + importe (inferencia)', F.tarjeta.inferidos.cantidad, F.tarjeta.inferidos.monto, '', '', NOTA_INFERIDO])
  fil.faltaTj = push(['  · FALTA la factura (confirmado)', F.tarjeta.falta.cantidad, F.tarjeta.falta.monto, '', '', ''])
  fil.sinNumTj = push(['  · sin N° de comprobante', F.tarjeta.sinNumero.cantidad, F.tarjeta.sinNumero.monto, '', '', ''])
  fil.sinMarcaTj = push(['  · ⚠ todavía SIN MARCAR por el OS (no debitados)', F.tarjeta.sinMarca().cantidad, F.tarjeta.sinMarca().monto, '', '', NOTA_SIN_MARCA])
  push()
  const fFalta = filas.length + 1
  // Los #{n} son números de fila RELATIVOS al bloque: el bloque no sabe todavía en qué fila del
  // Cash Flow va a caer. Se reemplazan por la fila real recién cuando se sabe. Escribir la fila
  // directo daba una referencia que apuntaba al vacío en cuanto el cuadro crecía una línea.
  const suma = (c, ...fs) => `=${fs.map((f) => `${c}#{${f}}`).join('+')}`
  push(['⇒ FALTA CARGAR, CONFIRMADO', suma('B', fil.faltaCh, fil.faltaTj), suma('C', fil.faltaCh, fil.faltaTj), '', '', 'El cash flow subestima los egresos AL MENOS en esto. Es la misma plata que muestra la línea "Cheques y tarjeta sin factura cargada" del cuadro de arriba.'])
  push(['⇒ Sin poder verificar (falta el N° de comprobante)', suma('B', fil.sinNumCh, fil.sinNumTj), suma('C', fil.sinNumCh, fil.sinNumTj), '', '', 'No es un faltante: es una ignorancia. Se resuelve cargando el número en Cheques y Tarjeta. Los que se pudieron atribuir por proveedor + importe ya NO están acá: están en el renglón "≈ atribuidos".'])
  push(['⇒ Sin mirar todavía por el OS (tiene que dar $0)', suma('B', fil.sinMarcaCh, fil.sinMarcaTj), suma('C', fil.sinMarcaCh, fil.sinMarcaTj), '', '',
    'Si no da cero, "cheques-cobertura" no corrió desde que se cargaron esas filas: el calendario de CAJA no las está viendo y el piso proyectado es optimista en esa magnitud. Se arregla corriendo el agente, no cargando datos.'])
  push()
  push(['CHEQUES A CUBRIR — los que todavía no se debitaron'])
  push(['Otra pregunta, y es de tesorería: no importa si la factura está registrada, importa cuánta plata tiene que haber en la cuenta y cuándo. Un cheque emitido es un compromiso más firme que una factura con fecha prevista.'])
  const fHdr3 = push(['Mes de pago', 'Cantidad', 'Monto', '', '', ''])
  const c0 = filas.length + 1
  // El mes es el que escribe la propia pestaña en su columna de mes: no se recalcula acá.
  for (const m of cubrir.por_mes) {
    if (!m.anio) { push([`${m.mes}  ⚠ sin fecha de pago cargada`, m.cantidad, '']); continue }
    const f = F.cheques.aCubrir(m.anio, m.num)
    // EL MES ES UNA FECHA Y SE QUEDA COMO FECHA. Se ve "julio 26" gracias al formato de la columna,
    // que se aplica más abajo — sin él, la celda muestra el serial crudo (46229) y parece un número
    // pegado. Fue exactamente el hallazgo del auditor: la fila de julio había perdido el formato y
    // se leía como un número de cinco cifras al lado de "agosto 26".
    //
    // Se descartó forzarlo a texto con apóstrofo: dejaría esta fila como texto y las otras como
    // fecha, y el cuadro ya no se podría ordenar por mes.
    push([m.mes, f.cantidad, f.monto])
  }
  const c1 = filas.length
  push(['TOTAL A CUBRIR', `=SUM(B${c0}:B${c1})`, `=SUM(C${c0}:C${c1})`, '', '', 'Compromiso en firme ya emitido.'])
  return { filas, fFalta, c0, c1, ch, tj, cubrir, headersCM: [fHdr1, fHdr2, fHdr3] }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const datos = await leer(google)
  const resp = respaldos(datos)
  const g = grilla(datos, resp)
  const $ = (n) => `$${ars(n).toLocaleString('es-AR')}`
  console.log(`CHEQUES  ${datos.cheques.length} · contemplados ${g.ch.contemplados.length} (${$(g.ch.monto_contemplado)}) · ≈inferidos ${g.ch.inferidos.length} (${$(g.ch.monto_inferido)}) · falta factura ${g.ch.falta_factura.length} (${$(g.ch.monto_falta_factura)}) · sin N° ${g.ch.sin_numero_comprobante.length} (${$(g.ch.monto_sin_numero)})`)
  console.log(`TARJETA  ${datos.tarjeta.length} · contemplados ${g.tj.contemplados.length} (${$(g.tj.monto_contemplado)}) · ≈inferidos ${g.tj.inferidos.length} · falta factura ${g.tj.falta_factura.length} · sin N° ${g.tj.sin_numero_comprobante.length}`)
  // EL QUE NO SE PUDO CRUZAR, CON NOMBRE Y MONTO. Un total no se puede accionar: para cerrar el hueco
  // hay que ir a la fila y cargarle el número. Los ambiguos van aparte porque su problema es otro —
  // hay factura candidata pero no alcanza una por cheque, así que atribuirla sería elegir a ojo.
  for (const [k, r] of Object.entries(resp)) {
    const noDeb = (a) => a.filter((i) => String(i.debitado ?? '').trim().toUpperCase() !== 'SI')
    for (const [rotulo, lista] of [['sin respaldo', noDeb(r.sinRespaldo)], ['ambiguos', noDeb(r.ambiguos)]]) {
      if (!lista.length) continue
      console.log(`  ${k} · ${rotulo} y NO debitados: ${lista.length} · ${$(lista.reduce((s, i) => s + i.monto, 0))}`)
      for (const i of [...lista].sort((a, b) => b.monto - a.monto)) console.log(`      fila ${String(i.fila).padStart(4)}  ${String(i.proveedor ?? '').slice(0, 26).padEnd(27)} ${$(i.monto).padStart(14)}`)
    }
  }
  console.log(`A CUBRIR ${ars(g.cubrir.total).toLocaleString('es-AR')} en ${g.cubrir.por_mes.length} meses`)
  if (DRY) return

  // Idempotente: si el bloque ya está, se rehace en su lugar; si no, va después de lo último.
  const actual = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}200`)
  // ═══ SE BUSCA LA FIRMA QUE REALMENTE SE ESCRIBE ═══
  // Acá se buscaba 'CHEQUES Y TARJETA' pero el bloque se titula con FIRMA. Nunca se encontraba a sí
  // mismo, así que en CADA corrida AGREGABA UNA COPIA NUEVA al final. Con el clearValues puesto el
  // defecto quedaba tapado; al sacarlo (regla: nunca borrar lo que escribe una persona) aparecieron
  // dos cuadros 'TOTAL A CUBRIR' idénticos en Cash Flow Mensual, uno con las fechas sin formatear.
  const copias = []
  actual.forEach((f, i) => { if (String(f?.[0] ?? '').startsWith(FIRMA)) copias.push(i) })
  const yaEsta = copias.length ? copias[0] : -1
  let F
  // No se limpia el bloque viejo: se reescribe encima fusionando, para no borrar nada de una persona.
  if (yaEsta >= 0) { F = yaEsta + 1 } else {
    let fin = 0
    actual.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) fin = i + 1 })
    F = fin + 3
  }
  // Las filas con fórmula traen referencias relativas al bloque: se corrigen al saber dónde cae.
  const filas = g.filas.map((f) => f.map((c) => {
    if (typeof c !== 'string') return c
    const conSum = c.startsWith('=SUM(')
      ? c.replace(/([BC])(\d+):([BC])(\d+)/, (_, a, x, b, y) => `${a}${Number(x) + F - 1}:${b}${Number(y) + F - 1}`)
      : c
    return conSum.replace(/#\{(\d+)\}/g, (_, n) => String(Number(n) + F - 1))
  }))
  const cp = await escribirPreservando(google, ID, PESTAÑA, filas, { fila0: F, anchoHoja: ANCHO })
  if (cp.conservadas.length) console.log(`  ✋ ${cp.conservadas.length} celda(s) de una persona — CONSERVADAS`)

  // ═══ LIMPIAR LAS COLAS DE VERSIONES ANTERIORES ═══
  // Este bloque es lo ÚLTIMO de la pestaña por diseño (se agrega después del cuadro). Todo lo que
  // quede DEBAJO es una cola de una versión anterior de este mismo bloque: el defecto de la firma lo
  // hacía duplicarse, y como el alto cambió entre versiones no alcanza con borrar "filas.length"
  // filas. Se limpia desde el final del bloque nuevo hasta la última fila con contenido.
  const finBloque = F + filas.length - 1
  let ultima = 0
  actual.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  if (ultima > finBloque) {
    await google.batchUpdateValues(ID, [{
      range: `${PESTAÑA}!A${finBloque + 1}:${letra(ANCHO - 1)}${ultima}`,
      values: Array.from({ length: ultima - finBloque }, () => new Array(ANCHO).fill('')),
    }])
    console.log(`  🧹 ${ultima - finBloque} fila(s) de versiones anteriores del bloque, borradas (${finBloque + 1}–${ultima})`)
  }

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  const sheetId = hoja.sheetId
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } } }, fields: 'userEnteredFormat' } },
    // Los encabezados "Cantidad/Monto" de los 3 sub-cuadros son TEXTO: caen dentro del rango que arriba
    // formatea B y C como número, así que sin esto se leen como "texto en celda numérica" (el hallazgo
    // del auditor de pantalla). Va DESPUÉS del formato numérico para pisarlo sólo en esas filas.
    ...(g.headersCM || []).map((fh) => ({ repeatCell: { range: rg(F + fh - 2, F + fh - 1, 1, 3), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })),
    // LA COLUMNA DE MESES, CON SU FORMATO. Sin esto la celda muestra el serial de la fecha y el
    // auditor de reglas la cuenta —con razón— como un número pegado donde todo tiene que ser fórmula.
    { repeatCell: { range: { ...rg(F + g.c0 - 2, F + g.c1 - 1), startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mmmm yy' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: rg(F - 1, F), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(F, F + 1), cell: { userEnteredFormat: { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: rg(F + g.fFalta - 2, F + g.fFalta - 1), cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } }, backgroundColor: { red: 1, green: 0.93, blue: 0.93 } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } },
    // NO SE TOCAN LOS ANCHOS DE COLUMNA. Este bloque vive al pie del Cash Flow Mensual, que es una
    // pestaña COMPARTIDA: arriba, la columna F es el mes de mayo. Ensancharla a 460px para que
    // entrara la explicación de este bloque descuadraba el cuadro entero — el dueño lo vio como
    // "quedan descuadradas". El texto desborda a la derecha sobre celdas vacías, que es gratis.
    // Regla general: un script que escribe en una pestaña que no es suya no cambia su geometría.
  ])

  await marcarInstrumentos(google, datos, resp)

  // ═══ EL QUE ESCRIBE ÚLTIMO, SELLA. SI NO, CANDA UNA PESTAÑA QUE NADIE EDITÓ (01/08) ═══
  //
  // "Cash Flow Mensual" tiene DOS escritores: cash-flow-rehacer, que hace el cuadro y sella la firma
  // de toda la pestaña, y este script, que le agrega este bloque al pie y NO sellaba. El resultado,
  // medido: el 31/07 a las 20:55 el cuadro selló, este bloque escribió a las 20:56, y a las 20:57 el
  // control de firma vio una pestaña distinta de la última escritura registrada y la AUTO-CANDÓ con
  // el motivo "la firma difiere de mi última escritura: la editaste".
  //
  // Jorge no la editó. Comparadas celda a celda contra el snapshot del OS, las 45 diferencias eran
  // todas nuestras: los rangos de este bloque (`$M$399`→`$M$400`, `$L$385`→`$L$400`), su calendario
  // "TOTAL A CUBRIR" y una fila de proyección de Estructura que se movió sola. Cero celdas escritas
  // por una persona.
  //
  // El costo no fue cosmético: la pestaña quedó congelada tres días y la corrección de la nómina de
  // administración no llegaba a ella —el semanal la mostraba y el mensual no— hasta que se destrabó
  // a mano. Es el mismo patrón que los "borrados falsos de la Regla 0": un control que acusa al dueño
  // de algo que hizo el OS gasta la confianza que hace que el candado sirva para algo.
  //
  // Se sella acá, DESPUÉS de escribir y formatear. La firma que queda registrada es la de la pestaña
  // completa tal como quedó, con el cuadro de arriba y este bloque de abajo: la próxima corrida la
  // encuentra igual y no canda nada.
  try {
    const { sellarFirma } = await import('../lib/firma-tab.mjs')
    const { sellarFormato } = await import('../lib/firma-formato.mjs')
    await sellarFirma(google, ID, PESTAÑA)
    await sellarFormato(google, ID, PESTAÑA)
    console.log(`  🔏 firma de "${PESTAÑA}" resellada: este bloque es del OS, no una edición tuya`)
  } catch (e) {
    // Sin sello, la corrida siguiente candaría la pestaña acusando al dueño. Se avisa fuerte en vez
    // de seguir en silencio: es exactamente el defecto que este bloque vino a cerrar.
    console.warn(`  ⚠ no pude resellar la firma de "${PESTAÑA}" (${e.message}) — si la próxima corrida la canda, NO la editaste vos: fue este script.`)
  }

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F}:C${F + filas.length - 1}`)
  console.log(`\nEscrito en la fila ${F}:`)
  for (const f of v) if (f?.[0] && (f?.[2] || f?.[1])) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(6)}${String(f[2] ?? '').padStart(16)}`)
}

/**
 * Marca cada cheque y cada consumo de tarjeta en su propia pestaña: ¿su factura está en Compras?
 *
 * El resumen del Cash Flow dice cuánto falta; acá se ve CUÁL. Sin esto, "$33,5M sin factura" es un
 * número que nadie puede accionar — hay que poder abrir la pestaña, filtrar por la marca y cargar
 * esas facturas.
 *
 * DESDE EL 21/07 ESTA COLUMNA NO ES SÓLO INFORMATIVA: la línea "Pagos con cheque y tarjeta sin
 * factura registrada" de los dos cash flow la SUMA. Antes ese total lo calculaba este código y se
 * pegaba como número en el cuadro — el día que se cargaran las facturas, el cuadro iba a seguir
 * mostrando el mismo importe hasta la próxima corrida. Ahora el cruce se sigue haciendo en código
 * (normalizar "0001-000036" contra "1-36" en una celda sería ilegible) pero el resultado queda
 * escrito fila por fila y el total lo hace el Sheet. Por eso ahora también se marca la TARJETA:
 * antes sólo se marcaban los cheques y la mitad del número no tenía dónde apoyarse.
 */
async function marcarInstrumentos(google, datos, resp) {
  const hojas = await google.getSheetMeta(ID)
  const objetivo = [
    { ...INSTRUMENTOS.cheques, pestaña: datos.pestanaCheques, items: datos.cheques, hasta: datos.filasCh, inferidos: resp.cheques.inferidos },
    { ...INSTRUMENTOS.tarjeta, items: datos.tarjeta, hasta: datos.filasTj, inferidos: resp.tarjeta.inferidos },
  ]
  for (const o of objetivo) {
    const hoja = hojas.find((h) => h.title === o.pestaña)
    if (!hoja) { console.log(`⚠ no encontré la pestaña ${o.pestaña}: no marco nada`); continue }
    const COL = o.colMarca // índice 0-based de la columna de marcas
    // Escribir en una columna sin mirar TODA su altura ya me costó pisar el desglose de retenciones
    // de Cobranzas. Se verifica que lo que hay ahí sea mío antes de tocarla.
    if (hoja.cols > COL) {
      const letraCol = letra(COL)
      const zona = await google.readSheetValues(ID, `${o.pestaña}!${letraCol}1:${letraCol}${hoja.rows}`)
      // QUÉ ES "MÍO" SALE DE LAS MARCAS, NO DE UNA LISTA DE GLIFOS A MANO (05/08). Decía
      // `✓ | ⚠ | Estado en el OS`, y al agregar la marca de inferencia —que abre con ≈— la guarda
      // habría visto contenido ajeno en su propia columna y abortado el marcado entero. Una guarda
      // que no conoce lo que el propio script escribe se convierte en un freno permanente.
      const mio = (t) => Object.values(MARCAS).includes(t) || t.startsWith('Estado en el OS')
      const ocupada = zona.some((f) => { const t = String(f?.[0] ?? '').trim(); return t && !mio(t) })
      if (ocupada) throw new Error(`me niego a escribir: la columna ${letraCol} de ${o.pestaña} tiene contenido que no reconozco.`)
    } else {
      await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: COL + 1 - hoja.cols } }])
    }

    // Una marca por FILA REAL de la pestaña, no una por item: las filas sin importe quedan vacías y
    // las demás no se corren.
    const porFila = new Map(o.items.map((i) => [i.fila, marcaDe(i.comprobante, datos.enCompras, o.inferidos.has(i.fila))]))
    const marcas = []
    for (let f = o.filaCab + 1; f <= o.hasta; f++) marcas.push([porFila.get(f) ?? ''])
    // ACÁ LA FECHA DE LA CORRIDA ES LA CORRECTA, Y ES LA EXCEPCIÓN A LA REGLA (03/08).
    // Los subtítulos del Flujo de Fondos pasaron a calcular su corte con una fórmula sobre el dato
    // (ver lib/fecha-de-frescura.mjs), porque rotulan rangos VIVOS que se mueven solos. Este rótulo
    // no: encabeza una columna de marcas ✓/⚠ que el OS congeló EN ESA CORRIDA y que no se recalculan
    // nunca. Una fórmula acá diría "al 03/08" sobre marcas del 24/07 — frescura FALSA, que es peor
    // que el texto honesto. El estampado es el dato correcto: cuándo miró el OS.
    const hoy = new Date().toLocaleDateString('es-AR')
    const letraCol = letra(COL)
    await google.batchUpdateValues(ID, [
      { range: `${o.pestaña}!${letraCol}${o.filaCab}`, values: [[`Estado en el OS · al ${hoy}`]] },
      { range: `${o.pestaña}!${letraCol}${o.filaCab + 1}:${letraCol}${o.filaCab + marcas.length}`, values: marcas },
    ])
    await google.spreadsheetBatchUpdate(ID, [
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: o.filaCab - 1, endRowIndex: o.filaCab, startColumnIndex: COL, endColumnIndex: COL + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: o.filaCab, endRowIndex: o.filaCab + marcas.length, startColumnIndex: COL, endColumnIndex: COL + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 } } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat' } },
      { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: COL, endIndex: COL + 1 }, properties: { pixelSize: 380 }, fields: 'pixelSize' } },
      { setBasicFilter: { filter: { range: { sheetId: hoja.sheetId, startRowIndex: o.filaCab - 1, endRowIndex: o.filaCab + marcas.length, startColumnIndex: 0, endColumnIndex: COL + 1 } } } },
    ])
    const faltan = marcas.filter((m) => m[0] === MARCAS.falta).length
    console.log(`${o.pestaña}: ${o.items.length} marcados en la columna ${letraCol} · ${faltan} necesitan que se cargue la factura`)
  }
}

// SÓLO CORRE SI SE LO INVOCA. Sin esta guarda, importar el archivo para testear `grilla` en frío
// arranca main() y ESCRIBE EN EL SHEET REAL. Es la misma guarda que ya tiene caja-pestana.mjs, y
// existe por el mismo motivo: un test que reescribe la planilla del dueño no es un test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
