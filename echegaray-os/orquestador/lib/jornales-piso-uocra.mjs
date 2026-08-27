// EL PISO DEL CONVENIO: CONTRA QUÉ CATEGORÍA SE MIDE CADA PERSONA, Y SI LA PROYECCIÓN LO CUBRE.
//
// ═══ LA PREGUNTA DEL DUEÑO (14/08, textual) ═══
//
// *"me aseguras que las proyecciones de aqui a fin de año de obreros se calcularon llegando a cubrir
// el 100% de lo q pide uocra en cada parte de la escala por mas q tengamos un acuerdo interno de 50 en
// banco 50 en efectivo? sino tambien hacelo"*.
//
// El acuerdo 50/50 es una forma de PAGO; la escala es una OBLIGACIÓN. Que la mitad salga en billetes
// no puede bajar el total por debajo del convenio. Contestarla necesitaba dos cosas que no existían:
// un piso calculable categoría por categoría, y un control que lo mire.
//
// ═══ LA RESPUESTA, MEDIDA EL 14/08 EN EL ARCHIVO VIVO: NO LO CUBRÍA — NINGUNA ═══
//
// La proyección de obreros es `MAX(convenio; demanda de obras)`. El término `convenio` estaba VACÍO,
// así que el MAX se resolvía SIEMPRE por el otro lado y las diez quincenas se proyectaban por la
// demanda de las obras vendidas, que no sabe nada de la escala. Seis de las nueve quedaban por debajo
// del piso, $28.864.019 en total (el detalle, en el test de este archivo).
//
// La causa no estaba en el convenio ni en el motor: estaba en la columna «Convenio (tuya)» del bloque
// 1.1, que es del dueño y que el generador —bien— nunca escribe. Al rediseñarse la pestaña, las filas
// se movieron y esa columna quedó con lo que el layout ANTERIOR tenía en esas mismas celdas:
//
//     A M  → "46237"        (un número de serie de fecha)
//     OF   → "Se paga el"   (un encabezado)
//     A    → "46063"
//
// Con eso el `MATCH` de «Básico convenio» no encontraba nada en tres de las cuatro categorías, sus
// celdas quedaban vacías, y el guard de `formulaSigmaConvenio` —que hace bien su trabajo— apagaba la Σ
// entera. De ahí en adelante todo el castillo se cae en silencio: Σ vacía → término convenio 0 → MAX
// por la demanda → sin piso. Ni un error, ni una celda en rojo: 12 de 16 personas proyectadas sin
// escala.
//
// ═══ LA REGLA QUE ESTE ARCHIVO FIJA ═══
//
// «El valor del dueño gana» sigue siendo cierto — pero un valor que NO ES UNA CATEGORÍA DE LA ESCALA no
// es un valor del dueño, es basura de un layout viejo. Sólo gana lo que la escala reconoce; lo demás
// cae en la equivalencia declarada y la fila lo DICE, para que el dueño vea que su celda se ignoró.
// Preservar la celda (no pisarla) y obedecerla ciegamente son cosas distintas: lo primero es respeto,
// lo segundo es dejar que un encabezado viejo gobierne la masa salarial de un semestre.

import { ALERTA } from './glifos.mjs'
import { CATEGORIAS, CATEGORIAS_POR_MES } from './uocra-acuerdos.mjs'

/** Las categorías que se cotizan POR HORA: son las únicas contra las que un jornal se puede comparar. */
export const CATEGORIAS_POR_HORA = CATEGORIAS.filter((c) => !CATEGORIAS_POR_MES.includes(c))

