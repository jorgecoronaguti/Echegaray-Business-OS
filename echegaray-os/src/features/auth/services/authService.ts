import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from '@/features/auth/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

// ═══ QUIÉN SOS SE PREGUNTA UNA VEZ POR REQUEST, NO UNA VEZ POR COMPONENTE (24/08/2026) ═══
//
// Dibujar el Resumen de una obra preguntaba TRES veces quién es el usuario y leía TRES veces su
// perfil: el `layout` de `(main)`, el `page.tsx` del workspace y `ChecklistPreparacion`, que se
// dibuja adentro del Resumen y pide el perfil por su cuenta. Ninguna de las tres está de más —cada
// una decide algo distinto— y ninguna puede saber que las otras existen.
//
// Medido contra el Supabase real con sesión de Dirección (mediana de 7):
//
//   auth.getUser() ······ 97 ms
//   perfiles select ····· 116 ms
//
// O sea ~426 ms por render gastados en volver a averiguar lo mismo, y la de `ChecklistPreparacion`
// cae DESPUÉS del `Promise.all`: es cola serial, no trabajo en paralelo.
//
// ═══ POR QUÉ UN MEMO POR REQUEST Y NO UN CACHÉ DE VERDAD ═══
//
// «Quién sos» es el dato MÁS por-usuario que existe: guardarlo entre requests es exactamente cómo se
// le sirve a una persona la pantalla de otra. `cache()` de React dura UN request y muere con él, así
// que no hay ventana donde dos sesiones compartan nada.
//
// `cache(() => new Map())` con CERO argumentos devuelve el MISMO Map durante todo el request. Se
// memoriza así —y no con `cache()` sobre las funciones— porque éstas reciben el `SupabaseClient`, y
// `createClient()` fabrica un objeto nuevo en cada llamada: `cache()` sobre el cliente no acertaría
// nunca. La clave es el id del usuario, que es un string.
//
// SE GUARDA LA PROMESA, NO EL RESULTADO: dos componentes que preguntan a la vez —el `Promise.all`
// del `page.tsx` y el layout— tienen que compartir el MISMO viaje, no arrancar dos y quedarse cada
// uno con el suyo.
//
// LO QUE ESTO NO HACE: no vuelve a `getUsuarioActual` más barata para quien le pasa un cliente
// distinto del de la sesión. El primero que pregunta en el request fija la respuesta. Hoy nadie le
// pasa el cliente de servicio —`createAdminClient()` se usa suelto, nunca por acá—, y si algún día
// alguien lo hace, esto es lo que tiene que leer antes.

/**
 * QUIÉN ENTRÓ. Sólo lo que sale del token firmado: el id y el correo.
 *
 * NO es el `User` completo de Supabase. Lo que el `User` trae de más —`factors`, `identities`,
 * `app_metadata`…— no viaja en el JWT y hay UNA pantalla que lo necesita
 * (`/mi-cuenta/seguridad`, que lee los factores de MFA). Esa se lo pide al servidor de Auth por su
 * cuenta, que además es lo correcto para un estado de seguridad: ahí el viaje se justifica.
 */
export type Identidad = { id: string; email: string | null }

/** El usuario de la sesión, resuelto UNA vez por request. */
const memoDelUsuario = cache((): { promesa: Promise<Identidad | null> | null } => ({ promesa: null }))

/** Los perfiles ya leídos en este request, por id. */
const memoDeLosPerfiles = cache((): Map<string, Promise<ServiceResult<Perfil | null>>> => new Map())

/**
 * Devuelve lo ya pedido bajo esa clave, o lo pide y lo registra. Está separada y exportada porque es
 * la única parte de este archivo que se puede probar: `cache()` de React NO memoriza fuera de un
 * request —comprobado: dos llamadas seguidas en Node devuelven objetos distintos—, así que un test
 * que llamara a `getPerfilActual()` dos veces mediría el comportamiento sin memo y pasaría igual.
 *
 * Que no memorice fuera del request es el modo de fallo BUENO: en un contexto sin scope de React
 * esto se comporta exactamente como antes de existir, nunca compartiendo de más.
 *
 * LA PROMESA SE REGISTRA ANTES DE ESPERARLA. Guardando el resultado en vez de la promesa, dos
 * llamadas concurrentes —que es el caso real: el `Promise.all` del `page.tsx` y el layout— no
 * encuentran nada registrado todavía y largan dos viajes iguales.
 */
export function recordar<T>(
  memo: Map<string, Promise<T>>, clave: string, pedir: () => Promise<T>,
): Promise<T> {
  const yaPedido = memo.get(clave)
  if (yaPedido) return yaPedido
  const promesa = pedir()
  memo.set(clave, promesa)
  return promesa
}

// ═══ LA FIRMA SE VERIFICA EN EL PROCESO, NO EN SÃO PAULO (25/08/2026) ═══
//
// `auth.getUser()` es un GET a `/auth/v1/user`: 76 ms medidos contra el Supabase real (mediana de
// 5). Se pagaba una vez por request —el memo de arriba evita las repeticiones DENTRO de un request,
// no entre requests— y hay al menos dos por pantalla: el documento y la Server Action de la
// campanita.
//
// El proyecto firma con clave asimétrica (`alg: ES256`, JWKS público — comprobado el 25/08
// decodificando un token real), así que `getClaims()` verifica la firma con WebCrypto contra la
// clave pública sin salir a la red: auth-js guarda el JWKS en `GLOBAL_JWKS`, a nivel de módulo,
// compartido por todos los clientes del proceso. La primera verificación de cada instancia trae el
// JWKS; las demás no.
//
// SIGUE SIENDO VERIFICAR, NO CREER: firma inválida y token vencido se rechazan igual, y si el
// proyecto volviera a firmar con HS256 la propia librería se cae a `getUser()` sola. Lo único que
// cambia es que una sesión cerrada a mano deja de verse recién cuando vence el access token —cosa
// que ya pasaba con los DATOS, porque PostgREST tampoco le pregunta al servidor de Auth.
export async function getUsuarioActual(supabase: SupabaseClient): Promise<Identidad | null> {
  const memo = memoDelUsuario()
  memo.promesa ??= supabase.auth.getClaims().then(({ data }) => {
    const sub = data?.claims?.sub
    if (!sub) return null
    const email = data.claims.email
    return { id: sub, email: typeof email === 'string' ? email : null }
  })
  return memo.promesa
}

async function leerPerfil(supabase: SupabaseClient, id: string): Promise<ServiceResult<Perfil | null>> {
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as Perfil | null, error: null }
}

/**
 * EL PERFIL DEL USUARIO DE LA SESIÓN.
 *
 * `userId` es opcional y existe por una razón medible: quien ya llamó a `getUsuarioActual()` tiene
 * el id en la mano, y sin este parámetro esta función volvía a pedírselo a Supabase. En el layout de
 * `(main)` eso era un viaje de red entero —de la función en iad1 a Supabase en São Paulo— repetido
 * en CADA pantalla del OS para averiguar algo que el llamador acababa de averiguar.
 *
 * Sin `userId` se comporta exactamente como antes: nadie tiene que cambiar para seguir funcionando.
 */
export async function getPerfilActual(supabase: SupabaseClient, userId?: string): Promise<ServiceResult<Perfil | null>> {
  const id = userId ?? (await getUsuarioActual(supabase))?.id
  if (!id) return { data: null, error: null }
  return recordar(memoDeLosPerfiles(), id, () => leerPerfil(supabase, id))
}
