// 01 OBRAS · EL CLIENTE — información, contactos, documentos y sus obras.
//
// Mismo patrón que la ficha de obra: las solapas van por query string, cada vista es una URL que se
// puede compartir, y toda escritura pasa por una server action atada al cliente con `bind`. El id
// del cliente NUNCA viaja en un campo editable del formulario, salvo el alta de obra —donde es un
// campo oculto porque `crearObra` lo valida como parte de su esquema y la RLS decide igual.
//
// FRONTERA: el cliente CONSOLIDA, no administra. El contratado y el costo real salen sumados de
// `obra_panel` —o sea, de Compras y de Cotización— y el avance de cada obra sale de `obra_avance`.
// Acá no se calcula ni se guarda un número propio, y por eso no hay un "avance del cliente":
// promediar obras de tamaños distintos daría un número que no significa nada.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getCliente, getContactos, getDocumentosCliente, getObrasDelCliente,
} from '@/features/clientes/services/clientesService'
import {
  archivarCliente, borrarContacto, crearContacto, editarCliente,
} from '@/features/clientes/services/actions'
import { vincularCarpetaDriveForm, vincularDocumentoForm } from '@/features/clientes/services/actionsForm'
import { crearObra } from '@/features/obras/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'
import { plata } from '@/features/obras/components/formato'
import { BotonAccion, Callout, Campo, CTRL, FormAccion, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'obras', label: 'Obras' },
  { id: 'informacion', label: 'Información' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

function Dato({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{k}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{v}</p>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  )
}

/** Una obra del cliente. Es la fila del portafolio, con lo justo: a dónde lleva y cómo va. */
function FilaObra({ o }: { o: ObraPanel }) {
  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-sky-50/50">
      <td className="px-4 py-2.5">
        <Link href={`/obras/${o.obra_id}`} className="block">
          <span className="text-[13px] font-semibold text-ink hover:underline">{o.nombre}</span>
          <span className="block text-[11px] text-faint">
            {o.etapa ? ETAPA_LABEL[o.etapa] : 'etapa sin declarar'}
            {o.estado !== 'activa' && ` · ${o.estado}`}
          </span>
        </Link>
      </td>
      <td className="px-3 py-2.5">
        {o.avance_pct == null ? (
          <span className="text-[12px] text-faint">{o.n_actividades ? 'sin avance cargado' : 'sin cronograma'}</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, o.avance_pct)}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink">{o.avance_pct}%</span>
            {/* La cobertura va pegada al número, igual que en el portafolio y en el chat. */}
            <span className="whitespace-nowrap text-[11px] text-faint">
              {o.n_actividades_medidas}/{o.n_actividades}
            </span>
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{plata(o.monto_contratado)}</td>
      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink">{plata(o.costo_real)}</td>
    </tr>
  )
}

