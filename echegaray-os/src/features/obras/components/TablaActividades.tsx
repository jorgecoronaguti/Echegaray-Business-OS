'use client'

// LA TABLA DE ACTIVIDADES — la mitad izquierda del workspace de Planificación.
//
// ═══ CINCO COLUMNAS Y NINGUNA MÁS ═══
//
// `design/screens/planificacion-gantt.md`: **Actividad · Estado · Inicio · Fin · %**. La sexta
// columna útil siempre existe —HH, responsable, unidad— y siempre le saca ancho al nombre, que es
// el dato de la fila. Todo lo demás vive en el panel, a un clic, sin sacar a nadie del Gantt.
//
// ═══ POR QUÉ NO ES `<table>` ═══
//
// Es la única desviación del componente `Tabla` del DS en esta pantalla, y tiene una razón medible:
// el alto de un `<tr>` es ORIENTATIVO —el navegador lo estira según el contenido y las reglas de
// colapso de bordes—, y acá cada fila tiene que medir exactamente lo que dice `disposicionDeFilas`
// para caer sobre su barra. Con cajas de borde incluido y alto explícito la alineación es una
// propiedad del código, no algo que haya que verificar mirando. El aspecto es el mismo del handoff:
// hairline superior, filas separadas por #EFEEEA, encabezado en 10px versalitas faint.

import { Estado, type TonoEstado } from '@/shared/components/ds'
import type { Fila } from '../services/cronograma'
import type { Disposicion } from '../services/cronograma'
import { ESTADO_LABEL } from '../types'
import { Casilla } from './AccionesMasivas'
import { fecha as fmtFecha } from './formato'

const TONO: Record<string, TonoEstado> = {
  bloqueada: 'neg', hecha: 'pos', en_curso: 'curso', lista: 'pendiente', pendiente: 'pendiente',
}

const COLS = { estado: 88, fecha: 54, pct: 48 }

export interface TablaPlanProps {
  filas: readonly Fila[]
  disp: Disposicion
  seleccionada: string | null
  alSeleccionar: (id: string) => void
  colapsados: ReadonlySet<string>
  alAlternar: (clave: string) => void
  /** Sin selección en lote no se dibuja una sola casilla: ver `AccionesMasivas`. */
  enLote?: ReadonlySet<string>
  alMarcar?: (ids: string[], puesto: boolean) => void
  /** Las columnas de fecha se van en tablet: quedan Actividad + Estado + %. */
  compacta?: boolean
}

export function CabeceraTabla({ conCasilla, todas, alMarcarTodas, compacta, hayColapsados, alAlternarTodos }: {
  conCasilla: boolean
  todas: boolean
  alMarcarTodas: (v: boolean) => void
  compacta?: boolean
  /** Contraer y expandir TODOS los rubros. Vive en el encabezado de la columna que agrupa, que es
   *  donde se lo busca: una obra de doce rubros se recorre plegándola, no scrolleando. */
  hayColapsados?: boolean
  alAlternarTodos?: () => void
}) {
  return (
    <div className="flex h-[72px] shrink-0 items-end gap-2 border-b border-line pb-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
      {conCasilla && (
        <span className="pl-3">
          <Casilla puesta={todas} alCambiar={alMarcarTodas} etiqueta="Seleccionar todas las actividades" testid="masiva-todas" />
        </span>
      )}
      {alAlternarTodos && (
        <button
          type="button"
          onClick={alAlternarTodos}
          data-testid="alternar-grupos"
          title={hayColapsados ? 'Expandir todos los rubros' : 'Contraer todos los rubros'}
          aria-label={hayColapsados ? 'Expandir todos los rubros' : 'Contraer todos los rubros'}
          className={`ml-3 inline-block w-2 shrink-0 text-[12px] leading-none text-[#C9C4C2] transition-transform hover:text-ink ${hayColapsados ? '' : 'rotate-90'}`}
        >›</button>
      )}
      <span className={`min-w-0 flex-1 truncate ${conCasilla || alAlternarTodos ? '' : 'pl-3'}`}>Actividad</span>
      <span style={{ width: COLS.estado }}>Estado</span>
      {/* EN TABLET LA TABLA BAJA A TRES COLUMNAS —Actividad · Estado · %— y las fechas se van:
          `LAYOUT_RESPONSIVE.md` §Tablet. Se hace con CSS y no con la medición del divisor porque
          abajo de `lg` no hay divisor que medir. */}
      {!compacta && <span className="hidden lg:block" style={{ width: COLS.fecha }}>Inicio</span>}
      {!compacta && <span className="hidden lg:block" style={{ width: COLS.fecha }}>Fin</span>}
      <span className="pr-3 text-right" style={{ width: COLS.pct }}>%</span>
    </div>
  )
}

