// RESUMEN — la vista «global» del diseño Analíticas v6, copiada fiel.
//
// Dueño, 17/09/2026: «respetá el diseño que te pasé, no inventes» (la versión con el orden de Clientes
// quedó descartada). Lo mismo que el diseño y en su orden: cinco cifras · Por cliente (barra fina de
// lo presupuestado, gruesa de lo consumido apilada en mano de obra, subcontratos, materiales y sin obra
// asignada; horas; lo que queda) · De qué está hecho el gasto · Las obras que más gastan · Lo que la
// base no puede afirmar. Donde el diseño decía «contratado» va PRESUPUESTADO: es lo que se controla.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctEntero } from '../services/formato'
import {
  cifrasResumen, composicionDelGasto, INCLUIDO_EN_MATERIALES, manoObraDe, obrasQueMasConsumen, resumenPorCliente,
  type Composicion, type FilaDeCliente,
} from '../services/agregados'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, LEYENDA_GASTO, Seccion } from './Piezas'

export function VistaResumen({ obras, sinObra, comprobantesSinObra, filtros, neto }: {
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  /** Cuántos comprobantes hay en los cajones sin obra. `null` = no se pudo leer. */
  comprobantesSinObra: number | null
  filtros: Filtros
  /** `true` = la base publica el consumo neto de IVA (20260917T1900). */
  neto: boolean
}) {
  const r = cifrasResumen(obras, sinObra)
  const clientes = resumenPorCliente(obras, sinObra)
  const conPres = obras.filter((o) => o.presupuesto != null)
  const sinPres = obras.filter((o) => o.presupuesto == null)
  const estimados = conPres.filter((o) => o.presupuestoEstimado).length
  const consumidoSinPres = sinPres.reduce((a, o) => a + (o.gasto.total ?? 0), 0)
  const mo = obras.reduce((a, o) => a + (o.gasto.manoObra ?? 0), 0)
  const mat = obras.reduce((a, o) => a + (o.gasto.materiales ?? 0), 0)
  const horas = obras.reduce<number | null>((a, o) => (o.gasto.horas == null ? a : (a ?? 0) + o.gasto.horas), null)
  const conHoras = obras.filter((o) => (o.gasto.horas ?? 0) > 0).length
  const total = r.consumoTotal
  return (
    <>
      <Cabecera titulo="Resumen" repartidas
        detalle={`${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} · ${obras.length} obras · ${conPres.length} con presupuesto`}
        cifras={[
          { rotulo: 'presupuestado', valor: millones(r.presupuestado), falta: 'sin presupuesto',
            nota: `${conPres.length} ${conPres.length === 1 ? 'obra' : 'obras'}${estimados ? ` · ${estimados} ${estimados === 1 ? 'estimado' : 'estimados'}` : ''}` },
          { rotulo: neto ? 'consumido en obras, sin IVA' : 'consumido en obras, con IVA', valor: millones(total), falta: 'sin movimiento',
            nota: total ? `mano de obra ${pctEntero(mo / total)} · materiales ${pctEntero(mat / total)}` : undefined },
          { rotulo: 'sin obra asignada', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: r.sinObraAsignada ? 'warn' : undefined,
            nota: comprobantesSinObra != null ? `${comprobantesSinObra} comprobantes sin obra` : undefined },
          { rotulo: 'horas en obra', valor: horasTexto(horas), falta: 'sin horas',
            nota: `${conHoras} ${conHoras === 1 ? 'obra carga' : 'obras cargan'} horas` },
          { rotulo: 'obras sin presupuesto', valor: `${sinPres.length} de ${obras.length}`, tono: sinPres.length ? 'warn' : undefined,
            nota: sinPres.length && consumidoSinPres > 0 ? `${millones(consumidoSinPres)} consumidos` : undefined },
        ]} />

      <Seccion titulo="Por cliente" leyenda={[...LEYENDA_GASTO, { color: 'bg-dato-cajon', rotulo: 'sin obra asignada' }]}>
        <PorCliente clientes={clientes} filtros={filtros} />
      </Seccion>

      <DeQueYObras obras={obras} clientes={clientes} filtros={filtros} />

      <Huecos obras={obras} sinPres={sinPres} />
      <div className="pb-7" />
    </>
  )
}

// ─── Por cliente ────────────────────────────────────────────────────────────────────────────────