// ═══ EL PISO SE MIDE CON LA JORNADA, NO CON LA ASISTENCIA (27/08) ═══
//
// El término convenio de la proyección se armaba con `Σ$/hora × HORAS MEDIDAS × días`, y las horas
// medidas son el promedio real de las quincenas cerradas: 7,18 h/persona/día en el archivo vivo. Eso
// convierte un PISO en un pronóstico. Si el mes que viene la gente falta más, el "piso" baja solo —
// y la obligación no baja: el convenio no descuenta por ausentismo, y las horas que no se trabajan
// se pagan igual cuando el que no dio trabajo fue el empleador.
//
// Las dos preguntas son distintas y las dos hacen falta, así que la pestaña publica las dos una al
// lado de la otra: la MEDIDA gobierna lo que va a salir de la caja este mes (el pactado, la caja
// comprometida) y la JORNADA gobierna la obligación proyectada.
//
// CUÁNTAS HORAS TIENE LA JORNADA NO SE DECIDE ACÁ. Nació valiendo 8 h parejas —una constante en este
// archivo— y era 10% menos que la jornada real, con la limitación declarada al lado. El dueño la
// contestó el 27/08 (9 h de lunes a jueves, 8 el viernes, y el sábado se trabaja) y el número dejó de
// ser una constante para pasar a ser una tabla por día de la semana, que además la consumen el
// cronograma y la provisión de vacaciones. Vive en `lib/jornada-uocra.mjs`, una sola vez.

/**
 * EL LÍMITE QUE ESTE PISO SIGUE TENIENDO, DECLARADO DONDE SE USA.
 *
 * La jornada de lunes a viernes es la regla del dueño y se puede afirmar. Las 4 h del sábado son un
 * SUPUESTO leído del espejo, no una norma verificada: la carga real del sábado varía (en diciembre
 * son 4 h para todo el plantel, en agosto hay un sábado en blanco y otro con 8 h). Y sigue sin haber
 * calendario de feriados en ninguna pestaña. El número no se toca sin la norma verificada al lado.
 */
export const GAP_JORNADA = 'L-J 9 h y V 8 h son la regla del dueño; el sábado de 4 h es un SUPUESTO '
  + 'leído del espejo, y no hay calendario de feriados'

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * NÚCLEO PURO: DE QUÉ BLOQUE DEL ESPEJO SALE EL PLANTEL QUE FIJA EL PISO.
 *
 * ═══ EL PISO SE MEDÍA SOBRE GENTE QUE YA NO ERA EL PLANTEL (27/08) ═══
 *
 * `ultimaQuincenaCerrada` es el criterio correcto para las HORAS y para el mes ancla del factor: la
 * quincena en curso está a medio cargar y basar un semestre en un bloque con un día de horas es
 * frágil. Pero el plantel no son horas. Los nombres, la categoría y el $/hora de un bloque están
 * completos desde el día que la planilla lo abre — y la quincena en curso es la única que sabe quién
 * está trabajando HOY.
 *
 * Medido en el archivo vivo el 27/08: la última cerrada tenía 15 personas y la en curso 17 (Ochoa y
 * Castillo entraron el 19/8). El mismo cuadro publicaba «Obreros · UOCRA · 17» arriba y proyectaba el
 * piso de 15 abajo: dos personas en la nómina sin un peso de piso de convenio proyectado, −11,8% sobre
 * la Σ $/hora del plantel. Ninguna celda lo decía, porque el control del piso preguntaba otra cosa.
 *
 * Es la regla de REALIDAD ÚNICA: «el plantel» se define UNA vez. El bloque vigente manda; la cerrada
 * queda como respaldo para el caso real en que la planilla abrió el bloque y todavía no cargó a nadie.
 *
 * @param {{bloques:Array, cerrada:object|null, personasDe:(b:object)=>number}} d
 * @returns {{bloque:object|null, origen:'vigente'|'cerrada'|null, personas:number}}
 */
export function bloqueDelPiso({ bloques = [], cerrada = null, personasDe = () => 0 } = {}) {
  const vigente = bloques.length ? bloques[bloques.length - 1] : null
  const nVigente = vigente ? Number(personasDe(vigente)) || 0 : 0
  if (vigente && nVigente > 0) return { bloque: vigente, origen: 'vigente', personas: nVigente }
  if (!cerrada) return { bloque: null, origen: null, personas: 0 }
  return { bloque: cerrada, origen: 'cerrada', personas: Number(personasDe(cerrada)) || 0 }
}

/** El rótulo del cuadro 4.1 lo decide de dónde salió el plantel: un título que miente es un dato falso. */
export function rotuloDelPiso(origen) {
  return origen === 'cerrada'
    ? 'Plantel base — última quincena cerrada'
    : 'Plantel vigente — la quincena en curso'
}

