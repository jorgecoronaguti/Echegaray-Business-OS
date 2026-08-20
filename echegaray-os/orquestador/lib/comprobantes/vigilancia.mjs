// EL AUDITOR DE COMPROBANTES, DISPARADO SOLO Y CON DESTINO — NÚCLEO PURO + UN BORDE QUE ANOTA.
//
// ═══ EL DEFECTO: UN CONTROL QUE EXISTE Y NADIE DISPARA NO ES UN CONTROL (14/08) ═══
//
// `scripts/auditar-comprobantes-cargados.mjs` sabe detectar el descalce entre el registro de cargas
// (`comunicacion.comprobantes_cargados`) y lo que de verdad hay en la pestaña Compras. Corrido a mano
// encuentra desvíos vivos. Corrido a mano — y `grep -rl auditarCompras` devolvía el script y su test,
// nada más: **nadie lo llamaba**. Lo que encontró el día que alguien se acordó de correrlo:
//
//   fila 840 · Alumetal 0031-00002661 · registrado como cargado · NO ESTÁ en Compras · −$1.095.076,13
//
// Ese comprobante tiene lo peor de los dos mundos a la vez: la clave de idempotencia BLOQUEA volver a
// cargarlo, y el gasto no está en ninguna fila. El costo de esa obra queda sobrestimado por
// $1.095.076,13 y la cuenta corriente de ese proveedor también, y nada grita.
//
// ═══ POR QUÉ ACÁ Y NO EN EL SCRIPT ═══
//
// Porque lo tienen que disparar DOS: el bot al terminar una carga (donde nacen los descalces nuevos) y
// un timer (para los que nacen sin que nadie cargue nada — el dueño borrando una fila a mano, o el
// cargador de Claude Code, que no anota en el registro). Si cada uno tuviera su criterio de "qué es
// grave", los dos avisarían cosas distintas del mismo archivo.
//
// ═══ QUÉ SE CONSIDERA GRAVE, Y POR QUÉ NO TODO ═══
//
// Los cuatro estados de `conciliarRegistro` NO valen lo mismo, y meterlos en una sola bolsa es cómo un
// aviso deja de leerse:
//
//   · `no_esta` y `reserva_huerfana` → **PLATA**. El registro dice que se cargó y en Compras no está:
//     el gasto no existe para el Flujo de Fondos y la clave impide reintentarlo. Se suma el importe.
//   · `fila_movida` y `reserva_cargada` → **RASTRO**. La fila existe y el gasto está bien; lo que
//     miente es el número de fila del registro. No hay plata en juego, pero cualquier trazabilidad
//     posterior apunta a la fila equivocada. Se cuenta, no se suma.
//
// NO ESCRIBE NI UNA CELDA. La corrección la aplica una persona: Compras es la pestaña donde el dueño
// carga a mano, y un script que la reescriba solo es la séptima pérdida de trabajo de este repo.

import { pesos } from './aritmetica.mjs'

/** Los estados del registro donde el gasto NO está en la pestaña. Son los que cuestan plata. */
export const SIN_GASTO = Object.freeze(['no_esta', 'reserva_huerfana'])

/** Los estados donde el gasto está pero el registro apunta mal. Cuestan trazabilidad, no plata. */
export const SIN_RASTRO = Object.freeze(['fila_movida', 'reserva_cargada'])

/**
 * NO SE PUDO VERIFICAR. Ni plata ni rastro: una AUSENCIA DE VEREDICTO.
 *
 * Lo emite `conciliarRegistro` cuando la pestaña no devolvió los importes y por lo tanto la huella
 * más débil —número + importe— no se pudo construir de ese lado. Sin ella, un comprobante cuyo
 * nombre de celda difiere del nombre del registro se ve exactamente igual que uno que no está.
 *
 * Va aparte a propósito: meterlo en `SIN_GASTO` es lo que hizo que el bot gritara «el costo de esas
 * obras está sobrestimado» sobre seis comprobantes que estaban perfectamente cargados.
 */
