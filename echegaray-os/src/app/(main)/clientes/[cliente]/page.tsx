// 01 OBRAS · EL CLIENTE — información, contactos, obras, actividad y documentos.
//
// ═══ EL CLIENTE ES LA RELACIÓN EMPRESARIAL, NO UN AGRUPADOR DE OBRAS ═══
//
// Por eso la primera solapa es Información y no Obras: entrar por el portafolio convertía la ficha
// en una carpeta con obras adentro. Las obras siguen estando —y con acceso directo—, pero son UNA de
// las cinco caras de la relación, no la relación.
//
// ═══ CÓMO FUNCIONA ESTA PÁGINA ═══
//
// Las solapas y las sub-vistas viajan por query string: cada estado es una dirección que se puede
// compartir y el botón «atrás» del navegador hace lo que se espera. Toda escritura pasa por una
// server action atada al cliente con `bind` — el id del cliente NUNCA viaja en un campo editable del
// formulario, salvo el alta de obra, donde es un campo oculto porque `crearObra` lo valida como
// parte de su esquema y la RLS decide igual.
//
// SE LEE SÓLO LO DE LA SOLAPA ABIERTA. Traer los 214 documentos y sus metadatos de Drive para pintar
// la pestaña de contactos es trabajo que nadie pidió.
//
// FRONTERA: el cliente CONSOLIDA, no administra. El contratado y el costo real salen sumados de
// `obra_panel` —o sea, de Compras y de Cotización—. Acá no se calcula ni se guarda un número propio,
// y por eso no hay un «avance del cliente»: promediar obras de tamaños distintos daría un número que
// no significa nada.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import {
  getActividadCliente, getCliente, getContactos, getDocumentosCliente, getObrasDelCliente, getResponsables,
} from '@/features/clientes/services/clientesService'
import {
  archivarCliente, borrarContacto, crearContacto, editarCliente, editarContacto,
} from '@/features/clientes/services/actions'
import {
  clasificarDocumentoCliente, desvincularDocumentoCliente, vincularCarpetaCliente, vincularDocumentoCliente,
} from '@/features/clientes/services/actionsDocumentos'
import { crearObra } from '@/features/obras/services/actions'
import { TabActividad } from '@/features/clientes/components/TabActividad'
import { TabContactos } from '@/features/clientes/components/TabContactos'
import { TabDocumentos } from '@/features/clientes/components/TabDocumentos'
import { TabInformacion } from '@/features/clientes/components/TabInformacion'
import { TabObras } from '@/features/clientes/components/TabObras'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'informacion', label: 'Información' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'obras', label: 'Obras' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

/** Quién puede ver certificaciones, facturaciones y cobranzas. Es un ESPEJO del predicado
 *  `es_administracion()` de la RLS, y sirve sólo para explicar la ausencia: quien decide sigue
 *  siendo Postgres, que devuelve cero filas. Sin este aviso, la solapa Actividad de un jefe de obra
 *  mostraría una historia recortada como si fuera toda la historia. */
const VE_CONTRACTUALES = ['direccion', 'administracion']

