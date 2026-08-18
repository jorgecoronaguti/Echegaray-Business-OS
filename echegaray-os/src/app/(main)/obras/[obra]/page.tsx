// EL WORKSPACE DE LA OBRA — seis solapas, y todo cuelga de `obra_id`.
//
// ═══ LAS SOLAPAS SON LAS DEFINITIVAS DEL MVP (18/08/2026) ═══
//
//     Resumen · Cronograma · Personal · Operación · Economía · Documentos
//
// Cambió respecto de las de ayer, y cada cambio es un pedido explícito del dueño:
//   · «Gantt» → «Cronograma». La solapa no es la herramienta que usa: es el trabajo que contiene.
//     Adentro, el Gantt y «Próximos trabajos» son dos vistas de LAS MISMAS actividades.
//   · «Planificación» dejó de ser solapa principal — *"No quiero una pestaña principal adicional
//     llamada Planificación. Integrarla dentro de Cronograma como otra vista"*. Planificar no es un
//     lugar distinto de donde vive el cronograma; es mirarlo con otra ventana de tiempo.
//   · «Operación» es nueva y reúne Pedidos/Compras/Herramientas/Movimientos — *"NO crear un módulo
//     principal separado por cada concepto"*. Contesta una sola pregunta: qué se pidió, qué se
//     compró y qué recursos se movieron para esta obra.
//
// No se agregan más solapas principales. Seis es el tope declarado.
//
// LAS URLES VIEJAS SIGUEN ANDANDO. `?vista=gantt` y `?vista=planificacion` estaban en links
// mandados por chat, en marcadores y en los tests: redirigen a `cronograma` en vez de caer en el
// default silencioso, que habría mandado a Resumen a alguien que pidió el cronograma.
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
  getActividades, getDependencias, getDocumentos, getObra, getPlanVsReal, getRestricciones,
  getUbicacion,
} from '@/features/obras/services/obrasService'
import { getAsignaciones, getPersonas, getRegistrosHH } from '@/features/obras/services/personalService'
import { getCertificados } from '@/features/obras/services/contratoService'
import {
  archivarActividad, archivarObra, crearActividad, crearImpedimento, editarActividad, editarObra,
  liberarImpedimento, marcarHito, registrarAvance, sellarBaseline,
} from '@/features/obras/services/actions'
import { asignarPersona, quitarAsignacion } from '@/features/obras/services/actionsPersonal'
import { borrarHH, imputarHH } from '@/features/obras/services/actionsHH'
import { borrarCertificado, crearCertificado } from '@/features/obras/services/actionsContrato'
import { ETAPAS, ETAPA_LABEL } from '@/features/obras/types'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { TabResumen } from '@/features/obras/components/TabResumen'
import { TabCronograma } from '@/features/obras/components/TabCronograma'
import { TabPersonal } from '@/features/obras/components/TabPersonal'
import { TabOperacion } from '@/features/obras/components/TabOperacion'
import { getOperacionObra, SUBS_OPERACION, type SubOperacion } from '@/features/obras/services/operacionService'
import { esAdministracion } from '@/features/auth/types/areas'
import { getPerfilActual } from '@/features/auth/services/authService'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { TabDocumentos } from '@/features/obras/components/TabDocumentos'
import { desvincularDocumento, vincularDocumento } from '@/features/obras/services/actionsDocumentos'
import { BotonAccion, FormAccion, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'personal', label: 'Personal' },
  { id: 'operacion', label: 'Operación' },
  { id: 'economia', label: 'Economía' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

/** Las solapas que existían antes y siguen llegando por link. Redirigen, no se pierden. */
const ALIAS: Record<string, Vista> = { gantt: 'cronograma', planificacion: 'cronograma' }

function resolverVista(raw: string | undefined): Vista {
  if (!raw) return 'resumen'
  const directa = VISTAS.find((v) => v.id === raw)
  return directa ? directa.id : (ALIAS[raw] ?? 'resumen')
}

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
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${k < i ? 'bg-surface-quiet text-muted' : k === i ? 'bg-accent font-medium text-white' : 'border border-line text-faint'}`}>
            {ETAPA_LABEL[e]}
          </span>
          {k < ETAPAS.length - 1 && <span className="text-faint">›</span>}
        </li>
      ))}
    </ol>
  )
}

export default async function ObraPage({
  params, searchParams,
}: {
  params: Promise<{ obra: string }>
  searchParams: Promise<{ vista?: string; sub?: string; semanas?: string; act?: string }>
}) {
  const { obra: obraId } = await params
  const { vista: vistaRaw, sub, semanas, act } = await searchParams
  const vista = resolverVista(vistaRaw)

  const supabase = await createClient()
  const { data: obra, error } = await getObra(supabase, obraId)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas, y confundirlas ya costó caro (17/08/2026):
  // faltaba un `grant` y el módulo entero se veía como "página no encontrada" en vez de decir que no
  // tenía permiso. Buscar un defecto de permisos detrás de un 404 es buscarlo en el lugar equivocado.
  if (error) {
    return (
      <PageShell eyebrow={<Link href="/obras" className="hover:underline">← Obras</Link>} title="No pude leer la obra">
        <p className="rounded-lg border border-neg/25 bg-neg-soft px-3.5 py-2.5 text-[13px] text-neg">{error}</p>
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
  // existiendo, y por eso hay dentro de Cronograma una lista aparte para volver a traerlas.
  const acts = todas.filter((a) => !a.archivada)
  const archivadas = todas.filter((a) => a.archivada)
  const restr = restricciones ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  const yaSellada = todas.some((a) => a.sellada_en != null)

  // Cada solapa pide SÓLO lo suyo. Traerlo todo en cada visita costaría seis consultas para mostrar
  // una: la ficha se abre muchas veces por día desde el teléfono, en obra y con mala señal.
  // Las precedencias sólo las dibuja el Gantt: traerlas en las otras cinco solapas es una consulta
  // por visita para nadie.
  const dependencias = vista === 'cronograma' ? (await getDependencias(supabase, obraId)).data ?? [] : []
  const necesitaPersonas = vista === 'cronograma' || vista === 'personal'
  const personas = necesitaPersonas ? (await getPersonas(supabase)).data ?? [] : []
  const ubicacion = vista === 'resumen' ? await getUbicacion(supabase, obraId) : null
  const asignaciones = vista === 'personal' ? (await getAsignaciones(supabase, obraId)).data ?? [] : []
  const registros = vista === 'personal' ? (await getRegistrosHH(supabase, obraId)).data ?? [] : []
  const certificados = vista === 'economia' ? (await getCertificados(supabase, obraId)).data ?? [] : []
  const documentos = vista === 'documentos' ? (await getDocumentos(supabase, obraId)).data ?? [] : []
  // Operación trae sus cuatro listas de una sola vez: las cuatro se atan a la obra por el MISMO
  // puente (`obra_alias`), así que resolverlo cuatro veces sería resolverlo cuatro veces mal.
  const operacion = vista === 'operacion' ? (await getOperacionObra(supabase, obraId)).data : null
  const subOp: SubOperacion = SUBS_OPERACION.find((x) => x === sub) ?? 'pedidos'

  // ═══ EL CONTEXTO: DÓNDE ESTOY, DE QUIÉN ES ═══
  // El dueño lo dibujó así: «← Obras», el nombre de la obra, y debajo el cliente. El cliente es un
  // link cuando existe en el eje canónico; cuando la obra sólo tiene el nombre del cliente escrito
  // a mano, se muestra el texto y se dice que falta vincularlo — sin inventar la ficha.
  const eyebrow = <Link href="/obras" className="hover:underline">← Obras</Link>
  // ARCHIVADA SE DICE EN EL ENCABEZADO. Es la única señal de que esta ficha se abrió por su URL y no
  // desde el portafolio —porque del portafolio ya no cuelga—, y sin ella alguien podría cargar HH o
  // avance sobre una obra archivada sin enterarse de que lo está.
  const archivada = obra.estado === 'cerrada'
  const deQuien = obra.cliente_slug ? (
    <Link href={`/clientes/${obra.cliente_slug}`} className="text-ink hover:underline">{obra.cliente_nombre}</Link>
  ) : obra.cliente_texto ? (
    <>{obra.cliente_texto} <span className="text-faint">· sin ficha de cliente vinculada</span></>
  ) : null
  const subtitulo = archivada ? (
    <span data-testid="obra-archivada">{deQuien}{deQuien ? ' · ' : ''}<span className="text-faint">archivada</span></span>
  ) : (deQuien ?? undefined)

  return (
    <PageShell eyebrow={eyebrow} title={obra.nombre} subtitle={subtitulo} right={<CicloDeVida etapa={obra.etapa} />}>
      {/* Las solapas se desplazan en vez de empujar la página: seis no entran en los 390px de un
          teléfono. `overscroll-x-contain` evita que el gesto arrastre la página de atrás. */}
      <nav className="mb-5 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line" data-testid="tabs-obra">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/obras/${obraId}?vista=${v.id}`}
            data-testid={`tab-${v.id}`}
            aria-current={vista === v.id ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] transition-colors ${vista === v.id ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'resumen' && (
        <TabResumen
          obra={obra}
          plan={plan}
          abiertas={abiertas}
          obraId={obraId}
          editar={
            <details className="rounded-lg border border-line bg-surface" data-testid="editar-obra">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Editar la obra</summary>
              <div className="border-t border-line p-4">
                <FormAccion accion={editarObra.bind(null, obraId)} testid="form-editar-obra" enviar="Guardar la obra" mensajeOk="Obra guardada.">
                  <CamposObra obra={obra} ubicacion={ubicacion} />
                </FormAccion>
              </div>
            </details>
          }
          archivar={
            // Mismo bloque que el de la ficha del cliente, a propósito: archivar es UNA idea en todo
            // el OS —sale de la vista, no de la historia— y aprenderla dos veces con dos formas
            // distintas es aprenderla mal.
            <section>
              <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-faint">
                {archivada ? 'Reactivar la obra' : 'Archivar la obra'}
              </h2>
              <p className="mb-2.5 text-[13px] text-muted">
                {archivada
                  ? 'Vuelve al portafolio y a la ficha del cliente, con su cronograma, sus HH y sus costos intactos.'
                  : 'Sale del portafolio y de la ficha del cliente. No se borra nada: el cronograma, las HH y los costos quedan enteros, esta página sigue abriendo por su dirección, y se reactiva cuando haga falta.'}
              </p>
              <BotonAccion
                accion={archivarObra}
                args={[obraId, !archivada]}
                testid="archivar-obra"
                tono={archivada ? 'neutral' : 'peligro'}
              >{archivada ? 'Reactivar' : 'Archivar'}</BotonAccion>
            </section>
          }
        />
      )}

      {vista === 'cronograma' && (
        <TabCronograma
          sub={sub === 'proximos' ? 'proximos' : 'gantt'}
          semanas={semanas === '1' || semanas === '6' ? semanas : '2'}
          actividadAbierta={act ?? null}
          actividades={acts}
          archivadas={archivadas}
          restricciones={restr}
          dependencias={dependencias}
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
          restaurarActividad={archivarActividad.bind(null, obraId)}
          crearImpedimento={crearImpedimento.bind(null, obraId)}
          liberarImpedimento={liberarImpedimento.bind(null, obraId)}
        />
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
          imputar={imputarHH.bind(null, obraId)}
          borrarHoras={borrarHH.bind(null, obraId)}
        />
      )}

      {vista === 'operacion' && operacion && (
        <TabOperacion
          sub={subOp}
          obraId={obraId}
          pedidos={operacion.pedidos}
          compras={operacion.compras}
          herramientas={operacion.herramientas}
          movimientos={operacion.movimientos}
        />
      )}

      {vista === 'economia' && (
        <TabEconomia
          plan={plan}
          certificados={certificados}
          crearCert={crearCertificado.bind(null, obraId)}
          borrarCert={borrarCertificado.bind(null, obraId)}
          veComercial={esAdministracion((await getPerfilActual(supabase)).data?.rol ?? null)}
        />
      )}

      {vista === 'documentos' && (
        <TabDocumentos
          documentos={documentos}
          carpetaDriveId={obra.drive_carpeta_id}
          vincular={vincularDocumento.bind(null, obraId)}
          desvincular={desvincularDocumento.bind(null, obraId)}
        />
      )}
    </PageShell>
  )
}
