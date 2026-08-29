// LO QUE ESTÁ INVERTIDO — EL SUMANDO QUE LA CAJA OPERATIVA DEJA AFUERA A PROPÓSITO.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// CAJA discrimina desde el 06/08 lo que está invertido: las dos filas de Balanz llevan el `‖` y el
// total de disponibilidades las RESTA, por orden explícita del dueño —*"la caja disponible tiene que
// ser únicamente el saldo bancario y el efectivo, discriminar lo que se encuentra en Balanz
// invertido"*—. Es el panel operating-cash vs invested-balances de J.P. Morgan Access, y esa decisión
// se respeta entera: la caja operativa NO los suma.
//
// Pero los dos Cash Flow heredaron sólo la mitad de esa decisión. Publicaban la caja operativa al
// cierre y nada más, así que $45.015.210 de la empresa no aparecían en ninguna cifra de las dos
// pestañas donde el dueño mira cómo termina el año. Discriminar no es esconder: el panel de JPM
// muestra los dos números, y la liquidez total es la suma de los dos.
//
// ═══ POR QUÉ POR RÓTULO Y NO POR FILA ═══
//
// El cuadro de CAJA se corre de fila sin avisar: sus cuentas nacen de una lista (`caja-disponibilidades`)
// y el generador reparte las filas al escribir. Una referencia `Caja!$C$11` sigue devolviendo un número
// después de que se agregue una cuenta arriba —otro número, sin un solo #REF!—, que es exactamente el
// modo de falla por el que existe `materiales-fusion.mjs`. Acá el emparejamiento es por el RÓTULO de la
// cuenta, y el rótulo es el contrato.
//
// Y el criterio no dice "Balanz": dice `‖ invertido`, que es la MARCA con la que CAJA declara "esto no
// es caja operativa". El día que la empresa tenga un plazo fijo, entra solo. Que hoy todo lo invertido
// esté en Balanz lo verifica un test contra la propia lista de cuentas de CAJA — si deja de ser cierto,
// se pone rojo y la glosa que nombra al broker se corrige antes de mentir.
//
// ═══ LO QUE NO SE PUDO HACER, Y QUEDA PROPUESTO ═══
//
// Lo correcto a largo plazo es que CAJA publique un rango con nombre (`CAJA_INVERTIDO`) al lado de
// `CAJA_TOTAL_DISPONIBLE`, y que las vistas lo citen sin conocer la geometría de la pestaña. Eso exige
// agregarle a CAJA una fila con el total de lo invertido y REGENERAR la pestaña, y hoy escribir CAJA
// está vedado. Mientras tanto el SUMIF por rótulo da el mismo número sin tocar una sola celda de CAJA;
// el día que el nombre exista, este módulo se reduce a devolverlo.
//
// ═══ LÍMITE DECLARADO: LO INVERTIDO TIENE HOY DOS DEFINICIONES ═══
//
// `caja-tarjetas.mjs` lo define como `N(invArs)+N(invUsd)` —dos celdas que `caja-grilla` ubica por el
// campo `banco: 'balanzArs' | 'balanzUsd'`—, y este módulo lo define por la MARCA `‖ invertido`. Hoy
// las dos seleccionan exactamente las mismas dos filas, y eso NO es una casualidad que haya que
// confiar: lo fija un test que compara el resultado del criterio contra las filas que `caja-grilla`
// cablea en la tarjeta INVERTIDO (`fBalanzArs`/`fBalanzUsd`).
//
// El día que haya una cuenta invertida que no sea de Balanz —un plazo fijo, una caución— las dos
// definiciones se separan: CAJA seguiría mostrando sólo Balanz y los Cash Flow la incluirían. Dos
// números distintos de la misma plata es exactamente lo que Realidad Única prohíbe. La unificación
// correcta es que `caja-grilla` derive esas filas de la misma marca, y eso vive en el generador de
// CAJA — que hoy no se toca. Mientras tanto el test se pone ROJO antes de que las dos se separen.
//
// NÚCLEO PURO: no toca la red, no lee el Sheet, no sabe de Google.