/**
 * NÚCLEO PURO: contra qué categoría de la escala se mide una fila del plantel.
 *
 * @param {any} escrito lo que hay en «Convenio (tuya)» — puede ser basura de un layout viejo
 * @param {string|null} equivalencia la declarada por el dueño en CONVENIO_POR_CODIGO
 * @param {string[]} categorias las de la escala que se cotizan por hora
 * @returns {{categoria:string|null, origen:'dueño'|'declarada'|'ninguna', descartado:string|null}}
 */
export function categoriaDelConvenio(escrito, equivalencia = null, categorias = CATEGORIAS_POR_HORA) {
  const t = norm(escrito)
  const hit = categorias.find((c) => c.toLowerCase() === t.toLowerCase())
  if (hit) return { categoria: hit, origen: 'dueño', descartado: null }
  // Vacío es "no escribí nada": no hay nada que descartar y la equivalencia entra sin ruido. Con algo
  // escrito que la escala no reconoce, la equivalencia entra IGUAL pero la fila tiene que decirlo.
  const descartado = t === '' ? null : t
  if (equivalencia) return { categoria: equivalencia, origen: 'declarada', descartado }
  return { categoria: null, origen: 'ninguna', descartado }
}

/**
 * NÚCLEO PURO: la MISMA regla, como expresión es-AR para la celda de «Básico convenio».
 *
 * Se escribe acá al lado de la versión JS a propósito: son dos caminos al mismo criterio y el test los
 * compara. Si un día se separan, el número de la pestaña y el del log dejan de ser el mismo número —
 * que es exactamente el modo en que un control empieza a validar contra lo que él mismo produce.
 *
 * @param {{celda:string, equivalencia:string|null, rangoCategorias:string}} d
 * @returns {string} la expresión (sin `=`) que resuelve la clave de búsqueda
 */
export function expresionClaveConvenio({ celda, equivalencia = null, rangoCategorias }) {
  if (!equivalencia) return celda
  // ISNUMBER(MATCH(...)) y no IFERROR: lo que decide es si la escala CONOCE ese texto, no si la
  // fórmula se rompe. Un `IFERROR` acá también taparía un rango mal escrito.
  return `IF(ISNUMBER(MATCH(${celda};${rangoCategorias};0));${celda};"${equivalencia}")`
}

/**
 * NÚCLEO PURO: el piso del convenio de UNA quincena, abierto por categoría.
 *
 * piso = Σ (personas de la categoría × $/hora de convenio de ESA categoría) × horas por persona y día
 *        × días laborables de la quincena, todo escalado por el factor de paritaria del mes.
 *
 * Es la misma cuenta con la que el motor valúa la proyección al 100% del convenio: por eso el MAX
 * cubre el piso POR CONSTRUCCIÓN cuando el término convenio es un número. Lo que este cálculo agrega
 * es poder AFIRMARLO con un número, categoría por categoría, sin abrir el Sheet.
 *
 * @param {{porCategoria:Array<{convenio:string, personas:number, basico:number}>,
 *          factor:number, horasPorDia:number, dias:number}} d
 * @returns {{piso:number, detalle:Array<{categoria:string, personas:number, basico:number, piso:number}>}}
 */
export function pisoDeQuincena({ porCategoria = [], factor = 1, horasPorDia = 0, dias = 0 }) {
  const k = Number(factor) * Number(horasPorDia) * Number(dias)
  const detalle = porCategoria.map((c) => ({
    categoria: c.convenio,
    personas: Number(c.personas) || 0,
    basico: Number(c.basico) || 0,
    piso: (Number(c.personas) || 0) * (Number(c.basico) || 0) * k,
  }))
  return { piso: detalle.reduce((s, x) => s + x.piso, 0), detalle }
}

