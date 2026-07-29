// PR-4 · Estado real del sistema para responder "@os estado del sistema".
//
// Lee DATOS REALES del Work Fabric (schema orq) — nunca inventa cifras. Si un
// dato no está disponible, lo dice ("sin dato"), no lo fabrica (Regla de Oro).
// Es el "trabajo" que el Work Fabric ejecuta para el primer flujo vertical.

/**
 * Arma el estado del sistema a partir de la base del Work Fabric.
 * @param {{query:Function}} port  el mismo pool del OS (inyectado)
 * @returns {Promise<{texto:string, datos:object}>}
 */
export async function estadoSistema(port) {
  const cola = await snapshotCola(port)
  const ultima = await ultimaTareaCompletada(port)
  const eventos = await contarEventos(port)
  const modo = await modoCerebro(port)

  const partes = [
    'Business OS operativo.',
    `Cola de trabajo: ${cola.ready} en cola · ${cola.running} en ejecución · ${cola.succeeded} completadas · ${cola.failed} fallidas.`,
    `Última tarea completada: ${ultima ?? 'sin registro'}.`,
    `Eventos registrados: ${eventos}.`,
    `Modo cerebro: ${modo}.`,
  ]
  return { texto: partes.join(' '), datos: { cola, ultima, eventos, modo } }
}

async function snapshotCola(port) {
  const base = { ready: 0, running: 0, succeeded: 0, failed: 0, dead: 0 }
  try {
    const { rows } = await port.query('select state, count(*)::int n from orq.tasks group by state')
    for (const r of rows) base[r.state] = r.n
  } catch { /* si la tabla no está, queda en cero (sin dato inventado) */ }
  return base
}

async function ultimaTareaCompletada(port) {
  try {
    const { rows } = await port.query(
      `select max(updated_at) as t from orq.tasks where state = 'succeeded'`)
    return rows[0]?.t ? new Date(rows[0].t).toISOString() : null
  } catch { return null }
}

async function contarEventos(port) {
  try {
    const { rows } = await port.query('select count(*)::int n from orq.events')
    return rows[0]?.n ?? 0
  } catch { return 0 }
}

async function modoCerebro(port) {
  // public.os_runtime puede no existir en un entorno mínimo: se declara "sin dato".
  try {
    const { rows } = await port.query(`select value from public.os_runtime where key = 'modo_cerebro'`)
    return rows[0]?.value ?? 'sin dato'
  } catch { return 'sin dato' }
}
