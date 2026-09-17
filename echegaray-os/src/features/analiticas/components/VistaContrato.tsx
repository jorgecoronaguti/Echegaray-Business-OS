// PRESUPUESTO Y GASTO — un cliente, rubro por rubro: cuánto se cotizó, cuánto se gastó, cuánto queda.
//
// Diseño v6 («Contrato y gasto»): chips de cliente, el total del cliente en pares de barras
// cotizado/gastado por rubro, y la grilla de obras con los mismos pares. «Cotizado» es el presupuesto
// de la cotización interna (`presupuesto.ts`), NUNCA el contrato: el contrato va en la línea de la obra
// como referencia. Las barras de cada columna van a la escala de esa columna dentro del cliente.
//
// Rubros: mano de obra · subcontratos · materiales · otros (dueño, 17/09/2026) y HH en horas.
// «Otros» no tiene consumo registrado en la base: se dice «sin registrar».
import Link from 'next/link'
import type { GastoSinObra } from '../../clientes/services/costosDeObra'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctEntero } from '../services/formato'
import { celda, ITEMS, totalesPorRubro, type Celda, type Item } from '../services/agregados'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import type { Ritmo } from '../services/consumo'
import { ancho, Ausente, ENCABEZADO } from './Piezas'

type CeldaVista = Celda & { item: Item; estimada?: string | null }

