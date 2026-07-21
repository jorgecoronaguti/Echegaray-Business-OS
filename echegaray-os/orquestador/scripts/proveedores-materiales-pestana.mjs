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
import { partir, filasHuerfanas, ref as refPestana } from '../lib/partir-pestana.mjs'
import { ESTADO_DEUDA, MODALIDADES } from '../lib/cuentas-por-pagar.mjs'
import { formulaOrden, formulaOrdenSinFecha, celdaDeuda, COL as ORDEN } from '../lib/orden-deuda.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { normComprobante, esLlaveUtil } from '../lib/cheques-cobertura.mjs'
import { sumar, signo, esNotaDeCredito } from '../lib/comprobante-arca.mjs'
import { analizar as analizarNC, facturasAnuladasCargadas, clave as claveNC } from '../lib/notas-credito.mjs'
import { cruzar, verificar } from '../lib/cobertura-arca.mjs'
import { ARCA as N_ARCA, publicar } from '../lib/rangos-nombrados.mjs'
import { query } from '../lib/db.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { R, IMPORTE, arcaPorCuit, arcaPorComprobante, arcaPorComprobanteVentas, totalLibro } from '../lib/arca-formula.mjs'
import { formatear as formatearCuit } from '../lib/cuit.mjs'
import { pivot, filtroValores, valoresNoCubiertos, plantar, borrar, RESUMEN } from '../lib/pivot-sheets.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = NOMBRES.proveedoresMateriales
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const TOP = 30
/** Colchón de filas sobre la deuda actual, para que la tabla derrame sin pisar el bloque siguiente.
 *  ANTES ERA UN 40 FIJO y dejaba 27 filas muertas: el dueño vio la pestaña y dijo "es completamente
 *  inútil". Un cuadro con un agujero de treinta filas no se lee, por más que los números estén bien. */
// El colchón de filas que se reserva para que el QUERY derrame sin pisar el bloque de abajo.
// BAJÓ DE 8 A 2 (21/07): con 8 quedaban once filas en blanco a la vista en el medio de la pestaña, y
// el dueño lo señaló. El agente redimensiona cada 2 horas y el control del bloque 7 avisa si entre
// dos corridas entró más deuda de la que entra en la reserva, así que 2 alcanza.
const COLCHON_DEUDA = 2

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

/** Qué columna de Compras alimenta cada columna de la tabla de deuda. '' = la calcula otra fórmula.
 *  El orden es el que ve el dueño: fecha de pago, proveedor, comprobante, fecha factura, modalidad,
 *  importe, obra, y las dos últimas que se buscan en Cheques Emitidos. */
const COL_DEUDA = ['$E', '$AD', '$H', '$C', '$F', '$O', '$J', '', '']

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

