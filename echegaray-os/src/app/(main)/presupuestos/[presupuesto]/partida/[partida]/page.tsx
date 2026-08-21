// 16 · ANÁLISIS DE PARTIDA — de qué está hecha, cuánto rinde y qué dice el histórico.
//
// ═══ DE DÓNDE SALE LA COMPOSICIÓN ═══
//
// Del análisis VIVO mientras el presupuesto está en borrador; de la copia CONGELADA una vez que
// salió. El origen se dice arriba, porque es la diferencia entre «así se cotiza hoy» y «así se
// cotizó ese día», y las dos cosas se ven igual si nadie las nombra.
//
// ═══ LO QUE ESTA PANTALLA NO PUEDE HACER, Y LO DICE ═══
//
// El contrato visual pide un toggle `Usa base maestra` ↔ `Análisis propio` que vuelva editables las
// cantidades de cada insumo SÓLO para esta cotización. El modelo no tiene dónde guardar eso:
// `cotizacion_partida_composicion` la escribe `congelar_presupuesto()` y la vista de valorización
// ni siquiera la lee para calcular el costo —lee `costo_unitario` o el análisis—. Editar cantidades
// acá cambiaría un desglose que no afecta ningún precio: una pantalla que finge recotizar.
//
// Se deja el control a la vista, apagado y con el motivo, en vez de esconder la brecha.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import {
  getComposicion, getPartida, getPresupuesto, getRendimiento,
} from '@/features/presupuestos/services/presupuestosService'
import { desglosar, desgloseCierra } from '@/features/presupuestos/services/composicion'
import { incidencia, tieneCifras } from '@/features/presupuestos/services/cascada'
import { cantidad as fCantidad, hh as fHH, importe, plata, porcentaje, rendimiento } from '@/features/presupuestos/services/formato'
import { TablaComposicion } from '@/features/presupuestos/components/TablaComposicion'
import { ContraElHistorico } from '@/features/presupuestos/components/ContraElHistorico'
import { Aviso, BarraContexto, MetaContexto, Nulo } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

