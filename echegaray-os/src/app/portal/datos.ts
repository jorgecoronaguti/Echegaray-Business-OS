import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SesionPortal } from './sesion'
import type { ObraDelPortal } from './Shell'
import { accesoVigente, alcanzaLaObra, limpiarNombre, type AccesoDelPortal, type FilaAcceso } from './permisos'

// QUÉ VE ESTE MAIL — la pregunta se le hace a `public.cliente_acceso`, que es la ficha del cliente.
//
// ═══ LA CORRECCIÓN DEL 26/08/2026 ═══
//
// Este archivo leía `cliente_mail`, una tabla que el portal se creó para sí mismo sin ver que la
// pantalla 31 —«Acceso al portal», ya en producción— administraba exactamente lo mismo en
// `cliente_acceso`. Convivían dos definiciones de «quién entra»: administración revocaba un acceso
// en la ficha y el portal seguía dejándolo pasar. LA FICHA DEL CLIENTE GANA, siempre.
//
// Lo que `cliente_mail` no sabía y acá sí se respeta: un acceso vale mientras `revocado_at IS NULL`;
// `obras = NULL` es TODAS y `obras = []` es NINGUNA; y los tres permisos (`puede_ver_obra`,
// `puede_ver_montos`, `puede_aprobar`) son independientes. Las reglas viven en `./permisos.ts`,
// puras y con test — acá sólo se consulta.
//
// ═══ LA COOKIE NO DECIDE NADA ═══
//
// El alcance se vuelve a preguntar por MAIL en cada carga. Si administración revoca un acceso, la
// sesión abierta deja de ver en la pantalla siguiente, no cuando venza la cookie doce horas después.
// Un permiso que viaja en el navegador es un permiso que se puede editar.

const COLUMNAS_ACCESO =
  'id, cliente_id, puede_ver_obra, puede_ver_montos, puede_aprobar, obras, revocado_at,'
  + ' clientes(nombre_comercial, razon_social)'

type FilaConCliente = FilaAcceso & {
  clientes: { nombre_comercial: string | null; razon_social: string | null }
    | { nombre_comercial: string | null; razon_social: string | null }[] | null
}

/**
 * LOS ACCESOS VIVOS DE ESTE MAIL, uno por cliente.
 *
 * Devuelve `[]` cuando no hay ninguno, y eso NO es un error: es el estado de un acceso que
 * administración acaba de revocar. La pantalla lo dice; no muestra una obra igual.
 *
 * `revocado_at is null` va en el `where` Y en `accesoVigente`. No es redundancia: el filtro de la
 * consulta es el que evita traer filas de más, y la función pura es la que tiene test y el único
 * lugar donde cambiar la regla el día que un acceso también venza.
 */
export async function accesosDelMail(mail: string): Promise<AccesoDelPortal[]> {
  const { data } = await createAdminClient()
    .from('cliente_acceso')
    .select(COLUMNAS_ACCESO)
    .eq('email', mail)
    .is('revocado_at', null)

  const filas = (data ?? []) as unknown as FilaConCliente[]
  return filas
    .filter(accesoVigente)
    .map((f) => {
      // PostgREST devuelve el join anidado como objeto o como arreglo según la relación que infiera.
      const c = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes
      return {
        accesoId: String(f.id),
        clienteId: String(f.cliente_id),
        clienteNombre: limpiarNombre(String(c?.nombre_comercial ?? c?.razon_social ?? 'Cliente')),
        puedeVerObra: f.puede_ver_obra === true,
        puedeVerMontos: f.puede_ver_montos === true,
        puedeAprobar: f.puede_aprobar === true,
        // `obras` viaja tal cual: `null` y `[]` significan cosas opuestas y aplanarlos acá sería
        // exactamente el defecto que publica los permisos al revés.
        obras: f.obras ?? null,
      }
    })
    .sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, 'es'))
}

/**
 * EL ACCESO CON EL QUE SE ESTÁ MIRANDO. `null` = este mail ya no alcanza a ese cliente.
 *
 * El `clienteId` viene de la cookie —lo eligió en la puerta— pero NO es una credencial: se busca
 * contra los accesos reales del mail. Aunque se rompiera la firma de la cookie, un cliente que el
 * mail no alcanza devuelve `null` y la pantalla no dibuja nada suyo.
 */