export const SIN_VEREDICTO = Object.freeze(['no_verificable'])

/**
 * Los descalces registro↔pestaña de un resultado de `auditarCompras`. PURA.
 *
 * Trabaja sobre `conciliado` y no sobre `hallazgos`: `conciliado` viene tipado por estado y el estado
 * es justo lo que decide la gravedad. Reconstruirlo parseando la prosa de un hallazgo sería inventar
 * una segunda clasificación de lo mismo.
 *
 * @param {{conciliado?:Array}} resultado
 * @returns {{disponible:boolean, sinGasto:Array, sinRastro:Array, plata:number, total:number}}
 *   `disponible:false` cuando NO se pudo leer el registro del bot: eso no es "no hay descalces", y
 *   confundirlos haría que un Postgres caído se leyera como un archivo sano.
 */
export function descalces(resultado = {}) {
  const c = resultado?.conciliado
  if (!Array.isArray(c)) return { disponible: false, sinGasto: [], sinRastro: [], plata: 0, total: 0 }
  const sinGasto = c.filter((x) => SIN_GASTO.includes(x.estado))
  const sinRastro = c.filter((x) => SIN_RASTRO.includes(x.estado))
  const sinVeredicto = c.filter((x) => SIN_VEREDICTO.includes(x.estado))
  const plata = sinGasto.reduce((a, x) => a + Math.abs(Number(x.total) || 0), 0)
  return {
    disponible: true, sinGasto, sinRastro, sinVeredicto, plata,
    total: sinGasto.length + sinRastro.length,
  }
}

/**
 * El título con el que un descalce se reconoce entre corridas. PURA y ESTABLE.
 *
 * Lleva la CLAVE de idempotencia y no la fila: la fila es justamente lo que está en discusión, así que
 * usarla haría que el mismo descalce entrara de nuevo cada vez que se mueve. Con la clave, la segunda
 * corrida reconoce el de la primera y no duplica el aviso.
 */
export function tituloDescalce(d = {}) {
  const quien = `${d.proveedor ?? '?'} ${d.numero ?? ''}`.trim()
  return `Comprobante descalzado: ${quien} [${d.clave ?? 'sin clave'}]`
}

/** La evidencia, en una línea, con el número que hace que alguien lo mire. PURA. */
export function evidenciaDescalce(d = {}) {
  const quien = `${d.proveedor ?? '?'} ${d.numero ?? ''}`.trim()
  if (d.estado === 'no_esta') {
    return `El registro dice que ${quien} se cargó en la fila ${d.filaRegistrada} de Compras y ahí no está`
      + `${d.total != null ? ` (${pesos(d.total)})` : ''}. La clave de idempotencia bloquea volver a cargarlo`
      + ' y el gasto no está en ninguna fila: el costo de la obra queda sobrestimado por ese importe.'
  }
  if (d.estado === 'reserva_huerfana') {
    return `${quien}${d.total != null ? ` (${pesos(d.total)})` : ''} tiene la clave RESERVADA y ninguna fila:`
      + ' la escritura no llegó a ocurrir. No está en Compras y no se puede volver a mandar.'
  }
  if (d.estado === 'no_verificable') {
    return `${quien} no se pudo cruzar contra Compras: la lectura no trajo los importes, y sin ellos`
      + ' la única huella que empareja a este comprobante no se puede construir. No es un faltante.'
  }
  if (d.estado === 'fila_movida') {
    return `${quien} está en la fila ${d.filaReal} de Compras, pero el registro dice la ${d.filaRegistrada},`
      + ' que tiene otro comprobante. El gasto está bien; lo que miente es el rastro.'
  }
  return `${quien} SÍ está en Compras (fila ${d.filaReal}) pero el registro se quedó sin anotar dónde.`
}