import { ALERTA } from './glifos.mjs'

/** La marca con la que CAJA declara que una cuenta NO es caja operativa. Ver `caja-disponibilidades`. */
export const MARCA_INVERTIDO = '‖ invertido'

/** El criterio de SUMIF que empareja por rótulo. `*` es el comodín de Sheets, no una expresión regular. */
export const CRITERIO_INVERTIDO = `*${MARCA_INVERTIDO}`

/**
 * Las dos columnas de CAJA que este módulo cita: el rótulo de la cuenta y su saldo en pesos.
 *
 * NO son una costumbre: `caja-grilla` escribe cada cuenta como `[nombre, importe en origen, saldo en
 * pesos, fecha]` desde la columna A. El test las verifica generando la grilla de CAJA en memoria y
 * buscando las filas de Balanz por su rótulo — si mañana el panel gana una columna, se pone rojo acá
 * y no en la pestaña del dueño.
 */
export const COL_ROTULO = 'A'
export const COL_PESOS = 'C'

/** La glosa que dice que no se pudo leer. Un importe con una advertencia al lado no es un importe. */
export const GLOSA_SIN_INVERTIDO = 'no pude leer lo invertido en CAJA'

/**
 * LO QUE DICE LA FOTO DE HOY CUANDO NO HAY ANCLA. Vive acá y no en cada vista porque las dos publican
 * la MISMA tarjeta CAJA HOY: dos textos distintos para el mismo estado son dos versiones del archivo.
 */
export const GLOSA_SIN_ANCLA = 'Falta el saldo declarado de CAJA'

/** Lo mismo dicho corto, para el slot más angosto del titular (294 px). */
export const CIERRE_SIN_INVERTIDO = `${ALERTA} no pude leer Balanz`

/** Y lo que dice cuando SÍ lo leyó. "hoy" no es relleno: declara la ventana del sumando que trae. */
export const CIERRE_CON_INVERTIDO = 'con Balanz hoy'

/**
 * EL PEOR CASO CON EL QUE SE MIDEN LAS GLOSAS. Es el mismo número de `IMPORTE_MAS_LARGO`
 * (cash-flow-hero-cabe) con el formato de una glosa, y un test verifica que sigan siendo el mismo. No
 * es una cifra real: es la prueba de que el titular no depende de que el número sea corto.
 */
export const IMPORTE_MUESTRA = '$ 1.234.567.890'

/**
 * NÚCLEO PURO: la semántica del criterio de Sheets, en JavaScript.
 *
 * ═══ POR QUÉ EXISTE (28/08/2026, hallazgo de la auditoría) ═══
 *
 * El test que verifica qué filas de CAJA entran en la suma simulaba el criterio con
 * `rotulo.endsWith(MARCA_INVERTIDO)`: una SEGUNDA implementación, escrita a mano, de lo que hace la
 * constante que se emite. No derivaba del criterio — lo reemplazaba. Con eso, aflojar
 * `CRITERIO_INVERTIDO` a `*‖*` dejaba la suite entera en verde y la fórmula publicada se llevaba
 * `Valores a depositar ‖ no suma al total` Y `Total disponibilidades ‖ percibido`: la caja operativa
 * contada dos veces adentro de la liquidez total, sin un solo #REF!.
 *
 * Un control nunca se valida contra otra información que la que produce. Acá el matcher SALE del
 * criterio, así que cualquier cambio en el criterio cambia lo que el test ve.
 *
 * LA SEMÁNTICA ES LA DE SHEETS, no la de una expresión regular: `*` es cualquier cosa, `?` es un
 * carácter, `~*` y `~?` son los literales, la comparación NO distingue mayúsculas, y —lo que más
 * importa acá— un criterio SIN comodines es IGUALDAD, no "contiene".
 */
