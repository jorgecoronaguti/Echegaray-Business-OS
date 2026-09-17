// RESUMEN — cuánto se presupuestó, cuánto se gastó, cuánto queda, y dónde no se puede controlar.
//
// Es la vista que abre el módulo. El diseño v6 compara contra el contrato; el dueño (17/09/2026) pidió
// el eje presupuestado contra consumido, así que la barra fina es el PRESUPUESTO y el contrato pasa a
// referencia en la línea de la obra o del cliente. Sin presupuesto cargado la barra no se dibuja: se
// dice «sin presupuesto», en ámbar, como el diseño dice «sin precio».
import Link from 'next/link'
import type { GastoSinObra } from '../../clientes/services/costosDeObra'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctEntero } from '../services/formato'
import { cifrasResumen, composicion, manoObraDe, masGastan, porCliente, type FilaCliente } from '../services/agregados'
import { agruparPorSemaforo, ORDEN_GRUPOS, rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, LEYENDA_GASTO, Seccion } from './Piezas'

export function VistaResumen({ obras, sinObra, sinObraDetalle, filtros, motivoPresupuesto }: {
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  sinObraDetalle: Map<string, GastoSinObra>
  filtros: Filtros
  motivoPresupuesto: string | null
}) {
  const r = cifrasResumen(obras, sinObra)
  const clientes = porCliente(obras, sinObra)
  const conPres = obras.length - r.obrasSinPresupuesto
  const mix = composicion(obras)
  const est = rotuloEstimada(manoObraDe(obras))
  const comprobantes = [...sinObraDetalle.values()].reduce((a, g) => a + g.nComprobantes, 0)
  return (
    <>
      <Cabecera titulo="Resumen" repartidas
        detalle={`${clientes.length} clientes · ${obras.length} obras · ${conPres ? `${conPres} con presupuesto` : 'ninguna con presupuesto'}`}
        cifras={[
          { rotulo: 'presupuestado', valor: millones(r.presupuestado), falta: 'sin presupuesto cargado',
            nota: r.contratadoConPapel != null ? `contrato ${millones(r.contratadoConPapel)} · referencia` : undefined },
          { rotulo: 'gastado en obras', valor: millones(r.gastadoEnObras), falta: 'sin movimiento',
            nota: mix ? `mano de obra ${pctEntero(mix.manoObra)}${est ? ` (${est})` : ''} · materiales ${pctEntero(mix.materiales)}` : undefined },
          { rotulo: 'sin obra asignada', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: 'warn',
            nota: comprobantes ? `${comprobantes.toLocaleString('es-AR')} comprobantes sin obra` : undefined },
          { rotulo: 'horas en obra', valor: horasTexto(r.horasEnObra), falta: 'sin horas', nota: `${r.obrasConHoras} obras cargan horas` },
          { rotulo: 'obras sin presupuesto', valor: `${r.obrasSinPresupuesto} de ${obras.length}`, tono: r.obrasSinPresupuesto ? 'warn' : undefined,
            nota: r.gastoSinPresupuesto != null ? `${millones(r.gastoSinPresupuesto)} gastados sin presupuesto` : undefined },
        ]} />
      <PorCliente clientes={clientes} filtros={filtros} />
      <Semaforo obras={obras} />
      <section className="grid gap-8 pt-9 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-6">
        <h2 className="pt-0.5 text-[13px] font-semibold text-ink">De qué está hecho el gasto</h2>
        <Composicion obras={obras} clientes={clientes} />
        <MasGastan obras={obras} />
      </section>
      <NoSePuede motivoPresupuesto={motivoPresupuesto} sinPresupuesto={r.obrasSinPresupuesto} />
    </>
  )
}

