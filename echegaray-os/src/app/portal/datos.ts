import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SesionPortal } from './sesion'
import { accesoVigente, limpiarNombre, type AccesoDelPortal, type FilaAcceso } from './permisos'

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
  'id, cliente_id, persona_contacto, puede_ver_obra, puede_ver_montos, puede_aprobar, obras, revocado_at,'
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
        // CON QUÉ NOMBRE SE LO SALUDA. `null` = administración no lo cargó, y entonces el portal
        // saluda con el nombre del cliente: cierto, aunque menos cálido. No se deriva del mail.
        persona: (f as { persona_contacto?: string | null }).persona_contacto?.trim() || null,
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
    // La previa la mira Dirección, no una persona del cliente: no hay a quién saludar por su nombre.
    persona: null,
    puedeVerObra: true, puedeVerMontos: true, puedeAprobar: false, obras: null,
  }
}

// `obrasDelCliente` y `obraElegida` SE FUERON (10/09/2026). Leían `public.obras` —el registro viejo,
// con otra granularidad y sin mapeo con `obra_canonica`— y fallaban cerrado devolviendo `[]` cuando
// el acceso estaba acotado, porque no había forma de decir qué obra de una tabla es cuál de la otra.
// Las tres pantallas que las usaban leen `obra_canonica` a través de `obrasParaElInicio`, que aplica
// el alcance obra por obra y con test. Un lector del registro viejo que ya no usa nadie es la puerta
// por la que vuelve la segunda definición de «obra terminada».