export function emparejaCriterio(criterio, texto) {
  const patron = String(criterio ?? '').replace(/~([*?~])|([.+^${}()|[\]\\])|([*?])/g,
    (_, escapado, especial, comodin) => {
      // `\~` NO es un escape válido con el flag `u` y revienta con SyntaxError; `~` no necesita
      // escaparse en una expresión regular, así que va literal. Lo encontró la auditoría probando
      // `~~`, que es el escape de Sheets para la tilde: los otros dos (`~*`, `~?`) sí funcionaban.
      if (escapado) return escapado === '~' ? '~' : `\\${escapado}`
      if (especial) return `\\${especial}`
      return comodin === '*' ? '.*' : '.'
    })
  return new RegExp(`^${patron}$`, 'iu').test(String(texto ?? ''))
}

/** ¿CAJA declaró esta cuenta como invertida? La respuesta la da el criterio que se publica. */
export const esInvertido = (rotulo) => emparejaCriterio(CRITERIO_INVERTIDO, rotulo)

/**
 * NÚCLEO PURO: ¿este texto cita una FILA de esa pestaña (`'Caja'!$C$11`) en vez de una columna entera?
 *
 * Vive acá y no en cada test porque es UN control, y escrito dos veces cerró una sola: la versión del
 * Semanal miraba una columna de las cuatro del titular y una referencia posicional en cualquiera de
 * las otras tres pasaba en verde.
 */
export function citaUnaFilaDe(pestana, texto) {
  const p = String(pestana ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`'?${p}'?!\\$?[A-Z]+\\$?\\d`, 'i').test(String(texto ?? ''))
}

/** Una pestaña citada en una fórmula. Las comillas simples internas se duplican, como en Sheets. */
const citar = (titulo) => {
  const s = String(titulo ?? '').trim()
  return s ? `'${s.replaceAll("'", "''")}'` : null
}

/**
 * NÚCLEO PURO: la expresión que suma lo invertido leyendo CAJA POR RÓTULO.
 *
 * Columnas enteras a propósito: en qué fila cae cada cuenta lo decide el generador de CAJA al escribir,
 * y acotar el rango a un tramo sería volver al emparejamiento posicional por la ventana.
 *
 * @param {string|null} pestanaCaja el TÍTULO real de la pestaña, resuelto contra el archivo
 * @returns {string|null} la expresión, o null si no se sabe qué pestaña leer
 */
export function expresionInvertido(pestanaCaja) {
  const tab = citar(pestanaCaja)
  if (!tab) return null
  return `SUMIF(${tab}!$${COL_ROTULO}:$${COL_ROTULO};"${CRITERIO_INVERTIDO}";${tab}!$${COL_PESOS}:$${COL_PESOS})`
}

/**
 * NÚCLEO PURO — LA DECISIÓN, EN JAVASCRIPT: qué publica la tarjeta de liquidez total.
 *
 * Existe separada de la fórmula porque un test sobre la fórmula prueba que alguien escribió un `IF`, no
 * que el `IF` decide bien. Acá se decide con números y se prueban las dos ramas; la fórmula de abajo
 * emite exactamente esas dos ramas y el test compara los textos que publica cada una.
 *
 * UN CERO NO SE PUBLICA COMO LIQUIDEZ. Si lo invertido da 0 —porque la pestaña no está, porque el
 * rótulo cambió, porque la celda quedó vacía— la tarjeta valdría lo mismo que la caja operativa y
 * diría, sin decirlo, "no hay nada invertido". Eso hoy es falso por $45.015.210.
 *
 * @param {{cierre:number, invertido:number|null}} p
 * @returns {{total:number|null, aviso:string|null}}
 */
export function liquidezDeNumeros({ cierre, invertido }) {
  const inv = Number(invertido)
  if (invertido === null || invertido === undefined || !Number.isFinite(inv) || inv === 0) {
    return { total: null, aviso: GLOSA_SIN_INVERTIDO }
  }
  return { total: Number(cierre || 0) + inv, aviso: null }
}

