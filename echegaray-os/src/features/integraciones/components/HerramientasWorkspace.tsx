'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import {
  Boton,
  Buscador,
  CAMPO,
  Campo,
  Divisor,
  ErrorCampo,
  Estado,
  Filtros,
  Nulo,
  PanelDetalle,
  Tabla,
  THead,
  Th,
  Tr,
  Td,
  Vacio,
  ZonaSplit,
  useSplit,
} from '@/shared/components/ds'
import { createHerramientaAction, type ActionState } from '../services/herramientasActions'
import { ESTADOS_HERRAMIENTA, lecturaHerramienta, necesitanAtencion } from '../services/estados'
import type { HerramientaGlobal } from '../services/operacionGlobalService'
import type { MovimientoConHerramienta } from '../services/movimientosService'
import { FichaHerramienta } from './FichaHerramienta'

// HERRAMIENTAS — bloque 3c: inventario ↔ ficha del equipo, el mismo split que Proveedores.
//
// La lista contesta «qué hay, dónde está y quién la tiene»; la ficha, «qué le pasa a ésta». Que
// convivan es el punto: el trabajo real es ir mirando una tras otra, y un modal obliga a cerrarlo
// para comparar con la de al lado.
//
// EL RESPONSABLE ES DERIVADO del último movimiento (`ultimoResponsable`), no un campo propio.

const INICIAL: ActionState = { error: null }

