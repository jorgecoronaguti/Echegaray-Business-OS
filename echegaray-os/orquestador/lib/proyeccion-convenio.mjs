// LA MASA SALARIAL PROYECTADA DE OBRA SE VALÚA AL 100% DEL CONVENIO — LA ORDEN Y SU MECÁNICA.
//
// ═══ LA ORDEN (07/08/2026, textual) ═══
//
// El dueño: *"quiero q realices la proyeccion de las quincenas futuras de los obreros considerando que
// se paga el 100% de lo q indica la hora del convenio. este es un trabajo en pestaña jornales por
// quincena"*. Y al ratito, sobre el alcance: *"esto puede impactar en varias pestañas a la vez, tener
// en cuenta y hacer las proyecciones"*.
//
// ═══ QUÉ CAMBIA, EXACTAMENTE — LA BASE, NO EL DRIVER ═══
//
// Hasta hoy la proyección de obra escalaba la Σ $/hora PACTADA —lo que efectivamente pagamos, columna
// W del espejo `_J_OBREROS`— por el factor de la paritaria UOCRA. Medido el 07/08: el plantel pactado
// suma $85.900/hora y está entre 14,9% y 16,7% POR DEBAJO de la escala Zona A. Proyectar sobre el
// pactado contesta *"cuánto va a costar seguir pagando lo que pagamos"*. El dueño pidió la otra
// pregunta: *"cuánto cuesta pagar la escala"*.
//
// La base pasa a ser Σ (personas de la categoría × hora de escala de ESA categoría) y sobre esa base
// se aplica EL MISMO factor de paritaria que ya gobierna los tres bloques de la pestaña. El driver de
// escalación no se toca: lo que cambia es la BASE que se escala. Con el plantel del 07/08 —4 OF, 2 A,
// 2 A M, 8 OF M, y la equivalencia declarada por el dueño (OF y OF M→Oficial · A y A M→Ayudante)— eso
// es 12 × $6.348 + 4 × $5.399 = $97.772/hora a valores de agosto 2026.
//
// EL EFECTO AGREGADO ES +13,82% SOBRE LA MASA, NO 15%. Los dos números conviven y son distintos: por
// CATEGORÍA el pactado está entre 14,9% y 16,7% por debajo de la escala, pero lo que mueve la
// proyección es la Σ del plantel, que pasa de $85.900 a $97.772 por hora — +13,82% sobre el pactado,
// o −12,14% mirado desde el convenio, que es lo que se pierde el día que la base vuelve sola al
// pactado. Un comentario que dice "−15%" no describe ninguna de las dos cosas.
//
// ═══ ES UN SUPUESTO, Y VIAJA DICHO ═══
//
// Hoy NO se paga el convenio. La proyección al 100% es una HIPÓTESIS del dueño, no el jornal vigente:
// si la pestaña no lo dijera, el número se leería como "esto es lo que vamos a pagar" cuando en verdad
// es "esto es lo que costaría cumplir la escala". Por eso `lineaSupuestoConvenio` se escribe arriba del
// cuadro y no en un comentario del código, que nadie abre. El bloque 1.1 —pactado contra convenio,
// categoría por categoría— NO se toca: esa comparación sigue siendo un HECHO, y es justamente la que
// prueba que el supuesto no es gratis.
//
// ═══ POR QUÉ SALE POR FÓRMULA Y NO COMO NÚMERO PEGADO ═══
//
// La Σ del convenio se arma con las dos columnas que el bloque 1.1 YA publica: «Personas»
// (`COUNTIFS` sobre la columna D del espejo) y «Básico convenio» (`INDEX/MATCH` sobre la réplica viva
// `_UOCRA_RAW`). Un SUMPRODUCT de esas dos columnas se mueve solo el día que entra un obrero, que
// alguien le cambia la categoría en la planilla del dueño, o que se pega un acuerdo nuevo. Pegar
// $97.772 en una celda habría dado el número correcto hoy — y el número de hoy para siempre.
//
// ═══ QUIÉN HEREDA ESTE CAMBIO, Y POR QUÉ NO HAY QUE TOCAR NADA MÁS ═══
//
// La base nueva entra en la columna «Σ $/hora convenio» del cuadro 1.2, de ahí a la columna
// «Proyectado» de 1.3, y ésa es la que publica el rango con nombre `JORNALES_PROY_TOTAL`. Todo lo de
// aguas abajo lee ESE nombre y ninguno recalcula la masa por su cuenta — verificado por grep el 07/08:
//
//   · Cargas Sociales → `jornalesDelMes()` en lib/cargas-cadena.mjs. Las cargas son un % de la
//     remuneración: si sube la masa proyectada, suben con ella y sin tocar una línea.
//   · Libro / _MOVIMIENTOS → scripts/libro-movimientos-pestana.mjs, y de ahí CAJA, las tarjetas y el
//     portón.
//   · Cash Flow → lib/cash-flow-lineas.mjs · Resumen → scripts/resumen-pestana.mjs · el calendario de
//     egresos y la conciliación caja-vs-cashflow.
//
// Es la regla de REALIDAD ÚNICA: la masa salarial proyectada de obreros se define UNA sola vez —acá— y
// el resto la hereda por rango con nombre. Ninguna pestaña necesita una celda nueva.

