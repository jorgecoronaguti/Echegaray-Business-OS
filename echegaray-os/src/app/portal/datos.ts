import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ObraDelPortal } from './Shell'

// QUÉ VE ESTE MAIL — la pregunta se le hace a la BASE, no a la cookie.
//
// El alcance de un mail es una decisión del administrador y vive en `cliente_mail`. Que la cookie
// diga «cliente X» no autoriza a ver nada: se vuelve a preguntar acá, por MAIL, en cada carga. Si el
// administrador da de baja un acceso, la sesión abierta deja de ver la obra en la pantalla siguiente,
// no cuando venza la cookie doce horas después.
//
// ═══ UN MAIL, VARIOS CLIENTES (26/08/2026) ═══
//
// Antes esto preguntaba por `cliente_id` —el que la cookie guardó al entrar— y por eso un mail veía
// las obras de UN cliente. Ahora pregunta por el mail y junta todo su alcance:
//   · fila con `obra_id NULL` → todas las obras de ese cliente;
//   · fila con `obra_id` → sólo esa obra.
// El mail del dueño puede así estar habilitado en varios clientes y ver, desde el portal, exactamente
// lo que cada uno ve.
//
// EL CLIENTE_ID DE LA COOKIE YA NO DECIDE NADA. Queda para saber por dónde entró; el alcance sale de
// acá. Un permiso que viaja en el navegador es un permiso que se puede editar.

/** Una obra del alcance, con el cliente al que pertenece: con varios clientes hay que poder decir cuál. */
export type ObraAlcanzada = ObraDelPortal & { clienteId: string; clienteNombre: string; cerrada: boolean }

/** Los paréntesis de «(IMOTOR / Javier Sánchez)» son una anotación interna de administración. */
function limpiarNombre(crudo: string): string {
  return crudo.trim().replace(/^\((.*)\)$/, '$1').trim()
}

/**
 * TODAS LAS OBRAS QUE ESTE MAIL ALCANZA, de todos los clientes en los que está habilitado.
 *
 * Devuelve `[]` cuando el mail no tiene ninguna fila activa, y eso NO es un error: es el estado de un
 * acceso que el administrador acaba de dar de baja. La pantalla lo dice; no muestra una obra igual.
 */
