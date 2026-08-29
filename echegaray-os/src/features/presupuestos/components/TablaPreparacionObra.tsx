'use client'

// 13 · QUÉ PARTIDAS SE CONVIERTEN EN ACTIVIDADES — la tabla del canónico, medida.
//
// ═══ LAS MEDIDAS SALEN DE `13 · Preparar Obra desde Presupuesto.dc.html` ═══
//
// Columnas `18px minmax(0,1.7fr) 92px 64px minmax(0,1.1fr) 116px` con 10px de canal · cabecera de
// 36px sobre `surface-quiet` con los rótulos a 10px y `.05em` · fila de 48px mínimo con hairline ·
// casilla de 18px y radio 5 en el amarillo de marca · chips de medición de 30px y radio 7 en
// grafito cuando están activos. Los px son los del mockup y se dejan en px.
//
// ═══ LA FILA ENTERA ES EL CONTROL, MENOS LOS CHIPS ═══
//
// Tocar cualquier parte de la fila la marca y la desmarca; los chips de medición paran el evento.
// Es lo que hace el mockup y es lo que hace falta: con cuarenta partidas, apuntar a un cuadrado de
// 18px cuarenta veces es un ejercicio de puntería.
//
// ═══ LA DESVIACIÓN DECLARADA: EL CHIP «PASOS» NO ALCANZA ═══
//
// El mockup dibuja tres chips —pasos · cantidad · manual— como si el método fuera una elección
// libre. En esta base los PASOS salen de una plantilla de secuencia (`plantilla_paso`), y
// `convertir_partida_a_plan` con `p_metodo = 'pasos'` y `p_plantilla_id` en null crea la actividad
// marcada «por pasos» y SIN un solo paso adentro: una actividad que no se puede medir de ninguna
// manera. Por eso el chip abre, en la misma fila, el selector de la plantilla — no navega a otro
// lado, que es exactamente lo que el dueño prohibió.

import Link from 'next/link'
import { EnvoltorioAncho } from '@/shared/components/canon/EnvoltorioAncho'
import type { MetodoMedicion, Plantilla } from '../types'
import type { FilaPreparacion } from '../services/preparacionObra'
import { cantidad as fCantidad, hh as fHH } from '../services/formato'

/** El grid del canónico. Vive en una constante porque la cabecera y las filas TIENEN que usar el
 *  mismo: dos listas de columnas que se separan desalinean la tabla y ningún test lo nota. */
const COLS = '18px minmax(0,1.7fr) 92px 64px minmax(0,1.1fr) 116px'

const ROTULO = 'text-[10px] tracking-[0.05em] text-faint'

