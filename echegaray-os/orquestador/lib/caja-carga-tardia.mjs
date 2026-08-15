// EL PARCIAL QUE CRECE SOBRE UNA FILA VIEJA — el agujero que ninguna ventana por fecha puede ver.
//
// ═══ LA LECCIÓN YA PAGADA (07/08/2026) ═══
//
// Escrita en este repo con todas las letras: *"un parcial que crece sobre una fila vieja es invisible
// para cualquier ventana"*. Es literal y sigue vigente. Si hoy el dueño paga $500.000 en efectivo
// AUMENTANDO el monto pagado de una fila de Compras fechada en marzo, la ventana por fecha económica
// —que es la correcta y la que evita que una corrección de datos se lea como billetes moviéndose— no
// lo ve. El billete salió del cajón y el cajón sigue publicando que está.
//
// El error va SIEMPRE en el sentido caro: la caja publicada queda por ENCIMA de la real, y ése es el
// número con el que se decide qué se paga. Errar por defecto cuesta un pago postergado; errar por
// exceso cuesta un cheque rebotado y un descubierto al 62,78%.
//
// ═══ POR QUÉ AHORA SE PUEDE VER, Y ANTES NO ═══
//
// Porque el hecho se puede fechar por CUÁNDO APARECIÓ EL DATO además de por la fecha tipeada en la
// fila. El centinela de celdas (caja-conteo-centinela.mjs) mira las celdas de importe en cada corrida y
// anota cuál vio: una celda cuyo valor CRECIÓ después del instante del conteo, en una fila cuya fecha
// la deja fuera de la ventana, es exactamente el hueco. Ningún otro mecanismo del archivo lo alcanza:
// Sheets no sabe cuándo cambió una celda y el historial de Drive está podado.
//
// ═══ QUÉ HACE Y QUÉ NO HACE, PORQUE LA DIFERENCIA ES LA REGLA DE LA CASA ═══
//
// MIDE Y NOMBRA. NO resta solo. Un delta positivo sobre una fila vieja tiene dos explicaciones que
// este mecanismo NO puede separar: un pago nuevo cargado sobre la fila equivocada (plata que salió) o
// la corrección de un importe mal cargado hace meses (plata que nunca se movió). Restar la segunda
// sería fabricar una salida; ignorar la primera es lo que ya pasa hoy. Lo único honesto es publicar
// el número con nombre y apellido —fila por fila— y que lo mire una persona.
//
// LA DECISIÓN DE CABLEARLO AL NETO ES DEL DUEÑO, no de este módulo: mueve `CAJA_TOTAL_DISPONIBLE`, que
// leen los dos cash flow y el KPI de Cheques Emitidos.
//
// ═══ LO QUE NO PUEDE VER, DECLARADO ═══
//
//   · LA PRIMERA CORRIDA NO VE NADA. Sin un valor anterior observado no hay delta: una celda que el
//     centinela mira por primera vez no es evidencia de nada. El mecanismo empieza a servir en la
//     SEGUNDA corrida, y hasta entonces informa cero porque no vio, no porque no haya.
//   · UNA FILA BORRADA Y REESCRITA con otro importe se lee como un delta. Es lo mismo que ve una
//     persona mirando la pestaña: no hay forma de distinguirlas sin un registro de ediciones.
//   · MOVER UN PAGO DE UNA FILA A OTRA da un delta positivo en una y negativo en otra. Por eso se
//     informan los dos lados y no sólo la suma.

import { clasificar } from './caja-ancla-por-instante.mjs'

/**
 * ¿Esta fila es INVISIBLE para la ventana del conteo?
 *
 * El criterio de la ventana vive en un solo lado (`clasificar`) a propósito: si se reescribiera acá,
 * el detector y la fórmula podrían empezar a opinar distinto sobre la misma fila y el número resultante
 * no significaría nada. Para una SALIDA la ventana incluye el mismo día del conteo, así que sólo queda
 * afuera lo estrictamente anterior — y lo que no tiene fecha, que no entra a ninguna ventana nunca.
 *
 * @param {number|null} fecha serial de la fecha económica de la fila
 * @param {number} anclaDia serial (día) del conteo
 */
export function invisibleParaLaVentana(fecha, anclaDia) {
  const donde = clasificar({ fecha, entra: false }, { dia: anclaDia })
  return donde === 'dentro' || donde === 'sin-fecha'
}