export default async function ClientePage({
  params, searchParams,
}: {
  params: Promise<{ cliente: string }>
  searchParams: Promise<{ vista?: string; archivadas?: string }>
}) {
  const { cliente: slug } = await params
  const { vista: vistaRaw, archivadas: verArchivadas } = await searchParams
  const vista: Vista = (VISTAS.find((v) => v.id === vistaRaw)?.id ?? 'obras') as Vista
  const conArchivadas = verArchivadas === '1'

  const supabase = await createClient()
  const { data: cliente, error } = await getCliente(supabase, slug)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas escondió un defecto de permisos
  // detrás de un "página no encontrada" durante horas.
  if (error) {
    return (
      <PageShell eyebrow={<Link href="/clientes" className="hover:underline">01 · Obras</Link>} title="No pude leer el cliente">
        <Callout tono="neg">{error}</Callout>
      </PageShell>
    )
  }
  if (!cliente) notFound()

  const [{ data: obras }, { data: contactos }, { data: documentos }] = await Promise.all([
    getObrasDelCliente(supabase, cliente.cliente_id),
    getContactos(supabase, cliente.cliente_id),
    getDocumentosCliente(supabase, cliente.cliente_id),
  ])
  // MISMO CRITERIO QUE EL PORTAFOLIO: archivada = `cerrada`, y `pausada` se sigue viendo. Si el
  // cliente escondiera obras con una regla distinta de la del portafolio, la misma obra estaría o
  // no estaría según por dónde se entre — que es exactamente el problema que el eje canónico vino a
  // resolver.
  const todasLasObras = obras ?? []
  const obrasArchivadas = todasLasObras.filter((o) => o.estado === 'cerrada')
  const lasObras = conArchivadas ? todasLasObras : todasLasObras.filter((o) => o.estado !== 'cerrada')
  const losContactos = contactos ?? []
  const losDocs = documentos ?? []

  return (
    <PageShell
      eyebrow={<Link href="/clientes" className="hover:underline">01 · Obras · Clientes</Link>}
      title={cliente.nombre}
      subtitle={cliente.activo ? (cliente.cuit ?? undefined) : `${cliente.cuit ?? 'sin CUIT'} · archivado`}
    >
      {/* Las solapas se desplazan en vez de empujar la página: cuatro de ellas miden 407px y
          la pantalla del teléfono tiene 390. */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/clientes/${slug}?vista=${v.id}`}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] ${vista === v.id ? 'border-slate-900 font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'obras' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato k="Obras" v={String(cliente.n_obras)} sub={`${cliente.n_obras_activas} en curso`} />
            <Dato k="Contratado" v={plata(cliente.contratado)} sub={cliente.contratado == null ? 'no cargado' : 'suma de sus obras'} />
            <Dato k="Costo real" v={plata(cliente.costo_real)} sub="comprobantes imputados" />
            <Dato k="Impedimentos" v={cliente.restricciones_abiertas ? String(cliente.restricciones_abiertas) : '—'} sub="sin resolver" />
          </div>

          {lasObras.length === 0 ? (
            <Callout tono="info">
              {todasLasObras.length === 0
                ? 'Este cliente no tiene ninguna obra. Se crea con el formulario de abajo.'
                : 'Todas las obras de este cliente están archivadas.'}
            </Callout>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table data-testid="obras-del-cliente" className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                    <th className="px-4 py-2.5 font-medium">Obra</th>
                    <th className="px-3 py-2.5 font-medium">Avance</th>
                    <th className="px-3 py-2.5 text-right font-medium">Contratado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Costo real</th>
                  </tr>
                </thead>
                <tbody>{lasObras.map((o) => <FilaObra key={o.obra_id} o={o} />)}</tbody>
              </table>
            </div>
          )}

          {/* La puerta de vuelta, igual que en el portafolio: archivar no puede parecerse a borrar. */}
          {obrasArchivadas.length > 0 && (
            <p className="text-[12px] text-faint" data-testid="pie-archivadas-cliente">
              {conArchivadas ? (
                <>
                  Se muestran también {obrasArchivadas.length} obra{obrasArchivadas.length === 1 ? '' : 's'} archivada{obrasArchivadas.length === 1 ? '' : 's'}.{' '}
                  <Link href={`/clientes/${slug}`} className="text-ink underline underline-offset-2">Ocultarlas</Link>.
                </>
              ) : (
                <>
                  {obrasArchivadas.length} obra{obrasArchivadas.length === 1 ? '' : 's'} archivada{obrasArchivadas.length === 1 ? '' : 's'} fuera de esta lista.{' '}
                  <Link href={`/clientes/${slug}?archivadas=1`} className="text-ink underline underline-offset-2" data-testid="ver-archivadas-cliente">Verlas</Link>.
                </>
              )}
            </p>
          )}

          <details className="rounded-xl border border-line bg-white" data-testid="alta-obra">
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Nueva obra de este cliente</summary>
            <div className="border-t border-line p-4">
              <FormAccion accion={crearObra} testid="form-obra" enviar="Crear obra" limpiarAlOk mensajeOk="Obra creada.">
                {/* La obra nace COLGADA DE ESTE CLIENTE. Que el cliente venga del contexto y no de un
                    desplegable es lo que impide crear una obra huérfana: hasta que existió
                    `cliente_id`, las tres obras de La Estrella eran tres cadenas de texto iguales
                    por casualidad. */}
                <input type="hidden" name="cliente_id" value={cliente.cliente_id} />
                <CamposObra />
              </FormAccion>
            </div>
          </details>
        </div>
      )}

      {vista === 'informacion' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-4">
            <dl className="space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-4"><dt className="text-faint">Razón social</dt><dd className="text-right text-ink">{cliente.nombre}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">CUIT</dt><dd className="tabular-nums text-ink">{cliente.cuit ?? 'sin cargar'}</dd></div>
              {/* El identificador NO se edita: es la URL del cliente y lo que apuntan los enlaces que
                  alguien ya compartió. Corregir la razón social no puede romper una dirección. */}
              <div className="flex justify-between gap-4"><dt className="text-faint">Identificador</dt><dd className="text-ink">{cliente.slug ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">Carpeta en Drive</dt><dd className="text-ink">{cliente.drive_carpeta_id ? 'declarada' : 'sin declarar'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">Estado</dt><dd className="text-ink">{cliente.activo ? 'activo' : 'archivado'}</dd></div>
            </dl>
            {cliente.notas && <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">{cliente.notas}</p>}
          </div>

          <div className="rounded-xl border border-line bg-white p-4" data-testid="editar-cliente">
            <h2 className="mb-3 text-[13px] font-semibold text-ink">Editar la ficha</h2>
            <FormAccion accion={editarCliente.bind(null, cliente.cliente_id)} testid="form-editar-cliente" enviar="Guardar" mensajeOk="Ficha guardada.">
              <CamposCliente cliente={cliente} />
            </FormAccion>
          </div>

          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-ink">Vincular la carpeta de Drive pegando la URL</h2>
            <FormAccion accion={vincularCarpetaDriveForm.bind(null, cliente.cliente_id)} testid="form-carpeta-drive" enviar="Vincular carpeta" limpiarAlOk mensajeOk="Carpeta vinculada.">
              <Campo label="URL de la carpeta" ayuda="Se pega la dirección entera; el id se saca de ahí.">
                <input name="url" required className={CTRL} placeholder="https://drive.google.com/drive/folders/…" />
              </Campo>
            </FormAccion>
          </div>

          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-1 text-[13px] font-semibold text-ink">{cliente.activo ? 'Archivar el cliente' : 'Reactivar el cliente'}</h2>
            <p className="mb-2.5 text-[12px] text-muted">
              Archivar NO borra: el cliente sale de la operación diaria y su historia —obras, costos, documentos— queda
              entera. Se puede volver a activar cuando haga falta.
            </p>
            <BotonAccion
              accion={archivarCliente}
              args={[cliente.cliente_id, !cliente.activo]}
              testid="archivar-cliente"
              tono={cliente.activo ? 'peligro' : 'neutral'}
            >{cliente.activo ? 'Archivar' : 'Reactivar'}</BotonAccion>
          </div>
        </div>
      )}

      {vista === 'contactos' && (
        <div className="space-y-4">
          {losContactos.length === 0 ? (
            <Callout tono="info">Este cliente no tiene contactos cargados. Se agregan con el formulario de abajo.</Callout>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table data-testid="tabla-contactos" className="w-full min-w-[620px] text-left">
                <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-3 py-2.5 font-medium">Rol</th>
                  <th className="px-3 py-2.5 font-medium">Email</th><th className="px-3 py-2.5 font-medium">Teléfono</th>
                  <th className="px-3 py-2.5 text-right font-medium"></th>
                </tr></thead>
                <tbody>
                  {losContactos.map((c) => (
                    <tr key={c.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2.5 text-[13px] text-ink">{c.nombre}</td>
                      <td className="px-3 py-2.5 text-[12px] text-muted">{c.rol ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[12px] text-muted">{c.email ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted">{c.telefono ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <BotonAccion accion={borrarContacto} args={[c.id]} testid="borrar-contacto" tono="peligro">Borrar</BotonAccion>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <details className="rounded-xl border border-line bg-white" data-testid="alta-contacto">
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Agregar un contacto</summary>
            <div className="border-t border-line p-4">
              <FormAccion accion={crearContacto.bind(null, cliente.cliente_id)} testid="form-contacto" enviar="Agregar" limpiarAlOk mensajeOk="Contacto agregado.">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Campo label="Nombre" ancho="col-span-2"><input name="nombre" required minLength={2} maxLength={120} className={CTRL} /></Campo>
                  <Campo label="Rol" ancho="col-span-2"><input name="rol" maxLength={120} className={CTRL} placeholder="jefe de compras" /></Campo>
                  <Campo label="Email" ancho="col-span-2"><input type="email" name="email" maxLength={160} className={CTRL} /></Campo>
                  <Campo label="Teléfono" ancho="col-span-2"><input name="telefono" maxLength={60} className={CTRL} /></Campo>
                  <Campo label="Notas" ancho="col-span-2 sm:col-span-4"><input name="notas" maxLength={400} className={CTRL} /></Campo>
                </div>
              </FormAccion>
            </div>
          </details>
        </div>
      )}

      {vista === 'documentos' && (
        <div className="space-y-3">
          {cliente.drive_carpeta_id ? (
            <a
              href={`https://drive.google.com/drive/folders/${cliente.drive_carpeta_id}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-slate-50"
            >Abrir la carpeta del cliente en Drive ↗</a>
          ) : (
            <Callout tono="warn">
              Este cliente no tiene declarada su carpeta de Drive, así que no hay por dónde entrar. Se vincula en la
              solapa <strong>Información</strong>. No se adivina por parecido de nombre.
            </Callout>
          )}

          {losDocs.length === 0 ? (
            <Callout tono="info">
              Todavía no hay ningún archivo vinculado. Se puede pegar la URL de un archivo suelto de Drive acá abajo:
              el archivo <strong>sigue viviendo en Drive</strong> y acá queda el vínculo, nunca una copia.
            </Callout>
          ) : (
            <>
              <p className="text-[12px] text-faint">
                {losDocs.length} archivo(s). Los archivos <strong>viven en Drive</strong>: acá está el vínculo, nunca una copia.
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {losDocs.slice(0, 60).map((d) => (
                  <li key={d.drive_file_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noreferrer" className="min-w-0">
                      <span className="block truncate text-[13px] text-ink hover:underline">{d.name ?? d.drive_file_id}</span>
                      {/* El nombre puede faltar: el índice de Drive se rehace cada 4 horas y un
                          archivo puede salir de él sin que el vínculo deje de valer. */}
                      <span className="block truncate text-[11px] text-faint">
                        {d.path ?? (d.name ? '' : 'sin metadatos en el índice de Drive')}
                      </span>
                    </a>
                    <span className="shrink-0 text-[11px] tabular-nums text-faint">
                      {d.origen === 'manual' ? 'vinculado a mano' : fechaHora(d.modified_time)}
                    </span>
                  </li>
                ))}
              </ul>
              {losDocs.length > 60 && (
                <p className="text-[12px] text-faint">
                  Se muestran los 60 más recientes de {losDocs.length}. El resto está en la carpeta de Drive.
                </p>
              )}
            </>
          )}

          <details className="rounded-xl border border-line bg-white" data-testid="alta-documento">
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Vincular un documento de Drive</summary>
            <div className="border-t border-line p-4">
              <FormAccion accion={vincularDocumentoForm.bind(null, cliente.cliente_id)} testid="form-documento" enviar="Vincular" limpiarAlOk mensajeOk="Documento vinculado.">
                <div className="grid grid-cols-2 gap-2.5">
                  <Campo label="URL del archivo en Drive" ancho="col-span-2" ayuda="La dirección entera; el id se saca de ahí.">
                    <input name="url" required className={CTRL} placeholder="https://drive.google.com/file/d/…/view" />
                  </Campo>
                  <Campo label="Para qué sirve" ancho="col-span-2" ayuda="Opcional: contrato, pliego, acta…">
                    <input name="rol" maxLength={60} className={CTRL} />
                  </Campo>
                </div>
              </FormAccion>
            </div>
          </details>
        </div>
      )}
    </PageShell>
  )
}