import { sub } from './patron-pestana.mjs'
import { convenioDe, CONVENIO_POR_CODIGO } from './uocra-paritaria.mjs'

/**
 * EL SUPUESTO VIAJA CON EL NÚMERO A LA PESTAÑA QUE LO MULTIPLICA.
 *
 * Cargas Sociales no muestra la masa: la multiplica. Su «Remuneración proyectada» es jornales × la
 * relación declarado/neto, y sobre eso corren contribuciones, IERIC, FODECO y FCL. O sea que el
 * supuesto del 100% del convenio COMPUESTO llega hasta la última fila de esa pestaña — y hasta hoy
 * estaba declarado sólo en Jornales, dos pestañas más allá. Una limitación declarada en otro lado no
 * está declarada.
 *
 * Se define UNA vez acá y se importa: dos redacciones del mismo supuesto envejecen distinto.
 */
export const NOTA_SUPUESTO_CONVENIO = 'La parte PROYECTADA de esos jornales viene valuada al 100% de '
  + 'la hora de convenio UOCRA por categoría (supuesto del dueño — ver Jornales por Quincena 1.2). Hoy '
  + 'se paga por debajo de la escala: esto es lo que costaría cumplirla, no lo que se viene pagando. '
  + 'Lo que se PAGA dentro del mes en curso queda al jornal pactado: eso sí es lo que va a salir de la caja.'

/**
 * LA MISMA FILA CON LA OTRA BASE DICE OTRA COSA — Y TIENE QUE DECIRLA (07/08).
 *
 * La nota de arriba se concatenaba SIEMPRE, supiera o no qué base había usado el cuadro. Cuando la
 * réplica no trae escala la proyección de Jornales vuelve al jornal pactado y esta pestaña seguía
 * declarando el 100% del convenio: una glosa que afirma un supuesto que el número de al lado no tiene
 * adentro es peor que ninguna, porque el que la lee ajusta mentalmente hacia abajo un número que ya
 * estaba abajo. La glosa la decide LO QUE EL CUADRO USÓ, igual que la línea de Jornales.
 *
 * @param {'convenio'|'pactado'|null} base la que publicó Jornales; null = no se pudo leer
 */
export function notaSupuesto(base) {
  if (base === 'convenio') return NOTA_SUPUESTO_CONVENIO
  if (base === 'pactado') {
    return 'La parte PROYECTADA de esos jornales está valuada al jornal PACTADO —lo que hoy se paga—, '
      + 'no al 100% de la escala UOCRA: la réplica del convenio no dio base para valuarla (ver Jornales '
      + 'por Quincena 1.2). Cumplir la escala costaría más que esto.'
  }
  return 'No pude leer de Jornales por Quincena 1.2 con qué base quedó valuada la parte PROYECTADA de '
    + 'esos jornales —pactado o 100% del convenio—: corré jornales-pestana.mjs y volvé a generar esta '
    + 'pestaña antes de usar este número para decidir.'
}

