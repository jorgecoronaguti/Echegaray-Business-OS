'use client'


// ═══ 01 · CARTERA · TABLA — PORTE LITERAL DE `erp-obras/01.html` Y `M01.html` (dueño, 23/09/2026) ═══
//
// Cada medida salió de esos dos archivos: 230×32 el buscador, 40px el encabezado, 64px la fila,
// `minmax(0,1.5fr) minmax(0,.85fr) 104px 128px 78px` la grilla con 22px de separación, 64×4 la barra
// de avance. En el teléfono (M01): buscador de 44px, pastillas de 36px, filas de 62px y la primaria
// «Nueva obra» de 48px al pie, sobre la barra. Cambiar un número sin abrir el mockup es volver a
// empezar: las cuatro entregas anteriores se rechazaron por «estructura parecida, aspecto distinto».
//
// LO QUE EL DISEÑO NO DIBUJA, NO ESTÁ: ni Jefe, ni Traba, ni HH, ni HOY, ni el «···». La cartera es
// para encontrar y abrir una obra. Buscar y filtrar son estado del CLIENTE: son trece filas ya
// cargadas y una vuelta al servidor por tecla haría pegajosa la primera pantalla del día.
//
// LA CABECERA (título, Ver Tabla · Gantt, chips) SE EXPORTA porque el 02 la repite igual sobre el
// calendario: una sola definición de los filtros para las dos vistas de la misma cartera.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { CuerpoGantt, SelectorEscala } from './GanttObras'
import type { EscalaCartera } from '../services/carteraGantt'
import { Ico, P } from './canon/Ico'
import { C } from './canon/tokens'
import { Hover } from './canon/Piezas'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'
import { rotuloDeObra } from '@/shared/utils/obra'
import { ETAPA_LABEL, type Etapa } from '../types'
import {
  bajadaCartera, coincideTexto, colorDeBarra, colorDeEstado, colorDePlazo, entraEnFiltro, esPrevio,
  estadoDeCartera, FILTROS_CARTERA, agruparPorCliente, SIN_CLIENTE, sublineaTelefono, textoDePlazo,
  type FiltroCartera,
} from '../services/carteraCanon'
import { clienteDeObra } from '../../../shared/clientes/nombre.ts'
import {
  BARRA_PRIMARIA_TELEFONO, ENCABEZADO_FIJO, ENCABEZADO_FIJO_TELEFONO, ESTILO_BAJADA, ESTILO_CODO, ESTILO_CUENTA_GRUPO,
  ESTILO_NOMBRE_FILA, ESTILO_ROTULOS, ESTILO_TITULO, SANGRIA_HIJA, estiloBuscador, estiloCabeceraGrupo, estiloChip,
  estiloCuentaChip, estiloEntradaBuscador, estiloFiltros, estiloPrimaria,
} from '@/shared/components/cartera/estiloCartera'

/** Lo que la página le entrega ya leído. Un tipo propio y no `ObraPanel`: así se ve de un vistazo
 *  qué necesita esta pantalla, y qué se rompe el día que la vista cambie. */
export interface FilaCartera {
  obra_id: string
  nombre: string
  /** El código interno (`OB-0012`); `null` mientras no se pueda leer. Se dibuja y se busca. */
  codigo?: string | null
  cliente_slug: string | null
  cliente_nombre: string | null
  cliente_texto: string | null
  /** La obra mayor de la que es adicional (`obra_canonica.obra_padre_id`): se dibuja debajo de ella. */
  obra_padre_id?: string | null
  estado: string
  etapa: string | null
  avance_pct: number | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  forecast_fin: string | null
  /** `null` = no se pudo leer. Un control que no pudo mirar no dice «no hay». */
  impedimentos: number | null
}

// SIN COLUMNA CLIENTE (dueño, 23/09/2026): la cartera se lee como el CRM, agrupada por cliente con el
// adicional debajo de su obra mayor; el cliente es el encabezado del grupo, no una celda.
const GRID = 'minmax(0,2.35fr) 104px 128px 78px'
/** Por debajo de esto la grilla de escritorio scrollea POR DENTRO (entre los 640px del teléfono y una
 *  ventana angosta): 310px de columnas fijas + 88px de gaps dejan a OBRA por encima de 160px. La página
 *  nunca se corre de costado. */
