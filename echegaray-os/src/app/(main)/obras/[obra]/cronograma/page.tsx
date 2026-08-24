// 07 · OBRA CRONOGRAMA — el motor de camino crítico, visible.
//
// ═══ LO QUE ESTA PANTALLA SE NIEGA A DIBUJAR ═══
//
// Las cinco obras con actividades fechadas tienen CERO dependencias cargadas. Sin dependencias el
// motor devuelve todo arrancando el día 1 —es lo correcto: nada secuencia a nada— y por eso
// `armarCronograma` devuelve `finObra: null` y `sinSecuencia: true`. Acá eso se dice con todas las
// letras y se ofrece cargar la secuencia. Encadenar barras sobre una obra sin secuencia sería una
// barra que miente, y la mentira sobreviviría a la explicación.
//
// El dato «si todo pasara en paralelo» existe y se muestra ROTULADO como lo que es. Es información
// —dice el piso teórico del plazo— pero no es un fin de obra y no se llama así.
//
// ═══ EL ESTADO VIVE EN LA URL ═══
//
// Vista, escala, capas, actividad seleccionada y días del arrastre son parámetros. Un cronograma que
// se mira entre dos personas se manda por chat: si el estado viviera en el navegador, el link
// abriría otra pantalla del otro lado. La ÚNICA excepción es plegar un frente —no cambia lo que el
// cronograma dice, sólo cuánto entra en la pantalla de quien lo está mirando.
//
// ═══ TRES CAPAS, Y CADA UNA ES UNA AFIRMACIÓN DISTINTA (Design 23/08 · 07) ═══
//
// La línea BASE es lo que se prometió al sellar; la barra es el plan de hoy con su avance; la
// PROYECCIÓN es lo que va a pasar al rendimiento observado. Se superponen porque el desvío ES la
// diferencia entre capas: en tres pantallas separadas hay que recordarla de memoria. La base se
// puede apagar (`?base=0`) y la proyección es el modo del motor, no un dibujo encima.
//
// ═══ ESTA PANTALLA NO HABLA DE PLATA ═══
//
// Lee `obra_actividad_control` con la sesión del usuario y pide sólo columnas de tiempo, HH y
// avance. El jefe de obra ve plazo, HH, dotación y capacidad; costo y margen ni se piden.
//
// ═══ Y DESDE HOY ESCRIBE EL PLAN ═══
//
// Arrastrar una barra, cambiar la duración de una actividad y declarar una precedencia se hacen acá,
// donde se ve la consecuencia. Antes se simulaba acá y se guardaba en otra pantalla: el jefe hacía
// la cuenta mirando el Gantt y después la copiaba a mano, así que el plan del sistema y el plan de
// la obra eran dos cosas distintas.
//
// La línea base NO se toca desde ninguno de esos gestos: `inicio_base`/`fin_base` son contra qué se
// mide el desvío y sólo los escribe el sellado. Ver `actionsPlan.ts`.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { getInsumosCronograma } from '@/features/obras/services/cronogramaObraService'
import { getObra } from '@/features/obras/services/obrasService'
import { armarCronograma, simularArrastre } from '@/features/obras/services/cronogramaMotor'
import { moverActividad } from '@/features/obras/services/actionsPlan'
import {
  celdasDe, construirEscalaCronograma, UNIDADES, UNIDAD_LABEL, ventanaDe, type UnidadEscala,
} from '@/features/obras/services/escalaCronograma'
import {
  esVista, filasDeVista, hrefCronograma, VISTAS, VISTA_LABEL, type EstadoUrl, type Vista,
} from '@/features/obras/services/vistaCronograma'
import { metricasDelPlazo } from '@/features/obras/services/metricasCronograma'
import { LienzoCronogramaObra } from '@/features/obras/components/LienzoCronogramaObra'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { SubTabsTrabajo } from '@/features/obras/components/SubTabsTrabajo'
import { PopoverArrastre } from '@/features/obras/components/PopoverArrastre'
import {
  Conflictos, Dependencias, PlanDeLaSeleccionada, textosDeConflicto,
} from '@/features/obras/components/PanelesCronograma'
import { Callout } from '@/shared/components/ui'
import { Ayuda, Franja, Plegable } from '@/shared/components/ds'
import { CalendarioObra } from '../../../../../../orquestador/lib/calendario-obra.mjs'

