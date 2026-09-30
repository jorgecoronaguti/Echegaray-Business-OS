import { pilaCorta, registrar, uidDeCookies } from '@/shared/registro/registroApp'
import { pareceTelefono } from '@/shared/utils/dispositivo'

// ═══ TODO ERROR DE SERVIDOR QUEDA EN `app_registro` (30/09/2026) ═══
//
// Next llama a `onRequestError` con el error REAL (el mensaje que al navegador le llega sólo como
// «digest»), la ruta y el tipo de render. Antes sólo quedaba en los logs de Vercel, sin identidad y por
// minutos: el #441 de Maldonado se reconstruyó desde el digest a mano. Ahora el digest que muestra la
// pantalla de error se busca en la tabla y trae quién, dónde, qué deploy y el mensaje.

export function register() {}

type PedidoConError = { path: string; method: string; headers: Record<string, string | string[] | undefined> }
type Contexto = { routerKind: string; routePath: string; routeType: string; renderSource?: string }

export async function onRequestError(error: unknown, request: PedidoConError, context: Contexto) {
  try {
    const e = error as { message?: string; digest?: string; stack?: string; name?: string }
    const cab = (n: string) => {
      const v = request.headers[n]
      return Array.isArray(v) ? v.join('; ') : (v ?? null)
    }
    const q = request.path.indexOf('?')
    const ruta = q < 0 ? request.path : request.path.slice(0, q)
    const consulta = q < 0 ? '' : request.path.slice(q + 1)
    const cookie = cab('cookie')
    await registrar({
      tipo: 'error_servidor',
      ruta,
      consulta: consulta ? `?${consulta}` : null,
      perfil_id: uidDeCookies(cookie),
      prestada: /(?:^|;\s*)os_entrar_como=/.test(cookie ?? ''),
      metodo: request.method,
      estado: 500,
      dispositivo: pareceTelefono(cab('sec-ch-ua-mobile'), cab('user-agent')) ? 'telefono' : 'pc',
      digest: e?.digest ?? null,
      mensaje: `${e?.name && e.name !== 'Error' ? e.name + ': ' : ''}${e?.message ?? String(error)}`,
      detalle: {
        pantalla: context.routePath,
        tipo_ruta: context.routeType,
        render: context.renderSource ?? null,
        pila: pilaCorta(e?.stack),
      },
    })
  } catch {
    // Registrar un error no puede producir otro.
  }
}
