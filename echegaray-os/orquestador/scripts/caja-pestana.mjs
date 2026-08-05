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
import { MONEDA_TOTAL } from '../lib/formato-statement.mjs'
// `notasDeColumna` NO se importa, y no es un olvido: es la función que escribía las notas de la
// columna H. Un test de orquestador/lib/sin-notas-generadas.test.mjs impide que vuelva a entrar.
import { altoDeParrafo } from '../lib/nota-celda.mjs'
import { CUENTAS, CARGA, ALIAS, TIPO_CAMBIO, RANGO_TC, filaDeCuenta } from '../lib/caja-disponibilidades.mjs'
import * as BANCO from '../lib/banco-santander.mjs'
import { TASAS, CARGO_VERIFICADO, tasaDiaria, costoConImpuestos, interesDelPeriodo } from '../lib/costo-descubierto.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
// `limpiarCentinela` deja de hacer falta: existía para la SEGUNDA escritura (la columna de orígenes),
// que no pasaba por la fusión y mandaba " ::VACIO:: " literal a la planilla. Esa escritura ya no está.
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { CAJA as N_CAJA, publicar } from '../lib/rangos-nombrados.mjs'
import { esIndistinguible } from '../lib/cobranzas-duplicado.mjs'
import * as CONC from '../lib/conciliacion-por-naturaleza.mjs'
import { formulaEgresoDiario } from '../lib/egreso-diario.mjs'
import { rotuloAlDia, formulaAntiguedad } from '../lib/fecha-de-frescura.mjs'
import { formulaFrescuraCaja, formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte, formulaNetaEfectivoPosterior, formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaComprasPagadasPosteriores, formulaJornalesBancoPosteriores, celdaJornalesEfectivo, formulaOficinaBancoPosteriores, formulaOficinaSinCanal, celdaOficinaEfectivo, celdaExtraccionesEfectivo, formulaCobrosUsdEfectivoPosteriores } from '../lib/caja-posterior-al-corte.mjs'
// `origenCajaEnPesos` ya NO se importa: era el texto que iba a la columna H de la fila del arqueo.
import { formulaCajaEnPesos, celdaCobrosEfectivo, celdaPagosEfectivo, celdaDepositosEfectivo, NETO_NO_SUMA_EN_PESOS, IDENTIDAD } from '../lib/caja-efectivo-fisico.mjs'
// LA CARTERA DE VALORES SALE DE LA RÉPLICA DE CHEQUES, NO DE UN ARRAY DE JAVASCRIPT (30/07). Ver
// lib/cartera-cheques.mjs: es el arreglo del "$10.000.000 en CAJA con $10.290.000 en cartera" y del
// calendario de vencimientos que leía DOS CELDAS FIJAS.
import { EN_CARTERA, formulaCartera, formulaCarteraTramo, formulaImporteEnCartera, formulaFechaDeCheque, formulaCanarioDetalle } from '../lib/cartera-cheques.mjs'
// LA DEFINICIÓN ÚNICA DE "QUÉ SALE DE LA CAJA Y CUÁNDO". El calendario de esta pestaña dejó de tener
// su propia lista de egresos: toma la del cuadro del cash flow, cortada por ventana de fechas en vez
// de por mes. Ver lib/calendario-egresos.mjs — es el arreglo de los $41,7M de desacuerdo entre las
// dos vistas de la misma plata.
import { expresionSaleEnVentana, lineasDeCaja, marcaDeLinea, conceptosFueraDelCalendario } from '../lib/calendario-egresos.mjs'
import { formulaChequesSinFactura, formulaCalendarioImpuestosSemana, INSTRUMENTOS, CALENDARIO_IMPUESTOS, rotulosCalendarioImpuestos } from '../lib/cash-flow-lineas.mjs'
import { MARCAS, expresionTieneNumero } from '../lib/cheques-cobertura.mjs'

// LA MISMA definición de "dos cobros que no se pueden distinguir" que usa el control de la pestaña
// Cobranzas. Antes acá había una segunda basada en el ID, y al reparar la columna A —que se
// autonumera y no puede repetirse— esa versión pasó a dar cero sobre un duplicado que sigue existiendo.
const INDIST_COB = esIndistinguible('Cobranzas', 5, 400)

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'
const DRY = process.argv.includes('--dry')

// ═══ EL ARQUEO VIVE EN SU PROPIO BLOQUE, Y SE CITA POR NOMBRE (01/08) ═══
//
// Antes el ancla era `$F$7` — una celda del bloque de saldos. Citarla por posición ataba las seis
// fórmulas del efectivo a que esa fila nunca se moviera; con el nombre, se mueve el bloque y las
// fórmulas siguen apuntando bien. Es la misma razón por la que la nómina se cita por rango con
// nombre desde el 31/07.
const ARQ_ARS = 'CAJA_ARQUEO_ARS'
const ARQ_ARS_FECHA = 'CAJA_ARQUEO_ARS_FECHA'
const ARQ_USD = 'CAJA_ARQUEO_USD'
const ARQ_USD_FECHA = 'CAJA_ARQUEO_USD_FECHA'

/** La valuación estándar de una fila de cuenta: importe en su moneda × tipo de cambio. */
const saldoEnPesos = (f) => `=IF(C${f}="";"";C${f}*IF(D${f}="";1;D${f}))`


// A concepto · B moneda · C importe en origen · D tipo de cambio · E importe en pesos ·
// F fecha · G antigüedad · H —
//
// ═══ LA COLUMNA H NO LLEGA A LA PLANILLA, Y ES A PROPÓSITO (03/08) ═══
//
// El dueño, textual: "esas aclaraciones de mierda yo siempre las saco y elimino todo lo q vos anotas
// en columna h". No es la primera vez —ya lo había pedido para Impuestos y Cargas Sociales, donde el
// generador dejó de emitir su columna "De dónde sale"— y sin embargo la corrida de hoy le puso 66
// celdas de prosa otra vez. Un generador que reescribe la explicación en cada pasada le gana siempre
// a una persona que la borra una vez.
//
// LA REGLA: el generador escribe el DATO; la explicación vive en el código y en la documentación.
//
// Los textos de procedencia SIGUEN en las llamadas a `push` de este archivo: son el "por qué" de cada
// fila y perderlos sería perder trazabilidad. Lo que cambió es que ya no pueden SALIR: `push` fuerza
// la columna al centinela VACIO, que significa "esta celda es MÍA y va vacía". No es un acuerdo entre
// autores —eso ya se olvidó una vez, por un merge— es una celda que el código no deja escribir.
//
// LO QUE ESTE CAMBIO NO HACE, DICHO ANTES DE QUE SE LO CREA NADIE: no borra las 66 celdas que quedaron
// en la planilla. `lib/no-borrar.mjs` frena TODA escritura que deje vacía una celda con contenido, sin
// bypass y a propósito. Lo que este cambio garantiza es que el generador no las vuelva a producir; las
// que ya están las saca una persona, una vez, y esta vez no vuelven.
const ANCHO = 8
/** La columna de prosa. Se sigue emitiendo con el centinela —en vez de dejar de emitirse— para que la
 *  intención quede DECLARADA: la columna es del generador y va vacía. Ver el bloque de arriba. */
