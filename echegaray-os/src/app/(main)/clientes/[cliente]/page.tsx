// 01 OBRAS · EL CLIENTE — información, contactos, documentos y sus obras.
//
// Mismo patrón que la ficha de obra: las solapas van por query string, cada vista es una URL que se
// puede compartir, y el servidor la renderiza con su dato sin JavaScript de por medio.
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
import { ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'
import { PageShell, Callout } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'obras', label: 'Obras' },
  { id: 'informacion', label: 'Información' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

const plata = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR'))
const fecha = (iso: string | null) =>
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
  searchParams: Promise<{ vista?: string }>
}) {
  const { cliente: slug } = await params
  const { vista: vistaRaw } = await searchParams
  const vista: Vista = (VISTAS.find((v) => v.id === vistaRaw)?.id ?? 'obras') as Vista

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
  const lasObras = obras ?? []
  const losContactos = contactos ?? []
  const losDocs = documentos ?? []

  return (
    <PageShell
      eyebrow={<Link href="/clientes" className="hover:underline">01 · Obras · Clientes</Link>}
      title={cliente.nombre}
      subtitle={cliente.cuit ?? undefined}
      maxWidth="max-w-7xl"
    >
      {/* Las solapas se desplazan en vez de empujar la página: cuatro de ellas miden 407px y
          la pantalla del teléfono tiene 390. */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/clientes/${slug}?vista=${v.id}`}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] ${vista === v.id ? 'border-slate-900 font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'obras' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato k="Obras" v={String(cliente.n_obras)} sub={`${cliente.n_obras_activas} en curso`} />
            <Dato k="Contratado" v={plata(cliente.contratado)} sub={cliente.contratado == null ? 'no cargado' : 'suma de sus obras'} />
            <Dato k="Costo real" v={plata(cliente.costo_real)} sub="comprobantes imputados" />
            <Dato k="Restricciones" v={cliente.restricciones_abiertas ? String(cliente.restricciones_abiertas) : '—'} sub="abiertas" />
          </div>

          {lasObras.length === 0 ? (
            <Callout tono="info">Este cliente no tiene ninguna obra en el eje canónico.</Callout>
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
        </div>
      )}

      {vista === 'informacion' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-4">
            <dl className="space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-4"><dt className="text-faint">Razón social</dt><dd className="text-right text-ink">{cliente.nombre}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">CUIT</dt><dd className="tabular-nums text-ink">{cliente.cuit ?? 'sin cargar'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">Identificador</dt><dd className="text-ink">{cliente.slug ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">Carpeta en Drive</dt><dd className="text-ink">{cliente.drive_carpeta_id ? 'declarada' : 'sin declarar'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-faint">Estado</dt><dd className="text-ink">{cliente.activo ? 'activo' : 'inactivo'}</dd></div>
            </dl>
            {cliente.notas && <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">{cliente.notas}</p>}
          </div>
          {/* No se simula un alta que no existe: la ficha se lee, todavía no se edita desde acá. */}
          <Callout tono="warn">
            <strong>Esta ficha es de sólo lectura</strong>: todavía no hay pantalla para editar el CUIT, las notas ni la
            carpeta de Drive. Lo que falta —el CUIT de los cinco clientes, por ejemplo— no está vacío porque el cliente
            no lo tenga: está vacío porque nadie lo cargó todavía.
          </Callout>
        </div>
      )}

      {vista === 'contactos' && (
        losContactos.length === 0 ? (
          <Callout tono="warn">
            <strong>Todavía no se puede cargar un contacto desde acá</strong>: la vista es de sólo lectura y la tabla
            está vacía. No leas el vacío como &laquo;este cliente no tiene con quién hablar&raquo;.
          </Callout>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <table className="w-full text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-3 py-2.5 font-medium">Rol</th>
                <th className="px-3 py-2.5 font-medium">Email</th><th className="px-3 py-2.5 font-medium">Teléfono</th>
              </tr></thead>
              <tbody>
                {losContactos.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-[13px] text-ink">{c.nombre}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted">{c.rol ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted">{c.email ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted">{c.telefono ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {vista === 'documentos' && (
        <div className="space-y-3">
          {cliente.drive_carpeta_id && (
            <a
              href={`https://drive.google.com/drive/folders/${cliente.drive_carpeta_id}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-slate-50"
            >Abrir la carpeta del cliente en Drive ↗</a>
          )}
          {losDocs.length === 0 ? (
            <Callout tono="warn">
              {cliente.drive_carpeta_id
                ? 'La carpeta está declarada pero todavía no se indexó ningún archivo suyo.'
                : 'Este cliente no tiene declarada su carpeta de Drive, así que no hay ni por dónde entrar. No se adivina por parecido de nombre.'}
            </Callout>
          ) : (
            <>
              <p className="text-[12px] text-faint">
                {losDocs.length} archivo(s) de la carpeta del cliente. Los archivos <strong>viven en Drive</strong>: acá
                está el vínculo, nunca una copia.
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {losDocs.slice(0, 60).map((d) => (
                  <li key={d.drive_file_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noreferrer" className="min-w-0">
                      <span className="block truncate text-[13px] text-ink hover:underline">{d.name ?? d.drive_file_id}</span>
                      {d.path && <span className="block truncate text-[11px] text-faint">{d.path}</span>}
                    </a>
                    <span className="shrink-0 text-[11px] tabular-nums text-faint">{fecha(d.modified_time)}</span>
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
        </div>
      )}
    </PageShell>
  )
}