function grilla({ obras, proveedores, resto, faltanEnCompras, emitidas, arca, notasCredito, anuladasCargadas, cruce, nDeuda, nSinFecha }) {
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  const nombres = FAMILIAS.map(([n]) => n)
  const meses = Array.from({ length: 12 }, (_, m) => `1/${m + 1}/${AÑO}`)

  push([`PROVEEDORES Y MATERIALES ${AÑO}`])
  push(['Las mismas 738 filas de Compras vistas de los dos lados: a quién le compro y a quién le debo. Todo por fecha de PAGO, no de factura. Acá no hay ningún importe escrito: son fórmulas sobre Compras y sobre Cheques Emitidos, así que se corrige allá y cambia solo.'])
  push([])

  // ── 1 · LA DEUDA, DOCUMENTO POR DOCUMENTO, ORDENADA POR FECHA DE PAGO ───────────────────────────────────────────────────────
  //
  // ═══ SE REHIZO ENTERO (21/07) — TENÍA UN BUG QUE MOSTRABA FILAS EQUIVOCADAS ═══
  //
  // El dueño: "esta pestaña ha quedado con mal formato, además quiero que se respete algún orden,
  // fecha de pago, monto de deuda... este no es formato clase mundial". Yendo a ordenarla apareció
  // algo peor que el formato: la misma pestaña mostraba TRES totales de deuda distintos
  // ($8.963.047 en el bloque 1, $34.292.994 acá, $16.447.674 en el control).
  //
  // LA CAUSA. El script leía Compras, FILTRABA las filas sin importe y recién después calculaba el
  // número de fila con el índice del array:
  //     compras.filter(...).map((f, i) => ({ fila: i + 4 }))
  // Cada fila descartada corría todo el índice hacia arriba, así que las referencias apuntaban a
  // filas que no eran. Por eso figuraba como deuda la fila 355 (Gerson Castro, $4.000.000) que en
  // Compras dice "Pagado". Es exactamente el mismo error que ya había documentado en
  // cheques-cobertura-sheet.mjs —"filtrar antes de saber la fila corre todas las marcas hacia
  // arriba"— y lo volví a cometer en otro archivo. La lección estaba escrita y no alcanzó.
  //
  // LA SOLUCIÓN NO ES ARREGLAR EL ÍNDICE, es sacarle al bloque la posibilidad de tener el bug: una
  // lista de referencias a filas fijas es frágil por naturaleza (además, si alguien INSERTA una fila
  // en Compras, todas se corren en silencio). Ahora es UNA SOLA FÓRMULA VIVA —QUERY— que se
  // reconstruye sola en cada recálculo del Sheet, no cada 2 horas cuando corre el agente.
  //
  // Y ORDENADA POR FECHA DE PAGO, que es lo que se pidió: la pregunta de este bloque es "¿qué pago
  // primero?", y para contestarla el orden por fecha es la respuesta, no un detalle estético.
  //
  // POR QUÉ QUERY Y NO SORT(FILTER(...)): SORT necesita las columnas juntas y armarlas pide un
  // literal de array, que NO es portable al separador es-AR ({"a"\"b"} vs {"a";"b"}) — ya rompió
  // una vez en esta misma pestaña. El texto del QUERY va entre comillas y el localizador de
  // fórmulas respeta los literales, así que sus comas llegan intactas.
  const b1 = push(['1 · QUÉ SE DEBE Y CUÁNDO — ordenado por fecha de pago'])
  push(['Las facturas con Estado "Pendiente" en Compras, la más urgente primero. Es UNA fórmula viva: si allá se marca una como pagada, desaparece de acá sola, sin esperar al agente. El N° de comprobante es lo que permite ligar un pago a su factura: sin él, ese pago no se puede imputar nunca.'])
  // El total va ARRIBA de la tabla y no abajo: la tabla es de alto variable y un total al pie
  // quedaría flotando lejos, o pisado. Y es la MISMA fórmula que el control del bloque 7, así que
  // los dos números no pueden discrepar.
  push(['TOTAL ADEUDADO HOY', `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")`, '', '', '',
    'Tiene que dar igual que "Deuda total con terceros", en el bloque de control, y que la suma de la columna Importe de acá abajo.'])
  // EL ORDEN DE LAS COLUMNAS NO ES ESTÉTICO: las SEIS primeras las derrama el QUERY y tienen que
  // estar en el mismo orden que el "select". Las dos últimas son búsquedas y van DESPUÉS del
  // derrame — ponerlas en el medio bloquea el spill entero con un #REF! (pasó, 21/07).
  // LA PRIMERA COLUMNA ES EL PROVEEDOR EN TODAS LAS TABLAS DE ESTA PESTAÑA. Es lo que hace que un
  // solo juego de anchos les sirva a las seis: si una arranca con una fecha y otra con un nombre
  // largo, la columna A no puede tener un ancho que funcione para las dos. El orden de la tabla
  // sigue siendo por fecha de pago —lo que cambia es qué se lee primero, no cómo se ordena.
  const cabDoc = push(['Proveedor', 'Fecha de pago', 'Comprobante', 'Fecha factura', 'Modalidad', 'Importe',
    'Obra', 'Instrumento entregado', 'N° de cheque'])
  const doc0 = filas.length + 1
  // La fórmula ocupa UNA celda y derrama hacia abajo. Se reservan filas para que el derrame no pise
  // el bloque siguiente; el control del bloque 7 avisa si la deuda supera la reserva.
  // EL ORDEN QUE PIDIÓ EL DUEÑO, Y LA TRAMPA QUE TENÍA.
  //
  // "Quiero que se respete algún orden: fecha de pago, monto de deuda." Un `order by AD` a secas
  // pone los NULOS PRIMERO, así que lo primero que se veía al abrir la pestaña eran las filas sin
  // fecha. Por eso van dos QUERY: primero lo que tiene fecha, ordenado por fecha; después lo que no
  // la tiene, ordenado por monto de mayor a menor, con su propio rótulo.
  //
  // ═══ UN NÚMERO QUE REPORTÉ MAL Y ACÁ QUEDA CORREGIDO (21/07) ═══
  //
  // Al armar la versión con pivots vi que once filas de Compras tienen la palabra "Pendiente"
  // ESCRITA en la columna Q, "Fecha prevista de pago", y reporté que eran $15.010.639 —el 91% de la
  // deuda— fuera de toda semana del cash flow. Era falso, y el error fue mío: el cash flow NO usa la
  // columna Q. Usa AD, "Fecha de caja". Ocho de esas once tienen su fecha de caja cargada, así que
  // el cuadro sí las espera.
  //
  // Lo que de verdad queda fuera de toda semana son TRES facturas por $1.516.755 — el 9,2% de la
  // deuda, no el 91%. Sigue siendo trabajo pendiente, pero es un orden de magnitud menos.
  //
  // POR QUÉ ME PASÓ: vi un total grande y redondo y no lo abrí. Es exactamente el defecto que este
  // archivo documenta dos veces más arriba, con los $71,19M que tampoco eran $71,19M. La lección no
  // se aprendió leyéndola: hay que verificar CUÁL columna consume el cuadro antes de decir que un
  // dato falta.
  //
  // (Que la palabra "Pendiente" esté escrita en una columna de fecha sigue siendo un defecto de
  // carga y por eso el bloque de abajo existe; simplemente no cuesta $15M.)
  // ═══ UNA FÓRMULA EN CADA CELDA, NO UN QUERY QUE DERRAMA ═══
  //
  // Acá había un QUERY que ocupaba UNA celda y llenaba las otras 143 por derrame. Funcionaba y era
  // vivo, pero el dueño abrió F8, vio "700000" en la barra de fórmulas y marcó el error por segunda
  // vez. Y tiene razón: Sheets muestra un valor derramado igual que uno tipeado, así que la regla
  // se cumplía en el modelo pero no se podía VER. Una regla que hay que creer no sirve.
  //
  // Ahora cada celda trae su dato con INDEX/MATCH contra la columna de orden que el OS calcula en
  // Compras (lib/orden-deuda.mjs). Sigue igual de viva —se marca una factura pagada allá y
  // desaparece de acá sola— y además se puede abrir cualquier celda y ver de dónde sale.
  const reserva = Math.max(nDeuda - nSinFecha, 1) + COLCHON_DEUDA
  for (let i = 0; i < reserva; i++) {
    const r = filas.length + 1
    push(COL_DEUDA.map((c) => (c ? celdaDeuda(c, r, doc0) : '')))
  }
  const doc1 = filas.length
  // El instrumento no puede salir del QUERY (vive en otra pestaña), así que se busca POR EL
  // COMPROBANTE que la propia fórmula derramó. Si la fila derramada está vacía, la celda queda vacía.
  for (let r = doc0; r <= doc1; r++) {
    filas[r - 1][7] = `=IF($A${r}="";"";IFERROR(INDEX(${CH}!$A$2:$A;MATCH($C${r};${CH}!$H$2:$H;0));IF(COUNTIF(${CH}!$E$2:$E;$A${r})>0;"hay cheque al proveedor, sin imputar";"sin cheque emitido")))`
    filas[r - 1][8] = `=IF($A${r}="";"";IFERROR(INDEX(${CH}!$B$2:$B;MATCH($C${r};${CH}!$H$2:$H;0));""))`
  }

  // ── LO QUE NO TIENE FECHA, DEBAJO Y CON NOMBRE ──────────────────────────────────────────────────
  // Ordenado por MONTO, que es el otro criterio que pidió el dueño. Va acá y no arriba porque una
  // factura sin fecha no compite por urgencia con una que vence el martes: compite por tamaño.
  const fSinFecha = push(['⚠ Y ESTAS NO TIENEN FECHA DE PAGO — no caen en ninguna semana del cash flow',
    `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")-SUM($F$${doc0}:$F$${doc1})`, '', '', '',
    'Estas filas no tienen FECHA DE CAJA (Compras, columna AD), que es la que usa el cash flow para ubicar el pago en una semana. Mientras siga vacía, el cuadro no las espera nunca. Aparte, hay once facturas con la palabra "Pendiente" escrita en la columna "Fecha prevista de pago" en vez de una fecha: es un defecto de carga, pero ésas sí tienen fecha de caja y el cash flow las ve.'])
  const sf0 = filas.length + 1
  for (let i = 0; i < Math.max(nSinFecha, 1) + 1; i++) {
    const r = filas.length + 1
    push(COL_DEUDA.map((c) => (c ? celdaDeuda(c, r, sf0, ORDEN.ordenSinFecha) : '')))
  }
  // NO SE RESERVAN FILAS VACÍAS ADEMÁS DE ÉSTAS. Cuando la tabla la llenaba un QUERY por derrame
  // había que dejarle lugar; ahora cada fila es una fórmula que devuelve "" si no le toca factura,
  // así que la reserva YA ESTÁ en el bucle de arriba. Dejar además filas en blanco producía el
  // agujero de seis filas que el detector de pantalla marcó como hueco.
  const sf1 = filas.length
  push([])

  // ── 2 · CUENTA CORRIENTE POR PROVEEDOR ──────────────────────────────────────────────────────────
  const b2 = push(['2 · CON QUIÉN SE GASTA Y QUIÉN TE FINANCIA — la cuenta corriente de cada proveedor'])
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
      // El CUIT con guiones: once dígitos seguidos no se leen. Formato único en lib/cuit.mjs.
      p.cuit ? formatearCuit(p.cuit) : '',
      `=COUNTIF(${COL_PROV};$A${f})`,
      `=SUMIF(${COL_PROV};$A${f};${COL_TOTAL})`,
      // AFIP: sale de _ARCA_RAW por CUIT, con el signo de cada comprobante. Antes era un número
      // pegado porque el libro de IVA no estaba en el archivo; ahora sí lo está.
      arcaPorCuit(`$B${f}`),
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
      // UN MINIFS SIN COINCIDENCIAS DEVUELVE 0, NO UN ERROR — así que el IFERROR no lo atrapa y el 0
      // con formato de fecha se muestra como "30/12/99". Eran veintidós filas de esta columna
      // mostrando un día de 1899 donde en realidad no hay ningún pago pendiente. Se corta con un
      // COUNTIFS previo: si no hay nada que contar, la celda queda vacía.
      `=IF(COUNTIFS(${COL_PROV};$A${f};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_FECHA};">0")=0;"";MINIFS(${COL_FECHA};${COL_PROV};$A${f};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_FECHA};">0"))`,
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
    totalLibro('Compras'), '', '',
    // LA DEUDA DEL TOTAL TAMBIÉN SE LIMITA A LO COMERCIAL. Con la deuda entera, los $7.484.627 del
    // plan de pago de ARCA caían en la fila "resto de proveedores comerciales" y la dejaban con más
    // deuda que los treinta primeros juntos. ARCA no es un proveedor: es un plan de pago de
    // impuestos y su lugar es la pestaña Impuestos y Financieros.
    RUBROS_COMERCIALES.map((r) => `SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_RUBRO};"${r}")`).join('+').replace(/^/, '='),
    '', '', '', '', '', '', '', ''])
  push([])

  // ── 5 · LAS NOTAS DE CRÉDITO ────────────────────────────────────────────────────────────────
  // La pregunta que el libro de IVA NO contesta: una nota de crédito puede ser una DEVOLUCIÓN (el
  // costo de la obra baja de verdad) o una REFACTURACIÓN (el costo sigue, sólo cambió de número y
  // de mes). Las dos son "tipo 3". Ver lib/notas-credito.mjs.
  const b5 = push([`5 · NOTAS DE CRÉDITO — ¿el costo desapareció, o sólo cambió de factura?`])
  push(['Una nota de crédito puede significar dos cosas opuestas y el libro de IVA las escribe igual. Si el proveedor volvió a facturar, el costo SIGUE existiendo: sólo cambió de número y muchas veces de mes. Darlo por ahorrado es el error caro. Cada nota se cruza contra las facturas del mismo CUIT: la que anula tiene que dar el MISMO importe al peso, la que la reemplaza da parecido.'])
  const cabNC = push(['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', 'Qué es', 'Anula la factura', 'La reemplaza', '', ''])
  const nc0 = filas.length + 1
  // El IMPORTE sale del libro por CUIT + número; lo que el OS aporta es la CLASIFICACIÓN (devolución
  // o refacturación), que no está en ningún libro y es criterio, no dato.
  for (const n of notasCredito) {
    const f = filas.length + 1
    push([n.proveedor, n.comprobante, n.fecha, arcaPorComprobante(`"${n.cuit ?? ''}"`, `$B${f}`, '-1'), n.que, n.anula, n.reemplaza, '', ''])
  }
  const nc1 = filas.length
  push(['TOTAL ACREDITADO', '', '', `=SUM($D${nc0}:$D${nc1})`, '', '', '', '', ''])
  push([])
  let cabAnu = 0, anu0 = 0, anu1 = 0
  if (anuladasCargadas.length) {
    push([`⚠ COMPRAS TIENE CARGADA LA FACTURA ANULADA — ${anuladasCargadas.length} caso(s)`])
    push(['El importe cierra, así que ningún control lo ve. Pero el comprobante que está cargado fue ANULADO por una nota de crédito y reemplazado por otro: el número no existe más para AFIP y el costo quedó imputado al mes viejo. Hay que corregir el N° de comprobante y la fecha en Compras.'])
    cabAnu = push(['Proveedor', 'Cargada en Compras', 'Fecha cargada', 'Importe', 'Corresponde', 'Fecha correcta', '', '', ''])
    anu0 = filas.length + 1
    for (const m of anuladasCargadas) {
      const f = filas.length + 1
      push([m.proveedor, m.cargada, m.fechaCargada, arcaPorComprobante(`"${m.cuit ?? ''}"`, `$B${f}`, '1'), m.corresponde, m.fechaCorrecta, '', '', ''])
    }
    anu1 = filas.length
    push([])
  }

  // ── 6 · LO QUE AFIP TIENE Y COMPRAS NO ──────────────────────────────────────────────────────────────
  const b6 = push([`6 · FACTURADO A LA EMPRESA QUE NO ESTÁ EN COMPRAS — ${faltanEnCompras.length} comprobantes`])
  push([`Sale del libro de IVA COMPRAS de ARCA, que el OS ya replica. Se cruza contra Compras por N° de comprobante y, cuando ese número no está cargado, por proveedor + importe. Lo que queda acá está facturado a la empresa con CAE y no lo ve ninguna otra pestaña: no es un error de fórmula, es carga que falta.`])
  const cabAfip = push(['Proveedor según AFIP', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '', '', '', ''])
  const afip0 = filas.length + 1
  for (const r of faltanEnCompras) {
    const f = filas.length + 1
    push([r.nombre, r.cuit ? formatearCuit(r.cuit) : '', r.comprobante, r.fecha,
      r.cuit ? arcaPorComprobante(`$B${f}`, `$C${f}`, '1') : r.importe, '', '', '', ''])
  }
  const afip1 = filas.length
  push(['TOTAL SIN CARGAR', '', '', '', `=SUM($E${afip0}:$E${afip1})`, '', '', '', ''])
  push([])

  // ── 7 · CONTROL Y AUDITORÍA DE CARGA ────────────────────────────────────────────────────────────
  const b7 = push(['7 · CONTROL Y AUDITORÍA DE CARGA'])
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
  push([])
  // ── LAS COLUMNAS DE PAGO SE CONTRADICEN ENTRE SÍ ────────────────────────────────────────────────
  // El auditor marcaba 10 columnas de Compras "cargadas y no leídas". Fui a ver si el OS debía
  // empezar a leerlas: NO. Ver lib/consistencia-compras.mjs — 128 filas dicen "Pagado" con el monto
  // pagado vacío. Leer una columna a medio llenar es peor que no leerla; lo que corresponde es
  // mostrar la contradicción para que se resuelva en el origen.
  push(['⚠ Deudas pendientes que no entran en la tabla de arriba',
    `=MAX(0;COUNTIFS(${COL_ESTADO};"${ESTADO_DEUDA}";${COL_TOTAL};"<>")-${nDeuda + COLCHON_DEUDA})`,
    `⚠ La tabla de deuda tiene ${nDeuda + COLCHON_DEUDA} filas reservadas (las ${nDeuda} deudas de hoy más ${COLCHON_DEUDA} de colchón). El agente la redimensiona cada 2 horas; este número avisa si entre dos corridas entró más deuda de la que entra.`])
  push(['⚠ Filas que dicen "Pagado" pero no dicen cuánto se pagó',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)>0)*(NOT(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)))`,
    '⚠ Cantidad de filas. La columna "Monto Pagado" está a medio llenar: el cash flow usa el TOTAL (columna O) justamente por eso. Si esta columna se completara, el cuadro podría pasar a lo efectivamente pagado.'])
  push(['  · cuánta plata representan',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(NOT(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))`,
    'Es lo que desaparecería del cuadro si el OS leyera "Monto Pagado" con la carga como está hoy.'])
  push(['⚠ Marcadas "Pagado" con un monto pagado MENOR al total',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>1))`,
    '⚠ Cantidad de filas. Acá el dato NO falta: contradice al estado. O quedó un saldo sin pagar, o el estado está mal.'])
  push(['  · el saldo que esas filas dicen que falta pagar',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>1)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)))`,
    'Si es deuda, no está en la cuenta corriente de arriba: la fila dice "Pagado".'])
  push(['⚠ Segunda cuota de un pago parcial que cae en otro mes',
    `=SUMPRODUCT((Compras!$S$4:$S="Parcial")*(IF(ISNUMBER(Compras!$W$4:$W);Compras!$W$4:$W;0)>0)*ISNUMBER(Compras!$V$4:$V)*(TEXT(IF(ISNUMBER(Compras!$V$4:$V);Compras!$V$4:$V;0);"yyyy-mm")<>TEXT(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0);"yyyy-mm"))*IF(ISNUMBER(Compras!$W$4:$W);Compras!$W$4:$W;0))`,
    '⚠ El cuadro suma el total en UNA fecha de caja, así que esta plata queda en el mes equivocado. Es error de criterio, no de carga: el cash flow es de caja y la segunda cuota sale otro mes.'])
  push([])
  push(['Plazo promedio ponderado de toda la compra comercial',
    `=IFERROR(SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))/SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0));"")`,
    'Días. Cada día que se estira este número es un día menos de descubierto al 62,78% anual.'])

  // ── 8 · LOS NÚMEROS DE ARCA, EN UN SOLO LUGAR ───────────────────────────────────────────────
  // Estos son los únicos números del archivo que NO salen del Sheet: salen del libro de IVA que el
  // OS replica desde ARCA. Viven acá —una pestaña réplica, con origen declarado— y el Cash Flow
  // Mensual los mira por RANGO CON NOMBRE en vez de tenerlos pegados. Ver lib/rangos-nombrados.mjs.
  const b8 = push(['8 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer'])
  push(['Cualquier pestaña que necesite estas cifras las referencia por nombre (ARCA_COMPRAS_TOTAL, ARCA_FALTAN_MONTO…). Si se copiaran, el día que ARCA traiga un comprobante nuevo habría dos verdades en el archivo y nadie sabría cuál mirar.'])
  const cabArca = push(['Concepto', 'Cantidad', 'Monto', '', '', '', '', '', ''])
  // LOS QUE SALEN DEL LIBRO VAN COMO FÓRMULA sobre _ARCA_RAW: se carga un comprobante en ARCA, el
  // agente refresca la réplica y estos números se mueven solos.
  const cuentaArca = (libro, signo) => `=SUMPRODUCT((${R}!$B$4:$B="${libro}")*(${R}!$F$4:$F=${signo}))`
  const fArcaN = push(['Comprobantes de compra (neto de notas de crédito)',
    cuentaArca('Compras', 1), totalLibro('Compras'), '', '', '', '', '', ''])
  const fArcaNotas = push(['  · notas de crédito (restan)',
    cuentaArca('Compras', -1), `=SUMPRODUCT((${R}!$B$4:$B="Compras")*(${R}!$F$4:$F=-1)*${IMPORTE})`, '', '', '', '', '', ''])
  // ═══ ESTOS DOS NO PUEDEN SER UNA FÓRMULA, Y ES IMPORTANTE DECIRLO ═══
  //
  // Salen del algoritmo de conciliación del OS (lib/cobertura-arca.mjs): cruza cada comprobante de
  // ARCA contra Compras por número normalizado y, cuando el número no está cargado, por proveedor +
  // importe. Esa normalización —quitar ceros, guiones y espacios de formatos que se escribieron de
  // seis maneras distintas— no se puede escribir en una fórmula de Sheets sin que dé un número
  // DISTINTO al real, y un número parecido pero equivocado es peor que uno declarado.
  //
  // Así que se pegan, y se declaran: son un resultado de conciliación, con su fecha de corte, igual
  // que el dato de origen de una réplica. Lo que NO se hace es disfrazarlos de fórmula.
  const fArcaEn = push(['  · cargados en Compras, por N° de comprobante', cruce.porNumero.length, cruce.totales.porNumero, '', '', '', '', '',
    `Conciliación del OS al ${new Date().toISOString().slice(0, 10)} — no es una fórmula: el cruce normaliza números escritos de seis formas distintas.`])
  const fArcaSinNum = push(['  · cargados SIN su N° de comprobante', cruce.porImporte.length, cruce.totales.porImporte, '', '', '', '', '',
    'Conciliación del OS: se encontraron por proveedor + importe porque el N° de comprobante no está cargado en Compras.'])
  // Los que faltan sí tienen fórmula: son exactamente las filas de la tabla de arriba.
  const fArcaFaltan = push(['  · ⚠ sin cargar en Compras',
    `=COUNTIF($A$${afip0}:$A$${afip1};"<>")`, `=SUM($E$${afip0}:$E$${afip1})`, '', '', '', '', '', ''])
  const fArcaVentas = push(['Comprobantes emitidos (ventas)',
    cuentaArca('Ventas', 1), totalLibro('Ventas'), '', '', '', '', '', ''])
  push([])

  // ── 9 · LO QUE LA EMPRESA FACTURÓ ───────────────────────────────────────────────────────────────
  push([`9 · FACTURAS EMITIDAS — control cruzado contra Cobranzas (esto es VENTAS, no proveedores)`])
  push(['Los números de las facturas que emitió la empresa, con su CAE, tal como los tiene AFIP. La última columna cruza contra Cobranzas por número: una factura emitida que Cobranzas no tiene es plata facturada que nadie está siguiendo.'])
  const cabEmi = push(['Cliente', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '¿Está en Cobranzas?', '', '', ''])
  const emi0 = filas.length + 1
  for (const r of emitidas) {
    push([r.nombre, r.cuit ? formatearCuit(r.cuit) : '', r.comprobante, r.fecha,
      // Igual que las compras: el importe sale del libro, no de un número calculado afuera. El
      // signo va en la fórmula porque una nota de crédito emitida también resta.
      arcaPorComprobanteVentas(`$C${filas.length + 1}`),
      `=IF(COUNTIF(Cobranzas!$E$5:$E$300;"*"&$C${filas.length + 1}&"*")>0;"✓ sí";"⚠ NO está en Cobranzas")`, '', '', ''])
  }
  const emi1 = filas.length
  push(['TOTAL FACTURADO', '', '', '', `=SUM($E${emi0}:$E${emi1})`, '', '', '', ''])
  push([])

  // ── 3 · FAMILIA × MES ───────────────────────────────────────────────────────────────────────────
  const b3 = push(['3 · EN QUÉ SE VA LA PLATA — por familia de material y por mes'])
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

  // ── 4 · FAMILIA × OBRA ──────────────────────────────────────────────────────────────────────────
  const b4 = push(['4 · EN QUÉ OBRA — la misma plata, abierta por obra'])
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

  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string'
    ? c.replaceAll('$TOTFAM', String(totFam)).replaceAll('$TOTPROV', String(fTotProv)).replaceAll('$TOTDEUDA', String(fTotProv))
    : c)))

  return { filas: resuelto, cabArca, marcas: { b1, b2, b3, b4, b5, b6, b7, b8, fin: filas.length }, fSinFecha, sf0, sf1, cuentas: [fCuenta1, fCuenta2], doc0, doc1, afip0, afip1, emi0, emi1, nc0, nc1, cabNC, cabAnu, anu0, anu1, fArcaN, fArcaNotas, fArcaEn, fArcaSinNum, fArcaFaltan, fArcaVentas, cabDoc, cabAfip, cabEmi, p0, p1, fSub, fTotProv, cabProv, fam0, fam1, totFam, obra0, obra1, cabFam, cabObra, ctrl, anchoObras: obras.length }
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
    const a = acc.get(nombre) ?? { nombre, total: 0, deuda: 0, n: 0, comercial: false, fam: new Map() }
    a.total += parseMonto(f?.[14]); a.n++
    // La DEUDA de cada proveedor, para poder ordenar por ella. El importe que se muestra sigue
    // saliendo de una fórmula sobre Compras: esto es sólo el criterio de orden.
    if (String(f?.[23] ?? '').trim().toLowerCase() === ESTADO_DEUDA.toLowerCase()) a.deuda += parseMonto(f?.[14])
    if (RUBROS_COMERCIALES.includes(String(f?.[28] ?? '').trim())) a.comercial = true
    const fam = String(f?.[30] ?? '').trim() || familiaDeMaterial({ concepto: f?.[11], detalle: f?.[10], proveedor: nombre })
    if (fam && fam !== SIN_FAMILIA) a.fam.set(fam, (a.fam.get(fam) ?? 0) + parseMonto(f?.[14]))
    acc.set(nombre, a)
  }
  // EL ORDEN LO PIDIÓ EL DUEÑO Y TIENE RAZÓN DE FONDO: "quiero que se respete algún orden, fecha de
  // pago, monto de deuda". Ordenar por lo COMPRADO ponía arriba a los proveedores a los que ya se
  // les pagó todo, y la pregunta de la tabla es a quién le debo. Primero los que tienen deuda, de
  // mayor a menor; después los demás por volumen, que ahí sí la pregunta es con quién se gasta.
  const comerciales = [...acc.values()].filter((p) => p.comercial)
    .sort((a, b) => (b.deuda - a.deuda) || (b.total - a.total))

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

  // EL CRUCE, UNA SOLA VEZ. La misma función que usa el bloque de cobertura del Cash Flow Mensual
  // (lib/cobertura-arca.mjs). Antes estaba escrito dos veces y las copias ya habían divergido.
  const filasParaCruce = compras
    .map((f, i) => ({ fila: i + 4, prov: normNombre(f?.[4]), total: parseMonto(f?.[14]) || parseMonto(f?.[12]), comprobante: normComprobante(f?.[7]) }))
    .filter((f) => f.prov && f.total > 0)
  // Cuántas deudas hay HOY: define cuántas filas reserva la tabla del bloque 1.
  const esDeuda = (f) => String(f?.[23] ?? '').trim().toLowerCase() === ESTADO_DEUDA.toLowerCase() && parseMonto(f?.[14])
  const nDeuda = compras.filter(esDeuda).length
  // Cuántas de esas NO tienen fecha de caja: es la reserva del segundo bloque. Se cuenta en vez de
  // fijarse un número grande, que es lo que dejaba dieciocho filas en blanco a la vista.
  const nSinFecha = compras.filter((f) => esDeuda(f) && !String(f?.[29] ?? '').trim()).length
  const cruce = cruzar(rArca, filasParaCruce, { norm: normNombre, clave: (c) => normComprobante(`${c.punto_venta}-${c.numero}`) })
  const chequeo = verificar(cruce)
  if (!chequeo.ok) {
    // Si los grupos no reconstruyen el total, hay comprobantes que se cayeron de la clasificación y
    // el cuadro estaría mostrando menos de lo que ARCA registró. Se avisa fuerte, no se sigue igual.
    console.error(`⚠ el cruce contra ARCA no cierra: diferencia ${chequeo.diferencia}, ${chequeo.contados} de ${chequeo.esperados} comprobantes clasificados`)
  }

  const faltanEnCompras = cruce.faltan
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
    cuit: a.nota.emisor_cuit,
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
      cuit: m.anulada.emisor_cuit,
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

  // La lista de deuda ya NO se calcula acá: es una fórmula QUERY viva en la propia pestaña. Ver el
  // bloque 2. Calcularla en JS obligaba a mapear filas del array a filas del Sheet, que es de donde
  // salió el bug de las referencias corridas.

  const obras = ['LA ESTRELLA', 'San Francisco', 'MESSINAS', 'ARCOR', 'Administracion', 'Almacen', 'Taller', 'SAINT GOBAIN']
  const g = grilla({ obras, proveedores, resto, faltanEnCompras, emitidas, arca, notasCredito, anuladasCargadas, cruce, nDeuda, nSinFecha })
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

  // ── LAS DOS COLUMNAS DE ORDEN DE LA DEUDA (AF y AG) ──────────────────────────────────────────
  //
  // Son lo que permite que cada celda de la tabla de deuda tenga su propia fórmula en vez de recibir
  // el derrame de un QUERY. Van fila por fila y no con ARRAYFORMULA porque el desempate necesita un
  // rango que CRECE con la fila: dos facturas que vencen el mismo día tienen que recibir puestos
  // distintos, o la tabla mostraría una dos veces y otra ninguna.
  const ultimaCompras = Math.min(hojaCompras.rows ?? 800, 900)
  const orden = []
  for (let f = 4; f <= ultimaCompras; f++) orden.push([formulaOrden(f, ESTADO_DEUDA), formulaOrdenSinFecha(f, ESTADO_DEUDA)])
  if ((hojaCompras.cols ?? 0) < 33) await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId: hojaCompras.sheetId, dimension: 'COLUMNS', length: 33 - (hojaCompras.cols ?? 0) } }])
  await google.batchUpdateValues(ID, [
    { range: 'Compras!AF3:AG3', values: [['Orden de pago (OS)', 'Orden sin fecha (OS)']] },
    { range: 'Compras!AF4', values: orden },
  ])
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: { sheetId: hojaCompras.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 31, endColumnIndex: 33 }, cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: { sheetId: hojaCompras.sheetId, startRowIndex: 3, endRowIndex: ultimaCompras, startColumnIndex: 31, endColumnIndex: 33 }, cell: { userEnteredFormat: E.celda('cantidad') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
  ])
  console.log(`  Compras: columnas de orden AF/AG escritas para ${orden.length} filas`)

  // ═══ LA PARTICIÓN ═══════════════════════════════════════════════════════════════════════════
  //
  // Ocho tablas sobre las mismas columnas no se pueden formatear bien: la E es "Modalidad" en el
  // bloque 1, "Facturado según AFIP" en el 2 e "Importe" en el 6. Cada tema pasa a su pestaña, con
  // sus columnas y sus anchos. Las fórmulas se reubican solas (lib/partir-pestana.mjs) y ninguna
  // fila se pierde: `filasHuerfanas` lo verifica antes de escribir una sola celda.
  const M = g.marcas
  const TRAMOS = [
    { titulo: NOMBRES.proveedores, desde: M.b1, hasta: M.b3 - 1,
      subtitulo: 'Todo lo de proveedores en un solo lugar: qué se debe y cuándo, la cuenta corriente de cada uno con su plazo, las notas de crédito, lo que ARCA facturó y Compras no tiene, y los controles de carga. Cada tabla arranca por el proveedor, así una sola grilla de columnas les sirve a todas.',
      anchos: [230, 132, 142, 104, 132, 132, 124, 172, 124, 124, 124, 124, 136, 116, 104, 240] },
    { titulo: NOMBRES.materiales, desde: M.b3, hasta: M.fin,
      subtitulo: 'En qué se va la plata: por familia de material y por mes, y la misma plata abierta por obra. Sale de la columna "Familia de material" de Compras, que el OS calcula con una sola definición.',
      anchos: [236, ...Array(12).fill(96), 116, 78, 116, 116] },
  ]

  // NINGUNA FILA SE PIERDE. Es la regla que el dueño puso después del rollback: "falta información
  // relevante de la que antes sí contaba". Las filas 1..b1-1 son el título de la pestaña vieja, que
  // se reemplaza por el título propio de cada pestaña nueva.
  const huerfanas = filasHuerfanas(g.filas, [...TRAMOS, { titulo: '(título viejo)', desde: 1, hasta: M.b1 - 1 }])
  if (huerfanas.length) {
    throw new Error(`${huerfanas.length} fila(s) quedarían afuera del reparto y se perderían: `
      + huerfanas.slice(0, 5).map((h) => `${h.fila} "${h.contenido}"`).join(' · '))
  }

  const FILA0 = 4   // título, subtítulo, una vacía, y recién ahí el contenido
  const partes = partir(g.filas, TRAMOS, { desdeFila: FILA0 })

  // LOS BLOQUES SE RENUMERAN POR PESTAÑA. Los rótulos vienen numerados en el orden en que se
  // construye la grilla (1, 2, 5, 6, 7, 8, 9 en proveedores y 3, 4 en materiales): dejarlos así
  // haría que la primera pestaña empiece en 1 y salte al 5, que se lee como si faltaran bloques.
  for (const parte of partes) {
    let n = 0
    for (const fila of parte.filas) {
      const t = String(fila?.[0] ?? '')
      if (/^\d+\s*·\s/.test(t)) fila[0] = t.replace(/^\d+\s*·\s/, `${++n} · `)
    }
  }

  // Dónde quedó cada fila vieja, para traducir los marcadores que usa el formateador.
  const donde = new Map()
  for (const t of TRAMOS) for (let f = t.desde; f <= t.hasta; f++) donde.set(f, { titulo: t.titulo, fila: f - t.desde + FILA0 })
  // `anchoObras` es una CANTIDAD de columnas, no un número de fila: traducirlo lo rompería.
  const NO_ES_FILA = new Set(['anchoObras'])
  const traducir = (titulo) => {
    const t = (n) => { const d = donde.get(n); return d && d.titulo === titulo ? d.fila : null }
    const out = {}
    for (const [k, v] of Object.entries(g)) {
      if (NO_ES_FILA.has(k) || k === 'marcas' || k === 'filas') out[k] = v
      else if (typeof v === 'number') out[k] = t(v)
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v.map(t).filter(Boolean)
      else out[k] = v
    }
    return out
  }

  let hojas = await google.getSheetMeta(ID)
  const escritas = []
  for (const [i, t] of TRAMOS.entries()) {
    const filasP = [[t.titulo.toUpperCase()], [t.subtitulo], [], ...partes[i].filas]
    const anchoP = Math.max(...filasP.map((f) => f.length), t.anchos.length)
    const cuadroP = filasP.map((f) => { const r = [...f]; while (r.length < anchoP) r.push(''); return r })

    let hoja = hojas.find((h) => h.title === t.titulo)
    if (!hoja) {
      await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: t.titulo, gridProperties: { rowCount: cuadroP.length + 30, columnCount: Math.max(anchoP + 2, 12) } } } }])
      hojas = await google.getSheetMeta(ID)
      hoja = hojas.find((h) => h.title === t.titulo)
      console.log(`  pestaña "${t.titulo}" creada`)
    }
    // La grilla tiene que alcanzar ANTES de escribir: un rango que excede la hoja hace fallar el
    // batch entero y deja la pestaña a medio escribir.
    const reqG = []
    if ((hoja.rows ?? 0) < cuadroP.length + 10) reqG.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: cuadroP.length + 30 } }, fields: 'gridProperties.rowCount' } })
    if ((hoja.cols ?? 0) < anchoP) reqG.push({ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: anchoP - (hoja.cols ?? 0) + 2 } })
    if (reqG.length) await google.spreadsheetBatchUpdate(ID, reqG)

    await google.clearValues(ID, `${refPestana(t.titulo)}!A1:Z${Math.max(cuadroP.length + 30, 250)}`)
    await google.batchUpdateValues(ID, [{ range: `${refPestana(t.titulo)}!A1:${letra(anchoP - 1)}${cuadroP.length}`, values: cuadroP }])

    const gP = { ...traducir(t.titulo), filas: cuadroP }
    await formatear(google, hoja.sheetId, gP, anchoP, cuadroP.length)

    // El título y el subtítulo de la pestaña, con el estándar.
    await google.spreadsheetBatchUpdate(ID, [
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: anchoP }, cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: anchoP }, cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
      { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
      // LOS ANCHOS SON EL MOTIVO DE TODO ESTO. Cada pestaña declara los suyos según lo que lleva su
      // única tabla, que es exactamente lo que no se podía hacer con las ocho apiladas.
      ...t.anchos.map((px, j) => ({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
      { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    ])
    escritas.push({ titulo: t.titulo, filas: cuadroP.length, sheetId: hoja.sheetId })
    console.log(`  ${t.titulo.padEnd(32)} ${String(cuadroP.length).padStart(4)} filas x ${anchoP} columnas`)
  }

  // Los nombres, DESPUÉS de escribir: se corren de fila según cuántas notas de crédito o
  // proveedores haya, y publicarlos antes los dejaría apuntando a la geometría vieja, en silencio.
  const hojaArca = escritas.find((e) => e.titulo === NOMBRES.proveedores)
  const tArca = traducir(NOMBRES.proveedores)
  const nombres = await publicar(google, ID, hojaArca.sheetId, [
    { name: N_ARCA.comprobantes, fila: tArca.fArcaN, col: 2 },
    { name: N_ARCA.total, fila: tArca.fArcaN, col: 3 },
    { name: N_ARCA.notasN, fila: tArca.fArcaNotas, col: 2 },
    { name: N_ARCA.notasMonto, fila: tArca.fArcaNotas, col: 3 },
    { name: N_ARCA.enComprasN, fila: tArca.fArcaEn, col: 2 },
    { name: N_ARCA.enComprasMonto, fila: tArca.fArcaEn, col: 3 },
    { name: N_ARCA.sinNumeroN, fila: tArca.fArcaSinNum, col: 2 },
    { name: N_ARCA.sinNumeroMonto, fila: tArca.fArcaSinNum, col: 3 },
    { name: N_ARCA.faltanN, fila: tArca.fArcaFaltan, col: 2 },
    { name: N_ARCA.faltanMonto, fila: tArca.fArcaFaltan, col: 3 },
    { name: N_ARCA.ventasN, fila: tArca.fArcaVentas, col: 2 },
    { name: N_ARCA.ventasMonto, fila: tArca.fArcaVentas, col: 3 },
  ].filter((x) => x.fila))
  console.log(`  ${nombres.nombres} rangos con nombre publicados: el Cash Flow los referencia en vez de copiarlos`)

  // ═══ VERIFICACIÓN ANTES DE RETIRAR LA PESTAÑA VIEJA ═══
  // No se borra nada hasta comprobar que las cuatro nuevas están escritas y sin errores.
  let err = 0
  for (const e of escritas) {
    const v = await google.readSheetValues(ID, `${refPestana(e.titulo)}!A1:T${e.filas}`)
    v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) { err++; if (err <= 8) console.log(`  ⚠ ${e.titulo}!${letra(j)}${i + 1} = ${c}`) } }))
  }
  console.log(err ? `\n⚠ ${err} celdas en error: NO retiro la pestaña vieja` : '\n✓ las cuatro pestañas, sin una sola celda en error')

  // Las pestañas que quedaron obsoletas: la original y las tres de la primera partición, que el
  // dueño pidió unificar el mismo día. Sólo se retiran si las nuevas quedaron sin una sola celda en
  // error — nunca se borra nada sobre un resultado que no se verificó.
  const OBSOLETAS = [PESTAÑA, 'Proveedores — Deuda', 'Proveedores — Cuenta Corriente', 'Proveedores — Control y ARCA']
  const meta2 = await google.getSheetMeta(ID)
  const retirar = OBSOLETAS.map((t) => meta2.find((h) => h.title === t)).filter(Boolean)
  if (!err && retirar.length) {
    await google.spreadsheetBatchUpdate(ID, retirar.map((h) => ({ deleteSheet: { sheetId: h.sheetId } })))
    console.log(`  retiradas: ${retirar.map((h) => `"${h.title}"`).join(', ')} — su contenido está en las dos de arriba`)
  }

  console.log(`  AFIP: ${g.afip1 - g.afip0 + 1} comprobantes facturados que Compras no tiene · ${g.emi1 - g.emi0 + 1} facturas emitidas listadas`)
}