const COL_PROSA = 7
/** El ancho de cada columna. La última mide lo mínimo: existe para limpiarse, no para leerse. */
const ANCHOS = [400, 64, 148, 96, 152, 104, 96, 24]
const C_IMP = 'C', C_TC = 'D', C_PESOS = 'E'
/** El índice 0-based de la columna de pesos, para escribir directo en la matriz de filas. */
const C_PESOS_I = C_PESOS.charCodeAt(0) - 65

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
export function rescatar(previo) {
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

export function grilla(cargado, refs, cartera = carteraDeRespaldo()) {
  // El tipo de cambio se referencia por su RANGO CON NOMBRE. Así el bloque que lo calcula puede
  // vivir al pie de la pestaña —que es donde corresponde en una empresa que mueve todo en pesos—
  // sin que las filas de arriba dependan de en qué fila quedó.
  const TC = RANGO_TC
  const filas = []
  // Las filas en dólares se anotan para pintarlas distinto. Un saldo de U$S 581,39 mostrado como
  // "$581" con signo de peso se lee como 581 pesos: es un error de lectura de tres órdenes de
  // magnitud, y sólo se ve mirando la pantalla.
  const usd = []
  // ═══ EL CENTINELA `AJENA`: UNA CELDA QUE NO ES MÍA (01/08) ═══
  //
  // `push` convierte toda celda vacía en el centinela VACIO, que significa "es mía y va vacía" — y por
  // eso la fusión la LIMPIA. Perfecto para el 99% de la grilla y catastrófico para una celda de CARGA:
  // las dos celdas del arqueo declarado salían con VACIO y le habrían borrado el conteo al dueño en la
  // primera corrida. Lo cazó el render en frío, no un test: el test decía `vacia()` y VACIO pasa por
  // vacía. Ahora `AJENA` marca las celdas que el generador deja explícitamente en manos de una persona;
  // se convierten en `undefined`, que la fusión preserva.
  const AJENA = Symbol('celda del dueño: no la escribo ni la borro')
  const push = (c = []) => {
    // Se rellena Y SE TRUNCA a lo que mide la tabla: al sacar la columna "Declarado por" quedaron
    // filas de nueve elementos contra una grilla de ocho, y el batch entero falla sin escribir nada.
    const r = [...c].map((x) => (x === AJENA ? undefined : (x === '' || x === undefined || x === null ? VACIO : x)))
    while (r.length < ANCHO) r.push(r.__ajena ? undefined : VACIO)
    r.length = ANCHO
    // EL PORTÓN DE LA COLUMNA DE PROSA. Ver el comentario de COL_PROSA arriba: el texto de procedencia
    // que traiga la fila se descarta acá, en el único lugar por el que pasan TODAS las filas. Puesto en
    // cada llamada sería un acuerdo que la próxima llamada olvida — y ya se olvidó una vez.
    r[COL_PROSA] = VACIO
    filas.push(r)
    if (r[1] === 'USD') usd.push(filas.length)
    return filas.length
  }
  // El valor que el dueño ya había cargado para una cuenta, o vacío la primera vez.
  const previo = (cuenta, campo) => cargado.get(cuenta)?.[campo] ?? ''

  push(['Posición de caja'])
  // LA FILA 2 DICE QUÉ CONTESTA LA PESTAÑA, DE DÓNDE SALE Y A QUÉ FECHA. Era la única del archivo que
  // arrancaba en el titular sin decir de qué está hablando ni a qué corte.
  //
  // Y LA FECHA SALE DEL DATO, NO DEL RELOJ (03/08). Era `new Date()`: declaraba la frescura de la
  // CORRIDA, no la del dato. Con el pipeline detenido eso es una mentira que se lee como un hecho —
  // el rótulo dice "al 03/08" porque alguien corrió el script, aunque el último movimiento sea del
  // 24/07. Ahora es la más nueva de LAS TRES PUERTAS que mueven esta caja (extracto, compras pagadas,
  // cobranzas), calculada por Sheets: cambia cuando cambia el dato, sin que corra nadie. Ver
  // formulaFrescuraCaja — las mismas columnas que ya mueven el saldo, para que el número y su fecha
  // no puedan contradecirse.
  push([rotuloAlDia(
    'Cuánta plata hay de verdad, qué ya está comprometido y hasta cuándo alcanza · extracto Santander, Cobranzas, Compras, Cheques Emitidos y Cheques Recibidos',
    formulaFrescuraCaja({ bancoRaw: refs.bancoRaw }),
  )])
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
  // CRITERIO PERCIBIDO (27/07). El dueño: "es criterio del percibido, o sea si yo marco q la plata
  // salió ahí recién sale". Bajo percibido la posición de hoy es la plata que REALMENTE hay: los
  // cheques emitidos no debitados TODAVÍA no salieron (salen en el calendario cuando se debitan), y
  // los valores a depositar (echeq en custodia, confirmado por el dueño el 27/07) TODAVÍA no entraron
  // (entran en el calendario al acreditarse). Restar los cheques de la posición o contar el echeq como
  // caja de hoy los contaba DOS VECES (una en la posición y otra en el calendario). Por eso el titular
  // ya no es "liquidez neta" (que restaba cheques no salidos) sino el PISO PROYECTADO: lo más bajo que
  // llega la caja proyectando todo — el número que de verdad dice si la caja alcanza.
  // ═══ EL TITULAR CONTESTA LAS DOS PREGUNTAS QUE EL DUEÑO HIZO, SIN QUE NADIE SE LAS EXPLIQUE ═══
  //
  // POR QUÉ CAMBIA (04/08). Textual: "el concepto piso proyectado en caja es super confuso, ¿qué es?
  // ¿lo puedo usar para invertir o qué?" y "¿cuánto me va a quedar a fin de mes al cubrir todas las
  // obligaciones? necesito ver ese dato en caja, ¿es piso de caja eso?".
  //
  // NO, NO ES EL MISMO NÚMERO, y ahí estaba el problema: el titular publicaba uno solo y no decía
  // cuál de los dos era. Son dos preguntas de tesorería distintas y las dos se deciden:
  //
  //   · EL PISO es el punto MÁS BAJO de todo el recorrido, y su fecha. Es el techo de lo que se
  //     puede inmovilizar y el plazo máximo del instrumento: si la caja toca su mínimo el 11/08,
  //     ningún plazo fijo puede vencer el 12. Contesta "¿puedo invertir?".
  //   · LO QUE QUEDA AL CIERRE DEL MES es el saldo después de cubrir todo lo que vence hasta esa
  //     fecha. Contesta "¿con cuánto arranco el mes que viene?". Es siempre mayor o igual al piso.
  //   · LO COLOCABLE es el piso MENOS la caja mínima deseada. Un piso de $99M con un mínimo de $20M
  //     no son $99M para invertir: son $79M. Publicar el piso a secas invitaba a inmovilizar la
  //     reserva operativa entera.
  //
  // Y SE VA EL "CRÉDITO NO UTILIZADO" DEL TITULAR. Estaba pegado a las disponibilidades y no es plata
  // propia: es capacidad de endeudarse. NIC 7 clasifica el uso del descubierto como actividad de
  // FINANCIACIÓN —sólo lo admite dentro del efectivo cuando el propio giro en descubierto es parte
  // integral de la gestión de caja, que no es el caso acá— y una línea no girada no es un activo de
  // ninguna manera: es un compromiso del banco. Sigue estando, entero, en el bloque 3, cuyo título ya
  // dice "NO SON EFECTIVO". Al lado de un saldo, se sumaba con el ojo.
  //
  // Y se va "CHEQUES POR DEBITAR": bajo criterio percibido NO se resta de las disponibilidades (no
  // salieron todavía), así que ponerlo al lado invitaba justo a la resta que este cuadro evita. Es un
  // insumo del piso —ya está adentro del calendario— y sigue con su fila propia en el bloque 1.
  const fTitulos = push(['DISPONIBILIDADES HOY', '', 'PISO DE CAJA — EL PUNTO MÁS BAJO', '', 'QUEDA AL CIERRE DE ESTE MES', '', 'COLOCABLE SIN TOCAR LA OPERACIÓN', ''])
  const fCifras = push(['@TOTAL', '', '@PISO', '', '@FINDEMES', '', '@COLOCABLE', ''])
  // El pie de cada titular dice QUÉ ENTRA en esa cifra, no qué se siente al mirarla. "Con esto se
  // decide" era un consejo; lo que hace falta es la definición. Tres de los cuatro son FÓRMULAS: la
  // fecha del piso y la del cierre del tramo cambian solas, y un pie escrito a mano con una fecha
  // adentro es un número pegado que envejece sin avisar.
  push(['@PIE1', '', '@PIE2', '', '@PIE3', '', '@PIE4', ''])
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
  // El bloque "⚠ LO QUE NO CIERRA" se construye MÁS ABAJO, adentro de CONTROLES.

  // ── 1 · DISPONIBILIDADES ────────────────────────────────────────────────────────────────────────
  // ═══ POR QUÉ ESTOS TÍTULOS Y NO LOS DE ANTES (23/07) ═══
  //
  // El dueño: "los títulos de la pestaña caja no son los que pondrían en JPMorgan, además de que son
  // confusos". Las dos cosas eran ciertas, y por dos motivos distintos:
  //
  //   EL VOCABULARIO. "LA PLATA QUE HAY", "AIRE", "¿DÓNDE ESTÁ EL EFECTIVO COBRADO?". Un estado de
  //   liquidez usa los términos que cualquier tesorero y cualquier contador reconocen —
  //   DISPONIBILIDADES, LIQUIDEZ NETA, LÍNEAS DE CRÉDITO NO UTILIZADAS— y no la forma en que uno se
  //   lo contaría a un amigo. No es pompa: es que "aire" no significa nada fuera de esta oficina, y
  //   el día que este cuadro lo mire un banco o un contador, tiene que entenderse solo.
  //
  //   LA JERARQUÍA. Había TRECE secciones al mismo nivel, y las últimas nueve eran en realidad el
  //   anexo de la cuarta: viven adentro de su grupo desplegable. Numeradas todas igual, nada decía
  //   que las tres primeras contestan la pregunta —cuánta plata hay, qué está comprometido, cuánto
  //   crédito queda— y que el resto es el respaldo. Ahora el número lo dice: 1, 2, 3 y un 4 con sus
  //   4.1 a 4.9. Ninguna fila se movió; cambió lo que se lee.
  push(['1 · DISPONIBILIDADES POR CUENTA'])
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
      // ═══ CADA CUENTA SE FECHA CON SU PROPIA FUENTE (01/08) ═══
      //
      // El dueño, tres veces: *"aún noto desactualizadas las fechas"*, *"cambiá las fechas de todo
      // CAJA según corresponde según extracto bancario auditado"*. El defecto no era que estuvieran
      // viejas: era que TRES cuentas se fechaban con la fuente de OTRA.
      //
      //   · "Caja en pesos" y "Caja en dólares" decían =TODAY(). El saldo lo cargás vos contando el
      //     cajón: fecharlo HOY afirma que lo contaste hoy, sea cierto o no, y encima apaga la
      //     alarma de antigüedad de la columna de al lado — que nunca podía pasar de 0 días. Un
      //     arqueo de hace una semana se veía igual de fresco que uno de esta mañana.
      //   · "Valores a depositar" decía la fecha de corte del EXTRACTO. Son cheques que todavía no
      //     entraron al banco: el extracto no sabe nada de ellos, y esa fecha era prestada.
      //
      // Ahora cada una dice de cuándo es SU dato: el arqueo se fecha con la fecha del arqueo, el
      // banco con el último movimiento del extracto auditado, y lo que el OS calcula sobre el
      // presente (la cartera, los movimientos posteriores) con TODAY(), que ahí sí es la verdad.
      c.banco === 'saldoPesos' && refs.bancoRaw ? formulaFechaCorte(refs.bancoRaw)
        // La CARTERA no está en el extracto: son valores que todavía no entraron al banco. Se calcula
        // hoy, filtrando Cobranzas por fecha de acreditación futura, así que su fecha es hoy.
        : c.banco === 'cartera' ? '=TODAY()'
        : c.banco ? BANCO.CORTE
        : c.arqueo ? `=IF(ISNUMBER(${c.arqueo});${c.arqueo};"")`
        : (c.formula ? '=TODAY()' : previo(c.nombre, 'fecha')),
      // La antigüedad no es decorativa: un saldo de hace 20 días avisando que tiene 20 días vale
      // muchísimo más que el mismo saldo mudo. Arriba de una semana, avisa.
      // El dueño señaló esta columna como EL PATRÓN BUENO —se calcula contra la fecha del saldo, no
      // contra el reloj de la corrida—, así que vive en lib/fecha-de-frescura.mjs y de ahí la toman
      // también los subtítulos. Copiada en dos lugares se arreglaría en uno y seguiría rota en el otro.
      formulaAntiguedad(`F${f}`),
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
      'El NETO de las dos líneas de abajo: lo que entró menos lo que salió después del corte del extracto. El extracto ya trae lo anterior; esto es sólo lo que todavía no muestra. Los echeq quedan afuera (ya están en Valores a depositar).',
      'Se calcula solo'])
    // Desglose para que el número de arriba se ENTIENDA: de qué se compone. Van con el valor en la
    // columna de origen y SIN valor en pesos, para que se vean pero no se sumen de nuevo al total.
    push(['   · (+) cobros acreditados después del corte', 'ARS',
      `=${formulaCobrosPosteriores(`$F$${fBancoPesos}`)}`, '', '', '', '',
      'La plata que ENTRÓ después del corte y el extracto todavía no muestra: cobranzas en estado Cobrado (sin echeq), con fecha posterior al corte.', ''])
    push(['   · (−) pagos debitados después del corte', 'ARS',
      `=-(${formulaChequesDebitadosPosteriores(`$F$${fBancoPesos}`)}+${formulaComprasPagadasPosteriores(`$F$${fBancoPesos}`)})`, '', '', '', '',
      'Lo que SALIÓ después del corte: cheques propios debitados + compras pagadas por transferencia/débito, con fecha posterior al corte.', ''])
    // LA NÓMINA POR BANCO, EN SU PROPIO RENGLÓN (01/08). Va separada de la línea de arriba a propósito:
    // es la salida más grande y más regular de la empresa, y mezclarla con los cheques la vuelve
    // invisible justo cuando hay que explicar por qué bajó la caja.
    push(['   · (−) jornales pagados por transferencia después del corte', 'ARS',
      `=-(${formulaJornalesBancoPosteriores(`$F$${fBancoPesos}`)})`, '', '', '', '',
      'Jornales por Quincena, columna Banco: el lote de haberes de las quincenas con fecha en "Pagado el" posterior al corte. La plata salió de la cuenta y el extracto todavía no lo muestra.', ''])
    push(['   · (−) sueldos de OFICINA por transferencia después del corte', 'ARS',
      `=-(${formulaOficinaBancoPosteriores(`$F$${fBancoPesos}`)})`, '', '', '', '',
      'Jornales por Quincena, bloque Oficina, columna Banco: los meses con fecha de pago posterior al corte. Si la columna está vacía no se resta nada — el canal no declarado se reporta en "LO QUE NO CIERRA", no se adivina.', ''])
  }
  // ═══ LA LÍNEA QUE HACE QUE LA CAJA FÍSICA SE MUEVA SOLA — EL ESPEJO DE EFECTIVO DEL BANCO (T06) ═══
  //
  // Decisión del dueño: "permitir carga manual de efectivo, pero de ahí mismo se tiene que hacer carga
  // y descarga de manera automática". El arqueo manual de "Caja en pesos" (la fila d0, y su fecha en la
  // columna F) es el ANCLA — el corte de la caja física, igual que el extracto es el corte del banco.
  // De ese corte para adelante esta fila carga los cobros en efectivo y descarga los pagos en efectivo
  // y los depósitos al banco. El número que el dueño tipeó NO se pisa: esta línea es aparte y suma.
  //
  // NO DUPLICA NADA, POR CONSTRUCCIÓN: el banco excluye el efectivo y la caja física cuenta sólo el
  // efectivo (partición por canal, ver lib/caja-posterior-al-corte.mjs). Y la ventana es ">" arqueo:
  // lo anterior ya está DENTRO del arqueo. Un arqueo nuevo, con fecha más reciente, colapsa lo viejo.
  const fPostEf = filas.length + 1
  push(['Movimientos de efectivo posteriores al arqueo', 'ARS',
    formulaNetaEfectivoPosterior(ARQ_ARS_FECHA, { bancoRaw: refs.bancoRaw }),
    // ═══ ESTA FILA YA NO APORTA VALOR EN PESOS (31/07) ═══
    //
    // El dueño: "se realiza una cobranza marcada en esa pestaña como en 'efectivo', ese valor tiene q
    // cargarse en 'caja' directamente. ahora lo suma pero no carga en la celda de 'caja en pesos' como
    // corresponde". Tenía razón en las dos mitades: el neto se calculaba bien y el total lo sumaba
    // bien, pero la celda que él mira —"Caja en pesos"— decía $0. Medido el 31/07: $19.789.659,73 en
    // esta fila y cero arriba.
    //
    // Ahora el neto va A "Caja en pesos" (ver abajo, donde se reescribe su celda de pesos) y esta fila
    // queda como el DESGLOSE de cómo llegó ahí. Su columna de pesos tiene que quedar vacía o el mismo
    // efectivo entraría dos veces en `SUM(E7:E13)`. Ver lib/caja-efectivo-fisico.mjs.
    '', NETO_NO_SUMA_EN_PESOS, '=TODAY()',
    // LA COLUMNA "ANTIGÜEDAD" MIDE 96px: "⚠ cargá un arqueo con fecha" entraba cortado y se leía
    // "gá un arqueo cor", que parece basura y hace desconfiar de toda la fila. El aviso va CORTO acá
    // —cabe— y la instrucción completa vive en la nota de la fila, como el resto de esta pestaña.
    `=IF(${ARQ_ARS_FECHA}="";"⚠ sin arqueo";IF(${C_IMP}${fPostEf}=0;"sin movimientos";"vivo"))`,
    `Ya está sumado arriba, en "Caja en pesos" — acá se muestra abierto, no se cuenta de nuevo. ${IDENTIDAD}. Cobros en efectivo (Cobranzas, estado Cobrado) menos pagos en efectivo (Compras, Pagado/Efectivo) menos depósitos de efectivo al banco. Sin arqueo con fecha no hay ventana y da 0.`,
    'Se calcula solo'])
  // LOS TRES SUMANDOS, UNO POR UNO. Un total solo no se puede discutir: $19,7 millones de efectivo en
  // un cajón es un número que hay que poder abrir. Las tres fórmulas son LAS MISMAS que arma la línea
  // neta (se importan de la lib, no se copian), así que el desglose no puede decir otra cosa que el
  // total. Van con el valor en la columna de origen y SIN valor en pesos: se ven y no se suman.
  push(['   · (+) cobrado en efectivo después del arqueo', 'ARS',
    celdaCobrosEfectivo(ARQ_ARS_FECHA), '', '', '', '',
    'Cobranzas: forma de cobro "Efectivo" Y estado "Cobrado", con fecha de cobro posterior al arqueo. Un proyectado no es plata que esté en el cajón.', ''])
  push(['   · (−) pagado en efectivo después del arqueo', 'ARS',
    celdaPagosEfectivo(ARQ_ARS_FECHA), '', '', '', '',
    'Compras: estado "Pagado" y tipo de pago "Efectivo", por su Fecha de caja. Es el billete que salió del cajón sin pasar por el banco — sin esta resta la caja crecería para siempre.', ''])
  // LA NÓMINA EN EFECTIVO (01/08). Un jornal no es una compra, así que la fila de arriba —que mira
  // sólo Compras— nunca lo veía: el 50% en efectivo de la quincena salía del cajón y la caja física
  // no bajaba un peso. Sale de las columnas Adelanto y Total recibo de Jornales por Quincena, que ya
  // separan el canal y ya se controlan contra el TOTAL de la quincena.
  push(['   · (−) jornales pagados en efectivo después del arqueo', 'ARS',
    celdaJornalesEfectivo(ARQ_ARS_FECHA), '', '', '', '',
    'Jornales por Quincena, columnas Adelanto y Total recibo: lo que se pagó de la nómina en billetes, de las quincenas con fecha en "Pagado el" posterior al arqueo.', ''])
  push(['   · (−) sueldos de OFICINA en efectivo después del arqueo', 'ARS',
    celdaOficinaEfectivo(ARQ_ARS_FECHA), '', '', '', '',
    'Jornales por Quincena, bloque Oficina, columna Efectivo: los sueldos de OFICINA pagados en billetes, por su fecha de pago.', ''])
  push(['   · (+) extraído del banco después del arqueo', 'ARS',
    celdaExtraccionesEfectivo(ARQ_ARS_FECHA), '', '', '', '',
    'Réplica del extracto: los débitos cuyo concepto dice "extracción" o "retiro de efectivo". Es el espejo del depósito — el billete deja la cuenta y entra al cajón, así que acá SUMA. Hoy el extracto no tiene ninguno.', ''])
  if (refs.bancoRaw) {
    push(['   · (−) depositado en el banco después del arqueo', 'ARS',
      celdaDepositosEfectivo(ARQ_ARS_FECHA), '', '', '', '',
      'Réplica del extracto: los créditos cuyo concepto dice "depósito de efectivo". El billete dejó el cajón y entró a la cuenta: baja acá y sube en el saldo del banco.', ''])
  }
  const d1 = filas.length

  // ═══ Y ACÁ LLEGA EL EFECTIVO A LA CELDA QUE EL DUEÑO MIRA ═══
  //
  // Se reescribe la columna de pesos de la fila del arqueo. No se hace dentro del bucle de CUENTAS
  // porque en ese momento todavía no se sabe en qué fila quedó el neto, y la fila del neto NO se puede
  // deducir por posición: eso es exactamente lo que ya rompió la alerta de echeqs en esta pestaña.
  //
  // LA COLUMNA DE ORIGEN (C) NO SE TOCA: ahí vive el ARQUEO, que lo tipea el dueño y es verdad
  // definitiva. Un conteo físico no se pisa con una suma automática. Lo que cambia es el SALDO EN
  // PESOS: pasa de ser "el importe de al lado" a ser "el arqueo más lo que se movió desde entonces",
  // que es lo que de verdad hay en el cajón.
  // ═══ LAS FILAS DE CAJA MUESTRAN LO QUE HAY HOY (01/08) ═══
  //
  // Antes: columna C = el arqueo (0) y columna E = el saldo real. Una fila que se contradice a sí
  // misma. Ahora C es el saldo vivo EN SU MONEDA —arqueo declarado más lo que se movió desde
  // entonces— y E lo valúa igual que cualquier otra cuenta. La fecha es la de HOY y la antigüedad
  // dice "vivo", porque el número se recalcula solo: mostrar la fecha del arqueo ahí hacía leer
  // como atrasado un dato que estaba al día.
  filas[d0 - 1][2] = `=N(${ARQ_ARS})+$${C_IMP}$${fPostEf}`
    // LA FECHA ES LA DEL ARQUEO, NO HOY (01/08). Acá se pisaba con =TODAY() lo que la fila ya traía
    // bien resuelto más arriba. Un conteo de caja fechado hoy afirma que se contó hoy —sea cierto o
    // no— y deja la alarma de antigüedad de la columna de al lado clavada en "0 días": la única fila
    // del cuadro que NUNCA podía avisar de estar vieja era justamente la que sólo se actualiza cuando
    // una persona abre el cajón y cuenta. Vacía significa "todavía no lo contaste", que es la verdad.
  filas[d0 - 1][5] = `=IF(ISNUMBER(${ARQ_ARS_FECHA});${ARQ_ARS_FECHA};"")`
  filas[d0 - 1][6] = `=IF(N(${C_IMP}${d0})=0;"sin movimientos";"vivo")`
  filas[d0 - 1][4] = saldoEnPesos(d0)
  // ACÁ IBA LA EXPLICACIÓN DE ESTA FILA, EN LA COLUMNA H. Ya no: el dueño la borra siempre y el
  // generador se la reescribía en cada corrida (ver COL_PROSA). La identidad que hacía falta explicar
  // —`efectivo = arqueo + movimientos posteriores`— vive en lib/caja-efectivo-fisico.mjs, que es donde
  // se puede leer una vez en vez de una por fila.

  // ═══ Y LO MISMO PARA EL CAJÓN EN DÓLARES (01/08) ═══
  //
  // Mismo mecanismo que la línea de arriba, del otro lado de la moneda: la columna de ORIGEN sigue
  // siendo el arqueo que tipea el dueño —en dólares, sin convertir— y el SALDO EN PESOS pasa a ser
  // "el arqueo más lo cobrado en efectivo y en dólares desde entonces", valuado al tipo de cambio.
  // Sin esto, U$S 15.000 cobrados el 31/07 entraban al cajón de PESOS como $15.000.
  const dUsd = filas.findIndex((f) => /^caja en d[oó]lares/i.test(String(f?.[0] ?? '').trim())) + 1
  if (dUsd) {
    filas[dUsd - 1][2] = `=N(${ARQ_USD})+IF(NOT(ISNUMBER(${ARQ_USD_FECHA}));0;${formulaCobrosUsdEfectivoPosteriores(ARQ_USD_FECHA)})`
    filas[dUsd - 1][3] = `=IF(ISNUMBER(C${dUsd});${RANGO_TC};"")`
    filas[dUsd - 1][4] = saldoEnPesos(dUsd)
    filas[dUsd - 1][5] = `=IF(ISNUMBER(${ARQ_USD_FECHA});${ARQ_USD_FECHA};"")`
    filas[dUsd - 1][6] = `=IF(N(C${dUsd})=0;"sin movimientos";"vivo")`
  }

  // PERCIBIDO: el total excluye los Valores a depositar (echeq en custodia, sin acreditar). No son
  // caja de hoy — entran en el calendario cuando se acreditan. Es también el "Efectivo al inicio" que
  // usan los dos cash flows (CAJA_TOTAL_DISPONIBLE), así que su apertura queda percibida, sin el echeq.
  // LA FECHA DE LA POSICIÓN VIVE EN LA MISMA FILA QUE EL MONTO (31/07). CAJA_FECHA_SALDO apuntaba a
  // "la última fila del bloque, columna F" — que tenía fecha sólo porque la cartera estaba última. Es
  // el mismo defecto que ya arruinó la alerta de echeqs (ver el comentario de `d1` más arriba): al
  // agregar las tres filas de efectivo posteriores al arqueo, la última pasó a ser "(−) depositado en
  // el banco", que NO lleva fecha. EOMONTH de una celda vacía da 31/12/1899, así que las dos filas más
  // importantes de los dos cash flow —"Efectivo al inicio" y "al cierre"— quedaron VACÍAS en los doce
  // meses, sin error y sin aviso. CAJA lo veía y lo cantaba en "lo que no cierra" por $108,5M.
  //
  // Ahora la fecha es la MÁS RECIENTE del bloque, calculada (mismo criterio que ya usa el tramo del
  // calendario), y el nombre se ancla a esta fila: el monto y su fecha no se pueden separar.
  const fTotal = push(['Total disponibilidades', '', '', '', `=SUM(${C_PESOS}${d0}:${C_PESOS}${d1})${fCartera ? `-${C_PESOS}${fCartera}` : ''}`,
    `=IFERROR(MAX($F$${d0}:$F$${d1});"")`, '', '', 'Efectivo al inicio (percibido) que usan los dos cash flows: caja + bancos + movimientos posteriores, SIN los valores a depositar, que entran en el calendario al acreditarse. La fecha de al lado es la del dato más reciente del bloque: es la que los dos cash flow usan para saber en qué mes abrir.'])
  // La exposición al tipo de cambio. No es un detalle de presentación: decide si conviene vender o
  // quedarse. Sale de las mismas filas de arriba, no se carga aparte.

  // ── 2 · COMPROMISOS YA EMITIDOS ─────────────────────────────────────────────────────────────────
  const fCh = push(['Cheques emitidos pendientes de debitar', 'ARS',
    // Sale de la propia pestaña de cheques: acá no se copia ningún importe.
    `=SUMPRODUCT((UPPER('${refs.cheques}'!$K$2:$K$400)<>"SI")*IF(ISNUMBER('${refs.cheques}'!$F$2:$F$400);'${refs.cheques}'!$F$2:$F$400;0))`,
    '', `=${C_IMP}${filas.length + 1}`, '', '', `Pestaña ${refs.cheques}, columna DEBITADO distinta de SI — salida futura, no resta hasta que se debita`, 'Se calcula solo'])
  // PERCIBIDO: la disponibilidad de hoy NO resta los cheques emitidos (todavía no salieron). Los
  // cheques salen en el calendario cuando se debitan. Restarlos acá los contaba dos veces.
  // ═══ EL RÓTULO QUE SE LEÍA COMO UNA RESTA QUE NO RESTA (31/07) ═══
  //
  // El dueño: "caja me da desconfianza". Y con razón en este punto: "Total disponibilidades" y
  // "Disponibilidad percibida hoy" daban el MISMO número, con la línea "Cheques emitidos pendientes de
  // debitar" en el medio. Cualquiera lee que esa línea se resta — y no se resta, porque un cheque
  // librado que el banco todavía no debitó NO salió de la cuenta: la plata está. Que no se reste es
  // correcto; que no se DIGA es lo que hace desconfiar. El rótulo ahora lo dice.
  const fNeta = push(['Disponibilidad percibida hoy — los cheques de arriba no se restan hasta que el banco los debita', '', '', '', `=${C_PESOS}${fTotal}`, '', '', '',
    'La plata que realmente hay hoy (percibido). Los cheques emitidos salen cuando se debitan (calendario), no restan acá.'])
  push()

  // ══ 2 · EL CALENDARIO DE VENCIMIENTOS ═══════════════════════════════════════════════════════════
  //
  // POR QUÉ SE REHIZO (23/07). El dueño: "quisiera que quede con mayor claridad los momentos en los
  // que va a ingresar dinero y va a salir, producto de los movimientos con cheques; esto no está
  // claro en ninguna parte". Y era cierto: había un "entra" y un "sale" en total, y tres tramos
  // sueltos SÓLO del lado de las salidas. Un total no contesta CUÁNDO, y con las entradas sin abrir
  // por fecha no se puede saber si la plata llega antes o después de que haya que pagar.
  //
  // ESTO ES UNA ESCALERA DE VENCIMIENTOS (maturity ladder), que es como un banco mira su liquidez.
  // Cada tramo dice qué entra, qué sale, cuál es el neto y —lo que la hace útil— con cuánta plata
  // queda la empresa DESPUÉS de ese tramo. La pregunta no es "cuánto debo" sino "en qué semana me
  // quedo corto", y eso sólo se ve acumulando.
  //
  // Los tramos son cortos cerca de hoy y largos lejos: lo que vence esta semana se decide hoy, lo de
  // noviembre no. Doce meses iguales gastarían media pantalla en meses que no cambian una decisión.
  push(['2 · CALENDARIO DE VENCIMIENTOS — CUÁNDO ENTRA Y CUÁNDO SALE'])
  const ch = refs.cheques
  const F400 = `IF(ISNUMBER('${ch}'!$F$2:$F$400);'${ch}'!$F$2:$F$400;0)`
  const K400 = `UPPER('${ch}'!$K$2:$K$400)<>"SI"`
  const I400 = `'${ch}'!$I$2:$I$400`

  /**
   * LOS TRAMOS SE DEFINEN POR SUS BORDES, NO POR SEIS CONDICIONES SUELTAS.
   *
   * EL ERROR QUE ESTO CORRIGE (23/07). La primera versión escribía la condición de cada tramo a mano
   * —"esta semana", "el mes que viene"— y mezclaba tramos por SEMANA con tramos por MES. En cuanto
   * la ventana de catorce días cruza el fin de mes (hoy: 06/08 contra 31/07), un cheque del 1° de
   * agosto cumple a la vez "semana que viene" y "el mes que viene": se cuenta dos veces. El
   * calendario sumaba $11.733.832 contra los $11.076.832 reales.
   *
   * Con BORDES ORDENADOS el problema no puede existir: cada tramo es (borde anterior, borde], y los
   * bordes se fuerzan crecientes con MAX. Si un borde queda antes que el anterior —el fin de mes que
   * ya pasó dentro de los catorce días— su tramo queda vacío, que es exactamente lo correcto.
   */
  const BORDES = [
    ['Vencido — ya pasó la fecha', 'TODAY()'],
    ['Esta semana', 'TODAY()+7'],
    ['Semana que viene', 'TODAY()+14'],
    ['Resto de este mes', 'MAX(TODAY()+14;EOMONTH(TODAY();0))'],
    ['El mes que viene', 'MAX(TODAY()+14;EOMONTH(TODAY();1))'],
    ['Más adelante', ''],
  ]
  const TRAMOS = BORDES

  // ═══ LA COLUMNA "SALE" ES EL CUADRO DEL CASH FLOW, CORTADO POR TRAMO (04/08/2026) ═══
  //
  // Hasta hoy esta columna tenía su PROPIA lista de egresos —cheques emitidos, jornales, oficina, y
  // desde esta mañana un parche con la deuda de Compras que no se paga con cheque— y el cash flow
  // tenía otra. Dos listas de la misma plata clasificadas por ejes distintos (instrumento acá, rubro
  // allá) daban $41.704.351 de desacuerdo sobre el mismo mes, y el que veía de MENOS era el que
  // produce el PISO PROYECTADO: el número con el que se decide cuánto plazo fijo tomar.
  //
  // Ahora los sumandos salen de `expresionSaleEnVentana`, que lee el MISMO CUADRO que el cash flow.
  // Por construcción los dos ya no pueden discrepar en QUÉ cuentan; sólo en CUÁNDO, que es la
  // pregunta que este calendario existe para contestar. Y falla cerrado: una línea del cuadro que no
  // se sepa resolver rompe el generador en vez de desaparecer en silencio.
  //
  // EL PARCHE QUE SE SACÓ, Y POR QUÉ NO PODÍA QUEDARSE: sumaba a mano la deuda de Compras "Pendiente"
  // con medio de pago distinto de cheque ($15.000.401). Es un SUBCONJUNTO de lo que trae la
  // definición única —que suma Compras entera por rubro—, así que dejarlo contaba esa plata dos veces.

  /** El piso del calendario. Lo anterior al corte del extracto YA está dentro del saldo del banco:
   *  volver a restarlo es contarlo dos veces. Es el mismo criterio que ya usaba la nómina. */
  const PISO_CAJA = 'CAJA_FECHA_SALDO'
  /** El techo del último tramo. "Más adelante" no tiene borde y una ventana necesita dos: sin esto la
   *  línea entera se caería del calendario, que es el defecto que este trabajo vino a matar. */
  const FIN_HORIZONTE = 'DATE(2100;1;1)'
  /**
   * UN CHEQUE VIEJO Y NO DEBITADO SIGUE SIENDO PLATA QUE VA A SALIR, así que su término NO se corta
   * en el corte del extracto: si el banco no lo debitó, no salió de la cuenta y el saldo lo tiene
   * adentro. Es la asimetría con Compras —donde una factura con fecha anterior al corte ya se pagó—
   * y está acá escrita porque no es evidente. Serial 0 = 30/12/1899: antes que cualquier cheque.
   */
  const DESDE_SIEMPRE = '0'
  const desdeTramo = (k) => (k === 0 ? PISO_CAJA : `MAX(${PISO_CAJA};${BORDES[k - 1][1]})`)
  const hastaTramo = (k) => BORDES[k][1] || FIN_HORIZONTE

  /**
   * Las líneas del cuadro que NO tienen fuente con fecha para una ventana, y por eso valen CERO.
   *
   * Las tres son costos que el banco debita solo, sin factura: su único registro es el extracto, que
   * por definición sólo cubre el PASADO. Proyectarlas por tramo exigiría un modelo de timing que hoy
   * no existe, y un número inventado en la columna que produce el piso es peor que un cero.
   *
   * PERO EL CERO SE DECLARA EN LA PESTAÑA. Un cero invisible es exactamente el defecto que este
   * trabajo vino a matar; un cero con nombre y con monto es una limitación conocida. Ver el control
   * que sale de `conceptosFueraDelCalendario` más abajo.
   */
  const SIN_FUENTE_EN_VENTANA = ['descubierto', 'comisiones', 'impuestoCheque']

  /** El año de la grilla mensual de "Impuestos y Financieros" (B=enero … M=diciembre). */
  const ANIO_CAL = new Date().getFullYear()

  /**
   * Lo que la definición única no sabe resolver sola, resuelto acá y sólo acá.
   *
   * ⚠ EL TÉRMINO DE CHEQUES ES "SIN FACTURA CARGADA", NO "TODOS LOS CHEQUES NO DEBITADOS". El cheque
   * es el INSTRUMENTO y la factura es la OBLIGACIÓN: casi todo cheque librado paga una factura que ya
   * está en Compras, y Compras entera ya viaja en los sumandos de arriba. Sumar los cheques enteros
   * contaba $43.380.472 dos veces. La marca del cruce la escribe `cheques-cobertura` fila por fila,
   * así que acá se lee esa marca en vez de rehacer la normalización de números de comprobante.
   */
  const resolutorDeTramo = (k) => ({
    'cheques:cheques': (desde, hasta) => formulaChequesSinFactura(
      k === 0 ? DESDE_SIEMPRE : desde, hasta, MARCAS.falta, [INSTRUMENTOS.cheques]).slice(1),
    'cheques:tarjeta': (desde, hasta) => formulaChequesSinFactura(
      k === 0 ? DESDE_SIEMPRE : desde, hasta, MARCAS.falta, [INSTRUMENTOS.tarjeta]).slice(1),
    // El IVA/IIBB a pagar NO vive en Compras: lo calcula "Impuestos y Financieros" mes a mes y esta
    // línea lo LEE. Las filas se ubican POR RÓTULO en main() y se pasan en `refs`; si no aparecen, el
    // generador rompe. Una referencia a fila muerta devuelve $0 sin un solo error.
    impuestos: (desde, hasta) => formulaCalendarioImpuestosSemana(desde, hasta, ANIO_CAL, refs.filasCal).slice(1),
    ...Object.fromEntries(SIN_FUENTE_EN_VENTANA.map((m) => [m, () => '0'])),
  })

  /** La columna "Sale" del tramo k: el cuadro del cash flow entero, en esa ventana. */
  const saleDelTramo = (k) => `=${expresionSaleEnVentana(desdeTramo(k), hastaTramo(k), resolutorDeTramo(k))}`

  // EL CONTROL QUE REEMPLAZA AL QUE DABA CERO POR CONSTRUCCIÓN. El anterior medía
  // `sale − cheques − nómina` contra las MISMAS TRES FUENTES que el calendario sumaba: no podía dar
  // otra cosa que cero, y ese cero se leyó como "está todo bien" mientras faltaban $77M. Éste mide
  // contra el cuadro contable COMPLETO, que es otra cosa, y nombra lo que queda afuera.
  const egresosDelCuadro = lineasDeCaja().filter(({ signo }) => signo === -1)
  const nombresSinFuente = egresosDelCuadro
    .filter(({ linea }) => SIN_FUENTE_EN_VENTANA.includes(marcaDeLinea(linea)))
    .map(({ linea }) => linea.nombre)
  const conceptosCiegos = conceptosFueraDelCalendario(
    egresosDelCuadro.map(({ linea }) => linea.nombre).filter((n) => !nombresSinFuente.includes(n)))

  /**
   * Las cobranzas ESPERADAS de un tramo: todo lo que Cobranzas no marca como cobrado ni endosado, por su
   * fecha de cobro. Mismo criterio que la línea "Cobranzas esperadas" del cash flow —una sola definición
   * de "esperado" en el archivo— y mismos bordes que el lado que sale, así que nada cae en dos tramos.
   *
   * ISNUMBER sobre la fecha, SIEMPRE: una fecha guardada como TEXTO compara como mayor que cualquier
   * número y el mismo cobro entraría en varios tramos. Es el defecto que ya costó $657.000 del lado de
   * los cheques.
   */
  function cobranzasEsperadasTramo(desde, hasta) {
    const F = 400
    const est = `LOWER(Cobranzas!$O$5:$O$${F})`
    const fecha = `Cobranzas!$Q$5:$Q$${F}`
    const monto = `IF(ISNUMBER(Cobranzas!$M$5:$M$${F});Cobranzas!$M$5:$M$${F};0)`
    const cond = [`(${est}<>"cobrado")`, `(${est}<>"endosado")`, `ISNUMBER(${fecha})`]
    if (desde) cond.push(`(${fecha}>=${desde})`)
    if (hasta) cond.push(`(${fecha}<${hasta})`)
    else if (!desde) cond.push(`(${fecha}<TODAY())`)   // el tramo "Vencido": fecha de cobro ya pasada
    return `SUMPRODUCT(${cond.join('*')}*${monto})`
  }

  push(['Tramo', '', 'Entra', 'Sale', 'Neto del tramo', 'Queda después', 'Fin del tramo',
    'Entra: valores en cartera por su fecha de acreditación (detalle en 4.1) MÁS las cobranzas esperadas de Cobranzas (todo lo que no está cobrado ni endosado, por su fecha de cobro). Sale: EL MISMO CUADRO QUE EL CASH FLOW, cortado por tramo — jornales, sueldos de administración, cargas sociales, gremiales, planes de pago, materiales, estructura, servicios, impuestos, IVA/IIBB del calendario fiscal, bienes de uso y servicio de deuda, más los cheques y cuotas de tarjeta SIN factura cargada (el resto ya viaja dentro de su rubro). Todo desde el corte del extracto: lo anterior ya está dentro del saldo.', ''])
  const cal0 = filas.length + 1
  // EL TRAMO QUE CIERRA EL MES, ANCLADO A SU RÓTULO Y NO A SU POSICIÓN. El titular "queda al cierre
  // de este mes" lee la posición acumulada de este tramo; si mañana se agrega un tramo intermedio,
  // `cal0 + 3` apuntaría a otra cosa y el titular mentiría sin romper ninguna suma.
  //
  // OJO CON EL BORDE: es MAX(TODAY()+14; fin de mes), así que en la última quincena el corte cae DESPUÉS
  // del fin de mes. Por eso el pie del titular no dice "31/08" escrito a mano: lee la celda de fecha
  // del propio tramo (columna G), que siempre dice la verdad sobre hasta cuándo llega esa cifra.
  let fFinMes = 0
  TRAMOS.forEach(([rotulo], k) => {
    const f = cal0 + k
    if (rotulo === 'Resto de este mes') fFinMes = f
    push([rotulo, '',
      // Lo que ENTRA se resuelve al final, cuando se sabe en qué filas quedó el detalle de la
      // cartera: es el mismo mecanismo de marcadores que ya usa el panel de arriba.
      `@ENTRA${k}`,
      // TODO lo que sale de la caja en esta ventana, con la MISMA definición que usa el cash flow.
      // Ver el bloque de arriba: son 19 líneas del cuadro contable, no las tres fuentes que este
      // calendario tenía para sí. Si mañana el cuadro suma una línea nueva, ésta la toma sola; y si
      // esa línea no se sabe resolver por ventana, el generador rompe en vez de ignorarla.
      saleDelTramo(k),
      `=$C${f}-$D${f}`,
      // La posición acumulada arranca en la disponibilidad neta: de nada sirve un neto de tramo si no
      // se ve contra la plata que hay.
      k === 0 ? `=$E$${fNeta}+$E${f}` : `=$F${f - 1}+$E${f}`,
      // LA FECHA DE CORTE, ESCRITA. "Esta semana" y "el mes que viene" son rótulos relativos: sin la
      // fecha al lado, el lector tiene que hacer la cuenta mentalmente cada vez que abre la pestaña.
      BORDES[k][1] ? `=TEXT(${BORDES[k][1]};"dd/mm")` : '', '', ''])
  })
  // Lo que no se pudo ubicar en el tiempo tiene que verse, no desaparecer del calendario.
  //
  // SÓLO LOS QUE EL CALENDARIO CUENTA POR SU INSTRUMENTO: los cheques SIN factura cargada. Un cheque
  // cuya factura ya está en Compras entra al calendario por la fecha de esa factura, así que ponerlo
  // acá lo mostraría como "invisible" cuando sí se lo ve — y peor, lo sumaría al total del horizonte
  // encima de su propio rubro.
  const M_CH = `'${ch}'!$M$2:$M$400`
  push(['Sin fecha de pago cargada', '',
    '', `=SUMPRODUCT((${M_CH}="${MARCAS.falta}")*(${K400})*(1-ISNUMBER(${I400}))*${F400})`, '', '', '', '',
    'Cheques SIN factura en Compras a los que nadie les puso fecha de pago, o cuya fecha quedó como texto. No se pueden ubicar en ningún tramo: hasta que se corrijan, el calendario no los ve.'])
  const cal1 = filas.length
  const calTotal = push(['⇒ Total del horizonte', '', `=SUM($C${cal0}:$C${cal1})`, `=SUM($D${cal0}:$D${cal1})`, `=SUM($E${cal0}:$E${cal1})`,
    `=$F${cal1}`, '', 'La última "Queda después" es la posición al final del horizonte.', ''])
  // ═══ EL CONTROL QUE SE FUE, Y POR QUÉ NO SE PODÍA ARREGLAR (04/08) ═══
  //
  // Acá vivía "cheques no debitados + nómina de obra sin pagar + oficina": el horizonte MENOS las
  // mismas tres fuentes que el horizonte sumaba. Por construcción daba cero, siempre, y ese cero se
  // leyó como "está todo bien" durante los días en que al calendario le faltaban $77M. Un control no
  // se valida contra la información que produce.
  //
  // El de ahora mide contra el CUADRO CONTABLE COMPLETO —otra fuente, otro eje— y no publica un cero:
  // publica el NOMBRE de cada concepto de caja que el calendario no puede ubicar en el tiempo, y su
  // monto declarado. Hoy son tres, y los tres valen cero por la misma razón: el banco los debita sin
  // factura y su único registro es el extracto, que sólo cubre el pasado.
  push([`   · el calendario no ubica en el tiempo ${conceptosCiegos.length} concepto(s) del cash flow`, '', '',
    0, conceptosCiegos.join(' · '), '', '', '',
    'Medido contra el cuadro contable del cash flow, no contra las fuentes que el propio calendario suma. Cada concepto listado vale CERO en todos los tramos porque no tiene fuente con fecha: el banco los debita solo, sin factura, y el extracto sólo prueba el pasado. Es un cero DECLARADO, no un cero medido — el piso es optimista en la magnitud de estos tres costos.'])
  // ⚠ EL RIESGO DEL TÉRMINO DE CHEQUES, A LA VISTA. El calendario suma los cheques SIN factura
  // leyendo la marca que escribe `cheques-cobertura`. Si ese agente no corrió, la columna de marca
  // está vacía, el término da $0 y NADA avisa: el piso sube sin que se haya pagado nada. Este control
  // cuenta los cheques no debitados que todavía no tienen marca. Tiene que dar cero.
  // ═══ EL RIESGO, PARTIDO EN DOS PORQUE SE ARREGLAN DISTINTO (05/08) ═══
  //
  // Este control era UN renglón de $38.377.479 en rojo. Honesto, pero inaccionable: no decía qué
  // hacer con esa plata. Medido contra el registro real ese día, esos $38,4M eran DOS problemas de
  // naturaleza opuesta y en proporción 90/10:
  //
  //   · $34.776.200 en cuatro cheques que SÍ tienen su N° de comprobante cargado, y ese número está
  //     en Compras. No falta ningún dato: falta que corra el agente que escribe la marca.
  //   · $3.601.279 en cuatro cheques sin N° de comprobante. Ahí no hay agente que valga: el dato no
  //     existe y sólo lo puede cargar quien firmó el cheque.
  //
  // Ver los dos juntos hacía leer un agujero de $38,4M donde el trabajo humano pendiente era $3,6M.
  const TIENE_NUM = expresionTieneNumero(`'${ch}'!$H$2:$H$400`)
  const sinMarca = (cond) => `=SUMPRODUCT((${K400})*(${M_CH}="")*${cond}*${F400})`
  push(['   · riesgo: cheques no debitados SIN marca de cobertura (el término de cheques los ignora)', '', '',
    `=SUMPRODUCT((${K400})*(${M_CH}="")*${F400})`, '', '', '', '',
    'Si no da cero, "cheques-cobertura" no corrió sobre esas filas y el calendario no los está viendo: su plata no está ni acá ni en Compras. El cero de este control es lo que hace confiable el término de cheques.'])
  push(['        de los cuales, con N° de comprobante ya cargado', '', '', sinMarca(TIENE_NUM), '', '', '', '',
    'No falta ningún dato: falta que corra "cheques-cobertura". Se resuelve solo en la próxima corrida del agente.'])
  push(['        de los cuales, SIN N° de comprobante', '', '', sinMarca(`(1-${TIENE_NUM})`), '', '', '', '',
    '⚠ Acá no alcanza con correr el agente: el dato no existe. Hay que cargarle el N° de comprobante a esas filas de la pestaña Cheques Emitidos, y son las únicas que lo pueden hacer las personas.'])
  const fPeor = push(['   · el punto más bajo del horizonte', '', '', '', '', `=MIN($F${cal0}:$F${cal1})`, '', '', ''])
  const fCuando = push(['   · cuándo ocurre', '', '', '', '', `=IFERROR(INDEX($A$${cal0}:$A$${cal1};MATCH($F${fPeor};$F$${cal0}:$F$${cal1};0));"")`, '', '',
    'Si el punto más bajo es negativo, ése es el tramo en el que la caja no alcanza — y es la fecha en la que hay que actuar, no el total.', ''])
  // ═══ ENTRE QUÉ Y QUÉ ESTÁ PARADO EL PISO ═══════════════════════════════════════════════════════
  //
  // El punto más bajo de arriba se calcula con lo que se PUEDE AFIRMAR: el término de cheques suma
  // sólo los marcados "FALTA la factura". Pero hay dos grupos cuya cobertura NO se sabe —los que no
  // tienen N° de comprobante y los que el OS todavía no miró— y con el piso solo, esa ignorancia se
  // lee como certeza. Es el número con el que se decide cuánta plata se inmoviliza a plazo fijo: no
  // puede publicarse sin su banda.
  //
  // LA PUNTA DE ABAJO ES EXACTA, NO EL PISO MENOS UN TOTAL. Se recalcula el MÍNIMO restando en cada
  // tramo lo incierto ACUMULADO hasta el borde de ese tramo. Restarle al piso el total de lo incierto
  // habría sido más corto y estaría mal en cuanto el punto más bajo no fuera el último tramo: le
  // cargaría al piso plata que sale después.
  //
  // Los inferidos NO entran en esta banda: tienen evidencia positiva —una factura del mismo proveedor
  // por exactamente el mismo importe— y por eso viven del lado de arriba. Esa es toda la utilidad del
  // cruce de respaldo: no cambia el piso, ANGOSTA la banda.
  const inciertoHasta = (hasta) => [MARCAS.sinNumero, ''].map((m) => formulaChequesSinFactura(DESDE_SIEMPRE, hasta, m).slice(1)).join('+')
  const fPeorCaso = push(['   · … y si NINGUNO de los no verificados tuviera su factura', '', '', '', '',
    `=MIN(${TRAMOS.map((_, k) => `$F${cal0 + k}-(${inciertoHasta(hastaTramo(k))})`).join(';')})`, '', '',
    'La otra punta. Supone que todos los cheques sin N° de comprobante y todos los que el OS no miró son pagos que ningún rubro de Compras está viendo, y los suma como egresos en su fecha. El piso real está entre esta fila y la de arriba.'])
  push(['   · ancho de la banda — lo que NO se puede afirmar', '', '', '', '', `=$F${fPeor}-$F${fPeorCaso}`, '', '',
    'Cuánto vale la ignorancia, en pesos, sobre el número que decide. Baja de dos formas: cargando el N° de comprobante de los cheques que no lo tienen (lo hacen las personas) y corriendo "cheques-cobertura" (lo hace el OS).'])
  // El rango de moneda tiene que llegar hasta ACÁ: las filas de cierre están debajo del último tramo,
  // y sin incluirlas "el punto más bajo" se dibujaba como una fecha (29/11/13049).
  //
  // `filas.length` Y NO `filas.length - 1` (05/08): el −1 dejaba afuera la ÚLTIMA fila empujada, que
  // hasta hoy era "cuándo ocurre" —texto, que no necesita formato de moneda— y desde hoy es "ancho de
  // la banda", que sí. Un importe sin formato de moneda al lado de dos que lo tienen se lee como otra
  // cosa; es el mismo hallazgo que la fila de julio del calendario de cheques.
  const calFin = filas.length
  push()

  // ── MARGEN DE CRÉDITO — resumen arriba, el detalle vive abajo en "Líneas de crédito" ──────────────
  // JPMorgan: la posición de arriba se lee en tres segundos. El margen de crédito es capacidad de pago,
  // no efectivo, así que va como resumen de tres líneas; el desglose (consumos, cuotas, controles,
  // costo del descubierto) está abajo, plegado. Las tres cifras se completan más abajo, cuando el
  // bloque de líneas de crédito ya calculó su disponible.
  push(['3 · LÍNEAS DE CRÉDITO NO UTILIZADAS — NO SON EFECTIVO'])
  const fMTar = push(['Tarjeta — disponible para comprar'])
  const fMAcu = push(['Acuerdo en descubierto'])
  const fMAire = push(['Aire total'])
  push()

  // ═══ DE ACÁ PARA ABAJO: CONTROLES Y CONCILIACIONES, COLAPSADOS ═══════════════════════════════════
  // Todo lo que sigue —el detalle de cada línea y las verificaciones que prueban que los números son
  // confiables— vive plegado bajo un "+", para no tapar la posición. Es la regla "nada suelto" sin
  // sacrificar el minimalismo: está, pero no estorba.
  // UN BLOQUE SIN NÚMERO NO SE SABE SI ES UNA SECCIÓN, UN SUB-BLOQUE O UN RESTO. Éste, el del costo
  // del descubierto y el de "cómo se actualiza" eran los tres sueltos de la pestaña: el lector no
  // tenía forma de saber dónde terminaba uno y empezaba el otro.
  const fCtrl0 = push(['4 · ANEXO — EL DETALLE Y LAS CONCILIACIONES'])

  const fAlerta0 = push(['⚠ LO QUE NO CIERRA — mirar antes de decidir con los números de arriba'])
  push(['Cada línea es un problema con nombre y monto.'])
  // ACÁ VIVÍAN LAS CINCO EXPLICACIONES MÁS LARGAS DE LA PESTAÑA, en la columna H. Eran las que el
  // dueño borraba primero. El rótulo de cada alerta ya nombra el problema; lo que hay que hacer con
  // él es una decisión de tesorería, no un párrafo al lado del monto.
  push(['Qué pasa', '', 'Cuánto'])
  push(['Cheques de terceros que el cash flow espera y ya se entregaron', '', '@DIFECHEQ'])
  push(['CAJA y el Cash Flow no arrancan del mismo saldo — alguien tocó uno de los dos', '', '@DIFCONC'])
  push(['Efectivo cobrado que no se depositó ni está en la caja física', '', '@SINEXPL'])
  // ═══ EL $0 QUE NO ERA UN CERO (01/08) ═══
  //
  // El dueño describió su 31/07: caja en pesos en cero al inicio, cobranzas en efectivo, compras y el
  // 50% de los jornales pagados en billetes. En la pestaña, todo eso valía $0 — y no por estar
  // desactualizada: la fila del efectivo arranca con `IF(NOT(ISNUMBER(arqueo));0;...)`, así que SIN
  // FECHA DE ARQUEO devuelve cero por diseño. Es la decisión correcta (sin ancla no hay ventana, y
  // asumir que todo el efectivo cobrado sigue en el cajón sería inventar plata), pero el resultado se
  // leía como un hecho: "no hay efectivo". La celda avisaba "⚠ sin arqueo" en una columna de 96px.
  //
  // Un cero por falta de dato y un cero medido se escriben igual y significan lo contrario. Esta línea
  // los separa: dice CUÁNTO efectivo está quedando afuera por no tener la fecha. Se calcula con la
  // misma fórmula del neto pero con la ventana abierta (ancla 0 = todas las fechas), así que no puede
  // decir un número distinto del que entraría en cuanto se cargue el arqueo.
  push(['El efectivo del período no se está contando: falta la fecha del arqueo', '', '@SINARQUEO'])
  // ═══ SE LLAMA OFICINA, NO ADMINISTRACIÓN — Y NO ES LO MISMO (03/08) ═══
  //
  // Estas líneas decían "sueldos de administración" y leen `OFICINA_*`, que es el bloque de
  // `_J_OFICINA`: dos personas (Emi Maldonado y Juan Pablo Nievas desde febrero; en enero eran
  // cuatro). El dueño lo separó explícitamente: **oficina son 2 empleados y cobran 50% banco y 50%
  // efectivo; administración cobra TODA por banco.** Son dos grupos con dos criterios distintos.
  //
  // El rótulo equivocado no es cosmético: manda a buscar administración en un cuadro donde no está,
  // y hace parecer que falta plata de un grupo que nunca pasa por la caja física. Administración,
  // al cobrar 100% por banco, ya está dentro del saldo bancario y no toca el efectivo — por eso no
  // hay nada que reconciliar por ese lado.
  // El sueldo de administración que se pagó y no dice por dónde salió. No se resta de ninguna
  // disponibilidad —no se sabe de cuál— así que tiene que verse acá con nombre y monto. Se apaga sola
  // en cuanto el mes tenga Banco o Efectivo cargado.
  //
  // ═══ ESTA LÍNEA NO ES SU PROPIO CONTROL, Y NO PUEDE SERLO (03/08) ═══
  //
  // Sale de `OFICINA_PAGADO` y `OFICINA_BANCO`: los MISMOS dos rangos que producen las dos líneas de
  // sueldos de administración de arriba. Cuando `OFICINA_BANCO` quedó ciego —el generador le borraba
  // la columna en cada corrida— las dos líneas dieron $0 y esta informó "sin problemas" mirando el
  // mismo agujero. Un control nunca se valida contra la misma información que produce.
  // El contraste contra una fuente distinta —los débitos de haberes del EXTRACTO— vive en el bloque
  // 4.7, grupo "Sueldos", de lib/conciliacion-por-naturaleza.mjs. Esta línea sigue contestando su
  // propia pregunta ("¿qué se pagó sin declarar el canal?"); la que detecta el rango ciego es aquélla.
  push(['Sueldos de OFICINA pagados sin declarar por qué canal salieron', '', '@OFISINCANAL'])
  const fAlerta1 = filas.length
  push()

  // ── 3 · EL DETALLE DE LOS VALORES EN CARTERA ───────────────────────────────────────────────────
  //
  // ESTO ESTABA ADENTRO DE LA TABLA DE SALDOS, y era la razón principal por la que la pestaña no se
  // entendía: entre "Banco Santander" y "TOTAL DISPONIBILIDADES" había tres echeqs —dos de ellos ya
  // endosados, que no son plata— y dos filas de control. Una tabla que dice "acá está lo que tenés"
  // con cinco filas en el medio que no son eso obliga a decidir fila por fila cuál suma. El detalle
  // es valioso y se queda, pero abajo y con su propio título.
  push(['4.1 · VALORES EN CARTERA, UNO POR UNO'])
  // EL DETALLE DE LOS CHEQUES EN CARTERA, colapsable. Va DESPUÉS de las cuentas y antes del total,
  // así que no entra en el rango que suma: sumaría dos veces la misma plata.
  const ultima = CUENTAS[CUENTAS.length - 1]
  if (ultima.detalle && ultima.detalle !== 'echeq_en_cartera') throw new Error('el detalle desplegable sólo está resuelto para los echeq en cartera')
  const fValores = fCartera
  if (!fValores) throw new Error('no encontré la fila de la cartera de valores: la alerta de echeqs quedaría mal')
  const g0 = filas.length + 1
  const cust0 = g0
  // ═══ EL IMPORTE Y LA FECHA DE CADA VALOR SON FÓRMULAS SOBRE LA RÉPLICA (30/07) ═══
  //
  // Acá se pegaba `e.importe` desde un array de JavaScript escrito a mano el 21/07. Por eso CAJA
  // mostraba $10.000.000 de cartera teniendo $10.290.000: el cheque 514 de Mineral Del Río entró a la
  // base y a la réplica del propio archivo, y esta celda siguió mostrando lo de la semana pasada sin
  // dar un solo error. Ahora cada fila le pregunta por SU cheque a _CHEQUES_RAW: si se deposita, la
  // fila se apaga sola y el detalle sigue sumando lo mismo que el total.
  //
  // EL RÓTULO DICE "Cheque", no "ECHEQ": el 514 es un cheque físico del Santander y la base no guarda
  // el instrumento de los recibidos. Llamar ECHEQ a un cheque de papel es un dato inventado.
  for (const e of cartera.enCartera) {
    const f = filas.length + 1
    push([`   Cheque ${e.numero} · ${e.emisor}`, 'ARS', formulaImporteEnCartera(e.numero), '', `=${C_IMP}${f}`,
      formulaFechaDeCheque(e.numero),
      `=IF(F${f}="";"";"entra en "&TEXT(F${f}-TODAY();"0")&" días")`,
      `${cartera.origen} · estado ${EN_CARTERA}`, 'Réplica del banco'])
  }
  const cust1 = filas.length
  // LOS QUE SALIERON DE LA CARTERA. No suman —por eso van con importe en blanco— pero tienen que
  // estar A LA VISTA: son los $20.000.000 que el cuadro creía tener y ya no tiene.
  for (const e of cartera.endosados) {
    // EL RÓTULO DICE LO QUE PASÓ, NO EL TRÁMITE. "→ ENDOSADO a ALUMETAL S.A" con el emisor adelante
    // daba 71 caracteres en una celda donde entran 68: se cortaba justo en el dato que importa.
    push([`   Cheque ${e.numero} · YA NO ES NUESTRO — endosado${e.beneficiario ? ` a ${e.beneficiario}` : ''}`, '', '', '', '',
      formulaFechaDeCheque(e.numero), 'entregado',
      `${cartera.origen} · se entregó para pagarle a un tercero: no va a entrar a la cuenta`, 'Réplica del banco'])
  }
  // EL CANARIO DEL DETALLE. Las filas de arriba las escribe el generador; el total y el calendario son
  // fórmulas vivas. Si entra un cheque y esta pestaña no se regenera —hoy está candada, así que es lo
  // más probable—, el detalle listaría uno menos y NADIE lo vería: el total seguiría estando bien.
  // Esta línea compara el detalle contra la réplica y dice exactamente qué hacer.
  const gCanario = push(['⇒ ¿el detalle está al día? — si dice ⚠, corré la réplica y regenerá CAJA', '', '', '', '', '', '', '@CANARIO', 'Se calcula solo'])
  const gControl = push(['⇒ Control: qué dice Cobranzas de estos cheques', '',
    CUENTAS.find((c) => c.control)?.control ?? '', '', '', '', '',
    'Cobranzas registra que el echeq se cobró —y es cierto— pero no sabe qué pasó DESPUÉS con el valor. Si este número es mayor que el de arriba, la diferencia son cheques que se endosaron para pagarle a alguien.', 'Se calcula solo'])
  const gDif = push(['⇒ Diferencia contra el banco (manda el banco)', '', `=${C_IMP}${gControl}-${C_IMP}${fValores}`, '', '', '', '',
    'Distinto de cero = el cash flow espera como ingreso plata que ya se entregó. Manda el banco.', 'Se calcula solo'])
  const g1 = filas.length

  push()

  // ── 4 · LÍNEAS DE CRÉDITO ───────────────────────────────────────────────────────────────────────
  push(['4.2 · LÍNEAS DE CRÉDITO — DETALLE Y CONTROL CONTRA EL RESUMEN DEL BANCO'])
  push(['El margen de tarjeta es capacidad de endeudarse, no plata propia: sumarlo a las disponibilidades hace creer líquida a la empresa justo antes de no poder pagar. Los cupos en pesos y en dólares son distintos, no se mezclan.'])
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

  // Completar el resumen de MARGEN DE CRÉDITO de arriba con las cifras que este bloque acaba de
  // calcular: un solo lugar donde el disponible existe (regla "no duplicar"); el resumen lo referencia.
  filas[fMTar - 1][C_PESOS_I] = `=${C_PESOS}${fDisp}`
  filas[fMAcu - 1][C_PESOS_I] = `=${C_PESOS}${fAcu}`
  filas[fMAire - 1][C_PESOS_I] = `=${C_PESOS}${fAire}`

  // ── QUÉ CUESTA USAR EL DESCUBIERTO ──────────────────────────────────────────────────────────────
  // "Te pasé las tasas para que al momento de utilizarlo el Sheet indique los intereses que va
  // generando". El modelo no se estimó: reproduce al centavo el cargo que el banco hizo el 14/07
  // (ver costo-descubierto.mjs). Por eso el bloque muestra la verificación al lado del cálculo: una
  // tasa copiada de una pantalla y una tasa que reproduce un cargo real no valen lo mismo.
  push(['4.3 · COSTO DEL DESCUBIERTO — LO QUE CORRE POR DÍA CON LA CUENTA EN ROJO'])
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
  push(['4.4 · DÍAS DE LIQUIDEZ — HASTA CUÁNDO ALCANZA'])

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
  // EL RITMO SALE DE TODO LO QUE SE PAGA, NO SÓLO DE COMPRAS.
  //
  // ME CORRIJO SOBRE AYER. La primera versión dividía por Compras/90, y era un ritmo incompleto:
  // Compras es DEVENGADO (una compra a 60 días entra el día que se carga, no el día que se paga) y
  // deja afuera los sueldos, las cargas, los impuestos y la deuda financiera —$34M/mes que sí salen
  // de la cuenta—. Daba $2,3M/día contra un egreso real de $2,4M/día, parecido por casualidad. Ahora
  // sale del egreso total del Cash Flow Mensual, promediando los meses ya cerrados (reales y
  // completos). Ver lib/egreso-diario.mjs.
  const egr90 = `SUMIFS(Compras!$O$4:$O;Compras!$AD$4:$AD;">="&TODAY()-90;Compras!$AD$4:$AD;"<="&TODAY())`
  const fRitmo = push(['Egreso promedio por día (meses cerrados, todas las fuentes)', 'ARS', `=${formulaEgresoDiario(egr90)}`, '',
    `=${C_IMP}${filas.length + 1}`, '=TODAY()', '', 'Egreso total del Cash Flow Mensual (personal, proveedores, estructura, impuestos, inversión y deuda) de los meses ya cerrados, ÷ los días del mes. Si todavía no hay meses cerrados, cae a Compras/90.', ''])
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
  // ESTA FILA RESPONDE CON UNA FRASE, NO CON UN IMPORTE, y por eso se anota para que el formateador le
  // dé TEXTO: la columna es de plata y dibujaba "no, hay $68.709.996 de sobra" con formato de moneda.
  // La pasada por contenido no la alcanza (el valor lo produce una fórmula), así que se declara acá.
  const fRespuesta = filas.length + 1
  push(['⇒ ¿HOY estamos por debajo de la caja mínima?', '', '', '',
    `=IF(${C_PESOS}${fMin}=0;"⚠ falta cargar la caja mínima";IF(${C_PESOS}${fNeta}<${C_PESOS}${fMin};"⚠ SÍ — faltan "&TEXT(${C_PESOS}${fMin}-${C_PESOS}${fNeta};"$#,##0");"no, hay "&TEXT(${C_PESOS}${fNeta}-${C_PESOS}${fMin};"$#,##0")&" de sobra"))`,
    '', '', '',
    'Compara la disponibilidad NETA de hoy contra el mínimo. Las dos filas de abajo miran la proyección del cash flow, que puede estar meses adelante: ésta mira lo que hay.'])
  push(['Primer mes por debajo de la caja mínima', '', '', '', primerMes(`<$${C_PESOS}$${fMin}`), '', '', '',
    'Sale del cierre proyectado del Cash Flow Mensual, que ya arranca del total declarado arriba. No se le vuelve a sumar el saldo de hoy: sería contar la misma plata dos veces. ⚠ Si la conciliación del bloque 6 no cierra, esta fecha es optimista: la proyección espera cobros que todavía no entraron.'])
  push(['Primer mes con caja negativa', '', '', '', primerMes('<0'), '', '', '',
    '⚠ Ojo: los ingresos de octubre en adelante están en $0 porque no hay obra facturada. Esta fecha es un PISO, no un pronóstico.'])
  // ── 4 · CONCILIACIÓN ────────────────────────────────────────────────────────────────────────────
  push(['4.5 · CONCILIACIÓN CONTRA EL CASH FLOW'])
  push(['El control que mide si el archivo sirve. Si la diferencia es chica, el cuadro es confiable. Si es grande, hay plata moviéndose fuera del Sheet y hay que buscarla antes de decidir con estos números.'])
  const fDecl = push(['Disponibilidad declarada (bloque 1)', '', '', '', `=${C_PESOS}${fTotal}`, '', '', '', 'Lo que dicen el extracto y el arqueo.'])
  // ═══ SE CONCILIA CONTRA EL INICIO DEL MES, NO CONTRA EL CIERRE (04/08) ═══
  //
  // Esta línea leía el CIERRE proyectado del mes y lo restaba de la plata que hay HOY. Son dos
  // instantes distintos separados por semanas de cobros y pagos, así que la resta NUNCA podía dar
  // cero: daba exactamente el flujo neto del mes. Medido el 03/08: la "diferencia" era $61.695.516
  // y la fila 53 del Cash Flow —el aumento/disminución neta de agosto— era $61.695.516. El mismo
  // número. El control no medía un descuadre: medía el mes.
  //
  // Y no era inocuo. Era la segunda línea más grande de "LO QUE NO CIERRA", así que la pestaña
  // gritaba por $61,7M que no existían mientras el problema real —los $12,26M de efectivo sin
  // explicar— quedaba tapado abajo. Una alerta que siempre está en rojo deja de leerse.
  //
  // La conciliación verdadera es una IDENTIDAD entre dos cifras del MISMO instante: la
  // disponibilidad de hoy tiene que ser el punto de partida del cash flow del mes en curso. Si el
  // cash flow arranca de otro número, alguien tocó uno de los dos y hay que mirarlo. Si coinciden,
  // el cuadro es confiable — y eso es lo que un control tiene que poder decir.
  const fProy = push(['Efectivo al inicio del mes según el Cash Flow', '', '', '',
    refs.inicio
      ? `=IFERROR(INDEX('Cash Flow Mensual'!$B$${refs.inicio}:$M$${refs.inicio};MATCH(EOMONTH(MAX($F$${d0}:$F$${d1});0);ARRAYFORMULA(EOMONTH('Cash Flow Mensual'!$B$${refs.cab}:$M$${refs.cab};0));0));"⚠ sin saldo cargado")`
      : '⚠ no encontré la línea de inicio en el Cash Flow Mensual',
    '', '', 'Cash Flow Mensual, línea "Efectivo y equivalentes al inicio"', 'Se calcula solo'])
  const fDifConc = push(['⇒ Diferencia', '', '', '', `=IFERROR(${C_PESOS}${fDecl}-${C_PESOS}${fProy};"")`, '', '', '',
    'Tiene que ser CERO: el cash flow arranca de la caja de hoy. Distinto de cero = uno de los dos se tocó a mano.'])

  // ═══ POR QUÉ LA DIFERENCIA ES ENORME, Y CUÁNTO DE ELLA ES UN PROBLEMA DE VERDAD ═══
  //
  // POR QUÉ (21/07). Esta conciliación gritaba $46.280.782 y no se podía hacer nada con el número.
  // ═══ POR QUÉ ACÁ YA NO HAY TRES RENGLONES MÁS (04/08) ═══
  //
  // Estas tres líneas —"lo que el cash flow espera del 22 al fin de mes", "cobros sin estado
  // Cobrado" y "LO QUE QUEDA SIN EXPLICAR"— pertenecían a un diseño anterior, en el que la fila de
  // arriba comparaba la caja de HOY contra el CIERRE PROYECTADO DE TODO EL MES. Con esa
  // comparación la diferencia era enorme por construcción, y hacía falta descomponerla.
  //
  // Ese diseño cambió: hoy se compara contra el INICIO del mes, así que la diferencia tiene que ser
  // cero y no hay nada que descomponer. Los tres renglones quedaron colgados, y el último SUMABA lo
  // que antes explicaba la diferencia: mostraba $85.628.912 de "plata sin explicar" cuando la
  // conciliación daba exacta. El dueño lo leyó como un agujero y perdió la confianza en la pestaña
  // entera — con razón: un número al que nadie le puede decir de dónde sale no vale nada.
  //
  // LO QUE ESTE CONTROL PUEDE Y NO PUEDE DECIR, dicho sin adornos: detecta que alguien tocó a mano
  // uno de los dos lados. NO detecta un error de carga, porque el cash flow toma su saldo inicial
  // DE ESTA MISMA PESTAÑA — es un control validado contra su propia fuente. El control de verdad va
  // contra el banco y contra ARCA, que son las dos fuentes que el OS no produce.
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
  //
  // CÓMO SE RELACIONA CON LA CARGA AUTOMÁTICA DE EFECTIVO (T06). Este control y la línea "Movimientos
  // de efectivo posteriores al arqueo" son COMPLEMENTARIOS, no redundantes. La línea T06 CARGA el
  // efectivo cobrado después del arqueo como plata que DEBERÍA estar en el cajón (una proyección de la
  // caja física). Este control mira lo mismo contra el ÚLTIMO ARQUEO VERIFICADO: si el efectivo cobrado
  // no está depositado ni aparece en ese arqueo, lo marca "sin explicar" — es el aviso de "andá a
  // contar el cajón / tomá un arqueo nuevo". Cuando el dueño registra ese arqueo, las dos cosas se
  // cierran a la vez: la línea T06 colapsa (la ventana ">" arqueo se corre) y este residuo baja. Por
  // eso el control se queda como está: la carga automática no lo reemplaza, lo dispara.
  push(['4.6 · TRAZABILIDAD DEL EFECTIVO COBRADO'])
  // 239 caracteres en una columna donde entran 238: el auditor lo medía cortado por UN carácter.
  push(['Un cobro en efectivo que no se depositó tiene que estar en la caja física. Este control resta lo cobrado en efectivo, menos lo depositado, menos lo declarado en la caja de arriba. Si sobra plata, o no está o el cobro no ocurrió.'])
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
  // EL DETALLE NO VA EN LA COLUMNA DEL DINERO. Este TEXTJOIN es una tira larga de cobros; puesto en
  // la columna de importes rompía la alineación de todo el statement —el ojo recorre una columna de
  // números y se choca con un párrafo—. Va en la columna del rótulo, que ya tiene overflow, con la
  // fila más alta: se lee como el pie de página que es, y las columnas de plata quedan limpias.
  const fDetCob = push([
    `=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONEF};TEXT(Cobranzas!$Q$5:$Q$400;"dd/mm")&"  "&IF(Cobranzas!$G$5:$G$400="";"";Cobranzas!$G$5:$G$400&"  ")&TEXT(Cobranzas!$M$5:$M$400;"$#,##0");"")));"")`,
    '', '', '', '', '', '',
    'Cada cobro en efectivo de la ventana, con fecha y cliente. Sale de la misma condición que el total. Si dos tienen el mismo importe, fecha y cliente, ese es el duplicado que descuenta el renglón de arriba.'])
  // ERA EL ÚLTIMO NÚMERO CALCULADO Y PEGADO DE ESTA PESTAÑA. Ahora sale del extracto que vive en
  // _BANCO_RAW: mismo criterio que usaba el código —los créditos cuyo concepto dice "depósito de
  // efectivo"—, pero escrito donde cualquiera lo puede abrir y verificar.
  const fEfDepos = push(['Depositado en efectivo en esa misma ventana', '', '', '',
    '=SUMPRODUCT((_BANCO_RAW!$E$4:$E="entra")*ISNUMBER(SEARCH("deposito";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))*(ISNUMBER(SEARCH("efectivo";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))+ISNUMBER(SEARCH("efvo";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))>0)*IF(ISNUMBER(_BANCO_RAW!$C$4:$C);_BANCO_RAW!$C$4:$C;0))', '', '', '',
    `Extracto del Santander ${BANCO.CORTE}. Los dos números miran los mismos días: comparar un año contra dos semanas no mide nada.`])
  // LOS DEPÓSITOS, UNO POR UNO, PARA QUE EL TOTAL SE PUEDA VERIFICAR.
  //
  // POR QUÉ (21/07). "$9.960.000 depositados" es un número que hay que creer: no se puede contrastar
  // contra el resumen del banco sin abrir el extracto y buscar a mano. El que mira esta pestaña
  // tiene que poder decir "estos tres, tal día, tanto" — sobre todo cuando el renglón de abajo acusa
  // $15.955.646 sin explicar. La lista sale de la misma fórmula que el total, así que no puede
  // decir algo distinto, y no pega un solo número: es TEXTJOIN sobre la réplica del extracto.
  const CONDEP = '(_BANCO_RAW!$E$4:$E="entra")*ISNUMBER(SEARCH("deposito";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))*(ISNUMBER(SEARCH("efectivo";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))+ISNUMBER(SEARCH("efvo";LOWER(SUBSTITUTE(_BANCO_RAW!$B$4:$B;"ó";"o"))))>0)'
  // EL DETALLE NO VA EN LA COLUMNA DEL DINERO. Este TEXTJOIN es una tira larga de cobros; puesto en
  // la columna de importes rompía la alineación de todo el statement —el ojo recorre una columna de
  // números y se choca con un párrafo—. Va en la columna del rótulo, que ya tiene overflow, con la
  // fila más alta: se lee como el pie de página que es, y las columnas de plata quedan limpias.
  const fDetDep = push([
    `=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF(${CONDEP};TEXT(_BANCO_RAW!$A$4:$A;"dd/mm")&"  "&TEXT(_BANCO_RAW!$C$4:$C;"$#,##0");"")));"")`,
    '', '', '', '', '', '',
    'Cada depósito de efectivo del extracto, con su fecha. Sale de la misma condición que el total de arriba: si no coinciden, es que la fórmula cambió en un lado solo.'])
  // LA FILA SE GUARDA, NO SE CUENTA. La resta de abajo la referenciaba como "fEfCobrado + 3": al
  // insertar el detalle de los depósitos habría restado la fila equivocada sin dar error. Es el
  // mismo defecto que ya rompió la alerta de echeqs esta misma tarde.
  // ═══ APUNTA AL ARQUEO CRUDO, NO AL SALDO EN PESOS (31/07) ═══
  //
  // Era `=E7`, el saldo en pesos de "Caja en pesos". Desde este cambio esa celda vale arqueo + los
  // movimientos POSTERIORES al arqueo, y esta alerta mide una ventana distinta (la del extracto). Si
  // siguiera leyendo E7 restaría movimientos que no pertenecen a su ventana: es exactamente la mezcla
  // de períodos que la regla de oro prohíbe, y habría hecho bajar el faltante con plata de otro mes.
  //
  // Lo que esta alerta necesita es el CONTEO FÍSICO puro, que vive en la columna de origen (C) y lo
  // tipea el dueño. Se lee de ahí, y el rótulo dice la fecha del arqueo para que no se compare a ciegas.
  const fCajaFisica = push([`Arqueo declarado de caja física`, '', '', '',
    `=N(${ARQ_ARS})`, `=${ARQ_ARS_FECHA}`, '', '',
    'El conteo físico que el dueño tipeó en la primera fila del bloque 1, a SU fecha (columna de al lado). NO incluye los movimientos posteriores al arqueo: esta alerta mide la ventana del extracto, y mezclar las dos ventanas daría un faltante falso.'])
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
  push(['4.7 · TRAZABILIDAD DE LO QUE SALIÓ DEL BANCO'])
  push(['Cada peso que salió de la cuenta tiene una pestaña que debería tenerlo. Acá se compara el extracto contra esa pestaña en los MISMOS días. Una diferencia es carga pendiente o un corte de fechas — lo que no puede pasar es que nadie la mire.'])
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
    // La lista de cheques/instrumentos va a la columna de origen (col H), que reparar-textos manda a
    // la NOTA de la celda: el detalle accionable queda a un hover, sin un muro de texto en la vista.
    // LA FÓRMULA VA EN UNA COLUMNA DE DATO; LA EXPLICACIÓN, EN LA DE ORIGEN (31/07).
    //
    // Estaban las dos pegadas en la MISMA celda de la columna H —`=IFERROR(TEXTJOIN(…);"") — Cheques
    // con fecha de pago…`— y eso no es una fórmula: Sheets no lo puede parsear y la celda quedaba en
    // #ERROR!. Encima H es la columna de prosa, que el localizador es-AR recorre cambiando comas por
    // punto y coma: la nota terminó escrita "Si el banco ya los cobró; hay que marcarlos", con los
    // punto y coma comiéndose las comas del castellano. La pista de que algo se estaba tratando como
    // fórmula cuando era texto.
    //
    // Y el formateador YA esperaba la lista en la columna E (ver el bloque de `· cuáles son` más
    // abajo, que le pone WRAP a esa columna): el push y el formato se contradecían.
    if (gr.detalle) push(['   · cuáles son', '', '', '', gr.detalle(), '', '', gr.detalleNota || ''])
  }
  const n1 = filas.length
  push(['⇒ TOTAL QUE SALIÓ DE LA CUENTA', '', `=SUM(${C_IMP}${n0}:${C_IMP}${n1})`, '', '', '', '',
    'Tiene que ser todo lo que el extracto muestra como salida. Si no coincide, hay un concepto que el clasificador no reconoce y esa plata no está en ninguna fila de arriba.'])
  push(['⇒ Control: lo que el extracto dice que salió', '',
    `=-SUMIFS(_BANCO_RAW!$C$4:$C;_BANCO_RAW!$E$4:$E;"sale")`, '', '', '', '',
    'Los dos números tienen que ser iguales. Distintos = apareció un concepto nuevo en el banco sin grupo asignado.'])
  push()

  push(['4.8 · TIPO DE CAMBIO — SÓLO PARA VALUAR LA CUENTA EN DÓLARES'])
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
  push(['4.9 · BASES DE PREPARACIÓN — DE DÓNDE SALE Y CADA CUÁNTO SE ACTUALIZA'])
  push(['· Los saldos (las celdas amarillas) se cargan a mano o pegando el extracto en el chat: el OS lo lee y los completa. Lo que está en dólares se carga en dólares.'])
  push(['· No hay integración con el banco. La API de banca empresa se pide al banco y hoy no está contratada — hasta entonces, el saldo entra por extracto, captura o arqueo.'])
  push(['· El tipo de cambio se actualiza solo con la cotización del día. Si operás a otro (MEP, tarjeta), cargalo en la fila "Dólar declarado" y ése pasa a mandar.'])
  push(['· Todo lo demás de esta pestaña se recalcula solo cada 2 horas junto con el resto del archivo.'])

  // ═══ 4.10 · DONDE VIVE EL ARQUEO (01/08) ═══
  //
  // El dueño, con la pantalla delante: "mirá cómo me has dejado caja con cosas en cero y con fechas
  // desactualizadas". El bloque 1 mostraba en la columna "Saldo en moneda de origen" el ARQUEO (0)
  // mientras la columna de pesos mostraba el saldo real ($15,19M): la fila decía cero y "2 días"
  // teniendo quince millones vivos. La causa era de diseño, no de dato — la celda de CARGA ocupaba la
  // celda de RESULTADO. En las filas de banco esa columna es el saldo; sólo en las de caja era un input.
  //
  // Acá el conteo físico es lo que es: un dato declarado, con su fecha, en su propio bloque. Arriba
  // queda lo que hay HOY, que es lo que se mira para decidir.
  //
  // ═══ EL CONTEO VIAJA CON SU BLOQUE, NO SE QUEDA EN LA FILA (03/08) ═══
  //
  // Hasta hoy estas filas salían con TODAS sus celdas ausentes (`AJENA`): "no las escribo, que la
  // fusión preserve lo que el dueño tipeó". Eso sólo es cierto MIENTRAS EL BLOQUE NO SE MUEVE — la
  // fusión preserva por POSICIÓN. La corrida de hoy metió cuatro filas más arriba, el bloque bajó de
  // la 148 a la 152, y el conteo del dueño se quedó en la 148 mientras los cuatro rangos con nombre
  // se republicaban en la 152, vacía. `CAJA_ARQUEO_ARS_FECHA` quedó en blanco y la caja física
  // ($39,28M) se fue a cero: la fila del efectivo arranca con `IF(NOT(ISNUMBER(fecha));0;…)`.
  //
  // Ahora el conteo se RE-EMITE en su fila nueva desde lo que se leyó al empezar. Se sigue leyendo el
  // valor INGRESADO (número de serie para las fechas), no el formateado: "30/07/2026" depende del
  // locale, 46233 no. Si no se pudo leer nada, la celda vuelve a salir AJENA — sin dato no se
  // sobrescribe, que es el lado seguro para equivocarse.
  push([])
  const fArq0 = push(['4.10 · ARQUEO DECLARADO DE LA CAJA FÍSICA'])
  push(['El conteo físico del cajón y el día en que se hizo. Es el ANCLA: de esa fecha en adelante la caja se mueve sola con las cobranzas y los pagos en efectivo. Cargá acá el importe y la fecha; arriba se muestra lo que hay hoy.'])
  const suyoOAusente = (rot, campo) => { const v = previo(rot, campo); return v === '' || v === null || v === undefined ? AJENA : v }
  const arq = (rot, mon) => [rot, mon, suyoOAusente(rot, 'saldo'), AJENA, AJENA, suyoOAusente(rot, 'fecha'), AJENA, AJENA]
  const fArqArs = push(arq('Caja en pesos — contado', 'ARS'))
  const fArqUsd = push(arq('Caja en dólares — contado', 'USD'))
  const fArq1 = filas.length

  // El panel de arriba se resuelve acá, cuando ya se sabe en qué fila quedó cada total. Son
  // referencias, no copias: si el detalle cambia, el titular cambia con él.
  const PANEL = {
    '@TOTAL': `=${C_PESOS}${fTotal}`,
    '@PISO': `=$F$${fPeor}`,
    // La posición acumulada al final del tramo que cubre este mes. NO es una cuenta nueva: es la misma
    // celda "Queda después" que ya calcula el calendario, mostrada donde se decide.
    '@FINDEMES': `=$F$${fFinMes}`,
    // ═══ LO COLOCABLE = EL PISO MENOS LA RESERVA OPERATIVA ═══
    //
    // MAX(0;…) y no la resta cruda: si el piso ya está por debajo del mínimo, lo colocable es CERO, no
    // un número negativo que se leería como "hay que conseguir esto". Que falte plata es lo que dice el
    // bloque 4.4; acá la pregunta es cuánto se puede inmovilizar, y la respuesta es nada.
    // Si nadie cargó la caja mínima, el mínimo vale 0 y esto publicaría el piso entero como colocable
    // —el error más caro posible en esta celda—, así que en ese caso no muestra número: lo dice el pie.
    '@COLOCABLE': `=IF(N(${C_PESOS}${fMin})<=0;"";MAX(0;$F$${fPeor}-${C_PESOS}${fMin}))`,
    '@PIE1': 'caja y bancos, criterio percibido · las líneas de crédito NO son plata propia — bloque 3',
    '@PIE2': `="lo más bajo que llega la caja proyectando todo · cae en: "&$F$${fCuando}`,
    '@PIE3': `="después de cubrir todo lo que vence hasta el "&$G$${fFinMes}`,
    '@PIE4': `=IF(N(${C_PESOS}${fMin})<=0;"⚠ cargá la caja mínima en 01_Valores Iniciales y este número aparece solo";"el piso menos la caja mínima de "&TEXT(${C_PESOS}${fMin};"$#,##0")&" · plazo máximo: hasta "&$F$${fCuando})`,
    '@DIFECHEQ': `=${C_IMP}${gDif}`, '@SINEXPL': `=${C_PESOS}${fSinExpl}`,
    // ═══ LA ALERTA MUESTRA LO QUE NO SE PUEDE EXPLICAR, NO LA RESTA BRUTA ═══
    //
    // Apuntaba a `ABS(diferencia contra el cash flow)`, que compara el saldo de HOY contra el cierre
    // de FIN DE MES. Esa resta incluye, por definición, todo lo que todavía falta que pase en el mes:
    // daba $80.035.427 cuando lo realmente inexplicado eran $5.593.485. El dueño la leyó como un
    // agujero de ochenta millones —"necesito claridad en caja"— y tenía razón en desconfiar: el
    // cuadro calculaba bien y titulaba mal.
    //
    // Una alerta que suena siempre deja de mirarse, y peor: le saca crédito a las que sí importan.
    // La fila `⇒ LO QUE QUEDA SIN EXPLICAR` ya descuenta lo que tiene explicación conocida.
    '@DIFCONC': `=ABS(${C_PESOS}${fDifConc})`,
    // ═══ ACÁ NO VA UN MONTO, Y ES A PROPÓSITO ═══
    //
    // La primera versión ponía el neto de efectivo con la ventana abierta ("lo que entraría al cargar
    // la fecha"). Medido contra el archivo real da −$47.033.903: cobros $175.445.306 menos pagos
    // $126.617.300 menos nómina en efectivo $95.861.909. Ese número NO es un saldo de caja — es el
    // acumulado del año, y sale negativo porque el efectivo también se carga con extracciones del
    // banco, que este cuadro todavía no modela. Publicarlo como "cuánto falta" habría puesto una cifra
    // falsa en el único bloque que existe para decir la verdad incómoda.
    //
    // El problema no es un monto: es que SIN ANCLA no hay ventana, y cualquier monto que se muestre se
    // va a leer como saldo. Así que la alerta nombra el problema y da la instrucción; la plata aparece
    // sola, y bien, en cuanto la fecha esté cargada.
    '@SINARQUEO': `=IF(${ARQ_ARS_FECHA}<>"";0;0)`,
    '@OFISINCANAL': `=${formulaOficinaSinCanal(`$F$${fBancoPesos || d0}`)}`,
    // Si el banco no reporta ningún echeq en custodia, la cartera es cero y hay que decirlo con un
    // cero: un rango vacío daría #REF! y un total en blanco se leería como "falta cargar".
    // ═══ LA CARTERA SALE DE LA FUENTE, NO DEL DETALLE (30/07) ═══
    //
    // Era `=SUM($C$47:$C$47)` — la suma de las filas del detalle, que tenían el importe PEGADO. Dos
    // consecuencias, las dos silenciosas: (1) entró el cheque 514 y el total siguió en $10.000.000
    // con $10.290.000 en cartera; (2) el rango nace del alto del detalle, así que fosiliza en la
    // cantidad de cheques que había el día que corrió el generador.
    //
    // Ahora es un SUMIFS de rango abierto sobre _CHEQUES_RAW: entra un cheque y el total lo toma sin
    // que nadie corra nada. La pestaña está candada y esto sigue funcionando — que es el punto.
    '@CARTERA': formulaCartera(),
    // EL CALENDARIO: lo que ENTRA en cada tramo también sale de la réplica. Leía $C$47 y $F$47, DOS
    // CELDAS FIJAS: con un solo cheque en cartera funcionaba de casualidad, y con dos el segundo no
    // caía en ningún tramo — el piso proyectado de caja quedaba mal sin que se rompiera ninguna suma.
    // Los bordes son los MISMOS que usa el lado que sale, así que ningún valor cae en dos tramos.
    // ═══ LO QUE ENTRA TAMBIÉN INCLUYE LAS COBRANZAS ESPERADAS (31/07) ═══
    //
    // El dueño: "la pestaña caja esta mal deben haber valores q se estan tomando duplicado o mal o no
    // considerados esos de 727k no es real". Y el problema era NO CONSIDERADOS, del lado del ingreso.
    //
    // El calendario proyectaba la nómina hasta diciembre del lado que SALE ($69,3M en "Más adelante") y
    // del lado que ENTRA sólo miraba la cartera de cheques recibidos ($10,29M). Con la proyección de
    // egresos completa y la de ingresos vacía, el "piso proyectado de caja" daba $727.278 — un número
    // que no es un piso: es "si no entra nada más en cinco meses".
    //
    // Ahora entra también lo ESPERADO de Cobranzas, con el MISMO criterio que el cash flow: todo lo que
    // no está "cobrado" ni "endosado", por su fecha de cobro. No es optimismo: es simetría. Proyectar un
    // lado y no el otro no es prudencia, es un cuadro desbalanceado que asusta con un número falso.
    //
    // Lo COBRADO no entra: ya está en el saldo del banco. Lo endosado tampoco: esa plata se le entregó a
    // un tercero. Las dos exclusiones son las que evitan contar dos veces.
    ...Object.fromEntries(TRAMOS.map((_, k) => [`@ENTRA${k}`,
      `${formulaCarteraTramo(k === 0 ? null : BORDES[k - 1][1], BORDES[k][1] || null)}`
        + `+${cobranzasEsperadasTramo(k === 0 ? null : BORDES[k - 1][1], BORDES[k][1] || null)}`])),
    // El canario compara el detalle (filas escritas) contra la réplica (la fuente), y el total del
    // calendario contra el total: un valor sin fecha de pago no cae en ningún tramo y se perdería.
    '@CANARIO': formulaCanarioDetalle(cust1 >= cust0 ? cust1 - cust0 + 1 : 0,
      `$${C_IMP}$${fValores}`, `$${C_IMP}$${cust0}:$${C_IMP}$${cust1}`, `$${C_IMP}$${calTotal}`),
    // La cuenta escrita, con las filas reales. Se arma acá porque recién ahora se sabe dónde quedó
    // cada bloque: escribirla a mano en el texto de arriba la dejaría vieja en la primera corrida
    // que mueva una fila — que es exactamente lo que ya pasó con "Bloque 6".
    // ACÁ HABÍA CINCO `@ORIGEN_*` MÁS: las explicaciones de las alertas, que se escribían en la
    // columna H con CONCATENATE citando las filas de las que salía cada resta. Se fueron con la
    // columna (ver COL_PROSA). El "de dónde sale" de cada alerta está en el comentario de su push,
    // que es donde se puede mantener sin que el dueño tenga que borrarlo cada dos horas.
  }
  for (const f of filas) f.forEach((c, j) => { if (typeof c === 'string' && PANEL[c]) f[j] = PANEL[c] })

  // El grupo colapsable de controles va desde su encabezado hasta la última fila del cuadro.
  const fCtrl1 = filas.length
  return { filas, fRespuesta, cal0, calFin, calTotal, gCanario, n0, n1, usd, fTitulos, fCifras, fAire, fDias, fRitmo, fAlerta0, fAlerta1, fBancoPesos, fTasa, d0, d1, g0, g1, gControl, gDif, cab0, cab1, cab3, fTC, fRef, fDec, fTotal, fUSD, fNeta, fCh, fLim, fDisp, fAcu, fDecl, fMTar, fMAcu, fMAire, fMargenTit: fMTar - 1, fCtrl0, fCtrl1, amarillas, fDetCob, fDetDep, fArq0, fArq1, fArqArs, fArqUsd }
}

