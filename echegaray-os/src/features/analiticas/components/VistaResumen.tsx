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
  cajonesDeLosClientes, cifrasResumen, composicionDelGasto, INCLUIDO_EN_MATERIALES, manoObraDe, obrasQueMasConsumen, resumenPorCliente,
  type Composicion, type FilaDeCliente,
} from '../services/agregados'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, LEYENDA_GASTO, Seccion } from './Piezas'
import { Torta, Tortita, type Gajo } from './Torta'

export function VistaResumen({ obras, sinObra, comprobantesPorCliente, filtros, neto }: {
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  /** Comprobantes de cada cajón sin obra, por cliente. `null` = no se pudo leer. */
  comprobantesPorCliente: Map<string, number> | null
  filtros: Filtros
  /** `true` = la base publica el consumo neto de IVA (20260917T1900). */
  neto: boolean
}) {
  // Sólo los cajones de los clientes que la vista muestra: si no, la tarjeta no cierra con las filas.
  const cajones = cajonesDeLosClientes(sinObra, obras)
  const r = cifrasResumen(obras, cajones)
  const clientes = resumenPorCliente(obras, cajones)
  const comprobantes = comprobantesPorCliente ? [...cajonesDeLosClientes(comprobantesPorCliente, obras).values()].reduce((a, n) => a + n, 0) : null
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
          { rotulo: neto ? 'consumido, sin IVA' : 'consumido, con IVA', valor: millones(total), falta: 'sin movimiento',
            nota: total ? `mano de obra ${pctEntero(mo / total)} · materiales ${pctEntero(mat / total)}` : undefined },
          { rotulo: 'sin obra', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: r.sinObraAsignada ? 'warn' : undefined,
            nota: comprobantes != null && comprobantes > 0 ? `${comprobantes} comprobantes sin obra` : undefined },
          { rotulo: 'horas en obra', valor: horasTexto(horas), falta: 'sin horas',
            nota: `${conHoras} ${conHoras === 1 ? 'obra carga' : 'obras cargan'} horas` },
          { rotulo: 'obras sin presupuesto', valor: `${sinPres.length} de ${obras.length}`, tono: sinPres.length ? 'warn' : undefined,
            nota: sinPres.length && consumidoSinPres > 0 ? `${millones(consumidoSinPres)} consumidos` : undefined },
        ]} />

      <Seccion titulo="Por cliente" leyenda={[...LEYENDA_GASTO, { color: 'bg-dato-cajon', rotulo: 'sin obra' }]}>
        <PorCliente clientes={clientes} filtros={filtros} />
      </Seccion>

      <DeQueEstaHecho obras={obras} clientes={clientes} />

      <Seccion titulo="Las obras que más gastan" filo>
        <ObrasQueMasGastan obras={obras} filtros={filtros} />
      </Seccion>

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

/**
 * DE QUÉ ESTÁ HECHO EL GASTO — la torta de la empresa y una tortita por cliente.
 *
 * El diseño v9 lo dibuja con dona: `torta: { lado:'160px', centro: M(total), centroNota:'consumido' }`
 * más `tortitas` en `repeat(auto-fill,minmax(230px,1fr))` con 20 px de aire. Estaba implementado con
 * barras apiladas horizontales, que no es el mismo gráfico: una barra compara longitudes contra el
 * borde de la pantalla y una torta compara partes contra el total, que es la pregunta de esta
 * sección. El componente `Torta` ya existía y se usaba en Cobranza y en Caja.
 */
function DeQueEstaHecho({ obras, clientes }: { obras: ObraAnalitica[]; clientes: FilaDeCliente[] }) {
  const mix = composicionDelGasto(obras, clientes)
  const [empresa, ...porCliente] = mix
  if (!empresa || empresa.total <= 0) return null
  return (
    <Seccion titulo="De qué está hecho el gasto">
      <div className="flex flex-col gap-7">
        <Torta gajos={gajosDe(empresa)} centro={millones(empresa.total)} centroNota="consumido" />
        {porCliente.some((m) => m.total > 0) ? (
          <div className="grid gap-5 pt-1 lg:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
            {porCliente.filter((m) => m.total > 0).map((m) => (
              <Tortita key={m.nombre} nombre={m.nombre} monto={millones(m.total)} mezcla={mezclaDe(m)} gajos={gajosDe(m)} />
            ))}
          </div>
        ) : null}
      </div>
    </Seccion>
  )
}

/** Los tres gajos, con los mismos tokens que la leyenda de la sección. */
const gajosDe = (m: Composicion): Gajo[] => [
  { rotulo: 'mano de obra', monto: m.manoObra, color: 'text-accent' },
  { rotulo: 'subcontratos', monto: m.subcontratos, color: 'text-muted' },
  { rotulo: 'materiales', monto: m.materiales, color: 'text-dato-materiales' },
]

