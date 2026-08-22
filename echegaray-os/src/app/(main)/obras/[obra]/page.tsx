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
import { ETAPA_LABEL, type Etapa } from '@/features/obras/types'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { CicloDeVida } from '@/features/obras/components/CicloDeVida'
import { TabResumen } from '@/features/obras/components/TabResumen'
import { TabCronograma } from '@/features/obras/components/TabCronograma'
import type { DatosDeActividad } from '@/features/obras/components/PanelActividad'
import { esSubVista } from '@/features/obras/services/subvistas'
import { separarPlanYSubtareas } from '@/features/obras/services/subtareas'
import {
  hrefSubcontratos, resolverVistaObra, SUBS_TAREAS, VISTAS_OBRA,
} from '@/features/obras/services/vistasObra'
import { WorkspaceTareas } from '@/features/obras/components/WorkspaceTareas'
import { SubTabs } from '@/shared/components/ds'
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
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getPerfilActual } from '@/features/auth/services/authService'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { TabDocumentos } from '@/features/obras/components/TabDocumentos'
import {
  asignarActividadADocumento, desvincularDocumento, soltarDocumentoDeActividad, vincularDocumento,
} from '@/features/obras/services/actionsDocumentos'
import { fecha as fmtFecha } from '@/features/obras/components/formato'
import { BotonAccion, FormAccion } from '@/shared/components/ui'
import { Aviso, EntityHeader, Tabs } from '@/shared/components/ds'
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
  // UNA SOLA LECTURA DEL PERFIL PARA TODA LA FICHA. El dato comercial ya no llega de la base a quien
  // no es Administración; esto decide qué CARTEL se dibuja, para no explicar una ausencia que no lo
  // es. Ver el comentario largo en `TabEconomia`.
  // COMERCIAL ES PRECIO, y el precio es de Dirección y Administración. El jefe de obra entra a
  // Administración desde el 19/08 y ve el COSTO de su obra —el presupuestado y el gastado—, pero no
  // cuánto se vendió: `veEconomia`, no `esAdministracion`.
  // ESCRIBIR EL PLAN ES OTRA PREGUNTA QUE VER EL PRECIO: dividir en frentes o cambiar una
  // precedencia corre fechas de entrega y es de Administración (que incluye a la jefatura de obra).
  const rolActual = (await getPerfilActual(supabase)).data?.rol ?? null
  const veComercial = veEconomia(rolActual)
  const puedeEditarPlan = esAdministracion(rolActual)
  const { data: obra, error } = await getObra(supabase, obraId)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas, y confundirlas ya costó caro (17/08/2026):
  // faltaba un `grant` y el módulo entero se veía como "página no encontrada" en vez de decir que no
  // tenía permiso. Buscar un defecto de permisos detrás de un 404 es buscarlo en el lugar equivocado.
  if (error) {
    // El cartel COMPARTIDO, no uno propio: trae el diagnóstico del mensaje de la base (permisos,
    // sesión vencida, no se llegó), Reintentar y la hora del último dato bueno de esta ficha.
    return <EstadoError mensaje={error} que="la ficha de la obra" />
  }
  if (!obra) notFound()

  // ═══ QUÉ VISTA DEL WORKSPACE SE ESTÁ MIRANDO ═══
  // Cada una pide SÓLO lo suyo: la ficha se abre muchas veces por día desde el teléfono, en obra y
  // con mala señal, y traerlo todo en cada visita serían seis consultas para mostrar una.
  const enTareas = vista === 'tareas'
  const esArbol = enTareas && subTareas === 'arbol'
  const esCronograma = enTareas && (subTareas === 'gantt' || subTareas === 'lista'
    || subTareas === 'tablero' || subTareas === 'proximos')
  const esParte = enTareas && subTareas === 'parte'

  // ═══ UN ERROR DE LECTURA NO SE DIBUJA COMO UNA OBRA VACÍA ═══
  //
  // Todo lo de abajo se leía con `.data ?? []`: si la consulta fallaba, la solapa mostraba «esta
  // obra todavía no tiene actividades cargadas» o «nadie tiene una asignación en esta obra». Son
  // afirmaciones sobre la obra sacadas de un fallo de la base — y la ficha se sigue dibujando
  // (media pantalla es mejor que ninguna), pero ahora con el cartel de lo que no se pudo leer.
  const lector = crearLector()
  const [actividades, restricciones, plan] = await Promise.all([
    getActividades(supabase, obraId),
    getRestricciones(supabase, obraId),
    getPlanVsReal(supabase, obraId),
  ]).then(([a, r, p]) => [
    lector.leer(a, [] as NonNullable<typeof a.data>),
    lector.leer(r, [] as NonNullable<typeof r.data>),
    // El plan conserva su `null`: «esta obra no tiene línea base» es un hecho distinto de «no se
    // pudo leer el plan», y aplanarlo a un objeto vacío borraría esa diferencia.
    lector.leer<NonNullable<typeof p.data> | null>(p, null),
  ] as const)
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
  // afuera del Gantt, de la Lista, del Tablero y de Próximos sin un solo error. Ver `subtareas.ts`.
  const { plan: filasDelPlan, subtareas: tareasPorActividad } = separarPlanYSubtareas(vivas)
  const acts = filasDelPlan
  const archivadas = todas.filter((a) => a.archivada)
  const restr = restricciones ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  const yaSellada = todas.some((a) => a.sellada_en != null)

  // Cada solapa pide SÓLO lo suyo. Traerlo todo en cada visita costaría seis consultas para mostrar
  // una: la ficha se abre muchas veces por día desde el teléfono, en obra y con mala señal.
  // Las precedencias sólo las dibuja el Gantt: traerlas en las otras cinco solapas es una consulta
  // por visita para nadie.
  const dependencias = esCronograma ? lector.leer(await getDependencias(supabase, obraId), []) : []
  const necesitaPersonas = esCronograma || vista === 'personal' || esParte
  const personas = necesitaPersonas ? lector.leer(await getPersonas(supabase), []) : []
  const ubicacion = vista === 'resumen' ? await getUbicacion(supabase, obraId) : null
  const asignaciones = vista === 'personal' ? lector.leer(await getAsignaciones(supabase, obraId), []) : []
  const registros = vista === 'personal' ? lector.leer(await getRegistrosHH(supabase, obraId), []) : []
  // Plan contra real por actividad y las cuadrillas: sólo los pide la solapa Personal.
  // Cronograma la usa para mostrar HH real en el panel de la actividad, con el MISMO cálculo.
  const actividadHH = vista === 'personal' || esCronograma
    ? lector.leer(await getActividadHH(supabase, obraId), []) : []
  const necesitaCuadrillas = vista === 'personal' || esParte || esArbol
  const cuadrillas = necesitaCuadrillas ? await getCuadrillas(supabase) : []
  const integrantes = esParte ? await getIntegrantesPorCuadrilla(supabase) : {}
  // Los partes también en Cronograma: el panel de la actividad muestra su ejecución reciente, que
  // es lo que contesta «¿cómo viene?» sin salir del cronograma. Y en el Resumen, porque «último
  // movimiento» es literalmente el último parte: sin ellos esa línea no se dibujaba, y una sección
  // que no aparece porque la página no pidió el dato se lee igual que una obra sin movimiento.
  const partes = esParte || esCronograma || vista === 'resumen'
    ? lector.leer(await getPartes(supabase, obraId), []) : []
  const partesPorActividad = new Map<string, typeof partes>()
  for (const p of partes) {
    const previos = partesPorActividad.get(p.actividad_id) ?? []
    previos.push(p)
    partesPorActividad.set(p.actividad_id, previos)
  }
  const certificados = vista === 'economia' ? lector.leer(await getCertificados(supabase, obraId), []) : []
  // LOS PAPELES LOS PIDEN DOS SOLAPAS. Documentos muestra los de la obra; Cronograma, los que
  // alguien colgó de una actividad. Es la MISMA lectura: dos consultas darían dos listas que un día
  // no coinciden.
  const documentos = vista === 'documentos' || esCronograma
    ? lector.leer(await getDocumentos(supabase, obraId), []) : []

  // ═══ LO QUE MUESTRA EL PANEL DE UNA ACTIVIDAD ═══
  //
  // Cuatro lecturas por OBRA y no una por actividad: el panel cambia de actividad con cada clic, y
  // una consulta por clic haría el cronograma pegajoso justo en lo que más se usa. Se indexan una
  // vez, acá, y el Gantt sólo se las pasa al panel.
  const trabajo = esCronograma
    ? await getTrabajoPorActividad(supabase, obraId)
    : { personas: new Map(), porFecha: new Map() }
  const equiposPorActividad = esCronograma
    ? await getEquiposPorActividad(supabase, obraId) : new Map()
  const notasPorActividad = esCronograma
    ? await getNotas(supabase, obraId) : new Map()
  // El catálogo de equipos es AYUDA de carga, no restricción: el campo acepta cualquier texto, y un
  // equipo alquilado por una semana no puede ser motivo para no anotarlo.
  const catalogoEquipos = esParte ? await getCatalogoEquipos(supabase) : []
  // ═══ EL ANCHO DEL SPLIT SE LEE EN EL SERVIDOR ═══
  // La cookie la escribe el navegador al soltar el divisor y la lee acá el servidor, así que la
  // PRIMERA pintura del workspace ya sale con el reparto que la persona eligió. Leyéndola en el
  // cliente, la pantalla más pesada del sistema nacería con el ancho por defecto y se corregiría
  // sola cien milisegundos después — un salto visible justo donde más molesta.
  const [anchoTabla, anchoPanel] = esCronograma
    ? await Promise.all([anchoSplit('obra-tabla', ANCHO_TABLA, 300, 760), anchoSplit('obra-panel', ANCHO_PANEL, 340, 760)])
    : [ANCHO_TABLA, ANCHO_PANEL]

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
  const campos = [
    ...(deQuien ? [{ rotulo: 'Cliente', valor: deQuien }] : []),
    { rotulo: 'Etapa', valor: obra.etapa ? etapaLabel : null, falta: 'sin declarar' },
    {
      rotulo: 'Inicio',
      valor: obra.fecha_inicio_plan ? <span className="tabular-nums">{fmtFecha(obra.fecha_inicio_plan)}</span> : null,
      falta: 'sin fecha',
    },
    {
      rotulo: 'Fin plan',
      valor: obra.fecha_fin_plan ? <span className="tabular-nums">{fmtFecha(obra.fecha_fin_plan)}</span> : null,
      falta: 'sin fecha',
    },
  ]

  return (
    // EL WORKSPACE NO USA `PageShell`: su encabezado es el de una ENTIDAD —volver, nombre, campos
    // rotulados y ciclo de vida— y sus dos barras de navegación tienen que quedar pegadas al
    // contenido, sin el margen de una página de lectura. El marco (fondo y padding de pantalla) es
    // el mismo: 16px en el teléfono, 40px en escritorio.
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 pt-6 lg:px-10">
        <EntityHeader
          volverA="/obras"
          volverLabel="Obras"
          titulo={obra.nombre}
          campos={campos}
          derecha={
            <div className="flex flex-wrap items-center gap-3" data-testid="cabecera-obra">
              {/* ARCHIVADA SE DICE EN EL ENCABEZADO: es la única señal de que esta ficha se abrió
                  por su URL y no desde el portafolio, y sin ella alguien podría cargar HH o avance
                  sobre una obra archivada sin enterarse de que lo está. */}
              {archivada && (
                <span className="rounded border border-line px-1.5 py-[1px] text-[11px] text-faint" data-testid="obra-archivada">
                  archivada
                </span>
              )}
              <CicloDeVida etapa={obra.etapa} />
            </div>
          }
        />
        {/* Nivel 2: SEIS solapas —Ejecución dejó de ser una— que se desplazan en vez de empujar la
            página: en 390px no entran. */}
        <Tabs
          testid="tabs-obra"
          tabs={VISTAS_OBRA.map((v) => ({
            href: `/obras/${obraId}?vista=${v.id}`,
            label: v.label,
            activo: vista === v.id,
            testid: `tab-${v.id}`,
          }))}
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
          cambiarEstado={cambiarEstado.bind(null, obraId)}
          datosPorActividad={datosPorActividad}
          medirEnLote={medirEnLote.bind(null, obraId)}
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
      </div>
    </div>
  )
}