function Tilde({ lado = 11 }: { lado?: number }) {
  return (
    <svg width={lado} height={lado} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

/** La flecha de «se convierte en». Es la misma que el canónico dibuja en verde: no es decoración,
 *  dice de qué lado está el presupuesto y de cuál el plan. */
function Flecha() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

const TRAZO_METODO: Record<MetodoMedicion, React.ReactNode> = {
  // Escalera: el % sale de etapas reales.
  pasos: <path d="M4 18h4V6h4v8h4V9h4" />,
  // Renglones: el % sale de la cantidad ejecutada.
  cantidad: <path d="M4 7h16M4 12h16M4 17h9" />,
  // Lápiz: alguien lo estima a mano.
  manual: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>,
}

const TIP_METODO: Record<MetodoMedicion, string> = {
  pasos: 'Por pasos: el % sale de etapas reales de una plantilla de secuencia',
  cantidad: 'Por cantidad ejecutada',
  manual: 'Manual: alguien estima el porcentaje',
}

const METODOS: MetodoMedicion[] = ['pasos', 'cantidad', 'manual']

export interface Props {
  filas: FilaPreparacion[]
  seleccion: ReadonlySet<string>
  alMarcar: (partidaId: string) => void
  alMarcarTodo: () => void
  metodoDe: (partidaId: string) => MetodoMedicion | null
  alElegirMetodo: (partidaId: string, metodo: MetodoMedicion) => void
  plantillas: Plantilla[]
  plantillaDe: (partidaId: string) => string | null
  alElegirPlantilla: (partidaId: string, plantillaId: string | null) => void
  /** El detalle por frentes de UNA partida: sigue viviendo en el configurador. */
  hrefDetalle: (partidaId: string) => string
}

export function TablaPreparacionObra({
  filas, seleccion, alMarcar, alMarcarTodo, metodoDe, alElegirMetodo,
  plantillas, plantillaDe, alElegirPlantilla, hrefDetalle,
}: Props) {
  const marcadas = filas.filter((f) => seleccion.has(f.partidaId)).length
  return (
    // ═══ LA GRILLA SE ARMABA A MANO Y NO SCROLLEABA (QA visual, 390×844, 29/08/2026) ═══
    //
    // Esta tabla escribe `gridTemplateColumns` directo y nunca pasó por `EnvoltorioAncho`, que es
    // lo que las otras tablas del canon usan para reservar ancho en el teléfono. Con `body` en
    // `overflow-x: clip`, a 390 px la columna de la descripción —`minmax(0,1.7fr)`— caía a CERO y
    // el dato no se corría: se cortaba. En pantalla quedaban «s/c» y la cantidad, sin forma de
    // saber de qué partida se estaba hablando ni barra que avisara que faltaba algo.
    //
    // Se envuelve con el mismo mecanismo ya probado, con las MISMAS columnas. Por encima de 1024 px
    // no cambia nada: la media query no aplica y el escritorio sigue midiendo lo que mide el mockup.
    <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-surface" data-testid="tabla-preparacion">
      <div className="flex items-center gap-2.5 border-b border-surface-sunken px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Qué partidas se convierten en actividades</h2>
        <span className="text-[12px] text-muted" data-testid="cuenta-preparacion">
          {marcadas} de {filas.length} partidas
        </span>
        <button
          type="button" onClick={alMarcarTodo} data-testid="marcar-todo"
          title={marcadas > 0 ? 'Desmarcar todo' : 'Marcar todo lo convertible'}
          aria-label={marcadas > 0 ? 'Desmarcar todo' : 'Marcar todo lo convertible'}
          className="ml-auto flex h-[28px] w-[28px] items-center justify-center rounded-control border border-line text-muted hover:text-ink"
        >
          {marcadas > 0
            ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              )
            : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h9" /><path d="M17 17l2 2 3-3" />
              </svg>
              )}
        </button>
      </div>
      <EnvoltorioAncho cols={COLS}>

      <div
        className="grid h-[36px] items-end gap-2.5 border-b border-line bg-surface-quiet px-4"
        style={{ gridTemplateColumns: COLS }}
      >
        <span />
        <span className={`${ROTULO} pb-2`}>PARTIDA DEL PRESUPUESTO</span>
        <span className={`${ROTULO} pb-2 text-right`}>CANT.</span>
        <span className={`${ROTULO} pb-2 text-right`}>HH</span>
        <span className={`${ROTULO} pb-2`}>SE CONVIERTE EN</span>
        <span className={`${ROTULO} pb-2`}>MEDICIÓN</span>
      </div>

      {filas.map((f) => (
        <Fila
          key={f.partidaId} f={f} marcada={seleccion.has(f.partidaId)} alMarcar={alMarcar}
          metodo={metodoDe(f.partidaId)} alElegirMetodo={alElegirMetodo}
          plantillas={plantillas} plantilla={plantillaDe(f.partidaId)} alElegirPlantilla={alElegirPlantilla}
          hrefDetalle={hrefDetalle}
        />
      ))}

      {filas.length === 0 && (
        <p className="px-4 py-[26px] text-[12.5px] text-muted">
          Este presupuesto no tiene partidas: no hay nada que convertir.
        </p>
      )}
      </EnvoltorioAncho>
    </div>
  )
}