const MIN_TABLA = 660
const ICONO_CHIP: Record<FiltroCartera, ReactNode> = {
  todo: P.todo, curso: P.hh, atraso: P.alerta, problema: P.bloqueo, previo: P.previo,
}
const etapaDe = (o: { etapa: string | null }) => (o.etapa ? ETAPA_LABEL[o.etapa as Etapa] ?? o.etapa : null)
const clienteDe = (o: FilaCartera) => clienteDeObra(o)

// ═══ EL ESTADO COMPARTIDO DE LAS DOS VISTAS: buscador + chips ═══

/**
 * EL ENCABEZADO DE LA CARTERA QUEDA FIJO (dueño, 23/09/2026: «el header no puede actualizar siempre y
 * debe quedar fijo»): título, buscador, Ver y chips se pegan justo debajo de la barra de la app (44 px) y
 * la lista se desplaza debajo. Los márgenes negativos absorben el padding del contenedor para que el
 * fondo cubra de borde a borde y no se vea la lista pasar por los costados.
 */
// Viven en `shared/components/cartera/estiloCartera.ts` desde el 25/09/2026: Clientes los usa igual.
export { ENCABEZADO_FIJO, ENCABEZADO_FIJO_TELEFONO }

export function useFiltroCartera(obras: FilaCartera[]) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<FiltroCartera>('todo')
  const lista = useMemo(
    () => obras.filter((o) => coincideTexto(o.nombre, clienteDe(o), q, o.codigo ?? null)
      && entraEnFiltro(o, filtro, o.impedimentos)),
    [obras, q, filtro],
  )
  // LOS CONTADORES DE LOS CHIPS CUENTAN LA CARTERA, NO LO FILTRADO: un chip que dice «Previo 2»
  // tiene que seguir diciendo 2 después de tocar otro chip, o deja de ser un mapa de la cartera.
  const cuentas = useMemo(() => Object.fromEntries(
    FILTROS_CARTERA.map((f) => [f.k, obras.filter((o) => entraEnFiltro(o, f.k, o.impedimentos)).length]),
  ) as Record<FiltroCartera, number>, [obras])
  // UN CONTROL QUE NO PUDO MIRAR NO DICE CUÁNTOS: con la lectura de impedimentos caída el chip
  // «Con problema» deja pasar todo, pero no publica un número que nadie contó.
  const sinImpedimentos = obras.some((o) => o.impedimentos == null)
  return { q, setQ, filtro, setFiltro, lista, cuentas, sinImpedimentos, limpiar: () => { setQ(''); setFiltro('todo') } }
}

/** «Ver Tabla · Gantt» (01/02) — en el teléfono sin la palabra «Ver» (M01/M02). */
export type VistaCartera = 'tabla' | 'gantt'
const HREF_VISTA: Record<VistaCartera, string> = { tabla: '/obras', gantt: '/obras/gantt' }

/**
 * TABLA · GANTT SIN VOLVER AL SERVIDOR (dueño, 23/09/2026: «cuando voy de tabla a gantt el diseño
 * cambia, refresca, está mal»). Las dos vistas son la misma página con los mismos datos: el clic
 * cambia el estado y reescribe la URL con `history.replaceState` (el App Router la sincroniza), así el
 * encabezado no se vuelve a dibujar. El `<a>` conserva su href real para abrir en otra pestaña y para
 * las rutas que otros enlaces ya apuntan (`/obras/gantt` sigue existiendo).
 */
