// DÓNDE ESTÁ HOY EN UN CUADRO DE 53 COLUMNAS — Y QUÉ SE HACE CON ESO.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (13/08/2026) ═══
//
// El dueño: *"roto cash flow semanal en boton ir a la semana actual"*. Medido con un navegador real
// sobre el archivo vivo: la fórmula de `A3` calculaba el destino CORRECTO (AH7, la semana del 10/08) y
// lo que estaba roto era la INTERACCIÓN. Un clic sólo selecciona la celda; el segundo abre el chip de
// vista previa; recién el tercero —sobre el chip— navega. Y el reflejo natural cuando "no pasa nada"
// es el doble clic, que entra en MODO EDICIÓN y muestra la fórmula cruda en pantalla.
//
// `HYPERLINK` NUNCA se comporta como un botón de una pulsación: es una función de celda, no un
// control. El "⏵" y las mayúsculas prometían un botón que el motor de Sheets no puede cumplir.
//
// ═══ LA SOLUCIÓN NO ES UN BOTÓN MEJOR: ES QUE NO HAGA FALTA NINGUNO ═══
//
// La pestaña abre en enero porque enero está a la izquierda. Si las semanas ya terminadas van dentro
// de un GRUPO COLAPSADO, la pestaña abre mostrando la semana actual y las que vienen, sin que nadie
// haga clic en nada. Nada se borra y nada se oculta de forma irreversible: el "+" del margen despliega
// el pasado cuando se lo quiere ver, y el que despliega es el dueño, no un script.
//
// Y LOS GRÁFICOS NO SE VACÍAN al plegar, aunque el default de Sheets sea descartar lo oculto
// (SKIP_HIDDEN_ROWS_AND_COLUMNS): los de este cuadro se dibujan con `hiddenDimensionStrategy:
// SHOW_ALL` desde que la zona auxiliar del layout viejo iba oculta a propósito. Está en el envoltorio
// común de `cash-flow-graficos.mjs`, así que la historia plegada se sigue viendo dibujada.
//
// ═══ POR QUÉ VIVE EN SU PROPIO ARCHIVO ═══
//
// `cash-flow-matriz.mjs` ya pasa las 500 líneas del estándar del repo. Y esto es una sola idea —dónde
// cae hoy en el cuadro— con tres consecuencias que se leen juntas: qué se pliega, qué dice el rótulo,
// y qué residuo dejó el atajo viejo en la última fila.

import { COL, FILA, letra } from './cash-flow-matriz.mjs'