function PorCliente({ clientes, filtros }: { clientes: FilaDeCliente[]; filtros: Filtros }) {
  if (!clientes.length) return <p className="text-sm text-faint">Ninguna obra con estos filtros.</p>
  const escala = Math.max(...clientes.map((c) => Math.max(c.presupuestado ?? 0, c.total ?? 0)), 1)
  return (
    <div className="flex flex-col" data-testid="resumen-por-cliente">
      {clientes.map((c) => (
        <Link key={c.clienteId} href={aUrl({ ...filtros, vista: 'obras', obra: c.obraPrincipal })} prefetch={false}
          data-testid="resumen-cliente"
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-line py-3.5 hover:bg-surface-quiet lg:grid-cols-[130px_minmax(0,1fr)_110px_150px]">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="truncate text-[13.5px] font-medium text-ink">{c.nombre}</div>
            <div className="text-[11.5px] text-faint">
              {c.obras} {c.obras === 1 ? 'obra' : 'obras'}{c.conPresupuesto ? ` · ${c.conPresupuesto} ${c.conPresupuesto === 1 ? 'cotizada' : 'cotizadas'}` : ''}
              <span className="lg:hidden"> · {c.horas != null ? horasTexto(c.horas) : 'sin horas'}</span>
            </div>
          </div>
          <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-[5px] lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <div className="flex h-2.5 items-center gap-2">
              {c.presupuestado != null ? <div className="h-1.5 rounded-[2px] bg-dato-referencia" style={{ width: ancho(c.presupuestado, escala) }} /> : null}
              <div className={`whitespace-nowrap text-[11px] tabular-nums ${c.presupuestado != null ? 'text-muted' : 'text-warn'}`}>
                {c.presupuestado != null ? millones(c.presupuestado) : 'sin presupuesto'}
              </div>
            </div>
            <div className="flex h-3.5 items-center gap-2">
              <div className="flex h-3.5 overflow-hidden rounded-[2px]" style={{ width: ancho(c.total, escala) }}>
                <div className="bg-accent" style={{ width: ancho(c.manoObra, c.total) }} />
                <div className="bg-muted" style={{ width: ancho(c.subcontratos, c.total) }} />
                <div className="bg-dato-materiales" style={{ width: ancho(c.materiales, c.total) }} />
                <div className="bg-dato-cajon" style={{ width: ancho(c.sinObra, c.total) }} />
              </div>
              <div className="whitespace-nowrap text-xs font-semibold tabular-nums text-ink">{millones(c.total) ?? <span className="font-normal text-faint">sin movimiento</span>}</div>
            </div>
          </div>
          <div className="hidden flex-col gap-[3px] text-right lg:flex">
            <div className={`text-[12.5px] font-medium tabular-nums ${c.horas != null ? 'text-ink' : 'text-faint'}`}>{c.horas != null ? horasTexto(c.horas) : 'sin horas'}</div>
            <div className="text-[11px] text-faint">horas</div>
          </div>
          <Lectura c={c} />
        </Link>
      ))}
    </div>
  )
}

function Lectura({ c }: { c: FilaDeCliente }) {
  const l = c.lectura
  const [valor, nota, tono] = l.tipo === 'sinPresupuesto'
    ? ['sin presupuesto', 'ninguna cotización aprobada', 'text-warn']
    : [l.tipo === 'excedido' ? `excedido ${millones(l.monto)}` : millones(l.monto),
      l.conPresupuesto < l.obras ? `${l.tipo === 'excedido' ? 'en' : 'queda, en'} ${l.conPresupuesto === 1 ? 'la cotizada' : `las ${l.conPresupuesto} cotizadas`}` : l.tipo === 'excedido' ? 'sobre el presupuesto' : 'queda del presupuesto',
      l.tipo === 'excedido' ? 'text-neg' : 'text-ink']
  return (
    <div className="flex flex-col gap-[3px] text-right">
      <div className={`text-[12.5px] font-medium tabular-nums ${tono}`}>{valor}</div>
      <div className="text-[11px] text-faint">{nota}</div>
    </div>
  )
}

// ─── De qué está hecho el gasto · Las obras que más gastan ──────────────────────────────────────