/** Qué hacer con él, en las palabras de quien lo va a arreglar. PURA. */
export function recomendacionDescalce(d = {}) {
  if (SIN_VEREDICTO.includes(d.estado)) {
    return 'Nada: volver a correr la vigilancia cuando la pestaña haya terminado de recalcular.'
  }
  if (SIN_GASTO.includes(d.estado)) {
    return 'Verificar el comprobante en papel/ARCA. Si el gasto es real: soltar la reserva de esa clave'
      + ' (`comunicacion.comprobantes_cargados`) y volver a cargarlo. Si no lo es: borrar la fila del registro.'
      + ' Ninguna de las dos la hace un script: Compras la carga el dueño.'
  }
  return `Corregir la fila del registro (decía ${d.filaRegistrada ?? 'nada'}, es ${d.filaReal}).`
    + ' El gasto está bien cargado: esto no cambia un peso, cambia a dónde apunta la trazabilidad.'
}

/**
 * EL AVISO, para el mensaje que el dueño ya está leyendo. PURA. Vacío cuando no hay nada que decir.
 *
 * Corto a propósito: va pegado al «✔ Cargué 8 comprobantes» de la tanda y compite con él por la
 * atención. El detalle vive en `backlog_autonomo`, que es donde se puede consultar sin depender de que
 * alguien haya leído un mensaje de hace tres días.
 *
 * @param {{sinGasto:Array, sinRastro:Array, plata:number}} d  lo que devuelve `descalces`
 * @param {{nuevos?:number|null}} [o]  cuántos no se habían avisado nunca; null = no se pudo saber
 */
export function avisoDescalces(d = {}, { nuevos = null } = {}) {
  const sinGasto = d.sinGasto ?? []
  const sinRastro = d.sinRastro ?? []
  const sinVeredicto = d.sinVeredicto ?? []
  if (!sinGasto.length && !sinRastro.length && !sinVeredicto.length) return null
  const l = []
  // LO QUE NO SE PUDO VERIFICAR SE DICE, Y SE DICE COMO LO QUE ES. No es una acusación —no dice que
  // falte plata— pero tampoco se calla: callarlo sería afirmar que el control corrió y dio limpio.
  if (sinVeredicto.length) {
    l.push(`ℹ No pude verificar ${sinVeredicto.length} comprobante(s) contra Compras: la pestaña no`
      + ' devolvió los importes en esta lectura (suele pasar justo después de una carga, mientras'
      + ' recalcula). No afirmo que falten: vuelvo a mirarlos en la próxima corrida.')
  }
  if (sinGasto.length) {
    l.push(`⛔ **${sinGasto.length} comprobante(s) figuran cargados y NO están en Compras** (${pesos(d.plata)}).`
      + ' La clave bloquea recargarlos y el gasto no está: el costo de esas obras está sobrestimado.')
    for (const x of sinGasto.slice(0, 5)) {
      l.push(`· ${x.proveedor ?? '?'} ${x.numero ?? ''} — registro: fila ${x.filaRegistrada ?? '(sin fila)'}`)
    }
    if (sinGasto.length > 5) l.push(`· … y ${sinGasto.length - 5} más.`)
  }
  if (sinRastro.length) {
    l.push(`⚠ ${sinRastro.length} fila(s) del registro apuntan a otra fila de Compras. El gasto está; el rastro no.`)
  }
  if (nuevos === 0) l.push('_Ya estaban anotados en el backlog: no hay ninguno nuevo._')
  else if (nuevos != null) l.push(`_${nuevos} anotado(s) en el backlog del OS para poder consultarlos._`)
  return l.join('\n')
}

// ── EL BORDE: DONDE QUEDA CONSULTABLE ────────────────────────────────────────
//
// Va a `public.backlog_autonomo`, que es la tabla donde este OS ya deja lo que detecta solo y de donde
// la vigilancia autónoma y el Director lo levantan para triagear. No se creó una tabla nueva a
// propósito: un hallazgo en su propia tabla es un hallazgo que sólo mira quien ya sabía que existe.
//
// La idempotencia es por TÍTULO + estado abierto, igual que `emergence.mjs`: correrlo diez veces en un
// día no produce diez ítems. Y si la tabla no está (o Postgres no contesta), NO se rompe la carga que
// lo disparó: se devuelve `anotados:null` y quien informa dice que no se pudo anotar.

