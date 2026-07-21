#!/usr/bin/env node
// PROVEEDORES Y MATERIALES — CON QUIÉN SE GASTA, QUÉ SE LE DEBE Y QUÉ SE LE COMPRA.
//
// EL PEDIDO (21/07). "Agreguemos todo esto en la pestaña Materiales, se debe llamar 'Proveedores y
// Materiales'. Hacé una auditoría súper profunda de Compras y llevá la información de los
// proveedores acá: saldos en cuenta corriente, cheques, fechas, todo."
//
// POR QUÉ UNA SOLA PESTAÑA Y NO DOS. Porque son la misma pregunta vista de dos lados: "a quién le
// compro" y "a quién le debo" se contestan con las mismas 738 filas de Compras. Tenerlas separadas
// obligaba a saltar de pestaña para responder lo único que importa —¿a este proveedor le debo o le
// pagué, y qué le compro?— y esa es exactamente la falta de visibilidad que el dueño describió.
//
// ═══ LA SEGUNDA VUELTA (21/07): FALTABA AFIP ═══
//
// El dueño: "no me gusta lo que hiciste con proveedores, falta información de números de cheques,
// números de facturas emitidas. No usaste el recurso de integrarse a AFIP. La regla de oro es que se
// base en el OS y ahí está eso."
//
// Tenía razón y era el punto ciego más caro. El OS ya replica los libros de IVA en la tabla
// comprobantes_arca —443 comprobantes recibidos y 16 emitidos, con CUIT, punto de venta, número,
// CAE y fecha— y yo estaba construyendo una cuenta corriente de proveedores mirando sólo Compras,
// que es lo que alguien cargó a mano. Cruzarlas da el número que justifica la vuelta entera:
//
//   AFIP tiene 443 comprobantes de compra por $197.442.458
//   · 372 están en Compras   ($126.251.048)
//   · 71 NO ESTÁN            ($71.191.410) — Acerolatina $19,6M, Alumetal $18,9M, Friolatina $18,5M
//
// ═══ LA TERCERA VUELTA (21/07): LOS $71,19M NO ERAN $71,19M ═══
//
// Ese número de arriba está MAL y se deja escrito a propósito, porque el error enseña. Dos causas,
// las dos encontradas al ir a buscar factura por factura en vez de confiar en el total:
//
// 1. EL CRUCE EMPAREJABA SÓLO POR N° DE COMPROBANTE, y 223 filas de Compras no tienen número. La
//    factura de ALUMETAL por $18.166.381 SÍ estaba cargada (fila 669) con el número vacío, y la de
//    $75.415 estaba como "0038-0002471" — le falta un dígito. Emparejando también por proveedor +
//    importe aparecen 9 comprobantes por $38.411.092 que nunca faltaron.
//
// 2. LAS NOTAS DE CRÉDITO SE CONTABAN COMO COMPRAS. Ver lib/comprobante-arca.mjs: 13 notas por
//    $20.976.638 sumadas en vez de restadas. Una nota de crédito "que falta en Compras" no es carga
//    faltante — es plata que el proveedor devolvió, y buscarla manda a alguien a perseguir un gasto
//    que no existe.
//
// LA LECCIÓN, que vale más que el número: un total grande y redondo invita a reportarlo. Los $71,19M
// sobrevivieron porque nadie los abrió. Al abrirlos, casi todo se explicaba.
//
// Y AHORA HAY NÚMEROS, no sólo totales: cada deuda muestra su comprobante (punto de venta y número)
// y el número del cheque que la paga. Un saldo sin el documento que lo respalda no se puede reclamar
// ni pagar: hay que poder decirle al proveedor "te debo la 0038-00025090 y te di el cheque 314".
//
// ═══ LO QUE ENCONTRÓ LA AUDITORÍA DE COMPRAS, Y QUE ESTA PESTAÑA MUESTRA ═══
//
// 1. EL PLAZO. Medido factura contra pago, proveedor por proveedor: Alumetal da 4 días, Corralón
//    Progreso 7, DUPEC 9, y TODO EL RESTO paga a 0 días. La empresa casi no usa el crédito de sus
//    proveedores —que es gratis— y en cambio estuvo en descubierto casi todo julio al 62,78% anual.
//    Es la conclusión más cara del archivo y hasta hoy no estaba a la vista en ningún lado.
//
// 2. LA CARGA ESTÁ PROLIJA donde importa: de 105 proveedores, sólo UNO aparece con dos grafías
//    ("Linarc SAS" y "Linarc"). Un saldo de cuenta corriente se parte en dos cuando el mismo
//    proveedor está escrito de dos formas, así que esto se controla y se muestra.
//
// 3. EL INSTRUMENTO. Un cheque emitido y no debitado es una deuda con fecha cierta que no se puede
//    renegociar; una deuda sin cheque todavía se puede conversar. Son dos cosas distintas y por eso
//    van en columnas separadas.
//
// TODO ES FÓRMULA sobre Compras y sobre Cheques Emitidos. Lo único propio son los NOMBRES —de
// proveedor, de familia, de obra— que son rótulos, no números.
//
//   node orquestador/scripts/proveedores-materiales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { FAMILIAS, SIN_FAMILIA, formulaFamilia, familiaDeMaterial, RUBROS_CON_FAMILIA } from '../lib/familia-material.mjs'
import { NOMBRES } from '../lib/sheet-pestanas.mjs'
import { ESTADO_DEUDA, MODALIDADES } from '../lib/cuentas-por-pagar.mjs'
import { parseMonto, parseFecha } from '../lib/cash-briefing.mjs'
import { normComprobante, esLlaveUtil } from '../lib/cheques-cobertura.mjs'
import { sumar, signo, esNotaDeCredito } from '../lib/comprobante-arca.mjs'
import { analizar as analizarNC, facturasAnuladasCargadas, clave as claveNC } from '../lib/notas-credito.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = NOMBRES.proveedoresMateriales
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const TOP = 30

