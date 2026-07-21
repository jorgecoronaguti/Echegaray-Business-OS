#!/usr/bin/env node
// LA PESTAÑA CAJA — DISPONIBILIDADES, COMPROMISOS EMITIDOS Y LÍNEAS DE CRÉDITO.
//
// POR QUÉ EXISTE (20/07). Era la única pestaña vacía del archivo, y por eso el número más grande del
// cuadro no significaba nada: "flujo acumulado −$433.811.452" es un DELTA, no un saldo. Sin saldo
// inicial, un cash flow dice cuánto se mueve pero no puede contestar la única pregunta que se le
// hace: qué día te quedás sin plata.
//
// LO QUE ESTA PESTAÑA NO HACE, A PROPÓSITO: no lleva movimientos. Cada cobro está en Cobranzas, cada
// pago en Compras y cada cheque en Cheques Emitidos. Un libro de movimientos acá sería la tercera
// copia de la misma plata, y el día que no coincidan nadie sabría cuál tiene razón. Esta pestaña
// aporta el ÚNICO dato que no existe en ninguna otra: cuánta plata hay de verdad.
//
// LA DISTINCIÓN QUE MÁS IMPORTA, Y QUE EL PEDIDO ORIGINAL MEZCLABA: el cupo disponible de la tarjeta
// NO es efectivo. Es capacidad de endeudarse. Sumarlo a las disponibilidades sería contar como plata
// propia una deuda que todavía no se tomó — el error clásico que hace que una empresa se crea
// líquida el día antes de no poder pagar sueldos. Por eso va en su propio bloque, DEBAJO del total,
// y no suma. Misma lógica, al revés, con los cheques emitidos y no debitados: esa plata está en la
// cuenta pero ya no es tuya, así que resta.
//
// NOMBRES DE PLAN DE CUENTAS, NO COLOQUIALES. "Caja grande" es Caja en pesos; "caja chica" es Fondo
// fijo; los cheques de terceros que todavía no se depositaron son Valores a depositar. Son los
// rótulos que usa cualquier contador argentino, y el día que esto se cruce con la contabilidad los
// dos lados van a estar hablando el mismo idioma.
//
// ═══ DOS MONEDAS, DOS NÚMEROS (21/07) ═══
//
// "En el banco se cuenta con un saldo en dólares" y "la tarjeta tiene disponible en pesos y
// dólares". Cada fila declara su moneda y guarda el importe EN MONEDA DE ORIGEN —el hecho, lo que
// dice el extracto— y aparte su equivalente en pesos, que es un cálculo y vale lo que valga el tipo
// de cambio de hoy. El total suma pesos porque un total tiene que ser de una sola moneda, y hay una
// línea que muestra cuánto de esa plata está en dólares: esa es la exposición al tipo de cambio, y
// es una decisión de tesorería, no un detalle de presentación.
//
// ═══ EL DETALLE DE LOS CHEQUES EN CARTERA (21/07) ═══
//
// "Valores a depositar: quiero un agrupar +/- con la información de esos cheques". Un total de
// $30.000.000 no se puede verificar ni gestionar; hay que saber de quién es cada cheque y qué día
// entra. El detalle se arma con REFERENCIAS a las filas de Cobranzas (=Cobranzas!$M$37), nunca
// copiando el importe: si mañana corrigen un cheque allá, acá cambia solo. Va colapsado.
//
// IDEMPOTENCIA CON DATO HUMANO ADENTRO: esta es la ÚNICA pestaña del archivo donde se carga un
// número a mano, y el agente la reescribe cada 2 horas. Antes de reescribirla se leen los valores
// cargados y se vuelven a poner en su lugar, buscándolos POR EL NOMBRE DE LA CUENTA y no por número
// de fila. Si se hiciera por fila, agregar una cuenta correría todo y los saldos quedarían en la
// cuenta equivocada, en silencio. Y las COLUMNAS se ubican por su rótulo, no por su letra: por eso
// agregar la columna de moneda no perdió ningún saldo ya cargado.
//
//   node orquestador/scripts/caja-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { CUENTAS, CARGA, ALIAS, TIPO_CAMBIO, RANGO_TC, filaDeCuenta, echeqsEnCartera } from '../lib/caja-disponibilidades.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'
const DRY = process.argv.includes('--dry')

