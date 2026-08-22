'use client'

// ═══ 06 · AVANCE MASIVO — la tabla plana y la barra que dice qué va a pasar ═══
//
// Es una pantalla aparte de la 03 y no una vista suya: acá el árbol se APLANA a propósito. Cuando
// lo que se está haciendo es cerrar veinte actividades de un frente, los rubros y los carets son
// pasos de más — la jerarquía queda en la sangría y nada se pliega.
//
// ═══ «QUEDARÁ EN» ES LA PROMESA DE LA ESCRITURA ═══
//
// La columna muestra, fila por fila, el valor que se va a escribir; `—` en las que la operación no
// toca. Sin ella, «Aplicar a 20» sobre una selección donde seis se miden por pasos escribe catorce
// y dice veinte, y nadie se entera hasta que alguien busca el avance que cargó y no está.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { BarraTareas, VALOR_INICIAL } from './BarraTareas'
import { porcentaje } from './formato'
import { ejecutorDe, type NodoObra } from '../services/wbs'
import { coincide } from '../services/vistaArbol'
import {
  quedaraEn, seleccionable, type CandidataMasiva, type OperacionMasiva,
} from '../services/avance'
import { METODO_CORTO, ESTADO_LABEL, type EstadoActividad } from '../types'
import type { ResultadoMasivo } from '../services/actionsMasivas'

function candidata(n: NodoObra): CandidataMasiva {
  return {
    id: n.id, metodo_avance: n.metodo_avance, cantidad_objetivo: n.cantidad_objetivo,
    avance_pct: n.avance_pct, es_contenedor: n.es_contenedor, es_subcontrato: n.es_subcontrato,
    n_pasos: n.n_pasos,
  }
}

export function AvanceMasivo({
  obraId, nodos, cuadrillas, aplicarEnLote,
}: {
  obraId: string
  nodos: NodoObra[]
  cuadrillas: { id: string; nombre: string }[]
  aplicarEnLote: (form: FormData) => Promise<ResultadoMasivo>
}) {
  const [query, setQuery] = useState('')
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [operacion, setOperacion] = useState<OperacionMasiva>('avance')
  const [valores, setValores] = useState<Record<string, string>>({ ...VALOR_INICIAL })
  const [ultima, setUltima] = useState<string | null>(null)

  const valor = valores[operacion] ?? ''
  const visibles = useMemo(
    () => nodos.filter((n) => coincide(n, n.avance_pct, 'todo', query)),
    [nodos, query],
  )
  const seleccion = useMemo(
    () => nodos.filter((n) => marcadas.has(n.id)).map(candidata),
    [nodos, marcadas],
  )

  const elegir = (ids: string[]) => setMarcadas(new Set(ids))
  const soloOperables = (l: NodoObra[]) => l.filter((n) => seleccionable(candidata(n))).map((n) => n.id)

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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3">
        <Buscador value={query} onChange={setQuery} placeholder="Buscar actividad o frente"
          testid="buscar-masivo" className="w-[230px]" />
        <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
          <button type="button" data-testid="sel-todo" onClick={() => elegir(soloOperables(visibles))}
            className="font-medium text-ink hover:underline">Todo el frente</button>
          <button type="button" data-testid="sel-en-curso"
            onClick={() => elegir(soloOperables(visibles.filter((n) => n.avance_pct !== null && n.avance_pct > 0 && n.avance_pct < 100)))}
            className="font-medium text-ink hover:underline">En curso</button>
          <button type="button" data-testid="sel-nada" onClick={() => elegir([])}
            className="font-medium text-ink hover:underline">Nada</button>
        </div>
        <span className="ml-auto text-[12px] text-muted">⇧clic selecciona un rango</span>
      </div>

      <Tabla testid="tabla-masiva" minWidth={640}>
        <THead>
          <Th />
          <Th>Estructura de obra</Th>
          <Th>Medición</Th>
          <Th>Avance actual</Th>
          {seleccion.length > 0 && <Th className="text-[color:var(--os-marca)]">Quedará en</Th>}
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
              <Tr key={n.id} compacta className={marcada ? 'bg-marca-soft' : ''}>
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
                  <span className="flex items-center gap-1.5" style={{ paddingLeft: Math.min(n.nivel, 6) * 15 }}>
                    <span className={n.es_contenedor ? 'text-[12px] font-semibold text-ink' : 'text-[12.5px] text-ink-soft'}>
                      {n.nombre}
                    </span>
                    {n.es_subcontrato && <span className="rounded border border-line px-1 text-[9.5px] text-muted">SUB</span>}
                  </span>
                </Td>
                <Td className="text-[11.5px]">
                  {/* «sin definir» en warn cuando la actividad no se puede medir por su propio
                      método: cantidad sin objetivo, o pasos sin pasos. Es la deuda que hay que
                      cargar antes de que esta fila pueda recibir un avance. */}
                  {n.es_contenedor ? '' : !puedo
                    ? <span className="text-warn">sin definir</span>
                    : <span className="text-muted">{METODO_CORTO[n.metodo_avance]}</span>}
                </Td>
                <Td>
                  {n.es_contenedor ? '' : n.avance_pct === null
                    ? <span className="text-[11.5px] text-faint">sin avance</span>
                    : <span className="font-mono text-[11.5px] tabular-nums text-ink-soft">{porcentaje(n.avance_pct)}</span>}
                </Td>
                {seleccion.length > 0 && (
                  <Td>
                    {destino === null
                      ? <span className="text-[12.5px] text-line-strong">—</span>
                      : <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${destino.tono}`}>{destino.texto}</span>}
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
              <Vacio accion={<button type="button" onClick={() => setQuery('')} className="font-medium text-ink hover:underline">Ver todo</button>}>
                {`Nada coincide con «${query}».`}
              </Vacio>
            </Td></Tr>
          )}
        </tbody>
      </Tabla>

      <p className="mt-3 text-[12px] text-muted">
        <Link href={`/obras/${obraId}?vista=tareas`} className="text-ink hover:underline">← Volver a Tareas</Link>
      </p>

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

/** Qué va a quedar en esta fila. Verde si sube, warn si baja: el retroceso se ve antes de escribirlo. */
function destinoDeFila(c: CandidataMasiva, op: OperacionMasiva, valor: string) {
  if (op === 'avance') {
    const v = quedaraEn(c, op, Number(valor))
    if (v === null) return null
    const baja = c.avance_pct !== null && v < c.avance_pct
    return { texto: `${v} %`, tono: baja ? 'text-neg' : 'text-pos' }
  }
  if (op === 'estado') return { texto: ESTADO_LABEL[valor as EstadoActividad] ?? valor, tono: 'text-ink' }
  if (op === 'fechas') return { texto: `${Number(valor) > 0 ? '+' : ''}${valor} d`, tono: 'text-ink' }
  return { texto: valor ? 'nueva cuadrilla' : 'sin cuadrilla', tono: 'text-ink' }
}
