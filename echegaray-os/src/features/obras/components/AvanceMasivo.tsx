'use client'

// ═══ 06 · AVANCE MASIVO — marcar varias y ver, fila por fila, en qué van a quedar ═══
//
// Es una pantalla aparte de la 03 y no una vista suya: acá el árbol se APLANA a propósito. Cuando
// lo que se está haciendo es cerrar veinte actividades de un frente, los rubros y los carets son
// pasos de más — la jerarquía queda en la sangría y nada se pliega.
//
// ═══ «QUEDA EN» ES LA PROMESA DE LA ESCRITURA ═══
//
// La columna muestra, fila por fila, el valor que se va a escribir y con qué calidad de dato queda;
// `—` en las que la operación no toca. Sin ella, «Aplicar a 20» sobre una selección donde seis se
// miden por pasos escribe catorce y dice veinte, y nadie se entera hasta que alguien busca el
// avance que cargó y no está.
//
// ═══ UN VALOR PARA LA SELECCIÓN, NO UNO POR FILA (Design 23/08) ═══
//
// El Design dibuja un valor elegible POR FILA (los pasos de cada actividad como botones en la
// misma línea). Eso no existe como escritura: `aplicarEnLote` recibe UNA operación y UN valor para
// todos los ids, y para el método `pasos` el porcentaje ni siquiera mueve el número —lo produce el
// tildado de los pasos, que se hace en la 05—. Dibujar los pasos acá prometería una escritura que
// el servidor rechaza. Se conserva la forma del Design (casilla, calidad del dato, aviso que no
// bloquea) con el motor que existe: un valor para la selección, y la columna diciendo la verdad.

