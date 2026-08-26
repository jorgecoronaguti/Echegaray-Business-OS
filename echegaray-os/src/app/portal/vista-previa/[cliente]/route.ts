import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { armarCookie, NOMBRE_COOKIE } from '../../sesion'

// VER EL PORTAL COMO LO VE ESTE CLIENTE — desde su propia ficha, en un clic.
//
// ═══ POR QUÉ EXISTE ═══
//
// Para revisar qué le está mostrando el portal a un cliente había que ser ese cliente. La primera
// solución fue cargarle el mail del dueño como acceso en los cinco clientes, y estaba mal por una
// razón que el dueño dijo en una línea: «no q ese sea el mail por defecto de todos los clientes».
// La solapa «Acceso al portal» es la lista de invitados REALES de ese cliente; meter ahí al dueño
// ensucia el dato con el que administración decide a quién le llega la información.
//
// Acá no se crea ninguna fila. La autorización es la del OS —sesión viva y permiso económico— y de
// ella sale una cookie de portal marcada como previa.
//
// ═══ EL PORTERO ESTÁ ACÁ, Y ES EL MISMO QUE EL DE LA FICHA ═══
//
// `veEconomia` porque esto muestra la plata del cliente: contrato, certificados, vencimientos. Un
// jefe de obra no la abre. Sin sesión del OS no se firma nada — y la cookie que se emite alcanza
// SÓLO a este cliente, así que ni siquiera un usuario con permiso puede convertirla en otra.

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ cliente: string }> }) {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])
  if (!usuario || !veEconomia(perfil.data?.rol)) redirect('/login?volver=/clientes')

  const { cliente } = await params
  // POR SLUG O POR ID, PERO NO CON UN `or(...)`. `id` es `uuid`: pedirle a PostgREST
  // `id.eq.quattropani` no devuelve cero filas, devuelve un ERROR de tipo, y con él se caía la
  // consulta entera aunque el slug existiera. La previa terminaba rebotando a `/clientes` sin decir
  // por qué. Se mira la forma del texto y se consulta la columna que corresponde.
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cliente)
  const { data, error } = await supabase
    .from('clientes').select('id').eq(esUuid ? 'id' : 'slug', cliente).maybeSingle()
  if (error || !data) redirect('/clientes')

  // El mail queda registrado como el de quien mira: si algo se hace desde la previa, se sabe quién
  // fue. No es el mail de un contacto del cliente y no se compara nunca contra `cliente_acceso`.
  const { valor, maxAge } = armarCookie({ mail: usuario.email ?? 'os', clienteId: String(data.id), previa: true })
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
  redirect('/portal')
}