/**
 * Anota los descalces en `public.backlog_autonomo`. Sólo agrega los que no estaban abiertos.
 *
 * @param {{query:Function}} port
 * @param {Array} lista  entradas de `conciliado` (las de `descalces`)
 * @returns {Promise<{anotados:number|null, yaEstaban:number, motivo?:string}>}
 */
export async function anotarDescalces(port, lista = []) {
  if (typeof port?.query !== 'function') return { anotados: null, yaEstaban: 0, motivo: 'sin acceso a la base' }
  let anotados = 0
  let yaEstaban = 0
  try {
    for (const d of lista) {
      const titulo = tituloDescalce(d)
      const { rows } = await port.query(
        `select id from public.backlog_autonomo
          where origen_tabla = 'comunicacion.comprobantes_cargados' and titulo = $1
            and estado in ('abierto','en_curso') limit 1`, [titulo])
      if (rows.length) { yaEstaban++; continue }
      await port.query(
        `insert into public.backlog_autonomo
           (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
            recomendacion, nivel_autonomia_permitido, estado, origen_tabla)
         values ('anomalia', $1, $2, $3, 'confirmado', $4, $5, 'bajo', $6, 'C', 'abierto',
                 'comunicacion.comprobantes_cargados')`,
        [
          titulo,
          evidenciaDescalce(d),
          'auditar-comprobantes-cargados (registro del bot vs. pestaña Compras, sólo lectura)',
          // El impacto lo decide si hay plata en juego, no el tamaño del importe: un gasto que no
          // existe rompe el costo de la obra valga lo que valga.
          SIN_GASTO.includes(d.estado) ? 'alta' : 'media',
          SIN_GASTO.includes(d.estado) ? 'alta' : 'media',
          recomendacionDescalce(d),
        ])
      anotados++
    }
    return { anotados, yaEstaban }
  } catch (e) {
    // Un descalce sin anotar sigue estando en el aviso: se degrada el REGISTRO, no la detección.
    return { anotados: null, yaEstaban, motivo: String(e?.message ?? e).slice(0, 160) }
  }
}

/**
 * LA CORRIDA COMPLETA: audita (sólo lectura), anota lo nuevo y devuelve el aviso.
 *
 * NUNCA LANZA. La dispara el cierre de una carga de comprobantes: que el auditor falle no puede tirar
 * abajo la carga que acaba de ocurrir ni el mensaje que la anuncia. Se degrada declarando el motivo.
 *
 * @param {{auditar:Function, port?:object, log?:object}} d  `auditar` inyectada (borde de Google)
 * @returns {Promise<{ok:boolean, aviso:string|null, resumen:object, motivo?:string}>}
 */
export async function vigilar({ auditar, port = null, log = null } = {}) {
  try {
    const resultado = await auditar()
    const d = descalces(resultado)
    if (!d.disponible) {
      return { ok: false, aviso: null, resumen: d, motivo: 'no se pudo leer el registro del bot: no afirmo que no haya descalces' }
    }
    const todos = [...d.sinGasto, ...d.sinRastro]
    const r = todos.length ? await anotarDescalces(port, todos) : { anotados: 0, yaEstaban: 0 }
    return { ok: true, aviso: avisoDescalces(d, { nuevos: r.anotados }), resumen: { ...d, ...r } }
  } catch (e) {
    log?.warn?.('comprobantes: la vigilancia no pudo correr', { detalle: String(e?.message ?? e).slice(0, 200) })
    return { ok: false, aviso: null, resumen: { disponible: false }, motivo: String(e?.message ?? e).slice(0, 200) }
  }
}