export function HerramientasWorkspace({
  herramientas,
  movimientosPorHerramienta,
  anchoInicial,
}: {
  herramientas: HerramientaGlobal[]
  movimientosPorHerramienta: Record<string, MovimientoConHerramienta[]>
  anchoInicial: number
}) {
  const [q, setQ] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)
  const split = useSplit({ clave: 'herramientas', inicial: anchoInicial, min: 340, max: 520 })

  const ubicaciones = useMemo(
    () => [...new Set(herramientas.map((h) => h.ubicacion_actual).filter((u): u is string => !!u))].sort(),
    [herramientas],
  )

  const conteo = useMemo(() => {
    const c = new Map<string, number>()
    for (const h of herramientas) {
      const k = lecturaHerramienta(h.estado).clave
      c.set(k, (c.get(k) ?? 0) + 1)
    }
    return c
  }, [herramientas])

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    return herramientas
      .filter((h) => (estadoFiltro ? lecturaHerramienta(h.estado).clave === estadoFiltro : true))
      .filter((h) =>
        term
          ? `${h.nombre} ${h.categoria ?? ''} ${h.ubicacion_actual ?? ''} ${h.responsable_actual ?? ''} ${h.obra_nombre ?? ''}`
              .toLowerCase()
              .includes(term)
          : true,
      )
  }, [herramientas, q, estadoFiltro])

  const h = herramientas.find((x) => x.id_herramienta === seleccionada) ?? null
  const atencion = necesitanAtencion(herramientas.map((x) => x.estado))

  const opciones = [
    { label: 'Todas', activo: !estadoFiltro, onClick: () => setEstadoFiltro('') },
    ...ESTADOS_HERRAMIENTA.filter((e) => (conteo.get(e.clave) ?? 0) > 0).map((e) => ({
      label: `${e.label} ${conteo.get(e.clave)}`,
      activo: estadoFiltro === e.clave,
      onClick: () => setEstadoFiltro(estadoFiltro === e.clave ? '' : e.clave),
      testid: `filtro-${e.clave}`,
    })),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {herramientas.length > 1 && (
          <Filtros opciones={opciones} cuenta={{ n: filtradas.length, total: herramientas.length }} />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Buscador value={q} onChange={setQ} placeholder="Buscar herramienta, obra o responsable" className="w-[250px]" />
          <Boton
            variante={alta ? 'discreta' : 'primaria'}
            onClick={() => setAlta((v) => !v)}
            aria-expanded={alta}
            data-testid="nueva-herramienta"
          >
            {alta ? 'Cerrar' : 'Nueva herramienta'}
          </Boton>
        </div>
      </div>

      {alta && <AltaHerramienta ubicaciones={ubicaciones} onListo={() => setAlta(false)} />}

      {atencion > 0 && (
        <p className="text-[12.5px] text-warn" data-testid="atencion">
          {atencion} {atencion === 1 ? 'necesita' : 'necesitan'} atención: están en reparación, fuera de servicio o
          perdidas.
        </p>
      )}

      <div className="flex items-stretch">
        <ZonaSplit>
          {filtradas.length === 0 ? (
            <Vacio>
              {herramientas.length === 0
                ? 'El inventario está vacío. La primera herramienta se carga con «Nueva herramienta».'
                : 'Ninguna herramienta coincide con el filtro.'}
            </Vacio>
          ) : (
            <Tabla testid="tabla-herramientas" minWidth={760}>
              <THead>
                <Th>Herramienta</Th>
                <Th className="w-[130px]">Categoría</Th>
                <Th className="w-[150px]">Estado</Th>
                <Th className="w-[200px]">Ubicación actual</Th>
                <Th className="w-[150px]">Responsable</Th>
              </THead>
              <tbody>
                {filtradas.map((x) => {
                  const l = lecturaHerramienta(x.estado)
                  return (
                    <Tr
                      key={x.id_herramienta}
                      seleccionada={x.id_herramienta === seleccionada}
                      onClick={() => setSeleccionada(x.id_herramienta)}
                      data-testid="fila-herramienta"
                    >
                      <Td fuerte>{x.nombre}</Td>
                      <Td>{x.categoria ?? <Nulo>sin categoría</Nulo>}</Td>
                      <Td>
                        <Estado tono={l.tono} clave={l.clave}>
                          {l.label}
                        </Estado>
                      </Td>
                      <Td>{x.ubicacion_actual ?? <Nulo>sin ubicación</Nulo>}</Td>
                      <Td>{x.responsable_actual ?? <Nulo>sin responsable</Nulo>}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Tabla>
          )}
        </ZonaSplit>

        {h && (
          <>
            <Divisor
              arrastrando={split.arrastrando}
              setArrastrando={split.setArrastrando}
              onArrastre={(dx, fin) => {
                const n = split.acotar(split.ancho - dx)
                if (fin) split.guardar(n)
                else split.setAncho(n)
              }}
            />
            <PanelDetalle
              titulo={h.nombre}
              subtitulo={h.obra_nombre ?? h.ubicacion_actual ?? 'sin ubicación'}
              ancho={split.ancho}
              onCerrar={() => setSeleccionada(null)}
            >
              <FichaHerramienta
                h={h}
                ubicaciones={ubicaciones}
                movimientos={movimientosPorHerramienta[h.id_herramienta] ?? []}
              />
            </PanelDetalle>
          </>
        )}
      </div>
    </div>
  )
}

function AltaHerramienta({ ubicaciones, onListo }: { ubicaciones: string[]; onListo: () => void }) {
  const [state, action, creando] = useActionState(createHerramientaAction, INICIAL)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.ok) {
      form.current?.reset()
      onListo()
    }
  }, [state, onListo])
  return (
    <form ref={form} action={action} className="border-y border-line bg-surface-quiet px-4 py-4" data-testid="form-alta-herramienta">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Nombre" className="sm:col-span-2">
          <input name="nombre" required placeholder="Hormigonera 250 L" className={CAMPO} />
        </Campo>
        <Campo rotulo="Ubicación" ayuda="Dónde queda dada de alta.">
          <input name="ubicacion_actual" list="ubicaciones-alta" defaultValue="ALMACEN" className={CAMPO} />
          <datalist id="ubicaciones-alta">
            {ubicaciones.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Boton type="submit" variante="primaria" disabled={creando}>
          {creando ? 'Guardando…' : 'Guardar herramienta'}
        </Boton>
        <Boton type="button" variante="discreta" onClick={onListo}>
          Cancelar
        </Boton>
        {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
      </div>
    </form>
  )
}
