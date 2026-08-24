'use client'

// 14 · PRESUPUESTOS CARTERA — la lista.
//
// ═══ EL BUSCADOR FILTRA EN EL NAVEGADOR; EL FILTRO DE ESTADO VA A LA URL ═══
//
// Son dos cosas distintas y por eso viven en lugares distintos. La BÚSQUEDA es exploración: se
// teclea, se corrige y se borra en dos segundos, y un `?q=` por tecla convierte eso en cinco viajes
// de red con el foco perdiéndose en cada recarga (el mismo criterio, y por el mismo tamaño de
// negocio, que en `ListaClientes`). El FILTRO de estado es una vista: «los adjudicados» es algo que
// alguien quiere volver a abrir mañana o mandar por chat, y para eso tiene que estar en la
// dirección.
//
// ═══ LOS TOTALES VIVEN AL PIE DE LA TABLA, NO EN CUATRO TARJETAS ARRIBA (Design 23/08) ═══
//
// Eran cuatro `StatTile` empujando la tabla 96px hacia abajo para decir cuatro números que la tabla
// ya tenía columna por columna. Al pie y alineados con SU columna, cada total se lee contra las
// filas que lo formaron, y responden al filtro: «cotizado» de los abiertos es el total de las filas
// que se están viendo, no un número de otra pantalla. El contador de cada chip es el que avisa
// cuánto quedó afuera.
//
// ═══ CADA CHIP LLEVA SU PROPIO CONTADOR (Design 24/08) ═══
//
// La barra decía «N de M» al final: cuánto quedó después de filtrar, pero no cuánto hay detrás de
// cada chip. Para decidir qué mirar hace falta lo segundo — «Con problema 3» manda a alguien ahí y
// «Con problema 0» le ahorra el clic. Los contadores salen de `cuentasPorFiltro`, sobre la MISMA
// búsqueda que está tipeada: un chip que cuenta la cartera entera mientras la tabla muestra dos
// filas publica dos números distintos de la misma cosa en la misma barra.
//
// ═══ LO QUE NO SE DIBUJA EN CERO ═══
//
// Un presupuesto sin partidas tiene precio de venta 0 porque la vista hace `coalesce(sum(...), 0)`.
// En la columna TOTAL eso diría que la empresa ofertó gratis. Se escribe «sin cargar».
// Un margen NULL —no hay costo directo contra el cual medirlo— se escribe «sin dato», nunca 0 %.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Buscador, Estado, Filtros, Nulo, Tabla, THead, Th, Tr, Td, FilaTotal } from '@/shared/components/ds'
import { IconoPresupuesto, IconoProblema } from '@/shared/components/iconos'
import type { PresupuestoCascada } from '../types'
import {
  FILTROS, cuentasPorFiltro, filtrarCartera, kpisDeCartera, ordenarCartera, type FiltroCartera,
} from '../services/cartera'
import { lecturaEstado } from '../services/estado'
import { tieneCifras } from '../services/cascada'
import { fecha, plata, porcentaje } from '../services/formato'
import { PanelPresupuesto } from './PanelPresupuesto'

/** El objetivo de la empresa contra el que se pinta el margen. Cuando baja de acá, va en `warn`. */
const MARGEN_OBJETIVO = 17

// ═══ HAY DOS COLUMNAS O NO LAS HAY ═══
//
// El panel es una COLUMNA al lado de la lista, no una hoja encima. Debajo de 1024px no entra: se
// comería la tabla y dejaría a quien tocó una fila leyendo una ficha recortada con el fondo
// robándole el primer toque. Ahí el clic hace lo único que tiene sentido en ese ancho — abrir la
// ficha completa—, igual que la lista de clientes.
//
// Se lee con `useSyncExternalStore` y no con un efecto: el servidor contesta `false` —sin panel en
// la primera pintura, sin desajuste de hidratación— y el navegador corrige en el mismo render.
const MQ = '(min-width: 1024px)'
const suscribirAncho = (avisar: () => void) => {
  const m = window.matchMedia(MQ)
  m.addEventListener('change', avisar)
  return () => m.removeEventListener('change', avisar)
}

