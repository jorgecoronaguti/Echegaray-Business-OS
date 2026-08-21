'use client'

// ═══ 03 · OBRA TAREAS — EL WORKSPACE ÚNICO DE LA OBRA ═══
//
// «Ejecución deja de existir como pestaña» (`design/screens/gestion-obras-v5.md` §3). Hasta el
// 21/08/2026 las mismas actividades se miraban de dos maneras —`?vista=planificacion` para el plan
// y `?vista=ejecucion` para lo que pasó— y eso obligaba a decidir en cuál de las dos se carga cada
// cosa. **Una actividad existe una sola vez**, y su lugar es éste.
//
// ═══ EL ÁRBOL LO ORDENA LA BASE, EL FILTRO LO RESUELVE EL CLIENTE ═══
//
// `obra_wbs` ya entrega la obra en orden constructivo. El buscador y el plegado viven en el
// cliente y no en la URL: son 350 filas ya cargadas, y una vuelta al servidor por cada tecla haría
// pegajosa la pantalla más usada del módulo. La VISTA sí viaja en la URL (`?filtro=`), porque es lo
// que se comparte por chat: «mirá las que están sin análisis».
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No registra el avance de a una: eso es la 05, una pantalla entera con su método, su criterio y su
// evidencia. Acá se ve, se filtra, se selecciona y se opera EN LOTE.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, SubTabs, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { hh as fmtHH } from './formato'
import { FilaWbs } from './FilaWbs'
import { BarraTareas, VALOR_INICIAL } from './BarraTareas'
import { rollup, totalObra, type NodoObra } from '../services/wbs'
import {
  contenedores, filasVisibles, VISTA_ARBOL_LABEL, VISTAS_ARBOL, type VistaArbol,
} from '../services/vistaArbol'
import { seleccionable, type CandidataMasiva, type OperacionMasiva } from '../services/avance'
import type { ResultadoMasivo } from '../services/actionsMasivas'
import type { AvanceMalImputado } from '../services/tareasService'

function candidata(n: NodoObra): CandidataMasiva {
  return {
    id: n.id,
    metodo_avance: n.metodo_avance,
    cantidad_objetivo: n.cantidad_objetivo,
    avance_pct: n.avance_pct,
    es_contenedor: n.es_contenedor,
    es_subcontrato: n.es_subcontrato,
    n_pasos: n.n_pasos,
  }
}

