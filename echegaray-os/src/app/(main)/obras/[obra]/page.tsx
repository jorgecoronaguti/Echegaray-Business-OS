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

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getActividades, getDependencias, getDocumentos, getEconomiaObra, getObra, getPlanVsReal,
  getRestricciones, getUbicacion,
} from '@/features/obras/services/obrasService'
import {
  getActividadHH, getAsignaciones, getCausasDesvio, getCuadrillas, getPersonas, getPersonasDeHoy,
  getRegistrosHH,
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
import { AccionesRapidas } from '@/features/obras/components/AccionesRapidas'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { TabResumen } from '@/features/obras/components/TabResumen'
import { TabCronograma } from '@/features/obras/components/TabCronograma'
import type { DatosDeActividad } from '@/features/obras/components/PanelActividad'
import { esSubVista } from '@/features/obras/services/subvistas'
import { separarPlanYSubtareas } from '@/features/obras/services/subtareas'
import {
  hrefSubcontratos, resolverVistaObra, SUBS_TAREAS,
} from '@/features/obras/services/vistasObra'
import { WorkspaceTareas } from '@/features/obras/components/WorkspaceTareas'
import { SubTabs } from '@/shared/components/ds'
import { TabEjecucion } from '@/features/obras/components/TabEjecucion'
import { getPartes } from '@/features/obras/services/ejecucionService'
import { getIntegrantesPorCuadrilla } from '@/features/obras/services/personalService'
import {
  asignarActividadAPedido, borrarParte, cambiarEstadoTarea, crearTarea,
  definirMedicion, registrarEjecucion,
} from '@/features/obras/services/actionsEjecucion'
import { TabPersonal } from '@/features/obras/components/TabPersonal'
import { TabOperacion } from '@/features/obras/components/TabOperacion'
import { getOperacionObra, subDeLaUrl, type SubOperacion } from '@/features/obras/services/operacionService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getPerfilActual } from '@/features/auth/services/authService'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { TabDocumentos } from '@/features/obras/components/TabDocumentos'
import {
  asignarActividadADocumento, clasificarDocumento, desvincularDocumento, soltarDocumentoDeActividad,
  vincularDocumento,
} from '@/features/obras/services/actionsDocumentos'
import { BotonAccion, FormAccion } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { crearLector } from '@/shared/components/estado/lecturas'
import { EstadoError } from '@/shared/components/estado'
// `anchoSplit` se importa por su RUTA y no por el barril del DS: usa `next/headers`, y ese barril lo
// importan componentes de cliente. Ver el comentario en `ds/index.ts`.
import { anchoSplit } from '@/shared/components/ds/split-servidor'

export const dynamic = 'force-dynamic'

/** El ancho por defecto del split cuando no hay cookie: la tabla manda, el panel acompaña. */
const ANCHO_TABLA = 470
const ANCHO_PANEL = 452

export default async function ObraPage({
  params, searchParams,
}: {
  params: Promise<{ obra: string }>
  searchParams: Promise<{
    vista?: string; sub?: string; semanas?: string; act?: string; filtro?: string; sol?: string
    /** La dotación simulada del panel de la tarea (04). Igual que en la 08: la URL es la memoria
     *  del simulador, así que el mismo link abre la misma simulación del otro lado del chat. */
    dot?: string
  }>
}) {
  const { obra: obraId } = await params
  const { vista: vistaRaw, sub, semanas, act, filtro, sol, dot } = await searchParams
  // LA VISTA Y LA SUB-VISTA SE RESUELVEN JUNTAS: el alias de una URL vieja decide también con qué
  // vista abre. `?vista=ejecucion` tiene que caer en el parte diario, no en el árbol.
  const { vista, sub: subTareas } = resolverVistaObra(vistaRaw, sub)

  const supabase = await createClient()

  // ═══ QUÉ VISTA DEL WORKSPACE SE ESTÁ MIRANDO ═══
  const enTareas = vista === 'tareas'
  const esArbol = enTareas && subTareas === 'arbol'
  const esCronograma = enTareas && subTareas === 'gantt'
  const esParte = enTareas && subTareas === 'parte'

  // ═══ TODAS LAS LECTURAS DE LA VISTA SALEN JUNTAS (22/08/2026) ═══
  //
  // Este bloque era una escalera de once `await` — un viaje entero a la base detrás del otro: el
  // Resumen tardaba 12,5 s en empezar a dibujarse con consultas que individualmente vuelven en
  // menos de medio segundo. La vista decide QUÉ se pide (cada solapa paga sólo lo suyo); el
  // `Promise.all` decide CUÁNDO: todo a la vez, y la página tarda lo que su consulta más lenta.
  //
  // UN ERROR DE LECTURA NO SE DIBUJA COMO UNA OBRA VACÍA: lo que admite fallo parcial pasa por
  // `lector.leer` DESPUÉS de resolver, y el cartel de arriba dice qué no se pudo leer.
  const lector = crearLector()
  const necesitaPersonas = esCronograma || vista === 'personal' || esParte
  const necesitaCuadrillas = vista === 'personal' || esParte || esArbol
  // Los partes también en Cronograma y Resumen: el panel de la actividad muestra su ejecución
  // reciente, y «último movimiento» del Resumen es literalmente el último parte.
  const necesitaPartes = esParte || esCronograma || vista === 'resumen'
  const [
    perfilRes, obraRes, actividadesRes, restriccionesRes, planRes,
    dependenciasRes, personasRes, ubicacion, asignacionesRes, causasRes, registrosRes,
    actividadHHRes, cuadrillas, integrantes, partesRes, certificadosRes, economiaRes,
    documentosRes, trabajo, equiposPorActividad, notasPorActividad, catalogoEquipos,
    anchosDelSplit, opRes, personasDeHoy,
  ] = await Promise.all([
    // COMERCIAL ES PRECIO, y el precio es de Dirección y Administración: el jefe de obra ve el
    // COSTO de su obra, pero no cuánto se vendió — `veEconomia`, no `esAdministracion`.
    getPerfilActual(supabase),
    getObra(supabase, obraId),
    getActividades(supabase, obraId),
    getRestricciones(supabase, obraId),
    getPlanVsReal(supabase, obraId),
    // Las precedencias sólo las dibuja el Gantt: traerlas en las otras solapas es una consulta
    // por visita para nadie.
    esCronograma ? getDependencias(supabase, obraId) : null,
    necesitaPersonas ? getPersonas(supabase) : null,
    vista === 'resumen' ? getUbicacion(supabase, obraId) : null,
    vista === 'personal' ? getAsignaciones(supabase, obraId) : null,
    vista === 'personal' ? getCausasDesvio(supabase) : null,
    vista === 'personal' || esParte ? getRegistrosHH(supabase, obraId) : null,
    // Plan contra real por actividad: Personal la publica y Cronograma la usa en el panel de la
    // actividad, con el MISMO cálculo.
    vista === 'personal' || esCronograma ? getActividadHH(supabase, obraId) : null,
    necesitaCuadrillas ? getCuadrillas(supabase) : [],
    esParte ? getIntegrantesPorCuadrilla(supabase) : {},
    necesitaPartes ? getPartes(supabase, obraId) : null,
    vista === 'economia' ? getCertificados(supabase, obraId) : null,
    // EL PANEL ECONÓMICO TAMBIÉN EN RESUMEN: la línea de margen del resumen sale de acá desde el
    // 22/08. Antes se armaba con `contratado − costo real` del plan, que no es margen.
    vista === 'economia' || vista === 'resumen' ? getEconomiaObra(supabase, obraId) : null,
    // LOS PAPELES LOS PIDEN DOS SOLAPAS: es la MISMA lectura — dos consultas darían dos listas
    // que un día no coinciden.
    vista === 'documentos' || esCronograma ? getDocumentos(supabase, obraId) : null,
    // Cuatro lecturas por OBRA y no una por actividad: el panel cambia de actividad con cada clic.
    esCronograma
      ? getTrabajoPorActividad(supabase, obraId)
      : { personas: new Map(), porFecha: new Map() },
    esCronograma ? getEquiposPorActividad(supabase, obraId) : new Map(),
    esCronograma ? getNotas(supabase, obraId) : new Map(),
    // El catálogo de equipos es AYUDA de carga, no restricción: el campo acepta cualquier texto.
    esParte ? getCatalogoEquipos(supabase) : [],
    // El ancho del split se lee en el servidor: la PRIMERA pintura ya sale con el reparto que la
    // persona eligió. Leído en el cliente, la pantalla nacería con el ancho por defecto y saltaría.
    esCronograma
      ? Promise.all([anchoSplit('obra-tabla', ANCHO_TABLA, 300, 760), anchoSplit('obra-panel', ANCHO_PANEL, 340, 760)])
      : null,
    // Operación trae sus cuatro listas de una vez: se atan a la obra por el MISMO puente
    // (`obra_alias`); si esa fuente falla, fallan juntas. Los impedimentos son tabla del OS y no
    // dependen de ese puente.
    vista === 'operacion' ? getOperacionObra(supabase, obraId) : null,
    // PERSONAS del Resumen (§25): asignadas vigentes y presentes HOY. Dos conteos con cabeza.
    vista === 'resumen' ? getPersonasDeHoy(supabase, obraId) : null,
  ])

  const rolActual = perfilRes.data?.rol ?? null
  const veComercial = veEconomia(rolActual)
  const puedeEditarPlan = esAdministracion(rolActual)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas, y confundirlas ya costó caro (17/08/2026):
  // faltaba un `grant` y el módulo entero se veía como "página no encontrada" en vez de decir que no
  // tenía permiso. Buscar un defecto de permisos detrás de un 404 es buscarlo en el lugar equivocado.
  const { data: obra, error } = obraRes
  if (error) {
    // El cartel COMPARTIDO, no uno propio: trae el diagnóstico del mensaje de la base (permisos,
    // sesión vencida, no se llegó), Reintentar y la hora del último dato bueno de esta ficha.
    return <EstadoError mensaje={error} que="la ficha de la obra" />
  }
  if (!obra) notFound()

  const actividades = lector.leer(actividadesRes, [] as NonNullable<typeof actividadesRes.data>)
  const restricciones = lector.leer(restriccionesRes, [] as NonNullable<typeof restriccionesRes.data>)
  // El plan conserva su `null`: «esta obra no tiene línea base» es un hecho distinto de «no se
  // pudo leer el plan», y aplanarlo a un objeto vacío borraría esa diferencia.
  const plan = lector.leer<NonNullable<typeof planRes.data> | null>(planRes, null)
  const dependencias = dependenciasRes ? lector.leer(dependenciasRes, []) : []
  const personas = personasRes ? lector.leer(personasRes, []) : []
  const asignaciones = asignacionesRes ? lector.leer(asignacionesRes, []) : []
  const causasDesvio = causasRes ? lector.leer(causasRes, []) : []
  const registros = registrosRes ? lector.leer(registrosRes, []) : []
  const actividadHH = actividadHHRes ? lector.leer(actividadHHRes, []) : []
  const partes = partesRes ? lector.leer(partesRes, []) : []
  const certificados = certificadosRes ? lector.leer(certificadosRes, []) : []
  const economia = economiaRes ? lector.leer(economiaRes, null) : null
  const documentos = documentosRes ? lector.leer(documentosRes, []) : []
  const [anchoTabla, anchoPanel] = anchosDelSplit ?? [ANCHO_TABLA, ANCHO_PANEL]
  const operacion = opRes?.data ?? null
  // La traducción del query string vive en el servicio: ahí están los subs y ahí están los nombres
  // viejos que todavía llegan por enlaces guardados.
  const subOp: SubOperacion = subDeLaUrl(sub)

  const todas = actividades
  // LAS ARCHIVADAS NO ENTRAN AL CRONOGRAMA NI A NINGUNA LISTA: para eso se archivan. Siguen
  // existiendo, y por eso hay dentro de Cronograma una lista aparte para volver a traerlas.
  // LAS TAREAS NO SON FILAS DEL PLAN. Descomponen una actividad y viven DENTRO de su panel: en el
  // Gantt serían una fila más y en el promedio de avance pesarían doble contra una actividad que
  // nadie partió. Se separan una sola vez, acá, y no cinco veces en cada vista.
  const vivas = todas.filter((a) => !a.archivada)
  // ═══ QUÉ ES DEL PLAN Y QUÉ DESCOMPONE UNA ACTIVIDAD ═══
  // Lo decide el TIPO DEL PADRE, no la mera presencia de un padre: desde `20260821T2000` hay 161
  // actividades reales colgadas de su rubro, y el filtro viejo (`!actividad_padre_id`) las dejaba
  // afuera del Gantt sin un solo error. Ver `subtareas.ts`.
  const { plan: filasDelPlan, subtareas: tareasPorActividad } = separarPlanYSubtareas(vivas)
  const acts = filasDelPlan
  const archivadas = todas.filter((a) => a.archivada)
  const restr = restricciones ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  const yaSellada = todas.some((a) => a.sellada_en != null)
  const partesPorActividad = new Map<string, typeof partes>()
  for (const p of partes) {
    const previos = partesPorActividad.get(p.actividad_id) ?? []
    previos.push(p)
    partesPorActividad.set(p.actividad_id, previos)
  }
  const docsPorActividad = new Map<string, typeof documentos>()
  for (const d of documentos) {
    if (!d.actividad_id) continue
    const previos = docsPorActividad.get(d.actividad_id) ?? []
    previos.push(d)
    docsPorActividad.set(d.actividad_id, previos)
  }

  const datosPorActividad = new Map<string, DatosDeActividad>()
  if (esCronograma) {
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
  // ═══ EL CONTEXTO: DÓNDE ESTOY, DE QUIÉN ES ═══
  // «← Obras», el nombre de la obra, sus campos de identidad rotulados y el ciclo de vida. Todo eso
  // vive en `CabeceraDeObra` —la MISMA que dibujan Cronograma, Dotación, Subcontratos y Avance
  // masivo— desde el 24/08: era la única cabecera del OS que existía dos veces, y las pantallas
  // hijas se habían quedado con una banda grafito propia que parecía otra aplicación.
  // `archivada` se sigue calculando acá porque el bloque de archivar del Resumen lo necesita.
  const archivada = obra.estado === 'cerrada'

  return (
    // EL WORKSPACE NO USA `PageShell`: su encabezado es el de una ENTIDAD —volver, nombre, campos
    // rotulados y ciclo de vida— y sus dos barras de navegación tienen que quedar pegadas al
    // contenido, sin el margen de una página de lectura. El marco (fondo y padding de pantalla) es
    // el mismo: 16px en el teléfono, 40px en escritorio.
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 pt-6 lg:px-10">
        {/* Nivel 2 adentro: SEIS solapas —Ejecución dejó de ser una— que se desplazan en vez de
            empujar la página, porque en 390px no entran. */}
        <CabeceraDeObra
          obraId={obraId}
          obra={obra}
          vistaActiva={vista}
          /* Las cinco operaciones de todos los días, sin buscar en qué solapa viven. */
          acciones={<AccionesRapidas obraId={obraId} />}
        />
      </div>
      <div className="w-full px-4 pb-6 pt-4 lg:px-10">

      {/* LO QUE NO SE PUDO LEER SE DICE ACÁ, ARRIBA DE LA SOLAPA. Sin este cartel, una consulta
          caída se veía como una obra sin actividades, sin partes o sin nadie asignado — el error
          dibujado como un vacío, que es lo que `INTERACTION.md` prohíbe. */}
      {lector.falla() && (
        <div className="mb-4">
          <Aviso tono="neg" titulo="Parte de esta ficha no se pudo leer" testid="obra-lectura-fallida">
            Lo que falta abajo NO significa que no exista: significa que la consulta falló. {lector.falla()}
          </Aviso>
        </div>
      )}

      {vista === 'resumen' && (
        <TabResumen
          obra={obra}
          plan={plan}
          personasDeHoy={personasDeHoy}
          economia={economia}
          abiertas={abiertas}
          obraId={obraId}
          veComercial={veComercial}
          // «Próximas 2 semanas» y «último movimiento» son secciones del Resumen en el handoff.
          // Son props OPCIONALES a propósito —«la página no lo pidió» no es lo mismo que «no viene
          // nada»— y hasta acá la página no las pedía, así que las dos secciones no existían.
          actividades={acts}
          partes={partes}
          editar={
            <details className="rounded-lg border border-line bg-surface" data-testid="editar-obra">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Editar la obra</summary>
              <div className="border-t border-line p-4">
                <FormAccion accion={editarObra.bind(null, obraId)} testid="form-editar-obra" enviar="Guardar la obra" mensajeOk="Obra guardada.">
                  <CamposObra obra={obra} ubicacion={ubicacion} veEconomia={veComercial} />
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

      {/* Nivel 3 de Tareas: TEXTO subrayado, nunca otra barra. Son seis maneras de mirar LAS
          MISMAS actividades — el árbol nuevo, las cuatro del cronograma y el parte diario. */}
      {vista === 'tareas' && (
        <div className="pb-3">
          <SubTabs
            testid="subtabs-tareas"
            items={[
              ...SUBS_TAREAS.map((sv) => ({
                href: `/obras/${obraId}?vista=tareas&sub=${sv.id}`,
                label: sv.label,
                activo: subTareas === sv.id,
                testid: `sub-${sv.id}`,
              })),
              // LA PANTALLA 10 ENTRA POR ACÁ y nunca queda activa: es otra URL, no otra sub-vista.
              // Es el MISMO alcance de la obra mirado desde el lado del tercero que lo ejecuta, y
              // por eso cuelga de Tareas en vez de ser una séptima solapa —el tope de seis está
              // declarado arriba—.
              {
                href: hrefSubcontratos(obraId),
                label: 'Subcontratos',
                testid: 'sub-subcontratos',
              },
            ]}
          />
        </div>
      )}

      {esArbol && (
        <WorkspaceTareas
          supabase={supabase} obraId={obraId} act={act} filtro={filtro} sol={sol} dot={dot}
          cuadrillas={cuadrillas} puedeEditar={puedeEditarPlan} veEconomia={veComercial}
        />
      )}

      {esCronograma && (
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
          datosPorActividad={datosPorActividad}
          anchoTabla={anchoTabla}
          anchoPanel={anchoPanel}
        />
      )}

      {esParte && (
        <TabEjecucion
          obraId={obraId}
          actividades={acts}
          partes={partes}
          personas={personas}
          cuadrillas={cuadrillas}
          integrantes={integrantes}
          hoy={new Date().toISOString().slice(0, 10)}
          equipos={catalogoEquipos}
          registrosHH={registros}
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
          causas={causasDesvio}
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
          economia={economia}
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
          clasificar={clasificarDocumento.bind(null, obraId)}
        />
      )}
      </div>
    </div>
  )
}