export function ListaPresupuestos({
  presupuestos,
  filtro,
  seleccionInicial = null,
}: {
  presupuestos: PresupuestoCascada[]
  filtro: FiltroCartera
  /** `?sel=` de la URL: el link compartido tiene que abrir la lista CON el panel abierto. */
  seleccionInicial?: string | null
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<string | null>(seleccionInicial)
  const esEscritorio = useSyncExternalStore(
    suscribirAncho,
    () => window.matchMedia(MQ).matches,
    () => false,
  )

  // ═══ LA SELECCIÓN ES ESTADO CLIENTE CON LA URL DE ESPEJO ═══
  //
  // El panel no lee NADA que la fila no tenga ya: `cotizacion_cascada` trae todo lo que muestra.
  // Navegar a `?sel=` mandaría un viaje al servidor y un esqueleto por cada fila que alguien toca
  // mientras compara tres ofertas. Con `replaceState` la dirección queda compartible y recargable
  // sin pagar el viaje — el mismo patrón que el árbol de tareas de la obra.
  const sincronizarUrl = (id: string | null) => {
    const p = new URLSearchParams(window.location.search)
    if (id === null) p.delete('sel'); else p.set('sel', id)
    const q = p.toString()
    window.history.replaceState(null, '', q ? `${window.location.pathname}?${q}` : window.location.pathname)
  }
  const abrir = (id: string) => {
    if (!esEscritorio) { router.push(`/presupuestos/${id}`); return }
    const proximo = abierto === id ? null : id
    setAbierto(proximo)
    sincronizarUrl(proximo)
  }
  const cerrar = () => { setAbierto(null); sincronizarUrl(null) }

  const visibles = useMemo(
    () => ordenarCartera(filtrarCartera(presupuestos, filtro, busqueda)),
    [presupuestos, filtro, busqueda],
  )
  const cuentas = useMemo(() => cuentasPorFiltro(presupuestos, busqueda), [presupuestos, busqueda])
  // Los totales son de lo que se ve. Calcularlos sobre la cartera entera mientras la tabla muestra
  // cuatro filas publica un pie que no cierra con ninguna columna de arriba.
  const k = useMemo(() => kpisDeCartera(visibles), [visibles])
  // El panel sólo existe si la fila sigue en pantalla: filtrar o buscar hasta esconderla dejaría un
  // panel hablando de un presupuesto que la lista de al lado ya no muestra.
  const seleccionado = esEscritorio ? (visibles.find((p) => p.id === abierto) ?? null) : null

  return (
    <div className="flex min-w-0 gap-6">
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Buscador
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar presupuesto o cliente"
            testid="buscador-presupuestos"
            className="w-[260px] max-w-full"
          />
          {presupuestos.length > 1 && (
            <Filtros
              testid="filtros-presupuestos"
              opciones={FILTROS.map((f) => ({
                label: (
                  <>
                    {f.label}
                    <span
                      className="ml-1.5 font-mono text-[10.5px] tabular-nums text-faint"
                      data-testid={`cuenta-${f.clave}`}
                    >
                      {cuentas[f.clave]}
                    </span>
                  </>
                ),
                href: f.clave === 'todos' ? '/presupuestos' : `/presupuestos?filtro=${f.clave}`,
                activo: filtro === f.clave,
                testid: `filtro-${f.clave}`,
              }))}
            />
          )}
        </div>

        <Tabla testid="tabla-presupuestos" minWidth={820}>
          <THead>
            <Th>Presupuesto</Th>
            <Th>Cliente</Th>
            <Th>Estado</Th>
            <Th num>Total</Th>
            <Th num>Margen</Th>
            <Th num>Rev.</Th>
            <Th num>
              <span className="sr-only">Partidas sin análisis</span>
              <span className="inline-flex justify-end" title="Partidas sin análisis de precio">
                <IconoProblema className="h-[13px] w-[13px]" />
              </span>
            </Th>
          </THead>
          <tbody>
            {visibles.map((p) => (
              <FilaPresupuesto
                key={p.id}
                p={p}
                seleccionada={esEscritorio && p.id === abierto}
                onAbrir={() => abrir(p.id)}
              />
            ))}
            {visibles.length > 0 && (
              // `kpis-cartera` sigue siendo el testid de los totales de la cartera: cambió dónde se
              // dibujan, no qué miden.
              <FilaTotal>
                <Td colSpan={3} className="text-[12px]" data-testid="kpis-cartera">
                  <Rotulo>En curso</Rotulo>
                  <span className="ml-1.5 font-mono tabular-nums">{k.nAbiertos}</span>
                  <Rotulo className="ml-4">Ganados</Rotulo>
                  <span className="ml-1.5 font-mono tabular-nums">{k.nAdjudicados}</span>
                  <Rotulo className="ml-4">Ganado</Rotulo>
                  <span className="ml-1.5 font-mono tabular-nums text-pos" data-testid="total-adjudicado">
                    {plata(k.adjudicado) ?? <Nulo>sin cargar</Nulo>}
                  </span>
                </Td>
                <Td num data-testid="total-cotizado">
                  <Rotulo>Cotizado</Rotulo>
                  <span className="ml-1.5">{plata(k.cotizadoAbierto) ?? <Nulo>sin cargar</Nulo>}</span>
                </Td>
                <Td num data-testid="margen-ponderado">
                  {/* Ponderado por monto sobre los ADJUDICADOS. Sin ninguno con margen no es 0 %. */}
                  {porcentaje(k.margenPonderadoPct) ?? <Nulo>sin dato</Nulo>}
                </Td>
                <Td /><Td />
              </FilaTotal>
            )}
          </tbody>
        </Tabla>

        {visibles.length === 0 && (
          <p className="border-b border-[#EFEEEA] py-6 text-[13px] text-muted" data-testid="cartera-vacia">
            {presupuestos.length === 0
              ? 'Todavía no hay presupuestos cargados.'
              : <>Nada coincide con lo que buscás. <button type="button" onClick={() => setBusqueda('')} className="text-ink underline underline-offset-2">Ver todo</button>.</>}
          </p>
        )}
      </div>

      {seleccionado && (
        <PanelPresupuesto p={seleccionado} onCerrar={cerrar} margenObjetivo={MARGEN_OBJETIVO} />
      )}
    </div>
  )
}

function Rotulo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-sans text-[10px] uppercase tracking-[0.06em] text-faint ${className}`}>
      {children}
    </span>
  )
}

function FilaPresupuesto({ p, seleccionada, onAbrir }: {
  p: PresupuestoCascada
  seleccionada: boolean
  onAbrir: () => void
}) {
  const e = lecturaEstado(p.estado)
  const conCifras = tieneCifras(p)
  const monto = conCifras ? plata(p.precio_venta) : null
  const margen = porcentaje(p.margen_sobre_precio_pct)
  const bajoObjetivo = p.margen_sobre_precio_pct !== null && p.margen_sobre_precio_pct < MARGEN_OBJETIVO

  return (
    <Tr
      seleccionada={seleccionada}
      onClick={onAbrir}
      data-testid="fila-presupuesto"
      data-presupuesto={p.id}
      className="cursor-pointer"
    >
      <Td fuerte>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-faint"><IconoPresupuesto className="h-[15px] w-[15px]" /></span>
          <span className="min-w-0">
            {/* El enlace es el nombre: abre la pantalla del cómputo. El resto de la fila abre el
                panel. Dos destinos distintos y ninguno tapa al otro. */}
            <Link
              href={`/presupuestos/${p.id}`}
              onClick={(ev) => ev.stopPropagation()}
              className="block truncate hover:underline"
            >
              {p.obra_nombre ?? <Nulo>sin objeto</Nulo>}
            </Link>
            <span className="block font-mono text-[10.5px] tabular-nums text-faint">
              {p.numero ?? 'sin número'}
              {p.fecha_cotizacion && ` · ${fecha(p.fecha_cotizacion)}`}
            </span>
          </span>
        </div>
      </Td>
      <Td>{p.cliente ?? <Nulo>sin cliente</Nulo>}</Td>
      <Td><Estado tono={e.tono} clave={e.clave}>{e.label}</Estado></Td>
      <Td num>{monto ?? <Nulo>sin cargar</Nulo>}</Td>
      <Td num className={margen && bajoObjetivo ? 'text-warn' : undefined}>
        {margen ?? <Nulo>sin dato</Nulo>}
      </Td>
      <Td num className="text-faint">
        {p.version}
        {!p.vigente && <span className="ml-1 font-sans text-[10px]">reemplazada</span>}
      </Td>
      <Td num>
        {p.n_sin_analisis > 0
          ? <span className="text-warn" data-testid="cuenta-sin-analisis">{p.n_sin_analisis}</span>
          : <span className="text-faint">—</span>}
      </Td>
    </Tr>
  )
}