async function formatear(google, sheetId, g, ancho, filas) {
  // LA PALETA SALE DEL ESTÁNDAR ÚNICO (lib/estilo-pestana.mjs), no de tres constantes locales.
  // Definir colores acá adentro es lo que hizo que cada pestaña terminara con la suya.
  const AZUL = E.COLOR.encabezado
  const GRIS = E.COLOR.total
  const ROJO = E.COLOR.alerta
  const r = (r0, r1, c0 = 0, c1 = ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  // ═══ PRIMERO SE BORRA TODO, DESPUÉS SE PINTA ═══
  //
  // POR QUÉ (21/07). Este formateador sólo APLICABA formatos, nunca los sacaba. Mientras el layout
  // no cambió, no se notó. El día que reordené los bloques, las bandas azules de los encabezados
  // viejos quedaron pintadas en las filas donde estaban antes —en el medio de la nada— y la pestaña
  // se volvió ilegible. El dueño: "esa pestaña es completamente inútil", y tenía razón.
  //
  // Un formato es tan persistente como un dato: si el cuadro se rehace entero, el formato también.
  const req = [
    { unmergeCells: { range: r(0, filas) } },
    {
      repeatCell: {
        range: r(0, filas),
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { bold: false, italic: false, fontSize: 10, foregroundColor: { red: 0, green: 0, blue: 0 } },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'CLIP',
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy',
      },
    },
    // Y la ALTURA vuelve al estándar. Va acá, ANTES que nada: una fila que quedó de 200px por un
    // formato viejo no se arregla sola, y las alturas específicas de más abajo tienen que ganarle
    // a ésta — el último pedido sobre el mismo rango es el que manda.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: filas }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
  ]
  // ═══ UN RANGO QUE NO EXISTE EN ESTA PESTAÑA SE DESCARTA, NO SE PINTA ═══
  //
  // Desde que la pestaña se partió en cuatro, este formateador corre una vez por pestaña con los
  // mismos marcadores: los bloques que se fueron a otra vienen en null. Sin este filtro, `r(null-1,
  // null)` produce un rango con NaN que la API acepta como "toda la hoja" y pinta cualquier cosa
  // encima. Es la misma clase de error que dejó bandas azules en el medio de la nada.
  const valido = (rg) => Number.isFinite(rg?.startRowIndex) && Number.isFinite(rg?.endRowIndex)
    && rg.startRowIndex >= 0 && rg.endRowIndex > rg.startRowIndex
  const fmt = (rg, fields, format) => { if (valido(rg)) req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } }) }

  fmt(r(0, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })

  // ═══ LOS TÍTULOS Y LAS EXPLICACIONES SE DETECTAN, NO SE ADIVINAN ═══
  //
  // Antes estaban a mano: `for (const i of [1, 4])`. Con nueve bloques que se reordenan, esos dos
  // números apuntaban a cualquier lado. Ahora se buscan por su forma —"N · TÍTULO" y la línea de
  // abajo— así que sobreviven a que los bloques cambien de orden.
  //
  // Y la explicación va MERGEADA a lo ancho con altura fija. Escrita en la columna A con ajuste de
  // línea, un párrafo de 300 caracteres en una columna de 250px hacía una fila de 200px de alto:
  // eso es el bloque azul gigante que hizo que la pestaña se volviera ilegible.
  const esTitulo = (t) => /^\d+\s*·\s/.test(String(t ?? '').trim())
  const titulos = []
  for (let i = 0; i < g.filas.length; i++) if (esTitulo(g.filas[i]?.[0])) titulos.push(i)

  for (const i of titulos) {
    fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, fontSize: 12 }, backgroundColor: { red: 0.94, green: 0.95, blue: 0.97 } })
    // La línea de abajo es la explicación del bloque: sólo si tiene texto largo y nada en B.
    const sig = g.filas[i + 1]
    if (sig && String(sig[0] ?? '').length > 40 && !String(sig[1] ?? '').trim()) {
      fmt(r(i + 1, i + 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
        { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' })
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } })
    }
  }
  // El subtítulo del encabezado de la pestaña, igual.
  if (String(g.filas[1]?.[0] ?? '').length > 40) {
    fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
      { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } })
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
  for (const [a, b] of [[g.afip0, g.afip1], [g.emi0, g.emi1]]) {
    fmt({ ...r(a - 1, b, 1, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  }
  // EL BLOQUE 1 CAMBIÓ DE COLUMNAS al pasar a QUERY. Ahora:
  //   A fecha de pago (la que ordena) · B proveedor · C comprobante · D fecha factura
  //   E modalidad · F importe · G obra · H instrumento · I N° de cheque
  // La fecha SIN formato se ve como "46108" —el número de serie— y ya pasó seis veces en el
  // archivo: un control que suma no ve un defecto de pantalla.
  // LAS DOS TABLAS DE DEUDA SE FORMATEAN IGUAL. La de abajo —las que no tienen fecha de caja— derrama
  // las MISMAS columnas que la de arriba, así que si sólo se formatea la primera, la segunda hereda
  // el formato moneda de la columna entera y las fechas salen como "$46.198". Pasó, se vio en la
  // pantalla y por eso las dos van juntas en este bucle en vez de repetidas a mano.
  for (const [a, b] of [[g.doc0, g.doc1], [g.sf0, g.sf1]]) {
    fmt({ ...r(a - 1, b, 0, 1) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER', textFormat: { bold: true } })
    fmt({ ...r(a - 1, b, 3, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(a - 1, b, 1, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
    fmt({ ...r(a - 1, b, 4, 5) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(a - 1, b, 6, 9) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 }, horizontalAlignment: 'LEFT' })
  }
  // ── LOS DEFECTOS DE PANTALLA QUE ENCONTRÓ auditar-pantalla.mjs (21/07) ───────────────────────
  //
  // Todos son celdas que quedaron con el formato MONEDA que se aplica a la columna entera al
  // principio, y a las que nadie les devolvió el suyo. No cambian un total en un peso: hacen que la
  // pestaña se lea mal, que es lo que el dueño señaló tres veces. Ninguno los veía porque los
  // controles del archivo suman, y sumar no ve un encabezado con formato de plata.
  //
  // Los encabezados de las tablas de notas de crédito y de facturas anuladas: mostraban "Fecha",
  // "Importe" y "Qué es" como si fueran importes.
  for (const c of [g.cabNC, g.cabAnu, g.cabArca]) {
    if (c) fmt({ ...r(c - 1, c, 0, 8) }, 'userEnteredFormat', E.encabezado())
  }
  // UNA CANTIDAD DE COMPROBANTES NO ES PLATA. La columna B del bloque de ARCA mostraba "$16" donde
  // dice cuántas facturas emitidas hay: el formato moneda de la columna entera se lo comía.
  if (g.fArcaN && g.fArcaVentas) fmt({ ...r(g.fArcaN - 1, g.fArcaVentas, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: E.NUM.cantidad, horizontalAlignment: 'CENTER' })
  // Las notas sueltas que viven al lado de un número: la de la fila del total adeudado y la del
  // "resto de proveedores". Van en TEXT y con el estilo de nota, no en moneda.
  // La nota que explica el total adeudado. Se busca por su rótulo: estaba clavada en la fila 6 y al
  // partir la pestaña esa fila pasó a ser otra cosa.
  const fTotAd = g.filas.findIndex((f) => /^TOTAL ADEUDADO/.test(String(f?.[0] ?? '')))
  if (fTotAd >= 0) fmt({ ...r(fTotAd, fTotAd + 1, 5, 9) }, 'userEnteredFormat', E.nota())
  fmt({ ...r(g.fSub, g.fSub + 1, 15, 16) }, 'userEnteredFormat', E.nota())
  // La columna de fecha del bloque de ARCA, que mostraba el serial como plata.
  fmt({ ...r(g.afip0 - 1, g.afip1, 3, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: E.NUM.fecha, horizontalAlignment: 'CENTER' })

  // El rótulo del bloque de las sin fecha, en rojo de alerta.
  fmt({ ...r(g.fSinFecha - 1, g.fSinFecha, 0, 6) }, 'userEnteredFormat', E.alerta())
  fmt({ ...r(g.fSinFecha - 1, g.fSinFecha, 1, 2) }, 'userEnteredFormat.numberFormat', { numberFormat: E.NUM.moneda })
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
