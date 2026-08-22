// 08 · OBRA DOTACIÓN Y PROYECCIÓN — el motor HH → dotación → duración, visible.
//
// ═══ LA PANTALLA CONTESTA DOS PREGUNTAS OPUESTAS ═══
//
// «Con esta gente, ¿cuándo termino?» y «Para terminar tal día, ¿cuánta gente necesito?». La
// segunda es la que se usa de verdad cuando el cliente pone una fecha, y es la que devuelve
// **no alcanza** cuando el tope del frente lo impide. NULL no es cero: prometer una fecha que el
// tope impide se descubre el día de la entrega.
//
// ═══ LA URL ES LA MEMORIA DEL SIMULADOR, Y «APLICAR AL PLAN» LA CONVIERTE EN PLAN ═══
//
// Las dotaciones elegidas viajan en `?dot=<frente>~<n>`. No hay estado en el navegador: el mismo
// link abre la misma simulación del otro lado del chat. Mientras están en la URL no son un plan —si
// el plan cambia debajo, el link deja de significar lo que significaba—; se vuelven plan cuando
// alguien las aplica, y ahí se escriben en `dotacion_prevista`, que es la capacidad con la que el
// motor calcula la duración de cada actividad sin cuadrilla asignada.
//
// ═══ ESTA PANTALLA NO HABLA DE PLATA ═══
//
// HH, dotación, capacidad y rendimiento NO son dato económico: el jefe de obra los ve. Precio,
// costo y margen no se piden en ninguna de las lecturas.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getCapacidadPonderada, getInsumosCronograma, getPersonasDisponibles,
} from '@/features/obras/services/cronogramaObraService'
import { armarCronograma } from '@/features/obras/services/cronogramaMotor'
import {
  dotacionNecesaria, frentesDe, rubrosDe, sumaCompleta, type Frente,
} from '@/features/obras/services/dotacion'
import { aplicarDotacionAlPlan } from '@/features/obras/services/actionsPlan'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { BarraContextoObra } from '@/features/obras/components/BarraContextoObra'
import { TablaRubrosHH } from '@/features/obras/components/TablaRubrosHH'
import { Callout, FormAccion } from '@/shared/components/ui'
import { Ayuda } from '@/shared/components/ds'
import { CalendarioObra } from '../../../../../../orquestador/lib/calendario-obra.mjs'

export const dynamic = 'force-dynamic'

type Params = Promise<{ obra: string }>
type Search = Promise<{ dot?: string | string[] }>

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))
const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

/** `?dot=Piso~4&dot=Techo~2`. La dotación se acota a 0–99: un `dot=x~99999` desde la barra de
 *  direcciones no puede hacer que la pantalla dibuje un plantel imposible como si fuera una opción. */
function dotacionesDe(raw: string | string[] | undefined): Record<string, number> {
  const lista = raw === undefined ? [] : (Array.isArray(raw) ? raw : [raw])
  const salida: Record<string, number> = {}
  for (const par of lista) {
    const i = par.lastIndexOf('~')
    if (i <= 0) continue
    const n = Number(par.slice(i + 1))
    if (!Number.isInteger(n) || n < 0 || n > 99) continue
    salida[par.slice(0, i)] = n
  }
  return salida
}

