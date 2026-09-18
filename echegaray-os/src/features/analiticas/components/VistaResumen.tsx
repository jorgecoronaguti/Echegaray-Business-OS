// RESUMEN — la vista «global» del diseño Analíticas v6, copiada fiel, con las DOS lecturas.
//
// Dueño, 17/09/2026: «respetá el diseño que te pasé, no inventes» (la versión con el orden de Clientes
// quedó descartada). Lo mismo que el diseño y en su orden: cinco cifras · Por cliente (barra fina,
// gruesa de lo gastado apilada en mano de obra, subcontratos, materiales y sin obra asignada; horas; lo
// que queda) · De qué está hecho el gasto · Las obras que más gastan · Lo que la base no puede afirmar.
//
// ═══ DOS PREGUNTAS, DOS SECCIONES (dueño, 17/09/2026) ═══
//
// El diseño comparaba contra el CONTRATO. El dueño pidió controlar PRESUPUESTADO contra consumido, y
// la barra fina pasó a ser el presupuesto. Después reclamó: «más claridad en Resumen de lo contratado
// vs lo que se va gastando, no lo veo y no lo entiendo ahí». Las dos lecturas son legítimas y ninguna
// tapa a la otra:
//
//   CONTRATADO contra GASTADO       el precio que el cliente paga menos el costo hasta hoy → lo que
//                                   queda del contrato (no es el margen final: falta costo por incurrir).
//   PRESUPUESTADO contra CONSUMIDO  el costo previsto menos el costo incurrido → el desvío.
//
// Cada una tiene su sección, con el mismo dibujo del diseño (fila por cliente, barra fina y gruesa) y
// su propio título en palabras de obra. Lo que el dueño pidió no se quita: se mueve.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctEntero } from '../services/formato'
import {
  cajonesDeLosClientes, cifrasResumen, composicionDelGasto, contenidoPorRubro, contraContrato, contratoPorCliente, manoObraDe, obrasQueMasConsumen, resumenPorCliente, tablaPorRubro,
  type Composicion, type ContenidoDeRubro, type FilaContrato, type FilaDeCliente, type FilaPorRubro,
} from '../services/agregados'
import { importe } from './DetalleRubro'
import { ORDEN_RUBROS, porcionesDeRubros, RUBRO_COLOR, Torta } from './Torta'
import { DEFINICION_TIPO_COSTO, tipoCostoDe, type TipoCostoDeObra } from '../services/tipoCosto'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { DEFINICION_RUBRO, RUBROS, type Rubro } from '../services/presupuesto'
import { ancho, Cabecera, Cifras, LEYENDA_GASTO, Seccion } from './Piezas'

