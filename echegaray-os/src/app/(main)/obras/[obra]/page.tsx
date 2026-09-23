// EL WORKSPACE DE LA OBRA — cinco solapas, y todo cuelga de `obra_id`.
//
// ═══ LAS SOLAPAS SON LAS DEFINITIVAS DEL MVP (18/08/2026) ═══
//
//     Resumen · Cronograma · Personal · Operación · Documentos
//
// ═══ «ECONOMÍA» SALIÓ DE LA OBRA (23/09/2026) ═══
//
// El dueño: «saca economía de las obras». Obras es OPERACIÓN; la plata —contrato, costo objetivo,
// certificación, margen— es de Administración y vive en `/administracion/obras/<obra>`, que es la
// MISMA `TabEconomia` sin cambiar una línea. Acá queda un enlace discreto al final de las solapas
// para quien ve economía, y `?vista=economia` redirige allá (`rutaHermana`). Lo que el Resumen ya
// dibujaba de plata (`CamposObra` y la línea de margen con `veEconomia`) no cambia de alcance.
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
// No se agregan más solapas principales. Seis fue el tope declarado; hoy son cinco.
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
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getActividades, getAvancePonderado, getDependencias, getDiasHabiles, getDiasHabilesDeObra, getDocumentos,
  getEconomiaObra, getGenteHoyPorActividad, getObra, getPlanDePersonal, getPlanVsReal, getRestricciones,
  getUbicacion,
} from '@/features/obras/services/obrasService'
import {
  getActividadHH, getAsignaciones, getCausasDesvio, getCuadrillas, getPersonas, getPersonasDeHoy,
  getRegistrosHH,
} from '@/features/obras/services/personalService'
import {
  archivarActividad, archivarObra, crearImpedimento, editarObra, liberarImpedimento, sellarBaseline,
} from '@/features/obras/services/actions'
import {
  asignarPersona, cerrarAsignacion, quitarAsignacion,
} from '@/features/obras/services/actionsPersonal'
import { getCatalogoEquipos } from '@/features/obras/services/recursosService'
import { getArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import { getDocumentosSubidos } from '@/features/documentos/services/documentosSubidosService'
import { borrarHH, imputarHH, imputarHHMasivo } from '@/features/obras/services/actionsHH'
import { C, ESTILO_PRIMARIA, ESTILO_SECUNDARIA } from '@/features/obras/components/canon/tokens'
import { Ico, P } from '@/features/obras/components/canon/Ico'
import { CabeceraDeObra, ESTADOS_TERMINADA, type KpiPantalla } from '@/features/obras/components/CabeceraDeObra'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { TabResumen } from '@/features/obras/components/TabResumen'
import { ResumenCierre } from '@/features/obras/components/ResumenCierre'
import { cifraAvance, costoTeorico, diaHabil } from '@/features/obras/services/avancePonderado'
import { CronogramaDeObra } from '@/features/obras/components/CronogramaDeObra'
import { AccionesEditorCronograma, EditorCronogramaProvider } from '@/features/obras/components/EditorCronogramaContexto'
import { cifrasDelEditor } from '@/features/obras/services/cifrasEditor'
import { Fragment } from 'react'
import { lecturasDeVista } from '@/features/obras/services/lecturasDeVista'
import { separarPlanYSubtareas } from '@/features/obras/services/subtareas'
import { hrefEconomia, resolverVistaObra, rutaHermana } from '@/features/obras/services/vistasObra'
import { SubNavTrabajo } from '@/features/obras/components/SubNavTrabajo'
import { WorkspaceTareas } from '@/features/obras/components/WorkspaceTareas'
import { esModoEstructura, type ModoEstructura } from '@/features/obras/components/items/crear/modo'
import { cifrasDeCrear } from '@/features/obras/components/items/crear/cabeceraDeCrear'
import { PrimariaViva } from '@/features/obras/components/items/crear/CabeceraViva'
import { ListoParaProducirCarga } from '@/features/obras/components/items/crear/ListoParaProducirCarga'
import { contarItemsDeObra } from '@/features/obras/services/estructuraService'
import { sellarYProducir } from '@/features/obras/services/actionsCrear'
import { ParteDiario } from '@/features/obras/components/parte/ParteDiario'
import { TabPlanilla } from '@/features/obras/components/planilla/TabPlanilla'
import { getPartes } from '@/features/obras/services/ejecucionService'
import { getIntegrantesPorCuadrilla } from '@/features/obras/services/personalService'
import {
  asignarActividadAPedido, borrarParte, registrarEjecucion,
} from '@/features/obras/services/actionsEjecucion'
import { TabPersonal } from '@/features/obras/components/TabPersonal'
import { TabOperacion } from '@/features/obras/components/TabOperacion'
import { AccionesDocumentos, NuevoImpedimento } from '@/features/obras/components/operacion/AccionesCabecera'
import { getOperacionObra, subDeLaUrl, type SubOperacion } from '@/features/obras/services/operacionService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getOrdenesDeObra } from '@/features/clientes/services/ordenesCliente'
import { bloqueDeOrdenesDeLaObra } from '@/features/obras/services/ordenesDeLaObra'
import { getPerfilActual } from '@/features/auth/services/authService'
import { TabDocumentos } from '@/features/obras/components/TabDocumentos'
import {
  asignarActividadADocumento, clasificarDocumento, desvincularDocumento, vincularDocumento,
} from '@/features/obras/services/actionsDocumentos'
import { FormAccion } from '@/shared/components/ui'

import { crearLector } from '@/shared/components/estado/lecturas'
import { AvisoDeLectura, EstadoError } from '@/shared/components/estado'
export const dynamic = 'force-dynamic'

export default async function ObraPage({
  params, searchParams,
}: {
  params: Promise<{ obra: string }>
  searchParams: Promise<{
    vista?: string; sub?: string; act?: string; filtro?: string; sol?: string
    /** La dotación simulada del panel de la tarea (04). Igual que en la 08: la URL es la memoria
     *  del simulador, así que el mismo link abre la misma simulación del otro lado del chat. */
    dot?: string
    /** `?nueva=1` abre el alta de actividad del árbol: es adonde lleva la primaria de la cabecera. */
    nueva?: string
    /** `?editar=1` en Cronograma abre el editor de fechas (C06): la cabecera cambia sus acciones y
     *  suma la línea de cifras. Lo lee también `TabCronograma` por `useSearchParams`. */
    editar?: string
    /** C01–C09 (crear la estructura): `?crear=presupuesto|planilla|mano`, `&panel=ponderacion|frentes|
     *  subtareas` sobre `act`, `?sel=1` (acciones masivas) y `&nuevo=<padre>` (la ficha nueva). */
    crear?: string; panel?: string; sel?: string; nuevo?: string
    /** Documentos (14): `?vincular=archivo|carpeta` abre el formulario de vincular arriba del índice. */
    vincular?: string
  }>
}) {
  const { obra: obraId } = await params
  const { vista: vistaRaw, sub, act, filtro, sol, dot, nueva, editar, crear, panel, sel, nuevo, vincular } = await searchParams
  const modoEstructura: ModoEstructura = {
    crear: crear === 'presupuesto' || crear === 'planilla' || crear === 'mano' ? crear : null,
    panel: panel === 'ponderacion' || panel === 'frentes' || panel === 'subtareas' ? panel : null,
    act: act ?? null, sel: sel === '1', nuevo: nuevo ?? null,
  }
  // UNA VISTA QUE VIVE EN OTRA RUTA SE LLEVA AHÍ, NO SE IGNORA. `?vista=dotacion` caía en Resumen
  // sin un solo aviso, y quien seguía ese link concluía que la pantalla no existía.
  const hermana = rutaHermana(vistaRaw, obraId)
  if (hermana) redirect(hermana)
  // LA VISTA Y LA SUB-VISTA SE RESUELVEN JUNTAS: el alias de una URL vieja decide también con qué
  // vista abre. `?vista=ejecucion` tiene que caer en el parte diario, no en el árbol.
  const { vista, sub: subTareas } = resolverVistaObra(vistaRaw, sub)

  const supabase = await createClient()

  // ═══ QUÉ VISTA DEL WORKSPACE SE ESTÁ MIRANDO ═══
  const enTareas = vista === 'tareas'
  const esArbol = enTareas && subTareas === 'arbol'
  const esCronograma = enTareas && subTareas === 'gantt'
  const esEditorCronograma = esCronograma && editar === '1'
  const esParte = enTareas && subTareas === 'parte'
  const esPlanilla = enTareas && subTareas === 'planilla'

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
  // QUÉ PIDE ESTA SOLAPA, decidido por una función pura y probada aparte: la matriz vive en
  // `lecturasDeVista` para que se pueda probar sin levantar el servidor ni la base, y para que
  // agregar una lectura obligue a declarar quién la usa. Los partes, por ejemplo, también en
  // Cronograma y Resumen: el panel de la actividad muestra su ejecución reciente y «último
  // movimiento» del Resumen es literalmente el último parte.
  const necesita = lecturasDeVista(vista, enTareas ? subTareas : null)
  const hoyISO = new Date().toISOString().slice(0, 10)
  // LAS CIFRAS H2 (avance ponderado y día hábil) las dibujan el Resumen (03) y la cabecera de
  // Ítems (04b). El resto de las solapas no las paga.
  const conCifras = vista === 'resumen' || esArbol
  const [
    perfilRes, obraRes, actividadesRes, restriccionesRes, planRes, planPersonalRes,
    diasHabilesRes, personasRes, ubicacion, asignacionesRes, causasRes, registrosRes,
    actividadHHRes, cuadrillas, integrantes, partesRes, economiaRes,
    documentosRes, catalogoEquipos, opRes, personasDeHoy, ordenesRes, archivosDrive, subidos,
    avanceRes, nItemsRes, diasHabilesObraRes, dependenciasRes, genteHoy, hhDeCierreRes,
  ] = await Promise.all([
    // COMERCIAL ES PRECIO, y el precio es de Dirección y Administración: el jefe de obra ve el
    // COSTO de su obra, pero no cuánto se vendió — `veEconomia`, no `esAdministracion`.
    getPerfilActual(supabase),
    getObra(supabase, obraId),
    getActividades(supabase, obraId),
    // Restricciones y plan DEJARON DE SER INCONDICIONALES (24/08): `obra_plan_vs_real` es la
    // consulta más cara del workspace —864 ms medidos contra PostgREST— y sólo la miran Resumen
    // y Personal. Las otras solapas la pagaban para tirarla. Ver `lecturasDeVista`.
    necesita.restricciones ? getRestricciones(supabase, obraId) : null,
    // ═══ EL PLAN SE PIDE EN RECORTES, NO ENTERO (25/08/2026) ═══
    // QUÉ COLUMNAS pide cada solapa lo decide la MATRIZ, no este archivo. Personal no dibuja ni
    // una fecha del plan, y no pedirlas le saca la mitad del trabajo a la consulta que hacía caer
    // la pantalla con `canceling statement due to statement timeout`. Sale UNA sola: la otra es
    // `null` porque `planColumnas` es uno solo. Y son lecturas separadas para que cada solapa
    // reciba su tipo exacto — un `Pick<>` que no compila si alguien dibuja una columna que no
    // pidió. El tercer recorte, `economia`, lo pide la pantalla de Administración desde el
    // 23/09/2026. Medido y explicado en `lecturasDeVista`.
    necesita.planColumnas === 'resumen' ? getPlanVsReal(supabase, obraId) : null,
    necesita.planColumnas === 'personal' ? getPlanDePersonal(supabase, obraId) : null,
    // Los días que ESTA obra trabaja: los sombrea el cronograma y nadie más. Reemplaza a las
    // precedencias, que hasta el 24/08 se traían acá para dibujar flechas que el canónico 07 no
    // tiene — y que en la base son CERO filas en todas las obras.
    esCronograma ? getDiasHabiles(supabase, obraId) : null,
    necesita.personas ? getPersonas(supabase) : null,
    vista === 'resumen' ? getUbicacion(supabase, obraId) : null,
    // ═══ LAS CUATRO LECTURAS DE PERSONAL PASAN POR LA MATRIZ, Y HOY LA MATRIZ DICE QUE SÍ ═══
    // Estuvieron apagadas mientras `TabPersonal` estaba importado y sin montar: la solapa juntaba
    // estas cuatro consultas más el plan para tirarlas, y ése era el gasto que la volteaba con
    // `statement timeout`. Con el render repuesto vuelven a salir, y siguen colgadas del MISMO
    // interruptor —`PERSONAL_SE_DIBUJA`, en `lecturasDeVista`— para que nunca puedan volver a
    // separarse del render. Acá no se decide: acá se obedece.
    necesita.personal ? getAsignaciones(supabase, obraId) : null,
    necesita.personal ? getCausasDesvio(supabase) : null,
    necesita.personal || esParte ? getRegistrosHH(supabase, obraId) : null,
    // Plan contra real por actividad: la publica Personal. El cronograma dejó de pedirla el 24/08
    // junto con el panel de la actividad — la 07 dibuja plazo, y las HH son de Personal.
    necesita.personal ? getActividadHH(supabase, obraId) : null,
    necesita.cuadrillas ? getCuadrillas(supabase) : [],
    esParte ? getIntegrantesPorCuadrilla(supabase) : {},
    necesita.partes ? getPartes(supabase, obraId) : null,
    // EL PANEL ECONÓMICO EN RESUMEN: la línea de margen del resumen sale de acá desde el 22/08.
    // Antes se armaba con `contratado − costo real` del plan, que no es margen. Es la misma
    // lectura que hace la pantalla de Administración; acá alimenta sólo esa línea.
    vista === 'resumen' ? getEconomiaObra(supabase, obraId) : null,
    // Los papeles los pide la solapa Documentos. El cronograma los pedía para el panel de la
    // actividad, que ya no vive ahí: el detalle de una actividad es de Tareas (mockup 03).
    vista === 'documentos' || vista === 'resumen' ? getDocumentos(supabase, obraId) : null,
    // El catálogo de equipos es AYUDA de carga, no restricción: el campo acepta cualquier texto.
    esParte ? getCatalogoEquipos(supabase) : [],
    // Operación trae sus cuatro listas de una vez: se atan a la obra por el MISMO puente
    // (`obra_alias`); si esa fuente falla, fallan juntas. Los impedimentos son tabla del OS y no
    // dependen de ese puente.
    vista === 'operacion' ? getOperacionObra(supabase, obraId) : null,
    // PERSONAS del Resumen (§25): asignadas vigentes y presentes HOY. Dos conteos con cabeza.
    vista === 'resumen' ? getPersonasDeHoy(supabase, obraId) : null,
    // LAS ÓRDENES QUE MANDÓ EL CLIENTE PARA ESTA OBRA. Viven en `cliente_orden` —bajadas de Gmail
    // al bucket— y hasta hoy sólo se veían desde `/clientes`: quien abría la ficha de la obra no
    // tenía forma de saber que la OC que la encargó estaba en el OS. La cerradura es la RLS de la
    // tabla, no esta lectura.
    // Desde el 10/09 también en RESUMEN: la ficha de la obra muestra su OC arriba, junto al
    // cliente. Es LA MISMA lectura, no una segunda — pedido del dueño: «no veo el número de OC,
    // no sé dónde está la OC ni su número una vez que entro a la obra».
    vista === 'documentos' || vista === 'resumen' ? getOrdenesDeObra(supabase, obraId) : null,
    // LO QUE HAY EN LA CARPETA DE DRIVE DE ESTA OBRA. Es distinto de `getDocumentos`: eso son los
    // papeles que alguien VINCULÓ, esto es lo que ESTÁ en la carpeta —vinculado o no—. Un plano
    // subido ayer aparece acá sin que nadie lo ate. Sale del catálogo `drive_index`, nunca de Drive
    // en vivo: la ficha se dibuja en Vercel y el token de Drive vive en la VM.
    vista === 'documentos' ? getArchivosDeEntidad(supabase, 'obra', obraId) : null,
    // LOS PAPELES QUE SE SUBEN DESDE ACÁ. Pedido del dueño (10/09): la ficha tiene que poder RECIBIR
    // documentos, no sólo listar los que ya estaban en Drive.
    vista === 'documentos' ? getDocumentosSubidos(supabase, 'obra', obraId) : null,
    conCifras ? getAvancePonderado(supabase, obraId) : null,
    // C01: la obra sin estructura se dibuja distinto, y la cabecera cambia con ella (un `head` chico).
    esArbol ? contarItemsDeObra(supabase, obraId) : null,
    // El editor del cronograma (C06) dibuja «Días hábiles: 21» en la cabecera: la misma vista.
    conCifras || esEditorCronograma ? getDiasHabilesDeObra(supabase, obraId) : null,
    vista === 'resumen' ? getDependencias(supabase, obraId) : null,
    vista === 'resumen' ? getGenteHoyPorActividad(supabase, obraId, hoyISO) : {},
    // Z01 «Lo que dejó la obra»: HH plan/real por rubro, desde `obra_actividad_hh`. Sólo el Resumen.
    vista === 'resumen' ? getActividadHH(supabase, obraId) : null,
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
  const restricciones = restriccionesRes ? lector.leer(restriccionesRes, [] as NonNullable<typeof restriccionesRes.data>) : []
  // El plan conserva su `null`: «esta obra no tiene línea base» es un hecho distinto de «no se
  // pudo leer el plan», y aplanarlo a un objeto vacío borraría esa diferencia. Son dos porque son
  // dos recortes distintos de la misma vista, y cada solapa recibe el suyo con su forma exacta.
  const plan = planRes ? lector.leer<NonNullable<typeof planRes.data> | null>(planRes, null) : null
  // El recorte de cuatro columnas que dibuja el titular de Personal. Conserva su `null` por el mismo
  // motivo que el otro: «esta obra no tiene línea base» no es «no se pudo leer el plan», y
  // `TabPersonal` sabe decir «HH plan sin cargar» en vez de un cero que la daría por cumplida.
  const planPersonal = planPersonalRes
    ? lector.leer<NonNullable<typeof planPersonalRes.data> | null>(planPersonalRes, null) : null
  const diasHabiles = diasHabilesRes ?? []
  const personas = personasRes ? lector.leer(personasRes, []) : []
  const asignaciones = asignacionesRes ? lector.leer(asignacionesRes, []) : []
  const causasDesvio = causasRes ? lector.leer(causasRes, []) : []
  const registros = registrosRes ? lector.leer(registrosRes, []) : []
  const actividadHH = actividadHHRes ? lector.leer(actividadHHRes, []) : []
  const partes = partesRes ? lector.leer(partesRes, []) : []
  const economia = economiaRes ? lector.leer(economiaRes, null) : null
  const documentos = documentosRes ? lector.leer(documentosRes, []) : []
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
  const { plan: filasDelPlan } = separarPlanYSubtareas(vivas)
  const acts = filasDelPlan
  const archivadas = todas.filter((a) => a.archivada)
  const restr = restricciones ?? []
  const abiertas = restr.filter((r) => r.estado !== 'liberada')
  // ═══ EL CONTEXTO: DÓNDE ESTOY, DE QUIÉN ES ═══
  // «← Obras», el nombre de la obra, sus campos de identidad rotulados y el ciclo de vida. Todo eso
  // vive en `CabeceraDeObra` —la MISMA que dibujan Cronograma, Dotación, Subcontratos y Avance
  // masivo— desde el 24/08: era la única cabecera del OS que existía dos veces, y las pantallas
  // hijas se habían quedado con una banda grafito propia que parecía otra aplicación.
  // TERMINADA/CERRADA/ARCHIVADA: el Resumen es la Z01 (lo que dejó la obra, antes de archivar).
  const terminada = ESTADOS_TERMINADA.includes(obra.estado)
  // LAS ÓRDENES DEL CLIENTE, YA LISTAS PARA DIBUJAR. La regla —qué es OC, qué es OP, qué es un
  // certificado de retención, y qué se escribe cuando no hay ninguna— vive en una función pura
  // probada; acá sólo se le pasa lo que trajo la consulta. `enNegro` va sin pasar a propósito: la
  // categoría B/N de `cobranzas` todavía no la puede leer la web (ver `ordenesDeLaObra.ts`).
  const ordenesDeLaObra = vista === 'resumen'
    ? bloqueDeOrdenesDeLaObra(ordenesRes, { obraId })
    : null

  const avance = avanceRes ? lector.leer(avanceRes, null) : null
  const diasHabilesObra = diasHabilesObraRes ? lector.leer(diasHabilesObraRes, null) : null
  const nDependencias = dependenciasRes ? (dependenciasRes.data?.length ?? null) : null
  // LA LÍNEA DE CIFRAS DE ÍTEMS (04b): Avance de obra · Costo teórico · Día hábil.
  const costo = costoTeorico(avance)
  // ═══ CREAR LA ESTRUCTURA (C01–C10) ═══
  // Con `?crear=`, `&panel=` o `?sel=1`, o con la obra sin trabajo cargado, la cabecera deja los KPI
  // grandes y dibuja la línea de cifras de esa pantalla (que la pantalla publica) y su primaria.
  const enEstructura = esArbol && (esModoEstructura(modoEstructura) || (nueva === '1' && nItemsRes === 0))
  const obraVacia = esArbol && nItemsRes === 0
  const modoConPrimariaPropia = modoEstructura.crear === 'presupuesto' || modoEstructura.crear === 'planilla' || modoEstructura.panel === 'ponderacion'
  // C10: la obra en Previo muestra el checklist «Listo para producir» en lugar del Resumen.
  const esListoParaProducir = vista === 'resumen' && !terminada && obra.etapa === 'previo'
  const cifrasDeItems: KpiPantalla[] = esArbol && !enEstructura && !obraVacia ? [
    { rotulo: 'Avance de obra', valor: cifraAvance(avance), falta: 'sin estructura' },
    { rotulo: 'Costo teórico', valor: costo.cifra, falta: costo.bajada },
    {
      rotulo: 'Día hábil',
      valor: diasHabilesObra?.dia_habil_actual != null ? diaHabil(diasHabilesObra).replace('día hábil ', '') : null,
      falta: diaHabil(diasHabilesObra),
    },
  ] : []
  // UNA SOLA PRIMARIA AMARILLA POR PANTALLA: el 03 y el 04 dibujan «Nueva actividad» amarilla en la
  // cabecera; el parte, personal, subcontratos y el editor del cronograma tienen la suya abajo
  // («Guardar el parte», «Asignar persona», «Nuevo paquete», «Guardar fechas»), así que ahí va con borde.
  const conPrimariaPropia = vista === 'personal' || (vista === 'tareas' && !esArbol)
  const nuevaActividad = (
    <Link href={`/obras/${obraId}?vista=tareas&sub=arbol&nueva=1`} prefetch={false}
      data-testid="cabecera-nueva-actividad"
      style={conPrimariaPropia
        ? { ...ESTILO_SECUNDARIA, height: '32px', padding: '0 14px', fontSize: '13px', border: `1px solid ${C.bordeFuerte}` }
        : { ...ESTILO_PRIMARIA, height: '32px', padding: '0 14px', fontSize: '13px', color: C.grafito }}>
      <Ico d={P.mas} s={13} />Nueva actividad
    </Link>
  )
  // LA PUERTA PARA CORREGIR LOS CAMPOS DE LA OBRA. El diseño 03 no la dibuja; va plegada al final
  // del aside porque sin ella no hay dónde cambiar el estado, la etapa o el jefe de obra.
  const editarLaObra = (
    <details data-testid="editar-obra">
      <summary style={{ cursor: 'pointer', fontSize: '12.5px', color: C.tenue }}>Editar la obra</summary>
      <div style={{ marginTop: '10px' }}>
        <FormAccion accion={editarObra.bind(null, obraId)} testid="form-editar-obra" enviar="Guardar la obra" mensajeOk="Obra guardada.">
          <CamposObra obra={obra} ubicacion={ubicacion} veEconomia={veComercial} />
        </FormAccion>
      </div>
    </details>
  )

  // C06: LAS ACCIONES DEL EDITOR VAN EN LA CABECERA, y el estado que las enciende lo tiene el editor
  // (client) montado más abajo. El provider los conecta; sólo existe con `?editar=1`.
  const Envoltorio = esEditorCronograma ? EditorCronogramaProvider : Fragment
  const cifrasDelCronograma = esEditorCronograma
    ? cifrasDelEditor({
      fechaInicioPlan: obra.fecha_inicio_plan, fechaFinPlan: obra.fecha_fin_plan, actividades: acts,
      diasHabilesPlan: diasHabilesObra?.dias_habiles_plan ?? null,
    })
    : []

  return (
    // EL WORKSPACE NO USA `PageShell`: su encabezado es el de una ENTIDAD —volver, nombre, campos
    // rotulados y ciclo de vida— y sus dos barras de navegación tienen que quedar pegadas al
    // contenido, sin el margen de una página de lectura. El marco (fondo y padding de pantalla) es
    // el mismo: 16px en el teléfono, 40px en escritorio.
    <Envoltorio>
    <div className="min-h-screen bg-canvas">
      {/* LA BANDA VA DE BORDE A BORDE (mockups 02/03/05/06): su aire de 20px es interno.
          La primaria de la obra es «Cargar parte» —la del mockup 02— y al lado el «···» con las
          cinco operaciones de todos los días. Dos amarillos en la misma línea harían leer dos
          acciones principales, así que sólo el parte lleva el color de marca. */}
      <CabeceraDeObra
        obraId={obraId}
        obra={obra}
        vistaActiva={vista}
        titulo={vista === 'resumen' ? 21 : 17}
        kpis={cifrasDeItems}
        acciones={esListoParaProducir ? (
          <PrimariaViva />
        ) : enEstructura || obraVacia ? (
          <>
            <PrimariaViva />
            {!modoConPrimariaPropia && puedeEditarPlan && nuevaActividad}
          </>
        ) : vista === 'resumen' ? (
          <>
            {/* 03: «Cargar parte» blanco con borde y «Nueva actividad» amarilla, en ese orden. */}
            <Link href={`/obras/${obraId}?vista=tareas&sub=parte`} prefetch={false}
              data-testid="cabecera-cargar-parte" style={{ ...ESTILO_SECUNDARIA, height: '32px', padding: '0 14px', fontSize: '13px', border: `1px solid ${C.bordeFuerte}` }}>
              <Ico d={P.editar} s={13} />Cargar parte
            </Link>
            {puedeEditarPlan && nuevaActividad}
          </>
        ) : esEditorCronograma ? (
          // C06: «Sellar línea base» y «Guardar fechas» junto al nombre; no hay «Nueva actividad».
          <AccionesEditorCronograma />
        ) : vista === 'operacion' ? (
          // 09: «Nuevo impedimento» amarilla sólo en Impedimentos; 10 · 11 · 12 no dibujan botón.
          subOp === 'impedimentos' ? <NuevoImpedimento obraId={obraId} /> : null
        ) : vista === 'documentos' ? (
          // 14: «Vincular documento» · «Vincular carpeta» en texto y «Abrir carpeta» amarilla.
          <AccionesDocumentos obraId={obraId} carpetaDriveId={obra.drive_carpeta_id} />
        ) : puedeEditarPlan ? nuevaActividad : null}
        lineaDeCifras={enEstructura || obraVacia ? cifrasDeCrear(modoEstructura, obraVacia) : cifrasDelCronograma}
        // EL ENLACE A LA PLATA, DISCRETO Y SÓLO PARA QUIEN LA VE. No es una solapa —el dueño la
        // sacó de acá— y no es un botón: es la puerta a la pantalla de Administración de esta obra.
        // Al jefe de obra no se le dibuja, igual que no se le dibujan las rutas de `veEconomia`.
        alFinalDeLasSolapas={veComercial ? (
          <Link href={hrefEconomia(obraId)} prefetch={false} data-testid="enlace-economia"
            className="ml-auto self-center whitespace-nowrap px-[11px] py-2 text-[12px] text-faint hover:text-ink">
            Economía
          </Link>
        ) : null}
      />
      {/* NIVEL 3 DE TRABAJO — la banda `#FAFAF8` del zip, de borde a borde. En el árbol la dibuja
          `TabTareas` y en el parte diario `ParteDiario`, porque ahí comparten renglón con lo suyo:
          el buscador y los filtros en uno, el navegador de día en el otro. */}
      {vista === 'tareas' && !esArbol && !esCronograma && !esParte && !esPlanilla && <SubNavTrabajo obraId={obraId} sub={subTareas} />}
      {/* PLANILLA (diseño ERP Obras 04c): tarea × día hábil. Lee `planilla_obra` (migración 20260923T2310). */}
      {esPlanilla && <TabPlanilla obraId={obraId} />}

      {/* LA 03 SE DIBUJA DE BORDE A BORDE: el canónico le da a la lista, al Gantt y al panel el
          ancho entero de la ventana, y el padding de 20px es interno de cada banda. */}
      {esArbol && (
        <WorkspaceTareas
          supabase={supabase} obraId={obraId} act={act} filtro={filtro} sol={sol} dot={dot}
          cuadrillas={cuadrillas} puedeEditar={puedeEditarPlan} veEconomia={veComercial}
          nueva={nueva === '1'} abiertas={abiertas} nombreObra={obra.nombre}
          modo={modoEstructura} obra={{ inicio: obra.fecha_inicio_plan, fin: obra.fecha_fin_plan }}
        />
      )}

      {/* LO QUE NO SE PUDO LEER SE DICE ARRIBA DE LA SOLAPA, Y ANTES DE ELLA. Sin este cartel, una
          consulta caída se veía como una obra sin actividades, sin partes o sin nadie asignado — el
          error dibujado como un vacío, que es lo que `INTERACTION.md` prohíbe. Va acá afuera porque
          las dos pantallas que se dibujan a sangre —el árbol y el cronograma— lo dejaban debajo del
          contenido y pegado al borde: el aviso de que falta un dato no puede leerse después. */}
      {lector.falla() && (
        <div className="px-5 pt-3.5">
          <AvisoDeLectura mensaje={lector.falla() as string} que="parte de esta ficha" testid="obra-lectura-fallida" />
        </div>
      )}

      {/* LA 07 TAMBIÉN VA A SANGRE: la banda de nivel 3 con el zoom y las capas tiene que llegar a
          los dos bordes, y el aire de 20px del mockup lo pone la pantalla adentro. */}
      {esCronograma && (
        <CronogramaDeObra
          obraId={obraId}
          actividades={acts}
          diasHabiles={diasHabiles}
          actividadAbierta={act ?? null}
          archivadas={archivadas}
          restaurar={archivarActividad.bind(null, obraId)}
          // Sellar congela el plan de hoy como lo prometido: es de Administración y de la jefatura.
          // La guarda de verdad está en la acción; esto evita ofrecer un gesto que va a ser rechazado.
          {...(puedeEditarPlan ? { sellar: sellarBaseline.bind(null, obraId) } : {})}
        />
      )}

      {/* LA 05 TAMBIÉN VA DE BORDE A BORDE: su banda de día y su aire de 14/20/24 son internos
          del módulo, y el padding de la página los duplicaría. */}
      {esParte && (
        <ParteDiario
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

      {/* El resto de las solapas sí vive en un contenedor con aire. Con el árbol o el cronograma en
          pantalla este div queda vacío y sin padding: 40px de aire fantasma se ven. */}
      <div className={esArbol || esCronograma || esParte || esPlanilla || vista === 'resumen' ? '' : 'w-full px-5 pb-6 pt-3.5'}>

      {/* LA OBRA TERMINADA ES OTRA PANTALLA (Z01/MZ1): lo que dejó, qué falta antes de archivar. */}
      {vista === 'resumen' && terminada && (
        <ResumenCierre
          obra={obra}
          plan={plan}
          abiertas={abiertas}
          obraId={obraId}
          actividades={acts}
          partes={partes}
          actividadHH={hhDeCierreRes ? lector.leer(hhDeCierreRes, []) : []}
          avance={avance}
          papelesSinClasificar={documentosRes ? documentos.filter((d) => !d.rol).length : null}
          archivar={archivarObra.bind(null, obraId, true)}
          reactivar={archivarObra.bind(null, obraId, false)}
          veComercial={veComercial}
          editar={editarLaObra}
        />
      )}

      {esListoParaProducir && (
        <ListoParaProducirCarga supabase={supabase} obraId={obraId} obra={obra} puedeSellar={puedeEditarPlan}
          sellar={sellarYProducir.bind(null, obraId)} editar={editarLaObra} />
      )}

      {vista === 'resumen' && !terminada && !esListoParaProducir && (
        <TabResumen
          obra={obra}
          plan={plan}
          personasDeHoy={personasDeHoy}
          ordenes={ordenesDeLaObra}
          economia={economia}
          abiertas={abiertas}
          obraId={obraId}
          veComercial={veComercial}
          actividades={acts}
          partes={partes}
          avance={avance}
          diasHabiles={diasHabilesObra}
          nDependencias={nDependencias}
          genteHoy={genteHoy}
          editar={editarLaObra}
        />
      )}

      {/* ═══ LA 09 VA EN EL CONTENEDOR CON AIRE, Y SU BANDA SE VA A SANGRE SOLA ═══
          A diferencia de la 03/05/07 —que se montan arriba, fuera de este div— Personal se monta
          ACÁ ADENTRO, igual que Operación (11) y Documentos (12), que dibujan LA MISMA banda:
          `ListaHoyEnObra` sale del marco con `-mx-5`, que es exactamente el `px-5` de este
          contenedor. Montarla de borde a borde la haría salirse 20px por lado y la página
          scrollearía de costado — el defecto medido el 24/08 (`scrollWidth` 1300 contra `innerWidth`
          1280) que dejó anclado `canonico-personal.test.ts`.

          ESTE RENDER ES LO QUE PAGAN LAS SIETE CONSULTAS de arriba: mientras faltó, la solapa las
          disparaba para tirarlas. Las dos cosas están atadas por `PERSONAL_SE_DIBUJA` y por el test
          `lecturasDeVista.test.ts`, que se pone rojo si alguien vuelve a separarlas. */}
      {vista === 'personal' && (
        <TabPersonal
          obraId={obraId}
          plan={planPersonal}
          asignaciones={asignaciones}
          personas={personas}
          cuadrillas={cuadrillas}
          actividades={acts}
          actividadHH={actividadHH}
          registros={registros}
          causas={causasDesvio}
          // `.bind(null, obraId)` Y NO UNA ARROW, por lo mismo que en Operación: una arrow escrita
          // acá es una función NUEVA creada en el servidor y React la rechaza en el navegador con
          // «Functions cannot be passed directly to Client Components». Ni el typecheck ni el build
          // lo ven. Y el `obraId` va en el `bind`, nunca en un campo del formulario.
          asignar={asignarPersona.bind(null, obraId)}
          cerrar={cerrarAsignacion.bind(null, obraId)}
          quitar={quitarAsignacion.bind(null, obraId)}
          imputar={imputarHH.bind(null, obraId)}
          imputarMasivo={imputarHHMasivo.bind(null, obraId)}
          borrarHoras={borrarHH.bind(null, obraId)}
        />
      )}

      {/* OPERACIÓN (09–12 · M12–M15): todo nuevo desde el 23/09/2026. Equipos sale del modelo de
          Herramientas (`operacion.equipos`); Compras sólo para quien ve economía. `?nuevo=1` abre el
          alta del impedimento (la primaria de la cabecera y la del pie del teléfono llevan ahí). */}
      {vista === 'operacion' && (
        <TabOperacion
          sub={subOp}
          obraId={obraId}
          nombreObra={obra.nombre}
          errorFuente={opRes?.error ?? null}
          pedidos={operacion?.pedidos ?? []}
          compras={operacion?.compras ?? {
            filas: [], total: null, nComprobantes: null, completo: false, manoDeObra: null, sinImputarEmpresa: null, imputadoEmpresa: null,
          }}
          equipos={operacion?.equipos ?? null}
          impedimentos={restr}
          actividades={acts}
          veEconomia={veComercial}
          nuevo={nuevo === '1'}
          hoyIso={hoyISO}
          // `.bind(null, obraId)` Y NO UNA ARROW. Una arrow escrita acá es una función NUEVA
          // creada en el servidor, no la acción: React la rechaza en tiempo de ejecución con
          // «Functions cannot be passed directly to Client Components» y la solapa queda en blanco.
          // Ni el typecheck ni el build lo ven —las firmas son idénticas—; sólo el navegador.
          crearImpedimento={crearImpedimento.bind(null, obraId)}
          liberarImpedimento={liberarImpedimento.bind(null, obraId)}
          asignarActividadAPedido={asignarActividadAPedido.bind(null, obraId)}
        />
      )}

      {/* DOCUMENTOS (14 · M17): todo nuevo desde el 23/09/2026. Los papeles del cliente, el índice y
          los dos bloques del pie (subidos desde acá · en la carpeta de Drive) los dibuja la solapa. */}
      {vista === 'documentos' && (
        <TabDocumentos
          obraId={obraId}
          documentos={documentos}
          ordenes={ordenesRes}
          veEconomia={veComercial}
          actividades={acts}
          carpetaDriveId={obra.drive_carpeta_id}
          subidos={subidos}
          archivosDrive={archivosDrive}
          vincularAbierto={vincular === 'archivo' || vincular === 'carpeta' ? vincular : null}
          vincular={vincularDocumento.bind(null, obraId)}
          desvincular={desvincularDocumento.bind(null, obraId)}
          asignarActividad={asignarActividadADocumento.bind(null, obraId)}
          clasificar={clasificarDocumento.bind(null, obraId)}
        />
      )}
      </div>
    </div>
    </Envoltorio>
  )
}
