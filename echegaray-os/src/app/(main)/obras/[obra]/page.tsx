// 01 OBRAS · LA OBRA — resumen, ciclo de vida, Gantt, planificación y documentos.
//
// Las solapas van por query string y no por estado de cliente: cada vista es una URL que se puede
// compartir y que el servidor renderiza con su dato, sin JavaScript de por medio. El único
// componente de cliente de toda la pantalla es el Gantt.
//
// FRONTERA: acá se CONSUME el costo de Compras (vía `obra_panel`) y los archivos de Drive (vía
// `drive_index`). No se copia ni se edita ninguno de los dos: son de otros dominios.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActividades, getDocumentos, getObra, getRestricciones, lookahead } from '@/features/obras/services/obrasService'
import { ETAPAS, ETAPA_LABEL, TIPO_RESTRICCION_LABEL, type Restriccion } from '@/features/obras/types'
import { Gantt } from '@/features/obras/components/Gantt'
import { PageShell, Callout } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'planificacion', label: 'Planificación' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

const plata = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR'))
const fecha = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }) : '—'

/** La línea de ciclo de vida. Es el estado de la obra, y ese estado gobierna qué habilita el módulo:
 *  una obra en «previo» sin línea base sellada no debería pasar a ejecución. */
function CicloDeVida({ etapa }: { etapa: string }) {
  const i = ETAPAS.indexOf(etapa as (typeof ETAPAS)[number])
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {ETAPAS.map((e, k) => (
        <li key={e} className="flex items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${k < i ? 'bg-slate-100 text-muted' : k === i ? 'bg-slate-900 font-medium text-white' : 'border border-line text-faint'}`}>
            {ETAPA_LABEL[e]}
          </span>
          {k < ETAPAS.length - 1 && <span className="text-faint">›</span>}
        </li>
      ))}
    </ol>
  )
}

function Dato({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{k}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{v}</p>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  )
}

