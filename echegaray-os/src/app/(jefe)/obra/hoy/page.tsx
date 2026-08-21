import { Aviso } from '@/shared/components/ds'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import { SelectorObra } from '@/features/jefe/components/SelectorObra'
import {
  Barra, Encabezado, EnlacePrimario, Fila, Metricas, Nada, Panel, Rotulo, porcentaje,
} from '@/features/jefe/components/Piezas'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra, renglonDeObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos } from '@/features/jefe/services/jefeService'
import { frentesAbiertos, frentesDelDia, problemasDelDia } from '@/features/jefe/services/dia'
import { conObra } from '@/features/jefe/services/navegacion'
import { diasDeAtraso } from '@/features/jefe/services/frentes'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { agrupar } from '@/features/administracion/services/presencia'

// J01 · HOY — abro el teléfono parado en la obra y sé qué tengo que resolver antes del mediodía.
//
// ═══ EL ORDEN ES LA JERARQUÍA ═══
//
// Cómo va la obra → qué la frena → cómo va cada frente → quién está. Lo que decide primero va
// primero, y lo que no se usa en obra no viaja: acá no hay contratado, ni costo, ni certificado, ni
// margen. No porque estén escondidos —`ve_economia()` se los niega a este rol en la base— sino
// porque parado frente a un encofrado ninguno de los cuatro cambia lo que hay que hacer hoy.
//
// ═══ EL PANEL QUE NO TIENE NADA QUE DECIR NO SE DIBUJA ═══
//
// «Resolver hoy» aparece cuando hay algo que resolver. Un bloque que siempre dice algo deja de
// decir, y en 390px cada bloque que sobra empuja al siguiente fuera de la pantalla.

export const dynamic = 'force-dynamic'

