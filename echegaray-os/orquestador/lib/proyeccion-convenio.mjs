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
// es "esto es lo que costaría cumplir la escala". Por eso `lineaSupuestoAumento` se escribe arriba del
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
import {
  convenioDe, claveDeCategoria, tarifaConAumento, CONVENIO_POR_CODIGO, PORCENTAJE_DE_AUMENTO,
} from './uocra-paritaria.mjs'
import { categoriaDelConvenio } from './jornales-piso-uocra.mjs'
import { ALERTA } from './glifos.mjs'

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
export const NOTA_SUPUESTO_AUMENTO = 'La parte PROYECTADA de esos jornales viene valuada a la tarifa '
  + 'de hoy MÁS el 50% del básico de convenio de cada categoría (decisión del dueño del 28/08 — ver '
  + 'Jornales por Quincena 1.1). No es el 100% de la escala ni un piso: el convenio decide cuánto sube '
  + 'la hora, no cuánto vale. Lo que se PAGA dentro del mes en curso queda a la tarifa de hoy, sin el '
  + 'aumento: eso es lo que va a salir de la caja.'

/**
 * LA MISMA FILA CON LA OTRA BASE DICE OTRA COSA — Y TIENE QUE DECIRLA (07/08).
 *
 * La nota de arriba se concatenaba SIEMPRE, supiera o no qué base había usado el cuadro. Cuando la
 * réplica no trae escala la proyección de Jornales vuelve al jornal pactado y esta pestaña seguía
 * declarando el 100% del convenio: una glosa que afirma un supuesto que el número de al lado no tiene
 * adentro es peor que ninguna, porque el que la lee ajusta mentalmente hacia abajo un número que ya
 * estaba abajo. La glosa la decide LO QUE EL CUADRO USÓ, igual que la línea de Jornales.
 *
 * @param {'con-aumento'|'pactado'|null} base la que publicó Jornales; null = no se pudo leer
 */
export function notaSupuesto(base) {
  if (base === BASE_CON_AUMENTO) return NOTA_SUPUESTO_AUMENTO
  if (base === BASE_PACTADO) {
    return 'La parte PROYECTADA de esos jornales está valuada a la tarifa de HOY, SIN el aumento del '
      + '50% del básico: la réplica del convenio no dio escala con la cual calcularlo (ver Jornales por '
      + 'Quincena 1.1). El aumento decidido costaría más que esto.'
  }
  return 'No pude leer de Jornales por Quincena 1.1 con qué base quedó valuada la parte PROYECTADA de '
    + 'esos jornales —la tarifa de hoy sola, o con el aumento del 50% del básico—: corré '
    + 'jornales-pestana.mjs y volvé a generar esta pestaña antes de usar este número para decidir.'
}

/**
 * EL RÓTULO DE LA Σ ES EL CONTRATO ENTRE LAS DOS PESTAÑAS, ASÍ QUE VIVE UNA SOLA VEZ.
 *
 * Jornales lo escribe en el encabezado de 1.2 y 1.3; Cargas lo LEE para saber qué base declarar en su
 * glosa. Si cada archivo escribiera su propia cadena, el día que alguien corrija una tilde la lectura
 * devolvería null y la glosa de Cargas empezaría a decir "no pude leer" sin que nada más se rompa.
 */
/**
 * LAS DOS BASES POSIBLES, NOMBRADAS UNA SOLA VEZ. Viajan entre Jornales y Cargas Sociales como
 * string: escritas a mano en cada punta, un typo las separa sin que nada falle.
 */
export const BASE_CON_AUMENTO = 'con-aumento'
export const BASE_PACTADO = 'pactado'

