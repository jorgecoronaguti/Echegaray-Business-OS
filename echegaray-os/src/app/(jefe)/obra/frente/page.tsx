import Link from 'next/link'
import { SinObra } from '@/features/jefe/components/SinObra'
import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, Azulejo, PieFijo, RotuloSeccion, TarjetaLista, TopBarDetalle, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos } from '@/features/jefe/services/jefeService'
import type { ActividadDelJefe } from '@/features/jefe/services/jefeService'
import { estadoDelFrente, frentesDelDia, estaTerminada } from '@/features/jefe/services/dia'
import { aspectoDeFrente, aspectoDeTarea } from '@/features/jefe/services/aspecto'
import { hhDeLaObra } from '@/features/jefe/services/progreso'
import { conObra } from '@/features/jefe/services/navegacion'
import { iniciales } from '@/features/jefe/services/personas'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'

// J06 · EL FRENTE — el contenedor del árbol, con el mismo vocabulario que la pantalla de una tarea.
//
// ═══ POR QUÉ ACÁ NO HAY PASOS ═══
//
// El mockup J06 titula una ACTIVIDAD y marca SUS pasos: eso se portó en `/obra/avance?actividad=…`.
// Esta pantalla es el nodo que AGRUPA, al que se llega desde las tarjetas de J01, y un contenedor no
// tiene pasos ni se mide: la base rechaza un avance cargado contra `tipo='resumen'`. Lo que se
// dibuja es lo mismo de J06 que sí aplica —el problema arriba, el avance con su cobertura, los tres
// azulejos, quién está y a dónde ir— y en el lugar de los pasos van sus tareas, cada una con su
// estado, para entrar a la que hay que cargar.
//
// ═══ «GENTE EN EL FRENTE» ES QUIEN IMPUTÓ HORAS ACÁ HOY ═══
//
// El modelo no tiene «persona asignada a un frente»: `obra_asignacion` la asigna a la OBRA y
// `cuadrilla` no cuelga de ninguna actividad. El único vínculo REGISTRADO entre una persona y un
// frente es la imputación de horas contra `actividad_id`, y es lo que se usa. Por eso el rótulo dice
// lo que el dato afirma —imputaron horas hoy— y no «la cuadrilla del frente».

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
  const volver = { href: conObra('/obra/hoy', obra.id), label: 'Hoy' }
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
        <TopBarDetalle volver={volver} testidVolver="volver-jefe" titulo="Frente" sub={obra.nombre} />
        <div style={{ padding: '16px 16px 24px' }}>
          <Vacio>Esta obra no tiene frentes. Se arman desde la planificación.</Vacio>
        </div>
      </>
    )
  }

  const porId = new Map((actividades.data ?? []).map((a) => [a.actividad_id, a]))
  const tareas = f.frente.tareas.map((id) => porId.get(id)).filter((a): a is ActividadDelJefe => !!a)
  const idsDelFrente = new Set(f.frente.tareas)
  const impedimentosDelFrente = (impedimentos.data ?? [])
    .filter((i) => i.actividad_id && idsDelFrente.has(i.actividad_id))

  const horasPorPersona = new Map<string, number>()
  for (const h of hh.data ?? []) {
    if (!idsDelFrente.has(h.actividad_id)) continue
    horasPorPersona.set(h.persona_id, (horasPorPersona.get(h.persona_id) ?? 0) + h.horas)
  }
  const nombreDe = new Map((esperados.data ?? []).map((e) => [e.id, e.nombre_completo]))
  const marcaDe = new Map((presencia.data ?? []).map((p) => [p.persona_id, p]))
  const finPlan = finDelFrente(tareas)
  // Las horas del frente salen de la MISMA regla que las de la obra en J03: sin una sola tarea que
  // las declare, `null` — y `null` se escribe «sin plan de horas», nunca cero.
  const { real: hhReales, plan: hhPlan } = hhDeLaObra(tareas)
  const aspecto = aspectoDeFrente(f)
  const primerError = error ?? actividades.error ?? arbol.error ?? impedimentos.error ?? hh.error ?? null

  return (
    <>
      <TopBarDetalle
        volver={volver}
        testidVolver="volver-jefe"
        titulo={f.frente.nombre}
        sub={`${obra.nombre} · ${estadoDelFrente(f).palabra}`}
      />

      <div style={{ padding: '16px 16px 104px' }}>
        {primerError && <AvisoError testid="jefe-frente-error">{primerError}</AvisoError>}

        {/* EL PROBLEMA PRIMERO. Un impedimento abierto le gana a cualquier número. */}
        {impedimentosDelFrente.length > 0 && (
          <div
            data-testid="frente-impedimentos"
            style={{
              background: C.negFondo, border: `1px solid ${C.negBorde}`, borderRadius: R.tarjeta,
              padding: 14, marginBottom: 14,
            }}
          >
            {impedimentosDelFrente.map((i, idx) => (
              <div
                key={i.id}
                data-testid="impedimento"
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, minHeight: 64,
                  borderTop: idx > 0 ? `1px solid ${C.negDivisor}` : undefined,
                  paddingTop: idx > 0 ? 12 : 0, marginTop: idx > 0 ? 12 : 0,
                }}
              >
                <span style={{ display: 'flex', color: C.neg, flexShrink: 0 }}><Icono nombre="bloqueo" tamano={22} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Frente parado</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>
                    {i.descripcion?.trim() || 'Impedimento sin descripción'}
                    {i.responsable ? ` · a cargo de ${i.responsable}` : ' · sin responsable'}
                  </div>
                </div>
                {i.actividad_id && (
                  <Link
                    href={conObra('/obra/avance', obra.id, { actividad: i.actividad_id })}
                    style={{ fontSize: 12.5, fontWeight: 600, color: C.neg, flexShrink: 0 }}
                  >
                    Resolver
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* EL AVANCE CON SU COBERTURA: «40 % sobre 3 de 11» y «40 % sobre 11 de 11» son dos
            afirmaciones muy distintas y hasta hoy se veían iguales. */}
        <div
          data-testid="frente-avance"
          style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: C.muted }}>Avance</span>
            <span style={{ ...mono, fontSize: 24, fontWeight: 600, color: C.ink }}>
              {f.pct == null ? '—' : pct(f.pct)}
            </span>
          </div>
          <div style={{ height: 9, background: C.pista, borderRadius: 5, marginTop: 8, overflow: 'hidden' }}>
            {f.pct != null && (
              <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, f.pct))}%`, background: aspecto.barra }} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
            <span style={{ ...mono, fontSize: 12.5, color: C.muted }}>
              {f.pct == null ? 'sin medir todavía' : `${f.medidas} de ${f.total} medidas`}
            </span>
            <span style={{ ...mono, fontSize: 12.5, color: finPlan == null ? C.faint : f.atrasoDias ? C.neg : C.muted }}>
              {finPlan == null ? 'sin fin de plan' : `plan ${finPlan}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }} data-testid="jefe-frente-metricas">
          <Azulejo
            icono="reloj" rotulo="HH REALES" tamanoValor={17} colorIcono={C.faint}
            valor={hhReales == null ? '—' : n1(hhReales)}
            detalle={hhPlan == null ? 'sin plan' : `de ${n1(hhPlan)} plan`}
            colorValor={hhReales != null && hhPlan != null && hhReales > hhPlan ? C.warn : C.ink}
          />
          <Azulejo
            icono="cuadrilla" rotulo="HH HOY" tamanoValor={17} colorIcono={C.faint}
            valor={f.hhHoy === 0 ? '—' : n1(f.hhHoy)}
            detalle={f.personasHoy === 0 ? 'nadie imputó' : `${f.personasHoy} personas`}
          />
          <Azulejo
            icono="fecha" rotulo="ATRASO" tamanoValor={17} colorIcono={C.faint}
            valor={f.atrasoDias == null ? '—' : `${f.atrasoDias} d`}
            colorValor={f.atrasoDias ? C.neg : C.ink}
            detalle={f.atrasoDias == null ? 'sin plan vencido' : 'pasado el plan'}
          />
        </div>

        <RotuloSeccion icono="paso" extra={`${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}`}>
          Tareas del frente
        </RotuloSeccion>
        <div style={{ marginTop: 9 }}>
          <TarjetaLista testid="frente-tareas">
            {tareas.length === 0 ? (
              <Vacio>Este frente agrupa otros frentes y todavía no tiene tareas medibles debajo.</Vacio>
            ) : tareas.map((t) => {
              const a = aspectoDeTarea(t)
              return (
                <Link
                  key={t.actividad_id}
                  href={conObra('/obra/avance', obra.id, { actividad: t.actividad_id })}
                  data-testid="tarea-del-frente"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
                    borderBottom: `1px solid ${C.divisor}`, minHeight: 52, color: C.ink,
                  }}
                >
                  <span title={a.titulo} style={{ display: 'flex', color: a.color, flexShrink: 0 }}>
                    <Icono nombre={a.icono} tamano={18} />
                  </span>
                  <span style={{
                    fontSize: 14, color: estaTerminada(t) ? C.inkSuave : C.ink, minWidth: 0, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.nombre}
                  </span>
                  <span style={{ ...mono, fontSize: 12.5, fontWeight: 600, color: a.colorValor, flexShrink: 0 }}>
                    {t.avance_pct == null ? '—' : pct(t.avance_pct)}
                  </span>
                </Link>
              )
            })}
          </TarjetaLista>
        </div>

        <RotuloSeccion
          icono="cuadrilla"
          extra={horasPorPersona.size === 0 ? 'sin horas hoy' : `${horasPorPersona.size} con horas`}
          colorExtra={horasPorPersona.size === 0 ? C.faint : C.muted}
        >
          Quién está en el frente
        </RotuloSeccion>
        {horasPorPersona.size === 0 ? (
          // «Sin horas» NO es «sin trabajo»: son dos hechos distintos y esa línea se queda.
          <Vacio testid="frente-sin-gente">
            Nadie imputó horas acá hoy — no dice que no se trabajó. Se cargan al registrar el avance
            de una tarea, o desde Personal.
          </Vacio>
        ) : (
          <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 0 }} data-testid="frente-gente">
            {[...horasPorPersona.keys()].slice(0, 6).map((personaId, i) => {
              const nombre = nombreDe.get(personaId) ?? marcaDe.get(personaId)?.nombre_completo ?? 'Sin nombre'
              const fichado = !!marcaDe.get(personaId)?.entrada
              return (
                <span
                  key={personaId}
                  title={nombre}
                  data-testid="persona-del-frente"
                  style={{
                    width: 38, height: 38, borderRadius: 19, marginLeft: i === 0 ? 0 : -9,
                    background: fichado ? C.posFondo : C.inerte, color: fichado ? C.pos : C.inkSuave,
                    border: `2px solid ${C.surface}`, fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {iniciales(nombre)}
                </span>
              )
            })}
            <span style={{ marginLeft: 12, fontSize: 12.5, color: C.muted }}>
              {[...horasPorPersona.keys()].every((id) => marcaDe.get(id)?.entrada)
                ? 'todos fichados'
                : 'alguno sin marca de asistencia'}
            </span>
          </div>
        )}
      </div>

      <PieFijo>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href={conObra('/obra/avance-masivo', obra.id)}
            data-testid="frente-cargar-avance"
            style={{
              flex: 1, minHeight: 52, borderRadius: R.control, background: C.marca, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              fontSize: 16, fontWeight: 600,
            }}
          >
            <Icono nombre="ok" tamano={20} grosor={2.4} />
            Cargar avance
          </Link>
          <Link
            href={conObra('/obra/personas', obra.id)}
            data-testid="frente-ver-gente"
            title="Ver la gente"
            aria-label="Ver la gente"
            style={{
              width: 52, minHeight: 52, borderRadius: R.control, border: `1px solid ${C.linea}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, flexShrink: 0,
            }}
          >
            <Icono nombre="cuadrilla" tamano={21} />
          </Link>
        </div>
      </PieFijo>
    </>
  )
}

const n1 = (h: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(h)

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
