import { createClient } from '@/lib/supabase/server'
import { registrar } from '@/shared/registro/registroApp'
import { pareceTelefonoSegun } from '@/shared/utils/dispositivo'

// LO QUE VIO EL NAVEGADOR (30/09/2026): la pantalla de error (`EstadoError`, que dibujan TODOS los
// `error.tsx` y `global-error.tsx`) avisa acá una vez por error. Es la mitad que `onRequestError` no ve:
// un error que nace en el cliente (hidratación, un componente que tira en el navegador) o una página de
// servidor que eligió mostrar el mensaje. La identidad sale de la sesión verificada, no del cuerpo.
// Abierta a todos los niveles (`API_DE_TODOS`): el que más necesita avisar es el que menos ve.
export const dynamic = 'force-dynamic'

const TOPE_CUERPO = 8_000
const texto = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : null)

export async function POST(request: Request) {
  const crudo = await request.text().catch(() => '')
  if (!crudo || crudo.length > TOPE_CUERPO) return new Response(null, { status: 204 })
  let b: Record<string, unknown>
  try {
    b = JSON.parse(crudo)
  } catch {
    return new Response(null, { status: 204 })
  }
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }))
  const ruta = texto(b.ruta, 500)
  if (!ruta) return new Response(null, { status: 204 })
  await registrar({
    tipo: 'error_cliente',
    ruta,
    consulta: texto(b.consulta, 500),
    perfil_id: data?.claims?.sub ?? null,
    prestada: /(?:^|;\s*)os_entrar_como=/.test(request.headers.get('cookie') ?? ''),
    metodo: 'GET',
    dispositivo: pareceTelefonoSegun(request.headers) ? 'telefono' : 'pc',
    digest: texto(b.digest, 100),
    mensaje: texto(b.mensaje, 1000),
    detalle: { clave: texto(b.clave, 60), pila: texto(b.pila, 1500), origen: texto(b.origen, 30) },
  })
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}