/**
 * NÚCLEO PURO: LAS QUINCENAS PROYECTADAS QUE NO LLEGAN AL PISO — el control que el dueño pidió.
 *
 * Devuelve TODAS con su piso y su faltante (0 cuando cubre), y no sólo las cortas: un control que
 * devuelve una lista vacía no distingue "todas cubren" de "no se pudo medir ninguna".
 *
 * @param {Array<{proyectado:number, porCategoria:Array, factor:number, horasPorDia:number, dias:number}>} qs
 * @returns {{filas:Array, cortas:number, falta:number}}
 */
export function quincenasBajoPiso(qs = []) {
  const filas = (qs ?? []).map((q) => {
    const { piso, detalle } = pisoDeQuincena(q)
    const proyectado = Number(q.proyectado) || 0
    return { ...q, piso, detalle, proyectado, falta: Math.max(0, piso - proyectado) }
  })
  return {
    filas,
    cortas: filas.filter((f) => f.falta > 0.5).length,
    falta: filas.reduce((s, f) => s + f.falta, 0),
  }
}

/**
 * NÚCLEO PURO: «CUÁNTAS PERSONAS ESTÁN SIN ESCALA», EN UNA SOLA DEFINICIÓN es-AR.
 *
 * ═══ EL FALSO POSITIVO QUE COSTÓ LA MITAD DEL PLANTEL (14/08) ═══
 *
 * Las dos celdas que vigilan el convenio —la Σ del bloque 4.2 y el ✓ del calendario— preguntaban lo
 * mismo con la misma expresión escrita dos veces: `--(F="")`, o sea *«¿la celda del básico está
 * VACÍA?»*. Medido en el archivo vivo, `F80` (la fila «OF M», 8 de 16 personas) no estaba vacía:
 * tenía el texto **"Banco"**, residuo del layout anterior. Entonces:
 *
 *   · el guard de la Σ no disparó   → `SUMPRODUCT(B;F)` trató "Banco" como 0 y publicó $46.988,
 *     que es la masa del plantel SIN «OF M». Con su básico real la Σ es $97.772: más del doble.
 *   · el control del piso no disparó → publicó *"✓ las 9 quincenas proyectadas cubren el piso UOCRA"*
 *     sobre un piso calculado con la mitad del plantel afuera.
 *
 * Ninguna de las dos mintió por su cuenta: mintieron porque preguntaban por el VACÍO cuando lo que
 * las hace verdaderas es que la celda sea **un número mayor que cero**. Un texto no es un vacío, y
 * es exactamente el estado que produce un rediseño de filas.
 *
 * Por qué `ISNUMBER(...)*(...>0)` y no `N(F)>0`: en Sheets un TEXTO comparado con un número da
 * VERDADERO (`"Banco">0` es TRUE), así que `>0` solo volvería a dejar pasar el residuo. `ISNUMBER`
 * primero, y el `>0` después, para que un básico en 0 —una escala que no trajo el mes— también
 * cuente como sin escala. `1-(…)` en vez de `NOT(…)` porque adentro de SUMPRODUCT lo que se
 * necesita es aritmética sobre el array, no un booleano escalar.
 *
 * Vive en UN solo lugar y la importan las dos celdas: dos copias de un criterio de control se
 * separan el día que una se corrige, y ahí el número de la pestaña y el del aviso dejan de ser el
 * mismo número — que es cómo un control empieza a validarse contra lo que él mismo produce.
 *
 * @param {string} celdasPersonas rango de «Personas» del bloque 1.1 (ej. `$B$79:$B$82`)
 * @param {string} celdasBasico   rango de «Básico convenio» (ej. `$F$79:$F$82`)
 * @returns {string} expresión (sin `=`) que rinde CUÁNTAS personas quedaron sin escala
 */
export function expresionSinEscala(celdasPersonas, celdasBasico) {
  return `SUMPRODUCT(${celdasPersonas};1-(ISNUMBER(${celdasBasico})*(${celdasBasico}>0)))`
}