export default async function JefeHoyPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const { obra: pedida } = await searchParams
  const { supabase, obras, obra, error } = await contextoDeObra(pedida)
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

  const grupos = agrupar(presencia.data ?? [], esperados.data ?? [])
  const problemas = problemasDelDia({
    actividades: actividades.data ?? [],
    impedimentos: impedimentos.data ?? [],
    sinRegistrar: grupos.sinRegistrar.length,
    hoy,
  })
  const frentes = frentesAbiertos(frentesDelDia(arbol.data ?? [], actividades.data ?? [], hh.data ?? [], hoy))
  const atrasoObra = diasDeAtraso(obra.fecha_fin_plan, null, hoy)
  const asignados = (esperados.data ?? []).length
  const enObra = grupos.enObra.length

  const primerError = error ?? actividades.error ?? arbol.error ?? impedimentos.error
    ?? presencia.error ?? esperados.error ?? hh.error ?? null

  return (
    <>
      <Encabezado
        titulo={<SelectorObra obras={obras} actual={obra} />}
        sub={renglonDeObra(obra)}
      />

      <div className="flex flex-col gap-3 px-4 pb-6">
        {primerError && (
          <Aviso tono="neg" titulo="No se pudo leer todo lo de esta pantalla." testid="jefe-hoy-error">
            {primerError}
          </Aviso>
        )}

        <Metricas
          testid="jefe-hoy-metricas"
          metricas={[
            {
              clave: 'Avance',
              valor: porcentaje(obra.avance_pct),
              sub: `${obra.n_actividades_medidas} de ${obra.n_actividades} medidas`,
            },
            {
              clave: 'En obra',
              // NUNCA «0 de 14» cuando nadie marcó: sin plantel asignado el número no existe.
              valor: asignados === 0 ? '—' : String(enObra),
              sub: asignados === 0 ? 'sin plantel asignado' : `de ${asignados} asignados`,
            },
            {
              clave: 'Fin de plan',
              valor: obra.fecha_fin_plan ? fechaCorta(obra.fecha_fin_plan) : '—',
              sub: obra.fecha_fin_plan
                ? (atrasoObra ? `${atrasoObra} días pasado` : 'en plazo')
                : 'sin fecha de fin',
              tono: atrasoObra ? 'neg' : 'ink',
            },
          ]}
        />

        {problemas.length > 0 && (
          <Panel titulo="Resolver hoy" contador={String(problemas.length)} testid="jefe-hoy-problemas">
            {problemas.map((p) => (
              <Fila
                key={p.clave}
                testid="problema"
                href={p.actividadId
                  ? conObra('/obra/avance', obra.id, { actividad: p.actividadId })
                  : conObra('/obra/personas', obra.id)}
                titulo={p.titulo}
                detalle={p.detalle}
                tonoDetalle={p.tono}
                icono={
                  <span
                    aria-hidden
                    className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[17px] ${
                      p.tono === 'neg' ? 'bg-neg-soft text-neg' : 'bg-warn-soft text-warn'
                    }`}
                  >
                    △
                  </span>
                }
              />
            ))}
          </Panel>
        )}

        <div>
          <Rotulo extra={frentes.length > 0 ? `${frentes.length} abiertos` : undefined}>FRENTES</Rotulo>
          <Panel testid="jefe-hoy-frentes">
            {frentes.length === 0 ? (
              <Nada testid="sin-frentes">
                Esta obra no tiene ningún frente con trabajo abierto. Los frentes salen del árbol de
                la obra: son los rubros que agrupan tareas, y se arman desde la planificación.
              </Nada>
            ) : (
              frentes.map((f) => (
                <div key={f.frente.id} className="border-t border-surface-sunken first:border-t-0">
                  <a
                    data-testid="frente"
                    href={conObra('/obra/frente', obra.id, { frente: f.frente.id })}
                    className="block min-h-[60px] px-[18px] py-3 active:bg-surface-quiet"
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-medium text-ink">{f.frente.nombre}</div>
                        <div className={`mt-0.5 text-[12.5px] ${f.atrasoDias ? 'text-warn' : 'text-muted'}`}>
                          {detalleDelFrente(f)}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[19px] font-semibold tabular-nums text-ink">
                        {porcentaje(f.pct)}
                      </span>
                    </div>
                    <Barra pct={f.pct} tono={f.atrasoDias ? 'warn' : 'ink'} />
                  </a>
                </div>
              ))
            )}
          </Panel>
        </div>

        <Panel testid="jefe-hoy-gente">
          <Fila
            testid="ir-a-personas"
            href={conObra('/obra/personas', obra.id)}
            titulo="Quién está hoy"
            detalle={
              asignados === 0
                ? 'Sin plantel asignado a esta obra'
                : `${enObra} en obra · ${grupos.sinRegistrar.length} sin registrar`
            }
            tonoDetalle={grupos.sinRegistrar.length > 0 ? 'warn' : 'muted'}
            icono={
              <span aria-hidden className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[12px] bg-marca-soft text-[20px]">
                ◔
              </span>
            }
          />
        </Panel>
      </div>

      <PieDeAccion sobreBarra>
        <EnlacePrimario href={conObra('/obra/avance-masivo', obra.id)} testid="cargar-avance-del-dia">
          Cargar avance del día
        </EnlacePrimario>
      </PieDeAccion>
    </>
  )
}

/** `2026-01-30` → `30/01`. En el teléfono el año sobra: nadie planifica a dos años vista acá. */
function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function detalleDelFrente(f: { personasHoy: number; atrasoDias: number | null; abiertas: number; medidas: number; total: number }): string {
  // LA AUSENCIA DE HORAS NO SE REPITE DOCE VECES. Cuando nadie imputó en ninguno —que es lo
  // normal a media mañana— el renglón se llenaba del mismo texto y dejaba de decir algo. Lo que
  // siempre se dice es cuánto trabajo queda abierto; las horas, sólo cuando las hay.
  const partes = [`${f.abiertas} ${f.abiertas === 1 ? 'tarea abierta' : 'tareas abiertas'}`]
  if (f.personasHoy > 0) {
    partes.unshift(`${f.personasHoy} ${f.personasHoy === 1 ? 'persona' : 'personas'} con horas hoy`)
  }
  if (f.atrasoDias) partes.push(`${f.atrasoDias} d de atraso`)
  if (f.medidas < f.total) partes.push(`${f.medidas} de ${f.total} medidas`)
  return partes.join(' · ')
}
