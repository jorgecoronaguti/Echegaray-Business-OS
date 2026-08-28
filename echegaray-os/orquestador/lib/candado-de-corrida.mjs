// UNA CORRIDA DE TESTS POR MÁQUINA — el núcleo puro que decide si se puede arrancar.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// `npm run orq:test` es LA EVIDENCIA DE CIERRE de este repo. El 28/08 falló tres veces en un día con
// `deadlock detected` (Postgres 40P01) sobre `escritura-economica.pg.test.mjs`, y las tres veces el
// archivo pasaba solo. La causa nunca estuvo en el test: había **cinco corridas simultáneas** en la
// VM —los agentes en sus worktrees, el hook de cierre, y la conversación principal— y todas atacan
// LA MISMA base. Dos transacciones de dos corridas distintas toman locks en orden inverso sobre las
// mismas tablas calientes y una recibe el deadlock.
//
// Ya existía una mitigación: `pg_advisory_xact_lock` serializa seis tests ENTRE SÍ dentro de una
// corrida (commit 6eb8736e). No puede cubrir este caso por construcción — el otro proceso no toma
// ese lock porque es otra corrida.
//
// El costo real no es el minuto perdido: es que **un `orq:test` en rojo deja de ser señal de nada**.
// Un repo cuyo criterio de cierre es "la suite en verde" no puede tener una suite que se pone roja
// por motivos ajenos al código. Eso entrena a ignorar el rojo, que es exactamente lo que no puede
// pasar acá.
//
// ═══ LO QUE ESTE CANDADO NO PUEDE HACER ═══
//
// Un candado que no se suelta es peor que el problema que arregla: una corrida que muere de un
// `kill -9` dejaría la máquina trabada para siempre. Por eso el candado guarda el PID y se considera
// HUÉRFANO cuando ese proceso ya no vive. Esa es la regla que el test negativo tiene que ejercer.
//
// No cubre dos máquinas distintas contra la misma base remota: para eso haría falta un lock en la
// propia base. Queda declarado, no resuelto.

/** Cuánto puede vivir un candado sin que su proceso dé señales antes de considerarlo perdido. */
export const EDAD_MAXIMA_MS = 60 * 60 * 1000

/**
 * NÚCLEO PURO: qué hay que hacer frente al contenido de un candado.
 *
 * @param {string|null} contenido lo que dice el archivo, o null si no existe
 * @param {{vivo:(pid:number)=>boolean, ahora?:number}} entorno
 * @returns {{estado:'libre'|'tomado'|'huerfano', pid:number|null, desde:number|null, porQue:string}}
 */
export function estadoDelCandado(contenido, { vivo, ahora = Date.now() } = {}) {
  if (typeof vivo !== 'function') throw new TypeError('estadoDelCandado necesita saber si un PID vive')
  if (contenido == null || String(contenido).trim() === '') {
    return { estado: 'libre', pid: null, desde: null, porQue: 'no hay candado' }
  }
  let dato = null
  try { dato = JSON.parse(String(contenido)) } catch { dato = null }
  // Un candado ilegible NO se respeta: si no puedo saber quién lo tiene, tenerlo en cuenta sólo
  // sirve para trabar la máquina. Es basura, no una afirmación.
  if (!dato || !Number.isInteger(dato.pid) || dato.pid <= 0) {
    return { estado: 'huerfano', pid: null, desde: null, porQue: 'el candado no dice quién lo tiene' }
  }
  const desde = Number.isFinite(dato.desde) ? dato.desde : null
  if (!vivo(dato.pid)) {
    return { estado: 'huerfano', pid: dato.pid, desde, porQue: `el proceso ${dato.pid} ya no existe` }
  }
  if (desde != null && ahora - desde > EDAD_MAXIMA_MS) {
    return { estado: 'huerfano', pid: dato.pid, desde, porQue: `el candado del ${dato.pid} lleva más de una hora` }
  }
  return { estado: 'tomado', pid: dato.pid, desde, porQue: `la corrida ${dato.pid} está en curso` }
}

/** Lo que se escribe adentro del candado. Un objeto, no un número suelto: el PID solo no se explica. */
export function contenidoDelCandado({ pid, ahora = Date.now(), quien = null } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) throw new TypeError('un candado sin PID no se puede soltar')
  return JSON.stringify({ pid, desde: ahora, quien })
}

/** El aviso que ve quien tiene que esperar. Sin esto, la espera se ve como un cuelgue. */
export function avisoDeEspera({ pid, desde, ahora = Date.now() }) {
  // `desde ? …` daba null para un timestamp de 0, que es un momento legítimo. Es el mismo tropiezo
  // que `Number(null) === 0`: en JavaScript un valor válido puede ser falso. Lo encontró el test.
  const seg = Number.isFinite(desde) ? Math.max(0, Math.round((ahora - desde) / 1000)) : null
  const hace = seg == null ? '' : ` (arrancó hace ${seg} s)`
  return `⏳ hay otra corrida de tests en esta máquina — PID ${pid}${hace}. Espero a que termine: `
    + 'dos suites contra la misma base se traban entre sí y el rojo que sale no es de nadie.'
}
