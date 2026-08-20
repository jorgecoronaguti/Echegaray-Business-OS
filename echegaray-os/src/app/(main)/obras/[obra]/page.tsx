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
import {
  getActividadHH, getAsignaciones, getCuadrillas, getPersonas, getRegistrosHH,
} from '@/features/obras/services/personalService'
import { getCertificados } from '@/features/obras/services/contratoService'
import {
  agregarDependencia, archivarActividad, archivarObra, crearActividad, crearImpedimento,
  editarActividad, editarImpedimento, editarObra, liberarImpedimento, marcarHito, quitarDependencia,
  registrarAvance,
  sellarBaseline,
} from '@/features/obras/services/actions'
import {
  asignarResponsableMasivo, cargarHHPlanMasivo, sellarBaselineMasivo,
} from '@/features/obras/services/actionsMasivas'
import {
  asignarPersona, cerrarAsignacion, quitarAsignacion,
} from '@/features/obras/services/actionsPersonal'
import {
  archivarRubro, crearRubro, moverActividadDeRubro, moverRubro, renombrarRubro,
} from '@/features/obras/services/actionsRubro'
import { agregarNota, borrarNota } from '@/features/obras/services/actionsNotas'
import {
  getCatalogoEquipos, getEquiposPorActividad, getNotas, getTrabajoPorActividad,
} from '@/features/obras/services/recursosService'
import { borrarHH, imputarHH, imputarHHMasivo } from '@/features/obras/services/actionsHH'
import { borrarCertificado, crearCertificado } from '@/features/obras/services/actionsContrato'
import { ETAPAS, ETAPA_LABEL, type Etapa } from '@/features/obras/types'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { TabResumen } from '@/features/obras/components/TabResumen'
import { TabCronograma } from '@/features/obras/components/TabCronograma'
import type { DatosDeActividad } from '@/features/obras/components/PanelActividad'
import { esSubVista } from '@/features/obras/services/subvistas'
import { TabEjecucion } from '@/features/obras/components/TabEjecucion'
import { getPartes } from '@/features/obras/services/ejecucionService'
import { getIntegrantesPorCuadrilla } from '@/features/obras/services/personalService'
import {
  asignarActividadAPedido, borrarParte, cambiarEstado, cambiarEstadoTarea, crearTarea,
  definirMedicion, medirEnLote, registrarEjecucion,
} from '@/features/obras/services/actionsEjecucion'
import { TabPersonal } from '@/features/obras/components/TabPersonal'
import { TabOperacion } from '@/features/obras/components/TabOperacion'
import { getOperacionObra, SUBS_OPERACION, type SubOperacion } from '@/features/obras/services/operacionService'
import { veEconomia } from '@/features/auth/types/areas'
import { getPerfilActual } from '@/features/auth/services/authService'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { TabDocumentos } from '@/features/obras/components/TabDocumentos'
import {
  asignarActividadADocumento, desvincularDocumento, soltarDocumentoDeActividad, vincularDocumento,
} from '@/features/obras/services/actionsDocumentos'
import { fecha as fmtFecha } from '@/features/obras/components/formato'
import { BotonAccion, FormAccion, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const VISTAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'cronograma', label: 'Planificación' },
  { id: 'ejecucion', label: 'Ejecución' },
  { id: 'personal', label: 'Personal' },
  { id: 'operacion', label: 'Operación' },
  { id: 'economia', label: 'Economía' },
  { id: 'documentos', label: 'Documentos' },
] as const
type Vista = (typeof VISTAS)[number]['id']