export const ROTULO_SIGMA = {
  // ═══ EL RÓTULO CAMBIA PORQUE CAMBIÓ EL NÚMERO (29/08) ═══
  //
  // Decía «Σ $/hora convenio» y era el plantel REVALUADO a la hora de convenio. Ahora es la tarifa de
  // hoy más el aumento. Si el rótulo no cambiara, Cargas Sociales seguiría leyendo «convenio» —lo lee
  // por el TEXTO, ver `baseDeJornales`— y glosaría un supuesto que el número ya no tiene adentro.
  // Cambiar el rótulo es lo que obliga a que las dos pestañas se enteren juntas.
  conAumento: 'Σ $/hora con aumento',
  pactado: 'Σ $/hora pactada',
  /** 1.3 mezcla las dos bases fila por fila (ver `quincenaConAumento`): su encabezado no puede mentir. */
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
 * @returns {'con-aumento'|'pactado'|null}
 */
export function baseDeJornales(filas = []) {
  for (const fila of filas ?? []) {
    for (const celda of fila ?? []) {
      const t = String(celda ?? '').trim()
      if (t === ROTULO_SIGMA.conAumento || t === ROTULO_SIGMA.aplicada) return BASE_CON_AUMENTO
      if (t === ROTULO_SIGMA.pactado) return BASE_PACTADO
    }
  }
  return null
}

/**
 * NÚCLEO PURO: ¿ESTA QUINCENA LLEVA EL AUMENTO O VA A LA TARIFA DE HOY? LA DECIDE SU FECHA DE PAGO.
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
export function quincenaConAumento(pago, hoy = new Date()) {
  if (!(pago instanceof Date) || Number.isNaN(pago.getTime())) return true
  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999)
  return pago > finDeMes
}

/** Columna del espejo `_J_OBREROS` donde vive el código de categoría (0-based). Es la D. */
const COL_CATEGORIA = 3
/**
 * Columna del espejo donde vive LO QUE COBRA POR HORA HOY (0-based). Es la W — la misma que suma la
 * fórmula del cuadro 1.1. Que las dos lean la MISMA columna es la condición para que el control y la
 * pestaña puedan compararse; si una lee W y la otra otra cosa, coincidir sería casualidad.
 */
const COL_JORNAL = 22
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
export function formulaSigmaConAumento(fPrimera, fUltima, fTotal) {
  if (!(fPrimera > 0) || !(fUltima >= fPrimera) || !(fTotal > fUltima)) return null
  const hoy = `$C$${fTotal}`
  const aumento = `$D$${fTotal}`
  // ═══ POR QUÉ SON DOS CELDAS DEL CUADRO Y NO UN PRODUCTO ESCALAR (29/08) ═══
  //
  // Era `SUMPRODUCT($B;$F)` — personas × básico —, que valuaba el plantel A LA HORA DEL CONVENIO. Eso
  // es un PISO y el dueño lo rechazó: el convenio no reemplaza la tarifa de nadie, sólo dice cuánto
  // sube. La Σ que proyecta es `lo que se paga hoy + lo que suma el aumento`, y las dos ya están
  // publicadas en la fila de total del cuadro 1.1. Referenciarlas —en vez de recalcularlas— es lo que
  // hace imposible que la pestaña muestre un número y proyecte otro.
  //
  // EL GUARD CAMBIÓ DE PREGUNTA, Y ES A PROPÓSITO. Antes, una categoría sin básico apagaba la Σ
  // ENTERA: con un piso tiene sentido —un piso incompleto no es un piso—. Con un aumento aditivo no:
  // que a una categoría le falte la escala significa que ESA gente no recibe aumento, no que las
  // otras dieciséis personas dejen de cobrar lo que ya cobran. Apagar el total escondería catorce
  // sueldos ciertos por uno incierto. Lo que falta lo dice el control de cobertura, que para eso
  // existe y cuenta personas. La Σ sólo se apaga cuando NO HAY PLANTEL, que es el único caso en que
  // no hay nada que proyectar.
  return `IF(N(${hoy})=0;"";N(${hoy})+N(${aumento}))`
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
export function lineaSupuestoAumento({
  sigma = null, celdaPersonas = null, celdaAumento = null, porcentaje = PORCENTAJE_DE_AUMENTO,
} = {}) {
  // SIN ESCALA NO SE INVENTA UN CRITERIO. Si la réplica no trajo el mes, la proyección vuelve al jornal
  // pactado — y eso se DICE. Cambiar de base en silencio sería publicar otro número con el mismo
  // rótulo, que es exactamente lo que este archivo existe para impedir.
  // NOMBRA LA FUENTE QUE FALTA. Al acortar esta línea le saqué "_UOCRA_RAW" y su test lo cazó: sin el
  // nombre de la réplica, el aviso dice que algo se rompió pero no qué se arregla. Un aviso que no se
  // puede accionar es tinta.
  if (!sigma) return sub(`${ALERTA} Sin escala en _UOCRA_RAW — base: hoy, sin aumento`)
  // `IFERROR(...;0)` y no `N(...)` a secas: si una celda de «Básico convenio» devolviera algo que el
  // producto escalar no sabe multiplicar, la línea que avisa del problema sería ella misma un #VALUE! —
  // el aviso se perdería justo cuando hace falta. Un error acá se lee como "no hay escala", que es lo
  // que efectivamente pasa.
  //
  // ═══ EL PÁRRAFO SE FUE; EL SUPUESTO SIGUE DECLARADO (13/08) ═══
  //
  // Decía 460 caracteres —"SUPUESTO DEL DUEÑO — la proyección paga el 100% DEL CONVENIO: las 16
  // personas del plantel valuadas a la hora de escala de SU categoría, no al jornal pactado…"— y el
  // dueño lo rechazó entero: *"tiene muchas palabras y frases y explicación que nadie lee"*.
  //
  // No se borró un criterio, se dejó de repetirlo TRES veces. Lo que el párrafo decía ya está escrito
  // como DATO en el cuadro que encabeza:
  //   · la BASE la declara el encabezado de la columna F (`ROTULO_SIGMA.conAumento` = "Σ $/hora
  //     con aumento" vs "Σ $/hora pactada"). Es la misma celda que lee `baseDeJornales` para Cargas.
  //   · si a alguien el aumento no le alcanza para llegar al mínimo legal lo dice el Estado de su
  //     fila en 1.1 — con el mínimo de la categoría, no con el promedio, que lo escondería.
  //   · que las quincenas del mes en curso van a la tarifa de hoy lo decide `formulaSigmaDelMes` fila
  //     por fila, y se ve en la Σ de cada mes del cuadro.
  // Queda el rótulo, que es lo único que el párrafo agregaba: que es un SUPUESTO y no lo que se paga.
  const cuantos = celdaPersonas ? `"&${celdaPersonas}&"` : 'las'
  // ═══ EL AVISO DECÍA "PROYECCIÓN VACÍA" Y LA PROYECCIÓN NO ESTABA VACÍA (14/08) ═══
  //
  // Estuvo encendido y nadie lo leyó como lo que era, porque describía mal el síntoma: la proyección
  // publicaba $79.753.312 — salidos enteros de la demanda de obras, por el `MAX(convenio; demanda)` de
  // la sección 1, que resuelve por el otro lado cuando el término convenio se apaga. Quien leyera la
  // línea buscaba una columna en blanco y encontraba números; quien mirara los números no tenía forma
  // de saber que ya no llevaban piso de convenio adentro.
  //
  // El aviso dice ahora lo que efectivamente pasa: la proyección SIGUE, sin piso. Es peor noticia que
  // "vacía" y por eso hay que decirla — un cuadro vacío se ve; uno con el piso apagado, no.
  // ═══ LA LÍNEA MIRA EL TÉRMINO DEL AUMENTO, NO EL TOTAL (29/08) ═══
  //
  // Miraba `N(sigma)`, que es `hoy + aumento`. Con plantel cargado y la escala caída ENTERA, ese
  // total sigue siendo > 0 —la gente cobra lo que cobra— así que la línea anunciaba «Con aumento: hoy
  // + 50% del básico» mientras el control de al lado gritaba que nadie lo estaba recibiendo. Las dos
  // celdas eran ciertas por separado y juntas se leían mal, que es la peor forma de mentir: nadie
  // puede señalar cuál de las dos está mal.
  //
  // Ahora hay tres estados y cada uno dice qué se perdió: sin plantel · con plantel y sin escala ·
  // con las dos cosas. El segundo es el que faltaba.
  //
  // CADA LITERAL, ≤ 60 CARACTERES: es `LARGO_NOTA`, el umbral con el que esta pestaña distingue un
  // RÓTULO de una nota, y se mide adentro de las fórmulas (fue así como se colaron las glosas de
  // 374 caracteres que el dueño rechazó). Por eso dice "hoy" y no "la tarifa de hoy".
  //
  // Y DICE DESDE CUÁNDO RIGE, porque el alcance temporal de una cifra vive en la celda y no en un
  // comentario del código (`encabezado-de-periodo-es-el-contrato`). La regla es la frontera de caja
  // comprometida: la quincena que se paga dentro del mes en curso va a la tarifa de hoy, sin aumento.
  const vigencia = ' personas · rige desde el mes de pago siguiente'
  const sinAumento = celdaAumento
    ? `IF(IFERROR(N(${celdaAumento});0)=0;"   · ${ALERTA} La escala no dio básicos: nadie recibe aumento";`
    : ''
  return `=IF(IFERROR(N(${sigma});0)=0;`
    + `"   · ${ALERTA} Sin plantel: la proyección va sin el aumento adentro";`
    + sinAumento
    + `"   · Con aumento: hoy + ${Math.round(Number(porcentaje) * 100)}% del básico · ${cuantos}${vigencia}")`
    + (sinAumento ? ')' : '')
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
 * ═══ EL LÍMITE QUE ESTE CONTROL TENÍA, Y QUE LO DEJÓ CIEGO JUSTO CUANDO IMPORTABA (14/08) ═══
 *
 * Hasta hoy este cálculo IGNORABA la columna «Convenio» del dueño y lo declaraba como límite. Con eso,
 * el día que esa columna quedó con basura de un layout viejo —"46237", "Se paga el"— la pestaña publicó
 * una Σ vacía y el log de la corrida siguió imprimiendo $97.772 tan campante: el control decía que
 * estaba todo bien mientras la proyección se quedaba sin piso de convenio. Un control que no mira la
 * misma entrada que el sistema que controla no controla nada.
 *
 * Ahora recibe lo que hay escrito en esa columna (`escritoPorCodigo`) y aplica LA MISMA regla que la
 * fórmula, definida una sola vez en `lib/jornales-piso-uocra.mjs`. Sin ese argumento se comporta como
 * antes —la columna vacía— que es lo correcto para un llamador que no la tiene.
 *
 * @param {any[][]} grid el espejo completo
 * @param {{inicio:number, fin:number}} bloque
 * @param {{categorias:Object}|null} escalon el escalón vigente ya parseado
 * @param {Object} tabla la equivalencia declarada
 * @param {Object<string,string>} escritoPorCodigo lo que el dueño escribió en «Convenio», por código
 * @returns {{total:number, personas:number, porCategoria:Array, sinEscala:string[], descartados:Array}}
 */
export function sigmaConAumentoDelPlantel(grid = [], bloque = null, escalon = null,
  tabla = CONVENIO_POR_CODIGO, escritoPorCodigo = {}, porcentaje = PORCENTAJE_DE_AUMENTO) {
  const vacio = {
    total: 0, hoy: 0, aumento: 0, personas: 0, porCategoria: [], sinEscala: [], descartados: [],
    bajoConvenio: [],
  }
  if (!bloque) return vacio
  const acum = new Map()
  const sinEscala = []
  const descartados = []
  const bajoConvenio = []
  let personas = 0
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    const fila = grid[r - 1] ?? []
    if (!String(fila[COL_NOMBRE] ?? '').trim()) continue
    personas++
    // LA MISMA CLAVE QUE LA PESTAÑA, O ESTE CONTROL SE VALIDA CONTRA OTRA NORMALIZACIÓN QUE LA QUE
    // PRODUCE EL NÚMERO. Acá había un `.trim()`, que saca los espacios de las puntas y deja los del
    // medio, mientras la fórmula compara contra `TRIM(D)` —que además los colapsa— y
    // `categoriasDelBloque` arma sus filas con `claveDeCategoria`. Con un `"OF  M"` en el espejo, este
    // control abría DOS filas (una por `"OF  M"` y otra por `"OF M"`), el lookup de la columna del
    // dueño fallaba —`escritoPorCodigo` está indexado por la clave normalizada—, y la Σ del log salía
    // $11.781 contra los $10.866 que publica la pestaña. Dos números del mismo concepto y nadie con
    // qué decidir cuál miente.
    //
    // LÍMITE DECLARADO: que este camino y la fórmula den lo MISMO está probado sobre grillas
    // sintéticas, no contra el archivo vivo. La comparación de verdad es el log de la corrida real
    // contra la celda de la pestaña, y ésa la hace quien corra el generador desde el árbol principal.
    const codigo = claveDeCategoria(fila[COL_CATEGORIA])
    const res = categoriaDelConvenio(escritoPorCodigo?.[codigo], convenioDe(codigo, tabla))
    if (res.descartado && !descartados.some((d) => d.codigo === codigo)) {
      descartados.push({ codigo, escrito: res.descartado, usada: res.categoria })
    }
    const convenio = res.categoria
    const basico = convenio ? escalon?.categorias?.[convenio]?.basico : null
    // LA TARIFA DE HOY ES UN HECHO DE LA PLANILLA Y ENTRA IGUAL, CON ESCALA O SIN ELLA. Sin básico no
    // hay aumento que calcular —eso se cuenta aparte— pero la persona SIGUE COBRANDO lo que cobra: si
    // se la saltea, el total del control queda corto contra la fórmula, que la suma igual porque
    // `SUMPRODUCT(--(TRIM(D)=cat);N(W))` no le pregunta a la escala. Los dos caminos tienen que sumar
    // exactamente lo mismo o el control no controla nada.
    const t = tarifaConAumento(fila[COL_JORNAL], basico, porcentaje)
    const hoyDeEsta = Number.isFinite(Number(fila[COL_JORNAL])) ? Number(fila[COL_JORNAL]) : 0
    if (!t) {
      if (codigo && !sinEscala.includes(codigo)) sinEscala.push(codigo || '(sin categoría)')
      const kSin = `${codigo}|`
      const p0 = acum.get(kSin) ?? { codigo, convenio: null, personas: 0, basico: null, aumentoHora: 0, hoy: 0, aumento: 0 }
      acum.set(kSin, { ...p0, personas: p0.personas + 1, hoy: p0.hoy + hoyDeEsta })
      continue
    }
    // QUIÉN QUEDA BAJO EL MÍNIMO LEGAL AUNQUE SE LE APLIQUE EL AUMENTO. No se corrige el número —el
    // cuadro publica la DECISIÓN, que es aditiva— pero callarlo sería publicar una falta laboral con
    // cara de total prolijo. Hoy la lista está vacía; el día que no lo esté, la corrida lo dice.
    if (t.bajoConvenio) bajoConvenio.push({ codigo, tarifa: t.tarifa, piso: t.piso })
    const k = `${codigo}|${convenio}`
    const prev = acum.get(k)
      ?? { codigo, convenio, personas: 0, basico, aumentoHora: t.aumento, hoy: 0, aumento: 0 }
    // EL AUMENTO SE DERIVA DE LA TARIFA, NO SE SUMA EN PARALELO (29/08). Escrito como
    // `prev.aumento + t.aumento` había DOS definiciones de la tarifa nueva: la de `tarifaConAumento`
    // y la que esta Σ reconstruía sumando sus partes.
    //
    // LA PRIMERA VERSIÓN DE ESTE COMENTARIO AFIRMABA UNA VIGILANCIA QUE NO EXISTÍA. Decía que
    // cualquier cambio en la tarifa rompía la igualdad con la fórmula del Sheet «que es el test que
    // la vigila», y la auditoría lo desmintió: mutando `tarifa` a `MAX(hoy + aumento; piso)` la suite
    // era INDISTINGUIBLE entre esta forma y la de paralelo. La razón no era la resta: era la grilla
    // del test, donde la tarifa más baja ($4.300 + $2.699,50 contra un piso de $5.399) nunca hacía
    // morder el MAX. Un control ejercido sólo donde el defecto no puede aparecer no controla nada.
    //
    // Medido de nuevo el 29/08 con una persona BAJO el piso en esa grilla ($2.000 de Oficial):
    //   · con la resta   → «EL CONTROL DE JS Y LA FÓRMULA DAN EL MISMO NÚMERO» ROJO, 15.854 ≠ 14.680;
    //   · en paralelo    → ese assert queda VERDE y ese assert queda verde (el test cae igual, un assert más abajo, por el mínimo legal).
    // O sea: la resta es lo que hace que la igualdad vigile, y la grilla es lo que la hace ejercerse.
    // Las dos cosas hacen falta y ninguna sola alcanza.
    acum.set(k, {
      ...prev,
      personas: prev.personas + 1,
      hoy: prev.hoy + t.hoy,
      aumento: prev.aumento + (t.tarifa - t.hoy),
    })
  }
  const porCategoria = [...acum.values()].map((x) => ({ ...x, subtotal: x.hoy + x.aumento }))
  const hoy = porCategoria.reduce((s, x) => s + x.hoy, 0)
  const aumento = porCategoria.reduce((s, x) => s + x.aumento, 0)
  return {
    total: hoy + aumento,
    hoy,
    aumento,
    personas,
    porCategoria,
    sinEscala,
    descartados,
    bajoConvenio,
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
 * @param {{f0:number, f1:number, conAumento?:boolean, celdaSigmaBase?:string, rAnclaBase?:number}} esc
 * @param {string|null} celdaPago celda "Se paga el" de ESA fila
 */
export function formulaSigmaDelMes(celdaDesde, esc, celdaPago = null) {
  return `=IFERROR(${expresionSigmaDelMes(celdaDesde, esc, celdaPago)};"")`
}

/**
 * LA MISMA Σ, COMO EXPRESIÓN Y SIN EL `IFERROR` DE AFUERA.
 *
 * POR QUÉ SE PARTIÓ EN DOS (13/08). El calendario de pago multiplica esta Σ por las horas y los días
 * dentro de UNA sola celda; con la fórmula completa había que quitarle el `=` a mano al concatenarla,
 * y eso es exactamente el modo en que se cuela una fórmula mal armada que no da error. La expresión
 * viaja desnuda y cada llamador la envuelve una vez, en su propio IFERROR.
 *
 * Misma firma, mismo criterio, una sola definición de la frontera del mes en curso.
 */
export function expresionSigmaDelMes(celdaDesde, esc, celdaPago = null) {
  const { delCuadro, pactada } = piezasSigmaDelMes(celdaDesde, esc)
  // Sin convenio el cuadro YA publica la Σ pactada: no hay dos bases entre las cuales elegir.
  if (!pactada || !celdaPago) return delCuadro
  // La Σ pactada del mes no está en ninguna columna del cuadro cuando éste va al convenio, así que se
  // arma con las piezas que el cuadro SÍ publica: la Σ pactada del plantel (1.1) escalada por el mismo
  // factor acumulado de la columna E, dividido por el factor de SU mes ancla —el de la última quincena
  // cerrada de obra—. Es la misma expresión que usa la columna F cuando la base es la pactada.
  return `IF(${expresionCajaComprometida(celdaPago)};${pactada};${delCuadro})`
}

/**
 * NÚCLEO PURO: LAS DOS Σ DEL MES, SIN DECIDIR TODAVÍA CUÁL SE USA.
 *
 * Se extrajo el 27/08 porque las dos bases dejaron de multiplicarse por lo mismo: el PACTADO se valúa
 * con las horas MEDIDAS por día hábil (es el pronóstico de lo que va a salir de la caja) y el CONVENIO
 * con la jornada real, que cambia según el día de la semana — 9 h de lunes a jueves, 8 el viernes, 4
 * el sábado. Con estructuras distintas ya no alcanza un `IF` adentro de la Σ: el `IF` tiene que
 * envolver el producto entero, y para eso hacen falta las piezas por separado.
 *
 * Devolver `pactada: null` cuando el cuadro no está al convenio NO es un caso de borde: es la señal
 * de que no hay dos bases entre las cuales elegir, y quien la reciba debe multiplicar una sola vez.
 *
 * @returns {{delCuadro:string, pactada:string|null}}
 */
export function piezasSigmaDelMes(celdaDesde, esc) {
  const { f0, f1, conAumento = false, celdaSigmaBase = null, rAnclaBase = null } = esc
  const mes = `MATCH(EOMONTH(${celdaDesde};0);$A$${f0}:$A$${f1};0)`
  const delCuadro = `INDEX($F$${f0}:$F$${f1};${mes})`
  if (!conAumento || !celdaSigmaBase || !rAnclaBase) return { delCuadro, pactada: null }
  return { delCuadro, pactada: `${celdaSigmaBase}*INDEX($E$${f0}:$E$${f1};${mes})/$E$${rAnclaBase}` }
}

/**
 * NÚCLEO PURO: LA FRONTERA DE LA CAJA COMPROMETIDA, EN UNA SOLA DEFINICIÓN.
 *
 * ¿Esta quincena sale de la caja ANTES de fin de mes? De ese lado se valúa al pactado —es la plata que
 * va a salir— y del otro al 100% del convenio, que es planificación. El porqué está arriba, en
 * `quincenaConAumento`, que es la misma regla en JavaScript.
 *
 * Se extrajo el 27/08 porque la frontera pasó a decidir DOS cosas y no una: además de la base ($/hora
 * pactada o de convenio) decide con qué horas se multiplica esa base — las medidas para lo que se paga,
 * la jornada para lo que se debe. Escrita dos veces, el día que alguien corrija el `EOMONTH` en un lado
 * la pestaña empezaría a valuar una quincena con la base de un lado y las horas del otro, y el
 * resultado sería un número plausible.
 *
 * `N(pago)>0` primero: en Sheets un texto es MAYOR que cualquier número, y sin fecha de pago la
 * comparación sola diría "se paga después de fin de mes" por accidente.
 */
export function expresionCajaComprometida(celdaPago) {
  return `AND(N(${celdaPago})>0;${celdaPago}<=EOMONTH(TODAY();0))`
}

/**
 * NÚCLEO PURO: LA MASA DE UNA QUINCENA PROYECTADA — LA BASE Y LAS HORAS, DECIDIDAS POR LA MISMA FECHA.
 *
 * La frontera de la caja comprometida decide DOS cosas a la vez, y tiene que decidirlas juntas:
 *
 *   pago ≤ fin del mes en curso  → Σ PACTADA × horas MEDIDAS × días hábiles
 *       es la plata que va a salir. Las horas medidas son el pronóstico honesto de lo que se va a
 *       trabajar, ausentismo incluido; proyectar la caja con la jornada plena la infla.
 *
 *   pago  > fin del mes en curso → Σ CONVENIO × horas de JORNADA
 *       es la obligación. El convenio no descuenta por ausentismo, y la jornada no es un promedio por
 *       día: son 9 h de lunes a jueves, 8 el viernes y 4 el sábado (ver lib/jornada-uocra.mjs). Por
 *       eso este término NO multiplica por una cuenta de días — las horas ya vienen contadas.
 *
 * ═══ POR QUÉ EL `IF` ENVUELVE EL PRODUCTO Y NO SÓLO LA Σ (27/08) ═══
 *
 * Hasta hoy la fórmula era `Σ(con IF adentro) × horas × días`, y las horas eran una sola celda. Con la
 * jornada real las dos ramas dejaron de tener la misma forma: una multiplica por días y la otra no.
 * Un `IF` que sólo elige la Σ obligaría a elegir las horas en un segundo `IF` con la MISMA condición
 * escrita otra vez — y dos copias de una frontera se separan el día que alguien corrige una. Cuando
 * eso pasa, la celda valúa con la base de un lado y las horas del otro, y el resultado es un número
 * plausible. Una sola condición, un solo lugar.
 *
 * @param {{esc:object, celdaDesde:string, celdaHasta:string, celdaPago:string,
 *          celdaHorasMedidas:string, exprDias:string, exprHorasJornada:string}} d
 * @returns {string} la expresión (sin `=`), separador es-AR
 */
export function expresionMasaDeLaQuincena({
  esc, celdaDesde, celdaPago, celdaHorasMedidas, exprDias, exprHorasJornada,
}) {
  const { delCuadro, pactada } = piezasSigmaDelMes(celdaDesde, esc)
  const alPactado = `${celdaHorasMedidas}*${exprDias}`
  // Sin convenio no hay obligación que valuar aparte: el cuadro ya publica la Σ pactada y la fórmula
  // es EXACTAMENTE la de siempre. El diff en ese caso es cero, que es lo que lo hace seguro.
  if (!pactada || !celdaPago || !exprHorasJornada) return `${delCuadro}*${alPactado}`
  return `IF(${expresionCajaComprometida(celdaPago)};`
    + `${pactada}*${alPactado};`
    + `${delCuadro}*${exprHorasJornada})`
}
