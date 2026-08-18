// 01 OBRAS · EL RECORD DEL CLIENTE — todo en una pantalla.
//
// ═══ QUÉ CAMBIÓ Y POR QUÉ (19/08/2026) ═══
//
// Había cinco solapas: Información, Contactos, Obras, Actividad, Documentos. El dueño:
// *"CLIENTE = RECORD PRINCIPAL. Dentro veo: propiedades; actividad; contactos asociados; obras
// asociadas; documentos asociados."* Y el principio que lo ordena todo: **el record no puede quedar
// detrás de una solapa.**
//
// El defecto de las solapas no era estético. «¿Este cliente tiene el contrato cargado y quién es el
// contacto que hay que llamar?» son dos solapas y dos viajes al servidor, y en el medio se olvida lo
// que se vio en la primera. Con las cinco caras a la vista, la pregunta se contesta mirando.
//
// ═══ LO QUE ESTO CUESTA, DICHO ═══
//
// Antes se leía SÓLO la solapa abierta. Ahora se lee todo, en paralelo, en una sola vuelta. Es más
// trabajo por apertura y es el precio del record; se compensa recortando lo que se DIBUJA —la
// actividad y los documentos muestran los últimos, con el total al lado y el resto a un clic—, que
// es lo que hace que una ficha con 214 documentos siga siendo una pantalla.
//
// ═══ EL ESTADO VIAJA EN LA URL, NO EN EL NAVEGADOR ═══
//
// `?editar=1` abre el formulario de la ficha, `?contacto=<id>` el de un contacto, `?archivadas=1`
// suma las obras cerradas, `?actividad=todo` y `?documentos=todo` despliegan sus bloques. Cada
// estado es una dirección compartible y el botón «atrás» hace lo que se espera. Los `?vista=…` que
// alguien haya compartido siguen abriendo: el parámetro ya no significa nada y el record se ve
// entero, que es más de lo que ese enlace prometía.
//
// FRONTERA: el cliente CONSOLIDA, no administra. El contratado y el costo real salen de `obra_panel`
// —o sea, de Compras y de Cotización—. Acá no se calcula ni se guarda un número propio.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import {
  getActividadCliente, getCliente, getContactos, getDocumentosCliente, getObrasDelCliente, getResponsables,
} from '@/features/clientes/services/clientesService'
import {
  archivarCliente, borrarContacto, crearContacto, crearNota, editarCliente, editarContacto,
} from '@/features/clientes/services/actions'
import {
  clasificarDocumentoCliente, desvincularDocumentoCliente, vincularCarpetaCliente, vincularDocumentoCliente,
} from '@/features/clientes/services/actionsDocumentos'
import { crearObra } from '@/features/obras/services/actions'
import { Bloque } from '@/features/clientes/components/Bloque'
import { BloqueActividad } from '@/features/clientes/components/BloqueActividad'
import { BloqueContactos } from '@/features/clientes/components/BloqueContactos'
import { BloqueDocumentos } from '@/features/clientes/components/BloqueDocumentos'
import { BloqueInformacion } from '@/features/clientes/components/BloqueInformacion'
import { BloqueObras } from '@/features/clientes/components/BloqueObras'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

/** Quién puede ver certificaciones, facturaciones y cobranzas. Es un ESPEJO del predicado
 *  `es_administracion()` de la RLS, y sirve sólo para explicar la ausencia: quien decide sigue
 *  siendo Postgres, que devuelve cero filas. Sin este aviso, la actividad de un jefe de obra
 *  mostraría una historia recortada como si fuera toda la historia. */
const VE_CONTRACTUALES = ['direccion', 'administracion']

type Params = { cliente: string }
type Query = {
  contacto?: string; editar?: string; archivadas?: string; actividad?: string; documentos?: string
}

