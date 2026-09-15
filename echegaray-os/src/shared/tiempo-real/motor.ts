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
  detener: () => void
}

/** Con alguien editando no se refresca, pero tampoco se espera un evento que quizá no llegue (un menú
 *  que se cierra sin `focusout`): se vuelve a mirar cada tanto. Un temporizador, ninguna consulta. */
export const REVISAR_DIFERIDO_MS = 2000

export function crearMotor(dep: Dependencias): MotorDeTiempoReal {
  const cfg = dep.cfg ?? CONFIG_DE_REFRESCO
  const registros = new Map<number, ReadonlySet<string>>()
  let proximoId = 0
  let estado: EstadoDeRefresco = ESTADO_INICIAL
  let reloj: unknown = null
  let canalCaido = false
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
      if (e !== 'SUBSCRIBED') { canalCaido = true; return }
      // LA PRIMERA SUSCRIPCIÓN NO REFRESCA: la página se acaba de leer. Una RE-suscripción sí, una vez:
      // mientras el canal estuvo caído pudo cambiar cualquier cosa y ningún aviso llegó.
      if (!canalCaido) return
      canalCaido = false
      if (registros.size > 0) anotar()
    },
    alPoderRefrescar: evaluar,
    detener() {
      detenido = true
      cancelarReloj()
    },
  }
}
