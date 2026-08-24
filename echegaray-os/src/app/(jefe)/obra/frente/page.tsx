import { Aviso, BotonEnlace, Estado } from '@/shared/components/ds'
import type { TonoEstado } from '@/shared/components/ds'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import {
  Barra, Encabezado, Fila, Metricas, Nada, Panel, Rotulo, porcentajeCorto,
} from '@/features/jefe/components/Piezas'
import { IconoAlerta } from '@/features/jefe/components/Iconos'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos } from '@/features/jefe/services/jefeService'
import type { ActividadDelJefe } from '@/features/jefe/services/jefeService'
import { estadoDelFrente, frentesDelDia, estaTerminada } from '@/features/jefe/services/dia'
import { hhDeLaObra } from '@/features/jefe/services/progreso'
import type { FrenteDelDia } from '@/features/jefe/services/dia'
import { conObra } from '@/features/jefe/services/navegacion'
import { detalleDeTarea } from '@/features/jefe/services/tareas'
import { iniciales } from '@/features/jefe/services/personas'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { RelojDeJornada } from '@/features/administracion/components/RelojDeJornada'

// J06 · EL FRENTE — un pedazo de obra, todo lo que pasa en él.
//
// ═══ «GENTE EN EL FRENTE» ES QUIEN IMPUTÓ HORAS ACÁ HOY ═══
//
// El modelo no tiene «persona asignada a un frente»: `obra_asignacion` la asigna a la OBRA y
// `cuadrilla` no cuelga de ninguna actividad. El único vínculo REGISTRADO entre una persona y un
// frente es la imputación de horas contra `actividad_id`, y es lo que se usa. Por eso el rótulo dice
// lo que el dato afirma —imputaron horas hoy— y no «la cuadrilla del frente», que sería una
// inferencia presentada como hecho.
//
// El reloj de al lado es otra cosa y sale de otra fuente: la marca de asistencia. Alguien puede
// tener horas imputadas a este frente y no estar marcado (se las cargó el jefe), o estar marcado en
// la obra sin horas todavía. Se muestran juntos porque juntos contestan la pregunta, pero cada uno
// dice lo suyo.
//
// ═══ EL FRENTE NO SE MIDE: SE AGREGA, Y SE DICE SOBRE CUÁNTO ═══
//
// El porcentaje de arriba es el promedio de sus tareas MEDIDAS, y la cobertura viaja al lado.
// «40 % sobre 3 de 11» y «40 % sobre 11 de 11» son dos afirmaciones muy distintas.

export const dynamic = 'force-dynamic'