export default async function ClientePage({
  params, searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Query>
}) {
  const { cliente: slug } = await params
  const q = await searchParams

  const supabase = await createClient()
  const { data: cliente, error } = await getCliente(supabase, slug)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas escondió un defecto de permisos
  // detrás de un «página no encontrada» durante horas.
  if (error) {
    return (
      <PageShell eyebrow={<Link href="/clientes" className="hover:underline">← Clientes</Link>} title="No pude leer el cliente">
        <Callout tono="neg">{error}</Callout>
      </PageShell>
    )
  }
  if (!cliente) notFound()

  const id = cliente.cliente_id

  // ═══ CONSULTAR NO ES ADMINISTRAR ═══
  //
  // El dueño: *"Un usuario Obras debe poder consultar clientes, contactos, personas, proveedores…
  // VER INFORMACIÓN OPERATIVA ≠ ADMINISTRAR EL MAESTRO."* El record se abre para las dos áreas y los
  // formularios de escritura sólo se dibujan para Administración. No es la cerradura —la RLS rechaza
  // la escritura igual—, es no ofrecer un botón que la base va a rechazar.
  const rol = (await getPerfilActual(supabase)).data?.rol ?? null
  const puedeEditar = esAdministracion(rol)

  // Las cinco caras del record, en una sola vuelta. Secuencial, cada una sumaría su latencia a la
  // apertura de una pantalla que antes mostraba una sola.
  const [responsables, contactos, obras, linea, documentos] = await Promise.all([
    puedeEditar ? getResponsables(supabase) : Promise.resolve({ data: [], error: null }),
    getContactos(supabase, id),
    getObrasDelCliente(supabase, id),
    getActividadCliente(supabase, id),
    getDocumentosCliente(supabase, id),
  ])

  const conArchivadas = q.archivadas === '1'
  const todas = obras.data ?? []
  const cerradas = todas.filter((o) => o.estado === 'cerrada')

  /** La misma dirección con un parámetro cambiado. Los demás se preservan: desplegar la actividad
   *  no puede cerrar el contacto que alguien tenía abierto tres bloques más abajo. */
  const url = (cambio: Partial<Record<keyof Query, string | null>>) => {
    const p = new URLSearchParams(
      Object.entries({ ...q, ...cambio }).filter(([, v]) => v != null && v !== '') as [string, string][],
    )
    const s = p.toString()
    return `/clientes/${slug}${s ? `?${s}` : ''}`
  }

  return (
    <PageShell
      // La miga de pan es UNA: volver a la lista. «01 · Obras · Clientes» contradecía a la barra de
      // Administración que corona la pantalla, y repetía en tres niveles lo que esa barra ya dice.
      eyebrow={<Link href="/clientes" className="hover:underline">← Clientes</Link>}
      title={cliente.nombre_comercial}
      // El CUIT es LA identidad fiscal del cliente: es lo que lo cruza contra ARCA y contra el
      // banco, y por eso acompaña al nombre acá arriba en vez de esconderse en una propiedad.
      subtitle={cliente.cuit ?? 'CUIT sin cargar'}
      right={puedeEditar && (
        <Link
          href={url({ editar: q.editar === '1' ? null : '1' })}
          data-testid="editar-ficha"
          className="rounded-control border border-line bg-white px-3 py-1.5 text-[13px] text-ink hover:bg-slate-50"
        >{q.editar === '1' ? 'Cerrar edición' : 'Editar'}</Link>
      )}
    >
      {!cliente.activo && (
        <div className="mb-4" data-testid="cliente-archivado">
          <Callout tono="neutral">
            Este cliente está archivado: no aparece en la lista de clientes. Se reactiva desde el
            panel de información.
          </Callout>
        </div>
      )}

      {/* EL RECORD. En el teléfono es UNA columna y las propiedades van primero —quién es este
          cliente antes que qué le pasó—; en escritorio las propiedades se van a la derecha, fijas,
          y la historia y las relaciones ocupan la columna ancha. Sin `overflow-hidden` en ningún
          lado: cada tabla se desplaza sola dentro de su bloque, y así el teléfono no se corre de
          costado por culpa de la más ancha. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside className="min-w-0 space-y-3 lg:order-2" data-testid="panel-informacion">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink">Información</h2>
          <BloqueInformacion
            cliente={cliente}
            responsables={responsables.data ?? []}
            editar={editarCliente.bind(null, id)}
            vincularCarpeta={vincularCarpetaCliente.bind(null, id)}
            archivar={archivarCliente}
            puedeEditar={puedeEditar}
            edicionAbierta={q.editar === '1'}
          />
        </aside>

        <div className="min-w-0 space-y-7 lg:order-1">
          <Bloque titulo="Actividad" testid="bloque-actividad">
            <BloqueActividad
              linea={linea.data ?? { eventos: [], sinFecha: 0 }}
              puedeVerContractuales={VE_CONTRACTUALES.includes(rol ?? '')}
              puedeEscribir={puedeEditar}
              crearNota={crearNota.bind(null, id)}
              todo={q.actividad === 'todo'}
              urlTodo={url({ actividad: 'todo' })}
              urlPoco={url({ actividad: null })}
            />
          </Bloque>

          <Bloque titulo="Obras asociadas" cuenta={todas.length} testid="bloque-obras">
            <BloqueObras
              obras={conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')}
              archivadas={cerradas.length}
              conArchivadas={conArchivadas}
              urlArchivadas={url({ archivadas: '1' })}
              urlSinArchivadas={url({ archivadas: null })}
              clienteId={id}
              crearObra={crearObra}
              puedeEditar={puedeEditar}
            />
          </Bloque>

          <Bloque titulo="Contactos" cuenta={(contactos.data ?? []).length} testid="bloque-contactos">
            <BloqueContactos
              contactos={contactos.data ?? []}
              enEdicion={q.contacto ?? null}
              urlDe={(c) => url({ contacto: c })}
              editar={(c) => editarContacto.bind(null, c)}
              crear={crearContacto.bind(null, id)}
              borrar={borrarContacto}
              puedeEditar={puedeEditar}
            />
          </Bloque>

          <Bloque titulo="Documentos" cuenta={(documentos.data ?? []).length} testid="bloque-documentos">
            <BloqueDocumentos
              documentos={documentos.data ?? []}
              carpetaDriveId={cliente.drive_carpeta_id}
              vincular={vincularDocumentoCliente.bind(null, id)}
              clasificar={(f) => clasificarDocumentoCliente.bind(null, id, f)}
              desvincular={desvincularDocumentoCliente.bind(null, id)}
              puedeEditar={puedeEditar}
              todo={q.documentos === 'todo'}
              urlTodo={url({ documentos: 'todo' })}
              urlPoco={url({ documentos: null })}
            />
          </Bloque>
        </div>
      </div>
    </PageShell>
  )
}