function PorCliente({ clientes, filtros }: { clientes: FilaCliente[]; filtros: Filtros }) {
  const escala = Math.max(1, ...clientes.map((c) => Math.max(c.presupuestado ?? 0, c.gastado ?? 0)))
  return (
    <Seccion titulo="Gastado contra presupuesto, por cliente" leyenda={[...LEYENDA_GASTO, { color: 'bg-dato-cajon', rotulo: 'sin obra asignada' }]}>
      {clientes.map((c) => (
        <Link key={c.clienteId} prefetch={false} href={aUrl({ ...filtros, vista: 'contrato', cliente: c.slug })}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 border-b border-line py-3.5 hover:bg-surface-quiet lg:grid-cols-[130px_minmax(0,1fr)_110px_150px] lg:items-center">
          <div className="col-start-1 row-start-1 flex flex-col gap-0.5 lg:col-auto lg:row-auto">
            <div className="text-[13.5px] font-medium text-ink">{c.nombre}</div>
            <div className="text-[11.5px] text-faint">{c.obras.length} {c.obras.length === 1 ? 'obra' : 'obras'}{c.nConPresupuesto ? ` · ${c.nConPresupuesto} con presupuesto` : ''}</div>
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 lg:col-span-1">
            <div className="flex h-2.5 items-center gap-2">
              {c.presupuestado != null ? (
                <><div className="h-1.5 rounded-[2px] bg-dato-referencia" style={{ width: ancho(c.presupuestado, escala) }} /><span className="whitespace-nowrap text-[11px] text-muted">{millones(c.presupuestado)}</span></>
              ) : (
                <span className="whitespace-nowrap text-[11px] text-warn">sin presupuesto{c.contratado != null ? <span className="text-faint"> · contrato {millones(c.contratado)}</span> : null}</span>
              )}
            </div>
            <div className="flex h-3.5 items-center gap-2">
              <div className="flex h-3.5 overflow-hidden rounded-[2px]" style={{ width: ancho(c.gastado, escala) }}>
                <div className="bg-accent" style={{ width: ancho(c.partes?.manoObra, 1) }} />
                <div className="bg-muted" style={{ width: ancho(c.partes?.subcontratos, 1) }} />
                <div className="bg-dato-materiales" style={{ width: ancho(c.partes?.materiales, 1) }} />
                <div className="bg-dato-cajon" style={{ width: ancho(c.partes?.sinObra, 1) }} />
              </div>
              <span className="whitespace-nowrap text-xs font-semibold text-ink">{millones(c.gastado) ?? <span className="font-normal text-faint">sin movimiento</span>}</span>
            </div>
          </div>
          <div className="col-start-2 row-start-1 flex flex-col gap-0.5 text-right lg:col-auto lg:row-auto">
            <div className="text-[12.5px] font-medium text-ink">{horasTexto(c.horas) ?? <span className="font-normal text-faint">sin horas</span>}</div>
            <div className="text-[11px] text-faint">horas</div>
          </div>
          <Lectura c={c} />
        </Link>
      ))}
    </Seccion>
  )
}

function Lectura({ c }: { c: FilaCliente }) {
  let valor = 'sin presupuesto'
  let nota = 'no se puede controlar'
  let color = 'text-warn'
  if (c.queda != null) {
    valor = c.queda < 0 ? `excedido ${millones(-c.queda)}` : (millones(c.queda) ?? '')
    nota = c.nConPresupuesto < c.obras.length ? `queda, en las ${c.nConPresupuesto} con presupuesto` : 'queda del presupuesto'
    color = c.queda < 0 ? 'text-neg' : 'text-ink'
  }
  return (
    <div className="col-span-2 flex items-baseline justify-between gap-2 lg:col-span-1 lg:flex-col lg:items-end lg:gap-0.5">
      <div className={`text-[12.5px] font-medium ${color}`}>{valor}</div>
      <div className="text-[11px] text-faint">{nota}</div>
    </div>
  )
}

