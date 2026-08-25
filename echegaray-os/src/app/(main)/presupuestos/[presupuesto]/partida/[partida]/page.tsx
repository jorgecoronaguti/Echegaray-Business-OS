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
import { Aviso, Ayuda, Nulo } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import {
  BandaDetalle, C, LineaCampos, MIN_COLUMNA_FICHA, PANEL, PastillaTitulo, TONO,
} from '@/shared/components/canon'

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
    return <EstadoError mensaje={error ?? 'La consulta no devolvió la partida y tampoco un error.'} que="el análisis de la partida" />
  }

  const [composicion, rend] = await Promise.all([
    getComposicion(supabase, p),
    getRendimiento(supabase, p.tarea_tipo_id),
  ])
  const desglose = desglosar(composicion.data?.lineas ?? [])
  const control = desgloseCierra(desglose.totalDesglose, p.costo_unitario)
  const incPresupuesto = incidencia(p.subtotal, tieneCifras(presupuesto) ? presupuesto.costo_directo : null)
  const origen = composicion.data?.origen ?? 'sin_analisis'

  // ORIGEN DE LA COMPOSICIÓN COMO ESTADO: es la diferencia entre «así se cotiza hoy» y «así se
  // cotizó ese día», y las dos se ven igual si nadie las nombra.
  const estadoOrigen = origen === 'sin_analisis'
    ? { tono: TONO.warn, texto: 'Sin análisis' }
    : origen === 'congelada'
      ? { tono: TONO.pos, texto: 'Congelado con el presupuesto' }
      : { tono: TONO.curso, texto: 'Base maestra · precios de hoy' }

  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      {/* LA BANDA BLANCA DEL CANÓNICO 16: miga de pan de TRES tramos —Presupuestos / el
          presupuesto / esta partida—, el código de la partida en mono ANTES del título, y la línea
          de campos debajo. El código abre el título porque es la clave con la que se la nombra en
          obra y en la base maestra, no un dato secundario del subtítulo. */}
      <BandaDetalle
        testid="banda-partida"
        miga={[
          { texto: 'Presupuestos', href: '/presupuestos' },
          { texto: presupuesto.obra_nombre ?? presupuesto.numero ?? 'Presupuesto', href: `/presupuestos/${presupuestoId}` },
          { texto: p.descripcion },
        ]}
        antesDelTitulo={
          p.codigo
            ? <span className="font-mono tabular-nums" style={{ fontSize: '13px', color: C.apagado }}>{p.codigo}</span>
            : undefined
        }
        titulo={p.descripcion}
        pastillas={
          <PastillaTitulo color={estadoOrigen.tono.color} fondo={estadoOrigen.tono.fondo} borde={estadoOrigen.tono.borde} testid="origen-composicion">
            {estadoOrigen.texto}
          </PastillaTitulo>
        }
        campos={
          <LineaCampos
            testid="campos-partida"
            campos={[
              `Rubro: ${p.rubro ?? 'sin rubro'}`,
              <span key="c" className="font-mono tabular-nums">
                {p.cantidad === null ? 'sin cómputo' : `${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()}
              </span>,
              <span key="h" className="font-mono tabular-nums">{fHH(p.hh) ?? 'sin dato'} HH</span>,
              `análisis por unidad de ${p.unidad ?? 'un.'}`,
            ]}
          />
        }
      />

      {/* DOS COLUMNAS QUE ENVUELVEN, no una grilla de dos anchos fijos: el canónico da a la
          izquierda `flex:1;minWidth:520px` y a la derecha 392px, así que debajo de ~930px el panel
          baja solo en vez de estrangular la tabla de insumos. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px 24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: MIN_COLUMNA_FICHA }}>
            {/* EL TOGGLE «Usa base maestra ↔ Análisis propio» SE FUE, y no por prolijidad: era un
                control dibujado sobre una capacidad que la base no tiene. Una pantalla con un
                interruptor apagado promete que existe la otra posición. El canon 16 no lo dibuja y
                la brecha sigue declarada acá abajo, que es donde se la busca cuando se la necesita:
                al querer cambiar una cantidad. */}
            <Ayuda titulo="Por qué las cantidades no se editan acá" testid="ayuda-analisis-propio">
              Cambiar las cantidades sólo para esta cotización necesita una composición por
              presupuesto que la base no tiene: la única copia (`cotizacion_partida_composicion`) la
              escribe el congelado y no interviene en el costo. Editarlas movería un desglose que no
              cambia ningún precio. Lo que sí se puede ajustar sin tocar la base maestra es el
              ESFUERZO, en «Contra el histórico».
            </Ayuda>

            <div className="mt-3">
              <TablaComposicion desglose={desglose} unidad={p.unidad} testid="composicion-partida" />
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

          <aside style={{ width: PANEL.analisis, flexShrink: 0, minWidth: 0 }}>
            {/* ═══ EL COSTO UNITARIO, ARMADO (Design 23/08 · pantalla 16) ═══
                Eran cuatro barras de incidencia con su porcentaje. La incidencia sigue —ahora en la
                cabecera de cada sección de la izquierda, al lado de su subtotal— y este bloque pasa
                a decir de qué está hecho el peso: cada sección en PLATA, el costo unitario, y cuánto
                da multiplicado por el cómputo. La barra no se pierde: se pierde la barra que medía
                una incidencia contra otra incidencia, que no es una fracción del mismo todo. */}
            <section
              data-testid="costo-unitario-armado"
              className="overflow-hidden rounded-card border border-line bg-surface px-4 py-3"
            >
              {/* DICE «COSTO UNITARIO» Y NO «PRECIO UNITARIO» COMO EL CANON: el precio de venta de
                  UNA partida no existe en el modelo. Gastos generales y margen se aplican sobre el
                  presupuesto entero en `cotizacion_cascada`, que es la única cascada del sistema;
                  prorratearlos acá para llenar la tarjeta sería un segundo camino al mismo número,
                  con el resultado garantizado de que un día no coincidan. El precio de venta se lee
                  en la 15, entero y una sola vez. */}
              <h3 className="text-[13px] font-semibold text-ink">Costo unitario</h3>
              <dl className="mt-2 text-[12px]">
                {desglose.secciones.map((s) => (
                  <Fila
                    key={s.clave}
                    k={s.rotulo.charAt(0) + s.rotulo.slice(1).toLowerCase()}
                    v={importe(s.total)}
                    falta="sin cargar"
                  />
                ))}
              </dl>
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line-strong pt-2">
                <span className="text-[13px] font-semibold text-ink">Por {p.unidad ?? 'unidad'}</span>
                <span className="font-mono text-[19px] font-semibold tabular-nums text-ink" data-testid="costo-unitario">
                  {plata(p.costo_unitario) ?? <Nulo>sin dato</Nulo>}
                </span>
              </div>
              <dl className="mt-2 text-[12px]">
                <Fila
                  k={p.cantidad === null ? 'Por el cómputo' : `× ${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()}
                  v={plata(p.subtotal)} falta="sin cómputo" fuerte
                />
                {/* Ésta SÍ es una fracción del mismo todo: la parte del costo directo del
                    presupuesto que se lleva esta partida. */}
                <Fila k="Del presupuesto" v={porcentaje(incPresupuesto, 'auto')} falta="sin base" />
                <Fila k="HH de la partida" v={fHH(p.hh)} falta="sin dato" />
                <Fila
                  k="Esfuerzo"
                  v={p.hs_unitarias === null ? null : `${rendimiento(p.hs_unitarias)} hs/${p.unidad ?? 'un'}`}
                  falta="sin dato"
                />
              </dl>
            </section>

            <ContraElHistorico p={p} r={rend.data ?? null} cotizacionId={presupuestoId} />
          </aside>
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