export default async function DotacionObraPage(
  { params, searchParams }: { params: Params; searchParams: Search },
) {
  const { obra: obraId } = await params
  const sp = await searchParams
  const dotaciones = dotacionesDe(sp.dot)
  const supabase = await createClient()

  const [{ data: insumos, error }, capacidad, disponibles, perfil] = await Promise.all([
    getInsumosCronograma(supabase, obraId),
    getCapacidadPonderada(supabase),
    getPersonasDisponibles(supabase, obraId),
    getPerfilActual(supabase),
  ])
  // Aplicar la dotación cambia la duración calculada del plan: es de Administración y de la
  // jefatura de obra. La guarda de verdad vive en la acción; esto evita ofrecer el gesto.
  const puedeAplicar = esAdministracion(perfil.data?.rol ?? null)
  if (error?.startsWith(`la obra ${obraId} no existe`)) notFound()
  if (error || !insumos) {
    return <main className="p-4 lg:p-8"><Callout tono="neg">No pude leer la obra: {error ?? 'sin datos'}</Callout></main>
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const crono = armarCronograma(insumos, 'proyeccion', hoy)
  const calendario = new CalendarioObra(insumos.obra.dias_habiles ?? [1, 2, 3, 4, 5], insumos.noLaborables)
  // El simulador arranca HOY: la pregunta es «si me pongo con N personas, ¿cuándo termino?».
  const desde = calendario.proximoHabil(hoy)
  const frentes = frentesDe(crono.actividades, {
    dotaciones, jornada: crono.jornada, desde,
    sumarDiasHabiles: (d: string, n: number) => calendario.sumarHabiles(d, n),
  })

  const hhPlan = sumar(crono.actividades.map((a) => (a.hh_plan == null ? null : Number(a.hh_plan))))
  const hhReal = sumar(crono.actividades.map((a) => (a.hh_real == null ? null : Number(a.hh_real))))
  // El total de HH que faltan NO admite sumandos ausentes: es el número que fija el plazo.
  const hhRest = sumaCompleta(frentes.map((f) => f.hhRestantes))
  const hhProy = hhRest == null ? null : (hhReal ?? 0) + hhRest

  const genteTotal = frentes.reduce((a, f) => a + f.dotacion, 0)
  const finSimulado = frentes.map((f) => f.fin).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null
  const finPlan = crono.actividades
    .map((a) => (a.fin_plan ? String(a.fin_plan).slice(0, 10) : null))
    .filter((x): x is string => Boolean(x)).sort().at(-1) ?? null
  const desvio = finSimulado && finPlan
    ? calendario.habilesEntre(finPlan, finSimulado) - 1 || 0
    : null

  const href = (clave: string, valor: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...dotaciones, [clave]: valor })) q.append('dot', `${k}~${v}`)
    return `/obras/${obraId}/dotacion?${q.toString()}`
  }

  const sinDotacion = frentes.filter((f) => f.dotacion === 0 && f.limite !== 'terminado').length
  const excede = disponibles != null && genteTotal > disponibles

  return (
    <main className="flex flex-col gap-4 pb-10">
      <BarraContextoObra
        volverA={`/obras/${obraId}`}
        volverLabel={`Obras · ${obraId}`}
        titulo="Dotación y proyección"
        kpis={[
          { rotulo: 'HH plan', valor: n0(hhPlan), falta: 'sin cargar' },
          { rotulo: 'Real', valor: n0(hhReal), falta: 'sin registro' },
          { rotulo: 'Proyectadas', valor: n0(hhProy), proyectado: true, falta: 'sin base' },
        ]}
      />

      <div className="flex flex-col gap-4 px-4 lg:px-8">
        {hhPlan == null && (
          <Callout tono="warn">
            <strong>Ninguna actividad de esta obra tiene HH del análisis cargadas.</strong>{' '}
            El motor de dotación divide HH por capacidad: sin HH no hay días, no hay fecha de fin y
            no hay dotación necesaria. Por eso la columna dice <em>sin dato</em> y no 0 — lo que
            falta es la carga, no el trabajo. Se carga al convertir el presupuesto en plan de obra.
          </Callout>
        )}

        <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-ink">Simulación de dotación</h2>
            <TablaFrentes frentes={frentes} href={href} />

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-3">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <Kpi rotulo="Gente total" valor={genteTotal ? String(genteTotal) : null} falta="sin asignar" tono={excede ? 'neg' : 'normal'} />
                <Kpi rotulo="Fin de obra" valor={fmt(finSimulado)} falta="sin dato" tono={desvio != null && desvio > 0 ? 'neg' : 'normal'} />
                <Kpi
                  rotulo="Contra el plan"
                  valor={desvio == null ? null : `${desvio > 0 ? '+' : ''}${desvio} d`}
                  falta="sin plan"
                  tono={desvio == null ? 'normal' : (desvio > 0 ? 'neg' : (desvio < 0 ? 'pos' : 'normal'))}
                />
              </div>
              <AplicarAlPlan
                obraId={obraId} dotaciones={dotaciones} puedeAplicar={puedeAplicar}
                aEscribir={frentes.filter((f) => f.dotacion > 0 && f.clave in dotaciones).length}
              />
            </div>

            {excede && (
              <p className="mt-3 border-l-[3px] border-neg bg-neg-soft px-3 py-2 text-[12.5px] text-ink-soft">
                Pediste {genteTotal} personas y la obra tiene {disponibles}. Hay que traer gente de
                otra obra o correr un frente.
              </p>
            )}
            {!excede && sinDotacion > 0 && (
              <p className="mt-3 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12.5px] text-ink-soft">
                {sinDotacion === 1
                  ? '1 frente sin dotación: no tiene fecha de fin.'
                  : `${sinDotacion} frentes sin dotación: no tienen fecha de fin.`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <AlReves hh={hhRest} jornada={crono.jornada} tope={topeMasBajo(frentes)} desde={desde} calendario={calendario} />
            <div className="rounded-card border border-line bg-surface p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Capacidad ponderada</h2>
              {/* 22/08/2026 · La explicación del ponderado baja a la ayuda: la lista de factores que
                  sigue ES el dato, y dos líneas de teoría encima la empujaban fuera de la primera
                  mirada cada vez que se abre la pantalla. */}
              <Ayuda titulo="Por qué no se cuentan cabezas" testid="ayuda-capacidad">
                Dos oficiales y dos ayudantes son cuatro personas y 3,2 de capacidad. Contar cabezas
                para dividir HH deja el plan un 20 % optimista.
              </Ayuda>
              {capacidad.data?.length
                ? (
                  <ul className="flex flex-col gap-1">
                    {capacidad.data.map((c) => (
                      <li key={c.nombre} className="flex items-baseline justify-between gap-3">
                        <span className="text-[12px] text-ink-soft">{c.nombre}</span>
                        <span className="text-[12px] text-ink tnum">
                          {c.factor.toLocaleString('es-AR', { minimumFractionDigits: 1 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="text-[12px] text-warn">No pude leer los factores de capacidad.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink">Plan · Real · Proyección por rubro</h2>
          {/* 22/08/2026 · De dónde sale la proyección baja a la ayuda. Lo que no se puede esconder
              —que un rubro sin base NO tiene proyección— sigue escrito en la tabla misma, celda por
              celda: la honestidad va en el dato, no en un párrafo encima del dato. */}
          <TablaRubrosHH filas={rubrosDe(crono.actividades)} />
          <Ayuda titulo="De dónde sale la proyección" testid="ayuda-proyeccion-rubros">
            Usa el rendimiento observado donde hay avance y HH reales; donde no lo hay, dice{' '}
            <em>sin base</em>. Nunca el plan disfrazado de proyección.
          </Ayuda>
        </section>
      </div>
    </main>
  )
}

/**
 * APLICAR LA SIMULACIÓN AL PLAN — el botón que convierte la URL en `dotacion_prevista`.
 *
 * El rótulo dice a cuántos frentes toca de verdad. «Aplicar al plan» sobre una pantalla donde nadie
 * movió un stepper no escribiría nada y diría que sí; y los frentes en 0 quedan afuera porque cero
 * personas no es un plan, es la ausencia de uno.
 *
 * Las dotaciones viajan como campos ocultos con el MISMO formato que la URL (`frente~n`): la
 * pantalla y la escritura no pueden entender distinto el mismo texto. El servidor las vuelve a
 * recortar por el tope del frente y recalcula qué actividades toca — la lista de actividades no
 * viaja desde el navegador.
 */
function AplicarAlPlan({ obraId, dotaciones, puedeAplicar, aEscribir }: {
  obraId: string
  dotaciones: Record<string, number>
  puedeAplicar: boolean
  aEscribir: number
}) {
  if (!puedeAplicar) {
    return (
      <p className="max-w-[280px] text-[11.5px] text-faint">
        Esto simula. Aplicarlo al plan es de Administración y de la jefatura de obra.
      </p>
    )
  }
  return (
    <FormAccion
      accion={aplicarDotacionAlPlan.bind(null, obraId)}
      testid="form-aplicar-dotacion"
      enviar={aEscribir === 1 ? 'Aplicar al plan (1 frente)' : `Aplicar al plan (${aEscribir} frentes)`}
      mensajeOk="Dotación aplicada."
      bloqueado={aEscribir === 0}
      motivoBloqueo="Movés un stepper y se habilita: no hay ninguna dotación elegida para guardar."
    >
      {Object.entries(dotaciones).map(([clave, n]) => (
        <input key={clave} type="hidden" name="dot" value={`${clave}~${n}`} />
      ))}
    </FormAccion>
  )
}

function sumar(vs: (number | null)[]): number | null {
  const hay = vs.filter((v): v is number => v != null)
  return hay.length ? hay.reduce((a, b) => a + b, 0) : null
}

const topeMasBajo = (frentes: Frente[]): number | null => {
  const topes = frentes.map((f) => f.tope).filter((x): x is number => x != null)
  return topes.length ? Math.min(...topes) : null
}

function Kpi({ rotulo, valor, falta, tono }: {
  rotulo: string; valor: string | null; falta: string; tono: 'normal' | 'neg' | 'pos'
}) {
  const clase = valor == null ? 'text-faint' : (tono === 'neg' ? 'text-neg' : (tono === 'pos' ? 'text-pos' : 'text-ink'))
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <div className={`text-[20px] font-semibold leading-tight tnum ${clase}`}>{valor ?? falta}</div>
    </div>
  )
}

function TablaFrentes({ frentes, href }: { frentes: Frente[]; href: (clave: string, valor: number) => string }) {
  if (!frentes.length) return <p className="text-[12px] text-muted">Esta obra no tiene actividades ejecutables cargadas.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr className="border-b border-line-strong text-[10px] uppercase tracking-[0.05em] text-faint">
            <th className="px-2 py-1.5 text-left font-normal">Frente</th>
            <th className="px-2 py-1.5 text-right font-normal">HH rest.</th>
            <th className="px-2 py-1.5 text-center font-normal">Dotación</th>
            <th className="px-2 py-1.5 text-right font-normal">Días</th>
            <th className="px-2 py-1.5 text-right font-normal">Fin</th>
            <th className="px-2 py-1.5 text-left font-normal">Límite</th>
          </tr>
        </thead>
        <tbody>
          {frentes.map((f) => (
            <tr key={f.clave} className="border-b border-surface-sunken">
              <td className="px-2 py-1.5 text-left">
                <div className="truncate text-[12.5px] text-ink">{f.nombre}</div>
                {f.subtitulo && (
                  <div className={`text-[10.5px] ${f.subtituloTono === 'warn' ? 'text-warn' : 'text-faint'}`}>
                    {f.subtitulo}
                  </div>
                )}
              </td>
              <td className={`px-2 py-1.5 text-right text-[12px] tnum ${f.hhRestantes == null ? 'text-faint' : 'text-ink-soft'}`}>
                {n0(f.hhRestantes) ?? 'sin dato'}
                {f.sinDato > 0 && (
                  <div className="text-[9.5px] text-warn">
                    {f.sinDato === 1 ? '1 actividad sin HH' : `${f.sinDato} actividades sin HH`}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5">
                <Stepper frente={f} href={href} />
                <div className="mt-0.5 text-center text-[9.5px] text-faint">{f.base}</div>
              </td>
              <td className="px-2 py-1.5 text-right text-[12.5px] font-semibold text-ink tnum">
                {f.dias == null ? <span className="font-normal text-faint">—</span>
                  : f.dias.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                {/* Un frente que no baja de N días por más gente que se le ponga tiene que decir
                    por qué: el curado son días fijos, no trabajo que se pueda repartir. */}
                {f.diasTecnicos > 0 && f.dias != null && (
                  <div className="text-[9.5px] font-normal text-warn">
                    {f.diasTecnicos} d técnicos
                  </div>
                )}
              </td>
              <td className={`px-2 py-1.5 text-right text-[12px] tnum ${f.fin ? 'text-ink-soft' : 'text-faint'}`}>
                {fmt(f.fin) ?? 'sin plan'}
              </td>
              <td className={`px-2 py-1.5 text-left text-[11.5px] ${
                f.limite === 'tope del frente' ? 'text-warn'
                  : (f.limite === 'sin gente' ? 'text-faint' : (f.limite === 'terminado' ? 'text-pos' : 'text-muted'))
              }`}>
                {f.limite}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** El `+` se apaga en el tope del frente: más gente no acorta el plazo, y un botón que responde
 *  sin cambiar nada enseña a desconfiar de la pantalla. */
function Stepper({ frente, href }: { frente: Frente; href: (clave: string, valor: number) => string }) {
  const enTope = frente.tope != null && frente.dotacion >= frente.tope
  const caja = 'flex h-[26px] w-[26px] items-center justify-center border border-line text-[13px]'
  return (
    <div className="flex items-center justify-center">
      {frente.dotacion > 0
        ? <Link href={href(frente.clave, frente.dotacion - 1)} scroll={false} className={`${caja} rounded-l-control text-ink-soft hover:bg-surface-quiet`} aria-label={`Quitar una persona de ${frente.nombre}`}>−</Link>
        : <span className={`${caja} rounded-l-control text-faint`} aria-hidden>−</span>}
      <span className="flex h-[26px] w-[32px] items-center justify-center border-y border-line text-[13px] font-semibold text-ink tnum">
        {frente.dotacion}
      </span>
      {enTope
        ? <span className={`${caja} rounded-r-control text-faint`} title={`Tope del frente: ${frente.tope} personas. Más gente no acorta el plazo.`}>+</span>
        : <Link href={href(frente.clave, frente.dotacion + 1)} scroll={false} className={`${caja} rounded-r-control text-ink-soft hover:bg-surface-quiet`} aria-label={`Sumar una persona a ${frente.nombre}`}>+</Link>}
    </div>
  )
}

/** AL REVÉS: fijá la fecha y el sistema dice la dotación. Las fechas se ofrecen sobre el calendario
 *  real de la obra —no sobre días corridos— porque la pregunta es cuántos días TRABAJADOS quedan. */
function AlReves({ hh, jornada, tope, desde, calendario }: {
  hh: number | null; jornada: number; tope: number | null; desde: string; calendario: CalendarioObra
}) {
  const objetivos = [4, 7, 11, 18].map((d) => ({ dias: d, fecha: calendario.sumarHabiles(desde, d - 1) }))
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-ink">Al revés</h2>
      <p className="mb-2 mt-0.5 text-[11px] text-muted">Fijá la fecha y el sistema dice la dotación.</p>
      {hh == null && (
        <p className="text-[12px] text-warn">
          Sin HH cargadas no hay cuenta inversa: no se puede decir cuánta gente hace falta para una
          fecha si no se sabe cuánto trabajo queda.
        </p>
      )}
      {hh != null && (
        <ul className="flex flex-col gap-1.5">
          {objetivos.map((o) => {
            const n = dotacionNecesaria(hh, o.dias, jornada, tope)
            return (
              <li key={o.dias} className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="text-[12.5px] text-ink-soft">Terminar el {fmt(o.fecha)}</span>
                  <span className="ml-1.5 text-[10.5px] text-faint">
                    {o.dias} días{n == null ? ' · imposible por tope' : ''}
                  </span>
                </span>
                <span className={`text-[14px] font-semibold tnum ${n == null ? 'text-neg' : 'text-ink'}`}>
                  {n == null ? 'no alcanza' : `${n} pers.`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
