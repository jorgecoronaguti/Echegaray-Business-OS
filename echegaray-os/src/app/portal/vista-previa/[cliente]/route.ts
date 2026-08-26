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
  // El cliente se busca por SLUG o por id: el enlace de la ficha usa el slug, que es lo que hay en
  // la URL donde estaba parado quien lo tocó.
  const { data } = await supabase
    .from('clientes').select('id').or(`slug.eq.${cliente},id.eq.${cliente}`).maybeSingle()
  if (!data) redirect('/clientes')

  // El mail queda registrado como el de quien mira: si algo se hace desde la previa, se sabe quién
  // fue. No es el mail de un contacto del cliente y no se compara nunca contra `cliente_acceso`.
  const { valor, maxAge } = armarCookie({ mail: usuario.email ?? 'os', clienteId: String(data.id), previa: true })
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
  redirect('/portal')
}
