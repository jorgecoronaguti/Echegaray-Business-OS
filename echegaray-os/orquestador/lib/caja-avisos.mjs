// LAS ALERTAS Y LAS ACCIONES DE LA PORTADA DE CAJA — LO ÚNICO QUE QUEDA DESPUÉS DE LOS NÚMEROS.
//
// ═══ POR QUÉ SON FÓRMULAS Y NO TEXTO ═══
//
// Un aviso escrito por el generador vale hasta la corrida siguiente: si el timer está detenido —y ya
// estuvo detenido— la pestaña sigue diciendo "todo en orden" sobre una caja que se dio vuelta. Estas
// ocho líneas son `IF(...)` que se evalúan cada vez que alguien ABRE la planilla, así que no pueden
// envejecer. Es la misma razón por la que la fecha de frescura de cada bloque es calculada.
//
// ═══ CUATRO ALERTAS Y TRES ACCIONES. EL TOPE ES EL DISEÑO ═══
//
// El dueño puso el número: *"alertas críticas = máximo 4 líneas… acciones recomendadas = máximo 3,
// accionables"*. Un tablero que puede mostrar quince alertas termina mostrando quince siempre, y
// entonces no avisa ninguna. Cuando aparezca la alerta número cinco, hay que decidir cuál sale — no
// agregar un renglón.
//
// LA DIFERENCIA ENTRE UNA ALERTA Y UNA ACCIÓN, que es la que hace que las dos sirvan: la alerta dice
// QUÉ ESTÁ MAL (un hecho verificable), la acción dice QUÉ HACER con un monto y una fecha ("cubrir $X
// antes del 12/08"). Una alerta sin acción es una preocupación; una acción sin monto es una intención.
//
// ═══ CUANDO NO PASA NADA, LO DICE ═══
//
// La primera línea de cada bloque cae en "· sin alertas" / "· sin acciones pendientes" cuando ninguna
// condición se cumple, y el formato condicional la pinta en verde. Un bloque en blanco se lee como
// "esto todavía no se calculó", que es exactamente la duda que este rediseño existe para eliminar.