/** Índice 0-based de una letra de columna. Inversa exacta de `letra()`. PURA. */
export function indiceDeLetra(s) {
  let n = 0
  for (const c of String(s).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/**
 * NÚCLEO PURO: en qué ventana cae `hoy`. Devuelve el índice 0-based, o -1 si cae fuera del ejercicio.
 *
 * La ventana es SEMI-ABIERTA [desde, hasta), la misma con la que suma la columna (`terminoLibro`). Si
 * fuera otra, "la columna de hoy" señalaría una columna y los números serían de otra.
 */
export function indiceDeHoy(ventanas = [], hoy = new Date()) {
  const t = new Date(hoy).getTime()
  return ventanas.findIndex((v) => new Date(v.desde).getTime() <= t && t < new Date(v.hasta).getTime())
}

/**
 * NÚCLEO PURO: QUÉ COLUMNAS DE HOJA QUEDARON EN EL PASADO — el rango a plegar, o `null`.
 *
 * Pasado = la ventana TERMINÓ (`hasta <= hoy`). La semana en curso nunca entra: su `hasta` es el lunes
 * siguiente. El rango es 0-based y semi-abierto, listo para `addDimensionGroup`.
 *
 * DOS CASOS DEVUELVEN `null`, Y LOS DOS IMPORTAN:
 *
 *   · NADA TERMINÓ todavía (se mira el ejercicio que viene): no hay pasado, no hay grupo.
 *   · TODO TERMINÓ (se mira un ejercicio ya cerrado, o el cuadro quedó viejo): plegar las 53 columnas
 *     TAPARÍA LA MATRIZ ENTERA. Ese defecto exacto ya se pagó en este archivo —un grupo colapsado del
 *     layout anterior dejó las filas 8 a 13 del Mensual invisibles con el generador escribiéndolas cada
 *     dos horas— y no se vuelve a pagar del lado de las columnas. Sin la semana actual a la vista, un
 *     pliegue no resuelve nada: sólo esconde.
 *
 * @param {Array<{desde:Date, hasta:Date}>} ventanas las de la vista, en orden
 * @param {Date} hoy inyectado SIEMPRE por el llamador: un `new Date()` acá haría el pliegue intesteable
 * @returns {{inicio:number, fin:number}|null}
 */
export function columnasDelPasado(ventanas = [], hoy = new Date(), { col0 = COL.tiempo0 } = {}) {
  const t = new Date(hoy).getTime()
  let k = 0
  while (k < ventanas.length && new Date(ventanas[k].hasta).getTime() <= t) k++
  if (k === 0 || k >= ventanas.length) return null
  return { inicio: col0, fin: col0 + k }
}

/**
 * LOS REQUESTS QUE PLIEGAN EL PASADO. PURA.
 *
 * ═══ POR QUÉ SE BORRA Y SE VUELVE A CREAR EN CADA CORRIDA, Y TIENE QUE SER ASÍ ═══
 *
 * `cash-flow-vistas.mjs` borra TODOS los grupos heredados antes de formatear (`tandasDeGrupos`), así
 * que este grupo también muere y se rehace en la misma corrida. No es desprolijidad: son tres razones
 * medidas.
 *
 *   1. EL RANGO CAMBIA SOLO. Cada lunes hay una columna más de pasado. La API no reemplaza un grupo ni
 *      le mueve el rango: lo APILA (ver `getRowGroups` en google.mjs). Un generador que agrega sin
 *      limpiar deja una escalera de "+" que crece cada dos horas.
 *   2. LA PIEL DESOCULTA TODO. `desocultarFootprint` pone `hiddenByUser:false` en el footprint entero
 *      —está ahí porque una fila oculta a mano sobrevive a que se borre su grupo—. Y colapsar es
 *      exactamente poner `hiddenByUser:true`. Si el pliegue no se re-afirmara DESPUÉS de la piel, el
 *      margen mostraría el grupo colapsado y las columnas se verían igual: el peor de los dos mundos.
 *   3. EL LADO SEGURO ES QUEDAR DESPLEGADO. Si una corrida muere entre el borrado y esto, la pestaña
 *      queda con el pasado a la vista: incómoda, nunca tapada. Al revés sería tapar el cuadro.
 *
 * `depth: 1` porque es el ÚNICO grupo: los heredados ya se borraron.
 */
export function requestsDePliegue(sheetId, rango) {
  // ═══ EL DUEÑO LO SACÓ (13/08, textual): "sacame la mierda esa de agrupar q has hecho en los cash
  // flows, mantenme el boton de ir al dia en los dos pero sin esa cosa de mierda q has hecho" ═══
  //
  // El pliegue existía para que la pestaña abriera en el período en curso sin depender del atajo.
  // Resolvía un problema real —53 columnas y el cuadro abre en enero— pero con un costo que él no
  // acepta: el "+" en el margen y las columnas tapadas. El atajo de A3 SIGUE, que es lo que pidió
  // mantener, y el resaltado vivo de la columna de hoy también.
  //
  // NO SE BORRA LA FUNCIÓN, SE DEVUELVE VACÍO. `cash-flow-vistas.mjs` ya borra los grupos heredados
  // ANTES de llamar acá, así que con esto la pestaña queda desplegada y sin grupos: si sólo se
  // sacara la llamada, los grupos que ya están en el archivo sobrevivirían y el "+" quedaría para
  // siempre. Devolver vacío mantiene el borrado y no vuelve a crear nada.
  void sheetId; void rango
  return []
}

/**
 * EL RÓTULO DEL ATAJO — LO QUE DICE, NO LO QUE PROMETE. PURA.
 *
 * Devuelve la EXPRESIÓN del segundo argumento de `HYPERLINK`, no un texto: "Semana actual: AH · 10/08"
 * se calcula en la hoja, así que sirve aunque nadie haga clic y se mueve solo el lunes a la madrugada.
 * Un rótulo tipeado ("IR A LA SEMANA ACTUAL") no informa nada y encima promete un clic que no existe.
 *
 * EL PREFIJO VA LITERAL Y ES DELIBERADO. El control de `flujo-caja-rehacer-todo.mjs` parte la fórmula
 * buscando `;"<rótulo>` para leer a qué celda apunta el atajo. Con el rótulo entero calculado, ese
 * corte no existiría y el control volvería a gritar en cada corrida que el atajo es inválido — es
 * exactamente lo que ya pasó el 13/08 cuando el rótulo cambió y el control siguió buscando el viejo.
 * Por eso el prefijo (`ROTULO_HOY`) es una constante compartida y la fórmula ARRANCA con él.
 *
 * @param {string} prefijo `ROTULO_HOY.semana` / `.mes` — literal, y con el espacio final
 * @param {string} dir la expresión `ADDRESS(...)` que ya calcula el destino ("AH7")
 * @param {string} fecha la expresión de la fecha del período ("TODAY()-WEEKDAY(TODAY();3)")
 * @param {string} patron patrón de `TEXT`, en US (`d/mm`), como todo patrón de formato del repo
 */
export function expresionRotulo(prefijo, dir, fecha, patron) {
  // La letra de la columna es `dir` sin la fila: `ADDRESS(...;4)` devuelve "AH7" y la fila es siempre
  // la de la cabecera, así que su largo se conoce. Recortar por largo y no por SUBSTITUTE es lo único
  // que no se rompe cuando la letra contiene el mismo dígito que la fila ("G7" → SUBSTITUTE daría "G").
  const soloLetra = `LEFT(${dir};LEN(${dir})-${String(FILA.cabecera).length})`
  return `"${prefijo}"&${soloLetra}&"  ·  "&TEXT(${fecha};"${patron}")`
}

/**
 * NÚCLEO PURO: ¿este texto es el residuo que deja la VERIFICACIÓN del atajo?
 *
 * ═══ QUÉ ES ESE RESIDUO (medido el 13/08/2026 con captura) ═══
 *
 * `Cash Flow Semanal!A107 = "AH7"` y `Cash Flow Mensual!A109 = "I7"`, a la vista, en la última fila de
 * cada pestaña. No los escribió el dueño: los escribe `verificarPresentacion` del pipeline, que para
 * saber a qué celda apunta el atajo pega su expresión en una celda de apunte, lee el resultado y
 * después repone lo que había. Reponer lo que había es escribir VACÍO sobre LLENO, y ahí `no-borrar`
 * hace lo único que sabe hacer: gana el destino. El OS se pisaba a sí mismo cada dos horas.
 *
 * ═══ LA PRUEBA, Y POR QUÉ NO ES "CONFIÁ, ES MÍO" ═══
 *
 * Son tres hechos verificables por un tercero SIN preguntarle nada al que quiere borrar:
 *
 *   1. la forma es una referencia A1 pelada —`AH7`—, que no es una anotación que nadie escriba;
 *   2. su FILA es exactamente `FILA.cabecera`, la fila de encabezados de ESTA vista, declarada en el
 *      código, no leída de la celda;
 *   3. su COLUMNA cae dentro de las columnas de tiempo de ESTA vista (nunca la de TOTAL ni una de
 *      afuera del cuadro).
 *
 * Ninguno sale del valor "porque sí": los tres se contrastan contra la geometría que el generador
 * declara. Y el vaciado en sí lo decide después `no-borrar` releyendo el destino — si en el medio el
 * dueño escribió algo distinto, ya no coincide y la celda se conserva.
 *
 * @param {any} valor lo que hay hoy en la celda
 * @param {{filaCabecera:number, col0:number, colFin:number}} geo columnas de tiempo en [col0, colFin)
 */
export function esApunteDelAtajo(valor, { filaCabecera = FILA.cabecera, col0 = COL.tiempo0, colFin = 0 } = {}) {
  const m = /^([A-Z]{1,3})(\d{1,5})$/.exec(String(valor ?? '').trim())
  if (!m) return false
  if (Number(m[2]) !== filaCabecera) return false
  const c = indiceDeLetra(m[1])
  return c >= col0 && c < colFin
}

/** El rango del pliegue, en letras, para el log: "B..AG". PURA. */
export const rangoEnLetras = (r) => (r ? `${letra(r.inicio)}..${letra(r.fin - 1)}` : '—')