/**
 * LA CARTERA, NORMALIZADA. Una sola forma para las dos fuentes posibles.
 * @returns {{origen:string, enCartera:Array, endosados:Array}}
 */
function carteraDeRespaldo() {
  // RESPALDO, no fuente: la transcripción de las pantallas del banco que vive en banco-santander.mjs.
  // Se usa sólo si la base no responde — y en ese caso las FILAS pueden quedar viejas, pero el total y
  // el calendario siguen saliendo de la réplica, así que el canario lo grita en la propia pestaña.
  return {
    origen: BANCO.ORIGEN,
    enCartera: BANCO.enCartera().map((e) => ({ numero: e.numero, emisor: e.emisor, pago: e.pago })),
    endosados: BANCO.endosados().map((e) => ({ numero: e.numero, beneficiario: e.beneficiario })),
  }
}

/**
 * LA CARTERA DESDE LA BASE — la misma fuente que alimenta la réplica _CHEQUES_RAW del archivo.
 *
 * POR QUÉ NO ALCANZABA EL ARRAY DE JAVASCRIPT: era una transcripción a mano con corte 22/07. El 30/07
 * entró el cheque 514 por `importar-cheques.mjs`, quedó en la base y en la réplica, y el array no lo
 * tenía: CAJA listaba un cheque y mostraba $10.000.000 con $10.290.000 en cartera.
 *
 * EL ENDOSATARIO NO ESTÁ EN LA BASE (public.cheques no tiene a quién se le entregó el valor), así que
 * para el rótulo se completa desde la réplica del banco cuando el número coincide. Si no está, el
 * rótulo dice "endosado" y no inventa un beneficiario.
 */