/** Las solapas que existían antes y siguen llegando por link. Redirigen, no se pierden. */
// PLANIFICACIÓN Y EJECUCIÓN SON DOS PREGUNTAS DISTINTAS: qué debería pasar y qué pasó de verdad.
// La solapa que se llamaba «Cronograma» era la primera y ahora lo dice; la segunda es nueva.
const ALIAS: Record<string, Vista> = {
  gantt: 'cronograma', planificacion: 'cronograma', cronograma: 'cronograma',
}

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
  // UNA SOLA LECTURA DEL PERFIL PARA TODA LA FICHA. El dato comercial ya no llega de la base a quien
  // no es Administración; esto decide qué CARTEL se dibuja, para no explicar una ausencia que no lo
  // es. Ver el comentario largo en `TabEconomia`.
  // COMERCIAL ES PRECIO, y el precio es de Dirección y Administración. El jefe de obra entra a
  // Administración desde el 19/08 y ve el COSTO de su obra —el presupuestado y el gastado—, pero no
  // cuánto se vendió: `veEconomia`, no `esAdministracion`.
  const veComercial = veEconomia((await getPerfilActual(supabase)).data?.rol ?? null)
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
  // LAS TAREAS NO SON FILAS DEL PLAN. Descomponen una actividad y viven DENTRO de su panel: en el
  // Gantt serían una fila más y en el promedio de avance pesarían doble contra una actividad que
  // nadie partió. Se separan una sola vez, acá, y no cinco veces en cada vista.
  const vivas = todas.filter((a) => !a.archivada)
  const acts = vivas.filter((a) => !a.actividad_padre_id)
  const archivadas = todas.filter((a) => a.archivada)
  const tareasPorActividad = new Map<string, typeof vivas>()
  for (const t of vivas) {
    if (!t.actividad_padre_id) continue
    const previas = tareasPorActividad.get(t.actividad_padre_id) ?? []
    previas.push(t)
    tareasPorActividad.set(t.actividad_padre_id, previas)
  }
  const restr = restricciones ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  const yaSellada = todas.some((a) => a.sellada_en != null)

  // Cada solapa pide SÓLO lo suyo. Traerlo todo en cada visita costaría seis consultas para mostrar
  // una: la ficha se abre muchas veces por día desde el teléfono, en obra y con mala señal.
  // Las precedencias sólo las dibuja el Gantt: traerlas en las otras cinco solapas es una consulta
  // por visita para nadie.
  const dependencias = vista === 'cronograma' ? (await getDependencias(supabase, obraId)).data ?? [] : []
  const necesitaPersonas = vista === 'cronograma' || vista === 'personal' || vista === 'ejecucion'
  const personas = necesitaPersonas ? (await getPersonas(supabase)).data ?? [] : []
  const ubicacion = vista === 'resumen' ? await getUbicacion(supabase, obraId) : null
  const asignaciones = vista === 'personal' ? (await getAsignaciones(supabase, obraId)).data ?? [] : []
  const registros = vista === 'personal' ? (await getRegistrosHH(supabase, obraId)).data ?? [] : []
  // Plan contra real por actividad y las cuadrillas: sólo los pide la solapa Personal.
  // Cronograma la usa para mostrar HH real en el panel de la actividad, con el MISMO cálculo.
  const actividadHH = vista === 'personal' || vista === 'cronograma'
    ? (await getActividadHH(supabase, obraId)).data ?? [] : []
  const necesitaCuadrillas = vista === 'personal' || vista === 'ejecucion'
  const cuadrillas = necesitaCuadrillas ? await getCuadrillas(supabase) : []
  const integrantes = vista === 'ejecucion' ? await getIntegrantesPorCuadrilla(supabase) : {}
  // Los partes también en Planificación: el panel de la actividad muestra su ejecución reciente, que
  // es lo que contesta «¿cómo viene?» sin salir del cronograma.
  const partes = vista === 'ejecucion' || vista === 'cronograma'
    ? (await getPartes(supabase, obraId)).data ?? [] : []
  const partesPorActividad = new Map<string, typeof partes>()
  for (const p of partes) {
    const previos = partesPorActividad.get(p.actividad_id) ?? []
    previos.push(p)
    partesPorActividad.set(p.actividad_id, previos)
  }
  const certificados = vista === 'economia' ? (await getCertificados(supabase, obraId)).data ?? [] : []
  // LOS PAPELES LOS PIDEN DOS SOLAPAS. Documentos muestra los de la obra; Planificación, los que
  // alguien colgó de una actividad. Es la MISMA lectura: dos consultas darían dos listas que un día
  // no coinciden.
  const documentos = vista === 'documentos' || vista === 'cronograma'
    ? (await getDocumentos(supabase, obraId)).data ?? [] : []

  // ═══ LO QUE MUESTRA EL PANEL DE UNA ACTIVIDAD ═══
  //
  // Cuatro lecturas por OBRA y no una por actividad: el panel cambia de actividad con cada clic, y
  // una consulta por clic haría el cronograma pegajoso justo en lo que más se usa. Se indexan una
  // vez, acá, y el Gantt sólo se las pasa al panel.
  const trabajo = vista === 'cronograma'
    ? await getTrabajoPorActividad(supabase, obraId)
    : { personas: new Map(), porFecha: new Map() }
  const equiposPorActividad = vista === 'cronograma'
    ? await getEquiposPorActividad(supabase, obraId) : new Map()
  const notasPorActividad = vista === 'cronograma'
    ? await getNotas(supabase, obraId) : new Map()
  // El catálogo de equipos es AYUDA de carga, no restricción: el campo acepta cualquier texto, y un
  // equipo alquilado por una semana no puede ser motivo para no anotarlo.
  const catalogoEquipos = vista === 'ejecucion' ? await getCatalogoEquipos(supabase) : []

  const docsPorActividad = new Map<string, typeof documentos>()
  for (const d of documentos) {
    if (!d.actividad_id) continue
    const previos = docsPorActividad.get(d.actividad_id) ?? []
    previos.push(d)
    docsPorActividad.set(d.actividad_id, previos)
  }

  const datosPorActividad = new Map<string, DatosDeActividad>()
  if (vista === 'cronograma') {
    for (const a of acts) {
      datosPorActividad.set(a.id, {
        partes: partesPorActividad.get(a.id) ?? [],
        tareas: tareasPorActividad.get(a.id) ?? [],
        notas: notasPorActividad.get(a.id) ?? [],
        documentos: docsPorActividad.get(a.id) ?? [],
        personasReales: trabajo.personas.get(a.id) ?? [],
        equipos: equiposPorActividad.get(a.id) ?? [],
        hhPorFecha: trabajo.porFecha.get(a.id) ?? new Map(),
      })
    }
  }
  // Operación trae sus cuatro listas de una sola vez: las cuatro se atan a la obra por el MISMO
  // puente (`obra_alias`), así que resolverlo cuatro veces sería resolverlo cuatro veces mal.
  // LAS CUATRO LISTAS Y LOS IMPEDIMENTOS NO COMPARTEN DESTINO (20/08/2026). Pedidos, compras,
  // herramientas y movimientos salen de una fuente externa por el puente de alias; si esa fuente
  // falla, las cuatro fallan juntas —y eso está bien, porque media pantalla llena se leería como
  // «esta obra no tiene movimientos»—. Los impedimentos son una tabla del OS y no tienen NADA que
  // ver con ese puente: hasta hoy se escondían con las otras cuatro, así que un problema del Sheet
  // dejaba a la obra sin poder anotar qué la está frenando.
  const opRes = vista === 'operacion' ? await getOperacionObra(supabase, obraId) : null
  const operacion = opRes?.data ?? null
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
  // ═══ LA CABECERA ROTULA CADA DATO (20/08/2026) ═══
  //
  // Decía «La Estrella · 06/07/26 → 22/08/26»: cuatro datos distintos separados por puntos, donde
  // el que mira tiene que adivinar cuál es el cliente, cuál la etapa y cuál de las dos fechas es el
  // fin. El dueño lo pidió rotulado —«Cliente: · Etapa: · Inicio: · Fin plan:»— y rotulado se lee
  // sin pensar. Cada campo dice qué le falta por su nombre: una fecha vacía es «sin fecha», nunca
  // un guión suelto que se leería como «hoy».
  const etapaLabel = obra.etapa
    ? (ETAPA_LABEL[obra.etapa as Etapa] ?? obra.etapa)
    : 'sin declarar'
  const Campo = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <span className="whitespace-nowrap">
      <span className="text-faint">{k}:</span> <span className="text-ink">{children}</span>
    </span>
  )
  const contexto = (
    <div data-testid="cabecera-obra" className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {deQuien && <Campo k="Cliente">{deQuien}</Campo>}
      <Campo k="Etapa">{etapaLabel}</Campo>
      <Campo k="Inicio">
        <span className="tabular-nums">{obra.fecha_inicio_plan ? fmtFecha(obra.fecha_inicio_plan) : 'sin fecha'}</span>
      </Campo>
      <Campo k="Fin plan">
        <span className="tabular-nums">{obra.fecha_fin_plan ? fmtFecha(obra.fecha_fin_plan) : 'sin fecha'}</span>
      </Campo>
      {archivada && <span className="rounded border border-line px-1.5 py-[1px] text-[11px] text-faint" data-testid="obra-archivada">archivada</span>}
    </div>
  )
  const subtitulo = contexto

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
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[clamp(14px,0.92vw,32px)] transition-colors ${vista === v.id ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >{v.label}</Link>
        ))}
      </nav>

      {vista === 'resumen' && (
        <TabResumen
          obra={obra}
          plan={plan}
          abiertas={abiertas}
          obraId={obraId}
          veComercial={veComercial}
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
          obraId={obraId}
          sub={esSubVista(sub) ? sub : 'gantt'}
          semanas={semanas === '1' || semanas === '6' ? semanas : '2'}
          actividadAbierta={act ?? null}
          hhPorActividad={new Map(actividadHH.map((h) => [h.actividad_id, h]))}
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
            definirMedicion: definirMedicion.bind(null, obraId),
            crearTarea: crearTarea.bind(null, obraId),
            cambiarEstadoTarea: cambiarEstadoTarea.bind(null, obraId),
            // LAS PRECEDENCIAS SE PODÍAN ESCRIBIR DESDE EL 17/08 Y NADIE PODÍA CARGAR UNA: las dos
            // acciones existían y esta página no las ataba, así que el panel dibujaba «nada
            // declarado» sin un solo control para declarar algo — y el Gantt no tenía una flecha que
            // dibujar porque la tabla estaba vacía por falta de puerta, no por falta de dato.
            agregarDependencia: agregarDependencia.bind(null, obraId),
            quitarDependencia: quitarDependencia.bind(null, obraId),
            agregarNota: agregarNota.bind(null, obraId),
            borrarNota: borrarNota.bind(null, obraId),
            // LA MISMA ACCIÓN QUE USA OPERACIÓN. El `actividad_id` viaja en el formulario del panel;
            // una segunda implementación de «anotar un impedimento» se contestaría distinto el día
            // que a una de las dos se le agregue un campo.
            crearImpedimento: crearImpedimento.bind(null, obraId),
            liberarImpedimento: liberarImpedimento.bind(null, obraId),
            editarImpedimento: editarImpedimento.bind(null, obraId),
            vincularDocumento: vincularDocumento.bind(null, obraId),
            soltarDocumento: soltarDocumentoDeActividad.bind(null, obraId),
            moverDeRubro: moverActividadDeRubro.bind(null, obraId),
          }}
          accionesPlan={{
            crearRubro: crearRubro.bind(null, obraId),
            renombrarRubro: renombrarRubro.bind(null, obraId),
            moverRubro: moverRubro.bind(null, obraId),
            archivarRubro: archivarRubro.bind(null, obraId),
          }}
          /* LAS ACCIONES EN LOTE SE ATAN A LA OBRA ACÁ, igual que el resto: el `obraId` nunca viaja
             en un campo del navegador. Los ids de actividad SÍ vienen del cliente —es una selección
             que hace una persona—, y por eso cada acción vuelve a acotar por `obra_id` del lado del
             servidor antes de escribir una sola fila. */
          masivas={{
            responsable: asignarResponsableMasivo.bind(null, obraId),
            hhPlan: cargarHHPlanMasivo.bind(null, obraId),
            baseline: sellarBaselineMasivo.bind(null, obraId),
          }}
          restaurarActividad={archivarActividad.bind(null, obraId)}
          cambiarEstado={cambiarEstado.bind(null, obraId)}
          datosPorActividad={datosPorActividad}
          medirEnLote={medirEnLote.bind(null, obraId)}
        />
      )}

      {vista === 'ejecucion' && (
        <TabEjecucion
          obraId={obraId}
          actividades={acts}
          partes={partes}
          personas={personas}
          cuadrillas={cuadrillas}
          integrantes={integrantes}
          hoy={new Date().toISOString().slice(0, 10)}
          equipos={catalogoEquipos}
          registrar={registrarEjecucion.bind(null, obraId)}
          borrarParte={borrarParte.bind(null, obraId)}
        />
      )}

      {vista === 'personal' && (
        <TabPersonal
          plan={plan}
          asignaciones={asignaciones}
          personas={personas}
          cuadrillas={cuadrillas}
          actividades={acts}
          actividadHH={actividadHH}
          registros={registros}
          asignar={asignarPersona.bind(null, obraId)}
          cerrar={cerrarAsignacion.bind(null, obraId)}
          quitar={quitarAsignacion.bind(null, obraId)}
          imputar={imputarHH.bind(null, obraId)}
          imputarMasivo={imputarHHMasivo.bind(null, obraId)}
          borrarHoras={borrarHH.bind(null, obraId)}
        />
      )}

      {vista === 'operacion' && (
        <TabOperacion
          sub={subOp}
          obraId={obraId}
          errorFuente={opRes?.error ?? null}
          pedidos={operacion?.pedidos ?? []}
          compras={operacion?.compras ?? { filas: [], total: null, nComprobantes: null, completo: false }}
          herramientas={operacion?.herramientas ?? []}
          movimientos={operacion?.movimientos ?? []}
          impedimentos={restr}
          actividades={acts}
          // `.bind(null, obraId)` Y NO UNA ARROW. Una arrow escrita acá es una función NUEVA
          // creada en el servidor, no la acción: React la rechaza en tiempo de ejecución con
          // «Functions cannot be passed directly to Client Components» y la solapa queda en blanco.
          // Ni el typecheck ni el build lo ven —las firmas son idénticas—; sólo el navegador.
          crearImpedimento={crearImpedimento.bind(null, obraId)}
          liberarImpedimento={liberarImpedimento.bind(null, obraId)}
          asignarActividadAPedido={asignarActividadAPedido.bind(null, obraId)}
        />
      )}

      {vista === 'economia' && (
        <TabEconomia
          plan={plan}
          certificados={certificados}
          crearCert={crearCertificado.bind(null, obraId)}
          borrarCert={borrarCertificado.bind(null, obraId)}
          veComercial={veComercial}
        />
      )}

      {vista === 'documentos' && (
        <TabDocumentos
          documentos={documentos}
          actividades={acts}
          carpetaDriveId={obra.drive_carpeta_id}
          vincular={vincularDocumento.bind(null, obraId)}
          desvincular={desvincularDocumento.bind(null, obraId)}
          asignarActividad={asignarActividadADocumento.bind(null, obraId)}
        />
      )}
    </PageShell>
  )
}