/**
 * EL RÓTULO DE LA Σ ES EL CONTRATO ENTRE LAS DOS PESTAÑAS, ASÍ QUE VIVE UNA SOLA VEZ.
 *
 * Jornales lo escribe en el encabezado de 1.2 y 1.3; Cargas lo LEE para saber qué base declarar en su
 * glosa. Si cada archivo escribiera su propia cadena, el día que alguien corrija una tilde la lectura
 * devolvería null y la glosa de Cargas empezaría a decir "no pude leer" sin que nada más se rompa.
 */
export const ROTULO_SIGMA = {
  convenio: 'Σ $/hora convenio',
  pactado: 'Σ $/hora pactada',
  /** 1.3 mezcla las dos bases fila por fila (ver `quincenaAlConvenio`): su encabezado no puede mentir. */
  aplicada: 'Σ $/hora aplicada',
}

/**
 * NÚCLEO PURO: QUÉ BASE USÓ DE VERDAD LA PESTAÑA DE JORNALES, LEÍDA DE LO QUE PUBLICÓ.
 *
 * No se recalcula la decisión acá —serían dos definiciones de la misma cosa, y la de Cargas no tiene
 * a mano ni la réplica del convenio ni los meses del motor—: se lee el EFECTO, que es el encabezado
 * que el cuadro dejó escrito. Es el mismo criterio con el que esta pestaña resuelve las columnas de
 * Compras: por su encabezado, no por su letra.
 *
 * @param {any[][]} filas la pestaña de Jornales tal como la devuelve readSheetValues
 * @returns {'convenio'|'pactado'|null}
 */
export function baseDeJornales(filas = []) {
  for (const fila of filas ?? []) {
    for (const celda of fila ?? []) {
      const t = String(celda ?? '').trim()
      if (t === ROTULO_SIGMA.convenio || t === ROTULO_SIGMA.aplicada) return 'convenio'
      if (t === ROTULO_SIGMA.pactado) return 'pactado'
    }
  }
  return null
}

/**
 * NÚCLEO PURO: ¿ESTA QUINCENA SE VALÚA AL CONVENIO O AL PACTADO? LA DECIDE SU FECHA DE PAGO.
 *
 * ═══ LA ORDEN DEL DUEÑO (07/08) ═══
 *
 * *"justamente el concepto 'caja comprometida' es la que leyó todo el sheet y determinó todo lo que se
 * tiene que cubrir en lo que resta del mes, no debe ir comiéndome la libre disponibilidad"*.
 *
 * Medido en el archivo vivo: la comprometida de agosto ($44,59M) tenía adentro las quincenas de agosto
 * valuadas al convenio ($6.305.763) más las cargas calculadas sobre esa masa. Pero al convenio es una
 * HIPÓTESIS DE PLANIFICACIÓN: este mes el dueño paga el pactado. Esa diferencia le comía la
 * disponibilidad libre con plata que no va a salir.
 *
 * La frontera es la FECHA DE PAGO, no el mes de la quincena: la segunda quincena de un mes se paga al
 * mes siguiente, así que dos quincenas del mismo mes pueden caer de lados distintos. Lo que se paga de
 * acá a fin de mes es CAJA COMPROMETIDA y va al pactado —es lo que va a salir—; de ahí en adelante es
 * planificación y va al 100% del convenio, que es lo que el dueño quiere ver para decidir.
 *
 * @param {Date|null} pago fecha en que sale la plata
 * @param {Date} hoy
 */
export function quincenaAlConvenio(pago, hoy = new Date()) {
  if (!(pago instanceof Date) || Number.isNaN(pago.getTime())) return true
  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999)
  return pago > finDeMes
}

/** Columna del espejo `_J_OBREROS` donde vive el código de categoría (0-based). Es la D. */
const COL_CATEGORIA = 3
/** Columna del espejo donde vive el nombre. Una fila sin nombre no es una persona. */
const COL_NOMBRE = 1