async function carteraDesdeLaBase() {
  const { query } = await import('../lib/db.mjs')
  const { rows } = await query(
    `select numero, librador, contraparte, importe::float8 importe, fecha_pago::text pago, estado, corte::text corte
       from public.cheques
      where tipo = 'recibido' and estado in ($1, 'Endosado')
      order by (fecha_pago is null), fecha_pago, numero`, [EN_CARTERA])
  if (!rows.length) throw new Error('public.cheques no tiene valores en cartera ni endosados')
  const corte = rows.reduce((mx, r) => (String(r.corte) > mx ? String(r.corte) : mx), '')
  const beneficiarioDe = (numero) => BANCO.endosados().find((e) => String(e.numero) === String(numero))?.beneficiario ?? null
  return {
    origen: `public.cheques al ${corte}`,
    enCartera: rows.filter((r) => r.estado === EN_CARTERA)
      .map((r) => ({ numero: r.numero, emisor: r.librador || r.contraparte || 'librador sin cargar', pago: r.pago })),
    endosados: rows.filter((r) => r.estado === 'Endosado')
      .map((r) => ({ numero: r.numero, beneficiario: beneficiarioDe(r.numero) })),
  }
}

/**
 * En qué filas de "Impuestos y Financieros" están el IVA y el IIBB a pagar. Se ubican por su RÓTULO.
 *
 * Devuelve `{iva, iibb}` con lo que encontró; el que falte queda en `null` y hace romper a
 * `filasCalendarioOk` cuando se arme la fórmula. Es a propósito: preferimos que el generador no
 * escriba a que escriba un calendario ciego al IVA.
 * @returns {Promise<{iva:number|null, iibb:number|null}>}
 */