/** «MO 43 · sub 1 · mat 56», tal cual el diseño. Enteros: a 11 px un decimal no se lee. */
const mezclaDe = (m: Composicion): string => {
  const p = (v: number) => Math.round((v / m.total) * 100)
  return `MO ${p(m.manoObra)} · sub ${p(m.subcontratos)} · mat ${p(m.materiales)}`
}

/**
 * LAS OBRAS QUE MÁS GASTAN — tres celdas, sin barra.
 *
 * El diseño es `grid-template-columns: 22px minmax(0,1fr) auto`: número, nombre con su subtítulo, y
 * el monto a la derecha. La barra que había acá no está en el diseño y además competía con el monto
 * por la misma lectura. Y es una SECCIÓN propia con filo, no una columna al lado de la torta: el
 * diseño apila las cuatro secciones del Resumen, cada una con su columna de título de 180 px.
 */
function ObrasQueMasGastan({ obras, filtros }: { obras: ObraAnalitica[]; filtros: Filtros }) {
  return (
    <div className="flex min-w-0 flex-col">
      {obrasQueMasConsumen(obras).map((o, i) => (
        <Link key={o.id} href={aUrl({ ...filtros, vista: 'obras', obra: o.id })} prefetch={false}
          className="grid h-[34px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line hover:bg-surface-quiet sm:gap-3">
          <div className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</div>
          <div className="flex min-w-0 flex-col gap-px">
            <div className="truncate text-[12.5px] font-medium text-ink">{o.nombre}</div>
            <div className="truncate text-[10.5px] text-faint">{o.clienteNombre} · {o.presupuesto != null ? millones(o.presupuesto) : 'sin presupuesto'}</div>
          </div>
          <div className="text-right text-[12.5px] font-semibold tabular-nums text-ink">{millones(o.gasto.total)}</div>
        </Link>
      ))}
    </div>
  )
}

// ─── Lo que la base no puede afirmar ────────────────────────────────────────────────────────────
//
// Sólo los huecos que hoy existen. Sin nombres de tablas en pantalla (regla del diseño): la línea de
// abajo dice qué lo destraba, en palabras. «Productividad»: las horas se cargan por día y por obra
// (`registros_hh.fecha`), y sólo una fila de 2026 tiene actividad (auditoría 17/09/2026).

function Huecos({ obras, sinPres }: { obras: ObraAnalitica[]; sinPres: ObraAnalitica[] }) {
  const est = rotuloEstimada(manoObraDe(obras))
  const huecos = [
    // ═══ «PORQUE» ES UNA ETIQUETA, NO UN PÁRRAFO (diseño v9) ═══
    //
    // El diseño escribe `'22 % estimada'`, `'12 obras sin cotización'`, `'van dentro de materiales'`.
    // Acá se habían vuelto oraciones de tres líneas, y cuatro tarjetas de tres líneas ocupan el
    // triple de alto y dejan de leerse de un vistazo. El detalle largo no se pierde: va al `title`,
    // que es donde se busca cuando la etiqueta no alcanza.
    est ? { que: 'Mano de obra real', porque: est.replace(' estimada', ' estimada'), destraba: 'recibos del estudio',
      detalle: `El ${est.replace(' estimada', '')} de la mano de obra consumida es estimada: quincenas sin recibo del estudio, horas × tarifa.` } : null,
    sinPres.length ? { que: 'Consumo contra presupuesto', porque: `${sinPres.length} ${sinPres.length === 1 ? 'obra sin cotización' : 'obras sin cotización'}`, destraba: 'cargar el costo cotizado',
      detalle: sinPres.map((o) => `${o.nombre}: ${o.motivoPresupuesto ?? 'sin cotización aprobada'}`).join(' · ') } : null,
    { que: 'Subcontratos', porque: 'van dentro de materiales', destraba: 'partida propia',
      detalle: `La cotización no los separa: van ${INCLUIDO_EN_MATERIALES.replace('incluido ', '')} y se miden junto con materiales.` },
    { que: 'Productividad', porque: 'las horas no bajan a la actividad', destraba: 'horas por actividad',
      detalle: 'Las horas entran por día y por obra; no bajan a la actividad.' },
  ].filter((h): h is { que: string; porque: string; destraba: string; detalle: string } => h != null)
  return (
    <section className="grid gap-4 pt-9 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
      <h2 className="pt-0.5 text-[13px] font-semibold text-ink">Lo que no se puede afirmar</h2>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {huecos.map((h) => (
          <div key={h.que} title={h.detalle} className="flex flex-col gap-1.5 border-t border-line pt-3">
            <div className="text-[13px] font-medium text-ink">{h.que}</div>
            <div className="text-[11.5px] leading-normal text-muted">{h.porque}</div>
            <div className="font-mono text-[11px] text-faint">{h.destraba}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