export const dynamic = 'force-dynamic'

type Params = Promise<{ obra: string }>
type Search = Promise<{
  vista?: string; escala?: string; sel?: string; mover?: string; proyeccion?: string; base?: string
}>

const esUnidad = (u: string | undefined): u is UnidadEscala => UNIDADES.includes(u as UnidadEscala)
const fmt = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

/** El delta de un arrastre se acota. Un `?mover=99999` desde la barra de direcciones no puede
 *  hacer que el motor recorra un siglo de calendario para contestar una pregunta que nadie hizo. */
function deltaValido(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return null
  return Math.max(-365, Math.min(365, n))
}

export default async function CronogramaObraPage(
  { params, searchParams }: { params: Params; searchParams: Search },
) {
  const { obra: obraId } = await params
  const sp = await searchParams
  const vista: Vista = esVista(sp.vista) ? sp.vista : 'actividades'
  const unidad: UnidadEscala = esUnidad(sp.escala) ? sp.escala : 'semana'
  const enProyeccion = sp.proyeccion === '1'
  const verBase = sp.base !== '0'
  const supabase = await createClient()

  // La obra viaja por el «Fin plan» del encabezado y NADA MÁS: es la misma fecha que muestran la
  // cabecera de la ficha y el Resumen, publicada por `obra_fechas`. Calcularla acá con otro
  // `max(fin_plan)` propio era la cuarta cuenta del mismo número en la misma pantalla.
  const [{ data: insumos, error }, perfil, { data: obra }] = await Promise.all([
    getInsumosCronograma(supabase, obraId),
    getPerfilActual(supabase),
    getObra(supabase, obraId),
  ])
  // Reprogramar el plan corre fechas de entrega: es de Administración y de la jefatura de obra. La
  // guarda de verdad está en la acción —la misma se puede invocar sin pasar por el botón—; esto
  // evita ofrecer un gesto que va a ser rechazado. Falla al nivel MENOS privilegiado.
  const puedeEditarPlan = esAdministracion(perfil.data?.rol ?? null)
  if (error?.startsWith(`la obra ${obraId} no existe`)) notFound()
  if (error || !insumos) {
    return (
      <main className="p-4 lg:p-8">
        <Callout tono="neg">No pude leer el cronograma: {error ?? 'sin datos'}</Callout>
      </main>
    )
  }
  // La cabecera de la obra necesita la obra: sin ficha no hay nombre, ni cliente, ni etapa que
  // mostrar. `getObra` devuelve la ausencia como ausencia —no como error—, así que se decide acá.
  // Que `insumos` haya leído no alcanza: son dos consultas y la segunda puede no traer nada.
  if (!obra) notFound()

  const hoy = new Date().toISOString().slice(0, 10)
  const crono = armarCronograma(insumos, enProyeccion ? 'proyeccion' : 'plan', hoy)
  // EL DESVÍO SE MIDE EN DÍAS DE TRABAJO DE ESTA OBRA, no en días corridos: un fin de semana no es
  // atraso, y contarlo así infla dos días cada semana de desvío. El calendario es el mismo que usa
  // el motor para ubicar las barras.
  const calendario = new CalendarioObra(insumos.obra.dias_habiles ?? [1, 2, 3, 4, 5], insumos.noLaborables)
  const desvioDe = (finBase: string, fin: string) => calendario.indice(finBase, fin)
  const filas = filasDeVista(crono, vista, desvioDe)
  const ventana = ventanaDe(
    // LA VENTANA TIENE QUE ABARCAR TAMBIÉN LA LÍNEA BASE. Una actividad que se adelantó dibujaría
    // su base fuera del lienzo —o sea, no la dibujaría— y el desvío que la pantalla existe para
    // mostrar sería justo el que no se ve.
    filas.flatMap((f) => [{ inicio: f.inicio, fin: f.fin }, { inicio: f.inicioBase, fin: f.finBase }]),
  )
  const escala = ventana ? construirEscalaCronograma(ventana, unidad, hoy) : null

  const seleccionada = sp.sel && crono.actividades.some((a) => a.actividad_id === sp.sel) ? sp.sel : null
  const delta = seleccionada ? deltaValido(sp.mover) : null
  const arrastre = delta != null && seleccionada
    ? simularArrastre(insumos, seleccionada, delta, hoy)
    : null

  const estadoUrl: EstadoUrl = {
    vista, escala: unidad, sel: seleccionada, mover: delta, proyeccion: enProyeccion, base: verBase,
  }
  const href = (cambios: Partial<EstadoUrl>) => hrefCronograma(obraId, estadoUrl, cambios)

  const filaSel = crono.actividades.find((a) => a.actividad_id === seleccionada) ?? null
  const nombreSel = filaSel?.nombre ?? null

  return (
    // LA MISMA CABECERA QUE EL WORKSPACE (24/08 · C-CANON §12). Esta pantalla vivía en una banda
    // grafito propia: entrar al cronograma parecía entrar a otra aplicación y no había forma de
    // saltar a Personal o a Economía sin volver primero al workspace. El marco es el del OS —16px
    // en el teléfono, 40px en escritorio— igual que el workspace, no el `px-4 lg:px-8` de antes.
    <main className="min-h-screen bg-canvas pb-10">
      <div className="w-full px-4 pt-6 lg:px-10">
        <CabeceraDeObra
          obraId={obraId}
          obra={obra}
          // Cronograma ES Trabajo: el contrato (07) marca esa solapa activa aunque la URL no sea la
          // del workspace. `pantalla` es lo único que distingue esta pantalla de las otras dos que
          // comparten solapa —Subcontratos y Avance masivo—.
          vistaActiva="tareas"
          pantalla="Cronograma calculado"
          // ═══ LA MISMA MÉTRICA NO SE PUBLICA DOS VECES EN LA MISMA PANTALLA (24/08) ═══
          //
          // Acá arriba decían «Fin plan · Fin de obra · Crítico» y 1.200px más abajo la franja del
          // canónico 07 dice «Fin de línea base · Fin calculado · Camino crítico» — los mismos tres
          // números, con dos rótulos distintos cada uno. Dos versiones del mismo dato en una
          // pantalla obligan a comparar antes de creer, y la franja gana: es la del contrato, tiene
          // el desvío contra la base y la holgura, que acá no entraban.
          //
          // Queda `Sin plan`, que la franja NO dice: 25 actividades sin fechas cambian lo que
          // significa todo el resto del cronograma y hay que verlo antes de mirarlo.
          kpis={[
            { rotulo: 'Sin plan', valor: `${crono.sinPlan.length} act.` },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-4 lg:px-10">
        {/* Nivel 3 (canónico 07): las cuatro maneras de operar el trabajo de la obra. Sin esto,
            desde el cronograma no se podía llegar al parte diario ni a los subcontratos sin volver
            al workspace — la cabecera marca «Trabajo» y ahí se terminaba la navegación.
            NINGUNA queda activa a propósito: esta pantalla no es ninguna de las cuatro. Ver el
            bloque «por qué en la 07 no queda ninguna activa» de `SubTabsTrabajo`. */}
        <SubTabsTrabajo obraId={obraId} activa="ninguna" />

        <Barra
          vista={vista} unidad={unidad} enProyeccion={enProyeccion} verBase={verBase} href={href}
        />

        {/* EL PÁRRAFO SE PLIEGA, EL HECHO NO (Design 23/08). Que la obra no tenga secuencia hay que
            verlo siempre —cambia lo que significa todo lo de abajo— pero el porqué se lee una vez. */}
        {crono.sinSecuencia && (
          <Callout tono="warn">
            <strong>Sin secuencia cargada.</strong>{' '}
            {crono.actividades.length} actividades con fechas, sin encadenar.{' '}
            <Link href={`/obras/${obraId}?vista=cronograma`} className="font-medium underline">
              Cargar la secuencia
            </Link>
            <Ayuda titulo="Qué no se puede calcular" testid="ayuda-sin-secuencia">
              Sin dependencias no hay camino crítico ni fin de obra: nada secuencia a nada.
              {crono.finObraSiTodoEnParalelo && (
                <> Si todo pasara en paralelo terminarían el{' '}
                  <span className="tnum font-semibold">{fmt(crono.finObraSiTodoEnParalelo)}</span> — es
                  el piso teórico del plazo, no una fecha de entrega.
                </>
              )}
            </Ayuda>
          </Callout>
        )}

        {!escala && vista === 'critico' && (
          <Callout tono="warn">
            No hay camino crítico que mostrar. {crono.sinSecuencia
              ? 'Sin dependencias cargadas, «crítica» sólo querría decir «la más larga»: pintar de naranja la actividad más larga de una lista sería inventar un camino crítico.'
              : 'Ninguna actividad quedó sin holgura.'}
          </Callout>
        )}

        {!escala && vista !== 'critico' && (
          <Callout tono="warn">
            Ninguna actividad de esta vista tiene fechas calculables: falta el análisis
            (días de plan, o HH y capacidad de la cuadrilla). No hay barras que dibujar.
          </Callout>
        )}

        {escala && (
          <LienzoCronogramaObra
            filas={filas}
            escala={escala}
            diasVentana={celdasDe(escala.desde, escala.hasta)}
            obraId={obraId}
            estadoUrl={estadoUrl}
            dependencias={insumos.dependencias}
            // Los días que ESTA obra trabaja, los mismos que usa el calendario del desvío: el
            // lienzo sombrea los otros. Asumir sábado y domingo pintaría de franco los sábados de
            // una obra que trabaja los sábados.
            diasHabiles={insumos.obra.dias_habiles ?? [1, 2, 3, 4, 5]}
          />
        )}

        {arrastre && seleccionada && nombreSel && delta != null && (
          <PopoverArrastre
            nombre={nombreSel}
            dias={delta}
            arrastre={arrastre}
            conflictos={textosDeConflicto(crono)}
            hrefCancelar={href({ mover: null })}
            puedeEditar={puedeEditarPlan}
            // `.bind`, no una arrow: una función creada en un Server Component no cruza a un
            // componente cliente, compila igual y deja la pantalla en blanco en producción.
            mover={moverActividad.bind(null, obraId, seleccionada, delta)}
          />
        )}

        {/* ═══ EL CRONOGRAMA ES LA PANTALLA; LO DEMÁS ES EL DETALLE (24/08 · canónico 07) ═══
            Los tres paneles ocupaban media pantalla debajo del lienzo y los tres arrancan vacíos
            —«Tocá una actividad»—: el que entra a mirar el plan paga ese alto todos los días para
            leer tres invitaciones. Se pliegan, no se borran: editar la duración, ver de qué depende
            una actividad y saber si dos frentes piden la misma cuadrilla siguen a un clic.
            La alerta de conflictos viaja a la fila CERRADA — un choque de recursos no puede
            esperar a que alguien abra la sección. */}
        <Plegable titulo="Más detalle" testid="mas-detalle-cronograma"
          {...(crono.conflictos.length > 0 ? { alerta: `${crono.conflictos.length} conflicto(s) de recurso` } : {})}>
          <div className="grid gap-4 lg:grid-cols-2">
            <PlanDeLaSeleccionada
              obraId={obraId} fila={filaSel} puedeEditar={puedeEditarPlan} jornada={crono.jornada}
            />
            <Dependencias
              crono={crono} insumos={insumos} seleccionada={seleccionada}
              obraId={obraId} puedeEditar={puedeEditarPlan}
            />
          </div>
          <div className="pt-4">
            <Conflictos crono={crono} />
          </div>
        </Plegable>
      </div>
      {/* AL PIE Y COMO TARJETA (mockup 07): la franja es el cierre de la pantalla, no una barra
          flotante. Lleva el mismo marco que el resto del contenido, o queda 20px más ancha que el
          cronograma que resume. */}
      <div className="px-4 pt-3 lg:px-10">
        <Franja metricas={metricasDelPlazo(filas, crono, enProyeccion, desvioDe)} testid="franja-cronograma" />
      </div>
    </main>
  )
}

/**
 * LA BARRA DE LA VISTA — vistas, zoom y capas.
 *
 * ═══ LAS CAPAS SON LA LEYENDA (Design 23/08 · 07) ═══
 *
 * Antes había un interruptor de proyección y, aparte, una leyenda de seis muestras al pie. Eran las
 * mismas seis cosas dichas dos veces: la muestra de color al lado del interruptor dice qué se
 * enciende Y con qué se dibuja, y el que no lo enciende no necesita saber de qué color es.
 */
function Barra({ vista, unidad, enProyeccion, verBase, href }: {
  vista: Vista
  unidad: UnidadEscala
  enProyeccion: boolean
  verBase: boolean
  href: (c: Partial<EstadoUrl>) => string
}) {
  return (
    // LA BANDA DE VISTA, A SANGRE (mockup 07): fondo #FAFAF8 y hairline abajo, de borde a borde de
    // la pantalla. Sin la banda, las vistas y los controles flotaban sobre el canvas y no se leía
    // que gobiernan lo de abajo. Los márgenes negativos son los del marco de la página.
    <div className="-mx-4 flex flex-wrap items-center gap-x-[14px] gap-y-1 border-y border-line bg-surface-quiet px-4 lg:-mx-10 lg:px-10">
      <div className="flex items-stretch">
        {VISTAS.map((v) => (
          <Link
            key={v} href={href({ vista: v, mover: null })} scroll={false}
            className={`px-2.5 py-[9px] text-[12.5px] ${vista === v
              ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--os-accent)]'
              : 'text-muted hover:text-ink'}`}
          >
            {VISTA_LABEL[v]}
          </Link>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2 py-[5px]">
        {/* Control segmentado en GRAFITO: el zoom es una vista, no una selección de marca. El
            amarillo queda reservado para el hito de hoy y para la fila seleccionada. */}
        <div className="flex items-center overflow-hidden rounded-control border border-line" data-testid="escala-cronograma">
          {UNIDADES.map((u) => (
            <Link
              key={u} href={href({ escala: u })} scroll={false}
              className={`border-r border-line px-[11px] py-[5px] text-[12px] last:border-r-0 ${
                unidad === u ? 'bg-accent font-semibold text-white' : 'bg-surface text-ink-soft hover:text-ink'
              }`}
            >
              {UNIDAD_LABEL[u]}
            </Link>
          ))}
        </div>
        <Capa
          activa={verBase} href={href({ base: !verBase })} testid="capa-base"
          titulo="Lo que se prometió al sellar la línea base"
          muestra={<span className="h-[4px] w-[10px] rounded-[2px] bg-line-strong" />}
        >
          Línea base
        </Capa>
        <Capa
          activa={enProyeccion} href={href({ proyeccion: !enProyeccion, mover: null })} testid="capa-proyeccion"
          titulo="Lo que va a pasar con el rendimiento observado hasta hoy"
          muestra={<span className="h-[13px] w-[10px] border-t-[1.5px] border-dashed border-neg" />}
        >
          Proyección
        </Capa>
      </div>
    </div>
  )
}

function Capa({ activa, href, titulo, muestra, testid, children }: {
  activa: boolean
  href: string
  titulo: string
  muestra: React.ReactNode
  testid: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href} scroll={false} title={titulo} data-testid={testid}
      data-activa={activa ? '1' : undefined}
      aria-pressed={activa}
      className={`flex items-center gap-[6px] rounded-control border px-[9px] py-1 text-[12px] ${
        activa ? 'border-accent bg-surface-sunken text-ink' : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {muestra}
      {children}
    </Link>
  )
}
