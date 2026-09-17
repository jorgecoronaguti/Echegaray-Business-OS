// LA ESCALA DE ANALÍTICAS: `$ 12,35 M`, con dos decimales y siempre en millones.
//
// Una sola escala en todo el módulo porque las vistas se comparan entre sí: `$74M` al lado de
// `$8,4M` (lo que hace `plataCorta`) cambia la cantidad de decimales según el tamaño, y dos columnas
// que no tienen la misma precisión no se pueden leer una contra la otra. El número exacto está en el
// CRM; acá se decide dónde mirar.

/** `$ 12,35 M`. `null` devuelve `null`: la ausencia la nombra quien llama, con su palabra. */
export function millones(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const v = n / 1e6
  const s = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '−' : ''}$ ${s} M`
}

/** `62 %` sin decimales: un semáforo no decide nada en el decimal. */
export function pctEntero(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  return `${Math.round(n * 100).toLocaleString('es-AR')} %`
}

/** `+13 %` / `−8 %`: la diferencia con signo, siempre explícito. */
export function pctConSigno(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const r = Math.round(n * 100)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('es-AR')} %`
}

export const horasTexto = (n: number | null | undefined): string | null =>
  n == null ? null : `${Math.round(n).toLocaleString('es-AR')} h`

/** `$ 18.400 /h`: el costo de una hora en pesos enteros. */
export const porHora = (n: number | null | undefined): string | null =>
  n == null ? null : `$ ${Math.round(n).toLocaleString('es-AR')} /h`