export default async function JefeFrentePage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; frente?: string }>
}) {
  const { obra: pedida, frente: frenteId } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  const hoy = hoyEnObra()
  const [actividades, arbol, impedimentos, hh, presencia, esperados] = await Promise.all([
    getActividades(supabase, obra.id),
    getArbol(supabase, obra.id),
    getImpedimentos(supabase, obra.id),
    getHHDelDia(supabase, obra.id, hoy),
    getPresencia(supabase, hoy, obra.id),
    getEsperados(supabase, obra.id),
  ])

  const frentes = frentesDelDia(arbol.data ?? [], actividades.data ?? [], hh.data ?? [], hoy)
  const f = frentes.find((x) => x.frente.id === frenteId) ?? frentes[0] ?? null
  if (!f) {
    return (
      <>
        <Encabezado titulo="Frente" sub={obra.nombre} />
        <div className="px-4 pb-6">
          <Panel>
            <Nada>Esta obra no tiene frentes. Se arman desde la planificación.</Nada>
          </Panel>
        </div>
      </>
    )
  }

  const porId = new Map((actividades.data ?? []).map((a) => [a.actividad_id, a]))
  const tareas = f.frente.tareas.map((id) => porId.get(id)).filter((a) => !!a)
  const idsDelFrente = new Set(f.frente.tareas)
  const impedimentosDelFrente = (impedimentos.data ?? [])
    .filter((i) => i.actividad_id && idsDelFrente.has(i.actividad_id))

  // Quién imputó horas a este frente hoy, cruzado con su marca de asistencia para el reloj.
  const horasPorPersona = new Map<string, number>()
  for (const h of hh.data ?? []) {
    if (!idsDelFrente.has(h.actividad_id)) continue
    horasPorPersona.set(h.persona_id, (horasPorPersona.get(h.persona_id) ?? 0) + h.horas)
  }
  const finPlan = finDelFrente(tareas)
  // Las horas del frente salen de la MISMA regla que las de la obra en J03: sin una sola tarea que
  // las declare, `null` — y `null` se escribe «sin plan de horas», nunca cero.
  const { real: hhReales, plan: hhPlan } = hhDeLaObra(tareas)
  const nombreDe = new Map((esperados.data ?? []).map((e) => [e.id, e]))
  const marcaDe = new Map((presencia.data ?? []).map((p) => [p.persona_id, p]))
  const primerError = error ?? actividades.error ?? arbol.error ?? impedimentos.error ?? hh.error ?? null

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
        {primerError && (
          <Aviso tono="neg" titulo="No se pudo leer todo lo del frente." testid="jefe-frente-error">
            {primerError}
          </Aviso>
        )}

        <section className="rounded-[16px] bg-surface px-5 py-[19px]">
          <div className="mb-1.5 truncate text-[11px] tracking-[0.06em] text-faint">
            {obra.nombre.toUpperCase()}
          </div>
          <h1 className="text-[20px] font-semibold leading-[1.28] text-ink">{f.frente.nombre}</h1>
          <div className="mt-2">
            <Estado tono={tonoDeEstado(f)} clave={estadoDelFrente(f).palabra} testid="estado-frente">
              {estadoDelFrente(f).palabra}
            </Estado>
          </div>
        </section>

        {/* EL PROBLEMA PRIMERO. Si el frente está parado, es lo primero de la pantalla: estaba
            debajo de las tres métricas y había que bajar para enterarse de que nadie puede trabajar
            ahí. Un impedimento abierto le gana a cualquier número. */}
        {impedimentosDelFrente.length > 0 && (
          <div>
            <Rotulo tono="neg">IMPEDIMENTOS ABIERTOS</Rotulo>
            <Panel testid="frente-impedimentos" filo="neg">
              {impedimentosDelFrente.map((i) => (
                <Fila
                  key={i.id}
                  testid="impedimento"
                  titulo={i.descripcion?.trim() || 'Impedimento sin descripción'}
                  detalle={[
                    i.actividad_id ? `Frena ${porId.get(i.actividad_id)?.nombre ?? 'una tarea'}` : null,
                    i.responsable ? `a cargo de ${i.responsable}` : 'sin responsable asignado',
                  ].filter(Boolean).join(' · ')}
                  tonoDetalle="neg"
                  icono={
                    <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[11px] bg-neg-soft text-neg">
                      <IconoAlerta className="h-[20px] w-[20px]" />
                    </span>
                  }
                />
              ))}
            </Panel>
          </div>
        )}

        {/* EL AVANCE CON SU COBERTURA Y SU FECHA DE PLAN. El número solo no alcanza: «40 % sobre 3
            de 11 tareas» y «40 % sobre 11 de 11» son dos afirmaciones muy distintas. */}
        <section className="rounded-[14px] bg-surface px-[18px] py-4" data-testid="frente-avance">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-muted">Avance del frente</span>
            <span className="font-mono text-[24px] font-semibold tabular-nums text-ink">
              {porcentajeCorto(f.pct)}
            </span>
          </div>
          <Barra pct={f.pct} tono={f.atrasoDias ? 'warn' : 'ink'} />
          <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-muted">
              {f.pct == null ? 'sin medir todavía' : `${f.medidas} de ${f.total} medidas`}
            </span>
            <span className={finPlan == null ? 'text-faint' : f.atrasoDias ? 'text-neg' : 'text-muted'}>
              {finPlan == null ? 'sin fin de plan' : `plan ${finPlan}`}
            </span>
          </div>
        </section>

        <Metricas
          testid="jefe-frente-metricas"
          metricas={[
            // EL AVANCE YA ESTÁ ARRIBA, con su cobertura: repetirlo acá gastaba un tercio del
            // encabezado en el mismo número. En su lugar van las HH del frente, que es lo que el
            // contrato J06 pone al lado del avance — y HH no es avance, por eso van separadas.
            {
              clave: 'HH reales',
              valor: hhReales == null ? '—' : formatearHH(hhReales),
              sub: hhPlan == null ? 'sin plan de horas' : `de ${formatearHH(hhPlan)} plan`,
              tono: hhReales != null && hhPlan != null && hhReales > hhPlan ? 'warn' : 'ink',
            },
            { clave: 'HH hoy', valor: f.hhHoy === 0 ? '—' : String(f.hhHoy), sub: f.personasHoy === 0 ? 'nadie imputó' : `${f.personasHoy} personas` },
            {
              clave: 'Atraso',
              valor: f.atrasoDias == null ? '—' : String(f.atrasoDias),
              sub: f.atrasoDias == null ? 'sin plan vencido' : 'días pasado el plan',
              tono: f.atrasoDias ? 'neg' : 'ink',
            },
          ]}
        />

        <div>
          <Rotulo extra={`${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}`}>
            TAREAS DEL FRENTE
          </Rotulo>
          <Panel testid="frente-tareas">
            {tareas.length === 0 ? (
              <Nada>Este frente agrupa otros frentes y todavía no tiene tareas medibles debajo.</Nada>
            ) : (
              tareas.map((t) => {
                const d = detalleDeTarea(t, hoy)
                return (
                  <a
                    key={t.actividad_id}
                    href={conObra('/obra/avance', obra.id, { actividad: t.actividad_id })}
                    data-testid="tarea-del-frente"
                    className="block min-h-[60px] border-t border-surface-sunken px-[17px] py-3.5 first:border-t-0 active:bg-surface-quiet"
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-medium text-ink">{t.nombre}</div>
                        <div className={`mt-0.5 text-[12.5px] ${
                          d.tono === 'neg' ? 'text-neg' : d.tono === 'warn' ? 'text-warn' : 'text-muted'
                        }`}>
                          {d.texto}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[20px] font-semibold tabular-nums text-ink">
                        {t.avance_pct == null ? '—' : `${t.avance_pct} %`}
                      </span>
                    </div>
                    <Barra
                      pct={t.avance_pct}
                      tono={estaTerminada(t) ? 'pos' : t.impedimentos_abiertos > 0 ? 'warn' : 'ink'}
                    />
                  </a>
                )
              })
            )}
          </Panel>
        </div>

        <div>
          <Rotulo>IMPUTARON HORAS HOY</Rotulo>
          <Panel testid="frente-gente">
            {horasPorPersona.size === 0 ? (
              // «Sin horas» NO es «sin trabajo»: son dos hechos distintos y esa línea se queda.
              <Nada>
                Nadie imputó horas acá hoy — no dice que no se trabajó. Se cargan al registrar el
                avance de una tarea, o desde Personal.
              </Nada>
            ) : (
              [...horasPorPersona.entries()].map(([personaId, horas]) => {
                const persona = nombreDe.get(personaId)
                const marca = marcaDe.get(personaId)
                const nombre = persona?.nombre_completo ?? marca?.nombre_completo ?? 'Persona sin nombre en el plantel'
                return (
                  <Fila
                    key={personaId}
                    testid="persona-del-frente"
                    titulo={nombre}
                    detalle={`${persona?.categoria ?? 'sin categoría'} · ${horas} HH imputadas`}
                    icono={
                      <span className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">
                        {iniciales(nombre)}
                        <span
                          aria-hidden
                          className={`absolute -bottom-px -right-px h-[12px] w-[12px] rounded-full border-2 border-surface ${
                            marca?.estado === 'activo' ? 'bg-pos' : 'bg-line-strong'
                          }`}
                        />
                      </span>
                    }
                    derecha={
                      marca?.entrada
                        ? <RelojDeJornada entrada={marca.entrada} />
                        : <span className="text-[12px] text-faint">sin marca</span>
                    }
                  />
                )
              })
            )}
          </Panel>
        </div>
      </div>

      <PieDeAccion>
        <div className="flex gap-2.5">
          <BotonEnlace
            href={conObra('/obra/avance-masivo', obra.id)}
            variante="primaria"
            tamano="bloque"
            data-testid="frente-cargar-avance"
          >
            Cargar avance
          </BotonEnlace>
          <BotonEnlace
            href={conObra('/obra/personas', obra.id)}
            variante="secundaria"
            tamano="bloque"
            data-testid="frente-ver-gente"
          >
            Ver la gente
          </BotonEnlace>
        </div>
      </PieDeAccion>
    </>
  )
}

/** `19.5` → `19,5`. Las HH son un dato, y van en el separador del país. */
const formatearHH = (h: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(h)

/** El estado del frente, traducido al vocabulario de puntos del sistema (`ds/Estado`). */
function tonoDeEstado(f: FrenteDelDia): TonoEstado {
  const t = estadoDelFrente(f).tono
  return t === 'neg' ? 'neg' : t === 'warn' ? 'warn' : t === 'ink' ? 'curso' : 'nulo'
}

/**
 * El fin de plan DEL FRENTE: el de su tarea abierta que termina más tarde. `null` si ninguna lo
 * tiene — un frente sin plan no está en fecha, está sin planificar, y las dos cosas no se dicen
 * igual.
 */
function finDelFrente(tareas: ActividadDelJefe[]): string | null {
  const fechas = tareas.filter((t) => !estaTerminada(t)).map((t) => t.fin_plan)
    .filter((f): f is string => !!f).sort()
  const ultima = fechas.at(-1)
  return ultima ? `${ultima.slice(8, 10)}/${ultima.slice(5, 7)}` : null
}
