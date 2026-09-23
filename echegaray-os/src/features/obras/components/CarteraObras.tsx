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
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { CuerpoGantt, SelectorEscala } from './GanttObras'
import type { EscalaCartera } from '../services/carteraGantt'
import { Ico, P } from './canon/Ico'
import { C, MONO } from './canon/tokens'
import { Hover } from './canon/Piezas'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'
import { rotuloDeObra } from '@/shared/utils/obra'
import { ETAPA_LABEL, type Etapa } from '../types'
import {
  bajadaCartera, coincideTexto, colorDeBarra, colorDeEstado, colorDePlazo, entraEnFiltro, esPrevio,
  estadoDeCartera, FILTROS_CARTERA, sublineaTelefono, textoArchivadas, textoDePlazo, textoSeMuestran,
  type FiltroCartera,
} from '../services/carteraCanon'

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
  estado: string
  etapa: string | null
  avance_pct: number | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  forecast_fin: string | null
  /** `null` = no se pudo leer. Un control que no pudo mirar no dice «no hay». */
  impedimentos: number | null
}

const GRID = 'minmax(0,1.5fr) minmax(0,.85fr) 104px 128px 78px'
/** Por debajo de esto la grilla de escritorio scrollea POR DENTRO (entre los 640px del teléfono y una
 *  ventana angosta): 310px de columnas fijas + 88px de gaps dejan a OBRA por encima de 160px. La página
 *  nunca se corre de costado. */
const MIN_TABLA = 660
const ICONO_CHIP: Record<FiltroCartera, ReactNode> = {
  todo: P.todo, curso: P.hh, atraso: P.alerta, problema: P.bloqueo, previo: P.previo,
}
const etapaDe = (o: { etapa: string | null }) => (o.etapa ? ETAPA_LABEL[o.etapa as Etapa] ?? o.etapa : null)
const clienteDe = (o: FilaCartera) => o.cliente_nombre ?? o.cliente_texto

// ═══ EL ESTADO COMPARTIDO DE LAS DOS VISTAS: buscador + chips ═══

/**
 * EL ENCABEZADO DE LA CARTERA QUEDA FIJO (dueño, 23/09/2026: «el header no puede actualizar siempre y
 * debe quedar fijo»): título, buscador, Ver y chips se pegan justo debajo de la barra de la app (44 px) y
 * la lista se desplaza debajo. Los márgenes negativos absorben el padding del contenedor para que el
 * fondo cubra de borde a borde y no se vea la lista pasar por los costados.
 */
