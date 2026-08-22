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
// Vista, escala, actividad seleccionada y días del arrastre son parámetros. Un cronograma que se
// mira entre dos personas se manda por chat: si el estado viviera en el navegador, el link
// abriría otra pantalla del otro lado.
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
import { armarCronograma, simularArrastre, type Cronograma } from '@/features/obras/services/cronogramaMotor'
import { editarDuracion, moverActividad } from '@/features/obras/services/actionsPlan'
import { agregarDependencia, quitarDependencia } from '@/features/obras/services/actions'
import {
  celdasDe, construirEscalaCronograma, UNIDADES, UNIDAD_LABEL, ventanaDe, type UnidadEscala,
} from '@/features/obras/services/escalaCronograma'
import {
  esVista, filasDeVista, hrefCronograma, VISTAS, VISTA_LABEL, type EstadoUrl, type Vista,
} from '@/features/obras/services/vistaCronograma'
import { LienzoCronogramaObra } from '@/features/obras/components/LienzoCronogramaObra'
import { BarraContextoObra } from '@/features/obras/components/BarraContextoObra'
import { PopoverArrastre } from '@/features/obras/components/PopoverArrastre'
import { Callout, Campo, CTRL, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

type Params = Promise<{ obra: string }>
type Search = Promise<{ vista?: string; escala?: string; sel?: string; mover?: string; proyeccion?: string }>

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
  const supabase = await createClient()

  const [{ data: insumos, error }, perfil] = await Promise.all([
    getInsumosCronograma(supabase, obraId),
    getPerfilActual(supabase),
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

  const hoy = new Date().toISOString().slice(0, 10)
  const crono = armarCronograma(insumos, enProyeccion ? 'proyeccion' : 'plan', hoy)
  const filas = filasDeVista(crono, vista)
  const ventana = ventanaDe(filas.map((f) => ({ inicio: f.inicio, fin: f.fin })))
  const escala = ventana ? construirEscalaCronograma(ventana, unidad, hoy) : null

  const seleccionada = sp.sel && crono.actividades.some((a) => a.actividad_id === sp.sel) ? sp.sel : null
  const delta = seleccionada ? deltaValido(sp.mover) : null
  const arrastre = delta != null && seleccionada
    ? simularArrastre(insumos, seleccionada, delta, hoy)
    : null

  const estadoUrl: EstadoUrl = { vista, escala: unidad, sel: seleccionada, mover: delta, proyeccion: enProyeccion }
  const href = (cambios: Partial<EstadoUrl>) => hrefCronograma(obraId, estadoUrl, cambios)

  const filaSel = crono.actividades.find((a) => a.actividad_id === seleccionada) ?? null
  const nombreSel = filaSel?.nombre ?? null

  return (
    <main className="flex flex-col gap-4 pb-10">
      <BarraContextoObra
        volverA={`/obras/${obraId}`}
        volverLabel={`Obras · ${obraId}`}
        titulo="Cronograma"
        kpis={[
          { rotulo: 'Fin plan', valor: fmt(finDelPlan(crono)), falta: 'sin secuencia' },
          {
            rotulo: enProyeccion ? 'Fin proyectado' : 'Fin de obra',
            valor: fmt(crono.finObra), proyectado: true, falta: 'sin secuencia',
          },
          { rotulo: 'Crítico', valor: crono.sinSecuencia ? null : `${crono.criticas.length} act.`, falta: 'sin secuencia' },
          { rotulo: 'Sin plan', valor: `${crono.sinPlan.length} act.` },
        ]}
      />

      <div className="flex flex-col gap-3 px-4 lg:px-8">
        <Barra
          vista={vista} unidad={unidad} enProyeccion={enProyeccion} href={href}
        />

        {crono.sinSecuencia && (
          <Callout tono="warn">
            <strong>Sin secuencia cargada.</strong>{' '}
            Esta obra no tiene ninguna dependencia entre actividades, así que no hay camino crítico
            ni fin de obra que calcular: lo que se ve abajo son {crono.actividades.length} actividades
            con sus fechas, no un plan encadenado.{' '}
            {crono.finObraSiTodoEnParalelo && (
              <>Si todo pasara en paralelo terminarían el{' '}
                <span className="tnum font-semibold">{fmt(crono.finObraSiTodoEnParalelo)}</span> — es
                el piso teórico del plazo, no una fecha de entrega.{' '}
              </>
            )}
            <Link href={`/obras/${obraId}?vista=cronograma`} className="font-medium underline">
              Cargar la secuencia
            </Link>
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
          <>
            <Leyenda />
            <LienzoCronogramaObra
              filas={filas}
              escala={escala}
              diasVentana={celdasDe(escala.desde, escala.hasta)}
              obraId={obraId}
              estadoUrl={estadoUrl}
            />
          </>
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

        <div className="grid gap-4 lg:grid-cols-2">
          <PlanDeLaSeleccionada
            obraId={obraId} fila={filaSel} puedeEditar={puedeEditarPlan} jornada={crono.jornada}
          />
          <Dependencias
            crono={crono} insumos={insumos} seleccionada={seleccionada}
            obraId={obraId} puedeEditar={puedeEditarPlan}
          />
        </div>
        <Conflictos crono={crono} />
      </div>
    </main>
  )
}

/** El fin del PLAN GUARDADO — el máximo `fin_plan` de las actividades. Es otra cosa que el fin
 *  calculado: uno es lo que alguien escribió, el otro lo que el motor deduce de la secuencia. */
function finDelPlan(crono: Cronograma): string | null {
  const fines = crono.actividades
    .map((a) => (a.fin_plan ? String(a.fin_plan).slice(0, 10) : null))
    .filter((x): x is string => Boolean(x))
    .sort()
  return fines.at(-1) ?? null
}

function textosDeConflicto(crono: Cronograma): string[] {
  const nombre = new Map(crono.actividades.map((a) => [a.actividad_id, a.nombre]))
  return crono.conflictos.map((c) => {
    const [a, b] = c.actividades
    return `${nombre.get(a) ?? a} y ${nombre.get(b) ?? b} piden la misma cuadrilla entre el ${fmt(c.desde)} y el ${fmt(c.hasta)}`
  })
}

function Barra({ vista, unidad, enProyeccion, href }: {
  vista: Vista
  unidad: UnidadEscala
  enProyeccion: boolean
  href: (c: Partial<EstadoUrl>) => string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-4 text-[13px]">
        {VISTAS.map((v) => (
          <Link
            key={v} href={href({ vista: v, mover: null })} scroll={false}
            className={vista === v
              ? 'font-medium text-ink shadow-[inset_0_-1.5px_0_var(--os-ink)]'
              : 'text-muted hover:text-ink'}
          >
            {VISTA_LABEL[v]}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {UNIDADES.map((u) => (
          <Link
            key={u} href={href({ escala: u })} scroll={false}
            className={`rounded-control border px-2 py-0.5 text-[11.5px] ${
              unidad === u ? 'border-marca bg-marca-soft text-ink' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {UNIDAD_LABEL[u]}
          </Link>
        ))}
      </div>
      <Link
        href={href({ proyeccion: !enProyeccion, mover: null })} scroll={false}
        className={`text-[12.5px] ${enProyeccion ? 'font-medium text-ink shadow-[inset_0_-1.5px_0_var(--os-ink)]' : 'text-muted hover:text-ink'}`}
      >
        Proyección por rendimiento observado
      </Link>
    </div>
  )
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-muted">
      <span><span className="mr-1 inline-block h-2 w-3 rounded-[2px] bg-surface-sunken align-middle" />plan</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-[2px] bg-accent align-middle" />ejecutado</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-[2px] bg-marca-track align-middle" />proyectado</span>
      <span><span className="mr-1 inline-block h-2 w-2 rotate-45 bg-ink align-middle" />hito</span>
      <span className="text-neg">△ impedimento</span>
      <span><span className="mr-1 inline-block h-3 w-[1.5px] bg-marca align-middle" />hoy</span>
    </div>
  )
}

/**
 * LA DURACIÓN DE LA SELECCIONADA, EDITABLE DESDE ACÁ.
 *
 * ═══ POR QUÉ MUESTRA DE DÓNDE SALE LA DURACIÓN ═══
 *
 * `duracionDe` usa `dias_plan` cuando está cargado y, si no, HH ÷ capacidad. Son dos orígenes y la
 * diferencia importa: escribir días de plan sobre una actividad que hoy se calcula por HH la
 * CONGELA —deja de acompañar los cambios de dotación—, y eso tiene que decirse antes, no después.
 */
function PlanDeLaSeleccionada({ obraId, fila, puedeEditar, jornada }: {
  obraId: string
  fila: Cronograma['actividades'][number] | null
  puedeEditar: boolean
  jornada: number
}) {
  const dias = fila?.dias_plan == null || fila.dias_plan === '' ? null : Number(fila.dias_plan)
  const porHH = dias == null && fila?.duracion != null
  return (
    <section className="rounded-card border border-line bg-surface p-4" data-testid="plan-seleccionada">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">Plan de la seleccionada</h2>
      {!fila && <p className="text-[12px] text-muted">Tocá una actividad para cambiarle la duración.</p>}
      {fila && (
        <>
          <p className="mb-2 text-[12px] text-ink-soft">
            <strong className="font-semibold">{fila.nombre}</strong>{' '}
            {fila.duracion == null
              ? <span className="text-warn">no tiene plan calculable</span>
              : (<>dura <span className="tnum">{fila.duracion}</span> {fila.duracion === 1 ? 'día hábil' : 'días hábiles'}
                  <span className="text-muted">{porHH ? ` · calculados con HH ÷ capacidad (jornada de ${jornada} h)` : ' · días de plan cargados'}</span>
                </>)}
          </p>
          {puedeEditar
            ? (
              <FormAccion
                accion={editarDuracion.bind(null, obraId, fila.actividad_id)}
                testid="form-duracion" enviar="Guardar duración" mensajeOk="Duración guardada."
              >
                <div className="flex flex-wrap items-end gap-3">
                  <Campo
                    label="Días de plan" ancho="w-[140px]"
                    ayuda={porHH ? 'Cargarlos deja de calcular por HH' : 'Vacío = volver a calcular por HH'}
                  >
                    <input
                      type="number" name="dias" min={0} max={3650} step={1}
                      defaultValue={dias ?? ''} className={CTRL} placeholder="sin cargar"
                    />
                  </Campo>
                </div>
              </FormAccion>
            )
            : (
              <p className="text-[11.5px] text-faint">
                Cambiar la duración es de Administración y de la jefatura de obra.
              </p>
            )}
        </>
      )}
    </section>
  )
}

function Dependencias({ crono, insumos, seleccionada, obraId, puedeEditar }: {
  crono: Cronograma
  insumos: { dependencias: { id?: string; origen_id: string; destino_id: string; tipo: string; lag_dias: number | string | null }[] }
  seleccionada: string | null
  obraId: string
  puedeEditar: boolean
}) {
  const nombre = new Map(crono.actividades.map((a) => [a.actividad_id, a.nombre]))
  const relacion = (tipo: string, lag: number, dir: 'antes' | 'después') => {
    const base = dir === 'antes'
      ? ({ FS: 'termina antes', SS: 'empieza en paralelo', FF: 'termina junto', SF: 'empieza antes' }[tipo] ?? 'termina antes')
      : ({ FS: 'empieza después', SS: 'empieza en paralelo', FF: 'termina junto', SF: 'termina después' }[tipo] ?? 'empieza después')
    return lag ? `${base} · ${lag > 0 ? '+' : ''}${lag} d` : base
  }
  const filas = seleccionada
    ? [
        ...insumos.dependencias.filter((d) => d.destino_id === seleccionada)
          .map((d) => ({ dir: 'antes' as const, dep: d.id, id: d.origen_id, rel: relacion(d.tipo, Number(d.lag_dias ?? 0), 'antes') })),
        ...insumos.dependencias.filter((d) => d.origen_id === seleccionada)
          .map((d) => ({ dir: 'después' as const, dep: d.id, id: d.destino_id, rel: relacion(d.tipo, Number(d.lag_dias ?? 0), 'después') })),
      ]
    : []
  // Candidatas a predecesora: las ejecutables de la obra menos ella misma y menos las que ya lo son.
  // Ofrecer una que ya está cargada haría que el único resultado posible sea el error de duplicado.
  const yaSonPredecesoras = new Set(
    insumos.dependencias.filter((d) => d.destino_id === seleccionada).map((d) => d.origen_id),
  )
  const candidatas = crono.actividades.filter(
    (a) => a.actividad_id !== seleccionada && !yaSonPredecesoras.has(a.actividad_id),
  )

  return (
    <section className="rounded-card border border-line bg-surface p-4" data-testid="dependencias">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">Dependencias de la seleccionada</h2>
      {!seleccionada && <p className="text-[12px] text-muted">Tocá una actividad para ver de qué depende y qué depende de ella.</p>}
      {seleccionada && filas.length === 0 && (
        <p className="text-[12px] text-warn">
          Esta actividad no tiene ninguna dependencia cargada: no arrastra a nadie y nadie la arrastra.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {filas.map((f) => (
          <li key={`${f.dir}-${f.id}`} className="flex items-baseline gap-3">
            <span className="w-[52px] shrink-0 text-[11px] text-faint">{f.dir}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">{nombre.get(f.id) ?? f.id}</span>
            <span className="shrink-0 text-[11px] text-muted">{f.rel}</span>
            {puedeEditar && f.dep && (
              <FormAccion
                accion={quitarDependencia.bind(null, obraId, f.dep)}
                enviar="Quitar" className="shrink-0" mensajeOk="Precedencia quitada."
              >
                <span className="sr-only">Quitar la precedencia con {nombre.get(f.id) ?? f.id}</span>
              </FormAccion>
            )}
          </li>
        ))}
      </ul>

      {seleccionada && puedeEditar && (
        <div className="mt-3 border-t border-line pt-3">
          <FormAccion
            accion={agregarDependencia.bind(null, obraId, seleccionada)}
            testid="form-dependencia" enviar="Declarar" mensajeOk="Precedencia declarada." limpiarAlOk
          >
            <div className="flex flex-wrap items-end gap-2">
              <Campo label="Depende de" ancho="min-w-[180px] flex-1">
                <select name="origen_id" className={CTRL} defaultValue="">
                  <option value="" disabled>Elegí la actividad</option>
                  {candidatas.map((a) => (
                    <option key={a.actividad_id} value={a.actividad_id}>{a.nombre}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Relación" ancho="w-[92px]">
                <select name="tipo" className={CTRL} defaultValue="FS">
                  <option value="FS">FS</option>
                  <option value="SS">SS</option>
                  <option value="FF">FF</option>
                  <option value="SF">SF</option>
                </select>
              </Campo>
              <Campo label="Demora (d)" ancho="w-[92px]" ayuda="Puede ser negativa">
                <input type="number" name="lag_dias" min={-365} max={365} step={1} defaultValue={0} className={CTRL} />
              </Campo>
            </div>
          </FormAccion>
        </div>
      )}
    </section>
  )
}

function Conflictos({ crono }: { crono: Cronograma }) {
  const textos = textosDeConflicto(crono)
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">Conflictos de recurso detectados</h2>
      {crono.actividades.every((a) => !a.cuadrilla_id) && (
        <p className="text-[12px] text-warn">
          Ninguna actividad de esta obra tiene cuadrilla asignada: no se puede detectar si dos
          frentes piden la misma gente el mismo día. No es que no haya conflictos — es que no se
          pueden ver.
        </p>
      )}
      {textos.length === 0 && crono.actividades.some((a) => a.cuadrilla_id) && (
        <p className="text-[12px] text-muted">Ninguna cuadrilla queda pedida en dos frentes a la vez.</p>
      )}
      <ul className="flex flex-col gap-2">
        {textos.map((t) => (
          <li key={t} className="flex items-baseline gap-2">
            <span className="shrink-0 text-warn">△</span>
            <span className="text-[12.5px] text-ink-soft">{t}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
