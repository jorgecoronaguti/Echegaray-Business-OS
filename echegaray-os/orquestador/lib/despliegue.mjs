// QUÉ PUEDE LLEGAR A PRODUCCIÓN, Y QUÉ NO. Decisión pura, sin git y sin systemd.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// Hasta el 27/08/2026 las 31 unidades de systemd tenían `WorkingDirectory` apuntando al MISMO árbol
// donde trabajan el dueño y Claude Code. Eso significa, literalmente, que un archivo a medio editar
// —guardado y sin commitear— era lo que corría el worker 24×7 en el siguiente reinicio, y que un
// `git checkout` de una rama de trabajo cambiaba el código productivo sin que nadie desplegara nada.
// No es una hipótesis: el bot vivió 146 commits atrasado por la variante opuesta del mismo problema
// (corría de una copia congelada), y los arreglos no llegaban.
//
// La regla que se implementa acá es una sola: **a producción llega un commit que ya está en
// `origin/main`, o no llega nada.** Todo lo demás —el árbol limpio, el registro de lo desplegado, el
// rollback— existe para que esa regla sea verificable por un tercero y reversible.
//
// PURO: recibe hechos ya leídos (qué sha, si está en main, si el árbol está limpio) y devuelve la
// decisión. Los hechos los lee `scripts/desplegar.mjs`; acá no hay red, ni disco, ni procesos.

/** Los motivos por los que un despliegue no avanza. Son datos, no strings sueltos: el script los
 *  imprime y los tests los afirman. */
export const RECHAZO = Object.freeze({
  SIN_OBJETIVO: 'no se pudo resolver el commit objetivo',
  NO_ESTA_EN_MAIN: 'el commit objetivo no está en origin/main — a producción sólo llega código mergeado',
  ARBOL_SUCIO: 'el checkout productivo tiene cambios sin commitear — producción no se edita a mano',
  YA_DESPLEGADO: 'producción ya está en ese commit',
})

/**
 * ¿Avanza el despliegue?
 *
 * `arbolSucio` es la lista de archivos modificados en el checkout productivo (no en el de
 * desarrollo). Cualquier archivo ahí es una edición manual sobre producción: se rechaza y se
 * nombra, porque el modo de falla que importa es el silencioso.
 *
 * PURA.
 */
export function decidirDespliegue({ objetivo, desplegado, estaEnMain, sucios = [], forzar = false } = {}) {
  if (!objetivo) return { avanza: false, motivo: RECHAZO.SIN_OBJETIVO }
  if (!estaEnMain) return { avanza: false, motivo: RECHAZO.NO_ESTA_EN_MAIN, objetivo }
  if (sucios.length) return { avanza: false, motivo: RECHAZO.ARBOL_SUCIO, sucios }
  if (objetivo === desplegado && !forzar) return { avanza: false, motivo: RECHAZO.YA_DESPLEGADO, objetivo }
  return { avanza: true, objetivo, desde: desplegado ?? null, esRollback: Boolean(desplegado) && objetivo !== desplegado }
}

// ═══ QUÉ SE MUEVE A PRODUCCIÓN Y QUÉ SE QUEDA EN DESARROLLO ═══
//
// `echegaray-claude-remote` NO se mueve, y no es un olvido: es el control remoto de Claude Code, o
// sea la herramienta con la que se DESARROLLA el OS. Tiene que ver el árbol de desarrollo, sus ramas
// y sus worktrees; apuntarlo a producción sería pedirle que trabaje sobre el código desplegado, que
// es exactamente lo que este archivo existe para impedir.
export const UNIDADES_DE_DESARROLLO = Object.freeze(['echegaray-claude-remote.service'])

/** Los daemons que hay que reiniciar para que tomen el código nuevo. Los `oneshot` (los que dispara
 *  un timer) toman el código nuevo solos en su próximo tiro: reiniciarlos no agrega nada y los
 *  ejecuta fuera de horario. */
export const DAEMONS = Object.freeze([
  'echegaray-orq-worker.service',
  'echegaray-orq-interactive.service',
  'echegaray-comunicacion-worker.service',
  'echegaray-comunicacion-ws.service',
  'echegaray-xsas-gateway.service',
  'echegaray-asistencia-http.service',
  'echegaray-os-tunnel.service',
])

/** ¿Qué unidades hay que repuntar? Todas las que hoy miran al árbol de desarrollo, menos las que
 *  deben seguir mirándolo. PURA. */
export function unidadesARepuntar(unidades, { dirDesarrollo }) {
  return (unidades || [])
    .filter((u) => !UNIDADES_DE_DESARROLLO.includes(u.nombre))
    .filter((u) => String(u.texto ?? '').includes(dirDesarrollo))
    .map((u) => u.nombre)
}
