'use client'

// EL NIVEL 2 DE ANALÍTICAS: las cinco vistas a la izquierda y los tres filtros a la derecha.
//
// Medidas del diseño aprobado (v6): fila de 38 px sobre #FAFAF8, solapa activa con regla grafito,
// filtros como texto compacto `Rótulo Valor ▾` que sólo se pintan de amarillo cuando se apartan del
// defecto. Un control que no aplica a la vista se APAGA con su razón en el `title` —nunca se esconde—,
// porque si desapareciera no se sabría si el número de abajo está filtrado.
//
// Los filtros escriben la URL (`aUrl`) y nada más: la página se vuelve a pedir al servidor, y la misma
// URL pegada en otra pestaña dibuja lo mismo. Obras se eligen de a varias y se aplican con «Listo»: un
// pedido por casilla serían diez cargas para elegir diez obras.
//
// En el teléfono los tres botones no entran al lado de las solapas: se juntan en un ícono de 44 px con
// el contador de filtros apartados, y se editan en una hoja con Cancelar/Aplicar.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { aCorta, deCorta } from '../services/fechaCorta'
import {
  aUrl, apartado, cuantosApartados, DEFECTO, ESTADOS, leerPeriodo, PRESETS, razonNoAplica, rotuloPeriodo, VISTAS,
  type Control, type EstadoObra, type Filtros,
} from '../services/filtros'

export interface OpcionObra { id: string; nombre: string; cliente: string; estado: 'curso' | 'terminada' | 'sinIniciar' }

const PASA: Record<EstadoObra, (e: OpcionObra['estado']) => boolean> = {
  curso: (e) => e !== 'terminada', terminadas: (e) => e === 'terminada', sinIniciar: (e) => e === 'sinIniciar', todas: () => true,
}

const Flecha = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" className="block" aria-hidden><path d="M2.5 4l2.5 2.5L7.5 4" fill="none" className="stroke-faint" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Tilde = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" className="block" aria-hidden><path d="M2 5.3l2.1 2.1L8 3.2" fill="none" className="stroke-accent" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