export default async function ClientePage({
  params, searchParams,
}: {
  params: Promise<{ cliente: string }>
  searchParams: Promise<{ vista?: string; archivadas?: string; contacto?: string }>
}) {
  const { cliente: slug } = await params
  const { vista: vistaRaw, archivadas, contacto } = await searchParams
  const vista: Vista = (VISTAS.find((v) => v.id === vistaRaw)?.id ?? 'informacion') as Vista
  const conArchivadas = archivadas === '1'

  const supabase = await createClient()
  const { data: cliente, error } = await getCliente(supabase, slug)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas escondió un defecto de permisos
  // detrás de un «página no encontrada» durante horas.
  if (error) {
    return (
      <PageShell eyebrow={<Link href="/clientes" className="hover:underline">01 · Obras</Link>} title="No pude leer el cliente">
        <Callout tono="neg">{error}</Callout>
      </PageShell>
    )
  }
  if (!cliente) notFound()

  const id = cliente.cliente_id
  const url = (v: Vista, extra = '') => `/clientes/${slug}?vista=${v}${extra}`

  // ═══ CONSULTAR NO ES ADMINISTRAR (19/08/2026) ═══
  //
  // El dueño: *"Un usuario Obras debe poder consultar clientes, contactos, personas, proveedores…
  // No necesariamente puede administrar globalmente esas entidades. VER INFORMACIÓN OPERATIVA ≠
  // ADMINISTRAR EL MAESTRO."*
  //
  // Por eso la ficha del cliente se abre para las dos áreas y los formularios de escritura sólo se
  // dibujan para Administración. No es la cerradura —la RLS rechaza la escritura igual—, es no
  // ofrecer un botón que la base va a rechazar. La cartera completa (`/clientes`) sigue siendo de
  // Administración: ahí se ADMINISTRA el maestro.
  const rol = (await getPerfilActual(supabase)).data?.rol ?? null
  const puedeEditar = esAdministracion(rol)

  return (
    <PageShell
      eyebrow={<Link href="/clientes" className="hover:underline">01 · Obras · Clientes</Link>}
      title={cliente.nombre}
      subtitle={subtitulo(cliente.cuit, cliente.activo)}
    >
      {!cliente.activo && (
        <div className="mb-4" data-testid="cliente-archivado">
          <Callout tono="neutral">
            Este cliente está archivado: no aparece en la lista de clientes. Se reactiva desde Información.
          </Callout>
        </div>
      )}

      {/* Las solapas se desplazan en vez de empujar la página: cinco de ellas no entran en 390px. */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={url(v.id)}
            data-testid={`solapa-${v.id}`}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] ${vista === v.id ? 'border-slate-900 font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'informacion' && (
        <TabInformacion
          cliente={cliente}
          responsables={(await getResponsables(supabase)).data ?? []}
          editar={editarCliente.bind(null, id)}
          vincularCarpeta={vincularCarpetaCliente.bind(null, id)}
          archivar={archivarCliente}
          puedeEditar={puedeEditar}
        />
      )}

      {vista === 'contactos' && (
        <TabContactos
          contactos={(await getContactos(supabase, id)).data ?? []}
          enEdicion={contacto ?? null}
          urlDe={(c) => url('contactos', c ? `&contacto=${c}` : '')}
          editar={(c) => editarContacto.bind(null, c)}
          crear={crearContacto.bind(null, id)}
          borrar={borrarContacto}
          puedeEditar={puedeEditar}
        />
      )}

      {vista === 'obras' && (
        <SolapaObras
          clienteId={id}
          conArchivadas={conArchivadas}
          urlArchivadas={url('obras', '&archivadas=1')}
          urlSinArchivadas={url('obras')}
          puedeEditar={puedeEditar}
        />
      )}

      {vista === 'actividad' && (
        <TabActividad
          linea={(await getActividadCliente(supabase, id)).data ?? { eventos: [], sinFecha: 0 }}
          puedeVerContractuales={VE_CONTRACTUALES.includes(rol ?? '')}
        />
      )}

      {vista === 'documentos' && (
        <TabDocumentos
          documentos={(await getDocumentosCliente(supabase, id)).data ?? []}
          carpetaDriveId={cliente.drive_carpeta_id}
          vincular={vincularDocumentoCliente.bind(null, id)}
          clasificar={(f) => clasificarDocumentoCliente.bind(null, id, f)}
          desvincular={desvincularDocumentoCliente.bind(null, id)}
          puedeEditar={puedeEditar}
        />
      )}
    </PageShell>
  )
}

function subtitulo(cuit: string | null, activo: boolean): string | undefined {
  if (activo) return cuit ?? undefined
  return `${cuit ?? 'sin CUIT'} · archivado`
}

/** La solapa Obras necesita su propia lectura y su propio filtro; se arma acá para que la página no
 *  cargue el portafolio cuando nadie lo está mirando. */
async function SolapaObras({
  clienteId, conArchivadas, urlArchivadas, urlSinArchivadas, puedeEditar,
}: {
  clienteId: string
  conArchivadas: boolean
  urlArchivadas: string
  urlSinArchivadas: string
  puedeEditar: boolean
}) {
  const supabase = await createClient()
  const todas = (await getObrasDelCliente(supabase, clienteId)).data ?? []
  const archivadas = todas.filter((o) => o.estado === 'cerrada')
  return (
    <TabObras
      obras={conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')}
      archivadas={archivadas.length}
      conArchivadas={conArchivadas}
      urlArchivadas={urlArchivadas}
      urlSinArchivadas={urlSinArchivadas}
      clienteId={clienteId}
      crearObra={crearObra}
      puedeEditar={puedeEditar}
    />
  )
}
