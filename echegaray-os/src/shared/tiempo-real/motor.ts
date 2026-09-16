// EL MOTOR DEL TIEMPO REAL — lo que conecta avisos, foco, pestaña y reconexión con `planDeRefresco`.
//
// No toca el DOM ni Supabase: todo lo del mundo entra por `Dependencias` (reloj, azar, temporizador,
// «¿se está editando?», «refrescá»). Así el cableado —que un aviso diferido se atienda al salir del
// foco, que una reconexión refresque una vez— se prueba con un reloj falso, y el proveedor de React
// queda en pegar eventos del navegador.
//
// UNO POR PESTAÑA. Si cada `<RefrescarEnVivo>` tuviera su propio motor, una página con dos (el
// listado y el panel) haría dos `router.refresh()` por aviso. Acá las tablas de todos se juntan y el
// refresco es uno solo.

import {
  CONFIG_DE_REFRESCO, ESTADO_INICIAL, decidir, registrarAviso, tablaQueImporta, trasRefrescar,
  type ConfigDeRefresco, type Entorno, type EstadoDeRefresco,
} from './planDeRefresco.ts'

export interface Dependencias {
  refrescar: () => void
  ahora: () => number
  /** Entre 0 y 1, como `Math.random`. */
  azar: () => number
  entorno: () => Entorno
  programar: (fn: () => void, ms: number) => unknown
  cancelar: (id: unknown) => void
  cfg?: ConfigDeRefresco
}

export interface MotorDeTiempoReal {
  /** Declara tablas de las que depende lo que está en pantalla. Devuelve cómo dejar de declararlas. */
  registrar: (tablas: readonly string[]) => () => void
  alAviso: (payload: unknown) => void
  /** `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` — lo que informa `channel.subscribe()`. */
  alEstadoDelCanal: (estado: string) => void
  /** Salió el foco de un campo, volvió la pestaña: si había algo diferido, es el momento. */
  alPoderRefrescar: () => void
  /** La pestaña volvió a verse después de estar oculta `msOculta`. */
  alVolverAVerse: (msOculta: number) => void
  /** Latido periódico con la pestaña visible: sólo hace algo si el canal está caído. */
  alLatido: () => void
  detener: () => void
}

/** Con alguien editando no se refresca, pero tampoco se espera un evento que quizá no llegue (un menú
 *  que se cierra sin `focusout`): se vuelve a mirar cada tanto. Un temporizador, ninguna consulta. */
export const REVISAR_DIFERIDO_MS = 2000

// ═══ LA RED DE SEGURIDAD: EL AVISO PERDIDO (16/09/2026) ═══
//
// Dueño: «no se están actualizando lo que marco en el celular con lo que veo en la computadora». El
// aviso llega en menos de un segundo a un canal vivo (medido), pero un teléfono con la pantalla
// apagada o una notebook que se durmió congelan el socket SIN que el canal informe la caída a tiempo:
// lo que se escribió en ese intervalo no llega nunca. Dos redes, las dos baratas:
//   · VOLVER A VERSE tras una ausencia larga refresca una vez, haya llegado aviso o no.
//   · CON EL CANAL CAÍDO, un latido refresca cada tanto hasta que vuelva: sin canal, no hay otra
//     forma de enterarse. Con el canal vivo el latido no hace nada — ninguna consulta de más.
export const AUSENCIA_QUE_REFRESCA_MS = 30_000
export const LATIDO_SIN_CANAL_MS = 30_000

export function crearMotor(dep: Dependencias): MotorDeTiempoReal {
  const cfg = dep.cfg ?? CONFIG_DE_REFRESCO
  const registros = new Map<number, ReadonlySet<string>>()
  let proximoId = 0
  let estado: EstadoDeRefresco = ESTADO_INICIAL
  let reloj: unknown = null
  let canalCaido = false
  let rechazado = false
  let detenido = false

  const cancelarReloj = () => {
    if (reloj != null) dep.cancelar(reloj)
    reloj = null
  }

  const evaluar = () => {
    if (detenido) return
    cancelarReloj()
    const d = decidir(estado, dep.ahora(), dep.entorno(), cfg)
    if (d.tipo === 'refrescar') {
      estado = trasRefrescar(estado, dep.ahora())
      dep.refrescar()
    } else if (d.tipo === 'esperar') {
      reloj = dep.programar(evaluar, d.ms)
    } else if (d.tipo === 'diferir') {
      reloj = dep.programar(evaluar, REVISAR_DIFERIDO_MS)
    }
  }

  const anotar = () => {
    estado = registrarAviso(estado, dep.ahora(), dep.azar() * cfg.desfaseMaximoMs)
    evaluar()
  }

  return {
    registrar(tablas) {
      const id = proximoId++
      registros.set(id, new Set(tablas))
      return () => { registros.delete(id) }
    },
    alAviso(payload) {
      for (const tablas of registros.values()) {
        if (tablaQueImporta(payload, tablas)) { anotar(); return }
      }
    },
    alEstadoDelCanal(e) {
      if (e === 'RECHAZADO') rechazado = true
      if (e !== 'SUBSCRIBED') { canalCaido = true; return }
      rechazado = false
      // LA PRIMERA SUSCRIPCIÓN NO REFRESCA: la página se acaba de leer. Una RE-suscripción sí, una vez:
      // mientras el canal estuvo caído pudo cambiar cualquier cosa y ningún aviso llegó.
      if (!canalCaido) return
      canalCaido = false
      if (registros.size > 0) anotar()
    },
    alPoderRefrescar: evaluar,
    alVolverAVerse(msOculta) {
      if (msOculta >= AUSENCIA_QUE_REFRESCA_MS && registros.size > 0) anotar()
      else evaluar()
    },
    alLatido() {
      if (canalCaido && !rechazado && registros.size > 0) anotar()
    },
    detener() {
      detenido = true
      cancelarReloj()
    },
  }
}
