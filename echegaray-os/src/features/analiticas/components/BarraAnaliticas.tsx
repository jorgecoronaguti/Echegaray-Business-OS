'use client'

// EL NIVEL 2 DE ANALÍTICAS: las ocho vistas a la izquierda y los tres filtros a la derecha.
//
// Los filtros escriben la URL (`aUrl`) y nada más: la página se vuelve a pedir al servidor con los
// nuevos parámetros, y la misma URL pegada en otra pestaña dibuja lo mismo. Un control que no aplica
// a la vista se APAGA con su razón en el `title` —nunca se esconde—, porque si desapareciera no se
// sabría si el número de abajo está filtrado.
//
// En el teléfono los tres botones no entran al lado de las solapas: se juntan en un ícono de 44px con
// el contador de filtros apartados, y se editan en una hoja con Cancelar/Aplicar (un cambio a medias
// no dispara tres cargas).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  aUrl, apartado, cuantosApartados, DEFECTO, ESTADOS, leerPeriodo, PRESETS, razonNoAplica, rotuloPeriodo, VISTAS,
  type Control, type EstadoObra, type Filtros,
} from '../services/filtros'

export interface OpcionObra { id: string; nombre: string; estado: 'curso' | 'terminada' | 'sinIniciar' }

const PASA: Record<EstadoObra, (e: OpcionObra['estado']) => boolean> = {
  curso: (e) => e === 'curso', terminadas: (e) => e === 'terminada', sinIniciar: (e) => e === 'sinIniciar', todas: () => true,
}