import { useMemo, useState } from 'react'
import { Buscador, Filtros, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import { BarraTareas, VALOR_INICIAL } from './BarraTareas'
import { cantidad as fmtCantidad, porcentaje } from './formato'
import { ejecutorDe, type NodoObra } from '../services/wbs'
import { coincide } from '../services/vistaArbol'
import { frenteDeCamino } from '../services/frente'
import {
  quedaraEn, seleccionable, type CandidataMasiva, type OperacionMasiva,
} from '../services/avance'
import { METODO_CORTO, ESTADO_LABEL, type EstadoActividad, type MetodoAvance } from '../types'
import type { ResultadoMasivo } from '../services/actionsMasivas'

/** Los tres cortes del Design. El estado vive en el cliente, como la búsqueda: la lista ya viajó
 *  entera y mandar cada clic al servidor sería una navegación por filtro. */
const CORTES = ['todo', 'curso', 'pend'] as const
type Corte = (typeof CORTES)[number]
const CORTE_LABEL: Record<Corte, string> = { todo: 'Todas', curso: 'En curso', pend: 'Sin arrancar' }

function candidata(n: NodoObra): CandidataMasiva {
  return {
    id: n.id, metodo_avance: n.metodo_avance, cantidad_objetivo: n.cantidad_objetivo,
    avance_pct: n.avance_pct, es_contenedor: n.es_contenedor, es_subcontrato: n.es_subcontrato,
    n_pasos: n.n_pasos,
  }
}

/** El corte, sobre el avance ya publicado. «Sin arrancar» incluye el avance NULO: nadie lo midió,
 *  y esconderlo dejaría afuera justo a las que hay que cargar. */
function pasaElCorte(n: NodoObra, corte: Corte): boolean {
  if (corte === 'todo') return true
  const a = n.avance_pct
  if (corte === 'curso') return a !== null && a > 0 && a < 100
  return !n.es_contenedor && (a === null || a === 0)
}

export function AvanceMasivo({
  nodos, cuadrillas, aplicarEnLote,
}: {
  obraId: string
  nodos: NodoObra[]
  cuadrillas: { id: string; nombre: string }[]
  aplicarEnLote: (form: FormData) => Promise<ResultadoMasivo>
}) {
  const [query, setQuery] = useState('')
  // ARRANCA EN «TODAS» y no en «En curso» como el Design: medido contra la base, las actividades de
  // las obras vivas están sin medición y su avance es NULO, así que «En curso» abre la pantalla
  // vacía justo donde se entra a cargar el primer avance. El corte sigue estando, a un clic.
  const [corte, setCorte] = useState<Corte>('todo')
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [operacion, setOperacion] = useState<OperacionMasiva>('avance')
  const [valores, setValores] = useState<Record<string, string>>({ ...VALOR_INICIAL })
  const [ultima, setUltima] = useState<string | null>(null)

  const valor = valores[operacion] ?? ''
  const visibles = useMemo(
    () => nodos.filter((n) => coincide(n, n.avance_pct, 'todo', query, '') && pasaElCorte(n, corte)),
    [nodos, query, corte],
  )
  const seleccion = useMemo(
    () => nodos.filter((n) => marcadas.has(n.id)).map(candidata),
    [nodos, marcadas],
  )

  const operables = visibles.filter((n) => seleccionable(candidata(n)))
  const todasMarcadas = operables.length > 0 && operables.every((n) => marcadas.has(n.id))

  /**
   * ⇧clic SELECCIONA UN RANGO. Marcar veinte filas de a una es veinte clics y un error; el rango es
   * la única manera en que esta pantalla ahorra trabajo de verdad.
   */
  function marcar(id: string, puesta: boolean, conShift: boolean) {
    setMarcadas((prev) => {
      const s = new Set(prev)
      const idx = visibles.findIndex((n) => n.id === id)
      const desde = ultima ? visibles.findIndex((n) => n.id === ultima) : -1
      const rango = conShift && desde >= 0 && idx >= 0
        ? visibles.slice(Math.min(desde, idx), Math.max(desde, idx) + 1)
        : visibles.filter((n) => n.id === id)
      for (const n of rango) {
        if (!seleccionable(candidata(n))) continue
        if (puesta) s.add(n.id); else s.delete(n.id)
      }
      return s
    })
    setUltima(id)
  }

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-3">
        <Buscador value={query} onChange={setQuery} placeholder="Buscar actividad o frente"
          testid="buscar-masivo" className="w-[230px]" />
        <Filtros
          testid="filtros-masivo"
          cuenta={{ n: visibles.length, total: nodos.length }}
          opciones={CORTES.map((c) => ({
            label: (
              <>
                {CORTE_LABEL[c]}{' '}
                <span className="font-mono text-[11px] tabular-nums text-faint">
                  {nodos.filter((n) => pasaElCorte(n, c)).length}
                </span>
              </>
            ),
            activo: corte === c,
            onClick: () => setCorte(c),
            testid: `corte-${c}`,
          }))}
        />
      </div>

      <Tabla testid="tabla-masiva" minWidth={700}>
        <THead>
          <Th className="w-6">
            {/* LA CASILLA MAESTRA MARCA LO VISIBLE, no la obra entera: lo que se ve es lo que se
                promete. Con un filtro puesto, «todo» significa «todo esto». */}
            <input
              type="checkbox" checked={todasMarcadas} disabled={operables.length === 0}
              onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(operables.map((n) => n.id)))}
              aria-label={todasMarcadas ? 'Quitar la selección' : 'Seleccionar todo lo visible'}
              data-testid="sel-todo"
              className="h-[15px] w-[15px] accent-marca disabled:opacity-30"
            />
          </Th>
          <Th>Actividad</Th>
          <Th>Método</Th>
          <Th num>Acumulado</Th>
          {seleccion.length > 0 && <Th num>Queda en</Th>}
          {/* CUADRILLA: la columna dice quién EJECUTA (cuadrilla prevista o subcontratista), que es
              lo que ayuda a decidir sobre qué filas cargar avance junto. Quién responde por la
              actividad es otra pregunta y vive en el panel de la tarea. */}
          <Th>Cuadrilla</Th>
        </THead>
        <tbody>
          {visibles.map((n) => {
            const c = candidata(n)
            const puedo = seleccionable(c)
            const marcada = marcadas.has(n.id)
            const destino = marcada ? destinoDeFila(c, operacion, valor) : null
            return (
              <Tr key={n.id} compacta seleccionada={marcada}>
                <Td className="w-6">
                  <input
                    type="checkbox" checked={marcada} disabled={!puedo}
                    onChange={(e) => marcar(n.id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                    onClick={(e) => { if (e.shiftKey) marcar(n.id, !marcada, true) }}
                    aria-label={`Seleccionar ${n.nombre}`} data-testid={`masivo-sel-${n.id}`}
                    className="h-[15px] w-[15px] shrink-0 accent-marca disabled:opacity-30"
                  />
                </Td>
                <Td>
                  <span className="block min-w-0" style={{ paddingLeft: Math.min(n.nivel, 6) * 15 }}>
                    <span className="flex items-center gap-1.5">
                      <span className={n.es_contenedor ? 'text-[12px] font-semibold text-ink' : 'text-[12.5px] text-ink-soft'}>
                        {n.nombre}
                      </span>
                      {n.es_subcontrato && <span className="rounded border border-line px-1 text-[9.5px] text-muted">SUB</span>}
                    </span>
                    {/* EL FRENTE, NO LA RUTA ENTERA: `camino` incluye el nombre propio y repetirlo
                        debajo del nombre es la línea que el Design saca de todas las tablas. */}
                    {!n.es_contenedor && frenteDeCamino(n.camino, n.nombre) && (
                      <span className="block truncate text-[11px] text-faint">
                        {frenteDeCamino(n.camino, n.nombre)}
                      </span>
                    )}
                  </span>
                </Td>
                <Td className="text-[11.5px]">
                  {/* «sin definir» en warn cuando la actividad no se puede medir por su propio
                      método: cantidad sin objetivo, o pasos sin pasos. Es la deuda que hay que
                      cargar antes de que esta fila pueda recibir un avance. */}
                  {n.es_contenedor ? '' : !puedo
                    ? (
                        <span className="inline-flex items-center gap-1.5 text-warn" title="No tiene medición cargada">
                          <IconoProblema className="h-[13px] w-[13px] shrink-0" />sin definir
                        </span>
                      )
                    : <span className="text-muted">{METODO_CORTO[n.metodo_avance]}</span>}
                </Td>
                <Td num>
                  {n.es_contenedor ? '' : (
                    <>
                      <span className="block text-ink">
                        {n.cantidad_objetivo !== null
                          ? `${fmtCantidad(n.cantidad_ejecutada ?? 0)} / ${fmtCantidad(n.cantidad_objetivo, n.unidad)}`
                          : porcentaje(n.avance_pct) ?? <span className="font-sans text-[11.5px] text-faint">sin medición</span>}
                      </span>
                      {n.cantidad_objetivo !== null && (
                        <span className="block text-[11px] text-faint">
                          {porcentaje(n.avance_pct) ?? 'sin medición'}
                        </span>
                      )}
                    </>
                  )}
                </Td>
                {seleccion.length > 0 && (
                  <Td num>
                    {destino === null
                      ? <span className="text-[12.5px] text-line-strong">—</span>
                      : (
                          <>
                            <span className={`block text-[12.5px] font-semibold ${destino.tono}`}>
                              {destino.flecha && <span aria-hidden className="mr-1 font-sans text-[11px]">{destino.flecha}</span>}
                              {destino.texto}
                            </span>
                            {destino.calidad && (
                              <span className={`block font-sans text-[10.5px] ${destino.tonoCalidad}`}>{destino.calidad}</span>
                            )}
                          </>
                        )}
                  </Td>
                )}
                <Td className="text-[11.5px]">
                  {n.es_contenedor ? '' : ejecutorDe(n) ?? <span className="text-faint">sin asignar</span>}
                </Td>
              </Tr>
            )
          })}
          {visibles.length === 0 && (
            <Tr><Td colSpan={6}>
              <Vacio accion={<button type="button" onClick={() => { setQuery(''); setCorte('todo') }} className="font-medium text-ink hover:underline">Ver todo</button>}>
                Nada coincide.
              </Vacio>
            </Td></Tr>
          )}
        </tbody>
      </Tabla>

      {/* SIN SELECCIÓN, LA BARRA DICE QUÉ HACER; con selección, la reemplaza la de acciones. Es la
          única línea de texto permanente de la pantalla, y desaparece al primer clic. */}
      {seleccion.length === 0 && (
        <p data-testid="masivo-sin-seleccion" className="fixed inset-x-0 bottom-0 border-t border-line bg-surface px-5 py-3 text-[12.5px] text-faint">
          Marcá las actividades que avanzaron y elegí a cuánto llegaron. ⇧clic marca un rango.
        </p>
      )}

      <BarraTareas
        seleccion={seleccion} cuadrillas={cuadrillas} aplicar={aplicarEnLote}
        alLimpiar={() => setMarcadas(new Set())}
        operacion={operacion} valor={valor}
        alElegirOperacion={setOperacion}
        alElegirValor={(v) => setValores((p) => ({ ...p, [operacion]: v }))}
      />
    </div>
  )
}