export async function obrasDelMail(mail: string): Promise<ObraAlcanzada[]> {
  const sb = createAdminClient()
  const { data: permisos } = await sb
    .from('cliente_mail')
    .select('cliente_id, obra_id')
    .eq('mail', mail)
    .eq('activo', true)

  if (!permisos?.length) return []

  const clientesEnteros = [...new Set(permisos.filter((p) => p.obra_id == null).map((p) => String(p.cliente_id)))]
  const obrasSueltas = [...new Set(permisos.filter((p) => p.obra_id != null).map((p) => String(p.obra_id)))]

  // Dos consultas y no un `or(...)` armado con strings: el filtro de PostgREST se escribe en una URL
  // y un nombre con una coma adentro parte la expresión. Acá los valores van como parámetros.
  const [porCliente, porObra] = await Promise.all([
    clientesEnteros.length
      ? sb.from('obras').select('id, nombre, estado, cliente_id, clientes(nombre_comercial, razon_social)').in('cliente_id', clientesEnteros)
      : Promise.resolve({ data: [] as never[] }),
    obrasSueltas.length
      ? sb.from('obras').select('id, nombre, estado, cliente_id, clientes(nombre_comercial, razon_social)').in('id', obrasSueltas)
      : Promise.resolve({ data: [] as never[] }),
  ])

  type Fila = { id: string; nombre: string; estado: string; cliente_id: string; clientes: { nombre_comercial: string | null; razon_social: string | null } | { nombre_comercial: string | null; razon_social: string | null }[] | null }
  const unicas = new Map<string, ObraAlcanzada>()
  for (const o of [...(porCliente.data ?? []), ...(porObra.data ?? [])] as unknown as Fila[]) {
    // PostgREST devuelve el join anidado como objeto o como arreglo según la relación que infiera.
    const c = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
    // Un mail habilitado al cliente entero Y a una de sus obras trae la misma obra dos veces.
    unicas.set(String(o.id), {
      id: String(o.id),
      nombre: String(o.nombre),
      clienteId: String(o.cliente_id),
      clienteNombre: limpiarNombre(String(c?.nombre_comercial ?? c?.razon_social ?? 'Cliente')),
      cerrada: String(o.estado) === 'cerrada',
    })
  }

  // LAS CERRADAS VAN AL FINAL. La primera de la lista es la que abre el portal, y abrir por una obra
  // terminada le muestra al cliente un cronograma vacío de algo que ya pagó — parece que perdimos su
  // obra en curso. Las terminadas tienen su propia pantalla.
  return [...unicas.values()].sort(
    (a, b) =>
      Number(a.cerrada) - Number(b.cerrada) ||
      a.clienteNombre.localeCompare(b.clienteNombre, 'es') ||
      a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/**
 * EL RÓTULO DE ARRIBA: de quién es la obra que se está mirando.
 *
 * Con un solo cliente es su nombre, como siempre. Con varios es el de la obra ABIERTA, que es la
 * única respuesta que no miente: poner «3 clientes» ahí no le dice a nadie qué está viendo.
 */
export function nombreParaElEncabezado(obras: ObraAlcanzada[], activa: ObraAlcanzada | null): string {
  return activa?.clienteNombre ?? obras[0]?.clienteNombre ?? 'Su obra'
}

/** La obra elegida por la URL, acotada SIEMPRE a las que este mail alcanza. */
export function obraElegida<T extends { id: string }>(obras: T[], pedida: string | undefined): T | null {
  const halla = pedida ? obras.find((o) => o.id === pedida) : null
  // Una obra pedida que no está en el alcance no da error ni pantalla vacía: cae en la primera suya.
  return halla ?? obras[0] ?? null
}

// ── EL PORTAL SE ORGANIZA POR CLIENTE, NO POR OBRA (26/08/2026) ──────────────────────────────
//
// La maqueta ponía arriba una barra de OBRAS y cada pantalla mostraba UNA. El dueño lo probó y lo
// rechazó: «por obra ingresar no me sirve, me sirve por cliente y q cada cliente tenga todas sus
// obras». Tiene razón y el motivo es del negocio, no de la pantalla: un cliente con cuatro obras no
// quiere saber cuánto debe en la Mampostería —quiere saber cuánto debe—. Elegir una obra para ver el
// total lo obliga a sumar de memoria cuatro pantallas.
//
// Ahora lo que se elige es el CLIENTE (y sólo cuando el mail alcanza más de uno, que es el caso del
// dueño mirando lo que ve cada uno). Todas las obras de ese cliente se muestran juntas, agrupadas.

export type ClienteDelPortal = { id: string; nombre: string; obras: ObraAlcanzada[] }

/**
 * LAS OBRAS DE UN CLIENTE, PARA ESTE MAIL. El portal entero se dibuja con esto.
 *
 * El `clienteId` viene de la cookie —lo eligió en la puerta— pero NO es una credencial: se filtra
 * contra el alcance real del mail. Editar la cookie no alcanza para ver otro cliente porque la cookie
 * está firmada, y aunque se rompiera la firma, un cliente que el mail no alcanza devuelve lista vacía.
 */
export async function obrasDelClientePara(mail: string, clienteId: string): Promise<ObraAlcanzada[]> {
  return (await obrasDelMail(mail)).filter((o) => o.clienteId === clienteId)
}

/** Los clientes que este mail alcanza, cada uno con TODAS sus obras. Deriva de `obrasDelMail`. */
export function clientesDelMail(obras: ObraAlcanzada[]): ClienteDelPortal[] {
  const porCliente = new Map<string, ClienteDelPortal>()
  for (const o of obras) {
    const previo = porCliente.get(o.clienteId)
    if (previo) previo.obras.push(o)
    else porCliente.set(o.clienteId, { id: o.clienteId, nombre: o.clienteNombre, obras: [o] })
  }
  return [...porCliente.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** El cliente elegido por la URL, acotado SIEMPRE a los que este mail alcanza. */
export function clienteElegido(clientes: ClienteDelPortal[], pedido: string | undefined): ClienteDelPortal | null {
  return (pedido ? clientes.find((c) => c.id === pedido) : null) ?? clientes[0] ?? null
}
