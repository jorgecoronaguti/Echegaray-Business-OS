// LA OBRA QUE EL JEFE ESTÁ MIRANDO, RECORDADA ENTRE PANTALLAS (dueño, 24/09/2026).
//
// Lógica pura: la usan el middleware (que la guarda) y `contextoDeObra` (que la lee). Sin imports de
// Next ni de Supabase para que `node --test` la pruebe y el runtime del middleware la cargue.
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
