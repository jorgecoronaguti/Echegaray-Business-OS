'use client'

// D02 · INVENTARIO — lista y ficha, lado a lado; selección múltiple con acciones.
//
// Los filtros viven en la URL (se comparten y sobreviven a un refresco); la selección vive en la
// pantalla. La ficha abierta también va en la URL (`?activo=AMO-007`): es la que abre `/h/<código>`.

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { candidatos, categorias, cuentaPorEstado, filtrar, queryDe, sugerencias, totales, type Filtros, type FiltroClase, type FiltroEstado } from '../logica/inventario'
import { ETIQUETA_ESTADO_CORTA, MOTIVO_BAJA, TONO_ESTADO, quienLaMovio, rotuloUbicacion, textoVisto, vistoEn, rotuloRodado, type Parque } from '../logica/parque'
import { editarActivoAction } from '../services/acciones'
import type { Activo } from '../types'
import { useHerramientas } from './Espacio'
import { Ficha } from './Ficha'
import { IcoEquipo, IcoRodado, IcoTaller } from './iconos'
import { COLOR_TONO, MONO, SUPERFICIE, V, eyebrow, vacio, botonSecundario } from './estilo'
import { diaMes } from './formato'

const COLS = '28px minmax(0,1.5fr) 120px 150px minmax(0,1fr) 130px 70px'

const CLASES: { v: FiltroClase; t: string; ico?: ReactNode }[] = [
  { v: 'herramienta', t: 'Herramientas', ico: <IcoTaller tam={13} /> },
  { v: 'equipo', t: 'Equipos', ico: <IcoEquipo tam={13} /> },
  { v: 'rodado', t: 'Rodados', ico: <IcoRodado tam={13} /> },
  { v: 'todo', t: 'Todo' },
]
const ESTADOS: { v: FiltroEstado; t: string; warn?: boolean }[] = [
  { v: 'todos', t: 'Todos' }, { v: 'operativo', t: 'Operativos' },
  { v: 'requiere_mantenimiento', t: 'Requieren mant.', warn: true }, { v: 'fuera_servicio', t: 'Fuera de servicio' },
  { v: 'reparacion_externa', t: 'En reparación' }, { v: 'baja', t: 'Bajas' },
]
const ESPECIAL: Record<string, string> = {
  asumido: 'Estado asumido al importar: nadie los revisó',
  alta_desde_obra: 'Altas desde obra sin revisar',
  repetidos: 'Nombres repetidos: pueden ser la misma herramienta',
  sin_etiqueta: 'Sin etiqueta impresa',
}

