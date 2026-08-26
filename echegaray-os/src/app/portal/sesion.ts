import 'server-only'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'

// LA SESIÓN DEL CLIENTE — una cookie firmada, y nada más.
//
// ═══ POR QUÉ NO ES UN USUARIO DE SUPABASE ═══
//
// El cliente no tiene cuenta: entra con el mail que el administrador le cargó en la ficha y un código
// que le llega por mail. Darle un usuario de Auth lo pondría dentro del OS —con su `auth.uid()`, sus
// políticas, su posibilidad de aparecer en pantallas internas— y el portal es una aplicación aparte.
//
// ═══ LA FIRMA NO ES DECORACIÓN ═══
//
// La cookie dice a qué obras alcanza este mail. Sin firma, cualquiera edita el número de obra en el
// navegador y ve la obra de otro cliente. Se firma con HMAC y se compara en tiempo constante.
//
// LO QUE LA COOKIE NO DECIDE: qué puede VER. El alcance real se vuelve a comprobar contra
// `public.cliente_acceso` en cada carga (`accesosDelMail`), que es la lista de invitados que
// administra la ficha del cliente. La cookie dice quién es; la base dice qué le toca — y si el
// acceso fue revocado, deja de ver en la pantalla siguiente. Un permiso que viaja en el navegador es
// un permiso que se puede editar.

const COOKIE = 'portal_sesion'
const VIDA_HORAS = 12

export type SesionPortal = {
  mail: string
  clienteId: string
  /** Para poder atar los registros de acceso a una sesión concreta sin exponer el mail en los logs. */
  sid: string
  /** Epoch en segundos. */
  vence: number
}

function secreto(): string {
  const s = process.env.PORTAL_SECRETO ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  // FALLA CERRADO. Sin secreto no se firma nada: es preferible que nadie entre a que entre cualquiera.
  if (!s) throw new Error('PORTAL_SECRETO no está configurado: el portal no puede firmar sesiones')
  return s
}

function firmar(cuerpo: string): string {
  return createHmac('sha256', secreto()).update(cuerpo).digest('base64url')
}

export function armarCookie(datos: Omit<SesionPortal, 'sid' | 'vence'>): { valor: string; maxAge: number } {
  const sesion: SesionPortal = { ...datos, sid: randomUUID(), vence: Math.floor(Date.now() / 1000) + VIDA_HORAS * 3600 }
  const cuerpo = Buffer.from(JSON.stringify(sesion)).toString('base64url')
  return { valor: `${cuerpo}.${firmar(cuerpo)}`, maxAge: VIDA_HORAS * 3600 }
}

/** NÚCLEO PURO: valida una cookie sin tocar Next. Es lo que se prueba. */
export function leerCookie(valor: string | undefined, ahora = Date.now()): SesionPortal | null {
  if (!valor) return null
  const corte = valor.lastIndexOf('.')
  if (corte <= 0) return null
  const cuerpo = valor.slice(0, corte)
  const dada = Buffer.from(valor.slice(corte + 1))
  const esperada = Buffer.from(firmar(cuerpo))
  // `timingSafeEqual` exige el mismo largo; distinta longitud ya es distinta firma.
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null
  try {
    const s = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as SesionPortal
    if (!s.mail || !s.clienteId) return null
    if (!s.vence || s.vence * 1000 < ahora) return null
    return s
  } catch {
    return null
  }
}

export const NOMBRE_COOKIE = COOKIE

/** La sesión de esta petición, o null. */
export async function sesionDelPortal(): Promise<SesionPortal | null> {
  try {
    return leerCookie((await cookies()).get(COOKIE)?.value)
  } catch {
    // Sin secreto configurado, `firmar` tira. Falla cerrado: no hay sesión.
    return null
  }
}