/** `#,##0` va en US, como todo patrón de formato del repo; los argumentos, en es-AR con `;`. */
const plata = (expr) => `TEXT(${expr};"$ #,##0")`

/**
 * LO QUE LA GLOSA DEL CIERRE MIDE EN EL PEOR CASO — lo que el auditor de ancho tiene que poder medir.
 * @param {string} prefijo lo que la vista dice ANTES de la cifra ("caja operativa")
 */
export const muestraCierre = (prefijo) => `${prefijo} · ${CIERRE_CON_INVERTIDO} ${IMPORTE_MUESTRA}`

/** Y la del Semanal, que cuelga de la fecha del saldo declarado. */
export const muestraSemanal = (fecha = 'al 28/08') => `${fecha} · más ${IMPORTE_MUESTRA} invertido en Balanz`

/**
 * NÚCLEO PURO: la glosa de la tarjeta del CIERRE, en fórmula es-AR.
 *
 * ═══ POR QUÉ LA LIQUIDEZ TOTAL DEJÓ DE SER UNA TARJETA (29/08/2026) ═══
 *
 * Era la cuarta del titular y sumaba el saldo PROYECTADO al 31/12 con un `SUMIF` que vale HOY:
 * $45.015.210 sobre $72.509.069, el 62% de la cifra, bajo un rótulo que decía "al 31/12". El dueño
 * rechazó el titular entero —*"todo eso rehacer no me convence nada"*— y el rediseño trajo una regla
 * que esa tarjeta violaba: CADA TARJETA HABLA DE UNA SOLA VENTANA DE TIEMPO.
 *
 * La cifra no se pierde, cambia de jerarquía: la TARJETA publica el cierre operativo proyectado —una
 * sola ventana— y la GLOSA dice cuánto da con Balanz, declarando que ese sumando vale HOY. Una glosa
 * no compite con el titular: es la nota al pie que explica de qué está hecho, y ahí la mezcla se lee
 * como lo que es en vez de esconderse adentro de un número grande.
 *
 * No hay forma de proyectar la posición de Balanz a diciembre sin inventarla —el OS no tiene su curva
 * de rendimiento—, así que el supuesto no se elimina: se declara donde se lee la cifra.
 *
 * @param {{refCierre:string, exprInvertido:string|null, prefijo:string}} p
 * @returns {{glosa:string, muestra:string}}
 */
export function glosaDeCierre({ refCierre, exprInvertido, prefijo }) {
  const sinDato = `${prefijo} · ${CIERRE_SIN_INVERTIDO}`
  if (!exprInvertido) return { glosa: sinDato, muestra: sinDato }
  const inv = `N(${exprInvertido})`
  return {
    glosa: `=IF(${inv}=0;"${sinDato}";"${prefijo} · ${CIERRE_CON_INVERTIDO} "&${plata(`N(${refCierre})+${inv}`)})`,
    muestra: muestraCierre(prefijo),
  }
}

/**
 * NÚCLEO PURO: la glosa de CAJA HOY del Semanal — la misma plata, dicha en la vista que ya tenía su
 * propio titular. No se le copian las cuatro cifras del Mensual: el Semanal contesta otras preguntas.
 *
 * @param {string} base la expresión de la glosa que ya publicaba la tarjeta (sin el `=`)
 * @param {string|null} exprInvertido
 */
export function glosaConInvertido(base, exprInvertido) {
  if (!exprInvertido) return `=${base}&" · ${GLOSA_SIN_INVERTIDO}"`
  const inv = `N(${exprInvertido})`
  return `=${base}&IF(${inv}=0;" · ${GLOSA_SIN_INVERTIDO}";" · más "&${plata(exprInvertido)}&" invertido en Balanz")`
}