/**
 * NÚCLEO PURO: LA LÍNEA QUE DICE SI EL PISO SE ESTÁ APLICANDO — y que reemplaza a una que MENTÍA.
 *
 * La celda que avisaba del problema decía *"El convenio no devolvió escala — proyección vacía"*. Y la
 * proyección NO estaba vacía: publicaba $79.753.312 salidos enteros de la demanda de obras. Un aviso
 * que describe mal el síntoma manda a buscar el problema al lugar equivocado, y por eso esa línea
 * estuvo encendida sin que nadie la leyera como lo que era.
 *
 * Acá el aviso dice las dos cosas que importan: que el piso NO se está aplicando, y CUÁNTAS personas
 * quedaron sin escala — que es el número con el que se arregla (cargar su categoría en «Convenio»).
 *
 * ═══ EL ✓ SE FIRMABA A SÍ MISMO (27/08) ═══
 *
 * La celda decía *"✓ las 9 quincenas proyectadas cubren el piso UOCRA"* mientras la proyección estaba
 * $16,2M corta de septiembre a diciembre. No mintió: contestaba OTRA pregunta. Preguntaba «¿cada
 * categoría del cuadro tiene básico?» —y sí, las cuatro lo tenían— cuando el piso se estaba cayendo
 * por las otras dos entradas del producto: el plantel (15 personas del cuadro contra 17 en la nómina)
 * y las horas (7,18 medidas contra la jornada). Las dos entradas que el control NO miraba son las
 * mismas dos con las que se construye el número que el control aprueba: UN CONTROL NUNCA SE VALIDA
 * CONTRA LA MISMA INFORMACIÓN QUE PRODUCE.
 *
 * Ahora mira las tres, y las dos nuevas las mira por el OTRO camino: las personas del cuadro de pago
 * (`celdaPersonasPago`, que las cuenta sobre el bloque VIGENTE del espejo) contra las del cuadro del
 * piso, y las horas medidas contra la jornada. Son números que la pestaña ya publica y que salen de
 * fuentes distintas: si empatan, empatan por el hecho, no por construcción.
 *
 * @param {{celdasPersonas:string, celdasBasico:string, nQuincenas:number,
 *          celdaPersonasPago?:string, celdaPersonasPiso?:string,
 *          celdaHoras?:string, celdaJornada?:string}} d rangos del bloque 4.1 y las celdas testigo
 */
export function formulaControlPiso({
  celdasPersonas, celdasBasico, nQuincenas,
  celdaPersonasPago = null, celdaPersonasPiso = null, celdaHoras = null, celdaJornada = null,
}) {
  const sinEscala = expresionSinEscala(celdasPersonas, celdasBasico)
  // El orden de los avisos es el del tamaño del agujero: gente sin escala apaga la Σ entera; gente
  // fuera del piso se la lleva en proporción; horas cortas la recortan parejo. El primero que dispare
  // es el que hay que arreglar, y por eso se dice UNO, no los tres juntos.
  const faltan = celdaPersonasPago && celdaPersonasPiso ? `N(${celdaPersonasPago})-N(${celdaPersonasPiso})` : null
  const cortas = celdaHoras && celdaJornada ? `N(${celdaJornada})-N(${celdaHoras})` : null
  const ok = `"✓ las ${nQuincenas} quincenas proyectadas cubren el piso UOCRA"`
  let f = `IF(${sinEscala}=0;${ok};`
    + `"${ALERTA} SIN piso UOCRA: "&${sinEscala}&" persona(s) sin escala — la proyección sale de la demanda")`
  if (cortas) {
    f = `IF(${cortas}>0.01;`
      + `"${ALERTA} el piso se mide con "&TEXT(${celdaHoras};"0,00")&" h y la jornada es "&TEXT(${celdaJornada};"0,00")&" h";`
      + `${f})`
  }
  if (faltan) {
    f = `IF(${faltan}>0;`
      + `"${ALERTA} el piso proyecta "&N(${celdaPersonasPiso})&" persona(s) y la nómina tiene "&N(${celdaPersonasPago})`
      // "sin piso UOCRA" y no "sin piso de convenio": la celda vive ARRIBA de la sección 4 y ninguna
      // palabra gremial va en el medio (orden del dueño). Es la misma cadena que ya usaba el aviso de
      // al lado, así que además los dos avisos de esta celda hablan igual.
      + `&" — faltan "&${faltan}&" sin piso UOCRA";`
      + `${f})`
  }
  return `=${f}`
}