export const ENCABEZADO_FIJO: CSSProperties = {
  position: 'sticky', top: '44px', zIndex: 20, background: C.superficie, display: 'flex', flexDirection: 'column', gap: '20px',
  margin: '-26px -30px 0', padding: '26px 30px 14px', borderBottom: `1px solid ${C.borde}`,
}
export const ENCABEZADO_FIJO_TELEFONO: CSSProperties = {
  position: 'sticky', top: '44px', zIndex: 20, background: C.superficie, display: 'flex', flexDirection: 'column', gap: '18px',
  margin: '-16px -16px 0', padding: '16px 16px 12px', borderBottom: `1px solid ${C.borde}`,
}

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
      <a href={href} onClick={alClic} data-testid={`nav-vistas-obras-${k}`} aria-current={activo ? 'page' : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: telefono ? '5px' : '6px', fontSize: '12.5px',
          paddingBottom: '2px', textDecoration: 'none', color: activo ? C.tinta : C.tintaSuave,
          fontWeight: activo ? 500 : 400, boxShadow: activo ? `inset 0 -1.5px 0 ${C.tinta}` : undefined,
        }}><Ico d={d} s={12} />{t}</a>
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
    <div style={telefono
      ? { display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', paddingRight: '16px', scrollbarWidth: 'none' }
      : { display: 'flex', alignItems: 'center', gap: '18px', fontSize: '12.5px' }}
      data-testid="filtros-obras">
      {chips.map((f) => {
        const activo = filtro === f.k
        const n = f.k === 'problema' && sinImpedimentos ? null : cuentas[f.k]
        return (
          <button key={f.k} type="button" onClick={() => setFiltro(f.k)} aria-pressed={activo}
            data-testid={`filtro-${f.k}`} data-activo={activo ? '1' : undefined}
            title={f.k === 'problema' && sinImpedimentos ? 'No se pudieron leer los impedimentos' : f.tip}
            style={telefono ? {
              height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px',
              whiteSpace: 'nowrap', border: `1px solid ${activo ? C.grafito : C.borde}`, borderRadius: '6px',
              fontSize: '12.5px', fontWeight: activo ? 500 : 400, color: activo ? C.tinta : C.tintaSuave,
              background: C.superficie, cursor: 'pointer', font: 'inherit', fontFamily: 'inherit', flexShrink: 0,
            } : {
              display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', padding: 0, paddingBottom: '2px',
              background: 'none', font: 'inherit', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer',
              color: activo ? C.tinta : C.tintaSuave, fontWeight: activo ? 500 : 400,
              boxShadow: activo ? `inset 0 -1.5px 0 ${C.grafito}` : undefined,
            }}>
            <Ico d={ICONO_CHIP[f.k]} s={12} />{f.t}
            {n != null && (
              <span style={telefono
                ? { fontFamily: MONO, fontSize: '11px', color: C.tenue }
                : { color: C.tenue, fontWeight: 400 }}>{n}</span>
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
    <Link href="/obras/nueva" prefetch={false} data-testid="alta-obra-nueva" style={{
      height: telefono ? '48px' : '32px', padding: telefono ? 0 : '0 14px', borderRadius: '6px', background: C.marca,
      color: C.grafito, fontSize: telefono ? '14px' : '13px', fontWeight: 600, display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: telefono ? '8px' : '7px', textDecoration: 'none', whiteSpace: 'nowrap',
    }}><Ico d={P.mas} s={telefono ? 15 : 13} />Nueva obra</Link>
  )
  if (!telefono) return boton
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie,
      borderTop: `1px solid ${C.borde}`, zIndex: 19,
    }}>{boton}</div>
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
  const [vista, setVista] = useState<VistaCartera>(vistaInicial)
  const [escala, setEscala] = useState<EscalaCartera>('trimestre')
  const esGantt = vista === 'gantt'
  const archivadasTexto = textoArchivadas(archivadas)

  const buscador = (
    <div style={{
      width: telefono ? undefined : '230px', flex: telefono ? 1 : undefined, height: telefono ? '44px' : '32px',
      padding: telefono ? '0 12px' : '0 11px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
      background: C.superficie, display: 'flex', alignItems: 'center', gap: telefono ? '8px' : '7px', color: C.tenue,
    }}>
      <Ico d={P.buscar} s={telefono ? 14 : 13} />
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar obra o cliente"
        aria-label="Buscar obra o cliente" data-testid="buscar-obra"
        style={{
          border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', width: '100%', padding: 0,
          fontSize: telefono ? '13.5px' : '13px', color: C.tinta,
        }} />
      {q.length > 0 && (
        <button type="button" onClick={limpiar} aria-label="Limpiar la búsqueda" data-testid="buscar-obra-limpiar"
          style={{ display: 'flex', color: C.tenue, cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>
          <Ico d={P.cerrar} s={13} />
        </button>
      )}
    </div>
  )

  const pieArchivadas = archivadasTexto && (
    <div style={{ fontSize: '12px', color: C.tenue }} data-testid="pie-archivadas">
      {conArchivadas
        ? <>Se muestran también las {archivadas} archivadas · <Link prefetch={false} href="/obras" style={{ color: C.tenue }}>Ocultarlas</Link></>
        : <>{archivadasTexto} · <Link prefetch={false} href="/obras?archivadas=1" data-testid="ver-archivadas" style={{ color: C.tenue }}>Verlas</Link></>}
    </div>
  )

  const vacio = lista.length === 0 && (
    <div style={{ padding: '26px 0', fontSize: '12.5px', color: C.tintaSuave }}>
      Nada coincide.{' '}
      <button type="button" onClick={limpiar} data-testid="ver-todo"
        style={{ color: C.tinta, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', border: 'none', background: 'none', font: 'inherit', padding: 0 }}>
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
        {esGantt ? <CuerpoGantt lista={lista} total={obras.length} hoyIso={hoyIso} telefono escala={escala} /> : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lista.map((o, i) => <FilaTelefono key={o.obra_id} o={o} ultima={i === lista.length - 1} ir={() => router.push(`/obras/${o.obra_id}`)} />)}
            {vacio}
          </div>
        )}
        {sinDatoLinea}
        {pieArchivadas}
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
          <div style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta }}>Obras</div>
          <div style={{ fontSize: '13px', color: C.tintaSuave }} data-testid="bajada-cartera">{bajadaCartera(obras)}</div>
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

      {esGantt ? <CuerpoGantt lista={lista} total={obras.length} hoyIso={hoyIso} telefono={false} escala={escala} /> : (<>
      <div style={{ overflowX: 'auto' }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: `${MIN_TABLA}px` }}>
        <div style={{
          display: 'grid', gridTemplateColumns: GRID, gap: '22px', height: '40px', alignItems: 'center',
          borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em',
          color: C.tenue, textTransform: 'uppercase',
        }}>
          <div>Obra</div><div>Cliente</div><div>Etapa</div><div>Avance</div><div style={{ textAlign: 'right' }}>Plazo</div>
        </div>
        {lista.map((o) => <Fila key={o.obra_id} o={o} ir={() => router.push(`/obras/${o.obra_id}`)} />)}
        {vacio}
      </div></div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '26px', fontSize: '12.5px', color: C.tintaSuave }} data-testid="pie-cartera">
        <span>{textoSeMuestran(lista.length, obras.length)}</span>
        <span>
          El atraso es <span style={{ fontFamily: MONO, fontSize: '12px' }}>forecast_fin − fecha_fin_plan</span>, nunca negativo.
          Sin las dos fechas: sin plan, no cero.
        </span>
      </div>
      </>)}
      {sinDatoLinea}
      {pieArchivadas}
    </div>
  )
}