/**
 * NÚCLEO PURO: la expresión (sin `=`) de la Σ $/hora del plantel VALUADA AL CONVENIO.
 *
 * Son las dos columnas del bloque 1.1: B = personas de la categoría (COUNTIFS sobre el espejo) y
 * F = básico del convenio de esa categoría (INDEX/MATCH sobre la réplica). El producto escalar de las
 * dos ES la masa por hora a escala plena, y las dos son fórmulas vivas: nada acá queda congelado.
 *
 * SUMPRODUCT y no una suma de productos fila por fila: el bloque tiene tantas filas como categorías
 * traiga el espejo, y ese número lo decide la planilla del dueño, no este código.
 *
 * ═══ EL GUARD: UN SUMPRODUCT SIN BÁSICOS NO DA ERROR, DA CERO (07/08) ═══
 *
 * El producto escalar pelado tenía el modo de falla favorito de este libro adentro. Si `_UOCRA_RAW` se
 * cae, las celdas «Básico convenio» de 1.1 quedan en "" y SUMPRODUCT trata el texto como 0: la Σ rinde
 * 0 —no #VALUE!, así que ningún IFERROR se entera—, ese 0 se multiplica por horas y días, y $0 de
 * jornales viaja por JORNALES_PROY_TOTAL a Cargas, al Libro, a CAJA y a los dos cash flows. La celda
 * que avisa decía "la proyección de abajo queda VACÍA" mientras la de al lado publicaba cero: la prosa
 * y la fórmula contaban historias distintas.
 *
 * Y EL MISMO AGUJERO, MÁS CHICO, CON UNA SOLA CATEGORÍA SIN ESCALA. Si el dueño da de alta un código
 * que no está en la equivalencia, esa fila cuenta personas en la B y deja la F vacía: sus obreros
 * entran al total valuados en $0 y el total sigue siendo plausible. La consola lo avisa y 1.1 dice
 * "faltan N de M", pero el número —que es el que viaja— no decía nada.
 *
 * Las dos condiciones se cierran igual: si alguna categoría CON PERSONAS no tiene básico, o si no hay
 * un solo peso valuado, la Σ rinde "" y no un número. Vacío se propaga solo —"" × factor es #VALUE! y
 * el IFERROR de aguas abajo lo vuelve ""— y la línea del canario, que evalúa esta misma expresión,
 * pasa a decir la verdad. Un hueco visible es corregible; un total corto, no.
 *
 * @param {number} fPrimera primera fila de categorías del bloque 1.1
 * @param {number} fUltima  última
 * @returns {string|null} null si el bloque no tiene filas — no hay Σ que armar
 */
export function formulaSigmaConvenio(fPrimera, fUltima) {
  if (!(fPrimera > 0) || !(fUltima >= fPrimera)) return null
  const B = `$B$${fPrimera}:$B$${fUltima}`
  const F = `$F$${fPrimera}:$F$${fUltima}`
  const sigma = `SUMPRODUCT(${B};${F})`
  // `--(F="")` es 1 en las categorías sin básico: multiplicado por las personas de esa fila, da >0
  // en cuanto haya UNA persona sin escala. Separador es-AR: punto y coma.
  return `IF(OR(${sigma}=0;SUMPRODUCT(${B};--(${F}=""))>0);"";${sigma})`
}

/**
 * NÚCLEO PURO: LA LÍNEA QUE DICE EN LA PESTAÑA QUE LO DE ABAJO ES UN SUPUESTO.
 *
 * Un número que se lee como un hecho y es una hipótesis es peor que no tenerlo: acá abajo hay diez
 * quincenas valuadas a una escala que hoy NO se paga, y el que mire el total tiene que saberlo en el
 * mismo renglón, no tres pestañas más allá.
 *
 * Y ES ADEMÁS EL CANARIO. Si la réplica `_UOCRA_RAW` se cayó, las celdas «Básico convenio» del bloque
 * 1.1 devuelven vacío, el SUMPRODUCT da 0 y la proyección entera se iría a $0 sin un solo error — el
 * modo de falla favorito de este libro. La misma celda que declara el supuesto lo detecta, porque
 * evalúa la Σ real y no una copia suya.
 *
 * @param {string|null} sigma expresión de la Σ al convenio, o null si no se pudo armar
 * @param {string} celdaPersonas celda con el total de personas del plantel base
 * @returns {string} la fórmula (o el texto) para la columna A
 */