// A concepto · B moneda · C importe en origen · D tipo de cambio · E importe en pesos ·
// F fecha · G antigüedad · H origen del dato · I declarado por
const ANCHO = 9
const C_IMP = 'C', C_TC = 'D', C_PESOS = 'E'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/** Dónde quedó cada línea del Cash Flow Mensual, buscada POR RÓTULO y no por número de fila. */
function ubicarEnCashFlow(colA, rotulo) {
  const i = colA.findIndex((f) => String(f?.[0] ?? '').trim().toLowerCase().startsWith(rotulo.toLowerCase()))
  return i < 0 ? null : i + 1
}

const fecha = (s) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(s ?? '').trim())
  if (!m) return null
  const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(a, Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(+d) ? null : d
}

const numero = (s) => {
  const t = String(s ?? '').replace(/[^\d,.-]/g, '')
  if (!t) return NaN
  return Number(t.replace(/\./g, '').replace(',', '.'))
}

/**
 * Lo que el dueño ya cargó, rescatado ANTES de reescribir.
 *
 * LAS COLUMNAS SE UBICAN POR SU RÓTULO. La versión anterior de la pestaña tenía el saldo en la B;
 * ésta lo tiene en la C porque se agregó la moneda. Un rescate por letra de columna habría leído
 * "USD" donde esperaba un importe y habría borrado los cuatro saldos cargados sin decir nada.
 *
 * SE RESCATA LO QUE LA PERSONA ESCRIBIÓ, NO LO QUE MUESTRA LA PANTALLA. Leyendo el valor formateado,
 * el Fondo fijo en $0 volvía como el texto "—" (así lo dibuja el formato de moneda) y la celda
 * quedaba en #VALUE!, que se propagaba al TOTAL. El valor ingresado es el hecho; el formato es
 * presentación.
 */
function rescatar(previo) {
  const cargado = new Map()
  let mapa = null
  const leer = (c) => {
    const v = c?.formula ?? (c?.numero ?? c?.valor ?? '')
    // Un guion solo es cómo el formato de moneda dibuja un cero, nunca algo que alguien tipeó.
    // Quedó escrito como texto en una corrida anterior y hay que devolverlo a lo que era.
    return typeof v === 'string' && /^[—–-]$/.test(v.trim()) ? 0 : v
  }
  for (const fila of previo) {
    const f = fila.map(leer)
    const a = String(fila?.[0]?.valor ?? '').trim()
    if (/^(cuenta|línea|linea|concepto)$/i.test(a)) {
      mapa = { imp: -1, fecha: -1, origen: -1, quien: -1 }
      fila.forEach((c, i) => {
        const t = String(c?.valor ?? '').trim().toLowerCase()
        if (mapa.imp < 0 && /^(saldo|importe|cotizaci)/.test(t)) mapa.imp = i
        if (mapa.fecha < 0 && /^fecha/.test(t)) mapa.fecha = i
        if (mapa.origen < 0 && /^origen/.test(t)) mapa.origen = i
        if (mapa.quien < 0 && /^declarado/.test(t)) mapa.quien = i
      })
      continue
    }
    if (!a || !mapa || !filaDeCuenta(a)) continue
    const nombre = ALIAS.get(a) ?? a
    const v = (i) => (i >= 0 ? (f?.[i] ?? '') : '')
    cargado.set(nombre, { saldo: v(mapa.imp), fecha: v(mapa.fecha), origen: v(mapa.origen), quien: v(mapa.quien) })
  }
  return cargado
}

