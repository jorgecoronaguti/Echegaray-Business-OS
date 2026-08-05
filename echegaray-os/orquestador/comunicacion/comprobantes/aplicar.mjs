// APLICAR UNA ELECCIÓN Y CONFIRMAR — UNA sola fuente para los dos caminos que llegan acá.
//
// A la misma decisión ("la obra es MESSINA") se llega de dos formas: apretando el botón
// (`accion.mjs`, callback HTTP de Mattermost) o escribiéndola en el hilo
// (`especialistas/comprobantes.mjs`, el mensaje que antes no reclamaba nadie). Lo que cambia entre
// las dos es la FORMA DE LA RESPUESTA —un `ephemeral_text` contra un post en el canal—; lo que NO
// puede cambiar es qué se acepta, qué se guarda y cuándo se da por cargado.
//
// Por eso esa parte vive acá y las dos la llaman. Duplicarla habría hecho que corregir un criterio en
// un lado lo dejara viejo en el otro, que es la forma en que este repo ya se rompió antes.
//
// NO SABE PUBLICAR NI CONTESTAR HTTP. Devuelve el fajo y los hechos; el mensaje lo arma cada camino.

import { ESTADO, estaCompleto, aplicarOpcion, imputacionPendiente } from '../../lib/comprobantes/fajo.mjs'
import { escribirFajo } from './escritura.mjs'
import * as repoReal from './repositorio.mjs'

export const RESULTADO = Object.freeze({
  SIN_FAJO: 'sin_fajo',
  CERRADO: 'cerrado',
  INVALIDA: 'opcion_invalida',
  APLICADA: 'aplicada',
})

/**
 * Aplica un valor a uno o varios ítems del fajo y lo guarda.
 *
 * @param {object} d  {port, repo?, log?}
 * @param {object} p  {fajoId, indices:number[], campo, valor}
 * @returns {Promise<{que:string, fajo?:object, listo?:boolean, aplicados?:number[]}>}
 *   `listo` = no queda nada que preguntar y hay algo cargable. Es la MISMA condición que usa la carga
 *   automática del post: contestar lo último que faltaba es confirmar, y no se pide un click más.
 */
export async function aplicarEleccion(d, { fajoId, indices = [], campo, valor } = {}) {
  const { port, repo = repoReal, log = null } = d
  const fajo = await repo.fajoPorId(port, fajoId)
  if (!fajo) return { que: RESULTADO.SIN_FAJO }
  if (fajo.estado !== ESTADO.ABIERTO) return { que: RESULTADO.CERRADO, fajo }

  const items = [...(fajo.items ?? [])]
  const aplicados = []
  for (const i of indices) {
    const item = items[i]
    if (!item) continue
    // `aplicarOpcion` es el ÚNICO que decide si el valor vale para ese ítem, contra las opciones que
    // ese ítem ofreció. Acá no se revalida nada: dos criterios para lo mismo son un criterio que se
    // queda viejo.
    const nuevo = aplicarOpcion(item, { campo, valor })
    if (!nuevo) continue
    items[i] = nuevo
    aplicados.push(i)
  }
  // Ni un solo ítem lo aceptó: un valor que ya no corresponde, o un segundo click sobre un botón que
  // dejó de ofrecerse. En los dos casos no se toca nada — es el mismo idempotente que el duplicado.
  if (!aplicados.length) return { que: RESULTADO.INVALIDA, fajo }

  const guardado = await repo.guardarItems(port, { id: fajo.id, items })
  if (!guardado) return { que: RESULTADO.CERRADO, fajo }
  log?.info?.('comprobantes: imputación elegida', { fajo: fajo.id, indices: aplicados, campo })

  const vivos = guardado.items ?? []
  const listo = vivos.length && vivos.every((it) => !imputacionPendiente(it).length) && vivos.some(estaCompleto)
  return { que: RESULTADO.APLICADA, fajo: guardado, listo: Boolean(listo), aplicados }
}

/**
 * Confirma y escribe en Compras. COMPARE-AND-SET: dos clicks, o un click y un mensaje escrito casi
 * al mismo tiempo, cargan UNA vez. El que pierde no escribe nada y se entera por `que`.
 *
 * @returns {Promise<{que:string, fajo?:object, texto?:string, estado?:string}>}
 */
export async function confirmarFajo(d, { fajoId } = {}) {
  const { port, repo = repoReal, escribir = escribirFajo, log = null, alEmpezar = null } = d
  const fajo = await repo.tomarParaConfirmar(port, { id: fajoId })
  if (!fajo) {
    const actual = await repo.fajoPorId(port, fajoId)
    if (!actual) return { que: RESULTADO.SIN_FAJO }
    return { que: actual.estado === ESTADO.CONFIRMADO ? 'ya_en_curso' : RESULTADO.CERRADO, fajo: actual }
  }
  // El "⏳ cargando" va ANTES de arrancar: la escritura tarda y el silencio de un bot se lee como un
  // bot colgado. Que falle ese refresco no puede tumbar la carga, por eso el que lo hace lo decide
  // cada camino y acá sólo se lo invita.
  if (typeof alEmpezar === 'function') await alEmpezar(fajo).catch?.(() => {})
  const r = await escribir({ port, repo, log }, fajo)
  return { que: 'cargado', fajo, texto: r?.texto, estado: r?.estado }
}
