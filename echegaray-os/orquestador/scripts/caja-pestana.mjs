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
import * as E from '../lib/estilo-pestana.mjs'
import { CUENTAS, CARGA, ALIAS, TIPO_CAMBIO, RANGO_TC, filaDeCuenta } from '../lib/caja-disponibilidades.mjs'
import * as BANCO from '../lib/banco-santander.mjs'
import { TASAS, CARGO_VERIFICADO, tasaDiaria, costoConImpuestos, interesDelPeriodo } from '../lib/costo-descubierto.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { esIndistinguible } from '../lib/cobranzas-duplicado.mjs'

// LA MISMA definición de "dos cobros que no se pueden distinguir" que usa el control de la pestaña
// Cobranzas. Antes acá había una segunda basada en el ID, y al reparar la columna A —que se
// autonumera y no puede repetirse— esa versión pasó a dar cero sobre un duplicado que sigue existiendo.
const INDIST_COB = esIndistinguible('Cobranzas', 5, 400)

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

/** Cuánto vale hoy una cuenta según el banco. Nunca se pisa con una carga a mano vieja: el saldo
 *  lleva SU fecha, y la columna de antigüedad avisa cuando la foto envejeció. */
const saldoDeBanco = (c) => (c.banco === 'cartera'
  ? BANCO.totalEcheqs(BANCO.enCartera())
  : BANCO.CUENTA[c.banco])

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

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

