// ═══ EL REGISTRO GENERAL DE LA APP (30/09/2026) ═══
//
// Quién fue a dónde, qué le contestó la app y qué se rompió, en `public.app_registro`. Lo escriben el
// middleware (cada navegación, acción, redirección y rechazo), `instrumentation.ts` (errores de
// servidor) y `/api/registro-error` (errores que ve el navegador). Lo lee
// `orquestador/scripts/control-de-fallas.mjs`.
//
// Por qué propio: Vercel no guarda la identidad y 5.000 líneas cubren ~4 minutos. El caso Maldonado
// (30/09) llevó una hora y quedó a medias.
//
// REGLAS: sin directiva y sin dependencias (corre en el middleware de Edge, en Node y en tests);
// `registrar` NUNCA tira ni demora a quien la llama más de TOPE_MS; los textos se recortan acá, en
// origen, porque la base ya se cayó por tamaño (13/09).

export type TipoRegistro = 'navegacion' | 'accion' | 'redireccion' | 'rechazo' | 'error_servidor' | 'error_cliente'

export type FilaRegistro = {
  tipo: TipoRegistro
  ruta: string
  perfil_id?: string | null
  rol?: string | null
  prestada?: boolean
  metodo?: string | null
  consulta?: string | null
  estado?: number | null
  destino?: string | null
  dispositivo?: 'telefono' | 'pc' | null
  despliegue?: string | null
  digest?: string | null
  mensaje?: string | null
  detalle?: Record<string, unknown> | null
}

export const TOPE_MS = 1500
const LARGO = { ruta: 500, consulta: 500, destino: 500, mensaje: 1000, detalle: 4000 }

const cortar = (s: string | null | undefined, n: number) => (s == null ? null : s.length > n ? s.slice(0, n) + '…' : s)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** La fila tal cual se inserta: recortada y sin campos de más. Pura, para poder probarla. */
export function normalizar(f: FilaRegistro): Record<string, unknown> {
  let detalle = f.detalle ?? null
  if (detalle) {
    const txt = JSON.stringify(detalle)
    if (txt.length > LARGO.detalle) detalle = { recortado: txt.slice(0, LARGO.detalle) }
  }
  return {
    tipo: f.tipo,
    ruta: cortar(f.ruta, LARGO.ruta) ?? '',
    perfil_id: f.perfil_id && UUID.test(f.perfil_id) ? f.perfil_id : null,
    rol: cortar(f.rol, 40),
    prestada: !!f.prestada,
    metodo: cortar(f.metodo, 10),
    consulta: cortar(f.consulta || null, LARGO.consulta),
    estado: Number.isInteger(f.estado) ? f.estado : null,
    destino: cortar(f.destino, LARGO.destino),
    dispositivo: f.dispositivo ?? null,
    despliegue: cortar(f.despliegue ?? despliegueActual(), 40),
    digest: cortar(f.digest, 100),
    mensaje: cortar(f.mensaje, LARGO.mensaje),
    detalle,
  }
}

export function despliegueActual(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return sha ? sha.slice(0, 8) : null
}

function claveDeServicio(): string | undefined {
  // Referencias ESTÁTICAS: en Edge sólo se garantizan las que el build ve escritas.
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
}

/**
 * Inserta una fila. Nunca tira: un registro que se cae no puede tirar la pantalla que registra.
 * Sin clave o sin URL (local, tests) no hace nada. Devuelve si la base aceptó, para los tests.
 */
export async function registrar(fila: FilaRegistro, dep: { fetch?: typeof fetch } = {}): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = claveDeServicio()
  if (!url || !clave) return false
  const cabeceras: Record<string, string> = {
    apikey: clave,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  }
  // La clave nueva (`sb_secret_…`) no es un JWT y no va como Bearer; la vieja sí.
  if (clave.startsWith('eyJ')) cabeceras.authorization = `Bearer ${clave}`
  try {
    const r = await (dep.fetch ?? fetch)(`${url}/rest/v1/app_registro`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify(normalizar(fila)),
      signal: AbortSignal.timeout(TOPE_MS),
      cache: 'no-store',
    })
    return r.ok
  } catch {
    return false
  }
}

/** Qué tipo de fila es una respuesta del middleware. */
export function clasificar(metodo: string, estado: number): TipoRegistro {
  if (estado >= 300 && estado < 400) return 'redireccion'
  if (estado === 401 || estado === 403) return 'rechazo'
  if (metodo !== 'GET' && metodo !== 'HEAD') return 'accion'
  return 'navegacion'
}

type Cabeceras = { get(nombre: string): string | null }

/**
 * Si el pedido merece fila. Fuera: prefetch (el navegador adelanta enlaces que nadie tocó: sería
 * ruido y volumen), estáticos, `/_next`, y el propio `/api/registro-error` (lo escribe él).
 */
export function debeRegistrar(pathname: string, metodo: string, h: Cabeceras): boolean {
  if (metodo === 'OPTIONS' || metodo === 'HEAD') return false
  if (pathname.startsWith('/_next/') || pathname === RUTA_REGISTRO_ERROR) return false
  if (/\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|map|txt|xml|woff2?|ttf|webmanifest)$/i.test(pathname)) return false
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) return false
  return true
}

export const RUTA_REGISTRO_ERROR = '/api/registro-error'

function base64UrlADecodificado(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(b + '='.repeat((4 - (b.length % 4)) % 4))
}

/**
 * El `sub` de la sesión de Supabase leído de las cookies, SIN verificar la firma. Sirve SÓLO para
 * anotar quién era en el registro (donde no hay un `getClaims()` a mano: `onRequestError`). Nunca
 * para decidir un permiso. La cookie es `sb-<ref>-auth-token`, a veces partida en `.0`, `.1`…, y su
 * valor puede venir como `base64-<json en base64url>`.
 */
export function uidDeCookies(cookie: string | null | undefined): string | null {
  if (!cookie) return null
  const partes = new Map<string, string>()
  for (const par of cookie.split(/;\s*/)) {
    const i = par.indexOf('=')
    if (i > 0) partes.set(par.slice(0, i), par.slice(i + 1))
  }
  const base = [...partes.keys()].find((k) => /^sb-[^-]+-auth-token(?:\.0)?$/.test(k))?.replace(/\.0$/, '')
  if (!base) return null
  let valor = partes.get(base) ?? ''
  if (!valor) for (let n = 0; partes.has(`${base}.${n}`); n++) valor += partes.get(`${base}.${n}`)
  try {
    valor = decodeURIComponent(valor)
    const json = valor.startsWith('base64-') ? base64UrlADecodificado(valor.slice(7)) : valor
    const token = (JSON.parse(json) as { access_token?: string }).access_token
    const carga = token?.split('.')[1]
    if (!carga) return null
    const sub = (JSON.parse(base64UrlADecodificado(carga)) as { sub?: string }).sub
    return sub && UUID.test(sub) ? sub : null
  } catch {
    return null
  }
}

/** Las primeras líneas de una pila, sin la ruta local del build: lo que sirve para ubicar, no más. */
export function pilaCorta(pila: string | null | undefined, lineas = 6): string | null {
  if (!pila) return null
  return pila.split('\n').slice(0, lineas).map((l) => l.trim()).join('\n').slice(0, 1500)
}