export async function accesoDelPortal(sesion: SesionPortal): Promise<AccesoDelPortal | null> {
  // LA VISTA PREVIA NO PASA POR LA LISTA DE INVITADOS. La autorización ya la dio el OS —sesión viva
  // más permiso económico, comprobado en la ruta que firma esta cookie— y el dueño no es un contacto
  // del cliente: no tiene ni debe tener fila en `cliente_acceso`.
  if (sesion.previa) return await accesoDeVistaPrevia(sesion.clienteId)
  return (await accesosDelMail(sesion.mail)).find((a) => a.clienteId === sesion.clienteId) ?? null
}

/**
 * El acceso sintético de la previa: TODOS los permisos y TODAS las obras.
 *
 * Es lo correcto y no una comodidad: la previa existe para contestar «¿qué le estoy mostrando a este
 * cliente?», y recortarla mostraría menos de lo que el cliente ve — que es justo la pregunta que no
 * quedaría contestada. Lo que cada contacto ve de verdad se decide en su propia fila.
 */
async function accesoDeVistaPrevia(clienteId: string): Promise<AccesoDelPortal | null> {
  const { data } = await createAdminClient()
    .from('clientes').select('id, nombre_comercial, razon_social').eq('id', clienteId).maybeSingle()
  if (!data) return null
  return {
    accesoId: `previa:${clienteId}`,
    clienteId: String(data.id),
    clienteNombre: limpiarNombre(String(data.nombre_comercial ?? data.razon_social ?? 'Cliente')),
    puedeVerObra: true, puedeVerMontos: true, puedeAprobar: false, obras: null,
  }
}

/** Una obra del alcance, con el cliente al que pertenece. */
export type ObraAlcanzada = ObraDelPortal & { clienteId: string; clienteNombre: string; cerrada: boolean }

/**
 * LAS OBRAS DEL CLIENTE, PARA DOCUMENTOS Y TERMINADAS.
 *
 * ═══ LO QUE ESTA FUNCIÓN NO PUEDE HACER, DICHO ACÁ ═══
 *
 * Estas dos pantallas se apoyan en `public.obras` (uuid), y `cliente_acceso.obras` guarda ids de
 * `public.obra_canonica` (texto) — son DOS registros de obra distintos, con distinta granularidad:
 * `public.obras` tiene «MAMPOSTERÍA» donde `obra_canonica` tiene «Galpones, Mampostería, Cancha de
 * Padel». No existe mapeo entre ellos y fabricarlo sería inventar el dato.
 *
 * Por eso, cuando el acceso está ACOTADO a un subconjunto de obras (`obras` no es `null`), esta
 * función devuelve `[]`: no se puede afirmar cuál de las obras de `public.obras` corresponde a las
 * autorizadas, y mostrarlas todas filtraría documentos de obras que ese contacto no tiene. Falla
 * cerrado. El cronograma —que sí vive en `obra_canonica`— no tiene esta limitación.
 */
export async function obrasDelCliente(acceso: AccesoDelPortal): Promise<ObraAlcanzada[]> {
  // `alcanzaLaObra(obras, null)` es true sólo con `obras = null`: es la misma regla probada, no un
  // `if (obras !== null)` suelto que mañana se cambie en un lugar y no en el otro.
  if (!alcanzaLaObra(acceso.obras, null)) return []

  const { data } = await createAdminClient()
    .from('obras')
    .select('id, nombre, estado')
    .eq('cliente_id', acceso.clienteId)

  const obras = ((data ?? []) as { id: string; nombre: string; estado: string }[]).map((o) => ({
    id: String(o.id),
    nombre: String(o.nombre),
    clienteId: acceso.clienteId,
    clienteNombre: acceso.clienteNombre,
    cerrada: String(o.estado) === 'cerrada',
  }))

  // LAS CERRADAS VAN AL FINAL. La primera de la lista es la que abre el portal, y abrir por una obra
  // terminada le muestra al cliente algo que ya pagó. Las terminadas tienen su propia pantalla.
  return obras.sort(
    (a, b) => Number(a.cerrada) - Number(b.cerrada) || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/** La obra elegida por la URL, acotada SIEMPRE a las que este acceso alcanza. */
export function obraElegida<T extends { id: string }>(obras: T[], pedida: string | undefined): T | null {
  const halla = pedida ? obras.find((o) => o.id === pedida) : null
  // Una obra pedida que no está en el alcance no da error ni pantalla vacía: cae en la primera suya.
  return halla ?? obras[0] ?? null
}
