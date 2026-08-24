'use client'

// 14 · EL PANEL DE LA CARTERA — comparar candidatos sin salir de la lista.
//
// ═══ POR QUÉ LA SELECCIÓN NO NAVEGA ACÁ, Y EN LA 15 SÍ ═══
//
// El panel de la 15 necesita la composición de la partida, que se lee en el servidor: sin `?partida=`
// no habría con qué dibujarlo. Éste no lee NADA nuevo — cada fila de `cotizacion_cascada` ya trae
// todo lo que el panel muestra—, así que navegar agregaría un viaje al servidor y un esqueleto por
// cada fila que alguien toca mientras compara tres ofertas. `?sel=` igual queda escrito en la
// dirección, pero con `replaceState` desde `ListaPresupuestos`: compartible sin pagar el viaje.
//
// ═══ EL PANEL NO PUEDE PUBLICAR UN NÚMERO QUE LA LISTA NO PUBLICA ═══
//
// Los mismos `null` con los mismos nombres: «sin cargar» cuando no hay partidas, «sin dato» cuando
// no hay margen contra el cual medir. Un panel que rellena con 0 lo que la fila declara ausente
// contradice a la fila que lo abrió.

// ═══ «CONVERTIR A OBRA» SE OFRECE CUANDO LA BASE LO ACEPTARÍA, NO SIEMPRE ═══
//
// Las tres condiciones —adjudicada, congelada, con obra vinculada— las hace cumplir
// `convertir_partida_a_plan`. Dibujar el botón igual y dejar que la pantalla siguiente lo rechace
// mueve el error dos clics más adelante; y esconderlo sin decir nada obliga a adivinar qué falta.
// Cuando no se puede, va el MOTIVO que devuelve `puedeConvertir`.

import { BotonEnlace, Estado, Nulo, PanelDetalle } from '@/shared/components/ds'
import type { PresupuestoCascada } from '../types'
import { lecturaEstado, puedeConvertir } from '../services/estado'
import { tieneCifras } from '../services/cascada'
import { fecha, hh, plata, porcentaje } from '../services/formato'

export function PanelPresupuesto({
  p,
  onCerrar,
  margenObjetivo,
}: {
  p: PresupuestoCascada
  onCerrar: () => void
  margenObjetivo: number
}) {
  const e = lecturaEstado(p.estado)
  const conCifras = tieneCifras(p)
  const margen = p.margen_sobre_precio_pct
  const bajoObjetivo = margen !== null && margen < margenObjetivo
  const conversion = puedeConvertir(p)

  return (
    <PanelDetalle
      titulo={p.obra_nombre ?? 'sin objeto'}
      subtitulo={
        <span className="font-mono text-[11.5px] tabular-nums">
          {p.numero ?? 'sin número'} · v{p.version}
          {p.vigente ? '' : ' · reemplazada'}
        </span>
      }
      estado={<Estado tono={e.tono} clave={e.clave}>{e.label}</Estado>}
      onCerrar={onCerrar}
      testid="panel-presupuesto"
      pie={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BotonEnlace href={`/presupuestos/${p.id}`} variante="primaria" data-testid="abrir-computo">
            Abrir el cómputo
          </BotonEnlace>
          {conversion.puede ? (
            <BotonEnlace href={`/presupuestos/${p.id}/convertir`} data-testid="panel-convertir">
              Convertir a obra
            </BotonEnlace>
          ) : (
            <span className="min-w-0 text-[11.5px] text-faint" data-testid="panel-convertir-motivo">
              {conversion.motivo}
            </span>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Bloque rotulo="Total" valor={conCifras ? plata(p.precio_venta) : null} falta="sin cargar" />
        <Bloque
          rotulo="Margen"
          valor={porcentaje(margen)}
          falta="sin dato"
          tono={bajoObjetivo ? 'warn' : 'pos'}
        />
      </div>

      <dl className="mt-4 text-[12.5px]">
        <Fila k="Cliente" v={p.cliente} falta="sin cliente" />
        <Fila k="Partidas" v={p.n_partidas === 0 ? null : String(p.n_partidas)} falta="sin cargar" />
        <Fila k="HH del cómputo" v={conCifras ? hh(p.hh_previstas) : null} falta="sin cargar" />
        <Fila k="Cotizado el" v={fecha(p.fecha_cotizacion)} falta="sin fecha" />
        <Fila k="Congelado" v={fecha(p.congelada_en)} falta="todavía no" />
        <Fila k="Obra" v={p.obra_canonica_id ? (p.obra_nombre ?? 'vinculada') : null} falta="sin vincular" />
      </dl>

      {/* La deuda de carga se dice en la fila cerrada, no dentro de una sección plegada: un
          presupuesto con partidas sin análisis publica un precio incompleto y eso decide si se
          manda o no. Es un problema, no un detalle. */}
      {p.n_sin_analisis > 0 && (
        <p className="mt-4 border-l-2 border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="panel-sin-analisis">
          {p.n_sin_analisis} {p.n_sin_analisis === 1 ? 'partida' : 'partidas'} sin análisis de precio:
          el total de arriba está incompleto.
        </p>
      )}
      {p.n_sin_computo > 0 && (
        <p className="mt-2 border-l-2 border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="panel-sin-computo">
          {p.n_sin_computo} sin cómputo: no se pueden convertir en plan de obra.
        </p>
      )}
    </PanelDetalle>
  )
}

function Bloque({ rotulo, valor, falta, tono }: {
  rotulo: string; valor: string | null; falta: string; tono?: 'pos' | 'warn'
}) {
  return (
    <div className="rounded-card border border-line px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</div>
      <div className={`mt-0.5 font-mono text-[19px] font-semibold tabular-nums ${
        valor === null ? 'text-faint' : tono === 'warn' ? 'text-warn' : tono === 'pos' ? 'text-pos' : 'text-ink'
      }`}>
        {valor ?? <span className="font-sans text-[12.5px] font-normal">{falta}</span>}
      </div>
    </div>
  )
}

function Fila({ k, v, falta }: { k: string; v: string | null; falta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <dt className="text-faint">{k}</dt>
      <dd className="min-w-0 truncate text-right text-ink-soft">{v ?? <Nulo>{falta}</Nulo>}</dd>
    </div>
  )
}