/**
 * CON QUÉ CALIDAD QUEDA EL DATO — la columna del Design, dicha con los métodos que existen acá.
 *
 * Por cantidad el porcentaje se convierte en cantidad ejecutada contra el objetivo: es una medida.
 * Manual y partes los declara una persona: es una estimación, y en lote más todavía. Por pasos no
 * entra en el lote y esta función no llega a llamarse.
 */
function calidadDe(metodo: MetodoAvance): { texto: string; tono: string } | null {
  if (metodo === 'cantidad') return { texto: 'medido', tono: 'text-pos' }
  if (metodo === 'pasos') return null
  return { texto: 'estimado', tono: 'text-warn' }
}

/** Qué va a quedar en esta fila. Verde si sube, `neg` si baja: el retroceso se ve antes de escribirlo. */
function destinoDeFila(c: CandidataMasiva, op: OperacionMasiva, valor: string) {
  if (op === 'avance') {
    const v = quedaraEn(c, op, Number(valor))
    if (v === null) return null
    const baja = c.avance_pct !== null && v < c.avance_pct
    const cal = calidadDe(c.metodo_avance)
    return {
      texto: `${v} %`, tono: baja ? 'text-neg' : 'text-pos',
      // LA FLECHA DEL DESIGN dice el SENTIDO antes de leer el número; sin avance previo no hay
      // sentido que declarar y no se dibuja ninguna.
      flecha: c.avance_pct === null ? null : baja ? '↓' : '↑',
      calidad: cal?.texto ?? null, tonoCalidad: cal?.tono ?? '',
    }
  }
  const texto = op === 'estado'
    ? ESTADO_LABEL[valor as EstadoActividad] ?? valor
    : op === 'fechas'
      ? `${Number(valor) > 0 ? '+' : ''}${valor} d`
      : valor ? 'nueva cuadrilla' : 'sin cuadrilla'
  return { texto, tono: 'text-ink', flecha: null, calidad: null, tonoCalidad: '' }
}