/**
 * NÚCLEO PURO: cuánta plata se cargó DESPUÉS del conteo sobre filas que la ventana no mira.
 *
 * @param {Array<{referencia:string, valor:number, valorPrevio:number|null, vistoDesde:Date,
 *   fecha:number|null, primera:boolean, etiqueta?:string}>} celdas
 * @param {{anclaDia:number, anclaInstante:Date}} ancla el conteo: su día y su instante
 * @returns {{medible:boolean, motivo:string|null, sobreestimado:number, subestimado:number,
 *   detalle:Array, miradas:number, sembrando:number}}
 */
export function cargaTardia(celdas = [], { anclaDia, anclaInstante } = {}) {
  const vacio = { sobreestimado: 0, subestimado: 0, detalle: [], miradas: 0, sembrando: 0 }
  // SIN ANCLA NO SE AFIRMA NADA. Un cero devuelto cuando no se pudo medir se lee como "está todo
  // bien", y un control mudo que se lee en verde es el modo de falla que este archivo vino a cerrar.
  if (!(anclaInstante instanceof Date) || !Number.isFinite(Number(anclaDia))) {
    return { ...vacio, medible: false, motivo: 'sin ancla del conteo: no hay contra qué comparar' }
  }
  let sobreestimado = 0
  let subestimado = 0
  let sembrando = 0
  const detalle = []
  for (const c of celdas) {
    // Una celda que el centinela mira por PRIMERA vez no prueba nada: no la vio antes.
    if (c.primera || c.valorPrevio === null || c.valorPrevio === undefined) { sembrando++; continue }
    if (!(c.vistoDesde instanceof Date) || c.vistoDesde <= anclaInstante) continue
    if (!invisibleParaLaVentana(c.fecha, anclaDia)) continue
    const delta = Math.round((Number(c.valor) - Number(c.valorPrevio)) * 100) / 100
    if (!delta) continue
    if (delta > 0) sobreestimado += delta
    else subestimado += -delta
    detalle.push({ referencia: c.referencia, etiqueta: c.etiqueta ?? '', delta, fecha: c.fecha, vistoDesde: c.vistoDesde })
  }
  detalle.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return {
    medible: true,
    motivo: null,
    sobreestimado: Math.round(sobreestimado * 100) / 100,
    subestimado: Math.round(subestimado * 100) / 100,
    detalle,
    miradas: celdas.length - sembrando,
    sembrando,
  }
}

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * EL AVISO, EN UNA LÍNEA — con la fila que manda adentro.
 *
 * Devuelve `null` cuando no hay nada que decir: un aviso que se emite siempre no avisa nada. Sale por
 * stdout porque el runner del pipeline escanea la salida estándar buscando la marca de alerta; lo que
 * va a stderr no entra al resumen de la corrida y por eso no lo lee nadie.
 *
 * @param {ReturnType<typeof cargaTardia>} r
 */
export function avisoCargaTardia(r = {}, { marca = '▲', fuente = 'Compras' } = {}) {
  if (r.medible === false) {
    return `${marca} NO PUDE MEDIR LA CARGA TARDÍA en ${fuente} (${r.motivo}): un pago cargado sobre una `
      + 'fila vieja saldría del cajón sin que nada lo reste ni lo nombre.'
  }
  if (!r.sobreestimado && !r.subestimado) return null
  const primera = r.detalle[0]
  const quien = primera ? ` · manda ${primera.referencia}${primera.etiqueta ? ` (${primera.etiqueta})` : ''} con ${pesos(primera.delta)}` : ''
  const otro = r.subestimado ? ` (y ${pesos(r.subestimado)} en sentido contrario)` : ''
  return `${marca} CARGA TARDÍA EN ${String(fuente).toUpperCase()}: ${pesos(r.sobreestimado)} en ${r.detalle.length} `
    + `celda(s) que crecieron DESPUÉS del conteo sobre filas anteriores a él${otro}. La ventana por fecha `
    + `no las ve, así que el efectivo publicado puede estar ${pesos(r.sobreestimado)} por encima del real${quien}. `
    + 'Puede ser un pago cargado sobre una fila vieja (plata que salió) o la corrección de un importe '
    + 'histórico (plata que nunca se movió): no se resta solo porque no se pueden distinguir.'
}