function grilla(cargado, refs, cheques) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  // El valor que el dueño ya había cargado para una cuenta, o vacío la primera vez.
  const previo = (cuenta, campo) => cargado.get(cuenta)?.[campo] ?? ''

  push(['CAJA Y BANCOS — DISPONIBILIDADES'])
  push(['Esta es la ÚNICA pestaña del archivo donde se carga un número a mano: cuánta plata hay. Todo lo demás se calcula solo. Las celdas AMARILLAS son para completar; el resto son fórmulas y se pisan en cada corrida del agente. Lo que está en dólares se carga EN DÓLARES: la conversión a pesos la hace la planilla.'])
  push()

  // ── 0 · TIPO DE CAMBIO ──────────────────────────────────────────────────────────────────────────
  // Se define UNA sola vez y acá, que es donde se usa. Cualquier otra fórmula del archivo que
  // necesite convertir dólares referencia el rango con nombre, no esta celda por su fila.
  push(['0 · TIPO DE CAMBIO — con qué se valúa lo que está en dólares'])
  const cab0 = push(['Concepto', '', 'Cotización', '', '', 'Fecha', '', 'Origen del dato', 'Declarado por'])
  const fRef = push([TIPO_CAMBIO.referencia.nombre, '', TIPO_CAMBIO.referencia.formula, '', '', '=TODAY()', '', TIPO_CAMBIO.referencia.origen, 'Se calcula solo'])
  const fDec = push([TIPO_CAMBIO.declarado.nombre, '', previo(TIPO_CAMBIO.declarado.nombre, 'saldo'), '', '',
    previo(TIPO_CAMBIO.declarado.nombre, 'fecha'), '', previo(TIPO_CAMBIO.declarado.nombre, 'origen') || TIPO_CAMBIO.declarado.origen,
    previo(TIPO_CAMBIO.declarado.nombre, 'quien')])
  const fTC = push([TIPO_CAMBIO.uso.nombre, '', `=IF(${C_IMP}${fDec}<>"";${C_IMP}${fDec};${C_IMP}${fRef})`, '', '', '', '', TIPO_CAMBIO.uso.origen, 'Se calcula solo'])
  const TC = `$${C_IMP}$${fTC}`
  push()

  // ── 1 · DISPONIBILIDADES ────────────────────────────────────────────────────────────────────────
  push(['1 · DISPONIBILIDADES — lo que hay HOY'])
  const cab1 = push(['Cuenta', 'Moneda', 'Saldo en moneda de origen', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo', 'Antigüedad', 'Origen del dato', 'Declarado por'])
  const d0 = filas.length + 1
  const amarillas = []
  for (const c of CUENTAS) {
    const f = filas.length + 1
    if (!c.formula) amarillas.push(f)
    push([
      c.nombre,
      c.moneda,
      // Una cuenta con fórmula NO se carga a mano: el OS la sabe calcular y pisarla sería perder
      // el dato. Sólo las que el OS no puede saber quedan como celda de carga.
      c.formula ?? previo(c.nombre, 'saldo'),
      // El tipo de cambio se muestra sólo si hay algo que convertir: una cotización sola al lado de
      // una celda vacía es ruido que se lee como si hubiera un saldo.
      c.moneda === 'USD' ? `=IF(ISNUMBER(${C_IMP}${f});${TC};"")` : '',
      `=IF(${C_IMP}${f}="";"";${C_IMP}${f}*IF(${C_TC}${f}="";1;${C_TC}${f}))`,
      c.formula ? '=TODAY()' : previo(c.nombre, 'fecha'),
      // La antigüedad no es decorativa: un saldo de hace 20 días avisando que tiene 20 días vale
      // muchísimo más que el mismo saldo mudo. Arriba de una semana, avisa.
      `=IF(F${f}="";"⚠ sin cargar";IF(TODAY()-F${f}>7;"⚠ "&TEXT(TODAY()-F${f};"0")&" días";TEXT(TODAY()-F${f};"0")&" días"))`,
      previo(c.nombre, 'origen') || c.origenSugerido,
      previo(c.nombre, 'quien'),
    ])
  }
  const d1 = filas.length

  // EL DETALLE DE LOS CHEQUES EN CARTERA, colapsable. Va DESPUÉS de las cuentas y antes del total,
  // así que no entra en el rango que suma: sumaría dos veces la misma plata.
  const ultima = CUENTAS[CUENTAS.length - 1]
  if (ultima.detalle && ultima.detalle !== 'echeq_en_cartera') throw new Error('el detalle desplegable sólo está resuelto para los echeq en cartera')
  const fValores = d1
  const g0 = filas.length + 1
  for (const ch of cheques) {
    const f = filas.length + 1
    push([
      `=IFERROR("      · "&Cobranzas!$G$${ch.fila};"")`,
      'ARS',
      `=Cobranzas!$M$${ch.fila}`,
      '',
      `=IF(${C_IMP}${f}="";"";${C_IMP}${f})`,
      `=Cobranzas!$Q$${ch.fila}`,
      `=IF(F${f}="";"";"entra en "&TEXT(F${f}-TODAY();"0")&" días")`,
      `=IFERROR("Cobranzas fila ${ch.fila} · comprobante "&Cobranzas!$E$${ch.fila};"Cobranzas fila ${ch.fila}")`,
      'Se calcula solo',
    ])
  }
  const gControl = push(['      ⇒ Control: el detalle tiene que sumar igual que el total de arriba', '',
    cheques.length ? `=SUM(${C_IMP}${g0}:${C_IMP}${g0 + cheques.length - 1})-${C_IMP}${fValores}` : `=-${C_IMP}${fValores}`,
    '', '', '', '',
    'Distinto de cero = hay un cheque en Cobranzas que el detalle no encontró. El total de arriba es el que manda.', 'Se calcula solo'])
  const g1 = filas.length

  const fTotal = push(['TOTAL DISPONIBILIDADES', '', '', '', `=SUM(${C_PESOS}${d0}:${C_PESOS}${d1})`, '', '', '', 'Es el "Efectivo al inicio" que usan los dos cash flows.'])
  // La exposición al tipo de cambio. No es un detalle de presentación: decide si conviene vender o
  // quedarse. Sale de las mismas filas de arriba, no se carga aparte.
  const fUSD = push(['De los cuales, en moneda extranjera', 'USD',
    `=SUMIF($B$${d0}:$B$${d1};"USD";$${C_IMP}$${d0}:$${C_IMP}$${d1})`, `=${TC}`,
    `=${C_IMP}${filas.length + 1}*${C_TC}${filas.length + 1}`, '', '',
    'Exposición al tipo de cambio: esta parte de la caja cambia de valor sin que entre ni salga un peso.', 'Se calcula solo'])
  push()

  // ── 2 · COMPROMISOS YA EMITIDOS ─────────────────────────────────────────────────────────────────
  push(['2 · COMPROMISOS YA EMITIDOS — plata que sigue en la cuenta pero ya no es tuya'])
  const fCh = push(['Cheques de pago diferido emitidos, no debitados', 'ARS',
    // Sale de la propia pestaña de cheques: acá no se copia ningún importe.
    `=SUMPRODUCT((UPPER('${refs.cheques}'!$K$2:$K$400)<>"SI")*IF(ISNUMBER('${refs.cheques}'!$F$2:$F$400);'${refs.cheques}'!$F$2:$F$400;0))`,
    '', `=${C_IMP}${filas.length + 1}`, '', '', `Pestaña ${refs.cheques}, columna DEBITADO distinta de SI`, 'Se calcula solo'])
  const fNeta = push(['DISPONIBILIDAD NETA', '', '', '', `=${C_PESOS}${fTotal}-${C_PESOS}${fCh}`, '', '', '',
    'Lo que queda después de cubrir los cheques ya firmados. Es el número con el que conviene decidir.'])
  push()

  // ── 3 · LÍNEAS DE CRÉDITO ───────────────────────────────────────────────────────────────────────
  push(['3 · LÍNEAS DE CRÉDITO — NO son efectivo, y por eso no suman arriba'])
  push(['El margen de una tarjeta es capacidad de endeudarse, no plata propia. Sumarlo a las disponibilidades es el error que hace que una empresa se crea líquida el día antes de no poder pagar sueldos. El límite en pesos y el límite en dólares son dos cupos distintos: mezclarlos daría un margen que no existe en ninguna de las dos monedas.'])
  const cab3 = push(['Línea', 'Moneda', 'Importe en moneda de origen', 'Tipo de cambio', 'Importe en pesos', '', '', 'Origen del dato', 'Declarado por'])

  const carga = (nombre, moneda, origenSugerido) => {
    const f = filas.length + 1
    amarillas.push(f)
    return push([nombre, moneda, previo(nombre, 'saldo'), moneda === 'USD' ? `=IF(ISNUMBER(${C_IMP}${f});${TC};"")` : '', enPesos(f), '', '',
      previo(nombre, 'origen') || origenSugerido, previo(nombre, 'quien')])
  }
  const enPesos = (f) => `=IF(ISNUMBER(${C_IMP}${f});${C_IMP}${f}*IF(${C_TC}${f}="";1;${C_TC}${f});"")`

  const fLimP = carga(CARGA.limitePesos, 'ARS', 'Resumen de la tarjeta')
  const fConsP = push(['Tarjeta de crédito — consumos en pesos pendientes de débito', 'ARS',
    `=SUMPRODUCT((UPPER('${refs.tarjeta}'!$J$3:$J$400)<>"SI")*IF(ISNUMBER('${refs.tarjeta}'!$E$3:$E$400);'${refs.tarjeta}'!$E$3:$E$400;0))`,
    '', enPesos(filas.length + 1), '', '', `Pestaña ${refs.tarjeta}, columna DEBITADO distinta de SI`, 'Se calcula solo'])
  const fMarP = push(['⇒ Margen disponible en pesos', 'ARS',
    `=IF(${C_IMP}${fLimP}="";"⚠ falta el límite acordado";${C_IMP}${fLimP}-${C_IMP}${fConsP})`,
    '', enPesos(filas.length + 1), '', '', '', 'Cuánto se puede seguir comprando sin efectivo. Es un colchón, no un activo.'])

  const fLimD = carga(CARGA.limiteDolares, 'USD', 'Resumen de la tarjeta, sección en dólares')
  // POR QUÉ ESTE SE CARGA A MANO Y EL DE PESOS NO: la pestaña Tarjeta de Credito no tiene columna de
  // moneda, así que los consumos en dólares no están cargados en ningún lado del archivo. Sacar el
  // número de ahí sería inventarlo. Hasta que la pestaña distinga moneda, entra a mano y se dice.
  const fConsD = carga(CARGA.consumoDolares, 'USD', 'Resumen de la tarjeta. La pestaña Tarjeta de Credito no distingue moneda todavía, así que este dato no se puede calcular solo.')
  const fMarD = push(['⇒ Margen disponible en dólares', 'USD',
    `=IF(${C_IMP}${fLimD}="";"⚠ falta el límite acordado";${C_IMP}${fLimD}-IF(ISNUMBER(${C_IMP}${fConsD});${C_IMP}${fConsD};0))`,
    `=IF(ISNUMBER(${C_IMP}${filas.length + 1});${TC};"")`, enPesos(filas.length + 1), '', '', '', 'El cupo en dólares es otro cupo: no se puede usar para pagar un proveedor en pesos.'])
  push(['⇒ Margen total disponible, expresado en pesos', '', '', '',
    `=IF(AND(NOT(ISNUMBER(${C_PESOS}${fMarP}));NOT(ISNUMBER(${C_PESOS}${fMarD})));"⚠ faltan los límites acordados";IF(ISNUMBER(${C_PESOS}${fMarP});${C_PESOS}${fMarP};0)+IF(ISNUMBER(${C_PESOS}${fMarD});${C_PESOS}${fMarD};0))`,
    '', '', '', 'Sigue sin ser efectivo. Está acá para saber con cuánto aire se cuenta, no para sumarlo a la caja.'])
  push()

  // ── 4 · CONCILIACIÓN ────────────────────────────────────────────────────────────────────────────
  push(['4 · CONCILIACIÓN — ¿el cash flow explica la plata que hay?'])
  push(['El control que mide si el archivo sirve. Si la diferencia es chica, el cuadro es confiable. Si es grande, hay plata moviéndose fuera del Sheet y hay que buscarla antes de decidir con estos números.'])
  const fDecl = push(['Disponibilidad declarada (bloque 1)', '', '', '', `=${C_PESOS}${fTotal}`, '', '', '', 'Lo que dicen el extracto y el arqueo.'])
  const fProy = push(['Efectivo al cierre que proyecta el Cash Flow al mes de la fecha del saldo', '', '', '',
    refs.cierre
      ? `=IFERROR(INDEX('Cash Flow Mensual'!$B$${refs.cierre}:$M$${refs.cierre};MATCH(EOMONTH(MAX($F$${d0}:$F$${d1});0);ARRAYFORMULA(EOMONTH('Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab};0));0));"⚠ sin saldo cargado")`
      : '⚠ no encontré la línea de cierre en el Cash Flow Mensual',
    '', '', 'Cash Flow Mensual, línea "Efectivo y equivalentes al cierre"', 'Se calcula solo'])
  push(['⇒ Diferencia', '', '', '', `=IFERROR(${C_PESOS}${fDecl}-${C_PESOS}${fProy};"")`, '', '', '',
    'Distinto de cero = movimientos que el archivo no ve. No es un error de fórmula: es trabajo de carga.'])
  push()

  // ── 5 · ALERTA ──────────────────────────────────────────────────────────────────────────────────
  push(['5 · ALERTA DE CAJA — las dos fechas que se usan para decidir'])
  const fMin = push(['Caja mínima deseada', '', '', '', "=N('01_Valores Iniciales'!$B$3)", '', '', '01_Valores Iniciales', ''])
  const rangoCierre = refs.cierre ? `'Cash Flow Mensual'!$B$${refs.cierre}:$M$${refs.cierre}` : null
  const rangoMes = refs.cab ? `'Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab}` : null
  const primerMes = (cond) => (rangoCierre
    ? `=IFERROR(TEXT(INDEX(${rangoMes};MATCH(1;ARRAYFORMULA(--((${rangoCierre}+$${C_PESOS}$${fTotal})${cond})),0));"mmmm yyyy");"ningún mes del año")`
    : '⚠ falta la línea de cierre')
  push(['Primer mes por debajo de la caja mínima', '', '', '', primerMes(`<$${C_PESOS}$${fMin}`), '', '', '',
    'Suma el saldo real de hoy a la proyección del cash flow. Sin saldo cargado, arranca de cero y la fecha es más pesimista de lo real.'])
  push(['Primer mes con caja negativa', '', '', '', primerMes('<0'), '', '', '',
    '⚠ Ojo: los ingresos de octubre en adelante están en $0 porque no hay obra facturada. Esta fecha es un PISO, no un pronóstico.'])
  push()
  push(['CÓMO SE ACTUALIZA ESTO'])
  push(['· Los saldos (las celdas amarillas) se cargan a mano o pegando el extracto en el chat: el OS lo lee y los completa. Lo que está en dólares se carga en dólares.'])
  push(['· No hay integración con el banco. La API de banca empresa se pide al banco y hoy no está contratada — hasta entonces, el saldo entra por extracto, captura o arqueo.'])
  push(['· El tipo de cambio se actualiza solo con la cotización del día. Si operás a otro (MEP, tarjeta), cargalo en la fila "Dólar declarado" y ése pasa a mandar.'])
  push(['· Todo lo demás de esta pestaña se recalcula solo cada 2 horas junto con el resto del archivo.'])

  return { filas, d0, d1, g0, g1, gControl, cab0, cab1, cab3, fTC, fRef, fDec, fTotal, fUSD, fNeta, fCh, fLimP, fLimD, fConsD, fMarP, fMarD, fDecl, amarillas }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)
  const tab = hoja.title

  const previo = await google.readSheetGrid(ID, `${tab}!A1:I80`).catch(() => ({ filas: [] }))
  const cargado = rescatar(previo.filas ?? [])

  // Las referencias a otras pestañas se resuelven por rótulo, no se adivinan.
  const colA = await google.readSheetValues(ID, 'Cash Flow Mensual!A1:A80')
  const refs = {
    cheques: hallarPestana(hojas, 'Cheques').title,
    tarjeta: hallarPestana(hojas, 'Tarjeta').title,
    cierre: ubicarEnCashFlow(colA, 'Efectivo y equivalentes al cierre'),
    cab: ubicarEnCashFlow(colA, 'Período'),
  }

  // Qué cheques de terceros siguen en cartera HOY. Se leen para saber QUÉ FILAS referenciar; los
  // importes no se copian: cada fila del detalle apunta a su fila de Cobranzas.
  const cob = await google.readSheetValues(ID, 'Cobranzas!A1:R300')
  const cheques = echeqsEnCartera(
    cob.map((f, i) => ({ fila: i + 1, forma: f?.[13], fecha: fecha(f?.[16]), importe: numero(f?.[12]) })),
    new Date(),
  )

  const g = grilla(cargado, refs, cheques)
  console.log(`${tab}: ${g.filas.length} filas · ${CUENTAS.length} cuentas · ${cargado.size} con dato ya cargado`)
  console.log(`  cheques de terceros en cartera: ${cheques.length} (filas de Cobranzas ${cheques.map((c) => c.fila).join(', ') || '—'})`)
  console.log(`  cierre del Cash Flow en la fila ${refs.cierre ?? '?'} · encabezado en la ${refs.cab ?? '?'}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  await google.clearValues(ID, `${tab}!A1:Z90`)
  await google.batchUpdateValues(ID, [{ range: `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g)
  await rangoConNombre(google, hoja.sheetId, g.fTC)

  const v = await google.readSheetValues(ID, `${tab}!A1:I${g.filas.length}`)
  // El dólar declarado es OPCIONAL: vacío significa "uso la cotización del día", no un dato faltante.
  const sinCargar = v.filter((f) => {
    const a = String(f?.[0] ?? '').trim()
    return filaDeCuenta(a) && a !== TIPO_CAMBIO.declarado.nombre && !String(f?.[2] ?? '').trim()
  })
  console.log(`\nQUEDÓ ESCRITO. Tipo de cambio en uso: ${v[g.fTC - 1]?.[2] || '—'}`)
  console.log(`  Total disponibilidades: ${v[g.fTotal - 1]?.[4] || '—'} · en dólares: ${v[g.fUSD - 1]?.[2] || '—'}`)
  console.log(`  Cheques emitidos sin debitar: ${v[g.fCh - 1]?.[2] || '—'}`)
  console.log(`  Disponibilidad neta: ${v[g.fNeta - 1]?.[4] || '—'}`)
  console.log(`  Control del detalle de cheques: ${v[g.gControl - 1]?.[2] || '—'}`)
  if (sinCargar.length) console.log(`  ⚠ ${sinCargar.length} filas sin dato cargado: ${sinCargar.map((f) => f[0]).join(' · ')}`)
}

