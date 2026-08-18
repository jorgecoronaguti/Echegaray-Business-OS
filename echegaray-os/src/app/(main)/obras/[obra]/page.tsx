// 01 OBRAS · LA OBRA — resumen, cronograma, personal, economía, planificación y documentos.
//
// Las solapas van por query string y no por estado de cliente: cada vista es una URL que se puede
// compartir y que el servidor renderiza con su dato. Los únicos componentes de cliente de toda la
// pantalla son el Gantt y los formularios, y los formularios lo son sólo para poder mostrar lo que
// contestó el servidor.
//
// TODA ESCRITURA PASA POR UNA SERVER ACTION ATADA A ESTA OBRA. Las acciones se atan acá con `bind`
// —`editarObra.bind(null, obraId)`— y el id nunca viaja en un campo del formulario: un id editable
// desde el navegador dejaría escribir sobre la obra de al lado.
//
// FRONTERA: acá se CONSUME el costo de Compras (vía `obra_panel`), las horas de productividad (vía
// `registros_hh`), el presupuesto (vía `presupuestos`) y los archivos de Drive (vía `drive_index`).
// Ninguno de los cuatro se edita desde este módulo.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getActividades, getDocumentos, getObra, getPlanVsReal, getRestricciones, getUbicacion, lookahead,
} from '@/features/obras/services/obrasService'
import { getAsignaciones, getPersonas, getRegistrosHH } from '@/features/obras/services/personalService'
import { getCertificados } from '@/features/obras/services/contratoService'
import {
  archivarActividad, crearActividad, crearImpedimento, editarActividad, editarObra,
  liberarImpedimento, marcarHito, registrarAvance, sellarBaseline,
} from '@/features/obras/services/actions'
import { asignarPersona, quitarAsignacion } from '@/features/obras/services/actionsPersonal'
import { borrarCertificado, crearCertificado } from '@/features/obras/services/actionsContrato'
import { ETAPAS, ETAPA_LABEL } from '@/features/obras/types'
import { Gantt } from '@/features/obras/components/Gantt'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { PlanVsRealResumen } from '@/features/obras/components/PlanVsRealResumen'
import { TabPersonal } from '@/features/obras/components/TabPersonal'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { TabPlanificacion } from '@/features/obras/components/TabPlanificacion'
import { fecha, plata } from '@/features/obras/components/formato'
import { BotonAccion, Callout, FormAccion, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'personal', label: 'Personal' },
  { id: 'economia', label: 'Economía' },
  { id: 'planificacion', label: 'Planificación' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

/** La línea de ciclo de vida. Es el estado de la obra, y ese estado gobierna qué habilita el módulo:
 *  una obra en «previo» sin línea base sellada no debería pasar a ejecución. */
function CicloDeVida({ etapa }: { etapa: string | null }) {
  // Ninguna etapa resaltada cuando nadie la declaró: se ven las cinco en gris y se entiende que
  // falta definirla, en vez de afirmar uno de los cinco estados sin que nadie lo haya dicho.
  const i = etapa ? ETAPAS.indexOf(etapa as (typeof ETAPAS)[number]) : -1
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
      {sub && <p className="text-[11px] leading-snug text-faint">{sub}</p>}
    </div>
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
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas, y confundirlas ya costó caro (17/08/2026):
  // faltaba un `grant` y el módulo entero se veía como "página no encontrada" en vez de decir que no
  // tenía permiso. Buscar un defecto de permisos detrás de un 404 es buscarlo en el lugar equivocado.
  if (error) {
    return (
      <PageShell eyebrow={<Link href="/obras" className="hover:underline">01 · Obras</Link>} title="No pude leer la obra">
        <Callout tono="neg">{error}</Callout>
      </PageShell>
    )
  }
  if (!obra) notFound()

  const [{ data: actividades }, { data: restricciones }, { data: plan }] = await Promise.all([
    getActividades(supabase, obraId),
    getRestricciones(supabase, obraId),
    getPlanVsReal(supabase, obraId),
  ])
  const todas = actividades ?? []
  // LAS ARCHIVADAS NO ENTRAN AL CRONOGRAMA NI A NINGUNA LISTA: para eso se archivan. Siguen
  // existiendo, y por eso hay abajo una lista aparte para volver a traerlas.
  const acts = todas.filter((a) => !a.archivada)
  const archivadas = todas.filter((a) => a.archivada)
  const restr = restricciones ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  const yaSellada = todas.some((a) => a.sellada_en != null)

  // Cada solapa pide SÓLO lo suyo. Traerlo todo en cada visita costaría seis consultas para mostrar
  // una: la ficha se abre muchas veces por día desde el teléfono, en obra y con mala señal.
  const necesitaPersonas = vista === 'gantt' || vista === 'personal'
  const personas = necesitaPersonas ? (await getPersonas(supabase)).data ?? [] : []
  const ubicacion = vista === 'resumen' ? await getUbicacion(supabase, obraId) : null
  const asignaciones = vista === 'personal' ? (await getAsignaciones(supabase, obraId)).data ?? [] : []
  const registros = vista === 'personal' ? (await getRegistrosHH(supabase, obraId)).data ?? [] : []
  const certificados = vista === 'economia' ? (await getCertificados(supabase, obraId)).data ?? [] : []
  const documentos = vista === 'documentos' ? (await getDocumentos(supabase, obraId)).data ?? [] : []

  const eyebrow = obra.cliente_slug ? (
    <>
      <Link href="/obras" className="hover:underline">01 · Obras</Link>
      <span className="text-faint"> · </span>
      <Link href={`/clientes/${obra.cliente_slug}`} className="hover:underline">{obra.cliente_nombre}</Link>
    </>
  ) : (
    <Link href="/obras" className="hover:underline">01 · Obras</Link>
  )

  return (
    <PageShell
      eyebrow={eyebrow}
      title={obra.nombre}
      subtitle={obra.cliente_slug ? undefined : `${obra.cliente_texto ?? 'sin cliente'} · sin cliente declarado en el eje canónico`}
      maxWidth="max-w-7xl"
      right={<CicloDeVida etapa={obra.etapa} />}
    >
      {/* Las solapas se desplazan en vez de empujar la página: seis de ellas no entran en los 390px
          de un teléfono. */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/obras/${obraId}?vista=${v.id}`}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] ${vista === v.id ? 'border-slate-900 font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'resumen' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* La cobertura va PEGADA al porcentaje: es el mismo número que publica el chat, y lo
                que lo hace comparable es decir sobre cuántas actividades se tomó. */}
            <Dato
              k="Avance físico"
              v={obra.avance_pct == null ? 'sin cargar' : `${obra.avance_pct}%`}
              sub={obra.avance_pct == null
                ? `${obra.n_actividades} actividades, ninguna con fecha`
                : `${obra.n_actividades_medidas} de ${obra.n_actividades} actividades` +
                  (obra.n_actividades_sin_planificar ? ` · ${obra.n_actividades_sin_planificar} sin fecha` : '')}
            />
            <Dato k="Costo real" v={plata(obra.costo_real)} sub={`${obra.n_comprobantes ?? 0} comprobantes`} />
            <Dato k="Contratado" v={plata(obra.monto_contratado)} sub={obra.monto_contratado == null ? 'no cargado' : undefined} />
            <Dato k="Impedimentos" v={abiertas.length ? String(abiertas.length) : '—'} sub={obra.restricciones_vencidas ? `${obra.restricciones_vencidas} vencidos` : 'sin resolver'} />
          </div>

          {plan && <PlanVsRealResumen plan={plan} obraId={obraId} />}

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
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Impedimentos sin resolver</h2>
              {abiertas.length === 0
                ? <p className="text-[12px] text-faint">Ninguno anotado. En una obra en ejecución, ese vacío casi nunca significa que no haya: se anotan en Planificación.</p>
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

          <details className="rounded-xl border border-line bg-white" data-testid="editar-obra">
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Editar la obra</summary>
            <div className="border-t border-line p-4">
              <FormAccion accion={editarObra.bind(null, obraId)} testid="form-editar-obra" enviar="Guardar la obra" mensajeOk="Obra guardada.">
                <CamposObra obra={obra} ubicacion={ubicacion} />
              </FormAccion>
            </div>
          </details>
        </div>
      )}

      {vista === 'gantt' && (
        <div className="space-y-4">
          <Gantt
            actividades={acts}
            restricciones={restr}
            personas={personas}
            yaSellada={yaSellada}
            acciones={{
              crear: crearActividad.bind(null, obraId),
              editar: editarActividad.bind(null, obraId),
              avance: registrarAvance.bind(null, obraId),
              archivar: archivarActividad.bind(null, obraId),
              hito: marcarHito.bind(null, obraId),
              sellar: sellarBaseline.bind(null, obraId),
            }}
          />
          {archivadas.length > 0 && (
            <details className="rounded-xl border border-line bg-white" data-testid="actividades-archivadas">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted">
                {archivadas.length} actividad(es) archivadas
              </summary>
              <ul className="divide-y divide-line/60 border-t border-line">
                {archivadas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate text-[12px] text-muted">{a.nombre}</span>
                    <BotonAccion accion={archivarActividad.bind(null, obraId)} args={[a.id, false]} testid="restaurar-actividad">
                      Restaurar
                    </BotonAccion>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {vista === 'personal' && (
        <TabPersonal
          plan={plan}
          asignaciones={asignaciones}
          personas={personas}
          actividades={acts}
          registros={registros}
          asignar={asignarPersona.bind(null, obraId)}
          quitar={quitarAsignacion.bind(null, obraId)}
        />
      )}

      {vista === 'economia' && (
        <TabEconomia
          plan={plan}
          certificados={certificados}
          crearCert={crearCertificado.bind(null, obraId)}
          borrarCert={borrarCertificado.bind(null, obraId)}
        />
      )}

      {vista === 'planificacion' && (
        <TabPlanificacion
          proximas={lookahead(acts, 6)}
          impedimentos={restr}
          actividades={acts}
          crear={crearImpedimento.bind(null, obraId)}
          liberar={liberarImpedimento.bind(null, obraId)}
        />
      )}

      {vista === 'documentos' && (
        <div className="space-y-3">
          {obra.drive_carpeta_id ? (
            <a
              href={`https://drive.google.com/drive/folders/${obra.drive_carpeta_id}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-slate-50"
            >Abrir la carpeta de la obra en Drive ↗</a>
          ) : (
            <Callout tono="warn">
              Esta obra no tiene declarada su carpeta de Drive. Se carga en <strong>Resumen › Editar la obra</strong>.
            </Callout>
          )}
          {documentos.length === 0 ? (
            // NO SIMULAR UNA CAPACIDAD QUE NO EXISTE. Vincular un archivo suelto de Drive a la OBRA
            // todavia no tiene accion de servidor -- si la tiene el cliente --, y por eso aca no hay
            // formulario. La lista vacia no dice "esta obra no tiene documentos": dice que nadie los
            // vinculo.
            <Callout tono="warn">
              <strong>Todavia no se puede vincular un documento a la obra desde aca.</strong> Los archivos viven en
              Drive; lo que falta es el vinculo. Mientras tanto, el camino es la carpeta de la obra.
            </Callout>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {documentos.map((d) => (
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