export function lineaSupuestoConvenio({ sigma = null, celdaPersonas = null } = {}) {
  // SIN ESCALA NO SE INVENTA UN CRITERIO. Si la réplica no trajo el mes, la proyección vuelve al jornal
  // pactado — y eso se DICE. Cambiar de base en silencio sería publicar otro número con el mismo
  // rótulo, que es exactamente lo que este archivo existe para impedir.
  if (!sigma) {
    return sub('la réplica _UOCRA_RAW no trae ninguna escala aplicable —ni la del mes en curso ni una '
      + 'anterior que siga rigiendo—: la proyección de abajo vuelve al jornal PACTADO, no al convenio. El '
      + 'supuesto del 100% se reactiva solo cuando la réplica se actualice.')
  }
  const cuantos = celdaPersonas ? `"&${celdaPersonas}&"` : 'las'
  // `IFERROR(...;0)` y no `N(...)` a secas: si una celda de «Básico convenio» devolviera algo que el
  // producto escalar no sabe multiplicar, la línea que avisa del problema sería ella misma un #VALUE! —
  // el aviso se perdería justo cuando hace falta. Un error acá se lee como "no hay escala", que es lo
  // que efectivamente pasa.
  return `=IF(IFERROR(N(${sigma});0)=0;`
    + `"   · ⚠ el convenio no devolvió escala para al menos una categoría del plantel: la proyección de `
    + `abajo queda VACÍA a propósito. Un 0 acá diría que no hay jornales que pagar, y sería mentira.";`
    + `"   · SUPUESTO DEL DUEÑO — la proyección paga el 100% DEL CONVENIO: las ${cuantos} personas del `
    + `plantel valuadas a la hora de escala de SU categoría, no al jornal pactado. Hoy pagamos POR `
    + `DEBAJO (ver 1.1): esto proyecta lo que costaría cumplir la escala, no lo que se viene pagando. `
    + `Las quincenas que se PAGAN dentro del mes en curso quedan al jornal pactado —ésa es la plata que `
    + `va a salir de la caja—; el supuesto empieza a correr desde el mes siguiente.")`
}

/**
 * NÚCLEO PURO: la Σ $/hora del plantel al convenio, CALCULADA EN JAVASCRIPT desde las mismas fuentes.
 *
 * No la consume la pestaña —la pestaña usa la fórmula viva, que es la que se mueve sola—: esto existe
 * para que la corrida IMPRIMA el número y para que un test lo pueda fijar. Un producto escalar armado
 * con referencias de celdas se puede escribir mal de mil maneras y ninguna da error; tener el número
 * esperado por otro camino es la única forma de notarlo.
 *
 * Recorre PERSONA POR PERSONA, no categoría por categoría: así una fila con categoría desconocida se
 * cuenta como lo que es —una persona sin escala— en vez de desaparecer del total.
 *
 * ═══ LÍMITE DECLARADO: ESTE CONTROL NO LEE LA COLUMNA «CONVENIO» DEL DUEÑO ═══
 *
 * La pestaña resuelve la categoría del convenio con `IF($E="";equivalencia declarada;$E)`: si el dueño
 * escribe algo en «Convenio», MANDA lo suyo. Este cálculo sólo conoce la equivalencia declarada
 * (`CONVENIO_POR_CODIGO`). O sea que vale como control del producto escalar mientras esa columna esté
 * vacía; en cuanto el dueño la use, los dos números pueden separarse legítimamente y el que gobierna
 * es el de la pestaña. Quien imprime este número tiene que decirlo al lado, o el control miente.
 *
 * @param {any[][]} grid el espejo completo
 * @param {{inicio:number, fin:number}} bloque
 * @param {{categorias:Object}|null} escalon el escalón vigente ya parseado
 * @returns {{total:number, personas:number, porCategoria:Array, sinEscala:string[]}}
 */
export function sigmaConvenioDelPlantel(grid = [], bloque = null, escalon = null, tabla = CONVENIO_POR_CODIGO) {
  const vacio = { total: 0, personas: 0, porCategoria: [], sinEscala: [] }
  if (!bloque) return vacio
  const acum = new Map()
  const sinEscala = []
  let personas = 0
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    const fila = grid[r - 1] ?? []
    if (!String(fila[COL_NOMBRE] ?? '').trim()) continue
    personas++
    const codigo = String(fila[COL_CATEGORIA] ?? '').trim()
    const convenio = convenioDe(codigo, tabla)
    const basico = convenio ? escalon?.categorias?.[convenio]?.basico : null
    if (typeof basico !== 'number') {
      if (codigo && !sinEscala.includes(codigo)) sinEscala.push(codigo || '(sin categoría)')
      continue
    }
    const k = `${codigo}|${convenio}`
    const prev = acum.get(k) ?? { codigo, convenio, personas: 0, basico, subtotal: 0 }
    acum.set(k, { ...prev, personas: prev.personas + 1, subtotal: prev.subtotal + basico })
  }
  const porCategoria = [...acum.values()]
  return {
    total: porCategoria.reduce((s, x) => s + x.subtotal, 0),
    personas,
    porCategoria,
    sinEscala,
  }
}

