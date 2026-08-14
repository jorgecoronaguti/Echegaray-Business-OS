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

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

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
 * @param {{celdasPersonas:string, celdasBasico:string, nQuincenas:number}} d rangos del bloque 1.1
 */
export function formulaControlPiso({ celdasPersonas, celdasBasico, nQuincenas }) {
  const sinEscala = `SUMPRODUCT(${celdasPersonas};--(${celdasBasico}=""))`
  return `=IF(${sinEscala}=0;`
    + `"✓ las ${nQuincenas} quincenas proyectadas cubren el piso UOCRA";`
    + `"${ALERTA} SIN piso UOCRA: "&${sinEscala}&" persona(s) sin escala — la proyección sale de la demanda")`
}
