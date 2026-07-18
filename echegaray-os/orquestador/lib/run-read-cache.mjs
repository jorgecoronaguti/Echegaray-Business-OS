// Caché de LECTURAS por-corrida (F5). En una tarea de edición el modelo relee el mismo rango
// varias veces (el log mostró drive_read:7 en una sola corrida) → costo y 429 de la API de Sheets.
// Esto cachea las lecturas idempotentes DENTRO de una misma corrida y se INVALIDA ante cualquier
// escritura (el dato pudo cambiar). No cambia ninguna respuesta: la segunda lectura del mismo
// rango, sin escritura de por medio, es idéntica. Vive lo que dura una directiva, no es global.

// Tools de LECTURA idempotentes y repetibles (seguras de cachear dentro de una corrida). Cualquier
// tool de ESCRITURA la invalida desde afuera, así una lectura posterior a un cambio re-consulta.
const RE_READ_DEFAULT = /^(drive_read|drive_find|drive_list|drive_tabs|drive_desplegables|drive_last_row)$/

export function crearCacheLecturaPorCorrida(readTools = RE_READ_DEFAULT) {
  const cache = new Map()
  return {
    /** ¿Esta tool es una lectura cacheable? */
    cacheable: (name) => readTools.test(String(name)),
    /** Clave estable por tool + argumentos (mismo fileId+rango+pestaña ⇒ misma clave). */
    key: (name, input) => String(name) + ':' + JSON.stringify(input ?? {}),
    has: (k) => cache.has(k),
    get: (k) => cache.get(k),
    set: (k, v) => { cache.set(k, v) },
    /** Invalidar TODO tras una escritura (correctitud: el dato pudo cambiar). */
    invalidar: () => cache.clear(),
    get size() { return cache.size },
  }
}