/** UNA FILA DE 64px del 01: nombre + estado en color, cliente, etapa, barra 64×4 + %, plazo. */
function Fila({ o, ir }: { o: FilaCartera; ir: () => void }) {
  const e = estadoDeCartera(o)
  const previo = esPrevio(o)
  const cliente = clienteDe(o)
  return (
    <Hover data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} onClick={ir}
      base={{
        display: 'grid', gridTemplateColumns: GRID, gap: '22px', height: '64px', alignItems: 'center',
        borderBottom: `1px solid ${C.borde}`, fontSize: '13.5px', cursor: 'pointer', color: C.tinta,
      }}
      hover={{ background: C.tenueFondo }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <Link href={`/obras/${o.obra_id}`} prefetch={false} onClick={(ev) => ev.stopPropagation()}
          style={{ fontWeight: 500, color: C.tinta, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rotuloDeObra(o)}
        </Link>
        <div style={{ fontSize: '12px', color: colorDeEstado(o) }} data-testid="estado-obra">{e.t}</div>
      </div>
      {/* SIN FICHA NO HAY ENLACE: un link a `/clientes/null` es una promesa que termina en 404. */}
      <div style={{ color: C.tintaMedia, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {o.cliente_slug && o.cliente_nombre
          ? <Link href={`/clientes/${o.cliente_slug}`} prefetch={false} onClick={(ev) => ev.stopPropagation()} style={{ color: C.tintaMedia, textDecoration: 'none' }}>{o.cliente_nombre}</Link>
          : cliente ?? <span style={{ color: C.tenue }} data-nulo="">sin cliente declarado</span>}
      </div>
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
function FilaTelefono({ o, ir, ultima }: { o: FilaCartera; ir: () => void; ultima: boolean }) {
  const previo = esPrevio(o)
  const sub = sublineaTelefono(o, clienteDe(o), etapaDe(o))
  return (
    <div data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} onClick={ir} role="link" tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === 'Enter') ir() }}
      style={{
        minHeight: '62px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', cursor: 'pointer',
        borderBottom: ultima ? undefined : `1px solid ${C.borde}`, color: C.tinta,
      }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotuloDeObra(o)}</div>
        <div style={{ fontSize: '12px', color: C.tintaSuave }}>
          {sub.texto}{sub.atraso && <> · <span style={{ color: C.neg }}>atraso</span></>}
        </div>
      </div>
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
