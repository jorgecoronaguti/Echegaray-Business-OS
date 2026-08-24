'use client'

// ═══ 10 · OBRA SUBCONTRATISTAS — LISTA + PANEL, UN SOLO WORKSPACE ═══
//
// Design canónico 23/08: lista compacta a la izquierda, panel del paquete a la derecha, y arriba
// una sola fila con la primaria, el aviso de lo que hay que resolver, el buscador y los filtros.
//
// ELEGIR UN PAQUETE ES ESTADO DEL CLIENTE. Antes cada clic era un `Link` a `?sel=`: una obra con
// seis paquetes hacía seis renders completos de una ruta `force-dynamic` para mostrar datos que ya
// habían viajado enteros en el primer render. La URL se sigue sincronizando con `replaceState`
// —el mismo enlace sigue abriendo el mismo paquete y se manda por chat— pero sin ir al servidor.
//
// EL BUSCADOR Y LOS FILTROS TAMBIÉN SON CLIENTE, por lo mismo: son seis a treinta filas ya
// cargadas y filtrar es un `filter` en memoria. Nada que ahorrar con un viaje de red.
//
// LAS ESCRITURAS NO CAMBIAN: siguen siendo las server actions que llegan por props, que revalidan
// y vuelven con los datos nuevos.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Buscador, SubTabs, Vacio } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import { TablaSubcontratos } from './TablaSubcontratos'
import { PanelSubcontrato, type AccionesPaquete } from './PanelSubcontrato'
import { armarComparacion, necesitaResolverse } from '../services/subcontratosReglas'
import type { Paquete } from '../services/subcontratosService'

type Filtro = 'todo' | 'curso' | 'problema'

// Los tres rótulos son los del canónico 10, literales. «Para resolver» era la misma idea con otra
// palabra, y con eso la pastilla del filtro y el botón de arriba decían cosas distintas del mismo
// número.
const FILTRO_LABEL: Record<Filtro, string> = {
  todo: 'Todo', curso: 'En curso', problema: 'Problemas',
}

const enCurso = (p: Paquete) => p.estado === 'en_curso'

const coincide = (p: Paquete, q: string) =>
  `${p.proveedor ?? ''} ${p.nombre} ${p.rubro ?? ''} ${p.vinculos.map((v) => v.actividad).join(' ')}`
    .toLowerCase().includes(q)