const COL_FAMILIA = 'Compras!$AE$4:$AE'
const COL_RUBRO = 'Compras!$AC$4:$AC'
const COL_FECHA = 'Compras!$AD$4:$AD'
const COL_FACTURA = 'Compras!$C$4:$C'
const COL_TOTAL = 'Compras!$O$4:$O'
const COL_OBRA = 'Compras!$J$4:$J'
const COL_PROV = 'Compras!$E$4:$E'
const COL_MODAL = 'Compras!$F$4:$F'
const COL_ESTADO = 'Compras!$X$4:$X'
const CH = "'Cheques Emitidos'"

/** Los rubros que hacen que un proveedor sea COMERCIAL. Sueldos, ARCA o el banco no son proveedores
 *  a los que se les pueda pedir plazo, y mezclarlos tapa a los que sí. */
const RUBROS_COMERCIALES = [...RUBROS_CON_FAMILIA, 'Estructura', 'Servicios recurrentes']

/** El banco escribe "ALUMETAL S A" y Compras "Alumetal": sin normalizar, el cruce da cero. */
const normNombre = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\bS\.?\s?A\.?\s?S\.?\b|\bS\.?\s?A\.?\b|\bS\.?R\.?L\.?\b|\bSRL\b|\bSAS\b/g, '')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

