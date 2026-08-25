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
  getActividades, getDiasHabiles, getDocumentos, getEconomiaObra, getObra, getPlanDeEconomia,
  getPlanDePersonal, getPlanVsReal, getRestricciones, getUbicacion,
} from '@/features/obras/services/obrasService'
import {
  getActividadHH, getAsignaciones, getCausasDesvio, getCuadrillas, getPersonas, getPersonasDeHoy,
  getRegistrosHH,
} from '@/features/obras/services/personalService'
import { getCertificados } from '@/features/obras/services/contratoService'
import {
  archivarActividad, archivarObra, crearImpedimento, editarObra, liberarImpedimento, sellarBaseline,
} from '@/features/obras/services/actions'
import {
  asignarPersona, cerrarAsignacion, quitarAsignacion,
} from '@/features/obras/services/actionsPersonal'
import { getCatalogoEquipos } from '@/features/obras/services/recursosService'
import { borrarHH, imputarHH, imputarHHMasivo } from '@/features/obras/services/actionsHH'
import { borrarCertificado, crearCertificado } from '@/features/obras/services/actionsContrato'
import { AccionesRapidas } from '@/features/obras/components/AccionesRapidas'
import { ESTILO_PRIMARIA } from '@/features/obras/components/canon/tokens'
import { Ico, P } from '@/features/obras/components/canon/Ico'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { TabResumen } from '@/features/obras/components/TabResumen'
import { CronogramaDeObra } from '@/features/obras/components/CronogramaDeObra'
import { lecturasDeVista } from '@/features/obras/services/lecturasDeVista'
import { separarPlanYSubtareas } from '@/features/obras/services/subtareas'
import { resolverVistaObra } from '@/features/obras/services/vistasObra'
import { SubNavTrabajo } from '@/features/obras/components/SubNavTrabajo'
import { WorkspaceTareas } from '@/features/obras/components/WorkspaceTareas'
import { ParteDiario } from '@/features/obras/components/parte/ParteDiario'
import { getPartes } from '@/features/obras/services/ejecucionService'
import { getIntegrantesPorCuadrilla } from '@/features/obras/services/personalService'
import {
  asignarActividadAPedido, borrarParte, registrarEjecucion,
} from '@/features/obras/services/actionsEjecucion'
import { TabPersonal } from '@/features/obras/components/TabPersonal'
import { TabOperacion } from '@/features/obras/components/TabOperacion'
import { getOperacionObra, subDeLaUrl, type SubOperacion } from '@/features/obras/services/operacionService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getPerfilActual } from '@/features/auth/services/authService'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { TabDocumentos } from '@/features/obras/components/TabDocumentos'
import {
  asignarActividadADocumento, clasificarDocumento, desvincularDocumento, vincularDocumento,
} from '@/features/obras/services/actionsDocumentos'
import { BotonAccion, FormAccion } from '@/shared/components/ui'

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
  }>
}) {
  const { obra: obraId } = await params
  const { vista: vistaRaw, sub, act, filtro, sol, dot } = await searchParams
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
  // QUÉ PIDE ESTA SOLAPA, decidido por una función pura y probada aparte: la matriz vive en
  // `lecturasDeVista` para que se pueda probar sin levantar el servidor ni la base, y para que
  // agregar una lectura obligue a declarar quién la usa. Los partes, por ejemplo, también en
  // Cronograma y Resumen: el panel de la actividad muestra su ejecución reciente y «último
  // movimiento» del Resumen es literalmente el último parte.
  const necesita = lecturasDeVista(vista, enTareas ? subTareas : null)
  const [
    perfilRes, obraRes, actividadesRes, restriccionesRes, planRes, planPersonalRes, planEconomiaRes,
    diasHabilesRes, personasRes, ubicacion, asignacionesRes, causasRes, registrosRes,
    actividadHHRes, cuadrillas, integrantes, partesRes, certificadosRes, economiaRes,
    documentosRes, catalogoEquipos, opRes, personasDeHoy,
  ] = await Promise.all([
    // COMERCIAL ES PRECIO, y el precio es de Dirección y Administración: el jefe de obra ve el
    // COSTO de su obra, pero no cuánto se vendió — `veEconomia`, no `esAdministracion`.
    getPerfilActual(supabase),
    getObra(supabase, obraId),
    getActividades(supabase, obraId),
    // Restricciones y plan DEJARON DE SER INCONDICIONALES (24/08): `obra_plan_vs_real` es la
    // consulta más cara del workspace —864 ms medidos contra PostgREST— y sólo la miran Resumen,
    // Personal y Economía. Las otras tres solapas la pagaban para tirarla. Ver `lecturasDeVista`.
    necesita.restricciones ? getRestricciones(supabase, obraId) : null,
    // ═══ EL PLAN SE PIDE EN TRES RECORTES, NO EN UNO (25/08/2026) ═══
    // QUÉ COLUMNAS pide cada solapa lo decide la MATRIZ, no este archivo. Personal y Economía no
    // dibujan ni una fecha del plan, y no pedirlas le saca la mitad del trabajo a la consulta que
    // hacía caer la pantalla con `canceling statement due to statement timeout`. Sale UNA sola de
    // las tres: las otras dos son `null` porque `planColumnas` es uno solo. Y son tres lecturas
    // separadas para que cada solapa reciba su tipo exacto — un `Pick<>` que no compila si alguien
    // dibuja una columna que no pidió. Medido y explicado en `lecturasDeVista`.
    necesita.planColumnas === 'resumen' ? getPlanVsReal(supabase, obraId) : null,
    necesita.planColumnas === 'personal' ? getPlanDePersonal(supabase, obraId) : null,
    necesita.planColumnas === 'economia' ? getPlanDeEconomia(supabase, obraId) : null,
    // Los días que ESTA obra trabaja: los sombrea el cronograma y nadie más. Reemplaza a las
    // precedencias, que hasta el 24/08 se traían acá para dibujar flechas que el canónico 07 no
    // tiene — y que en la base son CERO filas en todas las obras.
    esCronograma ? getDiasHabiles(supabase, obraId) : null,
    necesita.personas ? getPersonas(supabase) : null,
    vista === 'resumen' ? getUbicacion(supabase, obraId) : null,
    // ═══ LAS CUATRO LECTURAS DE PERSONAL PASAN POR LA MATRIZ, Y HOY LA MATRIZ DICE QUE NO ═══
    // `TabPersonal` está importado más arriba y NUNCA se monta en este JSX: la solapa juntaba estas
    // cuatro consultas más el plan para tirarlas, y ése era el gasto que la volteaba con `statement
    // timeout`. El interruptor —y cómo se vuelve a prender cuando el render regrese— está en
    // `PERSONAL_SE_DIBUJA`, en `lecturasDeVista`. Acá no se decide: acá se obedece.
    necesita.personal ? getAsignaciones(supabase, obraId) : null,
    necesita.personal ? getCausasDesvio(supabase) : null,
    necesita.personal || esParte ? getRegistrosHH(supabase, obraId) : null,
    // Plan contra real por actividad: la publica Personal. El cronograma dejó de pedirla el 24/08
    // junto con el panel de la actividad — la 07 dibuja plazo, y las HH son de Personal.
    necesita.personal ? getActividadHH(supabase, obraId) : null,
    necesita.cuadrillas ? getCuadrillas(supabase) : [],
    esParte ? getIntegrantesPorCuadrilla(supabase) : {},
    necesita.partes ? getPartes(supabase, obraId) : null,
    vista === 'economia' ? getCertificados(supabase, obraId) : null,
    // EL PANEL ECONÓMICO TAMBIÉN EN RESUMEN: la línea de margen del resumen sale de acá desde el
    // 22/08. Antes se armaba con `contratado − costo real` del plan, que no es margen.
    vista === 'economia' || vista === 'resumen' ? getEconomiaObra(supabase, obraId) : null,
    // Los papeles los pide la solapa Documentos. El cronograma los pedía para el panel de la
    // actividad, que ya no vive ahí: el detalle de una actividad es de Tareas (mockup 03).
    vista === 'documentos' ? getDocumentos(supabase, obraId) : null,
    // El catálogo de equipos es AYUDA de carga, no restricción: el campo acepta cualquier texto.
    esParte ? getCatalogoEquipos(supabase) : [],
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
  const restricciones = restriccionesRes ? lector.leer(restriccionesRes, [] as NonNullable<typeof restriccionesRes.data>) : []
  // El plan conserva su `null`: «esta obra no tiene línea base» es un hecho distinto de «no se
  // pudo leer el plan», y aplanarlo a un objeto vacío borraría esa diferencia. Son tres porque son
  // tres recortes distintos de la misma vista, y cada solapa recibe el suyo con su forma exacta.
  const plan = planRes ? lector.leer<NonNullable<typeof planRes.data> | null>(planRes, null) : null
  const planEconomia = planEconomiaRes
    ? lector.leer<NonNullable<typeof planEconomiaRes.data> | null>(planEconomiaRes, null) : null
  // ═══ PERSONAL PIDE SU RECORTE Y HOY NO LO DIBUJA NADIE ═══
  // `TabPersonal` se importa en este archivo pero NUNCA se monta: `?vista=personal` paga sus siete
  // consultas para no pintar una sola fila. No se borran las lecturas —la solapa está en la
  // navegación y el componente existe entero, así que le falta el render, no los datos— pero
  // tampoco se finge que el resultado se usa. Se pasa por el lector para que un fallo de esa
  // consulta salga en el cartel de arriba en vez de desaparecer en silencio.
  if (planPersonalRes) lector.leer(planPersonalRes, null)
  const diasHabiles = diasHabilesRes ?? []
  const personas = personasRes ? lector.leer(personasRes, []) : []
  const asignaciones = asignacionesRes ? lector.leer(asignacionesRes, []) : []
  const causasDesvio = causasRes ? lector.leer(causasRes, []) : []
  const registros = registrosRes ? lector.leer(registrosRes, []) : []
  const actividadHH = actividadHHRes ? lector.leer(actividadHHRes, []) : []
  const partes = partesRes ? lector.leer(partesRes, []) : []
  const certificados = certificadosRes ? lector.leer(certificadosRes, []) : []
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
  // `archivada` se sigue calculando acá porque el bloque de archivar del Resumen lo necesita.
  const archivada = obra.estado === 'cerrada'

  return (
    // EL WORKSPACE NO USA `PageShell`: su encabezado es el de una ENTIDAD —volver, nombre, campos
    // rotulados y ciclo de vida— y sus dos barras de navegación tienen que quedar pegadas al
    // contenido, sin el margen de una página de lectura. El marco (fondo y padding de pantalla) es
    // el mismo: 16px en el teléfono, 40px en escritorio.
    <div className="min-h-screen bg-canvas">
      {/* LA BANDA VA DE BORDE A BORDE (mockups 02/03/05/06): su aire de 20px es interno.
          La primaria de la obra es «Cargar parte» —la del mockup 02— y al lado el «···» con las
          cinco operaciones de todos los días. Dos amarillos en la misma línea harían leer dos
          acciones principales, así que sólo el parte lleva el color de marca. */}
      <CabeceraDeObra
        obraId={obraId}
        obra={obra}
        vistaActiva={vista}
        acciones={
          <>
            <Link href={`/obras/${obraId}?vista=tareas&sub=parte`} prefetch={false}
              data-testid="cabecera-cargar-parte" style={ESTILO_PRIMARIA}>
              <Ico d={P.editar} s={14} />Cargar parte
            </Link>
            <AccionesRapidas obraId={obraId} />
          </>
        }
      />
      {/* NIVEL 3 DE TRABAJO — la banda `#FAFAF8` del zip, de borde a borde. En el árbol la dibuja
          `TabTareas` y en el parte diario `ParteDiario`, porque ahí comparten renglón con lo suyo:
          el buscador y los filtros en uno, el navegador de día en el otro. */}
      {vista === 'tareas' && !esArbol && !esCronograma && !esParte && <SubNavTrabajo obraId={obraId} sub={subTareas} />}

      {/* LA 03 SE DIBUJA DE BORDE A BORDE: el canónico le da a la lista, al Gantt y al panel el
          ancho entero de la ventana, y el padding de 20px es interno de cada banda. */}
      {esArbol && (
        <WorkspaceTareas
          supabase={supabase} obraId={obraId} act={act} filtro={filtro} sol={sol} dot={dot}
          cuadrillas={cuadrillas} puedeEditar={puedeEditarPlan} veEconomia={veComercial}
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
      <div className={esArbol || esCronograma || esParte ? '' : 'w-full px-5 pb-6 pt-3.5'}>

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
          plan={planEconomia}
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