function DeQueYObras({ obras, clientes, filtros }: { obras: ObraAnalitica[]; clientes: FilaDeCliente[]; filtros: Filtros }) {
  const mix = composicionDelGasto(obras, clientes)
  const top = obrasQueMasConsumen(obras)
  const max = top[0]?.gasto.total ?? 1
  return (
    <section className="grid gap-x-10 gap-y-6 pt-9 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
      <h2 className="pt-0.5 text-[13px] font-semibold text-ink">De qué está hecho el gasto</h2>
      <div className="flex flex-col gap-3">
        {mix.map((m, i) => <Mezcla key={m.nombre} m={m} empresa={i === 0} />)}
      </div>
      <div className="flex min-w-0 flex-col">
        <h2 className="mb-3.5 text-[13px] font-semibold text-ink">Las obras que más gastan</h2>
        {top.map((o, i) => (
          <Link key={o.id} href={aUrl({ ...filtros, vista: 'obras', obra: o.id })} prefetch={false}
            className="grid h-[34px] grid-cols-[22px_minmax(0,1fr)_48px_76px] items-center gap-2.5 sm:grid-cols-[22px_minmax(0,1fr)_minmax(0,120px)_84px] sm:gap-3 border-b border-line hover:bg-surface-quiet">
            <div className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</div>
            <div className="flex min-w-0 flex-col gap-px">
              <div className="truncate text-[12.5px] font-medium text-ink">{o.nombre}</div>
              <div className="truncate text-[10.5px] text-faint">{o.clienteNombre} · {o.presupuesto != null ? millones(o.presupuesto) : 'sin presupuesto'}</div>
            </div>
            <div className={`h-2 rounded-[2px] ${o.presupuesto == null ? 'bg-warn' : 'bg-accent'}`} style={{ width: ancho(o.gasto.total, max) }} />
            <div className="text-right text-[12.5px] font-semibold tabular-nums text-ink">{millones(o.gasto.total)}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Mezcla({ m, empresa }: { m: Composicion; empresa: boolean }) {
  const pct = (v: number) => Math.round((v / m.total) * 100)
  const rot = (v: number) => (pct(v) >= 8 ? `${pct(v)} %` : '')
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3.5">
      <div className={`truncate text-xs ${empresa ? 'font-semibold text-ink' : 'text-muted'}`}>{m.nombre}</div>
      <div className={`flex overflow-hidden rounded-[2px] bg-line text-[10.5px] tabular-nums ${empresa ? 'h-7' : 'h-[18px]'}`}>
        <div className="flex items-center justify-center overflow-hidden whitespace-nowrap bg-accent text-white" style={{ width: ancho(m.manoObra, m.total) }}>{rot(m.manoObra)}</div>
        <div className="flex items-center justify-center overflow-hidden whitespace-nowrap bg-muted text-white" style={{ width: ancho(m.subcontratos, m.total) }}>{rot(m.subcontratos)}</div>
        <div className="flex items-center justify-center overflow-hidden whitespace-nowrap bg-dato-materiales text-ink" style={{ width: ancho(m.materiales, m.total) }}>{rot(m.materiales)}</div>
      </div>
    </div>
  )
}

// ─── Lo que la base no puede afirmar ────────────────────────────────────────────────────────────
//
// Sólo los huecos que hoy existen. Sin nombres de tablas en pantalla (regla del diseño): la línea de
// abajo dice qué lo destraba, en palabras. «Productividad»: las horas se cargan por semana y obra
// (`registros_hh.fecha_inicio_semana`), sin actividad.

function Huecos({ obras, sinPres }: { obras: ObraAnalitica[]; sinPres: ObraAnalitica[] }) {
  const est = rotuloEstimada(manoObraDe(obras))
  const huecos = [
    est ? { que: 'Mano de obra real', porque: `El ${est.replace(' estimada', '')} de la mano de obra consumida es estimada: quincenas sin recibo del estudio, horas × tarifa.`, destraba: 'los recibos del estudio' } : null,
    sinPres.length ? { que: 'Consumo contra presupuesto', porque: sinPres.map((o) => `${o.nombre}: ${o.motivoPresupuesto ?? 'sin cotización aprobada'}`).join(' · '), destraba: 'cargar el costo cotizado' } : null,
    { que: 'Subcontratos contra presupuesto', porque: `La cotización no los separa: van ${INCLUIDO_EN_MATERIALES.replace('incluido ', '')} y se miden junto con materiales.`, destraba: 'una partida propia en la cotización' },
    { que: 'Productividad', porque: 'Las horas entran por semana y por obra; no bajan a la actividad.', destraba: 'horas por actividad' },
  ].filter((h): h is { que: string; porque: string; destraba: string } => h != null)
  return (
    <section className="grid gap-4 pt-9 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
      <h2 className="pt-0.5 text-[13px] font-semibold text-ink">Lo que la base no puede afirmar</h2>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {huecos.map((h) => (
          <div key={h.que} className="flex flex-col gap-1.5 border-t border-line pt-3">
            <div className="text-[13px] font-medium text-ink">{h.que}</div>
            <div className="text-[11.5px] leading-normal text-muted">{h.porque}</div>
            <div className="font-mono text-[11px] text-faint">{h.destraba}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