export function VistaInventario({ filtros, activo }: { filtros: Filtros; activo: string | null }) {
  const { parque, abrir, avisar, refrescar, abierto: panel } = useHerramientas()
  // Con un panel abierto (mover, alta, reportar…) el panel ocupa la derecha: la ficha se esconde para
  // que el listado no quede apretado entre las dos columnas.
  const conPanel = !!panel && panel.tipo !== 'baja'
  const router = useRouter()
  const ruta = usePathname()
  const [sel, setSel] = useState<string[]>([])
  const [cambiandoCat, setCambiandoCat] = useState<string | null>(null)

  const ir = (f: Partial<Filtros>, a: string | null = activo) => router.replace(`${ruta}${queryDe({ ...filtros, ...f, activo: a })}`, { scroll: false })
  const base = useMemo(() => candidatos(parque, { ...filtros, estado: 'todos' }), [parque, filtros])
  const cuentas = cuentaPorEstado(base)
  const lista = useMemo(() => filtrar(parque, filtros), [parque, filtros])
  const porClase = (c: FiltroClase) => candidatos(parque, { ...filtros, clase: c, estado: 'todos' }).filter((a) => a.estado !== 'baja').length
  const cats = categorias(parque.activos)
  const abierto = activo ? parque.activos.find((x) => x.codigo === activo) ?? null : null
  const lugares = parque.ubicaciones.filter((u) => !u.archivada && u.tipo !== 'obra' && u.tipo !== 'rodado')
  const obrasConAlgo = parque.ubicaciones.filter((u) => u.tipo === 'obra' && parque.activos.some((a) => a.ubicacion_id === u.id))
  const rodados = parque.activos.filter((a) => a.clase === 'rodado' && a.estado !== 'baja')

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const vivosSel = sel.filter((id) => parque.activoPorId.get(id)?.estado !== 'baja')

  async function cambiarCategoria() {
    if (!cambiandoCat) return
    for (const id of vivosSel) {
      const r = await editarActivoAction({ activo: id, datos: { categoria: cambiandoCat } })
      if (!r.ok) return avisar(r.error)
    }
    avisar(`${vivosSel.length} ${vivosSel.length === 1 ? 'activo pasó' : 'activos pasaron'} a «${cambiandoCat || 'sin categoría'}».`)
    setCambiandoCat(null)
    refrescar()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 700 }}>
      <div style={{ flex: 1, minWidth: 0, padding: '0 24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="inventario">
        {/* LA CABECERA FIJA (dueño, 22/09): clases, estados, buscador, filtros, la barra de selección y los
            rótulos de columna quedan arriba mientras se recorre el listado. 44 del header de la app + 39 de
            las solapas del módulo. Los rótulos van acá adentro para que no se separen de los filtros. */}
        <div data-testid="cabecera-inventario" style={{ position: 'sticky', top: 83, zIndex: 10, background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: '13px', flexWrap: 'wrap' }}>
          {CLASES.map((c) => {
            const on = filtros.clase === c.v
            return (
              <button key={c.v} type="button" onClick={() => ir({ clase: c.v })} data-testid={`clase-${c.v}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: on ? 500 : 400, color: on ? V.tinta : V.apagado, boxShadow: on ? `inset 0 -1.5px 0 ${V.tinta}` : 'none', paddingBottom: 3 }}>
                {c.ico}{c.t} <span style={{ color: V.tenue, fontWeight: 400 }}>{porClase(c.v)}</span>
              </button>
            )
          })}
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" onClick={() => abrir({ tipo: 'mover', ids: sel.filter((id) => parque.activoPorId.get(id)?.estado !== 'baja') })} data-testid="armar-envio"
              style={{ height: 28, fontSize: '12.5px', padding: '0 12px', borderRadius: 6, background: V.marca, color: V.grafito, fontWeight: 600, marginRight: 8 }}>
              Armar envío a obra
            </button>
            <button type="button" onClick={() => abrir({ tipo: 'alta' })} style={{ ...botonSecundario, height: 28, fontSize: '12.5px', padding: '0 10px' }} data-testid="nuevo-activo">
              Nuevo activo
            </button>
          </div>
        </div>

        {filtros.especial && (
          <div style={{ fontSize: '12.5px', display: 'flex', gap: 10, alignItems: 'center', color: V.tintaSuave }}>
            {ESPECIAL[filtros.especial]}
            <button type="button" onClick={() => ir({ especial: null })} style={{ color: V.apagado, textDecoration: 'underline' }}>ver todo</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '12.5px', flexWrap: 'wrap' }}>
            {ESTADOS.map((e) => {
              const on = filtros.estado === e.v
              return (
                <button key={e.v} type="button" onClick={() => ir({ estado: e.v })} data-testid={`estado-${e.v}`}
                  style={{ fontWeight: on ? 500 : 400, color: on ? V.tinta : e.warn && cuentas[e.v] ? V.warn : V.apagado, boxShadow: on ? `inset 0 -1.5px 0 ${V.grafito}` : 'none', paddingBottom: 2 }}>
                  {e.t} <span style={{ color: V.tenue, fontWeight: 400 }}>{cuentas[e.v]}</span>
                </button>
              )
            })}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BuscadorInventario parque={parque} valor={filtros.q} onBuscar={(q) => ir({ q })} onElegir={(codigo) => ir({}, codigo)} />
            <select aria-label="Ubicación" value={filtros.ubicacion ?? ''} onChange={(e) => ir({ ubicacion: e.target.value || null })} style={selectFiltro} data-testid="filtro-ubicacion">
              <option value="">Ubicación: todas</option>
              <option value="sin">Sin ubicación cargada</option>
              <option value="obras">Cualquier obra</option>
              <option value="tipo:taller">Taller</option>
              <option value="tipo:servicio_tecnico">Servicio técnico</option>
              <option value="tipo:rodado">Arriba de un rodado</option>
              <option value="tipo:tercero">Terceros</option>
              {lugares.map((u) => <option key={u.id} value={u.id}>{rotuloUbicacion(parque, u.id)}</option>)}
              {obrasConAlgo.map((u) => <option key={u.id} value={u.id}>{rotuloUbicacion(parque, u.id)}</option>)}
              {rodados.map((r) => { const u = parque.ubicaciones.find((x) => x.activo_id === r.id); return u ? <option key={u.id} value={u.id}>{rotuloRodado(r)}</option> : null })}
            </select>
            <select aria-label="Categoría" value={filtros.categoria ?? ''} onChange={(e) => ir({ categoria: e.target.value || null })} style={selectFiltro}>
              <option value="">Categoría: todas</option>
              {cats.haySin && <option value="sin">Sin categoría</option>}
              {cats.valores.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {sel.length > 0 && (
          <div data-testid="barra-seleccion" style={{ minHeight: 38, display: 'flex', alignItems: 'center', gap: 16, padding: '0 12px', background: SUPERFICIE, border: `1px solid ${V.linea}`, borderRadius: 6, fontSize: '12.5px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500 }}>{sel.length === 1 ? '1 seleccionada' : `${sel.length} seleccionadas`}</span>
            {vivosSel.length > 0 && (
              <button type="button" onClick={() => abrir({ tipo: 'mover', ids: vivosSel })} data-testid="mover-seleccion"
                style={{ height: 28, padding: '0 12px', borderRadius: 6, background: V.marca, color: V.grafito, fontWeight: 600 }}>
                Mover o asignar a obra
              </button>
            )}
            {vivosSel.length > 0 && <button type="button" onClick={() => abrir({ tipo: 'reportar', ids: vivosSel })} style={{ color: V.tintaSuave }}>Reportar problema</button>}
            {vivosSel.length > 0 && (
              <button type="button" style={{ color: V.tintaSuave }} data-testid="imprimir-seleccion"
                onClick={() => router.push(`/herramientas/etiquetas?codigos=${encodeURIComponent(vivosSel.map((id) => parque.activoPorId.get(id)!.codigo).join(','))}`)}>
                Imprimir QR
              </button>
            )}
            {vivosSel.length > 0 && (cambiandoCat == null ? (
              <button type="button" onClick={() => setCambiandoCat('')} style={{ color: V.tintaSuave }}>Cambiar categoría</button>
            ) : (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <select autoFocus value={cambiandoCat} onChange={(e) => setCambiandoCat(e.target.value)} data-testid="categoria-masiva" style={{ height: 26, border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: '0 8px', fontSize: '12.5px' }}>
                  <option value="">Elegí la categoría</option>
                  {(parque.categorias ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={cambiarCategoria} style={{ fontWeight: 500 }}>Aplicar</button>
                <button type="button" onClick={() => setCambiandoCat(null)} style={{ color: V.apagado }}>cancelar</button>
              </span>
            ))}
            <button type="button" onClick={() => setSel([])} style={{ marginLeft: 'auto', color: V.apagado }}>Quitar selección</button>
          </div>
        )}

          <TotalesInventario t={totales(parque, lista)} activo={filtros.ubicacion} onFiltrar={(u) => ir({ ubicacion: filtros.ubicacion === u ? null : u })} />
          <div role="table" aria-label="Inventario (rótulos)">
          <div role="row" style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 16, height: 36, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
            <div>
              <input type="checkbox" aria-label="Seleccionar todos" checked={lista.length > 0 && lista.every((a) => sel.includes(a.id))}
                onChange={(e) => setSel(e.target.checked ? lista.map((a) => a.id) : [])} style={{ accentColor: V.grafito }} />
            </div>
            <div>Activo</div><div>Categoría</div><div>Estado</div><div>Ubicación actual</div><div>Quién la movió</div><div style={{ textAlign: 'right' }}>Visto</div>
          </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: -18 }} role="table" aria-label="Inventario">
          {lista.length === 0 && (
            <div style={{ fontSize: '13.5px', color: V.apagado, padding: '18px 0' }} data-testid="inventario-vacio">
              {parque.activos.length === 0 ? 'Todavía no hay activos cargados. Se cargan con «Nuevo activo».' : 'Nada coincide con estos filtros.'}
            </div>
          )}
          {lista.map((a) => (
            <Fila key={a.id} parque={parque} a={a} marcada={sel.includes(a.id)} abierta={abierto?.id === a.id}
              onMarcar={() => toggle(a.id)} onAbrir={() => ir({}, a.codigo)} />
          ))}
        </div>
        <div style={{ fontSize: '12.5px', color: V.apagado }}>
          {lista.length} de {base.length}{lista.some((a) => a.estado === 'baja') ? ' · las bajas, atenuadas.' : '.'}
        </div>
      </div>

      <div style={{ width: 2, background: V.linea }} />
      {/* La ficha sólo ocupa lugar cuando hay una abierta, y se cierra con la × (dueño, 22/09). */}
      {!conPanel && activo && (
      <div style={{ width: 430, flexShrink: 0, padding: '22px 24px 28px', background: '#FFFFFF', position: 'sticky', top: 83, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 83px)', overflowY: 'auto', borderLeft: `1px solid ${V.linea}` }}>
        <button type="button" onClick={() => ir({}, null)} aria-label="Cerrar la ficha" data-testid="cerrar-ficha"
          style={{ position: 'absolute', top: 14, right: 16, width: 28, height: 28, borderRadius: 6, fontSize: '18px', color: V.tenue, lineHeight: 1 }}>×</button>
        {abierto ? <Ficha id={abierto.id} /> : (
          <div style={{ fontSize: '13px', color: V.tenue, paddingTop: 4 }} data-testid="ficha-vacia">{activo} no está en el inventario.</div>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * El buscador del inventario, al lado de los filtros (dueño, 22/09: «tiene q haber un buscador de
 * herramientas al lado de el filtro de ubicacion»). Busca por nombre, código, categoría, patente o
 * ubicación, igual que el `q` de la URL: el texto se escribe acá y se aplica a los 200 ms, sin
 * recargar la página.
 */
const TIPO_TOTAL: Record<string, string> = {
  taller: 'Taller', obra: 'Obras', rodado: 'En rodados', servicio_tecnico: 'Servicio técnico', tercero: 'Terceros', sin: 'Sin ubicación',
}

/** Los totales de lo que se ve, arriba del listado: cambian con cada filtro y con cada letra del buscador. */
function TotalesInventario({ t, activo, onFiltrar }: { t: ReturnType<typeof totales>; activo: string | null; onFiltrar: (u: string) => void }) {
  return (
    <div data-testid="totales-inventario" style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', fontSize: '12.5px', color: V.apagado, marginBottom: -8 }}>
      <span><b style={{ fontSize: '14px', color: V.tinta, fontWeight: 600 }}>{t.activos}</b> {t.activos === 1 ? 'activo' : 'activos'}</span>
      {t.unidades !== t.activos && <span><b style={{ color: V.tinta, fontWeight: 600 }}>{t.unidades}</b> unidades</span>}
      {/* Cada total es un filtro (dueño, 22/09: «le hago click a eso y no me lleva a ninguna herram»).
          Un segundo clic lo saca. */}
      {t.porTipo.map((x) => {
        const u = x.tipo === 'sin' ? 'sin' : x.tipo === 'obra' ? 'obras' : `tipo:${x.tipo}`
        const on = activo === u
        return (
          <button key={x.tipo} type="button" onClick={() => onFiltrar(u)} data-testid={`total-${x.tipo}`} title={on ? 'Quitar el filtro' : `Ver sólo ${TIPO_TOTAL[x.tipo].toLowerCase()}`}
            style={{ color: x.tipo === 'sin' ? V.warn : V.apagado, textDecoration: on ? 'none' : 'underline', textDecorationColor: V.linea, textUnderlineOffset: 3, fontWeight: on ? 600 : 400, background: on ? V.hover : 'transparent', borderRadius: 4, padding: on ? '1px 6px' : 0 }}>
            {TIPO_TOTAL[x.tipo]} <b style={{ color: x.tipo === 'sin' ? V.warn : V.tintaSuave, fontWeight: 500 }}>{x.activos}</b>
          </button>
        )
      })}
    </div>
  )
}

function BuscadorInventario({ parque, valor, onBuscar, onElegir }: {
  parque: Parque
  valor: string
  onBuscar: (q: string) => void
  onElegir: (codigo: string) => void
}) {
  const [texto, setTexto] = useState(valor)
  const [abierto, setAbierto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  // Si la URL cambia desde afuera (el buscador del menú, «ver todo»), el campo la sigue. Mientras se
  // tipea, la URL recibe el texto recortado: no se le borra a nadie el espacio que acaba de escribir.
  const [previo, setPrevio] = useState(valor)
  if (valor !== previo) {
    setPrevio(valor)
    if (valor !== texto.trim()) setTexto(valor)
  }
  useEffect(() => {
    const limpio = texto.trim()
    if (limpio === valor) return
    const t = setTimeout(() => onBuscar(limpio), 200)
    return () => clearTimeout(t)
  }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Las opciones salen del parque que ya está en pantalla: aparecen con cada tecla, sin ir a la base.
  const opciones = useMemo(() => sugerencias(parque, texto), [parque, texto])
  const visible = abierto && texto.trim().length > 0
  const elegir = (a: Activo) => { setAbierto(false); onElegir(a.codigo) }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ ...selectFiltro, display: 'flex', alignItems: 'center', gap: 6, width: 240, maxWidth: 'none' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={V.tenue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" />
        </svg>
        <input
          type="search" value={texto} placeholder="Buscar herramienta o código"
          aria-label="Buscar herramienta" data-testid="buscar-inventario" role="combobox"
          aria-expanded={visible} aria-controls="sugerencias-inventario" aria-autocomplete="list" autoComplete="off"
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setMarcado(0) }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (!visible || opciones.length === 0) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((m) => Math.min(m + 1, opciones.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((m) => Math.max(m - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); elegir(opciones[marcado]) }
            else if (e.key === 'Escape') setAbierto(false)
          }}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontSize: '12.5px', color: V.tinta, background: 'transparent' }}
        />
      </div>
      {visible && (
        <div id="sugerencias-inventario" role="listbox" data-testid="sugerencias-inventario"
          style={{ position: 'absolute', top: 32, left: 0, width: 360, zIndex: 30, background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, boxShadow: '0 6px 18px rgba(31,31,30,.08)', padding: '4px 0' }}>
          {opciones.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '12.5px', color: V.apagado }}>Nada coincide con «{texto.trim()}».</div>
          ) : opciones.map((a, i) => (
            <button key={a.id} type="button" role="option" aria-selected={i === marcado}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setMarcado(i)} onClick={() => elegir(a)}
              style={{ display: 'flex', width: '100%', alignItems: 'baseline', gap: 10, padding: '7px 12px', textAlign: 'left', background: i === marcado ? V.hover : 'transparent' }}>
              <span style={{ fontSize: '13px', color: V.tinta, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
              <span style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>{a.codigo}</span>
              <span style={{ fontSize: '12px', color: V.apagado, whiteSpace: 'nowrap' }}>{rotuloUbicacion(parque, a.ubicacion_id) ?? 'sin ubicación'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const selectFiltro = {
  height: 28, padding: '0 8px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '12.5px', color: V.tintaSuave, background: '#FFFFFF', maxWidth: 220,
}

function Fila({ parque, a, marcada, abierta, onMarcar, onAbrir }: { parque: Parque; a: Activo; marcada: boolean; abierta: boolean; onMarcar: () => void; onAbrir: () => void }) {
  const baja = a.estado === 'baja'
  const quien = quienLaMovio(parque, a.id)
  const visto = vistoEn(parque, a.id)
  const tono = COLOR_TONO[TONO_ESTADO[a.estado]]
  return (
    <div role="row" data-testid="fila-activo" data-codigo={a.codigo} onClick={onAbrir} className="cursor-pointer hover:bg-surface-quiet"
      style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, minHeight: 52, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '13.5px', background: abierta ? SUPERFICIE : undefined, opacity: baja ? 0.6 : 1, padding: '4px 0' }}>
      <div onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`Seleccionar ${a.nombre}`} checked={marcada} onChange={onMarcar} style={{ width: 14, height: 14, accentColor: V.grafito }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{a.nombre}{a.patente && <span style={{ fontFamily: MONO, fontSize: '11px', color: V.tenue, fontWeight: 400 }}> {a.patente}</span>}{a.cantidad > 1 && <span data-testid="cantidad-lote" style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: V.hover, fontSize: '11.5px', color: V.tintaSuave, fontWeight: 500 }}>× {a.cantidad}</span>}</div>
        <div style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>
          {a.codigo}{a.alta_desde_obra ? ' · alta desde obra' : ''}
        </div>
      </div>
      <div style={a.categoria ? { color: V.tintaSuave } : vacio}>{a.categoria ?? 'sin categoría'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: baja ? V.tintaSuave : tono }}>
        {!baja && a.estado !== 'fuera_servicio' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono, flexShrink: 0 }} />}
        {baja ? `Baja · ${MOTIVO_BAJA[a.baja_motivo ?? ''] ?? ''} ${a.baja_en ? diaMes(a.baja_en) : ''}` : ETIQUETA_ESTADO_CORTA[a.estado]}
      </div>
      <div style={a.ubicacion_id ? { color: V.tintaSuave } : vacio}>
        {baja && a.ubicacion_id ? `última: ${rotuloUbicacion(parque, a.ubicacion_id)}` : rotuloUbicacion(parque, a.ubicacion_id)}
      </div>
      <div style={quien ? { color: V.apagado } : vacio}>{quien ?? 'sin registro'}</div>
      <div style={{ textAlign: 'right', ...(visto ? { color: V.apagado } : vacio) }}>{textoVisto(visto)}</div>
    </div>
  )
}
