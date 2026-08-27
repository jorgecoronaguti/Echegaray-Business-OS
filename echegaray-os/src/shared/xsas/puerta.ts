// DÓNDE ESTÁ LA PUERTA DE XSAS Y CON QUÉ SE ENTRA — resuelto en runtime, no en el build.
//
// ═══ POR QUÉ NO ALCANZAN DOS VARIABLES DE ENTORNO ═══
//
// La puerta de XSAS corre en la VM, detrás de un túnel saliente: el server no acepta tráfico
// entrante salvo SSH. La URL de ese túnel CAMBIA cada vez que el túnel se reinicia. Una variable de
// entorno en Vercel con la URL adentro queda vieja en el primer reinicio, y el síntoma es «XSAS dejó
// de contestar desde la app» sin que nada esté roto.
//
// Por eso el DÓNDE se lee de `os_runtime` (tabla pública: la URL sólo dice dónde está el OS, no
// autoriza nada) y el SECRETO de `os_secreto` (sólo `service_role`, sin una sola policy). Las dos
// las publica la VM: la primera el script del túnel en cada arranque, la segunda una sola vez.
//
// El frente estable de cara al mundo sigue siendo `https://app.ecsas.com.ar/api/xsas`, que no cambia
// nunca. Lo que rota es el tramo interno, y rota solo.
//
// Si algún día hay endpoint con nombre fijo, se ponen `XSAS_GATEWAY_URL`/`XSAS_GATEWAY_SECRET` en el
// entorno y ganan: el entorno tiene prioridad sobre el descubrimiento.
import { createAdminClient } from '@/lib/supabase/admin'
import { urlDePuerta } from './url'

export interface Puerta { url: string; secreto: string; via: 'entorno' | 'descubrimiento' }

/** Cuánto vale una resolución antes de volver a preguntar. El secreto no rota; la URL sí, cada vez
 *  que el túnel se reinicia — 30 s es el peor caso de respuestas 502 tras un reinicio, y evita dos
 *  consultas extra en cada mensaje del chat. */
const TTL_MS = 30_000

let cache: { puerta: Puerta; vence: number } | null = null

/** Tira la resolución cacheada. Se llama cuando el upstream no contestó: casi siempre significa que
 *  el túnel se reinició y la URL que teníamos ya no existe. */
export function olvidarPuerta(): void { cache = null }

export async function resolverPuerta(): Promise<Puerta | null> {
  const urlEnv = process.env.XSAS_GATEWAY_URL
  const secretoEnv = process.env.XSAS_GATEWAY_SECRET
  if (urlEnv && secretoEnv) return { url: urlEnv, secreto: secretoEnv, via: 'entorno' }

  if (cache && cache.vence > Date.now()) return cache.puerta

  try {
    const admin = createAdminClient()
    const [endpoint, secreto] = await Promise.all([
      admin.from('os_runtime').select('value').eq('key', 'xsas_endpoint').maybeSingle(),
      admin.from('os_secreto').select('valor').eq('clave', 'xsas_gateway_secret').maybeSingle(),
    ])
    const base = endpoint.data?.value
    const clave = secretoEnv ?? secreto.data?.valor
    if (!base || !clave) return null
    const puerta: Puerta = { url: urlDePuerta(base), secreto: clave, via: 'descubrimiento' }
    cache = { puerta, vence: Date.now() + TTL_MS }
    return puerta
  } catch {
    return null
  }
}