export function TabTareas({
  obraId, nodos, filtro, cuadrillas, aplicarEnLote, panel, malImputados,
}: {
  obraId: string
  nodos: NodoObra[]
  filtro: VistaArbol
  cuadrillas: { id: string; nombre: string }[]
  aplicarEnLote: (form: FormData) => Promise<ResultadoMasivo>
  /** El panel de la actividad abierta (04). Se arma en el servidor: sus siete solapas son siete
   *  lecturas, y traerlas al cliente por cada clic sería traerlas por cada clic. */
  panel?: React.ReactNode
  malImputados: AvanceMalImputado[]
}) {
  const [query, setQuery] = useState('')
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set())
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [operacion, setOperacion] = useState<OperacionMasiva>('avance')
  const [valores, setValores] = useState<Record<string, string>>({ ...VALOR_INICIAL })

  const agregados = useMemo(() => rollup(nodos), [nodos])
  const total = useMemo(() => totalObra(nodos, agregados), [nodos, agregados])
  const filas = useMemo(
    () => filasVisibles(nodos, agregados, { vista: filtro, query, plegados }),
    [nodos, agregados, filtro, query, plegados],
  )
  const seleccion = useMemo(
    () => nodos.filter((n) => marcadas.has(n.id)).map(candidata),
    [nodos, marcadas],
  )

  const base = `/obras/${obraId}?vista=tareas`
  const hrefFiltro = (v: VistaArbol) => `${base}&filtro=${v}`
  const limpiar = () => { setQuery(''); setMarcadas(new Set()) }

  const marcar = (id: string, v: boolean) => setMarcadas((p) => {
    const s = new Set(p)
    if (v) s.add(id); else s.delete(id)
    return s
  })
  const plegar = (id: string) => setPlegados((p) => {
    const s = new Set(p)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  return (
    <div className="flex flex-col gap-3 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3">
          <div className="flex items-center gap-2">
            <Buscador
              value={query}
              onChange={setQuery}
              placeholder="Buscar actividad, frente o partida"
              testid="buscar-tarea"
              className="w-[236px]"
            />
            {query && (
              <>
                <span className="font-mono text-[11px] tabular-nums text-faint">{filas.length} filas</span>
                {/* La ✕ limpia la búsqueda Y la vista: dejar el filtro puesto después de limpiar el
                    texto es la manera de que alguien crea que la obra tiene tres actividades. */}
                <Link href={hrefFiltro('todo')} onClick={limpiar} data-testid="limpiar-busqueda"
                  className="text-[12px] text-faint hover:text-ink">✕</Link>
              </>
            )}
          </div>

          <SubTabs
            testid="filtros-tareas"
            items={VISTAS_ARBOL.map((v) => ({
              href: hrefFiltro(v), label: VISTA_ARBOL_LABEL[v], activo: filtro === v, testid: `filtro-${v}`,
            }))}
          />

          <div className="ml-auto flex items-center gap-3 text-[12.5px]">
            <button type="button" data-testid="expandir" onClick={() => setPlegados(new Set())}
              className="text-muted hover:text-ink">Expandir</button>
            <button type="button" data-testid="colapsar" onClick={() => setPlegados(new Set(contenedores(nodos)))}
              className="text-muted hover:text-ink">Colapsar</button>
            <Link href={`/obras/${obraId}/avance-masivo`} data-testid="ir-avance-masivo"
              className="rounded-control bg-marca px-2.5 py-1 font-medium text-ink hover:opacity-90">
              Avance masivo
            </Link>
          </div>
        </div>

        {/* LOS SEIS AVANCES CARGADOS CONTRA UN CONTENEDOR NO SE ESCONDEN. La regla es nueva; el
            trabajo declarado es viejo y real. Esconderlo lo dejaría fuera de todo total sin que
            nadie se entere. */}
        {malImputados.length > 0 && (
          <p data-testid="avances-mal-imputados"
            className="mb-2 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn">
            {malImputados.length} avance(s) quedaron cargados contra un contenedor antes de que la
            regla existiera: {malImputados.slice(0, 3).map((m) => m.actividad).join(' · ')}
            {malImputados.length > 3 ? ' …' : ''}. Hay que reimputarlos a la actividad que corresponde.
          </p>
        )}

        <Tabla testid="tabla-wbs" minWidth={560}>
          <THead>
            <Th />
            <Th>Estructura de obra</Th>
            <Th num>Cant.</Th>
            <Th>Avance</Th>
            <Th num className="hidden lg:table-cell">Plazo</Th>
            <Th className="hidden lg:table-cell">Responsable</Th>
            <Th>Estado</Th>
          </THead>
          <tbody>
            {filas.map((f) => (
              <FilaWbs
                key={f.nodo.id}
                fila={f}
                abierta={false}
                seleccionada={marcadas.has(f.nodo.id)}
                seleccionable={seleccionable(candidata(f.nodo))}
                alSeleccionar={(v) => marcar(f.nodo.id, v)}
                alPlegar={() => plegar(f.nodo.id)}
                hrefBase={hrefFiltro(filtro)}
              />
            ))}
            {filas.length === 0 && (
              <Tr><Td colSpan={7}>
                <Vacio accion={<Link href={hrefFiltro('todo')} onClick={limpiar} className="font-medium text-ink hover:underline">Ver todo</Link>}>
                  {query ? `Nada coincide con «${query}».` : 'Ninguna actividad entra en esta vista.'}
                </Vacio>
              </Td></Tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <td colSpan={7} className="pt-2">
                <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
                  <Pie rotulo="Actividades" valor={String(total.n_actividades)} />
                  <Pie rotulo="HH plan" valor={fmtHH(total.hh_plan) ?? 'sin cargar'} />
                  <Pie rotulo="Sin análisis" valor={String(total.n_sin_analisis)}
                    alerta={total.n_sin_analisis > 0} />
                </span>
              </td>
            </tr>
          </tfoot>
        </Tabla>
      </div>

      {panel && <div className="w-full shrink-0 xl:w-[412px]">{panel}</div>}

      <BarraTareas
        seleccion={seleccion}
        cuadrillas={cuadrillas}
        aplicar={aplicarEnLote}
        alLimpiar={() => setMarcadas(new Set())}
        operacion={operacion}
        valor={valores[operacion] ?? ''}
        alElegirOperacion={setOperacion}
        alElegirValor={(v) => setValores((p) => ({ ...p, [operacion]: v }))}
      />
    </div>
  )
}

function Pie({ rotulo, valor, alerta = false }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[11px] text-faint">{rotulo}</span>
      <span className={`font-mono text-[12px] tabular-nums ${alerta ? 'text-neg' : 'text-ink'}`}>{valor}</span>
    </span>
  )
}
