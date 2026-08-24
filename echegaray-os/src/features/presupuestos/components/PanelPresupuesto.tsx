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

import type { ReactNode } from 'react'
import { BotonEnlace, Estado, Nulo, PanelDetalle } from '@/shared/components/ds'
import {
  IconoCliente, IconoFecha, IconoHH, IconoObra, IconoPresupuesto, IconoProblema,
} from '@/shared/components/iconos'
import type { PresupuestoCascada } from '../types'
import { lecturaEstado, puedeConvertir } from '../services/estado'
import { tieneCifras } from '../services/cascada'
import { problemasDe } from '../services/cartera'
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
  const problemas = problemasDe(p)

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
        // ═══ LA PRIMARIA ES LA DEL ESTADO, NO SIEMPRE LA MISMA (canónico 14) ═══
        //
        // El diseño pone arriba del panel UN botón que cambia con el estado. Acá vive en el pie
        // —`COMPONENTS.md` §Drawer: «Footer con la primaria del objeto»— pero la elección es la
        // misma: cuando el presupuesto está listo para convertirse, la acción que sigue es
        // PREPARAR LA OBRA, y abrir el cómputo pasa a secundaria. Con una primaria fija, la
        // única acción que cierra el ciclo comercial quedaba dibujada igual que un enlace más.
        //
        // «Preparar obra» y no «Convertir a obra»: es el título de la pantalla que abre (13 ·
        // Preparar Obra desde Presupuesto). Dos nombres para el mismo destino obligan a
        // adivinar que son lo mismo.
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {conversion.puede ? (
            <>
              <BotonEnlace href={`/presupuestos/${p.id}/convertir`} variante="primaria" data-testid="panel-convertir">
                Preparar obra
              </BotonEnlace>
              <BotonEnlace href={`/presupuestos/${p.id}`} data-testid="abrir-computo">
                Abrir el cómputo
              </BotonEnlace>
            </>
          ) : (
            <>
              <BotonEnlace href={`/presupuestos/${p.id}`} variante="primaria" data-testid="abrir-computo">
                Abrir el cómputo
              </BotonEnlace>
              <span className="min-w-0 text-[11.5px] text-faint" data-testid="panel-convertir-motivo">
                {conversion.motivo}
              </span>
            </>
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

      {/* ═══ CADA DATO CON SU ICONO Y SU VALOR A LA IZQUIERDA (canónico 14) ═══

          Estaban en `justify-between`: el rótulo pegado al borde izquierdo y el valor al derecho,
          con hasta 200px de vacío en el medio y una línea de puntos imaginaria que el ojo tiene
          que recorrer para saber qué le corresponde a qué. El diseño alinea los valores en una
          sola columna a 104px del rótulo — se leen los seis de arriba abajo sin saltar. El icono
          no decora: es lo que deja encontrar «HH» o «Cliente» sin leer las seis etiquetas. */}
      <dl className="mt-4">
        <Fila icono={<IconoCliente />} k="Cliente" v={p.cliente} falta="sin cliente" />
        <Fila icono={<IconoPresupuesto />} k="Partidas" v={p.n_partidas === 0 ? null : `${p.n_partidas} partidas`} falta="sin cargar" />
        <Fila icono={<IconoHH />} k="HH del cómputo" v={conCifras ? hh(p.hh_previstas) : null} falta="sin cargar" />
        <Fila icono={<IconoFecha />} k="Cotizado el" v={fecha(p.fecha_cotizacion)} falta="sin fecha" />
        <Fila icono={<IconoFecha />} k="Congelado" v={fecha(p.congelada_en)} falta="todavía no" />
        <Fila icono={<IconoObra />} k="Obra" v={p.obra_canonica_id ? (p.obra_nombre ?? 'vinculada') : null} falta="sin vincular" />
      </dl>

      {/* ═══ EL PANEL Y EL CHIP DICEN LA MISMA FRASE ═══

          Acá había dos párrafos escritos a mano —«sin análisis», «sin cómputo»— mientras el chip
          «Con problema» contaba CUATRO deudas con `problemasDe()`. Un presupuesto con un
          subcontrato sin precio entraba al chip y el panel no lo mencionaba: el filtro mandaba a
          alguien a una ficha que no explicaba por qué estaba ahí. Ahora sale de la misma función,
          así que no pueden separarse. Va en la ficha cerrada y no en un plegable: un precio
          incompleto decide si la oferta se manda, es un problema y no un detalle. */}
      {problemas.length > 0 && (
        <div
          className="mt-4 flex items-start gap-2.5 rounded-card border border-[#F0E1CD] bg-warn-soft px-3 py-2.5"
          data-testid="panel-problemas"
        >
          <span className="mt-px shrink-0 text-warn"><IconoProblema className="h-[15px] w-[15px]" /></span>
          <div className="min-w-0 text-[12px] text-warn">
            {problemas.map((m) => <div key={m}>{m}</div>)}
            <div className="mt-1 text-faint">El total de arriba está incompleto.</div>
          </div>
        </div>
      )}
    </PanelDetalle>
  )
}

// ═══ 16px Y NO 19px: EL IMPORTE REAL NO ENTRA (canónico 14) ═══
//
// A 19px, «$ 144.770.593» —el total real de COT-2026-001— parte el signo del número y ocupa dos
// renglones dentro de una tarjeta de 174px. Un total de nueve cifras es lo NORMAL en esta empresa,
// así que el tamaño se elige contra ese caso y no contra el ejemplo corto. El fondo `quiet`
// separa el bloque de la ficha sin encerrarlo en una caja más.
function Bloque({ rotulo, valor, falta, tono }: {
  rotulo: string; valor: string | null; falta: string; tono?: 'pos' | 'warn'
}) {
  return (
    <div className="rounded-card border border-[#EFEEEA] bg-surface-quiet px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</div>
      <div className={`mt-0.5 font-mono text-[16px] font-semibold tabular-nums ${
        valor === null ? 'text-faint' : tono === 'warn' ? 'text-warn' : tono === 'pos' ? 'text-pos' : 'text-ink'
      }`}>
        {valor ?? <span className="font-sans text-[12.5px] font-normal">{falta}</span>}
      </div>
    </div>
  )
}

function Fila({ icono, k, v, falta }: {
  icono: ReactNode; k: string; v: string | null; falta: string
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#F5F4F0] py-2 last:border-0">
      <span className="shrink-0 text-faint" aria-hidden>{icono}</span>
      <dt className="w-[104px] shrink-0 text-[11.5px] text-muted">{k}</dt>
      <dd className="min-w-0 truncate text-[12px] text-ink-soft">{v ?? <Nulo>{falta}</Nulo>}</dd>
    </div>
  )
}
