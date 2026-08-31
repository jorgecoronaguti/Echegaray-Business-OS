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

import { ESTADO, estaCompleto, aplicarOpcion, imputacionPendiente, resolverDuplicado, indiceDuplicadoAbierto, resolverClase, indiceClaseAbierta } from '../../lib/comprobantes/fajo.mjs'
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
 * Contesta un PROBABLE duplicado y guarda el fajo. Misma fuente para el botón y para el texto.
 *
 * ═══ POR QUÉ EXISTE (25/08) ═══
 *
 * `contestarDuplicado` en `accion.mjs` hacía esto mismo, pero sólo lo alcanzaba un botón — y los
 * botones están apagados en producción. Cuando se cableó la respuesta escrita, copiar el cuerpo
 * habría dejado dos criterios para la misma decisión; el que se queda viejo es siempre el que menos
 * se usa, y acá lo que está en juego es cargar dos veces un gasto o no cargarlo nunca.
 *
 * @param {object} d {port, repo?, log?}
 * @param {object} p {fajoId, indice?, respuesta:'mismo'|'otro'}
 * @returns {Promise<{que:string, fajo?:object, listo?:boolean}>}
 *   `listo` = ya no queda nada que preguntar y hay algo cargable, igual que en `aplicarEleccion`.
 */
export async function contestarDuplicado(d, { fajoId, indice = -1, respuesta } = {}) {
  const { port, repo = repoReal, log = null } = d
  const fajo = await repo.fajoPorId(port, fajoId)
  if (!fajo) return { que: RESULTADO.SIN_FAJO }
  if (fajo.estado !== ESTADO.ABIERTO) return { que: RESULTADO.CERRADO, fajo }

  // Sin índice válido se contesta el PRIMERO abierto: es lo que la persona está mirando cuando
  // escribe «es otro». Con varios, se contesta de a uno y el mensaje vuelve a preguntar por el que
  // sigue — repreguntar es barato, resolver dos duplicados con una palabra no.
  const i = indice >= 0 ? indice : indiceDuplicadoAbierto(fajo.items ?? [])
  const items = resolverDuplicado(fajo.items ?? [], i, respuesta)
  // Ni el índice existe ni había nada abierto: o ya lo contestaron, o el mensaje quedó viejo. En los
  // dos casos no se toca nada — el mismo idempotente que el botón.
  if (!items) return { que: RESULTADO.INVALIDA, fajo }

  const guardado = await repo.guardarItems(port, { id: fajo.id, items })
  if (!guardado) return { que: RESULTADO.CERRADO, fajo }
  log?.info?.('comprobantes: duplicado contestado', { fajo: fajo.id, indice: i, respuesta })

  const vivos = guardado.items ?? []
  const listo = vivos.length && vivos.every((it) => !imputacionPendiente(it).length) && vivos.some(estaCompleto)
  return { que: RESULTADO.APLICADA, fajo: guardado, listo: Boolean(listo) }
}

/**
 * Contesta «sí, es una factura» y guarda el fajo. Mismo cuerpo que `contestarDuplicado` y por la
 * misma razón: la decisión tiene que ser una sola, la llame el botón o la llame el texto.
 *
 * Sólo resuelve hacia «es factura». Para lo otro está `descartalo`: una segunda forma de tirar un
 * gasto sería un atajo que este repo ya pagó.
 *
 * @param {object} d {port, repo?, log?}
 * @param {object} p {fajoId, indice?}
 */
export async function contestarClase(d, { fajoId, indice = -1 } = {}) {
  const { port, repo = repoReal, log = null } = d
  const fajo = await repo.fajoPorId(port, fajoId)
  if (!fajo) return { que: RESULTADO.SIN_FAJO }
  if (fajo.estado !== ESTADO.ABIERTO) return { que: RESULTADO.CERRADO, fajo }

  const i = indice >= 0 ? indice : indiceClaseAbierta(fajo.items ?? [])
  const items = resolverClase(fajo.items ?? [], i)
  if (!items) return { que: RESULTADO.INVALIDA, fajo }

  const guardado = await repo.guardarItems(port, { id: fajo.id, items })
  if (!guardado) return { que: RESULTADO.CERRADO, fajo }
  log?.info?.('comprobantes: clase del papel contestada', { fajo: fajo.id, indice: i })

  const vivos = guardado.items ?? []
  const listo = vivos.length && vivos.every((it) => !imputacionPendiente(it).length) && vivos.some(estaCompleto)
  return { que: RESULTADO.APLICADA, fajo: guardado, listo: Boolean(listo) }
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
