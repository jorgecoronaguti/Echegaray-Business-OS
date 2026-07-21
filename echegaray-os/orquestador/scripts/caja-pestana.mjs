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
import { notasDeColumna, altoDeParrafo, entranEn } from '../lib/nota-celda.mjs'
import { CUENTAS, CARGA, ALIAS, TIPO_CAMBIO, RANGO_TC, filaDeCuenta } from '../lib/caja-disponibilidades.mjs'
import * as BANCO from '../lib/banco-santander.mjs'
import { TASAS, CARGO_VERIFICADO, tasaDiaria, costoConImpuestos, interesDelPeriodo } from '../lib/costo-descubierto.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { CAJA as N_CAJA, publicar } from '../lib/rangos-nombrados.mjs'
import { esIndistinguible } from '../lib/cobranzas-duplicado.mjs'
import * as CONC from '../lib/conciliacion-por-naturaleza.mjs'
import { formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte } from '../lib/caja-posterior-al-corte.mjs'

// LA MISMA definición de "dos cobros que no se pueden distinguir" que usa el control de la pestaña
// Cobranzas. Antes acá había una segunda basada en el ID, y al reparar la columna A —que se
// autonumera y no puede repetirse— esa versión pasó a dar cero sobre un duplicado que sigue existiendo.
const INDIST_COB = esIndistinguible('Cobranzas', 5, 400)

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'
const DRY = process.argv.includes('--dry')

// A concepto · B moneda · C importe en origen · D tipo de cambio · E importe en pesos ·
// F fecha · G antigüedad · H origen del dato · I declarado por
const ANCHO = 8
/** El ancho de cada columna. La de origen es angosta A PROPÓSITO: lleva una etiqueta, no un párrafo
 *  —el texto completo vive en la nota de la celda (lib/nota-celda.mjs)—. */
