// ENTORNO DE LA WEB — ¿ESTE `next` ES DE DESARROLLO O DE PRODUCCIÓN? Y ENTONCES, ¿PUEDE HABLAR CON SUPABASE?
//
// ═══ EL DEFECTO QUE CIERRA (18/09/2026) ═══
//
// `NEXT_PUBLIC_SUPABASE_URL` apunta al proyecto de producción y `next dev` lo usa tal cual: cada agente que
// levantaba la app desde su worktree —doce a la vez el 18/09— pegaba a la base real, con Playwright encima.
// No existe hoy un Supabase (Auth + PostgREST) de desarrollo, así que la web no puede ir a otro lado; lo
// que SÍ puede es no ir a producción POR ACCIDENTE. Un `next dev`, o un `next` corriendo en un worktree,
// exige `ECHEGARAY_ENTORNO=produccion` explícito para crear un cliente; sin eso, falla con este mensaje.
// Vercel (`VERCEL=1`, NODE_ENV=production) pasa como siempre.
//
// La decisión es pura y tiene test; el único efecto vive en `exigirEntornoDeclarado()`.

export type Entorno = 'produccion' | 'desarrollo'

const RUTAS_DE_DESARROLLO = [
  /\/\.claude\/worktrees\//, /\/wt-[^/]+(\/|$)/, /\/worktrees\//, /^\/tmp\//, /\/echegaray-os-daily(\/|$)/,
]

export function clasificarEntornoWeb({ env, cwd = '' }: { env: Record<string, string | undefined>; cwd?: string }): { entorno: Entorno; motivo: string; declarado: boolean } {
  const decl = String(env.ECHEGARAY_ENTORNO ?? '').trim().toLowerCase()
  if (decl === 'produccion') return { entorno: 'produccion', motivo: 'declarado: ECHEGARAY_ENTORNO=produccion', declarado: true }
  if (decl === 'desarrollo') return { entorno: 'desarrollo', motivo: 'declarado: ECHEGARAY_ENTORNO=desarrollo', declarado: false }
  if (env.VERCEL === '1') return { entorno: 'produccion', motivo: 'despliegue en Vercel', declarado: false }
  if (env.NODE_ENV === 'development') return { entorno: 'desarrollo', motivo: 'next dev (NODE_ENV=development)', declarado: false }
  if (RUTAS_DE_DESARROLLO.some((re) => re.test(cwd))) return { entorno: 'desarrollo', motivo: `corre en un worktree (${cwd})`, declarado: false }
  return { entorno: 'produccion', motivo: 'sin señales de desarrollo', declarado: false }
}

export function decidirAccesoWeb(c: { entorno: Entorno; motivo: string; declarado: boolean }): { accion: 'pasa' | 'frena'; motivo: string } {
  if (c.entorno === 'produccion' || c.declarado) return { accion: 'pasa', motivo: c.motivo }
  return {
    accion: 'frena',
    motivo: `Esta app es de DESARROLLO (${c.motivo}) y NEXT_PUBLIC_SUPABASE_URL apunta al Supabase de producción. `
      + 'No se conecta por accidente: así se cayó la base el 12/09, el 13/09 y el 18/09. '
      + 'Si de verdad necesitás mirar producción desde acá, declaralo: ECHEGARAY_ENTORNO=produccion npm run dev '
      + '(queda a la vista; los datos siguen protegidos por RLS). Las pruebas de lógica van contra pg-reprod por el orquestador.',
  }
}

let memo: { accion: 'pasa' | 'frena'; motivo: string } | null = null

/** El único efecto: tira si este proceso no puede hablar con Supabase. Memoizado por proceso. */
export function exigirEntornoDeclarado(): void {
  if (!memo) {
    let cwd = ''
    try { cwd = typeof process.cwd === 'function' ? process.cwd() : '' } catch { cwd = '' }
    memo = decidirAccesoWeb(clasificarEntornoWeb({ env: process.env as Record<string, string | undefined>, cwd }))
  }
  if (memo.accion === 'frena') throw new Error(memo.motivo)
}