export function WorkspaceSubcontratos({
  paquetes, economia, obraId, selInicial, acciones,
}: {
  paquetes: Paquete[]
  economia: boolean
  obraId: string
  selInicial: string | null
  acciones: AccionesPaquete
}) {
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [sel, setSel] = useState<string | null>(selInicial)

  const sincronizarUrl = (id: string | null) => {
    const p = new URLSearchParams(window.location.search)
    if (id) p.set('sel', id); else p.delete('sel')
    const qs = p.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }
  const elegir = (id: string) => {
    const nuevo = id === sel ? null : id
    setSel(nuevo)
    sincronizarUrl(nuevo)
  }

  // Limpiar borra el texto Y el filtro: dejar el filtro puesto después de limpiar la búsqueda es la
  // manera de que alguien crea que la obra tiene un solo paquete.
  const limpiar = () => { setQuery(''); setFiltro('todo') }

  const nProblema = useMemo(() => paquetes.filter(necesitaResolverse).length, [paquetes])
  const nCurso = useMemo(() => paquetes.filter(enCurso).length, [paquetes])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return paquetes.filter((p) => {
      if (q && !coincide(p, q)) return false
      if (filtro === 'curso') return enCurso(p)
      if (filtro === 'problema') return necesitaResolverse(p)
      return true
    })
  }, [paquetes, query, filtro])

  const seleccionado = sel ? paquetes.find((p) => p.id === sel) ?? null : null
  const comparacion = useMemo(
    () => (seleccionado ? armarComparacion(insumosDe(seleccionado), economia) : null),
    [seleccionado, economia],
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* LO QUE FRENA VA ARRIBA Y ES UN BOTÓN, no un cartel: leerlo sin poder ir a verlo obliga a
            buscar a mano cuál de los seis es. */}
        {nProblema > 0 && (
          <button
            type="button"
            onClick={() => setFiltro('problema')}
            data-testid="ir-a-problemas"
            className="inline-flex items-center gap-1.5 rounded-control border border-neg/25 bg-neg-soft px-2.5 py-1 text-[12.5px] font-medium text-neg"
          >
            <IconoProblema className="h-[14px] w-[14px]" />
            {nProblema} para resolver
          </button>
        )}

        {/* EL BUSCADOR Y LOS CHIPS VAN SIEMPRE (canónico 10, orden del dueño 24/08). Estaban
            condicionados a `paquetes.length > 1`: la barra cambiaba de forma según cuántos paquetes
            hubiera, y la pantalla de una obra con un solo paquete no era la pantalla dibujada. El
            costo de mostrarlos con una fila es una fila que filtra una fila; el de esconderlos es
            que nadie sabe que se puede buscar hasta que ya hay demasiado para buscar. */}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <Buscador
              value={query}
              onChange={setQuery}
              placeholder="Buscar paquete o proveedor"
              testid="buscar-paquete"
              className="w-[228px]"
            />
            {query && (
              <>
                <span className="font-mono text-[11px] tabular-nums text-faint">{visibles.length}</span>
                <button type="button" onClick={limpiar}
                  data-testid="limpiar-busqueda" className="text-[12px] text-faint hover:text-ink">✕</button>
              </>
            )}
          </div>

          <SubTabs
            testid="filtros-subcontratos"
            items={(['todo', 'curso', 'problema'] as Filtro[]).map((f) => ({
              onClick: () => setFiltro(f),
              label: FILTRO_LABEL[f],
              cuenta: f === 'todo' ? paquetes.length : f === 'curso' ? nCurso : nProblema,
              activo: filtro === f,
              testid: `filtro-${f}`,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* «NO HAY NINGUNO» Y «NINGUNO COINCIDE» SON DOS COSAS DISTINTAS. Dejar que la tabla
              dibujara su vacío con la lista filtrada le diría a alguien que la obra no tiene
              subcontratos porque escribió mal un apellido. */}
          {paquetes.length > 0 && visibles.length === 0 ? (
            <Vacio accion={
              <button type="button" onClick={limpiar} data-testid="ver-todos-los-paquetes"
                className="text-[13px] font-medium text-ink hover:underline">Ver todo</button>
            }>
              Ningún paquete coincide.
            </Vacio>
          ) : (
            <TablaSubcontratos
              paquetes={visibles}
              seleccionado={sel}
              economia={economia}
              onSeleccionar={elegir}
            />
          )}
        </div>

        {seleccionado ? (
          /* LA COMPARACIÓN VIAJA AL PANEL (canónico 10): estaba debajo de la lista, o sea a media
             pantalla de distancia del paquete que compara, y cuando la lista crecía se iba abajo
             del pliegue. Es la decisión de subcontratar o no: va pegada al paquete. */
          <PanelSubcontrato
            paquete={seleccionado}
            economia={economia}
            obraId={obraId}
            comparacion={comparacion ?? []}
            onCerrar={() => { setSel(null); sincronizarUrl(null) }}
            acciones={acciones}
          />
        ) : (
          /* 22/08/2026 · «Tocá un paquete para ver…» se borró: la lista de la izquierda es
             clicleable y el panel aparece al tocarla — describir el gesto no lo enseña, lo repite.
             El enlace a las actividades SÍ queda: es la única forma de salir de acá sin volver
             por el menú, y no se deduce de ninguna otra cosa de la pantalla. */
          <aside className="rounded-card border border-line bg-surface p-4">
            <Link
              href={`/obras/${obraId}?vista=tareas&sub=arbol`}
              prefetch={false}
              className="text-[12.5px] font-medium text-ink hover:underline"
            >
              Ver las actividades de la obra
            </Link>
          </aside>
        )}
      </div>
    </>
  )
}

/** Los insumos de la comparación, tal como los espera `armarComparacion`. Se arma acá porque la
 *  selección dejó de vivir en el servidor: es la misma función pura, llamada del otro lado. */
const insumosDe = (p: Paquete) => ({
  paquete: {
    cantidad: p.cantidad,
    unidad: p.unidad,
    precio_contratado: p.precio_contratado,
    aportes: p.aportes_total,
    costo_real: p.costo_real,
    hh_apoyo: p.hh_apoyo,
    personas_externas: p.personas_externas,
    fecha_inicio_plan: p.fecha_inicio_plan,
    fecha_fin_plan: p.fecha_fin_plan,
  },
  actividad: p.vinculos[0] ?? null,
})
