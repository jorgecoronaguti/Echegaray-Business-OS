'use client'

// 14 · PRESUPUESTOS CARTERA — porte literal de `echegaray-design/14 · Presupuestos Cartera.dc.html`.
//
// ═══ QUÉ CAMBIÓ RESPECTO DE LA VERSIÓN ANTERIOR, Y POR QUÉ ═══
//
// La versión anterior dibujaba esta pantalla con `ds/Tabla`, que declara «las tablas no van en
// caja». El mockup la dibuja DENTRO de una caja blanca con radio 10, encabezado #FAFAF8 de 38px y
// el pie de totales adentro de la misma caja. Ésa —y no un matiz de color— es la diferencia que el
// dueño describió cuatro veces como «estructura parecida, aspecto distinto». Ahora se porta el
// mockup y el vocabulario vive medido en `shared/components/canon`.
//
// ═══ LO QUE NO CAMBIÓ, Y NO DEBE CAMBIAR ═══
//
// La BÚSQUEDA filtra en el navegador y el FILTRO de estado va a la URL. Son dos cosas distintas:
// se teclea y se borra una búsqueda en dos segundos —un `?q=` por tecla son cinco viajes de red con
// el foco perdiéndose en cada recarga— y en cambio «los ganados» es una vista que alguien quiere
// volver a abrir mañana o mandar por chat.
//
// Los TOTALES son de lo que se ve. Calcularlos sobre la cartera entera mientras la tabla muestra
// cuatro filas publica un pie que no cierra con ninguna columna de arriba.
//
// `null` NO ES CERO. Un presupuesto sin partidas tiene precio 0 porque la vista hace
// `coalesce(sum(...), 0)`; en la columna TOTAL eso diría que la empresa ofertó gratis. Se escribe
// «sin cotizar» en `warn`, que es la palabra del mockup. Un margen NULL es «no hay costo directo
// contra el cual medirlo», nunca 0 %.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Estado, Filtros, MenuContextual } from '@/shared/components/ds'
import {
  ALTO, C, CeldaTexto, CuentaChip, EncabezadoCanon, FilaCanon, FranjaCartera, PAGINA, PieCanon,
  TarjetaTabla, VacioCanon, BuscadorCaja, IcoAlerta, IcoMasAcciones, IcoPresupuesto,
  entero, millones, porcentajeCanon,
} from '@/shared/components/canon'
import type { PresupuestoCascada } from '../types'
import {
  FILTROS, cuentasPorFiltro, filtrarCartera, kpisDeCartera, ordenarCartera, problemasDe,
  type FiltroCartera,
} from '../services/cartera'
import { lecturaEstado } from '../services/estado'
import { tieneCifras } from '../services/cascada'
import { fecha } from '../services/formato'
import { PanelPresupuesto } from './PanelPresupuesto'

// ═══ EL UMBRAL DE MARGEN: 17 ES DEL OS, 12 ES DEL MOCKUP, Y LA DIFERENCIA NO LA RESUELVO YO ═══
//
// El mockup pinta el margen en rojo por debajo de 12 y llama a ese número «el piso de margen de la
// empresa» (`16`, la marca de la barra). Este módulo viene usando 17 desde antes, declarado como
// «el objetivo de la empresa». Son dos afirmaciones sobre una política comercial y ninguna de las
// dos tiene fuente en la base: `parametro_comercial` guarda el BENEFICIO (markup sobre el costo),
// que no es el margen sobre el precio.
//
// Cambiar 17 por 12 sin que el dueño lo decida movería en silencio qué presupuestos se ven en rojo
// —o sea, a cuáles se les va a mirar el precio antes de mandarlos—. Se conserva el 17 que ya está
// en producción y la diferencia queda declarada en el informe para que la cierre quien puede.
const MARGEN_OBJETIVO = 17

// ═══ HAY DOS COLUMNAS O NO LAS HAY ═══
//
// El panel es una COLUMNA al lado de la lista, no una hoja encima. Debajo de 1024px no entra: se
// comería la tabla y dejaría a quien tocó una fila leyendo una ficha recortada. Ahí el clic hace lo
// único que tiene sentido en ese ancho — abrir la ficha completa.
//
// Se lee con `useSyncExternalStore` y no con un efecto: el servidor contesta `false` —sin panel en
// la primera pintura, sin desajuste de hidratación— y el navegador corrige en el mismo render.
const MQ = '(min-width: 1024px)'
const suscribirAncho = (avisar: () => void) => {
  const m = window.matchMedia(MQ)
  m.addEventListener('change', avisar)
  return () => m.removeEventListener('change', avisar)
}

/** `minmax(0,1.6fr) minmax(0,1.1fr) 128px 106px 84px 52px 56px 26px` — `14`, línea 106. */
const COLS = 'minmax(0,1.6fr) minmax(0,1.1fr) 128px 106px 84px 52px 56px 26px'