export function VistaContrato({ obras, sinObraDetalle, filtros, ritmos }: {
  obras: ObraAnalitica[]
  sinObraDetalle: Map<string, GastoSinObra>
  filtros: Filtros
  ritmos: Map<string, Ritmo> | null
}) {
  const clientes = [...new Map(obras.map((o) => [o.clienteSlug, o.clienteNombre])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const slug = clientes.some(([s]) => s === filtros.cliente) ? filtros.cliente : clientes[0]?.[0]
  const delCliente = obras.filter((o) => o.clienteSlug === slug)
  if (!slug || !delCliente.length) return <p className="mt-9 text-sm text-muted">Ninguna obra con estos filtros.</p>
  const totales = totalesPorRubro(delCliente).map((t) => ({ ...t, estimada: t.item === 'manoObra' ? rotuloEstimada({ manoObra: t.gastado, manoObraEstimada: suma(delCliente.map((o) => o.gasto.manoObraEstimada)) }) : null }))
  const gastado = suma(delCliente.map((o) => o.gasto.total))
  const conPres = delCliente.filter((o) => o.presupuesto != null).length
  const ritmo = ritmos ? suma(delCliente.map((o) => ritmos.get(o.id)?.porMes ?? null)) : null
  const so = sinObraDetalle.get(delCliente[0].clienteId)
  return (
    <>
      <div className="barra-corrible -mx-4 mt-6 flex gap-1.5 px-4 lg:mx-0 lg:mt-7 lg:flex-wrap lg:px-0">
        {clientes.map(([s, nombre]) => (
          <Link key={s} prefetch={false} href={aUrl({ ...filtros, cliente: s })} aria-current={s === slug ? 'page' : undefined}
            className={`flex h-9 shrink-0 items-center whitespace-nowrap rounded-control px-3.5 text-[13px] lg:h-[30px] ${s === slug ? 'bg-marca font-medium text-accent' : 'text-ink-soft hover:bg-surface-sunken'}`}>
            {nombre}
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 border-b border-line-strong pb-6 lg:grid-cols-[180px_repeat(5,minmax(0,1fr))] lg:items-start">
        <div className="flex flex-col gap-1.5 pt-0.5">
          <h1 className="text-[22px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">{delCliente[0].clienteNombre}</h1>
          <p className="text-xs leading-[1.45] text-muted tabular-nums">
            {delCliente.length} {delCliente.length === 1 ? 'obra' : 'obras'} · {conPres ? `${conPres} con presupuesto` : 'sin presupuesto'} · {gastado != null ? `${millones(gastado)} gastados` : 'sin movimiento'}
            {ritmos == null ? ' · ritmo sin leer' : ritmo != null ? ` · consume ${millones(ritmo)} por mes` : ' · sin consumo en los últimos 3 meses'}
          </p>
        </div>
        {totales.map((t) => <Rubro key={t.item} c={t} escala={Math.max(t.cotizado ?? 0, t.gastado ?? 0)} grande />)}
      </div>
      <div className="flex flex-col pb-9">
        <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[180px_repeat(5,minmax(0,1fr))] ${ENCABEZADO}`}>
          <div>Obra</div>{ITEMS.map((i) => <div key={i.clave}>{i.rotulo}</div>)}
        </div>
        {delCliente.map((o) => <FilaObra key={o.id} o={o} obras={delCliente} />)}
        {so ? <FilaSinObra g={so} /> : null}
      </div>
    </>
  )
}

const suma = (xs: (number | null)[]): number | null => (xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0))

function escalaDe(obras: ObraAnalitica[], item: Item): number {
  return Math.max(1, ...obras.map((o) => {
    const c = celda(o, item)
    return Math.max(c.cotizado ?? 0, c.gastado ?? 0)
  }))
}

function FilaObra({ o, obras }: { o: ObraAnalitica; obras: ObraAnalitica[] }) {
  return (
    <div className="grid gap-3 border-b border-line py-3 hover:bg-surface-quiet lg:grid-cols-[180px_repeat(5,minmax(0,1fr))] lg:items-center lg:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-[13.5px] font-medium text-ink">{o.nombre}</div>
        <div className="text-[11.5px]">
          {o.presupuesto != null ? <span className="text-muted">{millones(o.presupuesto)}</span> : <span className="text-warn">sin presupuesto</span>}
          {o.precio != null ? <span className="text-faint"> · contrato {millones(o.precio)}</span> : null}
        </div>
      </div>
      {ITEMS.map((i) => (
        <Rubro key={i.clave} escala={escalaDe(obras, i.clave)}
          c={{ ...celda(o, i.clave), item: i.clave, estimada: i.clave === 'manoObra' ? rotuloEstimada(o.gasto) : null }} />
      ))}
    </div>
  )
}

/** Lo sin obra del cliente: materiales y subcontratos, nunca repartidos. Sin presupuesto: no es de una obra. */
function FilaSinObra({ g }: { g: GastoSinObra }) {
  const valor = (v: number | null) => (v == null ? <Ausente>—</Ausente> : <span className="font-semibold text-ink">{millones(v)}</span>)
  return (
    <div className="grid gap-3 border-b border-line py-3 lg:grid-cols-[180px_repeat(5,minmax(0,1fr))] lg:items-center lg:gap-6">
      <div className="flex flex-col gap-0.5">
        <div className="text-[13.5px] font-medium text-muted">Sin obra asignada</div>
        <div className="text-[11.5px] text-faint">{g.nComprobantes.toLocaleString('es-AR')} comprobantes · no se reparte</div>
      </div>
      <div className="hidden text-right text-xs lg:block"><Ausente>—</Ausente></div>
      <div className="flex justify-between text-xs lg:justify-end"><span className="text-faint lg:hidden">Subcontratos</span>{valor(g.subcontratos)}</div>
      <div className="flex justify-between text-xs lg:justify-end"><span className="text-faint lg:hidden">Materiales</span>{valor(g.materiales)}</div>
      <div className="hidden lg:block" /><div className="hidden lg:block" />
    </div>
  )
}

/** Un rubro: la barra fina de lo cotizado, la gruesa de lo gastado y, en el total, qué queda. */
function Rubro({ c, escala, grande = false }: { c: CeldaVista; escala: number; grande?: boolean }) {
  const esHH = c.item === 'horas'
  const fmt = esHH ? horasTexto : millones
  const excedido = c.lectura?.tipo === 'excedido'
  const sinPres = c.lectura?.tipo === 'sinPresupuesto'
  const tono = excedido ? 'bg-neg' : sinPres ? 'bg-warn' : 'bg-accent'
  const gColor = c.gastado == null ? 'text-faint' : excedido ? 'text-neg' : sinPres ? 'text-warn' : 'text-ink'
  const rotulo = ITEMS.find((i) => i.clave === c.item)?.rotulo ?? ''
  const alto = grande ? 'h-2.5' : 'h-2'
  return (
    <div className={`flex min-w-0 flex-col ${grande ? 'gap-2.5' : 'gap-1'}`}>
      <div className={grande ? 'text-[13px] font-semibold text-ink' : `text-[10.5px] text-faint lg:hidden`}>{rotulo}</div>
      <div className={`grid grid-cols-[52px_minmax(0,1fr)_84px] items-center gap-2 ${grande ? 'h-[18px]' : 'h-4'}`}>
        <div className={`${grande ? 'text-[11px]' : 'text-[10.5px]'} text-faint`}>cotizado</div>
        <div className={`${alto} rounded-[2px] bg-dato-referencia`} style={{ width: ancho(c.cotizado, escala) }} />
        <div className={`whitespace-nowrap text-right ${grande ? 'text-xs' : 'text-[11.5px]'} ${c.cotizado != null ? 'text-ink' : 'text-faint'}`}>{c.cotizado != null ? fmt(c.cotizado) : c.cotizadoAusente}</div>
      </div>
      <div className={`grid grid-cols-[52px_minmax(0,1fr)_84px] items-center gap-2 ${grande ? 'h-[18px]' : 'h-4'}`}>
        <div className={`${grande ? 'text-[11px]' : 'text-[10.5px]'} text-faint`}>gastado</div>
        <div className={`${alto} rounded-[2px] ${tono}`} style={{ width: ancho(c.gastado, escala) }} />
        <div className={`whitespace-nowrap text-right font-semibold ${grande ? 'text-[12.5px]' : 'text-xs'} ${gColor}`} title={c.estimada ?? undefined}>
          {c.gastado != null ? fmt(c.gastado) : <span className="font-normal">{c.gastadoAusente ?? (esHH ? 'sin horas' : '—')}</span>}
        </div>
      </div>
      {grande ? <LecturaRubro c={c} /> : null}
      {/* LA MANO DE OBRA ESTIMADA SE DICE; en las filas la línea existe en todos los rubros para que no se desalineen. */}
      {!grande || c.estimada ? <div className="h-3.5 truncate pl-[60px] text-[10.5px] text-faint">{c.estimada ?? '\u00a0'}</div> : null}
    </div>
  )
}

function LecturaRubro({ c }: { c: CeldaVista }) {
  const l = c.lectura
  let texto: string | null = null
  let color = 'text-muted'
  if (l?.tipo === 'queda') texto = `queda ${millones(l.monto)} · ${pctEntero(c.pct)} gastado`
  if (l?.tipo === 'excedido') { texto = `excedido en ${millones(l.monto)}`; color = 'text-neg' }
  if (l?.tipo === 'sinMovimiento') texto = 'sin movimiento'
  if (l?.tipo === 'sinPresupuesto') { texto = 'gasto sin presupuesto'; color = 'text-warn' }

  return <div className={`truncate pl-[60px] text-[11.5px] ${color}`}>{texto ?? '\u00a0'}</div>
}
