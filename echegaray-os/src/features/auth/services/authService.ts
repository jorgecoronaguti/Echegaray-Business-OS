import { cache } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
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

/** El usuario de la sesión, resuelto UNA vez por request. */
const memoDelUsuario = cache((): { promesa: Promise<User | null> | null } => ({ promesa: null }))

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

export async function getUsuarioActual(supabase: SupabaseClient) {
  const memo = memoDelUsuario()
  memo.promesa ??= supabase.auth.getUser().then(({ data: { user } }) => user)
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