/** EL SEMÁFORO (antes, su propia vista): cuántas obras en cada grupo y cuáles, contra el presupuesto. */
function Semaforo({ obras }: { obras: ObraAnalitica[] }) {
  const g = agruparPorSemaforo(obras)
  const COLOR = { pasadas: 'text-neg', cerca: 'text-warn', dentro: 'text-pos', sinMovimiento: 'text-muted', sinPresupuesto: 'text-faint' } as const
  return (
    <Seccion titulo="Contra el presupuesto" aclaracion="pasada: gastó más que el presupuesto · cerca: desde el 80 %" arriba="pt-9">
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
        {ORDEN_GRUPOS.map(({ clave, rotulo }) => {
          const lista = g.get(clave) ?? []
          return (
            <div key={clave} className="flex flex-col gap-1.5 border-t border-line pt-3">
              <div className={`text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${lista.length ? COLOR[clave] : 'text-faint'}`}>{lista.length}</div>
              <div className="text-[13px] font-medium text-ink">{rotulo}</div>
              <div className="text-[11.5px] leading-normal text-muted">
                {lista.slice(0, 3).map((o) => o.nombre).join(' · ')}{lista.length > 3 ? ` y ${lista.length - 3} más` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </Seccion>
  )
}

function Composicion({ obras, clientes }: { obras: ObraAnalitica[]; clientes: FilaCliente[] }) {
  const filas = [
    { nombre: 'Empresa', mix: composicion(obras), total: true },
    ...clientes.map((c) => ({ nombre: c.nombre, mix: composicion(c.obras), total: false })),
  ].filter((f) => f.mix)
  const p = (x: number) => (Math.round(x * 100) >= 8 ? `${Math.round(x * 100)} %` : '')
  return (
    <div className="flex flex-col gap-3">
      {filas.map((f) => (
        <div key={f.nombre} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3.5">
          <div className={`truncate text-xs ${f.total ? 'font-semibold text-ink' : 'text-muted'}`}>{f.nombre}</div>
          <div className={`flex overflow-hidden rounded-[2px] bg-line text-[10.5px] ${f.total ? 'h-7' : 'h-[18px]'}`}>
            <div className="flex items-center justify-center overflow-hidden whitespace-nowrap bg-accent text-surface" style={{ width: ancho(f.mix?.manoObra, 1) }}>{p(f.mix?.manoObra ?? 0)}</div>
            <div className="flex items-center justify-center overflow-hidden whitespace-nowrap bg-muted text-surface" style={{ width: ancho(f.mix?.subcontratos, 1) }}>{p(f.mix?.subcontratos ?? 0)}</div>
            <div className="flex items-center justify-center overflow-hidden whitespace-nowrap bg-dato-materiales text-ink" style={{ width: ancho(f.mix?.materiales, 1) }}>{p(f.mix?.materiales ?? 0)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MasGastan({ obras }: { obras: ObraAnalitica[] }) {
  const top = masGastan(obras)
  const tope = top[0]?.gasto.total ?? 1
  return (
    <div className="flex flex-col">
      <h2 className="mb-3.5 text-[13px] font-semibold text-ink">Las obras que más gastan</h2>
      {top.map((o, i) => {
        const tono = o.grupo === 'pasadas' ? 'bg-neg' : o.presupuesto == null ? 'bg-warn' : 'bg-accent'
        return (
          <div key={o.id} className="grid h-[34px] grid-cols-[22px_minmax(0,1fr)_84px] items-center gap-3 border-b border-line lg:grid-cols-[22px_minmax(0,1fr)_120px_84px]">
            <div className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</div>
            <div className="flex min-w-0 flex-col gap-px">
              <div className="truncate text-[12.5px] font-medium text-ink">{o.nombre}</div>
              <div className="truncate text-[10.5px] text-faint">{o.clienteNombre} · {o.avanceGasto != null ? `${pctEntero(o.avanceGasto)} del presupuesto` : 'sin presupuesto'}</div>
            </div>
            <div className="hidden h-2 rounded-[2px] lg:block" style={{ width: ancho(o.gasto.total, tope) }}><div className={`h-full rounded-[2px] ${tono}`} /></div>
            <div className="text-right text-[12.5px] font-semibold text-ink tabular-nums">{millones(o.gasto.total)}</div>
          </div>
        )
      })}
    </div>
  )
}

function NoSePuede({ motivoPresupuesto, sinPresupuesto }: { motivoPresupuesto: string | null; sinPresupuesto: number }) {
  const huecos = [
    ...(motivoPresupuesto ? [{ que: 'Presupuesto por rubro', porque: 'La cotización interna de cada obra todavía no está cargada: sin ella no hay «queda» ni semáforo.', destraba: `cargar la cotización · ${sinPresupuesto} obras` }] : []),
    { que: 'Margen por obra', porque: 'Contrato menos gasto no es margen: falta el costo que queda por gastar.', destraba: 'presupuesto y avance de cada obra' },
    { que: 'Productividad', porque: 'Las horas entran por semana y por obra; no bajan a la actividad.', destraba: 'horas por tarea' },
    { que: 'Certificado contra avance', porque: 'El certificado no guarda el período ni el avance que cobra.', destraba: 'la obra y el período de cada certificado' },
  ]
  return (
    <Seccion titulo="Lo que la base no puede afirmar" arriba="pt-9 pb-7">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {huecos.map((h) => (
          <div key={h.que} className="flex flex-col gap-1.5 border-t border-line pt-3">
            <div className="text-[13px] font-medium text-ink">{h.que}</div>
            <div className="text-[11.5px] leading-normal text-muted">{h.porque}</div>
            <div className="font-mono text-[11px] text-faint">{h.destraba}</div>
          </div>
        ))}
      </div>
    </Seccion>
  )
}