function grilla({ obras, proveedores, resto, deuda, faltanEnCompras, emitidas, arca, notasCredito, anuladasCargadas }) {
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  const nombres = FAMILIAS.map(([n]) => n)
  const meses = Array.from({ length: 12 }, (_, m) => `1/${m + 1}/${AÑO}`)

  push([`PROVEEDORES Y MATERIALES ${AÑO}`])
  push(['Las mismas 738 filas de Compras vistas de los dos lados: a quién le compro y a quién le debo. Todo por fecha de PAGO, no de factura. Acá no hay ningún importe escrito: son fórmulas sobre Compras y sobre Cheques Emitidos, así que se corrige allá y cambia solo.'])
  push([])

  // ── 1 · CUENTA CORRIENTE POR PROVEEDOR ──────────────────────────────────────────────────────────
  push(['1 · CON QUIÉN SE GASTA Y QUIÉN TE FINANCIA — la cuenta corriente de cada proveedor'])
  push(['El PLAZO es el dato que no estaba en ninguna parte: días promedio entre la factura y el pago. Un proveedor que te da 30 días te está financiando gratis; uno que cobra contra entrega te empuja al descubierto, que hoy cuesta 62,78% anual. Sólo proveedores comerciales: sueldos, ARCA y el banco no son alguien a quien pedirle plazo.'])
  const cabProv = push(['Proveedor', 'CUIT', 'Facturas', `Comprado ${AÑO}`, 'Facturado según AFIP',
    '⇒ AFIP menos Compras', 'Plazo promedio', 'DEUDA HOY', 'En cuenta corriente', 'Contra entrega',
    'Vencida', 'Sin fecha', 'Cheque/echeq emitido', 'N° de cheque', 'Próximo pago', 'Qué se le compra'])
  const p0 = filas.length + 1
  for (const p of proveedores) {
    const f = filas.length + 1
    const deudaBase = `${COL_TOTAL};${COL_PROV};$A${f};${COL_ESTADO};"${ESTADO_DEUDA}"`
    push([
      p.nombre,
      p.cuit,
      `=COUNTIF(${COL_PROV};$A${f})`,
      `=SUMIF(${COL_PROV};$A${f};${COL_TOTAL})`,
      // AFIP: réplica de comprobantes_arca, la fuente fiscal. No se puede calcular desde el Sheet.
      p.arca,
      `=IF(E${f}="";"";E${f}-D${f})`,
      // EL PLAZO REAL: días entre la fecha de factura y la fecha en que salió la plata. No se puede
      // con AVERAGEIFS porque la resta es entre dos columnas, así que va por SUMPRODUCT.
      `=IFERROR(SUMPRODUCT((${COL_PROV}=$A${f})*ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0)))/SUMPRODUCT((${COL_PROV}=$A${f})*ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA}));"")`,
      `=SUMIFS(${deudaBase})`,
      `=SUMIFS(${deudaBase};${COL_MODAL};"${MODALIDADES.cuentaCorriente}")`,
      `=SUMIFS(${deudaBase};${COL_MODAL};"${MODALIDADES.contado}")`,
      `=SUMIFS(${deudaBase};${COL_FECHA};">0";${COL_FECHA};"<"&TODAY())`,
      `=$H${f}-$K${f}-SUMIFS(${deudaBase};${COL_FECHA};">="&TODAY())`,
      // El banco escribe "NEUMAGOM SAS" y Compras "Neumagom": el cruce va por coincidencia parcial.
      `=SUMPRODUCT((UPPER(${CH}!$K$2:$K$400)<>"SI")*ISNUMBER(SEARCH($A${f};${CH}!$E$2:$E$400&""))*IF(ISNUMBER(${CH}!$F$2:$F$400);${CH}!$F$2:$F$400;0))`,
      p.cheques || '',
      `=IFERROR(MINIFS(${COL_FECHA};${COL_PROV};$A${f};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_FECHA};">0");"")`,
      p.familia,
    ])
  }
  const p1 = filas.length
  const fSub = push([`Subtotal de estos ${proveedores.length}`, '',
    `=SUM($C${p0}:$C${p1})`, `=SUM($D${p0}:$D${p1})`, `=SUM($E${p0}:$E${p1})`, `=SUM($F${p0}:$F${p1})`, '',
    ...['H', 'I', 'J', 'K', 'L', 'M'].map((c) => `=SUM(${c}${p0}:${c}${p1})`), '', '', ''])
  push([`Resto de proveedores comerciales (${resto.cantidad})`, '', '', `=$D$TOTPROV-$D${fSub}`, '', '', '',
    `=$H$TOTDEUDA-$H${fSub}`, '', '', '', '', '', '', '', 'ninguno llega al 1% del total'])
  const fTotProv = push(['TOTAL PROVEEDORES COMERCIALES', '',
    '', RUBROS_COMERCIALES.map((r) => `SUMIF(${COL_RUBRO};"${r}";${COL_TOTAL})`).join('+').replace(/^/, '='),
    arca.totalR, '', '',
    // LA DEUDA DEL TOTAL TAMBIÉN SE LIMITA A LO COMERCIAL. Con la deuda entera, los $7.484.627 del
    // plan de pago de ARCA caían en la fila "resto de proveedores comerciales" y la dejaban con más
    // deuda que los treinta primeros juntos. ARCA no es un proveedor: es un plan de pago de
    // impuestos y su lugar es la pestaña Impuestos y Financieros.
    RUBROS_COMERCIALES.map((r) => `SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_RUBRO};"${r}")`).join('+').replace(/^/, '='),
    '', '', '', '', '', '', '', ''])
  push([])

  // ── 2 · LA DEUDA, DOCUMENTO POR DOCUMENTO ───────────────────────────────────────────────────────
  // Un saldo sin el documento que lo respalda no se puede reclamar ni pagar. Cada fila REFERENCIA su
  // fila de Compras: si allá se corrige el importe o se carga el número de comprobante, acá cambia
  // solo. No se copia ni un peso.
  push(['2 · QUÉ SE DEBE, DOCUMENTO POR DOCUMENTO'])
  push(['Las facturas con Estado "Pendiente" en Compras, una por una, con el instrumento que las paga. El número de comprobante es lo que permite ligar un pago a su factura: sin él, ese pago no se puede imputar nunca.'])
  const cabDoc = push(['Proveedor', 'Comprobante', 'Fecha factura', 'Fecha de pago', 'Modalidad', 'Importe',
    'Instrumento entregado', 'N° de cheque', 'Fila en Compras'])
  const doc0 = filas.length + 1
  for (const d of deuda) {
    push([
      `=Compras!$E$${d.fila}`,
      `=IF(Compras!$H$${d.fila}="";"⚠ sin N° de comprobante";Compras!$H$${d.fila})`,
      `=Compras!$C$${d.fila}`,
      `=IF(N(Compras!$AD$${d.fila})=0;"⚠ sin fecha";Compras!$AD$${d.fila})`,
      `=Compras!$F$${d.fila}`,
      `=Compras!$O$${d.fila}`,
      d.instrumento || 'sin cheque emitido',
      d.numeroCheque || '',
      d.fila,
    ])
  }
  const doc1 = filas.length
  push(['TOTAL ADEUDADO', '', '', '', '', `=SUM($F${doc0}:$F${doc1})`, '', '', ''])
  push([])

  // ── 3 · LO QUE AFIP TIENE Y COMPRAS NO ──────────────────────────────────────────────────────────
  push([`3 · FACTURADO A LA EMPRESA QUE NO ESTÁ EN COMPRAS — ${faltanEnCompras.length} comprobantes`])
  push([`Sale del libro de IVA COMPRAS de ARCA, que el OS ya replica (${arca.nR} comprobantes por ${ars(arca.totalR)}). Se cruza por punto de venta y número contra la columna "N° Comprobante" de Compras. Lo que aparece acá está facturado a la empresa con CAE y no lo ve ninguna otra pestaña del archivo: no es un error de fórmula, es carga que falta.`])
  const cabAfip = push(['Proveedor según AFIP', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '', '', '', ''])
  const afip0 = filas.length + 1
  for (const r of faltanEnCompras) push([r.nombre, r.cuit, r.comprobante, r.fecha, r.importe, '', '', '', ''])
  const afip1 = filas.length
  push(['TOTAL SIN CARGAR', '', '', '', `=SUM($E${afip0}:$E${afip1})`, '', '', '', ''])
  push([])

  // ── 3 bis · LAS NOTAS DE CRÉDITO ────────────────────────────────────────────────────────────────
  // La pregunta que el libro de IVA NO contesta: una nota de crédito puede ser una DEVOLUCIÓN (el
  // costo de la obra baja de verdad) o una REFACTURACIÓN (el costo sigue, sólo cambió de número y
  // de mes). Las dos son "tipo 3". Ver lib/notas-credito.mjs.
  push([`3 bis · NOTAS DE CRÉDITO — ¿el costo desapareció, o sólo cambió de factura?`])
  push(['Una nota de crédito puede significar dos cosas opuestas y el libro de IVA las escribe igual. Si el proveedor volvió a facturar, el costo SIGUE existiendo: sólo cambió de número y muchas veces de mes. Darlo por ahorrado es el error caro. Cada nota se cruza contra las facturas del mismo CUIT: la que anula tiene que dar el MISMO importe al peso, la que la reemplaza da parecido.'])
  const cabNC = push(['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', 'Qué es', 'Anula la factura', 'La reemplaza', '', ''])
  const nc0 = filas.length + 1
  for (const n of notasCredito) push([n.proveedor, n.comprobante, n.fecha, n.monto, n.que, n.anula, n.reemplaza, '', ''])
  const nc1 = filas.length
  push(['TOTAL ACREDITADO', '', '', `=SUM($D${nc0}:$D${nc1})`, '', '', '', '', ''])
  push([])
  let cabAnu = 0, anu0 = 0, anu1 = 0
  if (anuladasCargadas.length) {
    push([`⚠ COMPRAS TIENE CARGADA LA FACTURA ANULADA — ${anuladasCargadas.length} caso(s)`])
    push(['El importe cierra, así que ningún control lo ve. Pero el comprobante que está cargado fue ANULADO por una nota de crédito y reemplazado por otro: el número no existe más para AFIP y el costo quedó imputado al mes viejo. Hay que corregir el N° de comprobante y la fecha en Compras.'])
    cabAnu = push(['Proveedor', 'Cargada en Compras', 'Fecha cargada', 'Importe', 'Corresponde', 'Fecha correcta', '', '', ''])
    anu0 = filas.length + 1
    for (const m of anuladasCargadas) push([m.proveedor, m.cargada, m.fechaCargada, m.monto, m.corresponde, m.fechaCorrecta, '', '', ''])
    anu1 = filas.length
    push([])
  }

  // ── 4 · LO QUE LA EMPRESA FACTURÓ ───────────────────────────────────────────────────────────────
  push([`4 · FACTURAS EMITIDAS — ${emitidas.length} comprobantes del libro de IVA VENTAS de ARCA`])
  push(['Los números de las facturas que emitió la empresa, con su CAE, tal como los tiene AFIP. La última columna cruza contra Cobranzas por número: una factura emitida que Cobranzas no tiene es plata facturada que nadie está siguiendo.'])
  const cabEmi = push(['Cliente', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '¿Está en Cobranzas?', '', '', ''])
  const emi0 = filas.length + 1
  for (const r of emitidas) {
    push([r.nombre, r.cuit, r.comprobante, r.fecha, r.importe,
      `=IF(COUNTIF(Cobranzas!$E$5:$E$300;"*"&$C${filas.length + 1}&"*")>0;"✓ sí";"⚠ NO está en Cobranzas")`, '', '', ''])
  }
  const emi1 = filas.length
  push(['TOTAL FACTURADO', '', '', '', `=SUM($E${emi0}:$E${emi1})`, '', '', '', ''])
  push([])

  // ── 2 · FAMILIA × MES ───────────────────────────────────────────────────────────────────────────
  push(['5 · EN QUÉ SE VA LA PLATA — por familia de material y por mes'])
  const cabFam = push(['Familia', ...meses, `Total ${AÑO}`, '% del total', 'Civil', 'Mantenimiento'])
  const fam0 = filas.length + 1
  for (const n of [...nombres, SIN_FAMILIA]) {
    const f = filas.length + 1
    const clave = n === SIN_FAMILIA ? `"${SIN_FAMILIA}"` : `$A${f}`
    push([
      n === SIN_FAMILIA ? `${SIN_FAMILIA} — falta describir qué se compró` : n,
      ...meses.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};${clave};${COL_FECHA};">="&${letra(i + 1)}$${cabFam};${COL_FECHA};"<"&EOMONTH(${letra(i + 1)}$${cabFam};0)+1)`),
      `=SUMIF(${COL_FAMILIA};${clave};${COL_TOTAL})`,
      `=IFERROR(${letra(13)}${f}/${letra(13)}$TOTFAM;0)`,
      `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};${clave};${COL_RUBRO};"${RUBROS_CON_FAMILIA[0]}")`,
      `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};${clave};${COL_RUBRO};"${RUBROS_CON_FAMILIA[1]}")`,
    ])
  }
  const fam1 = filas.length
  const totFam = push(['TOTAL MATERIALES',
    ...meses.map((_, i) => `=SUM(${letra(i + 1)}${fam0}:${letra(i + 1)}${fam1})`),
    `=SUM(${letra(13)}${fam0}:${letra(13)}${fam1})`, '',
    `=SUM(${letra(15)}${fam0}:${letra(15)}${fam1})`,
    `=SUM(${letra(16)}${fam0}:${letra(16)}${fam1})`,
  ])
  push([])

  // ── 3 · FAMILIA × OBRA ──────────────────────────────────────────────────────────────────────────
  push(['6 · EN QUÉ OBRA — la misma plata, abierta por obra'])
  const cabObra = push(['Familia', ...obras, 'Total', 'Control (tiene que dar $0)'])
  const obra0 = filas.length + 1
  for (const n of [...nombres, SIN_FAMILIA]) {
    const f = filas.length + 1
    push([
      n === SIN_FAMILIA ? `${SIN_FAMILIA} — falta describir qué se compró` : n,
      ...obras.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};LEFT($A${f};${n.length});${COL_OBRA};${letra(i + 1)}$${cabObra})`),
      `=SUM(${letra(1)}${f}:${letra(obras.length)}${f})`,
      `=SUMIF(${COL_FAMILIA};LEFT($A${f};${n.length});${COL_TOTAL})-${letra(obras.length + 1)}${f}`,
    ])
  }
  const obra1 = filas.length
  push(['TOTAL POR OBRA',
    ...obras.map((_, i) => `=SUM(${letra(i + 1)}${obra0}:${letra(i + 1)}${obra1})`),
    `=SUM(${letra(obras.length + 1)}${obra0}:${letra(obras.length + 1)}${obra1})`,
    `=SUM(${letra(obras.length + 2)}${obra0}:${letra(obras.length + 2)}${obra1})`,
  ])
  push([])

  // ── 4 · CONTROL Y AUDITORÍA DE CARGA ────────────────────────────────────────────────────────────
  push(['7 · CONTROL Y AUDITORÍA DE CARGA'])
  const ctrl = filas.length + 1
  push([`${RUBROS_CON_FAMILIA[0]} (rubro de Compras)`, `=SUMIF(${COL_RUBRO};"${RUBROS_CON_FAMILIA[0]}";${COL_TOTAL})`, 'Es la misma línea del Cash Flow Mensual.'])
  push([`${RUBROS_CON_FAMILIA[1]} (rubro de Compras)`, `=SUMIF(${COL_RUBRO};"${RUBROS_CON_FAMILIA[1]}";${COL_TOTAL})`, ''])
  push(['⇒ Diferencia contra el total de materiales (tiene que ser $0)', `=$B${ctrl}+$B${ctrl + 1}-${letra(13)}$TOTFAM`, 'Distinto de cero = hay materiales que ninguna familia está mirando.'])
  // ESTE CONTROL ESTABA MAL Y VALE DEJARLO ESCRITO: la primera versión era =X-Y-(X-Y), que da cero
  // SIEMPRE, mire lo que mire. Un control que no puede fallar no controla nada — es peor que no
  // tenerlo, porque da tranquilidad gratis.
  push(['Deuda que NO es de un proveedor comercial', `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")-$H$${fTotProv}`,
    'Planes de pago de ARCA, impuestos y nómina. No son alguien a quien pedirle plazo, y por eso no están en la tabla de arriba — pero son plata que se debe igual. Su detalle está en Impuestos y Financieros.'])
  push(['⇒ Deuda total con terceros', `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")`, 'Comercial + no comercial. Es el número que tiene que dar igual que la suma de las filas "Pendiente" de Compras.'])
  push([])
  push(['Sin describir — plata que no se sabe en qué se gastó', `=SUMIF(${COL_FAMILIA};"${SIN_FAMILIA}";${COL_TOTAL})`, 'Filas que dicen "materiales varios", "???" o están vacías. No se les inventa familia: hay que describirlas en Compras.'])
  const fCuenta1 = push(['Sin describir — cuántas facturas son', `=COUNTIF(${COL_FAMILIA};"${SIN_FAMILIA}")`, ''])
  const fCuenta2 = push(['Facturas de proveedor sin N° de comprobante — cuántas son', `=SUMPRODUCT((${COL_PROV}<>"")*(Compras!$H$4:$H="")*(${COL_TOTAL}<>0))`,
    '⚠ Sin número no se puede ligar un pago a su factura, ni hoy ni nunca. Es lo que hace que 40 de los 89 cheques no se puedan imputar.'])
  push(['Facturas de proveedor sin N° de comprobante — cuánta plata', `=SUMPRODUCT((${COL_PROV}<>"")*(Compras!$H$4:$H="")*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))`, ''])
  push(['Deuda sin fecha de pago', `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")-SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_FECHA};">0")`,
    '⚠ Esta plata no aparece en ninguna semana ni mes del cash flow: sin fecha, el cuadro no la puede ubicar.'])
  push(['Plazo promedio ponderado de toda la compra comercial',
    `=IFERROR(SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))/SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0));"")`,
    'Días. Cada día que se estira este número es un día menos de descubierto al 62,78% anual.'])

  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string'
    ? c.replaceAll('$TOTFAM', String(totFam)).replaceAll('$TOTPROV', String(fTotProv)).replaceAll('$TOTDEUDA', String(fTotProv))
    : c)))
  return { filas: resuelto, cuentas: [fCuenta1, fCuenta2], doc0, doc1, afip0, afip1, emi0, emi1, nc0, nc1, cabNC, cabAnu, anu0, anu1, cabDoc, cabAfip, cabEmi, p0, p1, fSub, fTotProv, cabProv, fam0, fam1, totFam, obra0, obra1, cabFam, cabObra, ctrl, anchoObras: obras.length }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const compras = (await google.readSheetValues(ID, 'Compras!A4:AE800')).filter((f) => parseMonto(f?.[14]))

  // LOS PROVEEDORES SALEN DEL DATO, no de una lista mía: si mañana aparece uno nuevo y grande, entra
  // solo. Comercial = tiene al menos una compra en un rubro al que se le puede pedir plazo.
  const acc = new Map()
  for (const f of compras) {
    const nombre = String(f?.[4] ?? '').trim()
    if (!nombre) continue
    const a = acc.get(nombre) ?? { nombre, total: 0, n: 0, comercial: false, fam: new Map() }
    a.total += parseMonto(f?.[14]); a.n++
    if (RUBROS_COMERCIALES.includes(String(f?.[28] ?? '').trim())) a.comercial = true
    const fam = String(f?.[30] ?? '').trim() || familiaDeMaterial({ concepto: f?.[11], detalle: f?.[10], proveedor: nombre })
    if (fam && fam !== SIN_FAMILIA) a.fam.set(fam, (a.fam.get(fam) ?? 0) + parseMonto(f?.[14]))
    acc.set(nombre, a)
  }
  const comerciales = [...acc.values()].filter((p) => p.comercial).sort((a, b) => b.total - a.total)

  // ── AFIP: LA FUENTE FISCAL ─────────────────────────────────────────────────────────────────────
  // comprobantes_arca es el libro de IVA que el OS ya replica. Es la única fuente que dice qué se
  // facturó DE VERDAD: Compras dice lo que alguien cargó.
  //
  // CON SIGNO (21/07): una NOTA DE CRÉDITO resta. En el libro hay 13 por $20.976.638 y se estaban
  // sumando como compras: $197.442.458 declarados contra $155.489.182 reales. Y una nota de crédito
  // no puede figurar como "falta cargar en Compras" — no es una compra que nadie anotó, es plata
  // que el proveedor devolvió. Ver lib/comprobante-arca.mjs.
  const rArca = (await query(
    "select tipo_comprobante, emisor_nombre, emisor_cuit, punto_venta, numero, fecha_emision, imp_total from comprobantes_arca where tipo_libro='R' order by fecha_emision",
  )).rows
  const eArca = (await query(
    "select tipo_comprobante, receptor_cuit, punto_venta, numero, fecha_emision, imp_total from comprobantes_arca where tipo_libro='E' order by fecha_emision desc",
  )).rows
  const totR = sumar(rArca, 'imp_total')
  const notasCrudas = rArca.filter((r) => esNotaDeCredito(r.tipo_comprobante))
  const arca = {
    nR: rArca.length, totalR: totR.neto,
    nNotas: notasCrudas.length, montoNotas: totR.restan,
    desconocidos: totR.desconocidos.length,
  }

  // El cruce va por punto de venta + número normalizados: "0038-00025483" y "38-25483" son la misma
  // factura, y cada planilla la escribe a su manera.
  const enCompras = new Map()
  for (const f of compras) {
    const k = normComprobante(f?.[7])
    if (esLlaveUtil(k)) enCompras.set(k, { proveedor: String(f?.[4] ?? '').trim() })
  }
  const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-AR') : '')
  const faltanEnCompras = rArca
    // Las notas de crédito se excluyen del "falta cargar": mandarían a buscar un gasto inexistente.
    .filter((r) => !esNotaDeCredito(r.tipo_comprobante))
    .filter((r) => !enCompras.has(normComprobante(`${r.punto_venta}-${r.numero}`)))
    .map((r) => ({
      nombre: r.emisor_nombre, cuit: r.emisor_cuit,
      comprobante: `${String(r.punto_venta).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`,
      fecha: fecha(r.fecha_emision), importe: Number(r.imp_total),
    }))
    .sort((a, b) => b.importe - a.importe)
  const emitidas = eArca.filter((r) => !esNotaDeCredito(r.tipo_comprobante)).map((r) => ({
    nombre: r.receptor_cuit ? `CUIT ${r.receptor_cuit}` : '(sin receptor)', cuit: r.receptor_cuit,
    comprobante: `${String(r.punto_venta).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`,
    fecha: fecha(r.fecha_emision), importe: Number(r.imp_total),
  }))

  // ── QUÉ HACE CADA NOTA DE CRÉDITO ──────────────────────────────────────────────────────────────
  // Saber que RESTA arregla la aritmética; esto contesta la pregunta de negocio. Ver
  // lib/notas-credito.mjs: una refacturación NO es un ahorro, y si Compras tiene cargada la factura
  // anulada, el importe cierra pero el comprobante ya no existe y el mes está mal.
  const analisisNC = analizarNC(rArca)
  const QUE = { refacturacion: 'REFACTURACIÓN — el costo sigue', devolucion: 'Devolución — el costo baja', revisar: '⚠ revisar (parcial o descuento)' }
  const comp = (c) => `${String(c.punto_venta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`
  const notasCredito = analisisNC.map((a) => ({
    proveedor: a.nota.emisor_nombre,
    comprobante: comp(a.nota),
    fecha: fecha(a.nota.fecha_emision),
    monto: -a.monto, // se muestra en negativo: es lo que resta
    que: QUE[a.clase],
    anula: a.anula.map(comp).join(' · '),
    reemplaza: a.refactura.map(comp).join(' · '),
  }))
  const anuladasCargadas = facturasAnuladasCargadas(analisisNC, new Set([...enCompras.keys()]), (c) => normComprobante(claveNC(c)))
    .map((m) => ({
      proveedor: m.anulada.emisor_nombre,
      cargada: comp(m.anulada),
      fechaCargada: fecha(m.anulada.fecha_emision),
      monto: Number(m.anulada.imp_total),
      corresponde: m.reemplazos.map(comp).join(' / '),
      fechaCorrecta: m.reemplazos.map((r) => fecha(r.fecha_emision)).join(' / '),
    }))

  // Lo facturado por AFIP, por proveedor, para poder contrastarlo contra lo cargado en Compras.
  const porCuit = new Map()
  for (const r of rArca) {
    const s = signo(r.tipo_comprobante)
    if (s === null) continue // tipo desconocido: no se le adivina el signo
    const k = normNombre(r.emisor_nombre)
    const a = porCuit.get(k) ?? { cuit: r.emisor_cuit, total: 0 }
    a.total += s * Number(r.imp_total)
    porCuit.set(k, a)
  }

  // Los cheques y echeq emitidos sin debitar, con su NÚMERO: un instrumento sin número no sirve para
  // hablar con el proveedor.
  const tabCh = 'Cheques Emitidos'
  const cheques = (await google.readSheetValues(ID, `${tabCh}!A2:L400`))
    .map((f, i) => ({ fila: i + 2, tipo: f?.[0], numero: String(f?.[1] ?? '').trim(), proveedor: String(f?.[4] ?? '').trim(), monto: parseMonto(f?.[5]), comprobante: normComprobante(f?.[7]), debitado: String(f?.[10] ?? '').trim().toUpperCase() }))
    .filter((c) => c.monto > 0 && c.debitado !== 'SI')
  const chequesPorProv = new Map()
  for (const c of cheques) {
    const k = normNombre(c.proveedor)
    const a = chequesPorProv.get(k) ?? []
    a.push(c)
    chequesPorProv.set(k, a)
  }

  const proveedores = comerciales.slice(0, TOP).map((p) => {
    const k = normNombre(p.nombre)
    const ch = chequesPorProv.get(k) ?? []
    return {
      nombre: p.nombre,
      cuit: porCuit.get(k)?.cuit ?? '',
      arca: porCuit.get(k)?.total ?? '',
      cheques: ch.map((c) => `${/eche?q/i.test(c.tipo) ? 'e' : ''}${c.numero}`).join(' · '),
      familia: [...p.fam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    }
  })
  const resto = { cantidad: Math.max(0, comerciales.length - TOP) }

  // La deuda documento por documento, con la fila de Compras de cada una para poder referenciarla.
  const deuda = compras
    .map((f, i) => ({ fila: i + 4, f }))
    .filter(({ f }) => String(f?.[23] ?? '').trim().toLowerCase() === ESTADO_DEUDA.toLowerCase())
    .map(({ fila, f }) => {
      const k = normComprobante(f?.[7])
      const porComprobante = esLlaveUtil(k) ? cheques.find((c) => c.comprobante === k) : null
      const porNombre = (chequesPorProv.get(normNombre(f?.[4])) ?? [])[0]
      const c = porComprobante ?? porNombre
      return {
        fila,
        instrumento: c ? (porComprobante ? 'cheque imputado por comprobante' : 'hay cheque al proveedor, sin imputar') : '',
        numeroCheque: c ? `${/eche?q/i.test(c.tipo) ? 'e' : ''}${c.numero}` : '',
      }
    })
    .sort((a, b) => a.fila - b.fila)

  const obras = ['LA ESTRELLA', 'San Francisco', 'MESSINAS', 'ARCOR', 'Administracion', 'Almacen', 'Taller', 'SAINT GOBAIN']
  const g = grilla({ obras, proveedores, resto, deuda, faltanEnCompras, emitidas, arca, notasCredito, anuladasCargadas })
  const ancho = Math.max(...g.filas.map((f) => f.length))
  const cuadro = g.filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r })
  console.log(`${PESTAÑA}: ${cuadro.length} filas x ${ancho} columnas`)
  console.log(`  ${comerciales.length} proveedores comerciales de ${acc.size} · top ${proveedores.length} listados, ${resto.cantidad} en "resto"`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // La columna de familia en Compras: una sola definición, la misma disciplina que el rubro.
  const meta0 = await google.getSheetMeta(ID)
  const hojaCompras = meta0.find((s) => s.title === 'Compras')
  const reqC = []
  if (hojaCompras.cols < 31) reqC.push({ appendDimension: { sheetId: hojaCompras.sheetId, dimension: 'COLUMNS', length: 31 - hojaCompras.cols } })
  reqC.push({
    updateCells: {
      range: { sheetId: hojaCompras.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 30, endColumnIndex: 31 },
      rows: [
        { values: [{ userEnteredValue: { stringValue: 'Familia de material' }, userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }] },
        { values: [{ userEnteredValue: { formulaValue: formulaFamilia() } }] },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  reqC.push({ updateDimensionProperties: { range: { sheetId: hojaCompras.sheetId, dimension: 'COLUMNS', startIndex: 30, endIndex: 31 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqC)

  // LA PESTAÑA: si existe la vieja "Materiales", se RENOMBRA en vez de crear una nueva. Crear otra
  // dejaría dos pestañas con la mitad de la verdad cada una, que es el problema que esto arregla.
  let hojas = await google.getSheetMeta(ID)
  let hoja = hojas.find((s) => s.title === PESTAÑA)
  if (!hoja) {
    const vieja = hojas.find((s) => s.title === 'Materiales')
    if (vieja) {
      await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: vieja.sheetId, title: PESTAÑA }, fields: 'title' } }])
      console.log(`  pestaña "Materiales" renombrada a "${PESTAÑA}"`)
      hoja = { ...vieja, title: PESTAÑA }
    } else {
      await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: 220, columnCount: 20 } } } }])
      hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
    }
  }
  await google.clearValues(ID, `${PESTAÑA}!A1:Z220`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A1:${letra(ancho - 1)}${cuadro.length}`, values: cuadro }])
  await formatear(google, hoja.sheetId, g, ancho, cuadro.length)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:T${cuadro.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 8).join(' ')}` : '\n✓ sin errores')

  console.log('\nCUENTA CORRIENTE (top 10):')
  console.log(`  ${'Proveedor'.padEnd(24)}${'Comprado'.padStart(14)}${'AFIP'.padStart(14)}${'Plazo'.padStart(7)}${'Deuda'.padStart(13)}  Cheques`)
  for (let i = g.p0; i < g.p0 + 10 && i <= g.p1; i++) {
    const f = v[i - 1] ?? []
    console.log(`  ${String(f[0] ?? '').slice(0, 22).padEnd(24)}${String(f[3] ?? '').padStart(14)}${String(f[4] ?? '').padStart(14)}${String(f[6] ?? '').padStart(7)}${String(f[7] ?? '').padStart(13)}  ${String(f[13] ?? '').slice(0, 34)}`)
  }
  const fila = (rot) => v.find((f) => String(f?.[0] ?? '').startsWith(rot))
  console.log('\nCONTROL:')
  for (const rot of ['⇒ Diferencia contra el total', 'Deuda que NO es', '⇒ Deuda total', 'Sin describir — plata',
    'Facturas de proveedor sin N° de comprobante — cuánta', 'Deuda sin fecha', 'Plazo promedio ponderado']) {
    const f = fila(rot)
    if (f) console.log(`  ${String(f[0]).slice(0, 52).padEnd(54)}${String(f[1] ?? '')}`)
  }
  console.log(`\n  AFIP: ${g.afip1 - g.afip0 + 1} comprobantes facturados que Compras no tiene · ${g.emi1 - g.emi0 + 1} facturas emitidas listadas`)
}