const ANCHOS = [400, 64, 148, 96, 152, 104, 96, 300]
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
    // Se rellena Y SE TRUNCA a lo que mide la tabla: al sacar la columna "Declarado por" quedaron
    // filas de nueve elementos contra una grilla de ocho, y el batch entero falla sin escribir nada.
    const r = [...c]; while (r.length < ANCHO) r.push('')
    r.length = ANCHO
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
  // Cada titular ocupa DOS columnas: con el ancho de una columna de tabla, "$18.180.491" en cuerpo
  // 16 no entra y Sheets lo dibuja como ###.
  const fTitulos = push(['LA PLATA QUE HAY', '', 'YA COMPROMETIDO', '', 'QUEDA DISPONIBLE', '', 'AIRE', ''])
  const fCifras = push(['@TOTAL', '', '@CHEQUES', '', '@NETA', '', '@AIRE', ''])
  push(['efectivo + bancos + valores', '', 'cheques firmados sin debitar', '', 'con esto se decide', '', 'crédito, no plata propia', ''])
  push()

  // ═══ LO QUE NO CIERRA, ARRIBA Y JUNTO ═══════════════════════════════════════════════════════
  //
  // POR QUÉ (21/07). El dueño, cuarta vez sobre esta pestaña: "¿no pensás mejorar caja?". Y tenía
  // razón otra vez, pero el problema ya no era el formato: era la JERARQUÍA. La pestaña mostraba
  // ochenta y tres millones de pesos en contradicciones —$20M de echeqs que el cash flow espera y
  // ya se entregaron, $47,7M de diferencia contra la proyección, $15,7M de efectivo sin explicar,
  // $16,2M cargados dos veces— y los dibujaba igual que un saldo cualquiera, cada uno perdido en su
  // bloque. Arriba, el panel decía "$5.416.537 disponible" como si estuviera todo bien.
  //
  // Una pestaña de caja tiene que GRITAR lo que está roto, no listarlo. Estas filas son fórmulas que
  // referencian el detalle de más abajo —no repiten ningún cálculo— y cada una dice qué hacer.
  // CADA ALERTA DICE DE DÓNDE SALE SU NÚMERO, CON LA CUENTA ESCRITA.
  //
  // El dueño (21/07): "eso de la pestaña caja no sé de dónde lo saca". Tenía razón: la columna de
  // detalle decía "Bloque 6" —hay que buscarlo, contar filas y reconstruir la resta a mano—. Un
  // número que acusa un problema de cuarenta millones tiene que traer su cuenta al lado, o no se
  // puede discutir ni corregir. Ahora dice la RESTA y la FILA exacta.
  const fAlerta0 = push(['⚠ LO QUE NO CIERRA — mirar esto antes de decidir con los números de arriba'])
  push(['Cada línea es un problema con nombre y monto. La última columna dice de qué resta sale y en qué fila está la cuenta completa.'])
  // ═══ LA EXPLICACIÓN VA EN LA CELDA QUE SE VE ═══
  //
  // Había una columna "Dónde está el detalle" que decía "Bloque 6"… y NADIE PODÍA LEERLA: la celda
  // de "qué hacer" se combina de la D a la H para que la frase entre, así que la última columna
  // estaba tapada desde el día que se creó. El dueño preguntó "no sé de dónde lo saca" y tenía toda
  // la razón: la respuesta estaba escrita en una celda invisible.
  //
  // Ahora la cuenta va concatenada al final de la misma frase, dentro de la celda combinada.
  push(['Qué pasa', '', 'Cuánto', 'Qué hacer, y de dónde sale el número', '', '', '', ''])
  push(['Cheques de terceros que el cash flow espera y ya se entregaron', '', '@DIFECHEQ',
    '@ORIGEN_ECHEQ', '', '', '', ''])
  push(['El cash flow proyecta un efectivo que no está', '', '@DIFCONC',
    '@ORIGEN_CONC', '', '', '', ''])
  push(['Efectivo cobrado que no se depositó ni está en la caja física', '', '@SINEXPL',
    '@ORIGEN_EFVO', '', '', '', ''])
  const fAlerta1 = filas.length
  push()

  // ── 1 · DISPONIBILIDADES ────────────────────────────────────────────────────────────────────────
  push(['1 · DISPONIBILIDADES — LO QUE HAY HOY'])
  const cab1 = push(['Cuenta', 'Moneda', 'Saldo en moneda de origen', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo', 'Antigüedad', 'Origen del dato'])
  const d0 = filas.length + 1
  const amarillas = []
  let fBancoPesos = 0
  // LA FILA DE LA CARTERA SE GUARDA POR NOMBRE, NO SE DEDUCE DE LA POSICIÓN.
  //
  // Antes la alerta de echeqs restaba `d1`, "la última fila del bloque", que era la cartera sólo
  // porque estaba última. El día que se agregó la línea de movimientos posteriores al corte, `d1`
  // pasó a ser esa otra fila y la alerta empezó a restar cero: mostró $30.000.000 de cheques
  // entregados cuando son $20.000.000. Ninguna suma cambió, así que ningún control lo vio.
  let fCartera = 0
  for (const c of CUENTAS) {
    const f = filas.length + 1
    if (c.banco === 'saldoPesos') fBancoPesos = f
    if (c.banco === 'cartera') fCartera = f
    if (!c.formula && !c.banco) amarillas.push(f)
    push([
      c.nombre,
      c.moneda,
      // Una cuenta con fórmula NO se carga a mano: el OS la sabe calcular y pisarla sería perder
      // el dato. Sólo las que el OS no puede saber quedan como celda de carga.
      // EL SALDO DEL BANCO ES UNA FÓRMULA CONTRA LA RÉPLICA DEL EXTRACTO, NO UN NÚMERO PEGADO.
      // Hasta el 21/07 acá se escribía el resultado de una constante de JavaScript: la réplica ya
      // estaba en el archivo (_BANCO_RAW) y ninguna celda la leía. Un saldo pegado sólo cambia
      // cuando corre el agente, y encima calla si la réplica se actualizó y el código no.
      // Si la pestaña réplica todavía no existe, se cae al número: mejor un dato viejo declarado
      // que un #REF! que rompe el total y las dos pestañas de cash flow que lo leen.
      c.banco === 'saldoPesos' && refs.bancoRaw ? formulaUltimoSaldo(refs.bancoRaw)
        // LA CARTERA SALE DE SU PROPIO DETALLE, no de un total calculado aparte. Eran dos números
        // distintos —el total acá y los cheques uno por uno en el bloque 3— que salían del mismo
        // lugar pero podían dejar de coincidir sin que nada avisara. Se resuelve abajo, cuando ya
        // se sabe en qué filas quedó el detalle.
        : c.banco === 'cartera' ? '@CARTERA'
        : c.banco ? saldoDeBanco(c) : (c.formula ?? previo(c.nombre, 'saldo')),
      // El tipo de cambio se muestra sólo si hay algo que convertir: una cotización sola al lado de
      // una celda vacía es ruido que se lee como si hubiera un saldo.
      c.moneda === 'USD' ? `=IF(ISNUMBER(${C_IMP}${f});${TC};"")` : '',
      `=IF(${C_IMP}${f}="";"";${C_IMP}${f}*IF(${C_TC}${f}="";1;${C_TC}${f}))`,
      // LA FECHA DE CORTE TAMBIÉN SE LEE DE LA RÉPLICA. Es la fecha del último movimiento del
      // extracto, y de ella depende la ventana de "movimientos posteriores al corte" de más abajo:
      // una fecha escrita a mano que quede vieja haría contar dos veces todo lo que hay en el medio.
      c.banco === 'saldoPesos' && refs.bancoRaw ? formulaFechaCorte(refs.bancoRaw)
        : c.banco ? BANCO.CORTE : (c.formula ? '=TODAY()' : previo(c.nombre, 'fecha')),
      // La antigüedad no es decorativa: un saldo de hace 20 días avisando que tiene 20 días vale
      // muchísimo más que el mismo saldo mudo. Arriba de una semana, avisa.
      `=IF(F${f}="";"⚠ sin cargar";IF(TODAY()-F${f}>7;"⚠ "&TEXT(TODAY()-F${f};"0")&" días";TEXT(TODAY()-F${f};"0")&" días"))`,
      c.banco ? `${c.origenSugerido} · ${BANCO.ORIGEN}` : (previo(c.nombre, 'origen') || c.origenSugerido),
      previo(c.nombre, 'quien'),
    ])
  }
  // ═══ LA LÍNEA QUE HACE QUE LA CAJA SE MUEVA ═══
  //
  // El dueño (21/07): "no se ajustan los saldos en caja a medida que toco cobranzas". Era cierto y
  // era estructural: el saldo del banco es una foto del extracto a SU fecha de corte, y todo lo que
  // pasa después no existía en ninguna parte de esta pestaña. Esta fila es la ventana que el
  // extracto no cubre —del día después del corte en adelante— y por eso suma al total sin duplicar
  // nada de lo que ya trae el saldo bancario.
  //
  // Es NETA a propósito: cobros nuevos menos cheques propios que se debitaron después del corte. Con
  // un solo lado la caja crecería y nunca bajaría. Ver lib/caja-posterior-al-corte.mjs.
  const fPost = fBancoPesos && refs.bancoRaw ? filas.length + 1 : 0
  if (fPost) {
    push(['Movimientos posteriores al corte del extracto', 'ARS',
      formulaNetaPosterior(`$F$${fBancoPesos}`), '', `=${C_IMP}${fPost}`, '=TODAY()',
      `=IF(${C_IMP}${fPost}=0;"sin movimientos";"vivo")`,
      'Cobranzas (estado Cobrado, sin echeq) menos cheques debitados, todo con fecha POSTERIOR al corte del extracto. El extracto ya trae lo anterior: contarlo de nuevo duplicaría. Los echeq quedan afuera porque ya están en Valores a depositar.',
      'Se calcula solo'])
  }
  const d1 = filas.length

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

  // ── 3 · EL DETALLE DE LOS VALORES EN CARTERA ───────────────────────────────────────────────────
  //
  // ESTO ESTABA ADENTRO DE LA TABLA DE SALDOS, y era la razón principal por la que la pestaña no se
  // entendía: entre "Banco Santander" y "TOTAL DISPONIBILIDADES" había tres echeqs —dos de ellos ya
  // endosados, que no son plata— y dos filas de control. Una tabla que dice "acá está lo que tenés"
  // con cinco filas en el medio que no son eso obliga a decidir fila por fila cuál suma. El detalle
  // es valioso y se queda, pero abajo y con su propio título.
  push(['3 · LOS VALORES EN CARTERA, UNO POR UNO — de dónde sale la línea de arriba'])
  // EL DETALLE DE LOS CHEQUES EN CARTERA, colapsable. Va DESPUÉS de las cuentas y antes del total,
  // así que no entra en el rango que suma: sumaría dos veces la misma plata.
  const ultima = CUENTAS[CUENTAS.length - 1]
  if (ultima.detalle && ultima.detalle !== 'echeq_en_cartera') throw new Error('el detalle desplegable sólo está resuelto para los echeq en cartera')
  const fValores = fCartera
  if (!fValores) throw new Error('no encontré la fila de la cartera de valores: la alerta de echeqs quedaría mal')
  const g0 = filas.length + 1
  const cust0 = g0
  for (const e of BANCO.enCartera()) {
    const f = filas.length + 1
    push([`   ECHEQ ${e.numero} · ${e.emisor}`, 'ARS', e.importe, '', `=${C_IMP}${f}`, e.pago,
      `=IF(F${f}="";"";"entra en "&TEXT(F${f}-TODAY();"0")&" días")`,
      `${BANCO.ORIGEN} · estado EN CUSTODIA`, 'Réplica del banco'])
  }
  const cust1 = filas.length
  // LOS QUE SALIERON DE LA CARTERA. No suman —por eso van con importe en blanco— pero tienen que
  // estar A LA VISTA: son los $20.000.000 que el cuadro creía tener y ya no tiene.
  for (const e of BANCO.endosados()) {
    // EL RÓTULO DICE LO QUE PASÓ, NO EL TRÁMITE. "→ ENDOSADO a ALUMETAL S.A" con el emisor adelante
    // daba 71 caracteres en una celda donde entran 68: se cortaba justo en el dato que importa.
    push([`   ECHEQ ${e.numero} · YA NO ES NUESTRO — endosado a ${e.beneficiario}`, '', '', '', '',
      e.pago, 'entregado',
      `${BANCO.ORIGEN} · se entregó para pagarle a ${e.beneficiario}: no va a entrar a la cuenta`, 'Réplica del banco'])
  }
  const gControl = push(['⇒ Control: qué dice Cobranzas de estos cheques', '',
    CUENTAS.find((c) => c.control)?.control ?? '', '', '', '', '',
    'Cobranzas registra que el echeq se cobró —y es cierto— pero no sabe qué pasó DESPUÉS con el valor. Si este número es mayor que el de arriba, la diferencia son cheques que se endosaron para pagarle a alguien.', 'Se calcula solo'])
  const gDif = push(['⇒ Diferencia contra el banco (manda el banco)', '', `=${C_IMP}${gControl}-${C_IMP}${fValores}`, '', '', '', '',
    'Distinto de cero = el cash flow espera como ingreso plata que ya se entregó. Manda el banco.', 'Se calcula solo'])
  const g1 = filas.length

  push()

  // ── 4 · LÍNEAS DE CRÉDITO ───────────────────────────────────────────────────────────────────────
  push(['4 · LÍNEAS DE CRÉDITO — NO son efectivo, y por eso no suman arriba'])
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
  const fCtrlTar = push(['   Control contra la pestaña Tarjeta de Credito', 'ARS',
    `=SUMPRODUCT((UPPER('${refs.tarjeta}'!$J$3:$J$400)<>"SI")*IF(ISNUMBER('${refs.tarjeta}'!$E$3:$E$400);'${refs.tarjeta}'!$E$3:$E$400;0))`,
    '', `=${C_IMP}${filas.length + 1}`, '', '',
    `Pestaña ${refs.tarjeta}, columna DEBITADO distinta de SI. Es otro corte que el del resumen, así que no tienen por qué dar igual — pero una diferencia grande es una compra sin cargar.`, 'Se calcula solo'])
  // UN CONTROL QUE NO CONCLUYE NADA NO ES UN CONTROL.
  //
  // POR QUÉ (21/07). Acá había dos números uno debajo del otro —lo que dice el resumen del banco y
  // lo que dice la pestaña de la tarjeta— y ninguna fila que dijera si coinciden. Para saber si
  // había un problema, el que mira tenía que sumar tres renglones de arriba a mano y restar. Nadie
  // lo hace, así que el control estaba de adorno. El bloque de la cartera de cheques, dos bloques
  // más arriba, ya tenía su "⇒ Diferencia": ésta es la misma idea donde faltaba.
  push(['⇒ Diferencia — el resumen contra la pestaña', 'ARS',
    `=(${C_IMP}${fLim + 1}+${C_PESOS}${fLim + 2}+${C_IMP}${fLim + 3})-${C_IMP}${fCtrlTar}`,
    '', '', '', '',
    'Consumos del período (pesos + dólares valuados) más cuotas futuras, contra lo no debitado de la pestaña. Son cortes distintos, así que un resto chico es normal; uno grande es una compra que no se cargó.', 'Se calcula solo'])
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
  // LA TASA DIARIA SE CALCULA EN EL SHEET, no en JavaScript. Era el único número CALCULADO que
  // quedaba pegado en esta pestaña: si el banco cambia la TNA se corrige la celda de arriba y este
  // número tiene que moverse solo, o queda mostrando el costo del acuerdo viejo.
  push(['Interés por día, por cada $1.000.000 en descubierto', 'ARS', `=1000000*$${C_IMP}$${fTasa}/${TASAS.base}`, '',
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
  push(['5 · ALERTA DE CAJA — hasta cuándo alcanza'])

  // ═══ DÍAS DE CAJA ═══════════════════════════════════════════════════════════════════════════
  //
  // La pregunta que una tesorería contesta primero y que este archivo no contestaba: si mañana no
  // entra un peso, ¿cuántos días se puede seguir pagando? Es la única forma de que "$5.416.609
  // disponibles" signifique algo — contra un ritmo de $6M por día es una semana corta, y contra uno
  // de $500.000 son once semanas.
  //
  // El ritmo sale de lo que REALMENTE salió: las compras con fecha de caja en los últimos 90 días,
  // divididas por 90. No es una proyección ni un presupuesto, es el promedio de lo que pasó. Y se
  // mide contra la DISPONIBILIDAD NETA —descontados los cheques ya firmados— porque esa plata ya
  // tiene dueño.
  const egr90 = `SUMIFS(Compras!$O$4:$O;Compras!$AD$4:$AD;">="&TODAY()-90;Compras!$AD$4:$AD;"<="&TODAY())`
  const fRitmo = push(['Egreso promedio por día (últimos 90 días reales)', 'ARS', `=${egr90}/90`, '',
    `=${C_IMP}${filas.length + 1}`, '=TODAY()', '', 'Compras, por fecha de caja. Lo que salió de verdad en los últimos 90 días, dividido 90.', ''])
  const fDias = push(['⇒ DÍAS DE CAJA, si no entrara nada más', '', `=IF(${C_IMP}${fRitmo}<=0;"";ROUND(${C_PESOS}${fNeta}/${C_IMP}${fRitmo};0))`, '', '', '', '',
    'La disponibilidad neta dividida por el ritmo de egresos. Es el número que dice si hay que salir a cobrar esta semana o no.', 'Se calcula solo'])
  push()

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
  // ═══ LA ALERTA QUE FALTABA: ¿Y HOY? ═══
  //
  // POR QUÉ (21/07). La pestaña se contradecía a sí misma en dos filas. Arriba decía "3 DÍAS DE
  // CAJA" y abajo "primer mes por debajo de la caja mínima: septiembre 2026". Las dos salían de
  // datos correctos y una de las dos tranquilizaba: la de septiembre mira el CIERRE PROYECTADO de
  // cada mes del cash flow, y julio cierra en $64.236.258 porque la proyección espera cobros que
  // todavía no entraron. Hoy hay $17.955.476 contra una caja mínima de $20.000.000: ya estamos
  // abajo, y la fila que lo tenía que decir hablaba de dentro de dos meses.
  //
  // Un aviso a futuro no reemplaza al del presente. Éste va PRIMERO y compara la disponibilidad
  // neta —la de verdad, la que queda después de los cheques ya firmados— contra el mínimo.
  push(['⇒ ¿HOY estamos por debajo de la caja mínima?', '', '', '',
    `=IF(${C_PESOS}${fMin}=0;"⚠ falta cargar la caja mínima";IF(${C_PESOS}${fNeta}<${C_PESOS}${fMin};"⚠ SÍ — faltan "&TEXT(${C_PESOS}${fMin}-${C_PESOS}${fNeta};"$#,##0");"no, hay "&TEXT(${C_PESOS}${fNeta}-${C_PESOS}${fMin};"$#,##0")&" de sobra"))`,
    '', '', '',
    'Compara la disponibilidad NETA de hoy contra el mínimo. Las dos filas de abajo miran la proyección del cash flow, que puede estar meses adelante: ésta mira lo que hay.'])
  push(['Primer mes por debajo de la caja mínima', '', '', '', primerMes(`<$${C_PESOS}$${fMin}`), '', '', '',
    'Sale del cierre proyectado del Cash Flow Mensual, que ya arranca del total declarado arriba. No se le vuelve a sumar el saldo de hoy: sería contar la misma plata dos veces. ⚠ Si la conciliación del bloque 6 no cierra, esta fecha es optimista: la proyección espera cobros que todavía no entraron.'])
  push(['Primer mes con caja negativa', '', '', '', primerMes('<0'), '', '', '',
    '⚠ Ojo: los ingresos de octubre en adelante están en $0 porque no hay obra facturada. Esta fecha es un PISO, no un pronóstico.'])
  // ── 4 · CONCILIACIÓN ────────────────────────────────────────────────────────────────────────────
  push(['6 · CONCILIACIÓN — ¿el cash flow explica la plata que hay?'])
  push(['El control que mide si el archivo sirve. Si la diferencia es chica, el cuadro es confiable. Si es grande, hay plata moviéndose fuera del Sheet y hay que buscarla antes de decidir con estos números.'])
  const fDecl = push(['Disponibilidad declarada (bloque 1)', '', '', '', `=${C_PESOS}${fTotal}`, '', '', '', 'Lo que dicen el extracto y el arqueo.'])
  const fProy = push(['Efectivo al cierre que proyecta el Cash Flow al mes de la fecha del saldo', '', '', '',
    refs.cierre
      ? `=IFERROR(INDEX('Cash Flow Mensual'!$B$${refs.cierre}:$M$${refs.cierre};MATCH(EOMONTH(MAX($F$${d0}:$F$${d1});0);ARRAYFORMULA(EOMONTH('Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab};0));0));"⚠ sin saldo cargado")`
      : '⚠ no encontré la línea de cierre en el Cash Flow Mensual',
    '', '', 'Cash Flow Mensual, línea "Efectivo y equivalentes al cierre"', 'Se calcula solo'])
  const fDifConc = push(['⇒ Diferencia', '', '', '', `=IFERROR(${C_PESOS}${fDecl}-${C_PESOS}${fProy};"")`, '', '', '',
    'Distinto de cero = movimientos que el archivo no ve. No es un error de fórmula: es trabajo de carga.'])

  // ═══ POR QUÉ LA DIFERENCIA ES ENORME, Y CUÁNTO DE ELLA ES UN PROBLEMA DE VERDAD ═══
  //
  // POR QUÉ (21/07). Esta conciliación gritaba $46.280.782 y no se podía hacer nada con el número.
  // Al abrirlo, la mayor parte NO ES UN ERROR: la fila de arriba compara la plata que hay HOY (21/07)
  // contra el CIERRE PROYECTADO DE TODO JULIO. Entre una fecha y la otra hay diez días de cobros y
  // pagos que el cuadro ya cuenta y que todavía no ocurrieron. Comparadas así, las dos cifras nunca
  // van a coincidir, y una alerta que siempre está en rojo deja de leerse.
  //
  // Estas líneas separan las tres cosas que estaban sumadas en un solo número:
  //   · lo que el cash flow espera del RESTO DEL MES — no es un problema, es futuro;
  //   · lo que el cuadro cuenta como cobrado este mes y NO tiene estado Cobrado — eso sí es un
  //     problema: la proyección está tomando como hecho algo que no entró;
  //   · el residuo, que es lo único verdaderamente sin explicar y lo único que hay que salir a buscar.
  const C = 'Cobranzas', CO = 'Compras'
  const hoy = 'TODAY()'
  const finMes = 'EOMONTH(TODAY();0)'
  const cobRestoMes = `SUMIFS(${C}!$M$5:$M$400;${C}!$Q$5:$Q$400;">"&${hoy};${C}!$Q$5:$Q$400;"<="&${finMes})`
  const pagRestoMes = `SUMIFS(${CO}!$O$4:$O$800;${CO}!$AD$4:$AD$800;">"&${hoy};${CO}!$AD$4:$AD$800;"<="&${finMes})`
  const fResto = push(['   · lo que el cash flow espera que pase del 22 al fin de mes (cobros menos pagos)', '', '', '',
    `=${cobRestoMes}-${pagRestoMes}`, '', '', '',
    'NO es un error: es futuro. La fila de arriba compara la plata de HOY contra el cierre de TODO el mes, así que esta parte de la diferencia es simplemente lo que todavía no pasó.'])
  const fNoCobrado = push(['   · cobros de este mes que el cuadro cuenta y NO tienen estado "Cobrado"', '', '', '',
    `=SUMIFS(${C}!$M$5:$M$400;${C}!$Q$5:$Q$400;">="&EOMONTH(TODAY();-1)+1;${C}!$Q$5:$Q$400;"<="&${hoy};${C}!$O$5:$O$400;"<>Cobrado")`,
    '', '', '',
    '⚠ Esto SÍ es un problema: la proyección los da por entrados y su fecha ya pasó. O se cobraron y falta marcarlos, o hay que correr la fecha.'])
  const fResiduo = push(['⇒ LO QUE QUEDA SIN EXPLICAR', '', '', '',
    `=${C_PESOS}${fDifConc}+${C_PESOS}${fResto}+${C_PESOS}${fNoCobrado}`, '', '', '',
    'Este es el número a buscar: plata que se movió y no está en ninguna pestaña. Los dos renglones de arriba ya tienen explicación.'])
  push()

  // ── 7 · ¿DÓNDE ESTÁ EL EFECTIVO COBRADO? ────────────────────────────────────────────────────
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
  push(['7 · ¿DÓNDE ESTÁ EL EFECTIVO COBRADO?'])
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
  const fDup = push(['  · de eso, cargado DOS VECES con el mismo ID', '', '', '',
    `=SUMPRODUCT((Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$Q$5:$Q$400>=${dateF(desdeB)})*(Cobranzas!$Q$5:$Q$400<=${dateF(hastaB)})*(${INDIST_COB})*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))/2`,
    '', '', '',
    '⚠ Mismo ID y mismo importe más de una vez. Caso real del 17/07: San Francisco pagó $16.200.000 en efectivo y quedó cargado dos veces —una al cobrarlo y otra al depositarlo—. Un depósito NO es un cobro: mover plata de la caja al banco no genera ingreso. Se divide por dos porque las dos filas del par suman.'])
  // DE QUÉ COBROS SE COMPONE EL EFECTIVO, uno por uno. El renglón de abajo acusa $15,9M sin
  // explicar; un total no dice de quién. Al 21/07 los cuatro cobros en efectivo son del MISMO
  // cliente —San Francisco— y eso cambia la lectura: no es plata dispersa, es un solo flujo que
  // entró en efectivo y no llegó al banco. Sale de Cobranzas por fórmula, no pega ningún número.
  const CONEF = `(Cobranzas!$N$5:$N$400="Efectivo")*(Cobranzas!$O$5:$O$400="Cobrado")*(Cobranzas!$Q$5:$Q$400>=${dateF(desdeB)})*(Cobranzas!$Q$5:$Q$400<=${dateF(hastaB)})`
  push(['  · cuáles fueron', '', '', '',
    `=IFERROR(TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONEF};TEXT(Cobranzas!$Q$5:$Q$400;"dd/mm")&"  "&IF(Cobranzas!$G$5:$G$400="";"";Cobranzas!$G$5:$G$400&"  ")&TEXT(Cobranzas!$M$5:$M$400;"$#,##0");"")));"")`,
    '', '', '',
    'Cada cobro en efectivo de la ventana, con fecha y cliente. Sale de la misma condición que el total. Si dos tienen el mismo importe, fecha y cliente, ese es el duplicado que descuenta el renglón de arriba.'])
  // ERA EL ÚLTIMO NÚMERO CALCULADO Y PEGADO DE ESTA PESTAÑA. Ahora sale del extracto que vive en
  // _BANCO_RAW: mismo criterio que usaba el código —los créditos cuyo concepto dice "depósito de
  // efectivo"—, pero escrito donde cualquiera lo puede abrir y verificar.
  const fEfDepos = push(['Depositado en efectivo en esa misma ventana', '', '', '',
    '=SUMPRODUCT((_BANCO_RAW!$E$4:$E="entra")*ISNUMBER(SEARCH("deposito de efectivo";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))*IF(ISNUMBER(_BANCO_RAW!$C$4:$C);_BANCO_RAW!$C$4:$C;0))', '', '', '',
    `Extracto del Santander ${BANCO.CORTE}. Los dos números miran los mismos días: comparar un año contra dos semanas no mide nada.`])
  // LOS DEPÓSITOS, UNO POR UNO, PARA QUE EL TOTAL SE PUEDA VERIFICAR.
  //
  // POR QUÉ (21/07). "$9.960.000 depositados" es un número que hay que creer: no se puede contrastar
  // contra el resumen del banco sin abrir el extracto y buscar a mano. El que mira esta pestaña
  // tiene que poder decir "estos tres, tal día, tanto" — sobre todo cuando el renglón de abajo acusa
  // $15.955.646 sin explicar. La lista sale de la misma fórmula que el total, así que no puede
  // decir algo distinto, y no pega un solo número: es TEXTJOIN sobre la réplica del extracto.
  const CONDEP = '(_BANCO_RAW!$E$4:$E="entra")*ISNUMBER(SEARCH("deposito de efectivo";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))'
  push(['  · cuáles fueron', '', '', '',
    `=IFERROR(TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONDEP};TEXT(_BANCO_RAW!$A$4:$A;"dd/mm")&"  "&TEXT(_BANCO_RAW!$C$4:$C;"$#,##0");"")));"")`,
    '', '', '',
    'Cada depósito de efectivo del extracto, con su fecha. Sale de la misma condición que el total de arriba: si no coinciden, es que la fórmula cambió en un lado solo.'])
  // LA FILA SE GUARDA, NO SE CUENTA. La resta de abajo la referenciaba como "fEfCobrado + 3": al
  // insertar el detalle de los depósitos habría restado la fila equivocada sin dar error. Es el
  // mismo defecto que ya rompió la alerta de echeqs esta misma tarde.
  const fCajaFisica = push(['Declarado hoy en caja física', '', '', '', `=${C_PESOS}${d0}`, '', '', '',
    'La primera fila del bloque 1: la carga a mano.'])
  const fSinExpl = push(['⇒ EFECTIVO SIN EXPLICAR', '', '', '',
    `=${C_PESOS}${fEfCobrado}-${C_PESOS}${fDup}-${C_PESOS}${fEfDepos}-${C_PESOS}${fCajaFisica}`, '', '', '',
    '⚠ Es el efectivo cobrado en la ventana que no se depositó NI aparece en la caja física. Puede tener explicación —un depósito posterior al corte, un pago a proveedor hecho en efectivo sin pasar por el banco— pero no puede quedar sin mirar. Al 21/07: dos filas de Cobranzas por $16.200.000 cada una, el mismo día y del mismo cliente, que el detector de duplicados ya venía marcando.'])
  push()

  push()
  // ── 0 · TIPO DE CAMBIO ──────────────────────────────────────────────────────────────────────────
  // Se define UNA sola vez y acá, que es donde se usa. Cualquier otra fórmula del archivo que
  // necesite convertir dólares referencia el rango con nombre, no esta celda por su fila.
  // ── 8 · QUÉ SALIÓ DEL BANCO Y DÓNDE ESTÁ REGISTRADO ────────────────────────────────────────────
  //
  // POR QUÉ EXISTE (21/07). El bloque 6 dejó el residuo en $13.420.991 "sin explicar", que es el
  // único número de la conciliación que es un problema de verdad. Un residuo global no se puede
  // investigar: hay que abrirlo por naturaleza y preguntarle a cada pestaña si tiene su parte.
  //
  // El extracto trae 65 egresos. Agrupados por lo que SON —no por el concepto literal, que el banco
  // escribe de veinte maneras— quedan nueve grupos, y cada uno tiene una pestaña que debería
  // explicarlo. DOS NO TIENEN NINGUNA: el impuesto al cheque y el costo del descubierto salen todos
  // los meses y ningún cuadro del archivo los espera. Por eso la proyección muestra un saldo que la
  // cuenta nunca llega a tener.
  push(['8 · QUÉ SALIÓ DEL BANCO Y DÓNDE ESTÁ REGISTRADO'])
  push(['Cada peso que salió de la cuenta tiene una pestaña que debería tenerlo. Acá se compara, grupo por grupo, lo que dice el extracto contra lo que dice esa pestaña en los MISMOS días. Una diferencia puede ser carga pendiente o un corte de fechas distinto; lo que no puede pasar es que nadie la mire.'])
  push(['Qué salió', '', 'Según el banco', '', 'Según la pestaña', 'Diferencia', '', 'Qué pestaña lo tiene que tener'])
  const n0 = filas.length + 1
  for (const gr of CONC.GRUPOS) {
    const f = filas.length + 1
    const banco = `=${CONC.segunBanco(gr.naturaleza)}`
    const pest = gr.formula ? `=${gr.formula(CONC.VENTANA.desde, CONC.VENTANA.hasta)}` : ''
    // LA DIFERENCIA SÓLO SE CALCULA CUANDO HAY CON QUÉ COMPARAR. Un "0" donde no hay pestaña se
    // leería como "cuadra", que es exactamente lo contrario de lo que pasa: no hay nada que cuadre.
    const dif = gr.formula ? `=${C_PESOS}${f}-${C_IMP}${f}` : ''
    push([gr.naturaleza, '', banco, '', pest, dif, '',
      gr.pestana ? `${gr.pestana} — ${gr.nota}` : gr.nota])
    // EL DETALLE VA DEBAJO DE SU GRUPO, cuando la diferencia se puede accionar. Un desvío con un
    // total no le sirve a nadie; con el número de cheque y el proveedor se resuelve en dos minutos.
    if (gr.detalle) push(['   · cuáles son', '', '', '', gr.detalle(), '', '', gr.detalleNota ?? ''])
  }
  const n1 = filas.length
  push(['⇒ TOTAL QUE SALIÓ DE LA CUENTA', '', `=SUM(${C_IMP}${n0}:${C_IMP}${n1})`, '', '', '', '',
    'Tiene que ser todo lo que el extracto muestra como salida. Si no coincide, hay un concepto que el clasificador no reconoce y esa plata no está en ninguna fila de arriba.'])
  push(['⇒ Control: lo que el extracto dice que salió', '',
    `=-SUMIFS(_BANCO_RAW!$C$4:$C;_BANCO_RAW!$E$4:$E;"sale")`, '', '', '', '',
    'Los dos números tienen que ser iguales. Distintos = apareció un concepto nuevo en el banco sin grupo asignado.'])
  push()

  push(['9 · TIPO DE CAMBIO — sólo se usa para valuar la cuenta en dólares'])
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
  const PANEL = {
    '@TOTAL': `=${C_PESOS}${fTotal}`, '@CHEQUES': `=${C_PESOS}${fCh}`, '@NETA': `=${C_PESOS}${fNeta}`, '@AIRE': `=${C_PESOS}${fAire}`,
    '@DIFECHEQ': `=${C_IMP}${gDif}`, '@DIFCONC': `=ABS(${C_PESOS}${fDifConc})`, '@SINEXPL': `=${C_PESOS}${fSinExpl}`,
    // Si el banco no reporta ningún echeq en custodia, la cartera es cero y hay que decirlo con un
    // cero: un rango vacío daría #REF! y un total en blanco se leería como "falta cargar".
    '@CARTERA': cust1 >= cust0 ? `=SUM(${C_IMP}${cust0}:${C_IMP}${cust1})` : '0',
    // La cuenta escrita, con las filas reales. Se arma acá porque recién ahora se sabe dónde quedó
    // cada bloque: escribirla a mano en el texto de arriba la dejaría vieja en la primera corrida
    // que mueva una fila — que es exactamente lo que ya pasó con "Bloque 6".
    '@ORIGEN_ECHEQ': `=CONCATENATE("Endosados a un proveedor: son un pago hecho, no un ingreso futuro. Corregir en Cobranzas.   ▸ SALE DE LA FILA ${gDif}: lo que Cobranzas dice que hay en echeq (";TEXT(${C_IMP}${gControl};"$#,##0");") menos lo que el banco tiene en custodia (";TEXT(${C_IMP}${fValores};"$#,##0");")")`,
    '@ORIGEN_CONC': `=CONCATENATE("O faltan movimientos por cargar, o el saldo inicial del cuadro quedó viejo. Mientras no cierre, la proyección de caja no se puede usar para decidir.   ▸ SALE DE LA FILA ${fDifConc}: la plata que hay hoy (";TEXT(${C_PESOS}${fDecl};"$#,##0");") menos la que el Cash Flow Mensual proyecta para esa fecha (";TEXT(${C_PESOS}${fProy};"$#,##0");")")`,
    '@ORIGEN_EFVO': `=CONCATENATE("Puede tener explicación (un depósito posterior al corte, un pago en efectivo sin pasar por el banco), pero no puede quedar sin mirar.   ▸ SALE DE LA FILA ${fSinExpl}, en el bloque 7: el efectivo que Cobranzas dice cobrado, menos lo que el extracto muestra depositado, menos lo que hay en la caja física.")`,
  }
  for (const f of filas) f.forEach((c, j) => { if (typeof c === 'string' && PANEL[c]) f[j] = PANEL[c] })

  return { filas, n0, n1, usd, fTitulos, fCifras, fAire, fDias, fRitmo, fAlerta0, fAlerta1, fBancoPesos, fTasa, d0, d1, g0, g1, gControl, gDif, cab0, cab1, cab3, fTC, fRef, fDec, fTotal, fUSD, fNeta, fCh, fLim, fDisp, fAcu, fDecl, amarillas }
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
    // La réplica del extracto. Si no está, el saldo del banco vuelve al número declarado y la línea
    // de movimientos posteriores no se escribe: sin corte confiable, esa ventana no se puede acotar.
    bancoRaw: hojas.some((h) => h.title === '_BANCO_RAW') ? '_BANCO_RAW' : null,
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
  // ═══ NO SE BORRA HASTA SABER QUE LO NUEVO SE PUEDE ESCRIBIR ═══
  //
  // POR QUÉ (21/07). Esta pestaña es la ÚNICA donde una persona carga números a mano. Una corrida
  // falló DESPUÉS del clear —filas de 9 columnas contra una grilla de 8, y la API rechaza el batch
  // entero— y la pestaña quedó vacía. En la corrida siguiente el rescate leyó una pestaña ya
  // limpia, no encontró nada que rescatar, y los $1.725.000 de "Caja en pesos" que alguien había
  // tipeado se perdieron.
  //
  // El error no fue el ancho: fue el ORDEN. Borrar es irreversible y escribir puede fallar, así que
  // lo que puede fallar va primero. Acá se valida la forma de la grilla ANTES de tocar nada.
  const malas = g.filas.map((f, i) => (f.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que la tabla (${ANCHO} columnas): ${malas.slice(0, 5).join(', ')}. NO borro nada.`)
  if (!g.filas.length) throw new Error('la grilla salió vacía: no borro la pestaña')
  // EL BORRADO CUBRE TODA LA PESTAÑA, NO UNA FILA DECLARADA A MANO.
  //
  // Decía A1:Z90 y la grilla ya llega a la 105: las filas de más abajo conservaban lo de la corrida
  // anterior y la escritura nueva quedaba a medias — el bloque 8 apareció con los rótulos y sin sus
  // fórmulas, tres grupos en blanco y $731.820 fuera del control. A la segunda corrida se arreglaba
  // solo, que es la peor forma de fallar: no se puede reproducir mirando.
  //
  // Es el mismo defecto de ventana fija que ya hizo mentir al censo de números pegados. El alto se
  // pregunta, no se declara.
  const hasta = Math.max(g.filas.length + 20, hoja.rows ?? 0)
  await google.clearValues(ID, `${tab}!A1:Z${hasta}`)
  await google.batchUpdateValues(ID, [{ range: `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g, tab)

  // LOS NOMBRES, DESPUÉS DE ESCRIBIR. El Cash Flow Mensual ancla su saldo inicial en estos dos: con
  // referencias por celda, insertar un bloque acá arriba dejaba sus dos filas de efectivo vacías y
  // sin avisar. Un nombre sigue a la celda aunque se mueva, y por eso el orden de los pasos del
  // agente deja de importar.
  await publicar(google, ID, hoja.sheetId, [
    { name: N_CAJA.total, fila: g.fTotal, col: 5 },
    { name: N_CAJA.fecha, fila: g.d1, col: 6 },
  ])

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

async function formatear(google, sheetId, g, tab) {
  // ═══ LOS COLORES SALEN DEL ESTÁNDAR ÚNICO, NO DE CUATRO CONSTANTES DE ESTA PESTAÑA ═══
  //
  // POR QUÉ (21/07). El dueño: "los colores, lo que dice la información, cómo la refleja, todo es un
  // desastre". Acá había cuatro colores definidos a mano —un azul, un gris, un amarillo y un verde—
  // que no eran los del resto del archivo. Al pasar de CAJA a cualquier otra pestaña parecía otro
  // documento, y peor: el mismo verde significaba "control" en una fila y "acordado con el banco" en
  // otra. Un color que significa dos cosas no comunica nada.
  //
  // Ahora hay UNA paleta (lib/estilo-pestana.mjs) y cada color tiene un solo significado:
  //   · encabezado  → el rótulo de una tabla
  //   · total       → una fila que suma
  //   · alerta      → algo que hay que mirar
  //   · proyectado  → un número que todavía no pasó
  //   · AMARILLO    → lo ÚNICO que una persona escribe a mano. Es el color más importante de esta
  //                   pestaña y por eso es el único que no se toca.
  const AZUL = E.COLOR.encabezado
  const GRIS = E.COLOR.total
  const AMARILLO = { red: 1, green: 0.98, blue: 0.86 }
  const VERDE = E.COLOR.ok
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  // ═══ SE RESETEA TODO AL ESTÁNDAR, Y RECIÉN DESPUÉS SE PINTAN LAS EXCEPCIONES ═══
  //
  // POR QUÉ (21/07). El dueño: "tiene mil formatos de letras y colores distintos la pestaña caja,
  // ¿eso es world class?". Medido: DOS tipografías (Arial y Calibri), SEIS tamaños, NUEVE colores de
  // texto —con tres rojos y tres grises apenas distintos— y NUEVE fondos, con dos azules casi
  // iguales. No era un estándar: era sedimento de todas las versiones anteriores de la pestaña.
  //
  // La causa: este formateador sólo APLICABA formato, nunca lo sacaba, así que cada corrida dejaba
  // encima lo suyo y debajo quedaba lo viejo. El mismo defecto que ya había hecho ilegible otra
  // pestaña. Ahora la primera operación devuelve TODO al estándar del archivo —una tipografía, un
  // tamaño de cuerpo, un negro, fondo blanco— y a partir de ahí cada excepción se pinta a propósito.
  const req = [
    { unmergeCells: { range: r(0, n) } },
    E.reset(sheetId, Math.max(n + 20, 90), ANCHO),
  ]
  // TODO FORMATO PASA POR conFuente: si define textFormat sin nombrar la tipografía, Sheets la
  // reemplaza por la de la hoja y la celda queda en otra fuente. Ver lib/estilo-pestana.mjs.
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

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
    { horizontalAlignment: 'CENTER', textFormat: { fontSize: E.TAM.nota, fontFamily: E.FUENTE } })
  fmt(r(0, n, 5, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 6, 7), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 7, 9), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: E.TAM.nota, italic: true, foregroundColor: E.COLOR.nota }, wrapStrategy: 'CLIP' })
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
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  // ── EL PANEL DE TITULARES ────────────────────────────────────────────────────────────────────
  // Grande, con aire, y con la unidad declarada: es lo primero que se ve al abrir la pestaña.
  if (g.fTitulos && g.fCifras) {
    fmt(r(g.fTitulos - 1, g.fTitulos), 'userEnteredFormat',
      { backgroundColor: AZUL, textFormat: { bold: true, fontSize: E.TAM.nota, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
    fmt(r(g.fCifras - 1, g.fCifras), 'userEnteredFormat',
      { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' })
    fmt(r(g.fCifras, g.fCifras + 1), 'userEnteredFormat',
      { numberFormat: { type: 'TEXT' }, textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: g.fCifras - 1, endIndex: g.fCifras }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })
    // "Lo que ya está comprometido" se lee mejor en rojo suave: es lo que hay que restar.
    // Cada titular ocupa dos columnas: se combinan para que el número tenga aire.
    for (const c of [0, 2, 4, 6]) {
      req.push({ mergeCells: { range: r(g.fTitulos - 1, g.fTitulos, c, c + 2), mergeType: 'MERGE_ROWS' } })
      req.push({ mergeCells: { range: r(g.fCifras - 1, g.fCifras, c, c + 2), mergeType: 'MERGE_ROWS' } })
      req.push({ mergeCells: { range: r(g.fCifras, g.fCifras + 1, c, c + 2), mergeType: 'MERGE_ROWS' } })
    }
    // Lo comprometido se resta: va en el color de alerta. Lo que queda, en el de un total.
    fmt(r(g.fCifras - 1, g.fCifras, 2, 4), 'userEnteredFormat.backgroundColor', { backgroundColor: E.COLOR.alerta })
    fmt(r(g.fCifras - 1, g.fCifras, 4, 6), 'userEnteredFormat.backgroundColor', { backgroundColor: E.COLOR.total })
  }

  // ── EL BLOQUE DE ALERTAS SE VE COMO UNA ALERTA ──────────────────────────────────────────────
  // Con el formato del resto de la pestaña, "$47.681.181 de diferencia" se lee igual que un saldo.
  if (g.fAlerta0 && g.fAlerta1 > g.fAlerta0) {
    fmt(r(g.fAlerta0 - 1, g.fAlerta0), 'userEnteredFormat', { ...E.bloque(), backgroundColor: E.COLOR.alerta, textFormat: { ...E.bloque().textFormat, foregroundColor: E.COLOR.alertaTexto } })
    fmt(r(g.fAlerta0 + 1, g.fAlerta0 + 2), 'userEnteredFormat', E.encabezado())
    fmt(r(g.fAlerta0 + 2, g.fAlerta1, 2, 3), 'userEnteredFormat',
      { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.bloque, fontFamily: E.FUENTE_NUM, foregroundColor: E.COLOR.alertaTexto }, horizontalAlignment: 'RIGHT' })
    // La columna "qué hacer" son frases de 90 caracteres: se combinan a lo ancho y la fila crece.
    // Con una sola columna quedaban cortadas justo donde dice qué hay que hacer.
    for (let i = g.fAlerta0 + 2; i < g.fAlerta1; i++) {
      req.push({ mergeCells: { range: r(i, i + 1, 3, ANCHO), mergeType: 'MERGE_ROWS' } })
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } })
    }
    fmt(r(g.fAlerta0 + 2, g.fAlerta1, 3, ANCHO), 'userEnteredFormat', { ...E.nota(), wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' })
    fmt(r(g.fAlerta0 + 2, g.fAlerta1, 0, 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }

  // ── EL BLOQUE 8: DOS COLUMNAS DE IMPORTES Y UNA DE DIFERENCIA ──────────────────────────────────
  // La columna de diferencia salía con formato de FECHA heredado de la columna vecina y mostraba
  // "30/03/87349" donde hay -$899.154. Un desvío disfrazado de fecha no lo lee nadie.
  if (g.n0 && g.n1 >= g.n0) {
    fmt(r(g.n0 - 2, g.n1 + 2, 2, 3), 'userEnteredFormat', E.celda('moneda'))
    fmt(r(g.n0 - 2, g.n1 + 2, 4, 5), 'userEnteredFormat', E.celda('moneda'))
    fmt(r(g.n0 - 1, g.n1, 5, 6), 'userEnteredFormat', E.celda('moneda'))
    fmt(r(g.n0 - 2, g.n0 - 1, 0, ANCHO), 'userEnteredFormat', E.encabezado())
  }

  // LOS DÍAS DE CAJA SON DÍAS. Con el formato moneda de la columna, "2 días" se dibujaba como "$2":
  // el número más importante de la pestaña leído como dos pesos.
  if (g.fDias) {
    fmt(r(g.fDias - 1, g.fDias, 2, 3), 'userEnteredFormat',
      { numberFormat: { type: 'NUMBER', pattern: '0" días";;"—"' }, textFormat: { bold: true, fontSize: E.TAM.bloque, fontFamily: E.FUENTE_NUM }, horizontalAlignment: 'CENTER' })
    fmt(r(g.fDias - 1, g.fDias, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
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
      { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: E.TAM.nota }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
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
      { textFormat: { fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota } })
    req.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.g0 - 1, endIndex: g.g1 } } })
    req.push({ updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.g0 - 1, endIndex: g.g1 }, depth: 1, collapsed: false }, fields: 'collapsed' } })
  }
  fmt(r(g.fTotal - 1, g.fTotal), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: GRIS })
  fmt(r(g.fNeta - 1, g.fNeta), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, fontSize: E.TAM.cuerpo }, backgroundColor: VERDE })
  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    // EL RÓTULO DE UN BLOQUE SE VE COMO UN BLOQUE, con el estilo del archivo y no con una negrita
    // suelta. Y ocupa la fila entera: no compite con ninguna columna.
    if (/^\d+ · |^CÓMO SE ACTUALIZA|^COSTO DE USAR/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat', E.bloque())
    if (/^⇒/.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
    // ── LOS PÁRRAFOS DE EXPLICACIÓN NECESITAN ALTO ──────────────────────────────────────────────
    // La introducción tiene 307 caracteres y la del bloque de crédito 332, las dos en filas de 20px:
    // se leía la primera línea y el resto quedaba abajo del borde. Se combinan a lo ancho y la fila
    // crece lo que haga falta, con tope: un párrafo no puede empujar la tabla media pantalla.
    const explicacion = t.length > 120 && !String(f[1] ?? '').trim() && !String(f[4] ?? '').trim()
    if (explicacion) {
      req.push({ mergeCells: { range: r(i, i + 1, 0, ANCHO), mergeType: 'MERGE_ROWS' } })
      fmt(r(i, i + 1, 0, ANCHO), 'userEnteredFormat', { ...E.nota(), wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' })
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: altoDeParrafo(t, ANCHOS.reduce((a, b) => a + b, 0)) }, fields: 'pixelSize' } })
    }
  })

  // ── EL ORIGEN DEL DATO: ETIQUETA EN LA CELDA, TEXTO COMPLETO EN LA NOTA ────────────────────────
  // Hasta hoy había orígenes de 207 caracteres en una celda donde entran 48. La procedencia de cada
  // saldo —lo que hace que el número sea creíble— estaba escrita y no se podía leer.
  const COL_ORIGEN = 7
  const { requests: notas, celdas, conNota } = notasDeColumna(g.filas, COL_ORIGEN, sheetId, entranEn(ANCHOS[COL_ORIGEN]))
  if (conNota) {
    await google.batchUpdateValues(ID, [{ range: `'${tab}'!${letra(COL_ORIGEN)}1`, values: celdas.map((f) => [f[COL_ORIGEN] ?? '']) }])
    req.push(...notas)
    console.log(`  ${conNota} orígenes largos pasaron a nota: la celda muestra la etiqueta, el detalle está a un click`)
  }
  fmt(r(0, g.filas.length, COL_ORIGEN, COL_ORIGEN + 1), 'userEnteredFormat', E.nota())

  const ancho = ANCHOS
  ancho.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