export function VistaResumen({ obras, sinObra, comprobantesPorCliente, filtros, neto, tipoCosto }: {
  obras: ObraAnalitica[]
  /** Directo contra indirecto por obra; `null` = la función de la base todavía no está aplicada. */
  tipoCosto: Map<string, TipoCostoDeObra> | null
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
  const sub = obras.reduce((a, o) => a + (o.gasto.subcontratos ?? 0), 0)
  const otr = obras.reduce((a, o) => a + (o.gasto.otros ?? 0), 0)
  const horas = obras.reduce<number | null>((a, o) => (o.gasto.horas == null ? a : (a ?? 0) + o.gasto.horas), null)
  const conHoras = obras.filter((o) => (o.gasto.horas ?? 0) > 0).length
  const total = r.consumoTotal
  const cc = contraContrato(obras)
  const clientesContrato = contratoPorCliente(obras)
  const enDolares = obras.filter((o) => o.precioEnDolares).length
  const sinPrecio = cc.sinPrecio
  return (
    <>
      <Cabecera titulo="Resumen" repartidas
        detalle={`${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} · ${obras.length} obras · ${conPres.length} con presupuesto`}
        cifras={[
          { rotulo: 'presupuestado', valor: millones(r.presupuestado), falta: 'sin presupuesto',
            nota: `${conPres.length} ${conPres.length === 1 ? 'obra' : 'obras'}${estimados ? ` · ${estimados} ${estimados === 1 ? 'estimado' : 'estimados'}` : ''}` },
          { rotulo: neto ? 'consumido en obras, sin IVA' : 'consumido en obras, con IVA', valor: millones(total), falta: 'sin movimiento',
            // LOS CUATRO RUBROS, SIEMPRE LOS CUATRO (dueño, 18/09/2026): la cabecera suma lo mismo que la tabla.
            nota: total ? `mano de obra ${pctEntero(mo / total)} · materiales ${pctEntero(mat / total)} · subcontratistas ${pctEntero(sub / total)} · otros ${pctEntero(otr / total)}` : undefined },
          { rotulo: 'sin obra asignada', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: r.sinObraAsignada ? 'warn' : undefined,
            nota: comprobantes != null && comprobantes > 0 ? `${comprobantes} comprobantes sin obra` : undefined },
          { rotulo: 'horas en obra', valor: horasTexto(horas), falta: 'sin horas',
            nota: `${conHoras} ${conHoras === 1 ? 'obra carga' : 'obras cargan'} horas` },
          // CUÁL ES LA OBRA (dueño, 17/09/2026): con una sola, no decir el nombre obliga a ir a buscarlo.
          { rotulo: 'obras sin presupuesto', valor: `${sinPres.length} de ${obras.length}`, tono: sinPres.length ? 'warn' : undefined,
            nota: sinPres.length
              ? `${sinPres.length === 1 ? sinPres[0].nombre : `${sinPres.length} obras`}${consumidoSinPres > 0 ? ` · ${millones(consumidoSinPres)} consumidos` : ''}`
              : undefined },
        ]} />

      {/* LO CONTRATADO CONTRA LO GASTADO (dueño, 17/09/2026): primero, porque es lo que no veía. Sólo las
          obras con precio entran a la cuenta; lo que gastaron las otras se dice aparte, nunca se mezcla. */}
      <Seccion titulo="Contratado contra gastado"
        aclaracion="por cliente · la barra fina es lo contratado (el precio de la obra, no lo facturado); la gruesa, lo gastado en esas mismas obras"
        leyenda={LEYENDA_GASTO}>
        <div className="flex flex-col gap-6" data-testid="resumen-contrato">
          <Cifras cifras={[
            { rotulo: 'contratado', valor: millones(cc.contratado), falta: 'sin precio',
              nota: `${cc.conPrecio} ${cc.conPrecio === 1 ? 'obra' : 'obras'} con precio${enDolares ? ` · ${enDolares} en U$S al dólar de hoy` : ''}` },
            { rotulo: neto ? 'gastado en esas obras, sin IVA' : 'gastado en esas obras, con IVA', valor: millones(cc.gastado), falta: cc.conPrecio ? 'sin movimiento' : 'sin precio',
              nota: cc.pct != null ? `${pctEntero(cc.pct)} de lo contratado` : undefined },
            { rotulo: 'queda del contrato', valor: cc.queda != null && cc.queda < 0 ? `excedido ${millones(-cc.queda)}` : millones(cc.queda), falta: 'sin precio',
              tono: cc.queda != null && cc.queda < 0 ? 'neg' : undefined,
              nota: cc.queda != null ? 'para el costo que falta; no es el margen final' : undefined },
            { rotulo: 'obras sin precio', valor: `${sinPrecio.length} de ${obras.length}`, tono: sinPrecio.length ? 'warn' : undefined,
              nota: sinPrecio.length
                ? `${sinPrecio.length === 1 ? sinPrecio[0].nombre : `${sinPrecio.length} obras`}${cc.gastadoSinPrecio ? ` · ${millones(cc.gastadoSinPrecio)} gastados sin contrato` : ''}`
                : undefined },
          ]} />
          <PorClienteContrato clientes={clientesContrato} filtros={filtros} />
        </div>
      </Seccion>

      {/* LAS DOS BARRAS NO SE EXPLICABAN EN NINGUNA PARTE (dueño, 17/09/2026): la leyenda de colores dice
          de qué está hecha la gruesa, pero nada decía qué es la fina. */}
      <Seccion titulo="Presupuestado contra consumido" filo
        aclaracion="por cliente · la barra fina de arriba es lo presupuestado (el costo previsto en la cotización); la gruesa de abajo, lo consumido"
        leyenda={[...LEYENDA_GASTO, { color: 'bg-dato-cajon', rotulo: 'sin obra asignada' }]}>
        <PorCliente clientes={clientes} filtros={filtros} />
      </Seccion>

      {/* «OTROS» COMO COLUMNA PROPIA (dueño, 18/09/2026: «hacelo»): una fila por cliente, una columna por
          rubro, presupuestado → consumido en cada celda, y la fila Empresa que suma exactamente la cabecera.
          Los totales no cambian: «otros» ya estaba adentro; ahora se ve en su columna, con lo que contiene. */}
      <Seccion titulo="Por rubro" filo
        aclaracion="una columna por rubro, con el mismo color que en las barras; en cada celda, presupuestado → consumido. La columna Otros dice qué contiene al pasar el mouse.">
        <TablaPorRubro tabla={tablaPorRubro(obras, clientes)} />
      </Seccion>

      {/* QUÉ CONTIENE CADA RUBRO (dueño, 18/09/2026): la definición de una línea y, abierto, de qué está
          hecho en el presupuesto (insumos del documento) y en el gasto (familias, proveedores, quincenas). */}
      <Seccion titulo="Qué contiene cada rubro" filo
        aclaracion="los mismos cuatro rubros en el presupuesto (leído del documento de cotización de cada obra) y en el gasto (Compras y quincenas). Cada uno se abre.">
        <ContenidoRubros contenido={contenidoPorRubro(obras)} />
      </Seccion>

      <DeQueYObras obras={obras} clientes={clientes} filtros={filtros} />

      {/* DIRECTO CONTRA INDIRECTO (dueño, 18/09/2026). Dos porciones no son una torta: es un indicador. */}
      <Seccion titulo="Directo contra indirecto" filo aclaracion="la columna Tipo de Costo de Compras, más la mano de obra propia (directa por definición), en las obras de la vista">
        <TipoCostoIndicador t={tipoCostoDe(obras, tipoCosto)} />
      </Seccion>

      <Huecos obras={obras} sinPres={sinPres} />
      <div className="pb-7" />
    </>
  )
}

// ─── Contratado contra gastado, por cliente ─────────────────────────────────────────────────────
//
// La fila del diseño v6 tal cual (nombre y obras · barra fina y gruesa · una columna · la lectura), con
// el contrato en la barra fina. La tercera columna es el % gastado de lo contratado —las horas ya
// están en la lista de abajo—; la lectura, lo que queda del contrato con las palabras del diseño.

function PorClienteContrato({ clientes, filtros }: { clientes: FilaContrato[]; filtros: Filtros }) {
  if (!clientes.length) return <p className="text-sm text-faint">Ninguna obra con estos filtros.</p>
  const escala = Math.max(...clientes.map((c) => Math.max(c.contratado ?? 0, c.gastado ?? 0)), 1)
  return (
    <div className="flex flex-col border-t border-line" data-testid="resumen-contrato-por-cliente">
      {clientes.map((c) => (
        <Link key={c.clienteId} href={aUrl({ ...filtros, vista: 'obras', obra: c.obraPrincipal })} prefetch={false}
          data-testid="resumen-contrato-cliente"
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-line py-3.5 hover:bg-surface-quiet lg:grid-cols-[130px_minmax(0,1fr)_110px_150px]">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="truncate text-[13.5px] font-medium text-ink">{c.nombre}</div>
            <div className="text-[11.5px] text-faint">
              {c.obras} {c.obras === 1 ? 'obra' : 'obras'}{c.conPrecio ? ` · ${c.conPrecio} con precio` : ''}
              <span className="lg:hidden"> · {c.pct != null ? `${pctEntero(c.pct)} gastado` : 'sin %'}</span>
            </div>
          </div>
          <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-[5px] lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <div className="flex h-2.5 items-center gap-2">
              {c.contratado != null ? <div className="h-1.5 rounded-[2px] bg-dato-referencia" style={{ width: ancho(c.contratado, escala) }} /> : null}
              <div className={`whitespace-nowrap text-[11px] tabular-nums ${c.contratado != null ? 'text-muted' : 'text-warn'}`}>
                {c.contratado != null ? `${millones(c.contratado)}${c.enDolares ? ' · en U$S' : ''}` : 'sin precio'}
              </div>
            </div>
            <div className="flex h-3.5 items-center gap-2">
              <div className="flex h-3.5 overflow-hidden rounded-[2px]" style={{ width: ancho(c.gastado, escala) }}>
                {/* BARRA, NO TORTA: compara clientes entre sí y contra su contrato; una torta perdería la comparación. */}
                {ORDEN_RUBROS.map((k) => <div key={k} className={RUBRO_COLOR[k].clase} style={{ width: ancho(c[k], c.gastado) }} />)}
              </div>
              <div className="whitespace-nowrap text-xs font-semibold tabular-nums text-ink">
                {millones(c.gastado) ?? <span className="font-normal text-faint">{c.conPrecio ? 'sin movimiento' : 'sin precio'}</span>}
              </div>
            </div>
          </div>
          <div className="hidden flex-col gap-[3px] text-right lg:flex">
            <div className={`text-[12.5px] font-medium tabular-nums ${c.pct != null ? 'text-ink' : 'text-faint'}`}>{c.pct != null ? pctEntero(c.pct) : 'sin %'}</div>
            <div className="text-[11px] text-faint">gastado</div>
          </div>
          <LecturaContrato c={c} />
        </Link>
      ))}
    </div>
  )
}

/** Lo que queda del contrato, con las palabras del diseño: «queda del contrato» · «queda, en las N con precio» · «sin precio». */
function LecturaContrato({ c }: { c: FilaContrato }) {
  const [valor, nota, tono] = c.contratado == null
    ? ['sin precio', c.sinPrecio.some((o) => o.ausencia === 'sin valuar') ? 'una pata en dólares sin valuar' : 'ninguna obra tiene precio', 'text-warn']
    : c.queda != null && c.queda < 0
      ? [`excedido ${millones(-c.queda)}`, c.conPrecio < c.obras ? `en ${c.conPrecio === 1 ? 'la obra con precio' : `las ${c.conPrecio} con precio`}` : 'sobre el contrato', 'text-neg']
      : [millones(c.queda), c.conPrecio < c.obras ? `queda, en ${c.conPrecio === 1 ? 'la obra con precio' : `las ${c.conPrecio} con precio`}` : 'queda del contrato', 'text-ink']
  return (
    <div className="flex flex-col gap-[3px] text-right">
      <div className={`text-[12.5px] font-medium tabular-nums ${tono}`}>{valor}</div>
      <div className="text-[11px] text-faint">{nota}</div>
    </div>
  )
}

// ─── Presupuestado contra consumido, por cliente ────────────────────────────────────────────────

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
                {/* BARRA, NO TORTA: compara clientes entre sí y contra su presupuesto. */}
                {ORDEN_RUBROS.map((k) => <div key={k} className={RUBRO_COLOR[k].clase} style={{ width: ancho(c[k], c.total) }} />)}
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
      <div className="flex flex-col gap-4">
        {/* TORTA para la empresa (dueño, 18/09/2026): parte de un total de un vistazo, 4 porciones, con
            su total en el centro. Los clientes SIGUEN en barra: ahí lo que se compara es un cliente
            contra otro, y una torta por cliente no deja comparar. */}
        {mix[0] ? (
          <Torta testid="torta-gasto-empresa" titulo="Empresa" total={mix[0].total}
            {...porcionesDeRubros({ manoObra: mix[0].manoObra, materiales: mix[0].materiales, subcontratos: mix[0].subcontratos, otros: mix[0].otros })}
            nota="sin el cajón «sin obra asignada», que no es de ninguna obra" />
        ) : null}
        <div className="flex flex-col gap-3">
          {mix.slice(1).map((m) => <Mezcla key={m.nombre} m={m} empresa={false} />)}
        </div>
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
        {ORDEN_RUBROS.map((k) => (
          <div key={k} className={`flex items-center justify-center overflow-hidden whitespace-nowrap text-white ${RUBRO_COLOR[k].clase}`} style={{ width: ancho(m[k], m.total) }}>{rot(m[k])}</div>
        ))}
      </div>
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
  const sinPrecio = obras.filter((o) => o.precio == null)
  // OBRAS CON PRESUPUESTO A LAS QUE LES FALTA UN RUBRO, con el motivo del documento (recortado).
  const sinRubro = obras.filter((o) => o.presupuestoRubros).flatMap((o) => {
    const faltan = (Object.keys(o.presupuestoRubros ?? {}) as (keyof NonNullable<typeof o.presupuestoRubros>)[]).filter((k) => (o.presupuestoRubros?.[k] ?? null) == null)
    if (!faltan.length) return []
    const motivo = (o.presupuestoDetalle?.[faltan[0]]?.motivo ?? 'sin presupuesto de este rubro').split(';')[0].split(':')[0]
    return [{ obra: o.nombre, rubros: faltan.map((k) => ({ manoObra: 'mano de obra', materiales: 'materiales', subcontratos: 'subcontratistas', otros: 'otros' })[k]), motivo }]
  })
  const huecos = [
    // EL DISEÑO LO LLAMA «Margen por obra»: sin precio no hay contra qué medir lo gastado, y la obra queda afuera.
    sinPrecio.length ? {
      que: 'Gastado contra el contrato',
      porque: `${sinPrecio.map((o) => `${o.nombre}: ${o.ausencia === 'sin valuar' ? 'contrato en dólares sin valuar' : 'sin precio declarado'}`).join(' · ')}. Su gasto no entra a la cuenta del contrato.`,
      destraba: 'el precio de la obra o su contrato',
    } : null,
    est ? { que: 'Mano de obra real', porque: `El ${est.replace(' estimada', '')} de la mano de obra consumida es estimada: quincenas sin recibo del estudio, horas × tarifa.`, destraba: 'los recibos del estudio' } : null,
    sinPres.length ? { que: 'Consumo contra presupuesto', porque: sinPres.map((o) => `${o.nombre}: ${o.motivoPresupuesto ?? 'sin cotización aprobada'}`).join(' · '), destraba: 'cargar el costo cotizado' } : null,
    sinRubro.length ? {
      que: 'Rubros sin presupuesto',
      porque: sinRubro.map((x) => `${x.obra}: ${x.rubros.join(', ')} (${x.motivo})`).join(' · '),
      destraba: 'lo dice el documento: no se inventa un número',
    } : null,
    { que: 'Productividad', porque: 'Las horas entran por día y por obra; no bajan a la actividad.', destraba: 'horas por actividad' },
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

// ─── Qué contiene cada rubro ────────────────────────────────────────────────────────────────────

function ContenidoRubros({ contenido }: { contenido: ContenidoDeRubro[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="contenido-rubros">
      {contenido.map((c) => (
        <details key={c.rubro} className="group rounded-control border border-line" data-testid={`contenido-${c.rubro}`}>
          <summary className="cursor-pointer list-none px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-ink"><span className="mr-1 inline-block text-faint transition-transform group-open:rotate-90">›</span>{c.rotulo}</span>
              <span className="whitespace-nowrap text-[11.5px] tabular-nums text-muted">
                presupuestado {millones(c.presupuestado) ?? <span className="text-faint">—</span>} · consumido {millones(c.consumido) ?? <span className="text-faint">—</span>}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted">{c.definicion}</p>
          </summary>
          <div className="grid gap-4 border-t border-line px-3.5 py-3 text-[11.5px] leading-snug sm:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1 font-medium text-ink">En los presupuestos <span className="font-normal text-faint">· {c.obrasConPresupuesto} {c.obrasConPresupuesto === 1 ? 'obra' : 'obras'} lo cotizan</span></div>
              {c.itemsPresupuesto.length ? (
                <ul className="flex flex-col gap-px">
                  {c.itemsPresupuesto.slice(0, 10).map((g) => (
                    <li key={g.nombre} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 tabular-nums">
                      <span className="truncate text-ink">{g.nombre}<span className="text-faint"> · {g.obras} {g.obras === 1 ? 'obra' : 'obras'}</span></span>
                      <span className="whitespace-nowrap text-muted">{importe(g.monto)}</span>
                    </li>
                  ))}
                  {c.itemsPresupuesto.length > 10 ? <li className="text-faint">y {c.itemsPresupuesto.length - 10} más</li> : null}
                </ul>
              ) : <p className="text-faint">{c.presupuestado == null ? 'ninguna obra tiene presupuesto de este rubro' : 'previsto en cero'}</p>}
              {c.sinEsteRubro.length ? <p className="mt-2 text-faint">Sin presupuesto de este rubro: {c.sinEsteRubro.map((x) => x.nombre).join(', ')}.</p> : null}
            </div>
            <div className="min-w-0">
              <div className="mb-1 font-medium text-ink">En el gasto</div>
              {c.gruposConsumo.length ? (
                <ul className="flex flex-col gap-px">
                  {c.gruposConsumo.slice(0, 10).map((g) => (
                    <li key={g.nombre} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 tabular-nums">
                      <span className="truncate text-ink">{g.nombre}<span className="text-faint"> · {g.n}</span></span>
                      <span className="whitespace-nowrap text-muted">{importe(g.monto)}</span>
                    </li>
                  ))}
                  {c.gruposConsumo.length > 10 ? <li className="text-faint">y {c.gruposConsumo.length - 10} más</li> : null}
                </ul>
              ) : <p className="text-faint">{c.consumido == null ? 'sin movimiento' : 'sin detalle publicado'}</p>}
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}

// ─── Directo contra indirecto ───────────────────────────────────────────────────────────────────
//
// NO ES UNA TORTA (regla de la guía de visualización): con dos porciones el gráfico no dice más que el
// número. Se publica el número, el porcentaje y de dónde sale cada parte. «Estructura» con obra se dice
// aparte y no entra al costo: no es una compra y está en mudanza fuera de Compras.

export function TipoCostoIndicador({ t }: { t: TipoCostoDeObra | null }) {
  if (!t) {
    return (
      <p className="text-[12.5px] text-faint" data-testid="tipo-costo-pendiente">
        Pendiente: la función de la base que abre el Tipo de Costo por obra (migración 20260918T1530) todavía no está aplicada en producción. Hasta entonces no se calcula por otra vía.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4" data-testid="tipo-costo">
      <Cifras cifras={[
        { rotulo: 'directo', valor: millones(t.directo), falta: 'sin movimiento', nota: t.pctDirecto != null ? `${pctEntero(t.pctDirecto)} del costo · incluye ${millones(t.manoObra) ?? '$ 0'} de mano de obra propia` : undefined },
        { rotulo: 'indirecto', valor: millones(t.indirecto), falta: 'ninguno', nota: t.indirecto != null && t.enCosto ? `${pctEntero(t.indirecto / t.enCosto)} del costo` : 'compras de Administración y Taller imputadas a la obra' },
        { rotulo: 'sin tipo de costo', valor: millones(t.sinTipo), falta: 'ninguna', tono: t.sinTipo ? 'warn' : undefined, nota: t.sinTipo ? 'compras sin la columna completada: no se asumen directas' : undefined },
        { rotulo: 'estructura, en mudanza', valor: millones(t.estructuraEnMudanza), falta: 'ninguna', tono: t.estructuraEnMudanza ? 'warn' : undefined,
          nota: t.estructuraEnMudanza ? 'no es compra ni entra al costo de la obra; hoy sigue dentro de los cuatro rubros hasta que se mude' : undefined },
      ]} />
      <div className="grid gap-x-8 gap-y-1 text-[11.5px] leading-snug text-muted sm:grid-cols-3">
        {(Object.keys(DEFINICION_TIPO_COSTO) as (keyof typeof DEFINICION_TIPO_COSTO)[]).map((k) => (
          <div key={k}><span className="font-medium text-ink">{k}</span> · {DEFINICION_TIPO_COSTO[k]}</div>
        ))}
      </div>
    </div>
  )
}

// ─── Por rubro: la tabla con «Otros» como columna propia ────────────────────────────────────────

const RUBRO_CLAVES: Rubro[] = RUBROS.map((r) => r.clave)

function tituloDeCelda(rubro: Rubro, c: FilaPorRubro['porRubro'][Rubro]): string {
  const def = DEFINICION_RUBRO[rubro]
  const contiene = c.contenido.slice(0, 6).map((g) => `${g.nombre} ${millones(g.monto) ?? ''}`).join(' · ')
  return `${def}${contiene ? `\nEn el gasto: ${contiene}${c.contenido.length > 6 ? ' · …' : ''}` : ''}`
}

function CeldaRubro({ rubro, c }: { rubro: Rubro; c: FilaPorRubro['porRubro'][Rubro] }) {
  return (
    <td className="px-2 py-2 text-right align-top tabular-nums" title={tituloDeCelda(rubro, c)} data-testid={`celda-${rubro}`}>
      <div className="text-[11px] text-muted">{c.presupuestado == null ? <span className="text-faint">sin presup.</span> : millones(c.presupuestado)}</div>
      <div className="text-[12.5px] font-semibold text-ink">{c.consumido == null ? <span className="font-normal text-faint">—</span> : millones(c.consumido)}</div>
    </td>
  )
}

function TablaPorRubro({ tabla }: { tabla: ReturnType<typeof tablaPorRubro> }) {
  const encabezado = (r: Rubro) => (
    <th key={r} className="px-2 pb-2 text-right font-normal" scope="col">
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-ink"><span className={`size-2.5 rounded-[2px] ${RUBRO_COLOR[r].clase}`} />{RUBRO_COLOR[r].rotulo}</div>
      <div className="text-[10px] text-faint">presup. → consumido</div>
    </th>
  )
  const fila = (f: FilaPorRubro, empresa = false) => (
    <tr key={f.clienteId} className={`border-t border-line ${empresa ? 'bg-surface-quiet font-semibold' : ''}`} data-testid={empresa ? 'por-rubro-empresa' : 'por-rubro-cliente'}>
      <th scope="row" className="px-2 py-2 text-left align-top text-[12.5px] font-medium text-ink">
        {f.nombre}<div className="text-[10.5px] font-normal text-faint">{f.obras} {f.obras === 1 ? 'obra' : 'obras'}</div>
      </th>
      {RUBRO_CLAVES.map((r) => <CeldaRubro key={r} rubro={r} c={f.porRubro[r]} />)}
      <td className="px-2 py-2 text-right align-top tabular-nums" data-testid="celda-total">
        <div className="text-[11px] text-muted">{f.presupuestado == null ? <span className="text-faint">sin presup.</span> : millones(f.presupuestado)}</div>
        <div className="text-[12.5px] font-semibold text-ink">{f.consumido == null ? <span className="font-normal text-faint">—</span> : millones(f.consumido)}</div>
      </td>
    </tr>
  )
  return (
    <div className="barra-corrible -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <table className="w-full min-w-[640px] border-collapse" data-testid="tabla-por-rubro">
        <thead>
          <tr>
            <th className="px-2 pb-2 text-left text-[11px] font-normal text-faint" scope="col">cliente</th>
            {RUBRO_CLAVES.map(encabezado)}
            <th className="px-2 pb-2 text-right font-normal" scope="col"><div className="text-[11px] text-ink">total</div><div className="text-[10px] text-faint">presup. → consumido</div></th>
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f) => fila(f))}
          {fila(tabla.empresa, true)}
        </tbody>
      </table>
    </div>
  )
}