async function formatear(google, sheetId, g, ancho, filas) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.89, green: 0.91, blue: 0.94 }
  const ROJO = { red: 1, green: 0.93, blue: 0.93 }
  const r = (r0, r1, c0 = 0, c1 = ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, filas) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  for (const i of [1, 4]) {
    fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
      { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  }
  for (const f of [g.cabProv, g.cabFam, g.cabObra]) {
    fmt(r(f - 2, f - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    fmt(r(f - 1, f), 'userEnteredFormat', { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  }
  fmt({ ...r(g.cabFam - 1, g.cabFam), startColumnIndex: 1, endColumnIndex: 13 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'DATE', pattern: 'mmm' } })
  for (const f of [g.fSub, g.fTotProv, g.totFam, g.obra1 + 1]) {
    fmt(r(f - 1, f), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor', { textFormat: { bold: true }, backgroundColor: GRIS })
  }
  // Los porcentajes son porcentajes; el plazo son días; la deuda vencida va en rojo suave.
  // EL BLOQUE 1 SE CORRIÓ DOS COLUMNAS al entrar CUIT y AFIP, y los formatos viejos quedaron
  // pintando de porcentaje las columnas de plata: "Comprado" mostraba "4839741419,0%". Un formato
  // que sobrevive a un cambio de layout es tan peligroso como una referencia a la celda equivocada.
  fmt({ ...r(g.p0 - 1, g.fTotProv, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.p0 - 1, g.fTotProv, 2, 3) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0;;""' } })
  fmt({ ...r(g.p0 - 1, g.fTotProv, 6, 7) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'NUMBER', pattern: '0" d";;""' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.p0 - 1, g.p1, 10, 11) }, 'userEnteredFormat.backgroundColor', { backgroundColor: ROJO })
  fmt({ ...r(g.p0 - 1, g.p1, 13, 14) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 }, horizontalAlignment: 'CENTER' })
  // NOTAS DE CRÉDITO — el formato moneda general de la pestaña convierte una fecha en "$46.119"
  // (el número de serie del 7/4/2026 pintado como pesos). Ya pasó cinco veces en este archivo: un
  // control que suma no ve un defecto de pantalla. Cada columna del bloque dice qué es.
  if (g.nc0 && g.nc1 >= g.nc0) {
    // C = fecha de la nota · B y F/G = comprobantes, que son texto y no números con separador.
    fmt({ ...r(g.nc0 - 1, g.nc1, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.nc0 - 1, g.nc1, 1, 2) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt({ ...r(g.nc0 - 1, g.nc1, 4, 7) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }
  if (g.anu0 && g.anu1 >= g.anu0) {
    fmt({ ...r(g.anu0 - 1, g.anu1, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.anu0 - 1, g.anu1, 5, 6) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.anu0 - 1, g.anu1, 1, 2) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt({ ...r(g.anu0 - 1, g.anu1, 4, 5) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }
  fmt({ ...r(g.p0 - 1, g.p1, 14, 15) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yy' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.p0 - 1, g.p1, 15, 16) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9, italic: true }, horizontalAlignment: 'LEFT' })
  // Los bloques documentales: comprobante y N° de cheque son TEXTO, y las fechas, fechas.
  for (const [a, b] of [[g.doc0, g.doc1], [g.afip0, g.afip1], [g.emi0, g.emi1]]) {
    fmt({ ...r(a - 1, b, 1, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  }
  fmt({ ...r(g.doc0 - 1, g.doc1, 2, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yy' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.doc0 - 1, g.doc1, 6, 9) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 }, horizontalAlignment: 'LEFT' })
  for (const [a, b] of [[g.afip0, g.afip1], [g.emi0, g.emi1]]) {
    fmt({ ...r(a - 1, b, 3, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  }
  fmt({ ...r(g.emi0 - 1, g.emi1, 5, 6) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 }, horizontalAlignment: 'LEFT' })
  for (const f of [g.cabDoc, g.cabAfip, g.cabEmi]) {
    fmt(r(f - 2, f - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    fmt(r(f - 1, f), 'userEnteredFormat', { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  }
  fmt({ ...r(g.fam0 - 1, g.totFam), startColumnIndex: 14, endColumnIndex: 15 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  // El bloque de control lleva explicación en la columna C: que no la formatee como plata.
  fmt({ ...r(g.ctrl - 1, filas), startColumnIndex: 2, endColumnIndex: ancho }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true } })
  fmt(r(g.ctrl - 2, g.ctrl - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
  g.filas.forEach((f, i) => { if (/^⇒/.test(String(f[0] ?? ''))) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } }) })
  // UN CONTADOR NO ES PLATA. "46 facturas" dibujado como "$46" se lee como cuarenta y seis pesos.
  for (const f of g.cuentas) fmt(r(f - 1, f, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0" facturas"' } })
  // El plazo ponderado son días, no pesos: es la última fila del bloque de control.
  fmt(r(filas - 1, filas, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0.0" días"' } })

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ancho }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1 } }, fields: 'gridProperties.frozenColumnCount' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