import { ANEXO, DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { ALERTA } from './glifos.mjs'
import { terminoLibro } from './libro-sumas.mjs'

/**
 * El prefijo de una alerta que pide acción. Se usa para pintarla: el rojo sale del TEXTO, no de una
 * regla que hay que mantener sincronizada con la lógica de la fórmula.
 *
 * ES UN ALIAS DE `ALERTA`, no una segunda decisión: acá vivía tipeado el `⚠` que el PDF no dibuja, y
 * dos constantes para el mismo glifo es exactamente cómo una queda atrás. El nombre local se conserva
 * porque `caja-pestana` arma con él la regla de color y ahí el par ALERTA/OK se lee de a dos.
 *
 * LA REGLA DE COLOR Y EL TEXTO SE PUBLICAN JUNTOS: las celdas de aviso son FÓRMULAS, así que en
 * cuanto CAJA se regenera las dos puntas hablan del mismo glifo. Por eso acá no hace falta el brazo
 * heredado que sí llevan las marcas que se comparan contra lo ya publicado.
 */
export const MARCA_ALERTA = ALERTA
/** El prefijo de una línea tranquila. Verde. */
export const MARCA_OK = '·'

const plata = (e) => `TEXT(${e};"$#,##0")`
const dia = (e) => `TEXT(${e};"dd/mm")`
const abs = (n) => `ABS(N(${n}))`
const suma = (ns) => ns.map(abs).join('+')

/** Los tres controles cuya plata NO CIERRA: hay que ir a buscarla. El detalle vive en `_CAJA_ANEXO`. */
const NO_CIERRA = [
  [ANEXO.difEcheq, 'echeqs entregados'],
  [ANEXO.difConciliacion, 'CAJA vs Cash Flow'],
  [ANEXO.efectivoSinExplicar, 'efectivo sin depositar'],
  // EL CAJÓN QUE DA NEGATIVO (14/08). Entra acá y no como quinta alerta —el tope de cuatro es del
  // dueño— porque es exactamente eso: plata que no cierra. Mientras no sea 0, el efectivo que se
  // publica es el conteo del dueño y no el calculado; el detalle está en `_CAJA_ANEXO`, bloque A1.
  [ANEXO.efectivoImposible, 'efectivo imposible'],
]
/** Los cuatro controles donde falta INFORMACIÓN: hay que cargarla. */
const FALTA = [
  [ANEXO.vencidoSinConciliar, 'vencido sin conciliar'],
  [ANEXO.oficinaSinCanal, 'OFICINA sin canal'],
  [ANEXO.chequesSinMarca, 'cheques sin marca'],
  [ANEXO.chequesSinFecha, 'cheques sin fecha'],
]

/**
 * CUÁL DE LOS CONTROLES MANDA, con su monto.
 *
 * Un total agrupado sin decir quién lo produce es el "número mudo" que este archivo persigue desde
 * julio: no habilita ninguna acción. Se arma como una cascada de IF contra el máximo, así que la
 * primera coincidencia gana y no hace falta ordenar nada.
 */
const cual = (pares) => {
  const mx = `MAX(${pares.map(([n]) => abs(n)).join(';')})`
  const cascada = pares.reduceRight(
    (acc, [nombre, etiqueta]) => `IF(${abs(nombre)}=@MX;"${etiqueta} "&${plata(abs(nombre))};${acc})`, '""')
  return cascada.replaceAll('@MX', mx)
}

/** La reserva operativa declarada por el dueño. Sin ella cargada vale cero, y el aviso lo dice. */
const RESERVA = `MAX(0;N(${DESDE_CAJA.minima}))`

/**
 * LAS CUATRO ALERTAS. Puras: devuelven cuatro fórmulas, en orden de gravedad.
 *
 * @param {object} ref celdas ya resueltas de la pestaña
 * @param {string} ref.piso el mínimo de la posición acumulada
 * @param {string} ref.fechaPiso la fecha de ese mínimo
 * @returns {string[]} exactamente cuatro fórmulas
 */
export function alertas(ref) {
  if (!ref?.piso || !ref?.fechaPiso) throw new Error('caja-avisos: la alerta de liquidez necesita el piso y su fecha')
  const condCorta = `${ref.piso}<${RESERVA}`
  const condNoCierra = `${suma(NO_CIERRA.map(([n]) => n))}>0`
  const condFalta = `${suma(FALTA.map(([n]) => n))}>0`
  const condArqueo = `N(${DESDE_CAJA.arqueoArs})+N(${DESDE_CAJA.arqueoUsd})=0`
  const condExtracto = `AND(ISNUMBER(${DESDE_CAJA.bancoCorte});TODAY()-${DESDE_CAJA.bancoCorte}>7)`
  // ═══ UN CONTEO CARGADO Y SIN FECHA NO ES UNA CELDA FEA: ES EL AUTOMÁTICO APAGADO (16/08/2026) ═══
  //
  // La fecha de las dos filas de efectivo la estampa la corrida del anexo desde el centinela. Mientras
  // no esté, el neto de movimientos posteriores se degrada a 0 por su propia guarda y la pestaña
  // publica el conteo pelado: la caja deja de reaccionar a las compras y a las cobranzas. Eso ya pasó
  // —el dueño borró la celda de la que dependía y nadie se enteró— y la única señal era una columna D
  // vacía, que se lee como un detalle de formato.
  //
  // SE MIDE POR MONEDA para que no haga ruido: dispara sólo si HAY conteo y NO hay fecha. Sin conteo
  // manda la alerta de arqueo, que ya existe y es más grave.
  const sinFecha = (conteo, fecha) => `AND(N(${conteo})<>0;NOT(ISNUMBER(${fecha})))`
  const condSinFecha = `OR(${sinFecha(DESDE_CAJA.arqueoArs, ANEXO.conteoArsDia)};${sinFecha(DESDE_CAJA.arqueoUsd, ANEXO.conteoUsdDia)})`
  // LA CALMA SE CALCULA CON LAS MISMAS CONDICIONES, no con una copia: si mañana se afloja un umbral y
  // acá quedara el viejo, la pestaña podría mostrar "sin alertas" arriba de tres alertas encendidas.
  const nadaPasa = `NOT(OR(${condCorta};${condNoCierra};${condFalta};${condArqueo};${condSinFecha};${condExtracto}))`
  const cuando = `IF(ISNUMBER(${ref.fechaPiso});" el "&${dia(ref.fechaPiso)};"")`

  return [
    `=IF(${condCorta};"${MARCA_ALERTA} La caja se queda corta: faltan "&${plata(`${RESERVA}-${ref.piso}`)}&${cuando};IF(${nadaPasa};"${MARCA_OK} sin alertas";""))`,
    `=IF(${condNoCierra};"${MARCA_ALERTA} No cierra "&${plata(suma(NO_CIERRA.map(([n]) => n)))}&" · manda "&${cual(NO_CIERRA)};"")`,
    `=IF(${condFalta};"${MARCA_ALERTA} Falta cargar "&${plata(suma(FALTA.map(([n]) => n)))}&" · manda "&${cual(FALTA)};"")`,
    // EL ARQUEO MANDA SOBRE LA ANTIGÜEDAD DEL EXTRACTO: sin conteo la caja física vale $0 y eso
    // desfigura el total entero; un extracto de ocho días desfigura una sola cuenta. Y el conteo SIN
    // FECHA va en el medio: es menos grave que no tener conteo (la caja física sigue valiendo lo
    // contado) y más que un extracto viejo (el descuento automático de compras y cobranzas no corre).
    `=IF(${condArqueo};"${MARCA_ALERTA} Sin arqueo cargado: la caja física vale $0";`
      + `IF(${condSinFecha};"${MARCA_ALERTA} El conteo no tiene fecha: se muestra tal cual y no se le descuenta nada";`
      + `IF(${condExtracto};"${MARCA_ALERTA} El extracto tiene "&TEXT(TODAY()-${DESDE_CAJA.bancoCorte};"0")&" días";"")))`,
  ]
}

/**
 * LAS TRES ACCIONES. Puras. Cada una lleva monto y fecha, o no se emite.
 *
 * @param {object} ref
 * @param {string} ref.piso
 * @param {string} ref.fechaPiso
 * @returns {string[]} exactamente tres fórmulas
 */
export function acciones(ref) {
  if (!ref?.piso || !ref?.fechaPiso) throw new Error('caja-avisos: las acciones necesitan el piso y su fecha')
  const hasta = `IF(ISNUMBER(${ref.fechaPiso});" antes del "&${dia(ref.fechaPiso)};"")`
  const cobranzaVencida = terminoLibro({ signo: 1, estados: ['VENCIDO'], medida: 'magnitud' })
  const pagoEn7 = terminoLibro({ signo: -1, estados: ['COMPROMETIDO', 'VENCIDO'], hasta: 'TODAY()+7', medida: 'magnitud' })
  // COLOCABLE = EL PISO MENOS LA RESERVA, NUNCA NEGATIVO. Y sin reserva declarada NO se publica un
  // número: publicaría el piso entero, que es el error más caro posible en esta línea — invita a
  // inmovilizar hasta el último peso que la empresa va a necesitar.
  const colocable = `MAX(0;${ref.piso}-${RESERVA})`

  return [
    `=IF(${ref.piso}<${RESERVA};"Cubrir "&${plata(`${RESERVA}-${ref.piso}`)}&${hasta};`
      + `IF(N(${DESDE_CAJA.minima})<=0;"Cargá la caja mínima en 01_Valores Iniciales: sin ella no se sabe cuánto es colocable";`
      + `IF(${colocable}>0;"Hay "&${plata(colocable)}&" colocables, con vencimiento"&${hasta};"${MARCA_OK} sin acciones pendientes")))`,
    `=IF(${cobranzaVencida}>0;"Reclamar "&${plata(cobranzaVencida)}&" de cobranzas vencidas";"")`,
    `=IF(${pagoEn7}>0;"Preparar "&${plata(pagoEn7)}&" de pagos que vencen antes del "&${dia('TODAY()+7')};"")`,
  ]
}