function FilaRestriccion({ r }: { r: Restriccion }) {
  const vencida = r.estado !== 'liberada' && r.fecha_compromiso && r.fecha_compromiso < new Date().toISOString().slice(0, 10)
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="px-3 py-2 text-[12px] text-muted">{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}</td>
      <td className="px-3 py-2 text-[12px] text-ink">{r.descripcion}</td>
      <td className="px-3 py-2 text-[12px] text-muted">{r.responsable ?? <span className="text-amber-700">sin responsable</span>}</td>
      <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${vencida ? 'font-semibold text-amber-700' : 'text-muted'}`}>
        {r.fecha_compromiso ? fecha(r.fecha_compromiso) : <span className="text-amber-700">sin fecha</span>}
      </td>
      <td className="px-3 py-2 text-right text-[11px] uppercase text-faint">{r.estado}</td>
    </tr>
  )
}

export default async function ObraPage({
  params, searchParams,
}: {
  params: Promise<{ obra: string }>
  searchParams: Promise<{ vista?: string }>
}) {
  const { obra: obraId } = await params
  const { vista: vistaRaw } = await searchParams
  const vista: Vista = (VISTAS.find((v) => v.id === vistaRaw)?.id ?? 'resumen') as Vista

  const supabase = await createClient()
  const { data: obra, error } = await getObra(supabase, obraId)
  if (error || !obra) notFound()

  const [{ data: actividades }, { data: restricciones }, { data: documentos }] = await Promise.all([
    getActividades(supabase, obraId),
    getRestricciones(supabase, obraId),
    getDocumentos(supabase, obraId),
  ])
  const acts = actividades ?? []
  const restr = restricciones ?? []
  const docs = documentos ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  const conBaseline = acts.filter((a) => a.inicio_base).length

  return (
    <PageShell
      eyebrow={<Link href="/obras" className="hover:underline">01 · Obras</Link>}
      title={obra.nombre}
      subtitle={obra.cliente_texto ?? undefined}
      maxWidth="max-w-7xl"
      right={<CicloDeVida etapa={obra.etapa} />}
    >
      <nav className="mb-5 flex gap-1 border-b border-line">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/obras/${obraId}?vista=${v.id}`}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] ${vista === v.id ? 'border-slate-900 font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'resumen' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato k="Avance físico" v={obra.avance_pct == null ? 'sin cargar' : `${obra.avance_pct}%`} sub={`${obra.n_actividades} actividades`} />
            <Dato k="Costo real" v={plata(obra.costo_real)} sub={`${obra.n_comprobantes ?? 0} comprobantes`} />
            <Dato k="Contratado" v={plata(obra.monto_contratado)} sub={obra.monto_contratado == null ? 'no cargado' : undefined} />
            <Dato k="Restricciones" v={abiertas.length ? String(abiertas.length) : '—'} sub={obra.restricciones_vencidas ? `${obra.restricciones_vencidas} vencidas` : 'abiertas'} />
          </div>

          {/* EL DESVÍO DE PLAZO NO SE PUBLICA SI NO HAY CONTRA QUÉ MEDIRLO. Un cero sin línea base
              sellada es una mentira prolija: diría "vamos en fecha" cuando nadie aprobó una fecha. */}
          {conBaseline === 0 && acts.length > 0 && (
            <Callout tono="info">
              Esta obra no tiene <strong>línea base sellada</strong>: se puede ver el plan y el avance, pero todavía
              no hay desvío de plazo que medir. La línea base se congela una vez, cuando dirección aprueba el
              cronograma — no la escribe el sincronizador.
            </Callout>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-white p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Plazo</h2>
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between"><dt className="text-faint">Inicio previsto</dt><dd className="tabular-nums text-ink">{fecha(obra.fecha_inicio_plan)}</dd></div>
                <div className="flex justify-between"><dt className="text-faint">Fin previsto</dt><dd className="tabular-nums text-ink">{fecha(obra.fecha_fin_plan)}</dd></div>
                <div className="flex justify-between"><dt className="text-faint">Inicio real</dt><dd className="tabular-nums text-ink">{fecha(obra.fecha_inicio_real)}</dd></div>
                <div className="flex justify-between"><dt className="text-faint">Jefe de obra</dt><dd className="text-ink">{obra.jefe_obra ?? '—'}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-line bg-white p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Restricciones abiertas</h2>
              {abiertas.length === 0
                ? <p className="text-[12px] text-faint">Ninguna cargada. En una obra en ejecución eso casi siempre significa que no se están registrando, no que no existan.</p>
                : <ul className="space-y-1 text-[12px]">
                    {abiertas.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex justify-between gap-3">
                        <span className="truncate text-ink">{r.descripcion}</span>
                        <span className="shrink-0 text-faint">{r.responsable ?? 'sin dueño'}</span>
                      </li>
                    ))}
                  </ul>}
            </div>
          </div>
        </div>
      )}

      {vista === 'gantt' && <Gantt actividades={acts} restricciones={restr} />}

      {vista === 'planificacion' && (
        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Lookahead · próximas 6 semanas</h2>
            {(() => {
              const proximas = lookahead(acts, 6)
              if (!proximas.length) return <p className="text-[12px] text-faint">No hay actividades con fecha en las próximas seis semanas.</p>
              return (
                <div className="overflow-hidden rounded-xl border border-line bg-white">
                  <table className="w-full text-left">
                    <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                      <th className="px-3 py-2 font-medium">Actividad</th><th className="px-3 py-2 font-medium">Cuadrilla</th>
                      <th className="px-3 py-2 text-right font-medium">Inicio</th><th className="px-3 py-2 text-right font-medium">Fin</th>
                      <th className="px-3 py-2 text-right font-medium">Avance</th>
                    </tr></thead>
                    <tbody>
                      {proximas.map((a) => (
                        <tr key={a.id} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-2 text-[12px] text-ink">{a.nombre}</td>
                          <td className="px-3 py-2 text-[12px] text-muted">{a.cuadrilla ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{fecha(a.inicio_plan)}</td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{fecha(a.fin_plan)}</td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{a.pct == null ? '—' : `${a.pct}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>

          <div>
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Restricciones</h2>
            {restr.length === 0 ? (
              <Callout tono="info">
                Todavía no hay restricciones cargadas. Una restricción sin <strong>responsable con nombre</strong> y
                sin <strong>fecha comprometida</strong> no es gestión: es una queja anotada. Las dos columnas existen
                desde el día uno para que no se pueda cargar de otra forma.
              </Callout>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                <table className="w-full text-left">
                  <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium">Qué frena</th>
                    <th className="px-3 py-2 font-medium">Responsable</th><th className="px-3 py-2 text-right font-medium">Compromiso</th>
                    <th className="px-3 py-2 text-right font-medium">Estado</th>
                  </tr></thead>
                  <tbody>{restr.map((r) => <FilaRestriccion key={r.id} r={r} />)}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {vista === 'documentos' && (
        <div className="space-y-3">
          {obra.drive_carpeta_id && (
            <a
              href={`https://drive.google.com/drive/folders/${obra.drive_carpeta_id}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-slate-50"
            >Abrir la carpeta de la obra en Drive ↗</a>
          )}
          {docs.length === 0 ? (
            <Callout tono="info">
              No hay documentos vinculados. Los archivos <strong>siguen viviendo en Drive</strong>: acá se guarda el
              vínculo y el contexto, nunca una copia.
            </Callout>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {docs.map((d) => (
                <li key={d.drive_file_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noreferrer" className="min-w-0">
                    <span className="block truncate text-[13px] text-ink hover:underline">{d.name ?? d.drive_file_id}</span>
                    {d.path && <span className="block truncate text-[11px] text-faint">{d.path}</span>}
                  </a>
                  {d.rol && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">{d.rol}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PageShell>
  )
}