export function ListaPresupuestos({
  presupuestos,
  filtro,
  seleccionInicial = null,
  accion,
}: {
  presupuestos: PresupuestoCascada[]
  filtro: FiltroCartera
  /** `?sel=` de la URL: el link compartido tiene que abrir la lista CON el panel abierto. */
  seleccionInicial?: string | null
  /** «Nuevo presupuesto», que lo arma el servidor porque conoce el estado del formulario. */
  accion?: React.ReactNode
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<string | null>(seleccionInicial)
  const esEscritorio = useSyncExternalStore(suscribirAncho, () => window.matchMedia(MQ).matches, () => false)

  // ═══ LA SELECCIÓN ES ESTADO CLIENTE CON LA URL DE ESPEJO ═══
  //
  // El panel no lee NADA que la fila no tenga ya: `cotizacion_cascada` trae todo lo que muestra.
  // Navegar a `?sel=` mandaría un viaje al servidor por cada fila que alguien toca mientras compara
  // tres ofertas. Con `replaceState` la dirección queda compartible sin pagar el viaje.
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
  const k = useMemo(() => kpisDeCartera(visibles), [visibles])
  // El panel sólo existe si la fila sigue en pantalla: filtrar hasta esconderla dejaría un panel
  // hablando de un presupuesto que la lista de al lado ya no muestra.
  const seleccionado = esEscritorio ? (visibles.find((p) => p.id === abierto) ?? null) : null

  return (
    <>
      <FranjaCartera titulo="Presupuestos" accion={accion} testid="franja-presupuestos">
        {/* 236px — `14`, línea 60. */}
        <div style={{ marginLeft: 8 }}>
          <BuscadorCaja
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar presupuesto o cliente"
            ancho={236}
            testid="buscador-presupuestos"
          />
        </div>
        {presupuestos.length > 1 && (
          <Filtros
            testid="filtros-presupuestos"
            opciones={FILTROS.map((f) => ({
              label: (
                <>
                  {f.label}
                  <CuentaChip n={cuentas[f.clave]} activo={filtro === f.clave} />
                </>
              ),
              href: f.clave === 'todos' ? '/presupuestos' : `/presupuestos?filtro=${f.clave}`,
              activo: filtro === f.clave,
              testid: `filtro-${f.clave}`,
            }))}
          />
        )}
      </FranjaCartera>

      <div style={PAGINA.cuerpo}>
        <TarjetaTabla testid="tabla-presupuestos" cols={COLS}>
          <EncabezadoCanon
            cols={COLS}
            columnas={[
              { rotulo: 'PRESUPUESTO' },
              { rotulo: 'CLIENTE' },
              { rotulo: 'ESTADO' },
              { rotulo: 'TOTAL', alineacion: 'derecha' },
              { rotulo: 'MARGEN', alineacion: 'derecha' },
              { rotulo: 'REV.', alineacion: 'derecha' },
              {
                alineacion: 'centro',
                rotulo: (
                  <span title="Partidas sin análisis de precio" style={{ display: 'inline-flex', color: 'currentColor' }}>
                    <span className="sr-only">Partidas sin análisis</span>
                    <IcoAlerta s={12} />
                  </span>
                ),
              },
              { rotulo: '', vacia: true },
            ]}
          />

          {visibles.map((p) => (
            <FilaPresupuesto
              key={p.id}
              p={p}
              seleccionada={esEscritorio && p.id === abierto}
              onAbrir={() => abrir(p.id)}
            />
          ))}

          {visibles.length === 0 && (
            <VacioCanon testid="cartera-vacia">
              {presupuestos.length === 0 ? (
                'Todavía no hay presupuestos cargados.'
              ) : (
                <>
                  Nada coincide con lo que buscás.{' '}
                  <button
                    type="button"
                    onClick={() => setBusqueda('')}
                    style={{ color: C.tinta, textDecoration: 'underline', textUnderlineOffset: 2 }}
                  >
                    Ver todo
                  </button>
                  .
                </>
              )}
            </VacioCanon>
          )}

          {visibles.length > 0 && (
            // `kpis-cartera` sigue siendo el testid de los totales: cambió dónde se dibujan, no qué
            // miden. Los tres son los del mockup — EN CURSO, COTIZADO, GANADO — y responden al
            // filtro que está puesto.
            <div data-testid="kpis-cartera">
              <PieCanon
                totales={[
                  { rotulo: 'EN CURSO', valor: entero(k.nAbiertos) ?? '0' },
                  { rotulo: 'COTIZADO', valor: millones(k.cotizadoAbierto) ?? 'sin cargar', testid: 'total-cotizado' },
                  { rotulo: 'GANADO', valor: millones(k.adjudicado) ?? 'sin cargar', color: C.pos, testid: 'total-adjudicado' },
                ]}
              />
            </div>
          )}
        </TarjetaTabla>

        {seleccionado && <PanelPresupuesto p={seleccionado} onCerrar={cerrar} margenObjetivo={MARGEN_OBJETIVO} />}
      </div>
    </>
  )
}

function FilaPresupuesto({ p, seleccionada, onAbrir }: {
  p: PresupuestoCascada
  seleccionada: boolean
  onAbrir: () => void
}) {
  const e = lecturaEstado(p.estado)
  const conCifras = tieneCifras(p)
  const monto = conCifras ? millones(p.precio_venta) : null
  const margen = porcentajeCanon(p.margen_sobre_precio_pct)
  const bajoObjetivo = p.margen_sobre_precio_pct !== null && p.margen_sobre_precio_pct < MARGEN_OBJETIVO
  const problemas = problemasDe(p)

  return (
    <FilaCanon
      cols={COLS}
      alto={ALTO.filaAlta}
      seleccionada={seleccionada}
      onClick={onAbrir}
      testid="fila-presupuesto"
      data-presupuesto={p.id}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}><IcoPresupuesto s={15} /></span>
        <span style={{ minWidth: 0 }}>
          {/* El enlace es el nombre: abre el cómputo. El resto de la fila abre el panel. Dos
              destinos distintos y ninguno tapa al otro. */}
          <Link
            href={`/presupuestos/${p.id}`}
            onClick={(ev) => ev.stopPropagation()}
            className="block truncate hover:underline"
            style={{ fontSize: '12.5px', fontWeight: 500, color: C.tinta }}
          >
            {p.obra_nombre ?? 'sin objeto'}
          </Link>
          {/* DESVÍO DECLARADO respecto del mockup: el canon dibuja UN renglón porque su maqueta no
              tenía número de presupuesto. `COT-2026-018` es la identidad con la que el cliente lo
              nombra por teléfono y con la que se busca; entra como segundo renglón, que es el mismo
              patrón que el canon usa en `25 · Clientes Cartera` con la misma altura de fila. */}
          <span className="block truncate font-mono tabular-nums" style={{ fontSize: '10.5px', color: C.tenue }}>
            {p.numero ?? 'sin número'}
            {p.fecha_cotizacion && ` · ${fecha(p.fecha_cotizacion)}`}
          </span>
        </span>
      </div>

      <CeldaTexto color={p.cliente ? C.tintaSuave : C.tenue}>{p.cliente ?? 'sin cliente'}</CeldaTexto>

      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <Estado tono={e.tono} clave={e.clave}>{e.label}</Estado>
      </div>

      <CeldaTexto mono alineacion="derecha" color={monto === null ? C.warn : C.tinta}>
        {monto ?? 'sin cotizar'}
      </CeldaTexto>

      <CeldaTexto mono alineacion="derecha" color={margen === null ? C.tenue : bajoObjetivo ? C.neg : C.tinta}>
        {margen ?? 'sin dato'}
      </CeldaTexto>

      <CeldaTexto mono alineacion="derecha" tam="11.5px" color={C.apagado}>
        {p.version ? `r${p.version}` : '—'}
        {!p.vigente && <span style={{ fontSize: '10px' }}> reemplazada</span>}
      </CeldaTexto>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {problemas.length > 0 ? (
          <span
            title={problemas.join(' · ')}
            data-testid="cuenta-sin-analisis"
            style={{ display: 'flex', alignItems: 'center', gap: 3, color: bajoObjetivo ? C.neg : C.warn }}
          >
            <IcoAlerta s={13} />
            <span className="font-mono tabular-nums" style={{ fontSize: '11px' }}>{problemas.length}</span>
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: C.inerte }}>—</span>
        )}
      </div>

      {/* Los tres puntos del mockup, con las acciones REALES del presupuesto. No abre un menú de
          adorno: cada ítem lleva a algo que existe. */}
      <div style={{ display: 'flex', justifyContent: 'center' }} onClick={(ev) => ev.stopPropagation()}>
        <MenuContextual
          testid={`acciones-${p.id}`}
          etiqueta={`Más acciones de ${p.obra_nombre ?? p.numero ?? 'el presupuesto'}`}
          disparador={<IcoMasAcciones s={15} />}
          items={[
            { label: 'Abrir el cómputo', href: `/presupuestos/${p.id}`, testid: 'menu-abrir' },
            ...(p.estado === 'adjudicada' && p.congelada_en && p.obra_canonica_id
              ? [{ label: 'Preparar obra', href: `/presupuestos/${p.id}/convertir`, testid: 'menu-convertir' }]
              : []),
          ]}
        />
      </div>
    </FilaCanon>
  )
}