function grilla(cargado, refs) {
  // El tipo de cambio se referencia por su RANGO CON NOMBRE. Así el bloque que lo calcula puede
  // vivir al pie de la pestaña —que es donde corresponde en una empresa que mueve todo en pesos—
  // sin que las filas de arriba dependan de en qué fila quedó.
  const TC = RANGO_TC
  const filas = []
  // Las filas en dólares se anotan para pintarlas distinto. Un saldo de U$S 581,39 mostrado como
  // "$581" con signo de peso se lee como 581 pesos: es un error de lectura de tres órdenes de
  // magnitud, y sólo se ve mirando la pantalla.
  const usd = []
  const push = (c = []) => {
    const r = [...c]; while (r.length < ANCHO) r.push('')
    filas.push(r)
    if (r[1] === 'USD') usd.push(filas.length)
    return filas.length
  }
  // El valor que el dueño ya había cargado para una cuenta, o vacío la primera vez.
  const previo = (cuenta, campo) => cargado.get(cuenta)?.[campo] ?? ''

  push(['CAJA Y BANCOS — DISPONIBILIDADES'])
  push(['Esta es la ÚNICA pestaña del archivo donde se carga un número a mano: cuánta plata hay. Todo lo demás se calcula solo. Las celdas AMARILLAS son para completar; el resto son fórmulas y se pisan en cada corrida del agente. Lo que está en dólares se carga EN DÓLARES: la conversión a pesos la hace la planilla.'])
  push()
  // ═══ LOS TRES NÚMEROS QUE CONTESTAN LA PREGUNTA, ARRIBA DE TODO ═══
  //
  // POR QUÉ (21/07). El dueño: "esta pestaña es clave y la verdad es que no se entiende una mierda".
  // Y no era por los números: era porque para saber cuánta plata hay había que bajar hasta la fila
  // 16, y para saber cuánta es REALMENTE disponible había que restar mentalmente los cheques ya
  // firmados que estaban veinte filas más abajo.
  //
  // Una pestaña que se abre todos los días tiene que contestar su pregunta en la primera pantalla.
  // Estas tres celdas son fórmulas que apuntan a las filas de abajo: no repiten un cálculo, lo
  // muestran donde se mira. El detalle sigue estando entero, abajo.
  const fTitulos = push(['LA PLATA QUE HAY', 'LO QUE YA ESTÁ COMPROMETIDO', 'QUEDA DISPONIBLE', '', 'AIRE (tarjeta + descubierto)'])
  const fCifras = push(['@TOTAL', '@CHEQUES', '@NETA', '', '@AIRE'])
  push(['efectivo + bancos + valores en cartera', 'cheques emitidos que todavía no debitaron', 'con esto se decide', '', 'NO es plata propia: es capacidad de endeudarse'])
  push()

  // ── 1 · DISPONIBILIDADES ────────────────────────────────────────────────────────────────────────
  push(['1 · DISPONIBILIDADES — LO QUE HAY HOY'])
  const cab1 = push(['Cuenta', 'Moneda', 'Saldo en moneda de origen', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo', 'Antigüedad', 'Origen del dato'])
  const d0 = filas.length + 1
  const amarillas = []
  let fBancoPesos = 0
  for (const c of CUENTAS) {
    const f = filas.length + 1
    if (c.banco === 'saldoPesos') fBancoPesos = f
    if (!c.formula && !c.banco) amarillas.push(f)
    push([
      c.nombre,
      c.moneda,
      // Una cuenta con fórmula NO se carga a mano: el OS la sabe calcular y pisarla sería perder
      // el dato. Sólo las que el OS no puede saber quedan como celda de carga.
      c.banco ? saldoDeBanco(c) : (c.formula ?? previo(c.nombre, 'saldo')),
      // El tipo de cambio se muestra sólo si hay algo que convertir: una cotización sola al lado de
      // una celda vacía es ruido que se lee como si hubiera un saldo.
      c.moneda === 'USD' ? `=IF(ISNUMBER(${C_IMP}${f});${TC};"")` : '',
      `=IF(${C_IMP}${f}="";"";${C_IMP}${f}*IF(${C_TC}${f}="";1;${C_TC}${f}))`,
      c.banco ? BANCO.CORTE : (c.formula ? '=TODAY()' : previo(c.nombre, 'fecha')),
      // La antigüedad no es decorativa: un saldo de hace 20 días avisando que tiene 20 días vale
      // muchísimo más que el mismo saldo mudo. Arriba de una semana, avisa.
      `=IF(F${f}="";"⚠ sin cargar";IF(TODAY()-F${f}>7;"⚠ "&TEXT(TODAY()-F${f};"0")&" días";TEXT(TODAY()-F${f};"0")&" días"))`,
      c.banco ? `${c.origenSugerido} · ${BANCO.ORIGEN}` : (previo(c.nombre, 'origen') || c.origenSugerido),
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
  for (const e of BANCO.enCartera()) {
    const f = filas.length + 1
    push([`      · ECHEQ ${e.numero} · ${e.emisor}`, 'ARS', e.importe, '', `=${C_IMP}${f}`, e.pago,
      `=IF(F${f}="";"";"entra en "&TEXT(F${f}-TODAY();"0")&" días")`,
      `${BANCO.ORIGEN} · estado EN CUSTODIA`, 'Réplica del banco'])
  }
  // LOS QUE SALIERON DE LA CARTERA. No suman —por eso van con importe en blanco— pero tienen que
  // estar A LA VISTA: son los $20.000.000 que el cuadro creía tener y ya no tiene.
  for (const e of BANCO.endosados()) {
    push([`      · ECHEQ ${e.numero} · ${e.emisor} → ENDOSADO a ${e.beneficiario}`, '', '', '', '',
      e.pago, 'ya no es nuestro',
      `${BANCO.ORIGEN} · se entregó para pagarle a ${e.beneficiario}: no va a entrar a la cuenta`, 'Réplica del banco'])
  }
  const gControl = push(['      ⇒ Control: qué dice Cobranzas de estos mismos cheques', '',
    CUENTAS.find((c) => c.control)?.control ?? '', '', '', '', '',
    'Cobranzas registra que el echeq se cobró —y es cierto— pero no sabe qué pasó DESPUÉS con el valor. Si este número es mayor que el de arriba, la diferencia son cheques que se endosaron para pagarle a alguien.', 'Se calcula solo'])
  const gDif = push(['      ⇒ Diferencia contra el banco', '', `=${C_IMP}${gControl}-${C_IMP}${fValores}`, '', '', '', '',
    'Distinto de cero = el cash flow espera como ingreso plata que ya se entregó. Manda el banco.', 'Se calcula solo'])
  const g1 = filas.length

  const fTotal = push(['TOTAL DISPONIBILIDADES', '', '', '', `=SUM(${C_PESOS}${d0}:${C_PESOS}${d1})`, '', '', '', 'Es el "Efectivo al inicio" que usan los dos cash flows.'])
  // La exposición al tipo de cambio. No es un detalle de presentación: decide si conviene vender o
  // quedarse. Sale de las mismas filas de arriba, no se carga aparte.

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
  const cab3 = push(['Línea', 'Moneda', 'Importe en moneda de origen', 'Tipo de cambio', 'Importe en pesos', '', '', 'Origen del dato'])

  const bancario = (nombre, moneda, importe, origen, fecha = BANCO.CORTE) => {
    const f = filas.length + 1
    return push([nombre, moneda, importe, moneda === 'USD' ? `=IF(ISNUMBER(${C_IMP}${f});${TC};"")` : '',
      `=IF(ISNUMBER(${C_IMP}${f});${C_IMP}${f}*IF(${C_TC}${f}="";1;${C_TC}${f});"")`, fecha, '', origen, 'Réplica del banco'])
  }

  const T = BANCO.TARJETA
  const fLim = bancario(CARGA.limiteTarjeta, 'ARS', T.limite, `${BANCO.ORIGEN} · ${T.cuenta}`)
  bancario('    · consumos del período, en pesos', 'ARS', T.consumidoPesos, `Cierra el ${T.cierra}, vence el ${T.vence}. Débito automático: ${T.debitoAutomatico}`)
  // UN SOLO CUPO, CON CONSUMOS EN DOS MONEDAS. Ver banco-santander.mjs: modelarlo como dos límites
  // mostraba un aire que no existe.
  bancario('    · consumos del período, en dólares', 'USD', T.consumidoDolares, 'Suscripciones. Se pagan contra el MISMO cupo de pesos, al tipo de cambio del cierre.')
  bancario('    · cuotas de compras anteriores que caen en períodos futuros', 'ARS', T.cuotasPendientes.restante,
    `Compromiso ya tomado: ${ars(T.cuotas.consumido)} consumidos en cuotas, ${ars(T.cuotasPendientes.proximoPeriodo)} caen en el próximo resumen.`)
  const fDisp = bancario('⇒ Disponible para compras', 'ARS', T.disponible,
    'EL QUE DECLARA EL BANCO, no uno calculado: límite menos consumido daría otro número y no voy a inventar la aritmética del resumen.')
  push(['      Control: la pestaña Tarjeta de Credito dice, de consumos sin debitar', 'ARS',
    `=SUMPRODUCT((UPPER('${refs.tarjeta}'!$J$3:$J$400)<>"SI")*IF(ISNUMBER('${refs.tarjeta}'!$E$3:$E$400);'${refs.tarjeta}'!$E$3:$E$400;0))`,
    '', `=${C_IMP}${filas.length + 1}`, '', '',
    `Pestaña ${refs.tarjeta}, columna DEBITADO distinta de SI. Es otro corte que el del resumen, así que no tienen por qué dar igual — pero una diferencia grande es una compra sin cargar.`, 'Se calcula solo'])
  push()

  // EL ACUERDO EN DESCUBIERTO. No es caja y no es gratis: el extracto muestra la cuenta en rojo casi
  // todo julio y $252.340,32 de intereses cobrados el 14/07 por el período 08/06 al 07/07.
  const A = BANCO.ACUERDO
  const fAcu = bancario(CARGA.acuerdo, 'ARS', A.importe,
    `Acuerdo N° ${A.numero}, ${A.estado} · vence el ${A.vence} · TNA ${(A.tna * 100).toFixed(2)}% · costo financiero total ${(A.cft * 100).toFixed(2)}% anual`)
  const fAire = push(['⇒ AIRE TOTAL DISPONIBLE (tarjeta + acuerdo)', 'ARS', `=${C_IMP}${fDisp}+${C_IMP}${fAcu}`, '',
    `=${C_PESOS}${fDisp}+${C_PESOS}${fAcu}`, '', '',
    'Cuánto se puede estirar antes de no poder pagar. NO es plata: es deuda que todavía no se tomó, y al 62,78% anual tomarla tiene precio.', 'Se calcula solo'])
  push()

  // ── QUÉ CUESTA USAR EL DESCUBIERTO ──────────────────────────────────────────────────────────────
  // "Te pasé las tasas para que al momento de utilizarlo el Sheet indique los intereses que va
  // generando". El modelo no se estimó: reproduce al centavo el cargo que el banco hizo el 14/07
  // (ver costo-descubierto.mjs). Por eso el bloque muestra la verificación al lado del cálculo: una
  // tasa copiada de una pantalla y una tasa que reproduce un cargo real no valen lo mismo.
  push(['COSTO DE USAR EL DESCUBIERTO — lo que corre por día mientras la cuenta esté en rojo'])
  const saldoBanco = `$${C_PESOS}$${fBancoPesos}`
  const fTasa = push(['Tasa nominal anual del acuerdo', '', TASAS.tna, '', '', '', '',
    `Acuerdo N° ${BANCO.ACUERDO.numero}. Costo financiero total ${(BANCO.ACUERDO.cft * 100).toFixed(2)}% anual.`, 'Réplica del banco'])
  push(['Interés por día, por cada $1.000.000 en descubierto', 'ARS', Math.round(1000000 * tasaDiaria() * 100) / 100, '',
    `=${C_IMP}${filas.length + 1}`, '', '',
    `${(TASAS.tna * 100).toFixed(0)}% ÷ 365 días. Con IVA e impuestos es ${ars(costoConImpuestos(1000000 * tasaDiaria()))} por día.`, 'Se calcula solo'])
  const fInt = push(['⇒ Interés que se está generando HOY', 'ARS',
    `=IF(${saldoBanco}>=0;0;-${saldoBanco}*${TASAS.tna}/${TASAS.base}*(1+${TASAS.iva}+${TASAS.percepcion}))`,
    '', `=${C_IMP}${filas.length + 1}`, '=TODAY()', '',
    'Por día, con IVA del 10,5% y percepción del 1,5% incluidos. Si la cuenta está a favor, es $0 y no hay nada que hacer.', 'Se calcula solo'])
  push(['      Últimos intereses que cobró el banco', 'ARS', CARGO_VERIFICADO.interes, '', `=${C_IMP}${filas.length + 1}*(1+${TASAS.iva}+${TASAS.percepcion})`, CARGO_VERIFICADO.hasta, '',
    `Período ${CARGO_VERIFICADO.desde} al ${CARGO_VERIFICADO.hasta} (${CARGO_VERIFICADO.dias} días). Con IVA y percepción, salieron ${ars(CARGO_VERIFICADO.total)}. La columna de pesos aplica el mismo 1,12 y tiene que dar ese número: es la prueba de que la tasa está bien cargada.`, 'Réplica del banco'])
  push()

  // ── 5 · ALERTA ──────────────────────────────────────────────────────────────────────────────────
  push(['4 · ALERTA DE CAJA — hasta cuándo alcanza'])
  const fMin = push(['Caja mínima deseada', '', '', '', "=N('01_Valores Iniciales'!$B$3)", '', '', '01_Valores Iniciales', ''])
  const rangoCierre = refs.cierre ? `'Cash Flow Mensual'!$B$${refs.cierre}:$M$${refs.cierre}` : null
  const rangoMes = refs.cab ? `'Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab}` : null
  // DOS CORRECCIONES QUE CAMBIAN LA FECHA QUE AVISA. Las dos aparecieron al reordenar la pestaña, y
  // ninguna la habría encontrado un control que suma: los números de arriba estaban perfectos.
  //
  // 1. LOS MESES SIN CIERRE NO CUENTAN. El cuadro deja en blanco los meses anteriores al saldo
  //    declarado —no se puede saber el saldo de un mes previo— y una celda vacía vale 0 en una
  //    suma. Sin el filtro, la alerta encontraba "enero 2026": un mes que ya pasó, o sea el aviso
  //    más inútil posible porque no habilita ninguna decisión.
  //
  // 2. YA NO SE LE SUMA EL SALDO DE HOY. Esta fórmula nació cuando el cuadro arrancaba de cero y
  //    había que agregarle la plata real. Desde que el "Efectivo al inicio" ancla en el total de
  //    esta misma pestaña, el cierre YA la incluye, y sumarla otra vez contaba $18.182.657 dos
  //    veces. Efecto medido: el aviso de caja mínima se corría de septiembre a octubre — un mes
  //    entero de anticipación, que es justamente para lo que sirve la alerta.
  const primerMes = (cond) => (rangoCierre
    ? `=IFERROR(TEXT(INDEX(${rangoMes};MATCH(1;ARRAYFORMULA((${rangoCierre}<>"")*(${rangoCierre}${cond}));0));"mmmm yyyy");"ningún mes del año")`
    : '⚠ falta la línea de cierre')
  push(['Primer mes por debajo de la caja mínima', '', '', '', primerMes(`<$${C_PESOS}$${fMin}`), '', '', '',
    'Sale del cierre proyectado del Cash Flow Mensual, que ya arranca del total declarado arriba. No se le vuelve a sumar el saldo de hoy: sería contar la misma plata dos veces.'])
  push(['Primer mes con caja negativa', '', '', '', primerMes('<0'), '', '', '',
    '⚠ Ojo: los ingresos de octubre en adelante están en $0 porque no hay obra facturada. Esta fecha es un PISO, no un pronóstico.'])
  // ── 4 · CONCILIACIÓN ────────────────────────────────────────────────────────────────────────────
  push(['5 · CONCILIACIÓN — ¿el cash flow explica la plata que hay?'])
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

  // ── 5 bis · ¿DÓNDE ESTÁ EL EFECTIVO COBRADO? ────────────────────────────────────────────────────
  //
  // POR QUÉ EXISTE (21/07). El cash flow tenía un agujero de $36.742.078 entre lo que Cobranzas dice
  // que se cobró y lo que entró al banco. Al abrirlo, el problema no era el total sino el EFECTIVO:
  //
  //   Cobranzas dice cobrado en efectivo, 06→21/07 ......  $58.615.646
  //   Depositado en el banco (3 depósitos de efectivo) ...   $9.960.000
  //   Declarado en caja física acá arriba .................  $1.725.000
  //   ⇒ SIN EXPLICAR ..................................... $46.930.646
  //
  // Un cobro en efectivo que no se deposita tiene que estar en algún lado, y ese lado es esta
  // pestaña. Si el número de arriba no lo refleja, o el efectivo no está o el cobro no ocurrió.
  // Las dos cosas son graves y ninguna se ve mirando el total del cash flow, porque un cobro
  // registrado suma igual esté la plata o no.
  //
  // ES UN CONTROL, NO UNA ACUSACIÓN: puede haber una explicación buena (un depósito posterior a la
  // fecha del extracto, un pago a proveedor hecho en efectivo sin pasar por el banco). Lo que no
  // puede pasar es que nadie lo mire.
  push(['5 bis · ¿DÓNDE ESTÁ EL EFECTIVO COBRADO?'])
  push(['Un cobro en efectivo que no se depositó tiene que estar en la caja física. Este control resta: lo cobrado en efectivo, menos lo que se depositó, menos lo que se declara en la caja de arriba. Si sobra plata, o no está o el cobro no ocurrió.'])
  // ═══ LA MISMA VENTANA DE TIEMPO DE LOS DOS LADOS ═══
  //
  // La primera versión sumaba el efectivo de TODO EL AÑO ($173.434.381) y lo restaba contra 16 días
  // de depósitos ($9.960.000). Daba $161.749.381 "sin explicar", que es un número inventado por el
  // método: comparar un año contra dieciséis días es exactamente lo que la regla de oro prohíbe.
  // El extracto cubre del 06 al 21/07, así que los dos lados se acotan ahí.
  const desdeB = BANCO.MOVIMIENTOS[0].fecha
  const hastaB = BANCO.MOVIMIENTOS[BANCO.MOVIMIENTOS.length - 1].fecha
  const dParts = (f) => f.split('-').map(Number)
  const dateF = (f) => { const [a, m, d] = dParts(f); return `DATE(${a};${m};${d})` }
  // SÓLO LO "COBRADO". Un cobro en estado "Proyectado" NO es efectivo en la caja: todavía no
  // ocurrió. La primera versión de este control los sumaba y contaba $15.000.000 de LA ESTRELLA que
  // nadie había recibido — inflaba el faltante con plata que no faltaba.
  const fEfCobrado = push([`Cobrado en EFECTIVO entre el ${desdeB} y el ${hastaB} (Cobranzas)`, '', '', '',
    `=SUMIFS(Cobranzas!$M$5:$M$400;Cobranzas!$N$5:$N$400;"Efectivo";Cobranzas!$O$5:$O$400;"Cobrado";Cobranzas!$Q$5:$Q$400;">="&${dateF(desdeB)};Cobranzas!$Q$5:$Q$400;"<="&${dateF(hastaB)})`, '', '', '',
    'Cobranzas: forma de cobro "Efectivo" Y estado "Cobrado", por FECHA DE COBRO, en la ventana del extracto. Un proyectado no es plata que esté.'])
  push(['  · de eso, cargado DOS VECES con el mismo ID', '', '', '',
    `=SUMPRODUCT((Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$Q$5:$Q$400>=${dateF(desdeB)})*(Cobranzas!$Q$5:$Q$400<=${dateF(hastaB)})*(${INDIST_COB})*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))/2`,
    '', '', '',
    '⚠ Mismo ID y mismo importe más de una vez. Caso real del 17/07: San Francisco pagó $16.200.000 en efectivo y quedó cargado dos veces —una al cobrarlo y otra al depositarlo—. Un depósito NO es un cobro: mover plata de la caja al banco no genera ingreso. Se divide por dos porque las dos filas del par suman.'])
  const fEfDepos = push(['Depositado en efectivo en esa misma ventana', '', '', '', BANCO.depositosEfectivo(), '', '', '',
    `Extracto del Santander ${BANCO.CORTE}. Los dos números miran los mismos días: comparar un año contra dos semanas no mide nada.`])
  push(['Declarado hoy en caja física', '', '', '', `=${C_PESOS}${d0}`, '', '', '',
    'La primera fila del bloque 1: la carga a mano.'])
  push(['⇒ EFECTIVO SIN EXPLICAR', '', '', '',
    `=${C_PESOS}${fEfCobrado}-${C_PESOS}${fEfCobrado + 1}-${C_PESOS}${fEfDepos}-${C_PESOS}${fEfCobrado + 3}`, '', '', '',
    '⚠ Es el efectivo cobrado en la ventana que no se depositó NI aparece en la caja física. Puede tener explicación —un depósito posterior al corte, un pago a proveedor hecho en efectivo sin pasar por el banco— pero no puede quedar sin mirar. Al 21/07: dos filas de Cobranzas por $16.200.000 cada una, el mismo día y del mismo cliente, que el detector de duplicados ya venía marcando.'])
  push()

  push()
  // ── 0 · TIPO DE CAMBIO ──────────────────────────────────────────────────────────────────────────
  // Se define UNA sola vez y acá, que es donde se usa. Cualquier otra fórmula del archivo que
  // necesite convertir dólares referencia el rango con nombre, no esta celda por su fila.
  push(['6 · TIPO DE CAMBIO — sólo se usa para valuar la cuenta en dólares'])
  push(['Está al final a propósito: la empresa cobra, paga y decide en pesos. El dólar acá no es una posición, es una cuenta chica que hay que poder sumar al total — y para eso hace falta una cotización con origen.'])
  const cab0 = push(['Concepto', '', 'Cotización', '', '', 'Fecha', '', 'Origen del dato'])
  const fRef = push([TIPO_CAMBIO.referencia.nombre, '', TIPO_CAMBIO.referencia.formula, '', '', '=TODAY()', '', TIPO_CAMBIO.referencia.origen, 'Se calcula solo'])
  const fDec = push([TIPO_CAMBIO.declarado.nombre, '', previo(TIPO_CAMBIO.declarado.nombre, 'saldo'), '', '',
    previo(TIPO_CAMBIO.declarado.nombre, 'fecha'), '', previo(TIPO_CAMBIO.declarado.nombre, 'origen') || TIPO_CAMBIO.declarado.origen,
    previo(TIPO_CAMBIO.declarado.nombre, 'quien')])
  const fTC = push([TIPO_CAMBIO.uso.nombre, '', `=IF(${C_IMP}${fDec}<>"";${C_IMP}${fDec};${C_IMP}${fRef})`, '', '', '', '', TIPO_CAMBIO.uso.origen, 'Se calcula solo'])
  push()

  const fUSD = push(['De los cuales, en moneda extranjera', 'USD',
    `=SUMIF($B$${d0}:$B$${d1};"USD";$${C_IMP}$${d0}:$${C_IMP}$${d1})`, `=${TC}`,
    `=${C_IMP}${filas.length + 1}*${C_TC}${filas.length + 1}`, '', '',
    'Exposición al tipo de cambio: esta parte de la caja cambia de valor sin que entre ni salga un peso.', 'Se calcula solo'])
  push()
  push(['CÓMO SE ACTUALIZA ESTO'])
  push(['· Los saldos (las celdas amarillas) se cargan a mano o pegando el extracto en el chat: el OS lo lee y los completa. Lo que está en dólares se carga en dólares.'])
  push(['· No hay integración con el banco. La API de banca empresa se pide al banco y hoy no está contratada — hasta entonces, el saldo entra por extracto, captura o arqueo.'])
  push(['· El tipo de cambio se actualiza solo con la cotización del día. Si operás a otro (MEP, tarjeta), cargalo en la fila "Dólar declarado" y ése pasa a mandar.'])
  push(['· Todo lo demás de esta pestaña se recalcula solo cada 2 horas junto con el resto del archivo.'])

  // El panel de arriba se resuelve acá, cuando ya se sabe en qué fila quedó cada total. Son
  // referencias, no copias: si el detalle cambia, el titular cambia con él.
  const PANEL = { '@TOTAL': `=${C_PESOS}${fTotal}`, '@CHEQUES': `=${C_PESOS}${fCh}`, '@NETA': `=${C_PESOS}${fNeta}`, '@AIRE': `=${C_PESOS}${fAire}` }
  for (const f of filas) f.forEach((c, j) => { if (typeof c === 'string' && PANEL[c]) f[j] = PANEL[c] })

  return { filas, usd, fTitulos, fCifras, fAire, fBancoPesos, fTasa, d0, d1, g0, g1, gControl, gDif, cab0, cab1, cab3, fTC, fRef, fDec, fTotal, fUSD, fNeta, fCh, fLim, fDisp, fAcu, fDecl, amarillas }
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

  const g = grilla(cargado, refs)
  console.log(`${tab}: ${g.filas.length} filas · ${CUENTAS.length} cuentas · ${cargado.size} con dato ya cargado`)
  console.log(`  cartera de echeqs según el banco al ${BANCO.CORTE}: ${BANCO.enCartera().length} en custodia por ${ars(BANCO.totalEcheqs(BANCO.enCartera()))} · ${BANCO.endosados().length} endosados por ${ars(BANCO.totalEcheqs(BANCO.endosados()))}`)
  console.log(`  cierre del Cash Flow en la fila ${refs.cierre ?? '?'} · encabezado en la ${refs.cab ?? '?'}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // EL RANGO CON NOMBRE VA PRIMERO. Las fórmulas de arriba dicen TIPO_CAMBIO_USD, así que el nombre
  // tiene que existir antes de escribirlas o la pestaña se llena de #NAME? en la primera corrida.
  await rangoConNombre(google, hoja.sheetId, g.fTC)
  await google.clearValues(ID, `${tab}!A1:Z90`)
  await google.batchUpdateValues(ID, [{ range: `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g)

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
  // UNA TASA NO ES PLATA. Con el formato de moneda, el 55% anual se dibujaba "$1" — que además de
  // no significar nada, invita a leerlo como un peso.
  fmt(r(g.fTasa - 1, g.fTasa, 2, 3), 'userEnteredFormat.numberFormat',
    { numberFormat: { type: 'PERCENT', pattern: '0.00%' } })
  // LOS IMPORTES EN DÓLARES, con su propio símbolo. Sin esto, U$S 581,39 se dibuja "$581".
  for (const f of g.usd) {
    fmt(r(f - 1, f, 2, 3), 'userEnteredFormat.numberFormat',
      { numberFormat: { type: 'CURRENCY', pattern: '"U$S "#,##0.00;[Red]-"U$S "#,##0.00;"—"' } })
  }
  // La cotización de la fila del tipo de cambio NO es plata: se muestra como número.
  fmt(r(g.fRef - 1, g.fTC, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })

  // ── EL PANEL DE TITULARES ────────────────────────────────────────────────────────────────────
  // Grande, con aire, y con la unidad declarada: es lo primero que se ve al abrir la pestaña.
  if (g.fTitulos && g.fCifras) {
    fmt(r(g.fTitulos - 1, g.fTitulos), 'userEnteredFormat',
      { backgroundColor: AZUL, textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
    fmt(r(g.fCifras - 1, g.fCifras), 'userEnteredFormat',
      { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: 16, fontFamily: E.FUENTE_NUM }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' })
    fmt(r(g.fCifras, g.fCifras + 1), 'userEnteredFormat',
      { numberFormat: { type: 'TEXT' }, textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: g.fCifras - 1, endIndex: g.fCifras }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })
    // "Lo que ya está comprometido" se lee mejor en rojo suave: es lo que hay que restar.
    fmt(r(g.fCifras - 1, g.fCifras, 1, 2), 'userEnteredFormat.backgroundColor', { backgroundColor: E.COLOR.alerta })
    fmt(r(g.fCifras - 1, g.fCifras, 2, 3), 'userEnteredFormat.backgroundColor', { backgroundColor: E.COLOR.ok ?? E.COLOR.subtotal })
  }

  // UN MES NO ES UN IMPORTE. "Primer mes por debajo de la caja mínima" devuelve "septiembre 2026" y
  // la columna entera tiene formato moneda: la respuesta de la alerta de caja se leía como plata.
  g.filas.forEach((f, i) => {
    if (/^Primer mes/.test(String(f?.[0] ?? ''))) {
      fmt(r(i, i + 1, 4, 5), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
        { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
    }
  })

  // LA COLUMNA "MONEDA" ES TEXTO. Con el formato moneda de la columna entera, "ARS" quedaba en una
  // celda que dice ser plata: no cambia ningún total, pero es exactamente el tipo de defecto que
  // hace que una pestaña no se entienda. Trece celdas.
  fmt(r(0, g.filas.length, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })

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
    req.push({ updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.g0 - 1, endIndex: g.g1 }, depth: 1, collapsed: false }, fields: 'collapsed' } })
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
