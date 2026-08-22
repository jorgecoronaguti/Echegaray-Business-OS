'use client'

// 16 · CONTRA EL HISTÓRICO — lo cotizado frente a lo que rindió de verdad.
//
// ═══ CON UNA SOLA OBRA MEDIDA NO HAY RECOMENDACIÓN ═══
//
// `rendimiento_recomendado` deja `hs_recomendado` en NULL cuando hay menos de dos obras, y lo dice
// con todas las letras: «muestra chica: es un dato, no una recomendación». Un promedio de una sola
// obra presentado como recomendación es exactamente cómo una casualidad se convierte en política de
// cotización. Cuando no hay recomendación, el botón no aparece — se muestra el dato y su lectura.
//
// ═══ QUÉ HACE «USAR 37,60», Y QUÉ NO HACE ═══
//
// Escribe `hs_unitarias` en la partida. La vista hace `coalesce(p.hs_unitarias, ac.hs_unitarias)`,
// así que ese número GANA sobre el del análisis para esta cotización, sin tocar la base maestra.
//
// **NO cambia el costo.** El costo unitario sigue saliendo del análisis. Subir el rendimiento sube
// las HH previstas y el plazo; el precio queda igual. Es una limitación del modelo —no hay una
// composición propia por cotización— y la pantalla la dice al lado del botón en vez de dejar creer
// que recotizó.

import { useActionState, startTransition } from 'react'
import type { PartidaValorizada, RendimientoRecomendado } from '../types'
import { editarCampoPartida } from '../services/actionsPartida'
import { INICIAL, type EstadoAccion } from '../services/accion'
import { rendimiento } from '../services/formato'

export function ContraElHistorico({
  p, r, cotizacionId,
}: {
  p: PartidaValorizada
  r: RendimientoRecomendado | null
  cotizacionId: string
}) {
  const [estado, ejecutar, pendiente] = useActionState<EstadoAccion, FormData>(editarCampoPartida, INICIAL)

  if (!r) {
    return (
      <section className="mt-5 border-t border-line pt-3.5" data-testid="contra-historico">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">Contra el histórico</h3>
        <p className="mt-2 text-[12px] text-muted">
          Esta partida no está vinculada a una tarea tipo, así que no hay histórico contra el cual
          compararla. Sin ese vínculo, el rendimiento que se mida en obra tampoco vuelve a la base.
        </p>
      </section>
    )
  }

  const cotizado = p.hs_unitarias
  const recomendado = r.hs_recomendado
  const sinCubrir = cotizado !== null && recomendado !== null ? recomendado - cotizado : null

  function aplicar(valor: number) {
    const d = new FormData()
    d.set('partida_id', p.partida_id)
    d.set('cotizacion_id', cotizacionId)
    d.set('campo', 'hs_unitarias')
    d.set('valor', String(valor))
    startTransition(() => ejecutar(d))
  }

  return (
    <section className="mt-5 border-t border-line pt-3.5" data-testid="contra-historico">
      {/* LA MAGNITUD, EN EL TÍTULO. Las dos filas son hs/unidad —esfuerzo—: sin decirlo, «observado
          mayor que cotizado» parece una mejora y es lo contrario, que es justo lo que el ámbar de
          la fila de abajo está señalando. */}
      <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
        Contra el histórico · esfuerzo hs/{p.unidad ?? 'un'}
      </h3>
      <dl className="mt-2 text-[12px]">
        <Fila k="Cotizado ahora" v={rendimiento(cotizado)} falta="sin dato" fuerte />
        <Fila k="Observado (mediana)" v={rendimiento(r.hs_observado_mediana)} falta="sin medir"
          tono={r.hs_observado_mediana !== null && cotizado !== null && r.hs_observado_mediana > cotizado ? 'warn' : undefined} />
        <Fila k={`Muestra · ${r.obras} ${r.obras === 1 ? 'obra' : 'obras'}`} v={r.muestra === 0 ? null : `${r.muestra} registros`} falta="sin dato" />
      </dl>

      <p className="mt-2 rounded-card bg-surface-quiet px-2.5 py-2 text-[11.5px] leading-relaxed text-muted" data-testid="lectura-rendimiento">
        {r.lectura}
        {sinCubrir !== null && sinCubrir > 0 && (
          <> · Cotizar con {rendimiento(cotizado)} deja {rendimiento(sinCubrir)} HH sin cubrir por {p.unidad ?? 'unidad'}.</>
        )}
      </p>

      {recomendado !== null && (
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => aplicar(recomendado)}
            data-testid="usar-recomendado"
            className="rounded-control bg-marca px-3 py-[6px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] hover:brightness-[0.97] disabled:bg-surface-sunken disabled:text-faint"
          >
            {pendiente ? 'Aplicando…' : `Usar ${rendimiento(recomendado)}`}
          </button>
          {cotizado !== null && (
            <span className="text-[12.5px] text-muted">Dejar {rendimiento(cotizado)}</span>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-warn" data-testid="limite-rendimiento">
        Aplicarlo cambia las HH previstas y el plazo de esta cotización. NO cambia el costo: el
        precio sale del análisis de la base maestra, y para moverlo hay que versionar el análisis.
      </p>

      {estado.error && <p className="mt-1 text-[11px] text-neg" data-testid="error-rendimiento">{estado.error}</p>}
      {estado.ok && <p className="mt-1 text-[11px] text-pos">Esfuerzo aplicado a esta partida.</p>}
    </section>
  )
}

function Fila({ k, v, falta, fuerte, tono }: {
  k: string; v: string | null; falta: string; fuerte?: boolean; tono?: 'warn'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <dt className="text-faint">{k}</dt>
      <dd className={`font-mono tabular-nums ${tono === 'warn' ? 'text-warn' : fuerte ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
        {v ?? <span className="font-sans text-faint">{falta}</span>}
      </dd>
    </div>
  )
}
