// LA OBRA QUE EL JEFE ESTÁ MIRANDO, RECORDADA ENTRE PANTALLAS (dueño, 24/09/2026).
//
// Lógica pura: la usan el middleware (que la guarda), `contextoDeObra` (que la lee en el servidor) y las
// barras del teléfono (que la leen en el navegador para que sus enlaces lleven la obra). Vive en
// `shared` porque la usan tres capas. Sin imports de Next ni de Supabase: `node --test` la prueba y el
// runtime del middleware la carga.
//
// ═══ POR QUÉ UNA COOKIE Y NO SÓLO LA URL ═══
//
// La obra viaja en `?obra=` y eso se conserva: un enlace compartido abre ESA obra. Pero la URL se
// pierde en cuanto el jefe toca algo que no la lleva —la barra dentro de Personal, el logo, la flecha
// de una pantalla de trabajo, «Mi obra» del menú—, y la pantalla caía a la primera obra del orden
// alfabético. Medido en producción el 24/09: elegía QP - SALÓN COMERCIAL, tocaba Asistencia y «Hoy»,
// y volvía a ME - ADICIONAL TERCER MURO, vacía («sin plantel · sin frentes»). La cookie es la memoria
// para cuando la URL no dice nada; la URL, cuando la trae, manda siempre.

export const COOKIE_OBRA = 'os_obra'

/** Noventa días: la obra de un jefe dura meses, y la asignación vigente la corrige si cambió. */
export const VIDA_OBRA_SEGUNDOS = 60 * 60 * 24 * 90

/**
 * El valor de `?obra=` o de la cookie, sólo si tiene forma de id de obra (`quattropani`,
 * `messina-playon-azufre`). Cualquier otra cosa es `null`: la cookie no guarda lo que alguien escribió
 * a mano en la URL, y un valor raro no llega a una consulta.
 */
export function obraDeCookieValida(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim()
  return /^[a-z0-9][a-z0-9-]{0,99}$/i.test(v) ? v : null
}

/**
 * Las asignaciones vigentes de una persona, la más reciente primero. `desde`/`hasta` son fechas
 * `YYYY-MM-DD` (o timestamps, se mira el día); `hoy` también. Misma regla que
 * `public.asignacion_vigente()`: desde nulo o ≤ hoy, hasta nulo o ≥ hoy.
 */
export function obrasAsignadasVigentes(
  filas: { obra_id: string | null; desde: string | null; hasta: string | null }[],
  hoy: string,
): string[] {
  const dia = (f: string | null) => (f ? f.slice(0, 10) : null)
  const vigentes = filas
    .filter((f) => !!f.obra_id)
    .filter((f) => (dia(f.desde) === null || dia(f.desde)! <= hoy) && (dia(f.hasta) === null || dia(f.hasta)! >= hoy))
    .sort((a, b) => (dia(b.desde) ?? '').localeCompare(dia(a.desde) ?? ''))
  return [...new Set(vigentes.map((f) => f.obra_id as string))]
}

/**
 * La obra recordada leída de `document.cookie` (la cookie NO es httpOnly a propósito: es un id de
 * obra, no una credencial, y las barras del navegador la necesitan para armar sus enlaces).
 */
export function leerObraRecordada(cookies: string | null | undefined): string | null {
  for (const par of (cookies ?? '').split(';')) {
    const i = par.indexOf('=')
    if (i === -1) continue
    if (par.slice(0, i).trim() !== COOKIE_OBRA) continue
    try {
      return obraDeCookieValida(decodeURIComponent(par.slice(i + 1)))
    } catch {
      return null
    }
  }
  return null
}

/**
 * ═══ UN ENLACE A LA OBRA DEL JEFE LLEVA LA OBRA (24/09/2026) ═══
 *
 * Next guarda en el navegador lo que dibujó cada URL durante 60 s (`staleTimes.dynamic`). Un enlace
 * PELADO a `/obra/hoy` reusaba lo dibujado para la obra anterior aunque la cookie ya dijera otra: el
 * jefe elegía QP, pasaba por Asistencia, tocaba «Hoy» y veía otra vez SF (medido en producción con
 * Juan Pablo Nievas). Con la obra en el enlace, la URL es distinta y no hay nada viejo que reusar.
 *
 * Sólo toca rutas `/obra/*` sin `obra=`; todo lo demás vuelve igual.
 */
export function conObraRecordada(href: string, obra: string | null | undefined): string {
  if (!obra) return href
  const [ruta, query = ''] = href.split('?')
  if (ruta !== '/obra' && !ruta.startsWith('/obra/')) return href
  const q = new URLSearchParams(query)
  if (q.has('obra')) return href
  q.set('obra', obra)
  return `${ruta}?${q.toString()}`
}
