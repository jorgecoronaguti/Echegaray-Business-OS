import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import {
  TEXTO_ESTADO, alcanceDe, estadoDelCliente, golpeanSinPermiso, type Intento,
} from '@/features/administracion/services/portalClientes'
import { golpesSinResolver } from '@/features/administracion/services/altaPortal'
import { nombreDeCliente } from '@/features/administracion/services/selectorObras'
import { Consola, type ClienteFila, type Golpe } from './Consola'

// ACCESO AL PORTAL DEL CLIENTE — la pantalla desde donde se opera lo que el 26/08 sólo existía en SQL.
//
// ═══ POR QUÉ EXISTE ═══
//
// El portal se desplegó ese día y no se construyó una sola pantalla para operarlo: habilitar a un
// cliente exigía un INSERT a mano contra Postgres. El dueño, textual: *"pero como mierda hago para
// gestionar todo el modulo de clientes?"*. Un módulo que sólo se opera por SQL no está terminado.
//
// ═══ POR QUÉ SE AGRUPA POR CLIENTE Y NO ES UNA LISTA DE MAILS ═══
//
// La pregunta que se hace quien entra acá no es «qué mails hay cargados» sino «¿ARCOR puede ver su
// obra?». Una lista plana de direcciones obliga a reconstruir esa respuesta de memoria. Acá cada
// cliente trae su semáforo, y el semáforo tiene TRES causas distintas —sin mail, sin obras, sin
// cronograma— porque arreglar una sin la otra deja al cliente mirando una pantalla vacía y creyendo
// que el sistema está roto.
//
// ═══ LO QUE NO SE DIBUJA, Y POR QUÉ ═══
//
// · «Última vez que entró»: `portal_acceso` registra el intento, no la sesión. El último registro de
//   un mail es el último INTENTO, y publicarlo como visita sería fabricar el dato.
// · Los clientes ARCHIVADOS quedan fuera de la lista y se cuentan al pie: dar acceso al portal a un
//   cliente archivado es casi siempre un error de selección, no una tarea.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Acceso al portal · Echegaray Business OS' }

/** Cuántos intentos se miran hacia atrás. Alcanza para ver el typo y no para paginar. */
const INTENTOS_MIRADOS = 200

/** El orden de la lista: primero lo que hay que resolver, al final lo que ya funciona. */
const PRIORIDAD = { sin_mail: 0, sin_cronograma: 1, sin_obras: 2, listo: 3 } as const

export default async function AccesoAlPortal() {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])
  // Decidir quién ve la plata de un cliente es economía: queda en Dirección y Administración.
  if (!usuario || !veEconomia(perfil.data?.rol)) redirect('/administracion')

  // CLAVE DE SERVICIO: `cliente_mail`, `portal_acceso` y `pago_programado` tienen RLS sin políticas.
  // La autorización es el chequeo de arriba, y el de cada acción de servidor.
  const sb = createAdminClient()
  const [clientesQ, obrasQ, mailsQ, pagosQ, accesosQ] = await Promise.all([
    sb.from('clientes').select('id, nombre_comercial, activo').order('nombre_comercial'),
    sb.from('obras').select('id, nombre, estado, cliente_id').order('nombre'),
    sb.from('cliente_mail').select('id, cliente_id, mail, obra_id, nombre, activo').order('mail'),
    sb.from('pago_programado').select('obra_id'),
    sb.from('portal_acceso').select('mail, resultado, created_at')
      .order('created_at', { ascending: false }).limit(INTENTOS_MIRADOS),
  ])

  const obras = obrasQ.data ?? []
  const mails = mailsQ.data ?? []
  // Cuántos pagos cargados tiene cada OBRA, para poder sumarlos por cliente sin una consulta por obra.
  const pagosPorObra = new Map<string, number>()
  for (const p of pagosQ.data ?? []) {
    const o = String(p.obra_id)
    pagosPorObra.set(o, (pagosPorObra.get(o) ?? 0) + 1)
  }
  const nombreDeObra = new Map(obras.map((o) => [String(o.id), String(o.nombre)]))

  const activos = (clientesQ.data ?? []).filter((c) => c.activo !== false)
  const filas: ClienteFila[] = activos.map((c) => {
    const id = String(c.id)
    const suyas = obras.filter((o) => String(o.cliente_id) === id)
    const susMails = mails.filter((m) => String(m.cliente_id) === id)
    const prendidos = susMails.filter((m) => m.activo !== false)
    const pagos = suyas.reduce((n, o) => n + (pagosPorObra.get(String(o.id)) ?? 0), 0)
    const estado = estadoDelCliente({ mails: prendidos.length, obras: suyas.length, pagos })
    return {
      id,
      nombre: nombreDeCliente(c.nombre_comercial as string | null),
      obras: suyas.map((o) => ({ id: String(o.id), nombre: String(o.nombre), estado: o.estado ? String(o.estado) : null })),
      pagos,
      mails: prendidos.map((m) => ({
        id: String(m.id),
        mail: String(m.mail),
        nombre: m.nombre ? String(m.nombre) : null,
        alcance: alcanceDe(m.obra_id ? String(m.obra_id) : null, m.obra_id ? nombreDeObra.get(String(m.obra_id)) : null),
      })),
      bajas: susMails.length - prendidos.length,
      estado,
      rotulo: TEXTO_ESTADO[estado].rotulo,
      queHacer: TEXTO_ESTADO[estado].que_hacer,
    }
  })
  filas.sort((a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado] || a.nombre.localeCompare(b.nombre, 'es'))

  const intentos: Intento[] = (accesosQ.data ?? []).map((a) => ({
    mail: String(a.mail), resultado: String(a.resultado), created_at: String(a.created_at),
  }))
  // `desde = 1`: en un ERP con un puñado de clientes UN rechazo ya es el typo. El umbral de tres de
  // la función está pensado para volumen, y acá esperar a tres es esperar a que el cliente llame.
  const golpes: Golpe[] = golpesSinResolver(
    golpeanSinPermiso(intentos, 1),
    mails.filter((m) => m.activo !== false).map((m) => String(m.mail)),
  )

  return (
    <Consola
      clientes={filas}
      golpes={golpes}
      intentosMirados={INTENTOS_MIRADOS}
      archivados={(clientesQ.data ?? []).length - activos.length}
      // `null` no es cero: si la lectura falló, la pantalla lo dice en vez de dibujar «0 clientes».
      error={clientesQ.error?.message ?? obrasQ.error?.message ?? mailsQ.error?.message ?? null}
    />
  )
}