/** El rubro: caret, nombre en versalitas y su contador. El mismo lenguaje que `FilaGrupo` del DS. */
function FilaRubro({ f, alto, salto, cerrado, alAlternar, casilla }: {
  f: Extract<Fila, { tipo: 'grupo' }>
  alto: number
  salto: number
  cerrado: boolean
  alAlternar: () => void
  casilla?: React.ReactNode
}) {
  const g = f.grupo
  return (
    <div
      className="flex items-center gap-2 border-b border-[#EFEEEA] px-3"
      style={{ height: alto, marginTop: salto }}
    >
      {casilla}
      <button
        type="button"
        onClick={alAlternar}
        aria-expanded={!cerrado}
        data-testid="grupo-cronograma"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span aria-hidden className={`inline-block w-2 shrink-0 text-[12px] leading-none text-[#C9C4C2] transition-transform ${cerrado ? '' : 'rotate-90'}`}>›</span>
        <span className="min-w-0 truncate text-[11.5px] font-semibold tracking-[0.04em] text-ink" title={g.nombre}>{g.nombre}</span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">{g.hijas.length}</span>
      </button>
    </div>
  )
}

/** Una actividad. Seleccionada: fondo `surface-quiet` y la regla amarilla de 2px por dentro. */
function FilaActividad({ f, alto, sel, alSeleccionar, casilla, compacta }: {
  f: Extract<Fila, { tipo: 'actividad' }>
  alto: number
  sel: boolean
  alSeleccionar: () => void
  casilla?: React.ReactNode
  compacta?: boolean
}) {
  const a = f.actividad
  const pct = a.avance_pct == null ? null : Math.round(Number(a.avance_pct))
  return (
    <div
      className={`flex items-center gap-2 border-b border-[#EFEEEA] ${sel ? 'bg-surface-quiet' : 'hover:bg-surface-quiet'}`}
      style={{ height: alto, ...(sel ? { boxShadow: 'inset 2px 0 0 var(--os-marca)' } : {}) }}
      data-seleccionada={sel ? '' : undefined}
    >
      {casilla && <span className="pl-3">{casilla}</span>}
      <button
        type="button"
        onClick={alSeleccionar}
        data-testid="actividad-cronograma"
        // DE QUÉ OBRA ES CADA FILA, siempre: es lo que deja CONTAR desde afuera que la lista global
        // y la de la obra traen exactamente las mismas actividades canónicas.
        data-obra={a.obra_id}
        data-tipo={a.tipo}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left ${casilla ? '' : 'pl-3'}`}
        title={[a.seccion, a.codigo, a.nombre].filter(Boolean).join(' · ')}
      >
        <span className={`min-w-0 flex-1 truncate pl-5 text-[12.5px] text-ink ${sel ? 'font-semibold' : ''}`}>{a.nombre}</span>
      </button>
      <span style={{ width: COLS.estado }} className="shrink-0 truncate">
        {/* EL ESTADO OPERATIVO, no el guardado: con un impedimento abierto dice «Bloqueada» aunque
            su estado cargado siga siendo «En curso». La misma derivación que usa el tablero. */}
        <Estado tono={TONO[a.estado_operativo] ?? 'pendiente'} clave={a.estado_operativo} testid="estado-chip">
          <span className="text-[11.5px]">{ESTADO_LABEL[a.estado_operativo] ?? a.estado_operativo}</span>
        </Estado>
      </span>
      {!compacta && <Fecha v={a.inicio_plan} />}
      {!compacta && <Fecha v={a.fin_plan} />}
      <span className="shrink-0 pr-3 text-right font-mono text-[11.5px] tabular-nums" style={{ width: COLS.pct }}>
        {/* SIN AVANCE ES «—», NUNCA 0%. Un cero diría que la actividad no arrancó; lo que pasa es
            que nadie la midió todavía. */}
        {pct === null ? <span className="text-faint">—</span> : <span className="text-ink">{pct}%</span>}
      </span>
    </div>
  )
}

const Fecha = ({ v }: { v: string | null }) => (
  <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted lg:block" style={{ width: COLS.fecha }}>
    {v ? fmtFecha(v) : <span className="text-faint">sin fecha</span>}
  </span>
)

export function CuerpoTabla({
  filas, disp, seleccionada, alSeleccionar, colapsados, alAlternar, enLote, alMarcar, compacta,
}: TablaPlanProps) {
  return (
    <>
      {filas.map((f, i) => {
        const salto = disp.saltos[i] ?? 0
        if (f.tipo === 'grupo') {
          const suyas = f.grupo.hijas.map((h) => h.id)
          return (
            <FilaRubro
              key={f.clave}
              f={f}
              alto={disp.alto}
              salto={salto}
              cerrado={colapsados.has(f.grupo.clave)}
              alAlternar={() => alAlternar(f.grupo.clave)}
              {...(alMarcar && enLote && suyas.length > 0
                ? {
                    casilla: (
                      <Casilla
                        puesta={suyas.every((id) => enLote.has(id))}
                        alCambiar={(v) => alMarcar(suyas, v)}
                        etiqueta={`Seleccionar ${f.grupo.nombre}`}
                        testid="masiva-grupo"
                      />
                    ),
                  }
                : {})}
            />
          )
        }
        const a = f.actividad
        return (
          <FilaActividad
            key={f.clave}
            f={f}
            alto={disp.alto}
            sel={seleccionada === a.id}
            alSeleccionar={() => alSeleccionar(a.id)}
            {...(compacta ? { compacta } : {})}
            {...(alMarcar && enLote
              ? {
                  casilla: (
                    <Casilla
                      puesta={enLote.has(a.id)}
                      alCambiar={(v) => alMarcar([a.id], v)}
                      etiqueta={`Seleccionar ${a.nombre}`}
                      testid="masiva-actividad"
                    />
                  ),
                }
              : {})}
          />
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EN EL TELÉFONO NO HAY GANTT DE BARRAS
// ═══════════════════════════════════════════════════════════════════════════════
//
// `LAYOUT_RESPONSIVE.md`: «El Gantt NO se intenta mantener: se reemplaza por "Próximos" (lista por
// fecha)». No es una simplificación estética. Un calendario de 16px por día dentro de 390px muestra
// tres semanas y obliga a arrastrar en los dos ejes para leer una barra; y la tabla de cinco
// columnas, a ese ancho, empuja la PÁGINA de costado — que es lo único que el handoff prohíbe sin
// matices. Lo que el jefe de obra necesita en el teléfono es qué toca ahora, y eso es una lista
// ordenada por fecha con la ficha a un toque.

export function ListaPorFecha({ filas, seleccionada, alSeleccionar }: {
  filas: readonly Fila[]
  seleccionada: string | null
  alSeleccionar: (id: string) => void
}) {
  const actividades = filas
    .flatMap((f) => (f.tipo === 'actividad' ? [f.actividad] : []))
    .filter((a) => a.tipo !== 'resumen')
    .sort((x, y) => (x.inicio_plan ?? '9999').localeCompare(y.inicio_plan ?? '9999'))
  if (actividades.length === 0) {
    return <p className="py-6 text-[13px] text-muted" data-testid="lista-telefono-vacia">Todavía no hay ninguna actividad.</p>
  }
  return (
    <ul data-testid="lista-telefono">
      {actividades.map((a) => {
        const pct = a.avance_pct == null ? null : Math.round(Number(a.avance_pct))
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => alSeleccionar(a.id)}
              data-testid="actividad-telefono"
              // 48px de alto real: es un objetivo táctil, no una fila de tabla.
              className={`flex w-full items-center gap-3 border-b border-[#EFEEEA] py-3 text-left ${
                seleccionada === a.id ? 'bg-surface-quiet' : ''
              }`}
              style={seleccionada === a.id ? { boxShadow: 'inset 2px 0 0 var(--os-marca)' } : undefined}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{a.nombre}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-faint">
                  <Estado tono={TONO[a.estado_operativo] ?? 'pendiente'} clave={a.estado_operativo}>
                    <span className="text-[11.5px]">{ESTADO_LABEL[a.estado_operativo] ?? a.estado_operativo}</span>
                  </Estado>
                  {/* SIN FECHA SE DICE, no se deja el renglón mudo: es la razón por la que esa
                      actividad no está en ningún lado del plan. */}
                  <span className="font-mono tabular-nums">
                    {a.inicio_plan ? fmtFecha(a.inicio_plan) : 'sin fecha'}
                  </span>
                </span>
              </span>
              <span className="shrink-0 font-mono text-[12.5px] tabular-nums">
                {pct === null ? <span className="text-faint">—</span> : <span className="text-ink">{pct}%</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