function Fila({
  f, marcada, alMarcar, metodo, alElegirMetodo, plantillas, plantilla, alElegirPlantilla, hrefDetalle,
}: {
  f: FilaPreparacion
  marcada: boolean
  alMarcar: (id: string) => void
  metodo: MetodoMedicion | null
  alElegirMetodo: (id: string, m: MetodoMedicion) => void
  plantillas: Plantilla[]
  plantilla: string | null
  alElegirPlantilla: (id: string, p: string | null) => void
  hrefDetalle: (id: string) => string
}) {
  const elegible = f.estado === 'convertible'
  return (
    <div
      role={elegible ? 'button' : undefined}
      tabIndex={elegible ? 0 : undefined}
      aria-pressed={elegible ? marcada : undefined}
      onClick={elegible ? () => alMarcar(f.partidaId) : undefined}
      onKeyDown={elegible
        ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alMarcar(f.partidaId) } }
        : undefined}
      data-testid="fila-preparacion"
      data-partida={f.partidaId}
      data-estado={f.estado}
      data-marcada={marcada ? '1' : undefined}
      // #FEFCF2 es el amarillo de marca al 6% sobre blanco: el realce de la fila elegida del
      // canónico, más tenue que `marca-soft` porque acá lo llevan ocho filas a la vez.
      className={`grid min-h-[48px] items-center gap-2.5 border-b border-[#F1F0EC] px-4 py-2 ${
        elegible ? 'cursor-pointer' : ''
      } ${marcada ? 'bg-[#FEFCF2]' : 'hover:bg-surface-quiet'}`}
      style={{ gridTemplateColumns: COLS }}
    >
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] text-ink ${
          marcada ? 'border-marca bg-marca' : 'border-line-strong bg-surface'
        } ${elegible ? '' : 'opacity-40'}`}
      >
        {marcada && <Tilde />}
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-[7px]">
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{f.codigo ?? 's/c'}</span>
          <span className={`truncate text-[12.5px] ${elegible ? 'text-ink' : 'text-muted'}`}>{f.nombre}</span>
        </span>
        <span className="mt-px block truncate text-[11px] text-faint">{f.rubro ?? 'sin rubro'}</span>
      </span>

      {/* NULL NO ES CERO: una partida sin cómputo dice «sin cómputo», que es la razón por la que no
          se puede convertir. */}
      <span className={`text-right font-mono text-[11.5px] tabular-nums ${f.cantidad == null ? 'text-faint' : 'text-ink'}`}>
        {f.cantidad == null ? 'sin cómputo' : `${fCantidad(f.cantidad)}${f.unidad ? ` ${f.unidad}` : ''}`}
      </span>
      <span className={`text-right font-mono text-[11.5px] tabular-nums ${f.hh == null ? 'text-faint' : 'text-ink'}`}>
        {f.hh == null ? '—' : fHH(f.hh)}
      </span>

      <span className="flex min-w-0 items-center gap-[7px]">
        {f.estado === 'convertida' && (
          <span className="truncate text-[11.5px] text-pos" data-testid="ya-convertida">
            ya convertida · {f.frentes === 1 ? '1 frente' : `${f.frentes} frentes`}
          </span>
        )}
        {f.estado === 'sin_computo' && (
          <span className="text-[11.5px] text-faint">no se convierte · sin cómputo</span>
        )}
        {f.estado === 'convertible' && !marcada && (
          <span className="text-[11.5px] text-faint">no se convierte</span>
        )}
        {f.estado === 'convertible' && marcada && (
          <>
            <span className="flex shrink-0 text-pos"><Flecha /></span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-ink">{f.destino}</span>
              {/* «1 frente» es un HECHO del lote: la partida entera en un frente. Para partirla en
                  tres por eje está el configurador, a un clic y sin perder lo marcado. */}
              <span className="block text-[11px] text-faint">
                1 frente ·{' '}
                <Link
                  href={hrefDetalle(f.partidaId)} prefetch={false} scroll={false}
                  onClick={(e) => e.stopPropagation()}
                  className="underline hover:text-ink" data-testid="link-frentes"
                >
                  partir en frentes
                </Link>
              </span>
            </span>
          </>
        )}
      </span>

      <span className="flex min-w-0 flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        {f.estado === 'convertible' && metodo && (
          <>
            <span className="flex items-center gap-1">
              {METODOS.map((m) => (
                <button
                  key={m} type="button" title={TIP_METODO[m]} aria-label={TIP_METODO[m]}
                  aria-pressed={metodo === m}
                  disabled={f.subcontratada}
                  data-testid={`metodo-${m}`}
                  onClick={() => alElegirMetodo(f.partidaId, m)}
                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border ${
                    metodo === m
                      ? 'border-accent bg-accent text-white'
                      : 'border-line bg-surface text-muted hover:text-ink'
                  } ${f.subcontratada ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {TRAZO_METODO[m]}
                  </svg>
                </button>
              ))}
            </span>
            {/* Ver el encabezado: sin plantilla, «por pasos» es una actividad sin pasos. */}
            {metodo === 'pasos' && (
              plantillas.length === 0
                ? <span className="text-[10.5px] text-neg">no hay plantillas de secuencia cargadas</span>
                : (
                  <select
                    value={plantilla ?? ''} data-testid="plantilla-fila"
                    aria-label={`Plantilla de secuencia de ${f.nombre}`}
                    onChange={(e) => alElegirPlantilla(f.partidaId, e.target.value || null)}
                    className={`h-[24px] w-full rounded-control border bg-surface px-1 text-[10.5px] ${
                      plantilla ? 'border-line text-ink' : 'border-neg text-neg'
                    }`}
                  >
                    <option value="">elegir plantilla</option>
                    {plantillas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  )
            )}
          </>
        )}
        {f.subcontratada && f.estado === 'convertible' && (
          <span className="text-[10.5px] text-faint">paquete: se mide por cantidad</span>
        )}
      </span>
    </div>
  )
}