/**
 * NÚCLEO PURO: la fórmula del Σ $/hora del plantel para UNA quincena, buscada en el bloque del escalón
 * por su fecha de fin de mes. Si el mes no está en el bloque devuelve vacío, no cero: un cero acá se
 * multiplicaría por los días y daría "$0 de jornales", que es una mentira redonda.
 *
 * ═══ LA FRONTERA DEL MES EN CURSO (07/08 — orden del dueño) ═══
 *
 * *"el concepto 'caja comprometida' … determinó todo lo que se tiene que cubrir en lo que resta del
 * mes, no debe ir comiéndome la libre disponibilidad"*. Valuar al convenio lo que se paga ESTE mes
 * mete en la caja comprometida ~$1,3M que no van a salir: el dueño paga el pactado hoy, y el 100% del
 * convenio es una hipótesis de PLANIFICACIÓN. Entonces la base se elige por quincena y la decide su
 * FECHA DE PAGO —no el mes de la quincena: la segunda de cada mes se paga al mes siguiente, así que
 * dos quincenas del mismo mes caen de lados distintos—:
 *
 *   pago ≤ fin del mes en curso  → Σ PACTADA  (es la plata que va a salir: caja comprometida)
 *   pago  > fin del mes en curso → Σ CONVENIO (planificación, el supuesto del dueño)
 *
 * La frontera es `EOMONTH(TODAY();0)` y no un mes escrito acá: el 1° de cada mes la pestaña se
 * reclasifica sola, sin esperar una corrida. Es el mismo criterio con el que Cargas Sociales dejó de
 * proyectar un mes que ya tenía DDJJ presentada.
 *
 * `N(pago)>0` primero: si la fecha de pago está vacía, en Sheets el texto es MAYOR que cualquier
 * número y la comparación sola diría "se paga después de fin de mes" por accidente. Sin fecha no hay
 * frontera que aplicar, y lo que corresponde es la base del cuadro.
 *
 * @param {string} celdaDesde celda con el inicio de la quincena
 * @param {{f0:number, f1:number, alConvenio?:boolean, celdaSigmaBase?:string, rAnclaBase?:number}} esc
 * @param {string|null} celdaPago celda "Se paga el" de ESA fila
 */
export function formulaSigmaDelMes(celdaDesde, esc, celdaPago = null) {
  const { f0, f1, alConvenio = false, celdaSigmaBase = null, rAnclaBase = null } = esc
  const mes = `MATCH(EOMONTH(${celdaDesde};0);$A$${f0}:$A$${f1};0)`
  const delCuadro = `INDEX($F$${f0}:$F$${f1};${mes})`
  // Sin convenio el cuadro YA publica la Σ pactada: no hay dos bases entre las cuales elegir.
  if (!alConvenio || !celdaPago || !celdaSigmaBase || !rAnclaBase) return `=IFERROR(${delCuadro};"")`
  // La Σ pactada del mes no está en ninguna columna del cuadro cuando éste va al convenio, así que se
  // arma con las piezas que el cuadro SÍ publica: la Σ pactada del plantel (1.1) escalada por el mismo
  // factor acumulado de la columna E, dividido por el factor de SU mes ancla —el de la última quincena
  // cerrada de obra—. Es la misma expresión que usa la columna F cuando la base es la pactada.
  const pactada = `${celdaSigmaBase}*INDEX($E$${f0}:$E$${f1};${mes})/$E$${rAnclaBase}`
  return `=IFERROR(IF(AND(N(${celdaPago})>0;${celdaPago}<=EOMONTH(TODAY();0));${pactada};${delCuadro});"")`
}