export default async function PartidaPage({
  params,
}: {
  params: Promise<{ presupuesto: string; partida: string }>
}) {
  const { presupuesto: presupuestoId, partida: partidaId } = await params

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) {
    return (
      <div className="px-4 py-6 lg:px-10">
        <Aviso tono="warn" titulo="Sin permiso" testid="sin-permiso">
          El análisis de una partida es costo de punta a punta: lo ven Dirección y Administración.
          No es que no haya datos.
        </Aviso>
      </div>
    )
  }

  const [{ data: presupuesto }, { data: p, error }] = await Promise.all([
    getPresupuesto(supabase, presupuestoId),
    getPartida(supabase, partidaId),
  ])
  if (!p || !presupuesto) {
    if (error?.startsWith('No existe')) notFound()
    return <div className="px-4 py-6 lg:px-10"><Aviso tono="neg" titulo="No pude leer la partida">{error ?? 'sin detalle'}</Aviso></div>
  }

  const [composicion, rend] = await Promise.all([
    getComposicion(supabase, p),
    getRendimiento(supabase, p.tarea_tipo_id),
  ])
  const desglose = desglosar(composicion.data?.lineas ?? [])
  const control = desgloseCierra(desglose.totalDesglose, p.costo_unitario)
  const incPresupuesto = incidencia(p.subtotal, tieneCifras(presupuesto) ? presupuesto.costo_directo : null)
  const origen = composicion.data?.origen ?? 'sin_analisis'

  return (
    <div className="min-h-screen bg-canvas">
      <BarraContexto
        volverA={`/presupuestos/${presupuestoId}`}
        volverLabel={`${presupuesto.numero ?? 'Presupuesto'} · ${presupuesto.obra_nombre ?? ''}`}
        titulo={`${p.codigo ? `${p.codigo} · ` : ''}${p.descripcion}`}
        meta={
          <>
            <MetaContexto>
              {p.cantidad === null ? 'sin cómputo' : `${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()}
            </MetaContexto>
            <MetaContexto rotulo="Composición">
              {origen === 'congelada' ? 'congelada con el presupuesto'
                : origen === 'viva' ? 'de la base maestra, precios de hoy'
                : 'sin análisis cargado'}
            </MetaContexto>
            <MetaContexto rotulo="HH">{fHH(p.hh) ?? 'sin dato'}</MetaContexto>
          </>
        }
        kpis={[{ rotulo: 'Costo unitario', valor: plata(p.costo_unitario), falta: 'sin dato' }]}
      />

      <div className="w-full px-4 py-5 lg:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-ink">
                Composición por {p.unidad ?? 'unidad'}
              </h2>
              <div className="flex items-center gap-3 text-[12px]" data-testid="toggle-origen">
                <span className="font-semibold text-ink">Usa base maestra</span>
                <span className="text-faint" aria-disabled data-testid="analisis-propio-no-disponible">
                  Análisis propio
                </span>
              </div>
            </div>

            <div className="mt-2">
              {/* LA BRECHA DECLARADA, no escondida. */}
              <Aviso tono="info" titulo="El análisis propio todavía no existe en el modelo" testid="aviso-analisis-propio">
                Editar las cantidades sólo para esta cotización necesita una composición por
                presupuesto que la base no tiene: la única copia (`cotizacion_partida_composicion`)
                la escribe el congelado y no interviene en el costo. Lo que sí se puede ajustar sin
                tocar la base maestra es el RENDIMIENTO, abajo a la derecha.
              </Aviso>
            </div>

            <div className="mt-4">
              <TablaComposicion desglose={desglose} testid="composicion-partida" />
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line-strong pt-2.5">
              <span className="text-[14px] font-semibold text-ink">Costo unitario</span>
              <span className="font-mono text-[20px] font-semibold tabular-nums text-ink" data-testid="costo-unitario">
                {plata(p.costo_unitario) ?? <Nulo>sin dato</Nulo>}
              </span>
            </div>

            {!control.cierra && (
              <div className="mt-3">
                <Aviso tono="warn" titulo="El desglose no cierra contra el costo unitario" testid="aviso-desglose">
                  Las líneas suman {importe(desglose.totalDesglose)} y el costo unitario que entra en
                  la cascada es {importe(p.costo_unitario)} — {importe(control.diferencia)} de
                  diferencia. Son dos caminos independientes al mismo número: que discrepen significa
                  que hay líneas sin precio o que la copia congelada quedó incompleta.
                </Aviso>
              </div>
            )}

            {composicion.error && (
              <div className="mt-3"><Aviso tono="neg" titulo="No pude leer la composición">{composicion.error}</Aviso></div>
            )}
          </div>

          <aside className="min-w-0">
            <section data-testid="rinde-y-hh">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">Rinde y HH</h3>
              <dl className="mt-2 text-[12px]">
                <Fila k="Rendimiento" v={p.hs_unitarias === null ? null : `${rendimiento(p.hs_unitarias)} hs/${p.unidad ?? 'un'}`} falta="sin dato" fuerte />
                <Fila k="HH de la partida" v={fHH(p.hh)} falta="sin dato" />
                <Fila k="Cantidad" v={p.cantidad === null ? null : `${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()} falta="sin cómputo" />
                <Fila k="Subtotal partida" v={plata(p.subtotal)} falta="sin cargar" fuerte />
              </dl>
            </section>

            <section className="mt-5" data-testid="incidencia">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">Incidencia</h3>
              <div className="mt-2 space-y-2.5">
                <Barra rotulo="Mano de obra + cargas" pct={desglose.incidencia.mano_obra} color="bg-pos" />
                <Barra rotulo="Materiales" pct={desglose.incidencia.materiales} color="bg-accent" />
                <Barra rotulo="Equipos" pct={desglose.incidencia.equipos} color="bg-[#91918B]" />
                <Barra rotulo="En el presupuesto total" pct={incPresupuesto} color="bg-accent" />
              </div>
            </section>

            <ContraElHistorico p={p} r={rend.data ?? null} cotizacionId={presupuestoId} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function Fila({ k, v, falta, fuerte }: { k: string; v: string | null; falta: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <dt className="text-faint">{k}</dt>
      <dd className={`font-mono tabular-nums ${fuerte ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
        {v ?? <span className="font-sans text-faint">{falta}</span>}
      </dd>
    </div>
  )
}

/** Una barra sólo se dibuja cuando el número ES una fracción de 0 a 100. Sin dato, no hay barra. */
function Barra({ rotulo, pct, color }: { rotulo: string; pct: number | null; color: string }) {
  return (
    <div data-barra={rotulo}>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="text-muted">{rotulo}</span>
        <span className="font-mono tabular-nums text-ink-soft">
          {porcentaje(pct, 'auto') ?? <span className="font-sans text-faint">sin base</span>}
        </span>
      </div>
      {pct !== null && (
        <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-[#EAE7E6]">
          <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      )}
    </div>
  )
}