export function BarraAnaliticas({ filtros, obras }: { filtros: Filtros; obras: OpcionObra[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<Control | null>(null)
  const [hoja, setHoja] = useState(false)
  const ir = (f: Filtros) => { setAbierto(null); router.push(aUrl(f)) }
  const restablecer = { ...filtros, periodo: DEFECTO.periodo, estado: DEFECTO.estado, obras: [] }
  const n = cuantosApartados(filtros)
  return (
    <div className="sticky top-11 z-20 border-b border-line bg-surface">
      <div className="flex h-11 items-stretch gap-2 px-4 sm:px-6 lg:px-10">
        <nav className="barra-corrible flex min-w-0 flex-1 items-stretch" aria-label="Vistas de Analíticas">
          {VISTAS.map((v) => {
            const activa = v.clave === filtros.vista
            return (
              <Link key={v.clave} prefetch={false} href={aUrl({ ...filtros, vista: v.clave })}
                aria-current={activa ? 'page' : undefined} data-testid={`vista-${v.clave}`}
                className={`flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm ${activa ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                {v.rotulo}
              </Link>
            )
          })}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <MenuPeriodo filtros={filtros} abierto={abierto === 'periodo'} alternar={() => setAbierto(abierto === 'periodo' ? null : 'periodo')} ir={ir} />
          <MenuEstado filtros={filtros} obras={obras} abierto={abierto === 'estado'} alternar={() => setAbierto(abierto === 'estado' ? null : 'estado')} ir={ir} />
          <MenuObras filtros={filtros} obras={obras} abierto={abierto === 'obras'} alternar={() => setAbierto(abierto === 'obras' ? null : 'obras')} ir={ir} />
          {n > 0 ? <button type="button" onClick={() => ir(restablecer)} className="h-9 px-2 text-sm text-muted hover:text-ink">Restablecer</button> : null}
        </div>
        <button type="button" onClick={() => setHoja(true)} aria-label={`Filtros${n ? ` (${n} aplicados)` : ''}`} data-testid="filtros-telefono"
          className="relative flex w-11 shrink-0 items-center justify-center text-ink lg:hidden">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 5h14M6 10h8M8.5 15h3" /></svg>
          {n > 0 ? <span className="absolute right-1 top-1.5 flex size-4 items-center justify-center rounded-full bg-marca text-xs font-semibold text-ink">{n}</span> : null}
        </button>
      </div>
      {hoja ? <HojaFiltros filtros={filtros} obras={obras} cerrar={() => setHoja(false)} ir={(f) => { setHoja(false); ir(f) }} /> : null}
    </div>
  )
}

function Boton({ rotulo, valor, control, filtros, alternar, abierto }: {
  rotulo: string; valor: string; control: Control; filtros: Filtros; alternar: () => void; abierto: boolean
}) {
  const razon = razonNoAplica(filtros.vista, control)
  if (razon) {
    return (
      <span title={razon} data-testid={`filtro-${control}`} aria-disabled
        className="flex h-9 cursor-default items-center rounded-control border border-line px-3 text-sm text-dato-materiales">
        {rotulo} · {control === 'periodo' ? 'a la fecha' : 'no aplica'}
      </span>
    )
  }
  const fuera = apartado(filtros, control)
  return (
    <button type="button" onClick={alternar} aria-expanded={abierto} data-testid={`filtro-${control}`}
      className={`flex h-9 items-center gap-1 rounded-control border px-3 text-sm ${fuera ? 'border-marca bg-marca text-ink' : 'border-line text-ink hover:border-line-strong'}`}>
      <span className="text-muted">{rotulo} ·</span> <span className="max-w-40 truncate font-medium">{valor}</span>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg>
    </button>
  )
}

function Menu({ children }: { children: React.ReactNode }) {
  return <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-card border border-line bg-surface p-2">{children}</div>
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex h-9 w-full items-center justify-between rounded-control px-3 text-left text-sm ${activa ? 'bg-marca font-medium text-ink' : 'text-ink hover:bg-surface-sunken'}`}>
      {children}
    </button>
  )
}

type PropsMenu = { filtros: Filtros; abierto: boolean; alternar: () => void; ir: (f: Filtros) => void }

function MenuPeriodo({ filtros, abierto, alternar, ir }: PropsMenu) {
  return (
    <div className="relative">
      <Boton rotulo="Período" valor={rotuloPeriodo(filtros.periodo)} control="periodo" filtros={filtros} alternar={alternar} abierto={abierto} />
      {abierto ? <Menu><PanelPeriodo filtros={filtros} cambiar={ir} /></Menu> : null}
    </div>
  )
}

function PanelPeriodo({ filtros, cambiar }: { filtros: Filtros; cambiar: (f: Filtros) => void }) {
  const p = filtros.periodo
  const [desde, setDesde] = useState(p.tipo === 'rango' ? p.desde : '')
  const [hasta, setHasta] = useState(p.tipo === 'rango' ? p.hasta : '')
  const rango = leerPeriodo(`${desde}..${hasta}`)
  return (
    <>
      {PRESETS.map((x) => (
        <Opcion key={x.clave} activa={p.tipo === 'preset' && p.preset === x.clave} onClick={() => cambiar({ ...filtros, periodo: { tipo: 'preset', preset: x.clave } })}>{x.rotulo}</Opcion>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line px-1 pt-2">
        <label className="text-xs text-faint">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 h-9 w-full rounded-control border border-line px-2 text-sm text-ink" /></label>
        <label className="text-xs text-faint">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 h-9 w-full rounded-control border border-line px-2 text-sm text-ink" /></label>
        <button type="button" disabled={rango.tipo !== 'rango'} onClick={() => cambiar({ ...filtros, periodo: rango })}
          className="col-span-2 h-9 rounded-control border border-line text-sm text-ink hover:border-line-strong disabled:text-faint">Usar este rango</button>
      </div>
    </>
  )
}

function MenuEstado({ filtros, obras, abierto, alternar, ir }: PropsMenu & { obras: OpcionObra[] }) {
  const valor = ESTADOS.find((e) => e.clave === filtros.estado)?.rotulo ?? ''
  return (
    <div className="relative">
      <Boton rotulo="Estado" valor={valor} control="estado" filtros={filtros} alternar={alternar} abierto={abierto} />
      {abierto ? <Menu><PanelEstado filtros={filtros} obras={obras} cambiar={ir} /></Menu> : null}
    </div>
  )
}

function PanelEstado({ filtros, obras, cambiar }: { filtros: Filtros; obras: OpcionObra[]; cambiar: (f: Filtros) => void }) {
  return (
    <>
      {ESTADOS.map((e) => (
        <Opcion key={e.clave} activa={filtros.estado === e.clave} onClick={() => cambiar({ ...filtros, estado: e.clave, obras: [] })}>
          {e.rotulo}<span className="tabular-nums text-faint">{obras.filter((o) => PASA[e.clave](o.estado)).length}</span>
        </Opcion>
      ))}
    </>
  )
}

function MenuObras({ filtros, obras, abierto, alternar, ir }: PropsMenu & { obras: OpcionObra[] }) {
  const valor = filtros.obras.length === 0 ? 'Todas' : filtros.obras.length === 1 ? (obras.find((o) => o.id === filtros.obras[0])?.nombre ?? '1') : `${filtros.obras.length} obras`
  return (
    <div className="relative">
      <Boton rotulo="Obras" valor={valor} control="obras" filtros={filtros} alternar={alternar} abierto={abierto} />
      {abierto ? <Menu><PanelObras filtros={filtros} obras={obras} cambiar={ir} /></Menu> : null}
    </div>
  )
}

function PanelObras({ filtros, obras, cambiar }: { filtros: Filtros; obras: OpcionObra[]; cambiar: (f: Filtros) => void }) {
  const delEstado = obras.filter((o) => PASA[filtros.estado](o.estado))
  const alternarObra = (id: string) => {
    const s = new Set(filtros.obras)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    cambiar({ ...filtros, obras: [...s] })
  }
  return (
    <div className="max-h-80 overflow-y-auto">
      <Opcion activa={filtros.obras.length === 0} onClick={() => cambiar({ ...filtros, obras: [] })}>Todas<span className="tabular-nums text-faint">{delEstado.length}</span></Opcion>
      {delEstado.map((o) => {
        const marcada = filtros.obras.includes(o.id)
        return (
          <label key={o.id} className="flex h-9 cursor-pointer items-center gap-2 rounded-control px-3 text-sm text-ink hover:bg-surface-sunken">
            <input type="checkbox" checked={marcada} onChange={() => alternarObra(o.id)} className="size-4 accent-marca" />
            <span className="truncate">{o.nombre}</span>
          </label>
        )
      })}
    </div>
  )
}

function HojaFiltros({ filtros, obras, cerrar, ir }: { filtros: Filtros; obras: OpcionObra[]; cerrar: () => void; ir: (f: Filtros) => void }) {
  const [borrador, setBorrador] = useState(filtros)
  const seccion = (c: Control, titulo: string, cuerpo: React.ReactNode) => {
    const razon = razonNoAplica(filtros.vista, c)
    return (
      <section className="border-b border-line py-3">
        <h3 className={`mb-2 text-xs font-medium ${razon ? 'text-dato-materiales' : 'text-faint'}`}>{titulo}{razon ? ` · ${c === 'periodo' ? 'a la fecha' : 'no aplica'}` : ''}</h3>
        {razon ? <p className="text-xs text-dato-materiales">{razon}</p> : cuerpo}
      </section>
    )
  }
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface lg:hidden" role="dialog" aria-label="Filtros">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-semibold text-ink">Filtros</span>
        <button type="button" onClick={() => setBorrador({ ...borrador, periodo: DEFECTO.periodo, estado: DEFECTO.estado, obras: [] })}
          className="h-11 px-2 text-sm text-muted">Restablecer</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        {seccion('periodo', 'Período', <PanelPeriodo filtros={borrador} cambiar={setBorrador} />)}
        {seccion('estado', 'Estado de obra', <PanelEstado filtros={borrador} obras={obras} cambiar={setBorrador} />)}
        {seccion('obras', 'Obras', <PanelObras filtros={borrador} obras={obras} cambiar={setBorrador} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
        <button type="button" onClick={cerrar} className="h-11 rounded-control border border-line text-sm text-ink">Cancelar</button>
        <button type="button" onClick={() => ir(borrador)} className="h-11 rounded-control bg-marca text-sm font-medium text-ink">Aplicar</button>
      </div>
    </div>
  )
}
