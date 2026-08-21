import { Aviso } from '@/shared/components/ds'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import {
  Barra, Encabezado, EnlacePrimario, EnlaceSecundario, Fila, Metricas, Nada, Panel, Rotulo,
  porcentaje,
} from '@/features/jefe/components/Piezas'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos } from '@/features/jefe/services/jefeService'
import { frentesDelDia, estaTerminada } from '@/features/jefe/services/dia'
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
            <Nada>
              Esta obra no tiene frentes. Los frentes son los rubros que agrupan tareas en el árbol
              de la obra, y se arman desde la planificación.
            </Nada>
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
          <h1 className="mb-4 text-[20px] font-semibold leading-[1.28] text-ink">{f.frente.nombre}</h1>
          <Barra pct={f.pct} tono={f.atrasoDias ? 'warn' : 'ink'} />
        </section>

        <Metricas
          testid="jefe-frente-metricas"
          metricas={[
            { clave: 'Avance', valor: porcentaje(f.pct), sub: `${f.medidas} de ${f.total} medidas`, tono: f.atrasoDias ? 'warn' : 'ink' },
            { clave: 'HH hoy', valor: f.hhHoy === 0 ? '—' : String(f.hhHoy), sub: f.personasHoy === 0 ? 'nadie imputó' : `${f.personasHoy} personas` },
            {
              clave: 'Atraso',
              valor: f.atrasoDias == null ? '—' : String(f.atrasoDias),
              sub: f.atrasoDias == null ? 'sin plan vencido' : 'días pasado el plan',
              tono: f.atrasoDias ? 'neg' : 'ink',
            },
          ]}
        />

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
                    <span aria-hidden className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[11px] bg-neg-soft text-[18px] text-neg">
                      △
                    </span>
                  }
                />
              ))}
            </Panel>
          </div>
        )}

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
                      <span className="shrink-0 font-mono text-[19px] font-semibold tabular-nums text-ink">
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
              <Nada>
                Nadie tiene horas imputadas a este frente hoy. Las horas se cargan al registrar el
                avance de una tarea, o desde Personal. Que no haya horas no dice que no se trabajó:
                dice que todavía no se imputaron.
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
          <span className="flex-1">
            <EnlacePrimario href={conObra('/obra/avance-masivo', obra.id)} testid="frente-cargar-avance">
              Cargar avance
            </EnlacePrimario>
          </span>
          <span className="flex-1">
            <EnlaceSecundario href={conObra('/obra/personas', obra.id)} testid="frente-ver-gente">
              Ver la gente
            </EnlaceSecundario>
          </span>
        </div>
      </PieDeAccion>
    </>
  )
}