async function filasDelCalendarioFiscal(google, hojas) {
  const P = CALENDARIO_IMPUESTOS.pestaña
  if (!hojas.some((h) => h.title === P)) {
    throw new Error(`caja-pestana: no encuentro la pestaña "${P}" — sin ella el calendario no vería el IVA/IIBB a pagar, que es el egreso más grande del último cuatrimestre`)
  }
  const colA = await google.readSheetValues(ID, `'${P}'!A1:A200`)
  const fila = (rotulo) => {
    const i = colA.findIndex((f) => String(f?.[0] ?? '').trim() === rotulo)
    return i < 0 ? null : i + 1
  }
  return Object.fromEntries(rotulosCalendarioImpuestos().map(({ clave, rotulo }) => [clave, fila(rotulo)]))
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)
  const tab = hoja.title

  // ═══ LA LECTURA NO LLEVA TECHO DE FILAS (03/08) ═══
  //
  // Era `A1:I80`, y el bloque 4.10 —donde el dueño tipea el ARQUEO— vive en la fila 148. O sea que el
  // rescate NUNCA veía el conteo ni su fecha. Mientras el bloque no se movía no se notaba: la fusión
  // preservaba esas celdas POR POSICIÓN. La corrida de hoy agregó cuatro filas más arriba, el bloque
  // bajó a la 152, y las celdas de carga quedaron vacías en su nueva fila mientras los rangos con
  // nombre se republicaban ahí. `CAJA_ARQUEO_ARS_FECHA` pasó a apuntar a una celda vacía y la caja
  // física —$39,28M— se fue a cero sin un solo #ERROR.
  //
  // Es el mismo defecto que ya costó los 74 borrados falsos de la Regla 0: una lectura con techo no
  // devuelve "no hay dato", devuelve "no miré". Sin techo, el arqueo viaja CON su bloque.
  const previo = await google.readSheetGrid(ID, `${tab}!A1:I`).catch(() => ({ filas: [] }))
  const cargado = rescatar(previo.filas ?? [])

  // Las referencias a otras pestañas se resuelven por rótulo, no se adivinan.
  const colA = await google.readSheetValues(ID, 'Cash Flow Mensual!A1:A80')
  const refs = {
    // 'Cheques Emitidos' completo, no 'Cheques' a secas: desde que existe 'Cheques Recibidos' el
    // nombre corto es ambiguo y hallarPestana corta con error.
    cheques: hallarPestana(hojas, 'Cheques Emitidos').title,
    // ═══ LA SEGUNDA PESTAÑA DE CHEQUES (23/07) ═══
    //
    // EL DUEÑO PREGUNTÓ: "¿caja obtiene los datos de cheques de las dos pestañas?". La respuesta era
    // NO: el lado que SALE salía de Cheques Emitidos, pero el lado que ENTRA salía del saldo de
    // custodia del banco, y "Cheques Recibidos" no la miraba nadie desde acá.
    //
    // Y NO SE PUEDE SUMAR ESA PESTAÑA PARA OBTENER LA CARTERA: es un libro de OPERACIONES, no de
    // cheques. Un mismo valor aparece como Aceptación, después Custodia, después Rescate y después
    // Depósito. Sumar la columna de importes da $100M contra los $10M reales. Lo que esa pestaña sí
    // sabe, y el saldo del banco no, es si un valor SALIÓ de la cartera después de la foto: eso es
    // exactamente el riesgo que hay que controlar, y es lo que se trae.
    recibidos: hallarPestana(hojas, 'Cheques Recibidos')?.title ?? null,
    tarjeta: hallarPestana(hojas, 'Tarjeta').title,
    // La réplica del extracto. Si no está, el saldo del banco vuelve al número declarado y la línea
    // de movimientos posteriores no se escribe: sin corte confiable, esa ventana no se puede acotar.
    bancoRaw: hojas.some((h) => h.title === '_BANCO_RAW') ? '_BANCO_RAW' : null,
    cierre: ubicarEnCashFlow(colA, 'Efectivo y equivalentes al cierre'),
    // El INICIO del mes es contra lo que se concilia de verdad: ver el bloque 4.5.
    inicio: ubicarEnCashFlow(colA, 'Efectivo y equivalentes al inicio'),
    cab: ubicarEnCashFlow(colA, 'Período'),
    // ═══ LAS FILAS DEL CALENDARIO FISCAL, POR RÓTULO Y NUNCA POR NÚMERO (04/08) ═══
    //
    // El IVA/IIBB a pagar no está en Compras: lo calcula "Impuestos y Financieros" y el calendario lo
    // LEE de ahí (una capacidad, una fuente). Las filas se buscan por el rótulo EXACTO que escribe
    // impuestos-pestana.mjs — el mismo contrato que consume el cash flow. Una referencia a una fila
    // muerta devuelve $0 sin un solo #ERROR, y el egreso más grande del último cuatrimestre
    // desaparecería del piso en silencio. Si el rótulo no aparece, `filasCalendarioOk` rompe.
    filasCal: await filasDelCalendarioFiscal(google, hojas),
  }

  // LA CARTERA SE PIDE A LA BASE. Si no contesta, se sigue con el respaldo declarado: mejor un detalle
  // viejo y avisado que una pestaña que no se puede generar.
  let cartera = null
  try {
    cartera = await carteraDesdeLaBase()
  } catch (e) {
    cartera = carteraDeRespaldo()
    console.log(`  ⚠ la cartera no salió de la base (${e.message}): uso el respaldo ${cartera.origen}. El total y el calendario SIGUEN saliendo de la réplica.`)
  }
  const g = grilla(cargado, refs, cartera)
  console.log(`${tab}: ${g.filas.length} filas · ${CUENTAS.length} cuentas · ${cargado.size} con dato ya cargado`)
  console.log(`  cartera (${cartera.origen}): ${cartera.enCartera.length} en cartera · ${cartera.endosados.length} endosado(s). Los IMPORTES los pone la réplica _CHEQUES_RAW, no este script.`)
  console.log(`  cierre del Cash Flow en la fila ${refs.cierre ?? '?'} · encabezado en la ${refs.cab ?? '?'}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // GARANTIZAR EL ALTO DE GRILLA ANTES DE TODO. El layout llega a ~113 filas y la pestaña puede tener
  // menos: si el rango con nombre del tipo de cambio (al fondo) o el batch de valores apuntan más allá
  // del alto real, la API ABORTA el write entero y CAJA queda con lo de la corrida anterior — así se
  // perdían los bloques 5, 6 y 7 (ALERTA, CONCILIACIÓN, EFECTIVO) y saltaba de "4" a "8" sin avisar.
  // Va ANTES del rango con nombre, que es lo primero que se escribe. El alto se ASEGURA, no se supone.
  const hasta = Math.max(g.filas.length + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < hasta) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: hasta } }, fields: 'gridProperties.rowCount' },
    }])
  }

  // ANTES DE ESCRIBIR: SÓLO LOS QUE NO EXISTEN. Las fórmulas de arriba dicen TIPO_CAMBIO_USD, así
  // que el nombre tiene que EXISTIR antes de escribirlas o la pestaña se llena de #NAME? en la
  // primera corrida. Pero existir no es apuntar a la fila nueva: reapuntar acá, antes de saber si el
  // portón deja escribir, es lo que el 03/08 borró $42,88M del total. Ver `rangoConNombre`.
  const creados = await rangoConNombre(google, hoja.sheetId, g, { soloFaltantes: true })
  if (creados) console.log(`  🔖 ${creados} rango(s) con nombre CREADOS (no existían): arranque en frío`)
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
  if (!g.filas.length) throw new Error('la grilla salió vacía: no escribo la pestaña')
  // NO SE BORRA NADA DE LO QUE ESCRIBIÓ UNA PERSONA (regla de oro del dueño). Antes había un
  // clearValues sobre toda la pestaña; ahora se lee lo que hay y se FUSIONA: manda el generador donde
  // TIENE contenido y se conserva lo de la persona donde el generador deja vacío. Ver
  // lib/preservar-anotaciones.mjs.
  // ═══ DESARMAR LAS COMBINACIONES ANTES DE ESCRIBIR, NO DESPUÉS ═══
  //
  // El formato ya desarmaba los merges, pero corría DESPUÉS de escribir los valores: en la corrida
  // en que existe una celda combinada, la escritura se pierde EN SILENCIO —ni error ni valor— y
  // recién la corrida siguiente deja el dato. Pasó hoy con la explicación de las tres alertas, y
  // antes con la fórmula del "próximo a debitar". Un dato que aparece recién a la segunda corrida
  // es un dato que, si el script se ejecuta una sola vez, no aparece nunca.
  await google.spreadsheetBatchUpdate(ID, [{ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(g.filas.length, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: Math.max(ANCHO, hoja.cols ?? ANCHO) } } }]).catch(() => {})
  // REGLA 0: si reescribiste un título o un rótulo de esta pestaña, gana el tuyo. Se compara contra
  // lo que este generador escribió la última vez. Ver lib/respetar-ediciones.mjs.
  // LA LECTURA DE LA REGLA 0 NO LLEVA TECHO DE FILAS (23/07). Cortarla a la altura de la grilla NUEVA
  // deja invisible todo lo que hoy está más abajo, y la Regla 0 lo lee como "el dueño lo borró". Así
  // se marcaron 74 borrados falsos —14 sólo en Caja—, y un falso borrado se confirma solo.
  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA (31/07). Con `.catch(() => [])` un 429 de la API se
  // convertía en "la pestaña está vacía": la Regla 0 daba TODOS mis rótulos por borrados por el dueño y
  // la fusión escribía encima de lo que él tenía. Es el mismo defecto que dejó Proveedores con las filas
  // entrelazadas. Si no se puede leer, no se puede decidir: falla cerrado y la corrida siguiente lo hace
  // bien. Ver lib/google.mjs, donde el 429 ahora espera la ventana del minuto antes de rendirse.
  const actual = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTAÑA}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`)
  })
  const { grid: gridFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTAÑA, g.filas, actual)
  g.filas = gridFinal
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  const escritura = await escribirPreservando(google, ID, tab, g.filas, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI NO SE ESCRIBIÓ, NO SE FORMATEA NI SE MUEVEN LOS NOMBRES (31/07) ═══
  //
  // ESTE ERA EL DESASTRE. El dueño: "desastre lo q estás haciendo en caja". La guarda hacía bien su
  // trabajo —con la pestaña candada, `escribirPreservando` NO escribe— pero el resultado se ignoraba y
  // la corrida seguía como si hubiera escrito:
  //
  //   · `formatear` pintaba la geometría de la grilla NUEVA sobre los valores VIEJOS. Cuatro filas de
  //     corrimiento: la columna "Sale" del calendario quedó con formato de número ("32.288.000,00"),
  //     "Queda después" con formato de FECHA, y la fila "Semana que viene" sin ningún formato
  //     ("3488735"). Eso es exactamente lo que se ve en pantalla.
  //   · `publicar` reapuntaba CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO a las filas de la grilla nueva:
  //     quedaron en E22 y F22, dos celdas VACÍAS. El total real seguía en la fila 18. Con el total en
  //     cero y la fecha de corte en cero, TODO cheque y TODA quincena pasan el filtro ">=fecha de
  //     saldo" y el calendario de vencimientos infla sus tramos. Sin un solo #ERROR, sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar. El skip es una decisión correcta; lo que estaba mal era seguir.
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    console.log(`  🔒 "${PESTAÑA}" bajo tu control: no escribí, y por lo tanto NO le toco el formato, NI muevo sus rangos con nombre, NI reescribo su registro de rótulos. La pestaña queda exactamente como la dejaste.`)
    return
  }
  const { conservadas } = escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) escritas por una persona — CONSERVADAS`)

  // AHORA SÍ: la escritura entró, así que la grilla de esta corrida ES el layout de la pestaña y los
  // nombres pueden seguirla. Si el bloque 4.10 se movió, los del arqueo se mueven con él.
  const publicados = await rangoConNombre(google, hoja.sheetId, g)
  console.log(`  🔖 ${publicados} rango(s) con nombre reapuntados a la grilla RECIÉN ESCRITA: ${RANGOS_DE_CAJA.map((r) => r.nombre).join(' · ')}`)

  await formatear(google, hoja.sheetId, g)

  // El registro de rótulos se guarda con lo que QUEDÓ escrito en la pestaña, no con lo que el
  // generador quiso escribir: el formato acorta los orígenes largos y pasa el texto a una nota.
  const quedo = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTAÑA, g.filas, ediciones, quedo, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // LOS NOMBRES, DESPUÉS DE ESCRIBIR. El Cash Flow Mensual ancla su saldo inicial en estos dos: con
  // referencias por celda, insertar un bloque acá arriba dejaba sus dos filas de efectivo vacías y
  // sin avisar. Un nombre sigue a la celda aunque se mueva, y por eso el orden de los pasos del
  // agente deja de importar.
  // LOS DOS NOMBRES EN LA MISMA FILA. La fecha ya no es "la última del bloque" (que dejó de tener
  // fecha el día que el bloque creció): es la celda calculada que está al lado del total.
  await publicar(google, ID, hoja.sheetId, [
    { name: N_CAJA.total, fila: g.fTotal, col: 5 },
    { name: N_CAJA.fecha, fila: g.fTotal, col: 6 },
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
 * Los rangos con nombre de esta pestaña, republicados en CADA corrida desde las filas reales.
 *
 * ═══ POR QUÉ AHORA SON CINCO Y NO UNO (01/08) ═══
 *
 * El tipo de cambio se republicaba siempre; los CUATRO del arqueo (`CAJA_ARQUEO_ARS`, `_USD` y sus
 * dos fechas) se habían creado UNA vez a mano y nadie los volvía a apuntar. Mientras la pestaña
 * estuvo candada eso no se notó, porque no se movía. La primera vez que el generador la rehízo, el
 * bloque 4.10 bajó de la fila 141 a la 151 y los cuatro nombres quedaron apuntando a la fila del
 * TIPO DE CAMBIO: "Caja en dólares" pasó a leerse a sí misma y toda la columna dio #REF! — el total
 * de disponibilidades, el piso de caja y la exposición en moneda extranjera incluidos.
 *
 * Es el defecto que este archivo ya pagó tres veces: ANCLAR EN LA POSICIÓN. Un rango con nombre
 * existe justamente para no depender de la fila, y un rango con nombre que no se republica es una
 * fila escrita a mano con mejor letra. Se publican los cinco, desde las coordenadas que devuelve la
 * grilla, y un test exige que la lista de acá y las constantes de arriba no se separen.
 */
export const RANGOS_DE_CAJA = [
  { nombre: RANGO_TC, fila: (g) => g.fTC, col: 2 },
  { nombre: ARQ_ARS, fila: (g) => g.fArqArs, col: 2 },
  { nombre: ARQ_ARS_FECHA, fila: (g) => g.fArqArs, col: 5 },
  { nombre: ARQ_USD, fila: (g) => g.fArqUsd, col: 2 },
  { nombre: ARQ_USD_FECHA, fila: (g) => g.fArqUsd, col: 5 },
]

/**
 * NÚCLEO PURO: los requests para publicar los rangos. `soloFaltantes` es la diferencia entre
 * arrancar en frío y reapuntar — y es lo que separa el bootstrap del daño.
 */
export function requestsDeRangos(sheetId, g, existentes = [], { soloFaltantes = false } = {}) {
  const reqs = []
  for (const r of RANGOS_DE_CAJA) {
    const fila = typeof g === 'number' ? (r.nombre === RANGO_TC ? g : null) : r.fila(g)
    // Sin fila no se publica NADA para ese nombre: dejar el rango viejo apuntando a una fila que ya
    // no es la suya es peor que no tenerlo — miente sin dar error.
    if (!Number.isFinite(fila) || fila < 1) continue
    const ya = existentes.find((x) => x.name === r.nombre)
    if (soloFaltantes && ya) continue
    const rango = { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: r.col, endColumnIndex: r.col + 1 }
    reqs.push(ya
      ? { updateNamedRange: { namedRange: { namedRangeId: ya.namedRangeId, name: r.nombre, range: rango }, fields: 'name,range' } }
      : { addNamedRange: { namedRange: { name: r.nombre, range: rango } } })
  }
  return reqs
}

/**
 * ═══ UN NOMBRE NO SE REAPUNTA A UNA GRILLA QUE TODAVÍA NO SE ESCRIBIÓ (03/08) ═══
 *
 * LO QUE PASÓ, MEDIDO. Esta función se llamaba ANTES de escribir, con este argumento escrito al
 * lado: "EL RANGO CON NOMBRE VA PRIMERO … o la pestaña se llena de #NAME? en la primera corrida".
 * El argumento vale para la PRIMERA corrida y sólo para ésa. En cualquier otra reapunta los cinco
 * nombres a las filas de la grilla que el generador PIENSA escribir — y si el portón después frena
 * la escritura (la pestaña es tuya, la editaste), la pestaña se queda con su layout viejo y los
 * nombres apuntando a otro. Pasó el 03/08: los cinco quedaron cuatro filas abajo, `CAJA_ARQUEO_ARS`
 * y `TIPO_CAMBIO_USD` cayeron en celdas vacías, y el total de disponibilidades pasó de $123,79M a
 * $80,91M. **Sin un solo #REF! y sin una sola celda de contenido modificada** — el diff de la
 * pestaña dio cero. La guarda protegía el CONTENIDO y nadie protegía los NOMBRES.
 *
 * Peor: el generador ya imprimía "no escribí, y por lo tanto NO muevo sus rangos con nombre"…
 * DESPUÉS de haberlos movido. Un log que niega lo que acaba de hacer es peor que no loguear.
 *
 * Ahora hay dos momentos y son distintos:
 *   · ANTES de escribir → sólo los nombres que NO EXISTEN (`soloFaltantes`). Cubre el arranque en
 *     frío —que era el problema real— y no puede reapuntar nada, porque sólo agrega lo que falta.
 *   · DESPUÉS de escribir bien → los cinco contra la grilla que QUEDÓ escrita.
 * Si la escritura se frena, no se toca un solo nombre.
 */
async function rangoConNombre(google, sheetId, g, { soloFaltantes = false } = {}) {
  const existentes = await google.getNamedRanges(ID).catch(() => [])
  const reqs = requestsDeRangos(sheetId, g, existentes, { soloFaltantes })
  if (reqs.length) await google.spreadsheetBatchUpdate(ID, reqs)
  return reqs.length
}

async function formatear(google, sheetId, g) {
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
  const AMARILLO = { red: 1, green: 0.98, blue: 0.86 }
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
  // JPMorgan: un statement no tiene la grilla de una planilla a la vista. Se ocultan las líneas de
  // cuadrícula; la estructura la dan el espaciado y alguna hairline puntual, no una reja gris.
  const req = [
    { unmergeCells: { range: r(0, n) } },
    E.reset(sheetId, Math.max(n + 20, 90), ANCHO),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } },
  ]
  // Paleta sobria de statement: tinta casi negra, un gris apagado, una hairline y un acento discreto.
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
  const borde = (rg, lados = { bottom: true }) => req.push({ updateBorders: { range: rg, ...(lados.bottom ? { bottom: { style: 'SOLID', color: HAIR } } : {}), ...(lados.top ? { top: { style: 'SOLID', color: HAIR } } : {}) } })
  // TODO FORMATO PASA POR conFuente: si define textFormat sin nombrar la tipografía, Sheets la
  // reemplaza por la de la hoja y la celda queda en otra fuente. Ver lib/estilo-pestana.mjs.
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

  // Los grupos viejos se borran ANTES de crear el nuevo: la API los apila y el margen izquierdo
  // terminaría con una escalera de +/- que crece cada 2 horas.
  const grupos = (await google.getRowGroups(ID).catch(() => [])).find((s) => s.sheetId === sheetId)?.grupos ?? []
  for (const gr of grupos) req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: gr.startIndex, endIndex: gr.endIndex } } })

  // El patrón sale de la definición única (formato-statement.mjs): negativo entre paréntesis, y sin
  // [Red] — el rojo de esta pestaña es del control que no cierra, no de cualquier número que dé menos
  // que cero. Con [Red] se pintaba en rojo el neto de un tramo en el que legítimamente se paga más de
  // lo que se cobra, y un rojo que aparece siempre deja de avisar.
  const MONEDA = { ...MONEDA_TOTAL }
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
  // La columna de prosa (H) ya no lleva formato propio: no tiene contenido que dibujar. Ver COL_PROSA.
  // Formatearla igual es la trampa de "escritura salteada que sigue formateando": el candado vale
  // también para el formato, y una columna vacía en itálica gris se lee como "acá falta algo".
  // UNA TASA NO ES PLATA. Con el formato de moneda, el 55% anual se dibujaba "$1" — que además de
  // no significar nada, invita a leerlo como un peso.
  fmt(r(g.fTasa - 1, g.fTasa, 2, 3), 'userEnteredFormat.numberFormat',
    { numberFormat: { type: 'PERCENT', pattern: '0.00%' } })
  // LOS IMPORTES EN DÓLARES, con su propio símbolo. Sin esto, U$S 581,39 se dibuja "$581".
  for (const f of g.usd) {
    fmt(r(f - 1, f, 2, 3), 'userEnteredFormat.numberFormat',
      { numberFormat: { type: 'CURRENCY', pattern: '"U$S "#,##0.00;("U$S "#,##0.00);"—"' } })
  }
  // La cotización de la fila del tipo de cambio NO es plata: se muestra como número.
  fmt(r(g.fRef - 1, g.fTC, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  // ── EL PANEL DE TITULARES ────────────────────────────────────────────────────────────────────
  // Grande, con aire, y con la unidad declarada: es lo primero que se ve al abrir la pestaña.
  if (g.fTitulos && g.fCifras) {
    // Etiquetas tipo "eyebrow": chicas, apagadas, sin fondo. El número es el héroe, no la etiqueta.
    fmt(r(g.fTitulos - 1, g.fTitulos), 'userEnteredFormat',
      { textFormat: { bold: true, fontSize: E.TAM.nota, foregroundColor: MUTED }, horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP' })
    fmt(r(g.fCifras - 1, g.fCifras), 'userEnteredFormat',
      { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM, foregroundColor: INK }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' })
    // EL ACENTO VA EN EL NÚMERO QUE HABILITA UNA ACCIÓN, no en el más grande. Los tres primeros
    // titulares describen la posición; el cuarto —lo colocable— es el único sobre el que se puede
    // hacer algo hoy, y es la respuesta a la pregunta que el dueño hizo ("¿lo puedo usar para
    // invertir o qué?"). Antes el acento estaba en el tercero, que era el piso, sin que nada dijera
    // qué hacer con él.
    fmt(r(g.fCifras - 1, g.fCifras, 6, 7), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM, foregroundColor: ACENTO } })
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
    // ═══ SIN BARRAS DE COLOR EN EL HERO (23/07) ═══
    // El dueño: "me son confusas las pestañas de cheques y caja". Al ver la pestaña renderizada al
    // lado de Impuestos y Cargas Sociales, la diferencia saltaba: CAJA seguía con el título sobre una
    // barra azul rellena y dos de los cuatro titulares con fondo rosa y celeste. Es el lenguaje viejo
    // —el que la regla llama "cero barras de color"— y hace que la misma información parezca de otro
    // sistema. Lo que se resta se distingue por el SIGNO y por la palabra, no por un rectángulo.
    fmt(r(g.fCifras - 1, g.fCifras, 0, ANCHO), 'userEnteredFormat.backgroundColor', { backgroundColor: { red: 1, green: 1, blue: 1 } })
  }

  // ── EL BLOQUE DE ALERTAS SE VE COMO UNA ALERTA ──────────────────────────────────────────────
  // Con el formato del resto de la pestaña, "$47.681.181 de diferencia" se lee igual que un saldo.
  if (g.fAlerta0 && g.fAlerta1 > g.fAlerta0) {
    fmt(r(g.fAlerta0 - 1, g.fAlerta0), 'userEnteredFormat', { ...E.bloque(), backgroundColor: E.COLOR.alerta, textFormat: { ...E.bloque().textFormat, foregroundColor: E.COLOR.alertaTexto } })
    fmt(r(g.fAlerta0 + 1, g.fAlerta0 + 2), 'userEnteredFormat', E.encabezado())
    fmt(r(g.fAlerta0 + 2, g.fAlerta1, 2, 3), 'userEnteredFormat',
      { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.bloque, fontFamily: E.FUENTE_NUM, foregroundColor: E.COLOR.alertaTexto }, horizontalAlignment: 'RIGHT' })
    // ═══ SIN COMBINAR: EL "QUÉ HACER" VIVE EN LA MISMA COLUMNA QUE TODOS LOS ORÍGENES ═══
    //
    // ANTES estas tres filas combinaban D:H y el texto vivía en la D, o sea en el medio de la
    // grilla. Dos problemas, y el segundo es el que costó encontrar:
    //
    //   · Un texto de 220 caracteres en la cuarta columna desparrama la fila y descuadra el bloque
    //     respecto de todos los demás, que ponen su procedencia en la última columna.
    //   · Al mover el texto a la H, LA CELDA COMBINADA SE TRAGÓ LA ESCRITURA EN SILENCIO —ni error
    //     ni valor— y las tres alertas quedaron sin su explicación. Es la misma trampa que ya se
    //     había documentado con la fórmula del "próximo a debitar".
    //
    // Ahora la explicación va en la H, con wrap, como el resto de la pestaña.
    for (let i = g.fAlerta0 + 2; i < g.fAlerta1; i++) {
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 46 }, fields: 'pixelSize' } })
    }
    fmt(r(g.fAlerta0 + 2, g.fAlerta1, ANCHO - 1, ANCHO), 'userEnteredFormat', { ...E.nota(), wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' })
    fmt(r(g.fAlerta0 + 2, g.fAlerta1, 0, 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }

  // ── EL BLOQUE 8: DOS COLUMNAS DE IMPORTES Y UNA DE DIFERENCIA ──────────────────────────────────
  // La columna de diferencia salía con formato de FECHA heredado de la columna vecina y mostraba
  // "30/03/87349" donde hay -$899.154. Un desvío disfrazado de fecha no lo lee nadie.
  if (g.n0 && g.n1 >= g.n0) {
    fmt(r(g.n0 - 2, g.n1 + 2, 2, 3), 'userEnteredFormat', E.celda('moneda'))
    fmt(r(g.n0 - 2, g.n1 + 2, 4, 5), 'userEnteredFormat', E.celda('moneda'))
    // Las filas "· cuáles son" ponen en la columna E la lista de cheques/instrumentos que el banco
    // debitó — puede ser larga. WRAP para que se lea entera y contenida (reparar-pantalla le da el
    // alto) en vez de cortarse a lo ancho. Menos es más: el dato accionable a la vista, sin desbordar.
    // Y TEXTO, no moneda (31/07). Estas celdas las produce una FÓRMULA que devuelve una FRASE —"no, hay
    // $68.709.996 de sobra", "N° 223 Corralon Progreso $200.000"—, así que la pasada por contenido no
    // las puede clasificar (no se sabe el tipo sin evaluarla) y la columna les dejaba formato de plata.
    // Acá SÍ se sabe: esta columna, en estas filas, es una explicación. Se declara.
    fmt(r(g.n0 - 1, g.n1, 4, 5), 'userEnteredFormat.wrapStrategy,userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { wrapStrategy: 'WRAP', numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
    fmt(r(g.n0 - 1, g.n1, 5, 6), 'userEnteredFormat', E.celda('moneda'))
    fmt(r(g.n0 - 2, g.n0 - 1, 0, ANCHO), 'userEnteredFormat', E.encabezado())
  }

  // La fila que contesta con una FRASE ("no, hay $X de sobra") es texto, no un importe.
  if (g.fRespuesta) fmt(r(g.fRespuesta - 1, g.fRespuesta, 4, 5), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })

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

  // Encabezados de columna al estilo statement: sin fondo, texto chico y apagado, alineado como su
  // dato (los importes a la derecha), y una hairline abajo que separa el título de las filas.
  // EL ENCABEZADO DEL CALENDARIO FALTABA EN ESTA LISTA (31/07). "Tramo · Entra · Sale · Neto · Queda
  // después · Fin del tramo" se quedaba con el formato de SU COLUMNA: "Sale" dibujado como número
  // suelto y "Queda después" con formato de FECHA. Se ubica por su rótulo, no por su número de fila.
  const cabCal = g.filas.findIndex((f) => String(f?.[0] ?? '').trim() === 'Tramo') + 1
  for (const c of [g.cab0, g.cab1, g.cab3, cabCal].filter((x) => x > 0)) {
    // UN ENCABEZADO ES TEXTO, NUNCA PLATA NI FECHA: se le devuelve el formato de número junto con la
    // tipografía. Sin esto gana el formato que se aplicó a la columna entera más arriba.
    fmt(r(c - 1, c), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt(r(c - 1, c), 'userEnteredFormat',
      { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
    fmt(r(c - 1, c, 2, 3), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
    fmt(r(c - 1, c, 4, 5), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
    borde(r(c - 1, c))
  }
  // LAS CELDAS DE CARGA EN AMARILLO. Es la diferencia más importante de la pestaña: lo que una
  // persona escribe tiene que verse distinto de lo que el sistema calcula, o nadie sabe qué puede
  // tocar sin romper nada. Sólo se pinta lo que de verdad se carga: el importe y la fecha. La columna
  // de prosa salía amarilla como si hubiera que completarla — y ya no se completa nunca (COL_PROSA).
  for (const f of g.amarillas) {
    fmt(r(f - 1, f, 2, 3), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
    fmt(r(f - 1, f, 5, 6), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
  }
  // El detalle de cheques, más chico y en gris: es información de respaldo, no una cuenta más.
  if (g.g1 > g.g0) {
    fmt(r(g.g0 - 1, g.g1, 0, 1), 'userEnteredFormat.textFormat',
      { textFormat: { fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota } })
  }
  // ═══ NINGUNA FILA OCULTA. NUNCA. (23/07) ═══
  //
  // EL DUEÑO, DOS VECES: "no veo lo solicitado en caja, si se encuentra en filas ocultas, mostrar".
  // Medido: 115 filas ocultas desde la 18 — el calendario de vencimientos que él había pedido estaba
  // entre ellas. Y lo peor: el grupo colapsable declaraba las filas 40 a 132, así que las 18 a 39
  // estaban ocultas SIN PERTENECER A NINGÚN GRUPO. Residuo de un colapso anterior: cuando el bloque
  // se mueve, el grupo se recrea en sus coordenadas nuevas y las filas del grupo viejo quedan
  // ocultas para siempre, sin un "+" que las devuelva. No hay forma de encontrarlas mirando.
  //
  // Se fuerza TODA la pestaña visible en cada corrida, ANTES de crear el grupo. Una fila que existe
  // y no se ve es peor que una fila fea: no se puede auditar lo que no se sabe que está.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 200) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  // EL ANEXO CONSERVA SU "+" PERO YA NO ARRANCA CERRADO. El plegado era la idea correcta —la posición
  // se lee sola, el detalle está pero no estorba— y sin embargo dos veces hizo que el dueño no
  // encontrara lo que había pedido. Entre un cuadro más corto y un cuadro que se puede leer entero,
  // gana el segundo: el "+" queda disponible para quien quiera plegarlo, pero la pestaña se abre
  // mostrando todo lo que tiene.
  if (g.fCtrl1 > g.fCtrl0) {
    req.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.fCtrl0, endIndex: g.fCtrl1 } } })
    req.push({ updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.fCtrl0, endIndex: g.fCtrl1 }, depth: 1, collapsed: false }, fields: 'collapsed' } })
  }
  // Totales RULADOS, no rellenos de color: la línea de subtotal lleva una hairline arriba; la
  // disponibilidad neta —la cifra que se decide— va en acento, en negrita, encerrada entre dos
  // hairlines. Es como un estado financiero cierra un total, no como una planilla lo pinta.
  fmt(r(g.fTotal - 1, g.fTotal), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, foregroundColor: INK }, backgroundColor: { red: 1, green: 1, blue: 1 } })
  borde(r(g.fTotal - 1, g.fTotal), { top: true })
  fmt(r(g.fNeta - 1, g.fNeta), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, fontSize: E.TAM.cuerpo, foregroundColor: ACENTO }, backgroundColor: { red: 1, green: 1, blue: 1 } })
  fmt(r(g.fNeta - 1, g.fNeta, 4, 5), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.cuerpo, foregroundColor: ACENTO, fontFamily: E.FUENTE_NUM } })
  borde(r(g.fNeta - 1, g.fNeta), { top: true, bottom: true })
  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    // EL RÓTULO DE UN BLOQUE SE VE COMO UN BLOQUE, con el estilo del archivo y no con una negrita
    // suelta. Y ocupa la fila entera: no compite con ninguna columna.
    if (/^\d+ · |^CÓMO SE ACTUALIZA|^COSTO DE USAR|^MARGEN DE CRÉDITO|^CONTROLES Y CONCILIAC|^DISPONIBILIDADES/.test(t)) {
      // Encabezado de sección al estilo statement: versalita en tinta, sin barra de color, con una
      // hairline abajo. La jerarquía la da la tipografía, no un rectángulo azul.
      fmt(r(i, i + 1), 'userEnteredFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
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

  // ═══ EL CALENDARIO ES PLATA EN CUATRO COLUMNAS ═══
  //
  // La grilla la comparte con el bloque de cuentas, donde la D es "Tipo de cambio" y la F "Fecha del
  // saldo". Sin decirlo explícitamente, el calendario heredaba esos formatos: la posición acumulada
  // se leía "14/12/15787" —el número de serie de la fecha— y lo que sale salía sin el signo pesos.
  // Un cuadro donde un saldo se dibuja como una fecha no se puede revisar: el ojo no suma lo que ve.
  if (g.cal0 && g.calFin) {
    fmt(r(g.cal0 - 1, g.calFin, 2, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
  }

  // ═══ NI UNA NOTA, EN NINGUNA COLUMNA (03/08) ═══
  //
  // POR QUÉ (23/07, y otra vez hoy). El dueño: "vuelve a tener los comentarios de mierda esos en el
  // medio", y hoy: "elimino todo lo q vos anotas en columna h". Una nota vive FUERA del valor de la
  // celda: reescribir la pestaña no la toca, así que la única forma de que un borrado suyo dure es
  // borrarlas explícitamente y no volver a escribir ninguna.
  //
  // Antes acá se limpiaban las notas de A..G y se ESCRIBÍAN las de H (`notasDeColumna` partía cada
  // origen largo en etiqueta + nota). Ese era el mecanismo exacto que le devolvió las 66 celdas de
  // hoy. Se limpia el ANCHO ENTERO y no se escribe ninguna.
  req.push({
    updateCells: {
      // Hasta donde llega la grilla y NI UNA FILA MÁS: pedir una fila que la hoja no tiene hace
      // fallar el lote entero ("beyond the last requested row"), y con él toda la corrida.
      range: { sheetId, startRowIndex: 0, endRowIndex: g.filas.length, startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: Array.from({ length: g.filas.length }, () => ({ values: Array.from({ length: ANCHO }, () => ({ note: '' })) })),
      fields: 'note',
    },
  })

  const ancho = ANCHOS
  ancho.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  // Las dos filas de detalle (los cobros y los depósitos, uno por uno): gris chico y con ajuste de
  // texto. Son el pie de página que respalda el total de arriba, no una fila más del cuadro.
  for (const fd of [g.fDetCob, g.fDetDep]) {
    if (!fd) continue
    req.push({ repeatCell: { range: { sheetId, startRowIndex: fd - 1, endRowIndex: fd, startColumnIndex: 0, endColumnIndex: ANCHO }, cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: { red: 0.45, green: 0.45, blue: 0.5 } }, wrapStrategy: 'WRAP', numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat(textFormat,wrapStrategy,numberFormat)' } })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: fd - 1, endIndex: fd }, properties: { pixelSize: 46 }, fields: 'pixelSize' } })
  }

  // LA MISMA CURA QUE EN PROVEEDORES: un texto se dibuja como texto, decidido por contenido y no por
  // rangos que hay que mantener. Acá quedaban "no, hay $68.709.996 de sobra" y el detalle de un cheque
  // con formato de moneda. Ver lib/formato-texto-por-contenido.mjs.
  {
    const { requests: rTxt, celdas } = requestsTextoPorContenido(sheetId, g.filas || [])
    req.push(...rTxt)
    if (celdas) console.log(`  ${celdas} celda(s) de TEXTO con su formato de texto (no de plata)`)
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

// ═══ SÓLO ESCRIBE SI SE LO CORRE A PROPÓSITO (31/07) ═══
//
// Antes `main()` se ejecutaba con el solo hecho de IMPORTAR el archivo. Eso hacía imposible testear la
// grilla —cualquier test que importara `grilla` habría reescrito la pestaña real— y en un proyecto que
// ya perdió trabajo del dueño seis veces eso no es un detalle de estilo. Ahora `grilla` se puede
// importar y verificar en frío, y escribir sigue requiriendo correr el archivo.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    // El pool de Postgres se abre sólo si la cartera salió de la base; cerrarlo siempre es inofensivo y
    // sin esto el proceso queda colgado después de escribir la pestaña.
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