export function BarraAnaliticas({ filtros, obras }: { filtros: Filtros; obras: OpcionObra[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<Control | null>(null)
  const [hoja, setHoja] = useState(false)
  const ir = (f: Filtros) => { setAbierto(null); router.push(aUrl(f)) }
  const alternar = (c: Control) => () => setAbierto(abierto === c ? null : c)
  const restablecer = { ...filtros, periodo: DEFECTO.periodo, estado: DEFECTO.estado, obras: [] }
  const n = cuantosApartados(filtros)
  return (
    <div className="sticky top-11 z-20 border-b border-line bg-surface-quiet">
      {abierto ? <div className="fixed inset-0 z-10" onClick={() => setAbierto(null)} aria-hidden /> : null}
      <div className="relative z-20 flex h-11 items-stretch pl-2 pr-0 lg:h-[38px] lg:px-[22px]">
        <nav className="barra-corrible flex min-w-0 flex-1 items-stretch" aria-label="Vistas de Analíticas">
          {VISTAS.map((v) => {
            const activa = v.clave === filtros.vista
            return (
              <Link key={v.clave} prefetch={false} href={aUrl({ ...filtros, vista: v.clave })}
                aria-current={activa ? 'page' : undefined} data-testid={`vista-${v.clave}`}
                className={`flex shrink-0 items-center whitespace-nowrap px-[11px] text-[12.5px] ${v.clave === 'obras' ? 'mr-3.5' : ''} ${activa ? 'font-medium text-ink shadow-[inset_0_-2px_0_rgb(var(--os-accent-rgb))]' : 'text-muted hover:text-ink'}`}>
                {v.rotulo}
              </Link>
            )
          })}
        </nav>
        <div className="mr-2.5 hidden items-center gap-0.5 lg:flex">
          <div className="relative">
            <Boton rotulo="Período" valor={rotuloPeriodo(filtros.periodo)} apagado="a la fecha" control="periodo" filtros={filtros} alternar={alternar('periodo')} abierto={abierto === 'periodo'} />
            {abierto === 'periodo' ? <Menu ancho="w-[280px]"><PanelPeriodo filtros={filtros} cambiar={ir} /></Menu> : null}
          </div>
          <div className="relative">
            <Boton rotulo="Estado" valor={ESTADOS.find((e) => e.clave === filtros.estado)?.rotulo ?? ''} control="estado" filtros={filtros} alternar={alternar('estado')} abierto={abierto === 'estado'} />
            {abierto === 'estado' ? <Menu ancho="w-[200px]"><div className="p-1.5"><PanelEstado filtros={filtros} obras={obras} cambiar={ir} /></div></Menu> : null}
          </div>
          <div className="relative">
            <Boton rotulo="Obras" valor={valorObras(filtros, obras)} apagado="todas" control="obras" filtros={filtros} alternar={alternar('obras')} abierto={abierto === 'obras'} />
            {abierto === 'obras' ? <Menu ancho="w-[340px]"><PanelObras filtros={filtros} obras={obras} aplicar={ir} /></Menu> : null}
          </div>
          {n > 0 ? <button type="button" onClick={() => ir(restablecer)} className="h-[26px] px-2 text-xs text-muted hover:text-ink">Restablecer</button> : null}
        </div>
        <button type="button" onClick={() => setHoja(true)} aria-label={`Filtros${n ? ` (${n} aplicados)` : ''}`} data-testid="filtros-telefono"
          className="relative flex w-11 shrink-0 items-center justify-center text-ink lg:hidden">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 5h14M6 10h8M8.5 15h3" /></svg>
          {n > 0 ? <span className="absolute right-1 top-1.5 flex size-4 items-center justify-center rounded-full bg-marca text-xs font-semibold text-ink">{n}</span> : null}
        </button>
      </div>
      {/* LA HOJA VA AL BODY: adentro de esta barra `sticky` queda atrapada en su contexto de apilado y el
          header global (z-30) le pasaba por encima, tapando «Restablecer» (captura 390, 17/09/2026). */}
      {hoja ? createPortal(<HojaFiltros filtros={filtros} obras={obras} cerrar={() => setHoja(false)} ir={(f) => { setHoja(false); ir(f) }} />, document.body) : null}
    </div>
  )
}

const valorObras = (f: Filtros, obras: OpcionObra[]): string =>
  f.obras.length === 0 ? 'Todas' : f.obras.length === 1 ? (obras.find((o) => o.id === f.obras[0])?.nombre ?? '1 obra') : `${f.obras.length} obras`

function Boton({ rotulo, valor, apagado, control, filtros, alternar, abierto }: {
  rotulo: string; valor: string; apagado?: string; control: Control; filtros: Filtros; alternar: () => void; abierto: boolean
}) {
  const razon = razonNoAplica(filtros.vista, control)
  if (razon) {
    return (
      <span title={razon} data-testid={`filtro-${control}`} aria-disabled
        className="flex h-[26px] cursor-default items-center gap-1.5 whitespace-nowrap px-2 text-xs text-dato-materiales">
        <span>{rotulo}</span>{apagado ?? valor}
      </span>
    )
  }
  const fuera = apartado(filtros, control)
  return (
    <button type="button" onClick={alternar} aria-expanded={abierto} data-testid={`filtro-${control}`}
      className={`flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-xs ${fuera ? 'bg-marca font-medium text-accent' : 'text-ink-soft hover:bg-surface-sunken'}`}>
      <span className="font-normal text-faint">{rotulo}</span><span className="max-w-40 truncate">{valor}</span><Flecha />
    </button>
  )
}

function Menu({ children, ancho }: { children: ReactNode; ancho: string }) {
  return <div className={`absolute right-0 top-8 z-30 flex flex-col rounded-card border border-line-strong bg-surface shadow-[0_4px_12px_rgb(var(--os-ink-rgb)/0.06)] ${ancho}`}>{children}</div>
}

function Opcion({ activa, onClick, children, extra }: { activa: boolean; onClick: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`grid h-9 w-full grid-cols-[minmax(0,1fr)_auto_12px] items-center gap-2.5 rounded-control px-2.5 text-left text-[12.5px] text-ink lg:h-8 ${activa ? 'bg-marca font-medium' : 'hover:bg-surface-quiet'}`}>
      <span>{children}</span><span className="text-[11px] font-normal text-muted">{extra}</span>{activa ? <Tilde /> : <span />}
    </button>
  )
}

/**
 * @param enHoja `true` en la hoja del teléfono, donde el «Aplicar» del pie ya confirma todo.
 *
 * ═══ DOS BOTONES «APLICAR» EN LA MISMA PANTALLA (revisión de fidelidad, 21/09/2026) ═══
 *
 * La hoja de 390 tenía el «Aplicar» amarillo del pie —el del diseño— y, además, otro adentro de la
 * sección Período. Dos botones con la misma palabra y distinto alcance: uno confirma el rango y el
 * otro confirma los tres filtros. En la hoja el rango entra al borrador apenas queda completo y el
 * botón interno desaparece; en el menú de 1440 sigue, porque ahí `cambiar` navega de verdad y sin
 * botón no habría forma de confirmar.
 */
function PanelPeriodo({ filtros, cambiar, enHoja = false }: { filtros: Filtros; cambiar: (f: Filtros) => void; enHoja?: boolean }) {
  const p = filtros.periodo
  const [desde, setDesde] = useState(p.tipo === 'rango' ? p.desde : '')
  const [hasta, setHasta] = useState(p.tipo === 'rango' ? p.hasta : '')
  const rango = leerPeriodo(`${desde}..${hasta}`)
  const invertido = desde !== '' && hasta !== '' && desde > hasta
  /** En la hoja, un rango completo y coherente entra solo al borrador. */
  const anotar = (d: string, h: string) => {
    setDesde(d); setHasta(h)
    if (!enHoja) return
    const r = leerPeriodo(`${d}..${h}`)
    if (r.tipo === 'rango' && !(d !== '' && h !== '' && d > h)) cambiar({ ...filtros, periodo: r })
  }
  return (
    <>
      <div className="flex flex-col gap-px border-b border-line p-1.5">
        {PRESETS.map((x) => (
          <Opcion key={x.clave} activa={p.tipo === 'preset' && p.preset === x.clave} onClick={() => cambiar({ ...filtros, periodo: { tipo: 'preset', preset: x.clave } })}>{x.rotulo}</Opcion>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <CampoFecha rotulo="Desde" iso={desde} alCambiar={(v) => anotar(v, hasta)} />
          <CampoFecha rotulo="Hasta" iso={hasta} alCambiar={(v) => anotar(desde, v)} />
        </div>
        {enHoja ? (
          invertido ? <span className="text-[11px] text-warn">desde debe ser anterior a hasta</span> : null
        ) : (
          <div className="flex items-center justify-between gap-2.5">
            <span className={`text-[11px] ${invertido ? 'text-warn' : 'text-faint'}`}>{invertido ? 'desde debe ser anterior a hasta' : 'inclusive · fecha de imputación'}</span>
            <button type="button" disabled={rango.tipo !== 'rango'} onClick={() => cambiar({ ...filtros, periodo: rango })}
              className="h-9 rounded-control bg-marca px-3 text-xs font-medium text-accent disabled:opacity-50 lg:h-7">Aplicar</button>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * UN CAMPO DE FECHA QUE SE LEE `dd/mm/aa`.
 *
 * El `<input type="date">` dibuja el formato del locale DEL NAVEGADOR, no el de la página: en el
 * teléfono del dueño salía `mm/dd/yyyy`. Acá se escribe a mano con el formato al lado, como en el
 * diseño, y `fechaCorta` traduce. Lo que no se pudo leer se dice en el campo, no se adivina.
 */
function CampoFecha({ rotulo, iso, alCambiar }: { rotulo: string; iso: string; alCambiar: (iso: string) => void }) {
  const [texto, setTexto] = useState(() => aCorta(iso))
  const roto = texto.trim() !== '' && deCorta(texto) == null
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{rotulo}</span>
      <input
        type="text" inputMode="numeric" placeholder="dd/mm/aa" aria-label={`${rotulo} (dd/mm/aa)`} value={texto}
        onChange={(e) => { setTexto(e.target.value); alCambiar(deCorta(e.target.value) ?? '') }}
        className={`h-10 rounded-control border bg-surface px-2 text-[13px] tabular-nums text-ink lg:h-[30px] lg:text-xs ${roto ? 'border-warn' : 'border-line-strong'}`}
      />
    </label>
  )
}

function PanelEstado({ filtros, obras, cambiar }: { filtros: Filtros; obras: OpcionObra[]; cambiar: (f: Filtros) => void }) {
  return (
    <div className="flex flex-col gap-px">
      {ESTADOS.map((e) => (
        <Opcion key={e.clave} activa={filtros.estado === e.clave} onClick={() => cambiar({ ...filtros, estado: e.clave, obras: [] })}
          extra={obras.filter((o) => PASA[e.clave](o.estado)).length}>
          {e.rotulo}
        </Opcion>
      ))}
    </div>
  )
}

function ListaObras({ filtros, obras, elegidas, alternarObra }: { filtros: Filtros; obras: OpcionObra[]; elegidas: string[]; alternarObra: (id: string) => void }) {
  const delEstado = obras.filter((o) => PASA[filtros.estado](o.estado))
  return (
    <div className="flex max-h-[300px] flex-col gap-px overflow-y-auto p-1.5">
      {delEstado.map((o) => {
        const on = elegidas.includes(o.id)
        return (
          <button key={o.id} type="button" onClick={() => alternarObra(o.id)} aria-pressed={on}
            className="grid h-9 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control px-2 text-left hover:bg-surface-quiet lg:h-[34px]">
            <span className={`flex size-3.5 items-center justify-center rounded-[3px] border ${on ? 'border-marca bg-marca' : 'border-line-strong bg-surface'}`}>{on ? <Tilde /> : null}</span>
            <span className={`truncate text-[12.5px] text-ink ${on ? 'font-medium' : ''}`}>{o.nombre}</span>
            <span className="text-[11px] text-faint">{o.cliente}</span>
          </button>
        )
      })}
    </div>
  )
}

const alternarEn = (lista: string[], id: string): string[] => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])

function PanelObras({ filtros, obras, aplicar }: { filtros: Filtros; obras: OpcionObra[]; aplicar: (f: Filtros) => void }) {
  const [elegidas, setElegidas] = useState(filtros.obras)
  const total = obras.filter((o) => PASA[filtros.estado](o.estado)).length
  const estado = ESTADOS.find((e) => e.clave === filtros.estado)?.rotulo.toLowerCase() ?? ''
  return (
    <>
      <div className="flex h-10 items-center justify-between border-b border-line px-3.5">
        <span className="text-xs text-muted">{elegidas.length === 0 ? `todas las obras · ${estado} · ${total}` : `${elegidas.length} de ${total} elegidas`}</span>
        <button type="button" onClick={() => setElegidas([])} className="text-xs text-ink-soft underline underline-offset-2">todas</button>
      </div>
      <ListaObras filtros={filtros} obras={obras} elegidas={elegidas} alternarObra={(id) => setElegidas(alternarEn(elegidas, id))} />
      <div className="flex justify-end border-t border-line px-3.5 py-2.5">
        <button type="button" onClick={() => aplicar({ ...filtros, obras: elegidas })} className="h-7 rounded-control bg-marca px-3 text-xs font-medium text-accent">Listo</button>
      </div>
    </>
  )
}

function HojaFiltros({ filtros, obras, cerrar, ir }: { filtros: Filtros; obras: OpcionObra[]; cerrar: () => void; ir: (f: Filtros) => void }) {
  const [borrador, setBorrador] = useState(filtros)
  const seccion = (c: Control, titulo: string, cuerpo: ReactNode) => {
    const razon = razonNoAplica(filtros.vista, c)
    return (
      <section className="border-b border-line py-3">
        <h3 className={`mb-2 text-xs font-medium ${razon ? 'text-dato-materiales' : 'text-faint'}`}>{titulo}{razon ? ` · ${c === 'periodo' ? 'a la fecha' : 'no aplica'}` : ''}</h3>
        {razon ? <p className="text-xs text-dato-materiales">{razon}</p> : cuerpo}
      </section>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden" role="dialog" aria-label="Filtros">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-semibold text-ink">Filtros</span>
        <button type="button" onClick={() => setBorrador({ ...borrador, periodo: DEFECTO.periodo, estado: DEFECTO.estado, obras: [] })}
          className="h-11 px-2 text-sm text-muted">Restablecer</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        {seccion('periodo', 'Período', <PanelPeriodo filtros={borrador} cambiar={setBorrador} enHoja />)}
        {seccion('estado', 'Estado de obra', <PanelEstado filtros={borrador} obras={obras} cambiar={setBorrador} />)}
        {seccion('obras', 'Obras', <ListaObras filtros={borrador} obras={obras} elegidas={borrador.obras} alternarObra={(id) => setBorrador({ ...borrador, obras: alternarEn(borrador.obras, id) })} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
        <button type="button" onClick={cerrar} className="h-11 rounded-control border border-line text-sm text-ink">Cancelar</button>
        <button type="button" onClick={() => ir(borrador)} className="h-11 rounded-control bg-marca text-sm font-medium text-ink">Aplicar</button>
      </div>
    </div>
  )
}