export function ConmutadorVista({ vista, telefono, cambiar }: { vista: VistaCartera; telefono: boolean; cambiar?: (v: VistaCartera) => void }) {
  const item = (k: VistaCartera, t: string, d: ReactNode, href: string) => {
    const activo = vista === k
    const alClic = cambiar ? (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      if (activo) return
      cambiar(k)
      const q = window.location.search
      window.history.replaceState(window.history.state, '', href + q)
    } : undefined
    return (
      <Link href={href} prefetch={false} onClick={alClic} data-testid={`nav-vistas-obras-${k}`} aria-current={activo ? 'page' : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: telefono ? '5px' : '6px', fontSize: '12.5px',
          paddingBottom: '2px', textDecoration: 'none', color: activo ? C.tinta : C.tintaSuave,
          fontWeight: activo ? 500 : 400, boxShadow: activo ? `inset 0 -1.5px 0 ${C.tinta}` : undefined,
          // 44 de toque en el teléfono (medía 21); el texto queda abajo, pegado a su subrayado.
          ...(telefono ? { minHeight: '44px', alignItems: 'flex-end', paddingBottom: '6px' } : {}),
        }}><Ico d={d} s={12} />{t}</Link>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: telefono ? '12px' : '7px' }} data-testid="nav-vistas-obras">
      {!telefono && <span style={{ fontSize: '12px', color: C.tenue }}>Ver</span>}
      {item('tabla', 'Tabla', P.tabla, HREF_VISTA.tabla)}
      {item('gantt', 'Gantt', P.tiempo, HREF_VISTA.gantt)}
    </div>
  )
}

