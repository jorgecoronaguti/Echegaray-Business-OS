// LA SONDA DEL FLUJO DE CAJA: una pregunta barata por minuto — ¿cambió el archivo? — y el sync sólo si sí.
//
// ═══ POR QUÉ UNA SONDA Y NO BAJAR EL TIMER DEL SYNC A UN MINUTO ═══
//
// `sync-compras` lee la pestaña Compras entera (~970 filas × 40 columnas) y reescribe tres tablas.
// Correrlo cada minuto son 1.440 lecturas completas por día para un archivo que se edita unas decenas
// de veces. Drive dice en una llamada de medio segundo si el archivo cambió (`version`, que sube con
// cualquier edición; `headRevisionId` no existe en un Sheet nativo — medido el 17/09/2026). Con eso la
// latencia objetivo del dueño (≤ 1 minuto) cuesta una lectura de metadatos por minuto y un sync por
// edición. Lo descartado también: Apps Script con `onEdit` (decisión del dueño, sin Apps Script) y las
// notificaciones push de Drive (`files.watch`), que exigen un endpoint HTTPS público y renovar el canal.
//
// ═══ LOS BUCLES QUE NO PUEDE HABER ═══
//
// Las escrituras del propio OS (el pipeline, la cola de Compras) también suben la versión. No hay bucle
// porque nada de lo que dispara la sonda escribe el Sheet: el sync y la lectura de notas sólo leen.
// Lo que sí puede pasar es encimarse con un sync que ya está corriendo; entonces NO se relanza y la
// versión NO se da por atendida, así la vuelta siguiente vuelve a mirar.
//
// ═══ UNA VERSIÓN QUE FALLA NO SE REINTENTA PARA SIEMPRE ═══
//
// Si el sync falla (el centinela de filas, una cuota de Google), la versión queda sin atender y se
// reintenta al minuto. A las `MAX_FALLOS` se da por atendida y se dice: el timer de diez minutos del
// sync sigue siendo la red de seguridad, y martillar el archivo cada minuto no la reemplaza.
//
// Núcleo puro + un orquestador con todo inyectado: se prueba sin Google, sin systemd y sin Postgres.

export const MAX_FALLOS = 3

/** La marca de cambio del archivo. Sin ninguna de las dos no se decide a ciegas. */
export function marcaDe(meta) {
  const m = meta?.version ?? meta?.modifiedTime
  if (m === undefined || m === null || String(m) === '') throw new Error('Drive no devolvió version ni modifiedTime: no decido a ciegas')
  return String(m)
}

/**
 * ¿SINCRONIZAR O NO?
 * @param {{marca:string, estado:{marca?:string, fallos?:number}|null, syncCorriendo:boolean, pipelineCorriendo?:boolean}} o
 * @returns {{accion:'nada'|'esperar'|'sincronizar', motivo:string}}
 */
export function decidirSonda({ marca, estado, syncCorriendo, pipelineCorriendo = false }) {
  if (estado?.marca === marca) return { accion: 'nada', motivo: `versión ${marca} ya atendida` }
  if (syncCorriendo) return { accion: 'esperar', motivo: `versión ${marca} nueva, pero hay un sync corriendo: no lo relanzo` }
  // EL PIPELINE REESCRIBE PESTAÑAS DURANTE MINUTOS y cada escritura sube la versión: sincronizar ahí
  // sería un sync de Compras por minuto sobre un archivo a medio escribir. Se espera a que termine; la
  // versión queda sin atender y la primera vuelta después lo hace una sola vez.
  if (pipelineCorriendo) return { accion: 'esperar', motivo: `versión ${marca} nueva, pero el pipeline del Flujo de Caja está escribiendo: espero a que termine` }
  return { accion: 'sincronizar', motivo: estado?.marca ? `versión ${estado.marca} → ${marca}` : `primera lectura (versión ${marca})` }
}

/** El estado que queda después de intentar. Sólo un éxito —o el tope de fallos— atiende la versión. */
export function estadoTras({ estado, marca, ok, notas }) {
  const base = { notas: notas === undefined ? estado?.notas ?? null : notas }
  if (ok) return { ...base, marca, fallos: 0 }
  const fallos = (estado?.marcaFallida === marca ? estado.fallos ?? 0 : 0) + 1
  if (fallos >= MAX_FALLOS) return { ...base, marca, fallos: 0, abandonada: marca }
  return { ...base, marca: estado?.marca ?? null, marcaFallida: marca, fallos }
}

/**
 * UNA VUELTA DE LA SONDA.
 *
 * @param {object} d  dependencias
 * @param {() => Promise<object>} d.leerVersion       metadatos de Drive del Flujo de Caja
 * @param {() => Promise<object|null>} d.leerEstado
 * @param {(e:object) => Promise<void>} d.guardarEstado
 * @param {() => Promise<boolean>} d.syncCorriendo
 * @param {() => Promise<void>} d.sincronizarCompras  tira si falla
 * @param {(anterior:any) => Promise<{notas:any, linea:string}>} d.sincronizarNotas  tira si falla
 * @param {(s:string) => void} [d.log]
 */
export async function vueltaDeSonda(d) {
  const log = d.log ?? (() => {})
  const marca = marcaDe(await d.leerVersion())
  const estado = await d.leerEstado()
  const pipelineCorriendo = d.pipelineCorriendo ? await d.pipelineCorriendo() : false
  const decision = decidirSonda({ marca, estado, syncCorriendo: await d.syncCorriendo(), pipelineCorriendo })
  log(`sonda: ${decision.accion} — ${decision.motivo}`)
  if (decision.accion !== 'sincronizar') return decision
  let ok = true
  let notas
  try {
    await d.sincronizarCompras()
    const r = await d.sincronizarNotas(estado?.notas ?? null)
    log(r.linea)
    // UNA LECTURA SALTEADA NO ATIENDE LA VERSIÓN (auditoría 17/09): si el pipeline arrancó en el medio,
    // las ediciones del dueño de esta versión todavía no se leyeron. No cuenta como fallo ni toca el estado.
    if (r.omitida) return { ...decision, ok: false, omitida: true }
    notas = r.notas
  } catch (e) {
    ok = false
    log(`sonda: falló (${e.message}) — la versión ${marca} queda sin atender`)
  }
  const siguiente = estadoTras({ estado, marca, ok, notas })
  if (siguiente.abandonada) log(`sonda: ${MAX_FALLOS} fallos seguidos con la versión ${marca}: la doy por atendida; queda el timer de 10 min del sync`)
  await d.guardarEstado(siguiente)
  return { ...decision, ok }
}