/**
 * El tipo de cambio, con nombre, para que lo pueda usar cualquier fórmula del archivo sin depender
 * de en qué fila quedó hoy. Se actualiza el que ya existe en vez de crear uno nuevo: la API apila.
 */
async function rangoConNombre(google, sheetId, fila) {
  const rango = { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: 2, endColumnIndex: 3 }
  const existentes = await google.getNamedRanges(ID).catch(() => [])
  const ya = existentes.find((r) => r.name === RANGO_TC)
  await google.spreadsheetBatchUpdate(ID, [ya
    ? { updateNamedRange: { namedRange: { namedRangeId: ya.namedRangeId, name: RANGO_TC, range: rango }, fields: 'name,range' } }
    : { addNamedRange: { namedRange: { name: RANGO_TC, range: rango } } }])
}

async function formatear(google, sheetId, g) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.93, green: 0.94, blue: 0.95 }
  const AMARILLO = { red: 1, green: 0.98, blue: 0.86 } // las celdas de carga: se ven distintas a propósito
  const VERDE = { red: 0.85, green: 0.92, blue: 0.85 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  // Los grupos viejos se borran ANTES de crear el nuevo: la API los apila y el margen izquierdo
  // terminaría con una escalera de +/- que crece cada 2 horas.
  const grupos = (await google.getRowGroups(ID).catch(() => [])).find((s) => s.sheetId === sheetId)?.grupos ?? []
  for (const gr of grupos) req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: gr.startIndex, endIndex: gr.endIndex } } })

  const MONEDA = { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }
  fmt(r(0, n, 2, 3), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: MONEDA, horizontalAlignment: 'RIGHT' })
  fmt(r(0, n, 4, 5), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: MONEDA, horizontalAlignment: 'RIGHT' })
  // El tipo de cambio no es plata: es una relación. Con dos decimales y sin signo $.
  fmt(r(0, n, 3, 4), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'NUMBER', pattern: '#,##0.00;;""' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 1, 2), 'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { horizontalAlignment: 'CENTER', textFormat: { fontSize: 9 } })
  fmt(r(0, n, 5, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 6, 7), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 7, 9), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'CLIP' })
  // La cotización de la fila del tipo de cambio NO es plata: se muestra como número.
  fmt(r(g.fRef - 1, g.fTC, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })

  for (const c of [g.cab0, g.cab1, g.cab3]) {
    fmt(r(c - 1, c), 'userEnteredFormat',
      { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  }
  // LAS CELDAS DE CARGA EN AMARILLO. Es la diferencia más importante de la pestaña: lo que una
  // persona escribe tiene que verse distinto de lo que el sistema calcula, o nadie sabe qué puede
  // tocar sin romper nada. Sólo se pinta lo que de verdad se carga: el importe, la fecha y el origen.
  for (const f of g.amarillas) {
    fmt(r(f - 1, f, 2, 3), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
    fmt(r(f - 1, f, 5, 6), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
    fmt(r(f - 1, f, 7, 9), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
  }
  // El detalle de cheques, más chico y en gris: es información de respaldo, no una cuenta más.
  if (g.g1 > g.g0) {
    fmt(r(g.g0 - 1, g.g1, 0, 1), 'userEnteredFormat.textFormat',
      { textFormat: { fontSize: 9, foregroundColor: { red: 0.35, green: 0.35, blue: 0.4 } } })
    req.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.g0 - 1, endIndex: g.g1 } } })
    req.push({ updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.g0 - 1, endIndex: g.g1 }, depth: 1, collapsed: true }, fields: 'collapsed' } })
  }
  fmt(r(g.fTotal - 1, g.fTotal), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: GRIS })
  fmt(r(g.fNeta - 1, g.fNeta), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, fontSize: 10 }, backgroundColor: VERDE })
  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    if (/^\d · |^CÓMO SE ACTUALIZA/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    if (/^⇒/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
  })
  const ancho = [380, 70, 150, 95, 150, 110, 110, 300, 150]
  ancho.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