/** Los chips de filtro: subrayados en escritorio (01/02), pastillas de 36px en el teléfono (M01/M02). */
export function ChipsCartera({ filtro, setFiltro, cuentas, sinImpedimentos, telefono, claves }: {
  filtro: FiltroCartera
  setFiltro: (f: FiltroCartera) => void
  cuentas: Record<FiltroCartera, number>
  sinImpedimentos: boolean
  telefono: boolean
  /** Qué chips dibuja esta vista: el 02 no lleva «Previo». */
  claves?: readonly FiltroCartera[]
}) {
  const chips = FILTROS_CARTERA.filter((f) => !claves || claves.includes(f.k))
  return (
    <div style={estiloFiltros(telefono)}
      data-testid="filtros-obras">
      {chips.map((f) => {
        const activo = filtro === f.k
        const n = f.k === 'problema' && sinImpedimentos ? null : cuentas[f.k]
        return (
          <button key={f.k} type="button" onClick={() => setFiltro(f.k)} aria-pressed={activo}
            data-testid={`filtro-${f.k}`} data-activo={activo ? '1' : undefined}
            title={f.k === 'problema' && sinImpedimentos ? 'No se pudieron leer los impedimentos' : f.tip}
            style={estiloChip(activo, telefono)}>
            <Ico d={ICONO_CHIP[f.k]} s={12} />{f.t}
            {n != null && (
              <span style={estiloCuentaChip(telefono)}>{n}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** La primaria «Nueva obra»: 32px arriba a la derecha (01) · 48px al pie sobre la barra (M01). */
export function PrimariaNuevaObra({ telefono }: { telefono: boolean }) {
  const boton = (
    <Link href="/obras/nueva" prefetch={false} data-testid="alta-obra-nueva" style={estiloPrimaria(telefono)}><Ico d={P.mas} s={telefono ? 15 : 13} />Nueva obra</Link>
  )
  if (!telefono) return boton
  return (
    <div style={BARRA_PRIMARIA_TELEFONO}>{boton}</div>
  )
}

export function CarteraObras({ obras, archivadas, conArchivadas, esAdmin, sinDato, hoyIso, vistaInicial = 'tabla' }: {
  obras: FilaCartera[]
  /** Cuántas quedaron fuera de la lista por archivadas. */
  archivadas: number
  conArchivadas: boolean
  esAdmin: boolean
  /** Lo que no se pudo mirar, dicho con todas las letras debajo de la tabla. */
  sinDato: string[]
  /** El día, fijado en el servidor: la línea de HOY del Gantt no depende del reloj del navegador. */
  hoyIso: string
  /** Con qué vista se abre (`/obras` → tabla, `/obras/gantt` → gantt); después manda el conmutador. */
  vistaInicial?: VistaCartera
}) {
  const router = useRouter()
  const telefono = esAngosto(useAnchoVentana())
  const { q, setQ, filtro, setFiltro, lista, cuentas, sinImpedimentos, limpiar } = useFiltroCartera(obras)
  const grupos = useMemo(() => agruparPorCliente(lista), [lista])
  const [vista, setVista] = useState<VistaCartera>(vistaInicial)
  const [escala, setEscala] = useState<EscalaCartera>('trimestre')
  const esGantt = vista === 'gantt'

  const buscador = (
    <div style={estiloBuscador(telefono)}>
      <Ico d={P.buscar} s={telefono ? 14 : 13} />
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar obra o cliente"
        aria-label="Buscar obra o cliente" data-testid="buscar-obra"
        style={estiloEntradaBuscador(telefono)} />
      {q.length > 0 && (
        <button type="button" onClick={limpiar} aria-label="Limpiar la búsqueda" data-testid="buscar-obra-limpiar"
          style={{ display: 'flex', color: C.tenue, cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>
          <Ico d={P.cerrar} s={13} />
        </button>
      )}
    </div>
  )

  // EL PIE SE QUITÓ (dueño, 23/09/2026: «esto está como footer del módulo Obras, no tiene sentido si no
  // funciona, quitarlo»): ni «Se muestran N de M», ni la nota del atraso, ni «N archivadas · Verlas».

  const vacio = lista.length === 0 && (
    <div style={{ padding: '26px 0', fontSize: '12.5px', color: C.tintaSuave }}>
      Nada coincide.{' '}
      <button type="button" onClick={limpiar} data-testid="ver-todo"
        style={{ font: 'inherit', color: C.tinta, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', border: 'none', background: 'none', padding: 0 }}>
        Ver todo
      </button>
    </div>
  )

  const sinDatoLinea = sinDato.length > 0 && (
    <p style={{ fontSize: '12px', color: C.warn, margin: 0 }} data-testid="senales-sin-dato">{sinDato.join(' · ')}</p>
  )

  if (telefono) {
    return (
      <div style={{ background: C.superficie, padding: '16px', paddingBottom: esAdmin ? '96px' : '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}
        data-testid="portafolio-tabla">
        <div style={ENCABEZADO_FIJO_TELEFONO} data-testid="encabezado-cartera">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '19px', fontWeight: 600, color: C.tinta }}>Obras</div>
          <ConmutadorVista vista={vista} telefono cambiar={setVista} />
        </div>
        <div style={{ display: 'flex' }}>{buscador}</div>
        <ChipsCartera filtro={filtro} setFiltro={setFiltro} cuentas={cuentas} sinImpedimentos={sinImpedimentos} telefono />
        </div>
        {esGantt ? <CuerpoGantt grupos={grupos} lista={lista} total={obras.length} hoyIso={hoyIso} telefono escala={escala} /> : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {grupos.map((g) => (
              <Fragment key={g.clave}>
                <CabeceraCliente nombre={g.nombre} slug={g.slug} n={g.filas.length} telefono />
                {g.filas.map((f, i) => <FilaTelefono key={f.obra.obra_id} o={f.obra} nivel={f.nivel} ultima={i === g.filas.length - 1} ir={() => router.push(`/obras/${f.obra.obra_id}`)} />)}
              </Fragment>
            ))}
            {vacio}
          </div>
        )}
        {sinDatoLinea}
        {esAdmin && <PrimariaNuevaObra telefono />}
      </div>
    )
  }

  return (
    <div style={{ background: C.superficie, padding: '26px 30px 34px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}
      data-testid="portafolio-tabla">
      {/* EL ENCABEZADO QUEDA FIJO bajo la barra de la app (dueño, 23/09/2026): la tabla se desplaza debajo. */}
      <div style={ENCABEZADO_FIJO} data-testid="encabezado-cartera">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={ESTILO_TITULO}>Obras</div>
          <div style={ESTILO_BAJADA} data-testid="bajada-cartera">{bajadaCartera(obras)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {buscador}
          {/* SÓLO ADMINISTRACIÓN CREA OBRAS: la RLS lo rechaza igual, y un botón que falla es peor
              que un botón que no está. */}
          {esAdmin && <PrimariaNuevaObra telefono={false} />}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        <ConmutadorVista vista={vista} telefono={false} cambiar={setVista} />
        <div style={{ width: '1px', height: '15px', background: C.borde }} />
        <ChipsCartera filtro={filtro} setFiltro={setFiltro} cuentas={cuentas} sinImpedimentos={sinImpedimentos} telefono={false} />
        {esGantt && <SelectorEscala escala={escala} setEscala={setEscala} />}
      </div>
      </div>

      {esGantt ? <CuerpoGantt grupos={grupos} lista={lista} total={obras.length} hoyIso={hoyIso} telefono={false} escala={escala} /> : (<>
      <div style={{ overflowX: 'auto' }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: `${MIN_TABLA}px` }}>
        <div style={{ ...ESTILO_ROTULOS, gridTemplateColumns: GRID }}>
          <div>Obra</div><div>Etapa</div><div>Avance</div><div style={{ textAlign: 'right' }}>Plazo</div>
        </div>
        {grupos.map((g) => (
          <Fragment key={g.clave}>
            <CabeceraCliente nombre={g.nombre} slug={g.slug} n={g.filas.length} />
            {g.filas.map((f) => <Fila key={f.obra.obra_id} o={f.obra} nivel={f.nivel} ir={() => router.push(`/obras/${f.obra.obra_id}`)} />)}
          </Fragment>
        ))}
        {vacio}
      </div></div>

      </>)}
      {sinDatoLinea}
    </div>
  )
}

/** EL ENCABEZADO DEL GRUPO: el cliente, como en el CRM. Enlaza a su ficha cuando la tiene. El Gantt
 *  lo dibuja igual, de borde a borde (dueño, 24/09/2026). */
export function CabeceraCliente({ nombre, slug, n, telefono = false }: { nombre: string | null; slug: string | null; n: number; telefono?: boolean }) {
  const texto = nombre ?? SIN_CLIENTE
  return (
    <div data-testid="cabecera-cliente" data-cliente={slug ?? ''} style={estiloCabeceraGrupo(telefono, !!nombre)}>
      {slug && nombre
        ? <Link href={`/clientes/${slug}`} prefetch={false} style={{ color: C.tinta, textDecoration: 'none' }}>{texto}</Link>
        : <span data-nulo={nombre ? undefined : ''}>{texto}</span>}
      <span style={ESTILO_CUENTA_GRUPO}>{n}</span>
    </div>
  )
}

/** UNA FILA DE 64px del 01: nombre + estado en color, etapa, barra 64×4 + %, plazo. El adicional va con sangría. */
function Fila({ o, ir, nivel = 0 }: { o: FilaCartera; ir: () => void; nivel?: 0 | 1 }) {
  const previo = esPrevio(o)
  return (
    <Hover data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} data-nivel={nivel} onClick={ir}
      base={{
        display: 'grid', gridTemplateColumns: GRID, gap: '22px', height: '64px', alignItems: 'center',
        borderBottom: `1px solid ${C.borde}`, fontSize: '13.5px', cursor: 'pointer', color: C.tinta,
      }}
      hover={{ background: C.tenueFondo }}>
      <CeldaObra o={o} nivel={nivel} />
      <div style={{ color: C.tintaSuave }}>{etapaDe(o) ?? <span style={{ color: C.tenue }} data-nulo="">sin etapa</span>}</div>
      {previo || o.avance_pct == null
        ? <div style={{ color: C.tenue, fontSize: '12.5px' }} data-nulo="">{previo ? 'sin actividades' : 'sin avance cargado'}</div>
        : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{ width: '64px', height: '4px', borderRadius: '2px', background: C.borde, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, o.avance_pct))}%`, height: '100%', background: colorDeBarra(o) }} />
            </div>
            <span style={{ fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>{o.avance_pct}%</span>
          </div>
        )}
      <Plazo o={o} />
    </Hover>
  )
}

/** LA CELDA OBRA del 01: nombre (500) + estado en color. Se exporta porque la columna fija del Gantt
 *  es ESTA MISMA celda (dueño, 24/09/2026: «el Gantt tiene que respetar el diseño de la Tabla»). */
export function CeldaObra({ o, nivel = 0, href = `/obras/${o.obra_id}` }: { o: FilaCartera; nivel?: 0 | 1; href?: string }) {
  const e = estadoDeCartera(o)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, paddingLeft: nivel ? `${SANGRIA_HIJA}px` : 0 }}>
      <Link href={href} prefetch={false} onClick={(ev) => ev.stopPropagation()} title={rotuloDeObra(o)}
        style={{ ...ESTILO_NOMBRE_FILA, textDecoration: 'none' }}>
        {nivel ? <span style={ESTILO_CODO}>└</span> : null}{rotuloDeObra(o)}
      </Link>
      <div style={{ fontSize: '12px', color: colorDeEstado(o) }} data-testid="estado-obra">{e.t}{nivel ? <span style={{ color: C.tenue }}> · adicional</span> : null}</div>
    </div>
  )
}

function Plazo({ o, telefono = false }: { o: FilaCartera; telefono?: boolean }) {
  const t = textoDePlazo(o)
  const color = colorDePlazo(o)
  const conDias = t.startsWith('+')
  return (
    <div style={{
      textAlign: 'right', color, fontWeight: conDias ? 500 : 400, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      fontSize: telefono ? (conDias ? '13px' : '12px') : undefined, width: telefono ? '44px' : undefined,
      fontStyle: telefono && t === 'sin plan' ? 'italic' : undefined,
    }} data-testid="plazo-obra">{t}</div>
  )
}

/** UNA FILA DE 62px de M01: nombre + «Cliente · Etapa · atraso», barra 56×4 + % + plazo de 44px. */
function FilaTelefono({ o, ir, ultima, nivel = 0 }: { o: FilaCartera; ir: () => void; ultima: boolean; nivel?: 0 | 1 }) {
  const previo = esPrevio(o)
  return (
    <div data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} data-nivel={nivel} onClick={ir} role="link" tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === 'Enter') ir() }}
      style={{
        minHeight: '62px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', cursor: 'pointer', paddingLeft: nivel ? '16px' : 0,
        borderBottom: ultima ? undefined : `1px solid ${C.borde}`, color: C.tinta,
      }}>
      <NombreTelefono o={o} nivel={nivel} />
      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
        {previo || o.avance_pct == null
          ? <span style={{ fontSize: '12px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">no se puede medir</span>
          : (
            <>
              <div style={{ width: '56px', height: '4px', borderRadius: '2px', background: C.borde, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.max(0, o.avance_pct))}%`, height: '100%', background: colorDeBarra(o) }} />
              </div>
              <span style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{o.avance_pct}%</span>
            </>
          )}
        <Plazo o={o} telefono />
      </div>
    </div>
  )
}

/** EL NOMBRE DE M01: obra (500) + «Etapa · atraso». Se exporta: el M02 lo dibuja igual en su columna fija. */
export function NombreTelefono({ o, nivel = 0, unaLinea = false }: {
  o: FilaCartera
  nivel?: 0 | 1
  /** En los 118px del M02 la sublínea no puede partirse en dos: la fila crecería y la barra se correría. */
  unaLinea?: boolean
}) {
  // El cliente ya es el encabezado del grupo: la sublínea dice la etapa (y «adicional» si lo es).
  const sub = sublineaTelefono(o, nivel ? 'adicional' : null, etapaDe(o))
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotuloDeObra(o)}</div>
      <div style={{ fontSize: '12px', color: C.tintaSuave, ...(unaLinea ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}) }}>
        {sub.texto}{sub.atraso && <> · <span style={{ color: C.neg }}>atraso</span></>}
      </div>
    </div>
  )
}
