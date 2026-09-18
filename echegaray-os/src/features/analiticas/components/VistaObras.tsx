// OBRAS — una obra elegida: cada rubro presupuestado contra consumido, qué contiene cada uno, a qué
// ritmo consume y cuánto costó su hora.
//
// Estructura confirmada por el dueño (17/09/2026): absorbe lo útil de «Contrato y gasto» (los pares de
// barras cotizado/gastado del diseño v6), de «Gasto por obra» (el % y la composición) y de «Costo por
// hora» ($/h medido contra la empresa). No repite las cifras generales: ésas son del Resumen.
//
// ═══ LOS CUATRO RUBROS, CADA UNO CON LO QUE CONTIENE (dueño, 18/09/2026) ═══
//
// Mano de obra · Materiales · Subcontratistas · Otros, los mismos en el presupuesto (leído del documento
// de cotización) y en el gasto (Compras + quincenas), con la definición de una línea debajo del nombre y
// un «qué contiene» que abre los insumos del documento y los grupos del gasto. Ya no hay un «queda
// combinado» de materiales y subcontratos: el presupuesto los separa.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctConSigno, pctEntero, porHora } from '../services/formato'
import { celda, cierreDeRubro, costoPorHora, definicionDe, ITEMS, porHoraMedido, UMBRAL_HORA_CARA, type Celda, type Item } from '../services/agregados'
import { mesesParaAgotar, type MesDeConsumo, type Ritmo } from '../services/consumo'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, Seccion, TONO_TEXTO } from './Piezas'
import { DetalleRubro } from './DetalleRubro'
import { Columnas } from './VistasEmpresa'

const ORIGEN_CONTRATO: Record<string, string> = {
  contrato: 'según contrato', oc: 'según OC del cliente', 'oc-cliente': 'según OC del cliente', presupuesto: 'según cotización aprobada',
  'oc-pesos': 'según OBRAS', 'oc-usd-x-tc': 'en U$S, al dólar de hoy', formulario: 'declarado en la obra', 'suma-viva': 'lo facturado hasta hoy, no es precio',
}

export function VistaObras({ obras, obra, filtros, consumo, ritmo, sinIva }: {
  obras: ObraAnalitica[]
  obra: ObraAnalitica | null
  filtros: Filtros
  consumo: MesDeConsumo[] | null
  ritmo: Ritmo | null
  /** Comprobantes tomados al total por no discriminar IVA; `null` = la base todavía no publica el neto. */
  sinIva: number | null
}) {
  if (!obra) return <p className="mt-9 text-sm text-muted">Ninguna obra con estos filtros.</p>
  const queda = obra.presupuesto != null ? obra.presupuesto - (obra.consumoComparable ?? 0) : null
  const meses = mesesParaAgotar(queda, ritmo?.porMes ?? null)
  const origen = obra.contrato.origen ? ORIGEN_CONTRATO[obra.contrato.origen] ?? obra.contrato.origen : null
  const conPresupuesto = obra.presupuestoRubros ? ITEMS.filter((i) => i.clave !== 'horas' && (obra.presupuestoRubros?.[i.clave as Exclude<Item, 'horas'>] ?? null) != null).map((i) => i.rotulo.toLowerCase()) : []
  return (
    <>
      <Selector obras={obras} elegida={obra.id} filtros={filtros} />
      <Cabecera titulo={obra.nombre}
        detalle={<>
          {obra.clienteNombre}
          {obra.precio != null ? ` · contratado ${millones(obra.precio)}${obra.precioEnDolares ? ' (en U$S)' : ''}${origen ? ` · ${origen}` : ''}` : obra.contrato.origen === 'suma-viva' ? ' · sin precio: lo que OBRAS tiene es lo facturado' : ' · sin precio'}
          {obra.fuentePresupuesto ? ` · presupuesto: ${obra.fuentePresupuesto}` : ''}
          {obra.presupuestoEstimado ? ' · presupuesto estimado' : ''}
        </>}
        cifras={[
          { rotulo: 'presupuestado', valor: millones(obra.presupuesto), falta: 'sin presupuesto',
            nota: obra.presupuesto != null ? `${conPresupuesto.join(', ')} cotizados` : (obra.motivoPresupuesto ?? undefined) },
          { rotulo: 'consumido', valor: millones(obra.presupuesto != null ? obra.consumoComparable : obra.gasto.total), falta: 'sin movimiento', nota: obra.presupuesto != null ? 'en esos rubros' : undefined },
          { rotulo: queda != null && queda < 0 ? 'excedido' : 'queda', valor: queda != null ? millones(Math.abs(queda)) : null, falta: '—', tono: queda != null && queda < 0 ? 'neg' : undefined, nota: obra.avanceGasto != null ? `${pctEntero(obra.avanceGasto)} consumido` : undefined },
          // A QUÉ VELOCIDAD CONSUME Y CUÁNTO DURA LO QUE QUEDA, dicho en palabras: «ritmo por mes ·
          // alcanza 2,9 meses» no decía ninguna de las dos cosas (dueño, 17/09/2026).
          { rotulo: 'consume por mes', valor: ritmo?.porMes != null ? millones(ritmo.porMes) : null, falta: consumo == null ? 'sin publicar' : 'sin consumo reciente',
            nota: ritmo?.porMes != null ? `a este ritmo viene consumiendo en los últimos 3 meses cerrados${ritmo.conEstimada ? ', con mano de obra estimada' : ''}${meses != null ? `; a ese ritmo lo que queda alcanza para ${meses === 0 ? '0 meses' : `${meses.toLocaleString('es-AR', { maximumFractionDigits: 1 })} meses`}` : ''}` : undefined },
        ]} />
      <Seccion titulo="Rubro contra rubro" aclaracion="cada rubro del gasto contra el mismo rubro del presupuesto leído del documento de cotización. Debajo de cada uno, qué contiene.">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5" data-testid="rubros">
          {ITEMS.map((i) => <Rubro key={i.clave} obra={obra} item={i.clave} rotulo={i.rotulo} c={celda(obra, i.clave)} />)}
        </div>
        <NotaIva sinIva={sinIva} />
      </Seccion>
      <Seccion titulo="Consumo por mes" filo
        aclaracion="materiales, subcontratistas y otros por fecha del comprobante; mano de obra por la quincena en que empieza"
        leyenda={[{ color: 'bg-accent', rotulo: 'mano de obra' }, { color: 'bg-muted', rotulo: 'subcontratistas' }, { color: 'bg-dato-materiales', rotulo: 'materiales' }, { color: 'bg-dato-otros', rotulo: 'otros' }]}>
        <ConsumoMensual consumo={consumo} />
      </Seccion>
      <Seccion titulo="Costo de la hora" filo arriba="">
        <CostoHora obra={obra} obras={obras} />
      </Seccion>
      <div className="pb-9" />
    </>
  )
}

function Selector({ obras, elegida, filtros }: { obras: ObraAnalitica[]; elegida: string; filtros: Filtros }) {
  return (
    <nav aria-label="Obra" className="barra-corrible -mx-4 mt-6 flex gap-1.5 px-4 lg:mx-0 lg:mt-7 lg:flex-wrap lg:px-0">
      {[...obras].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((o) => (
        <Link key={o.id} prefetch={false} href={aUrl({ ...filtros, obra: o.id })} aria-current={o.id === elegida ? 'page' : undefined} data-testid={`obra-${o.id}`}
          className={`flex h-9 shrink-0 items-center whitespace-nowrap rounded-control px-3.5 text-[13px] lg:h-[30px] ${o.id === elegida ? 'bg-marca font-medium text-accent' : 'text-ink-soft hover:bg-surface-sunken'}`}>
          {o.nombre}
        </Link>
      ))}
    </nav>
  )
}

/** Un rubro: la definición, la barra fina de lo cotizado, la gruesa de lo consumido, qué queda y qué contiene. Medidas del diseño v6. */
function Rubro({ obra, item, rotulo, c }: { obra: ObraAnalitica; item: Item; rotulo: string; c: Celda }) {
  const fmt = item === 'horas' ? horasTexto : millones
  const escala = Math.max(c.cotizado ?? 0, c.gastado ?? 0)
  const excedido = c.lectura?.tipo === 'excedido' || c.lectura?.tipo === 'noPrevisto'
  const sinPres = c.lectura?.tipo === 'sinPresupuesto'
  const tono = excedido ? 'bg-neg' : sinPres ? 'bg-warn' : 'bg-accent'
  const gColor = c.gastado == null ? 'text-faint' : excedido ? 'text-neg' : sinPres ? 'text-warn' : 'text-ink'
  const definicion = definicionDe(item)
  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-testid={`rubro-${item}`}>
      <div className="text-[13px] font-semibold text-ink">{rotulo}</div>
      {definicion ? <p className="-mt-1 text-[10.5px] leading-snug text-faint" data-testid={`definicion-${item}`}>{definicion}</p> : null}
      <Par rotulo="cotizado" ancho={ancho(c.cotizado, escala)} barra="bg-dato-referencia"
        valor={c.cotizado != null ? `${fmt(c.cotizado)}${c.estimado ? ' est.' : ''}` : '—'} color={c.cotizado != null ? 'text-ink' : 'text-faint'} titulo={c.cotizadoAusente ?? undefined} />
      <Par rotulo="consumido" ancho={ancho(c.gastado, escala)} barra={tono}
        valor={c.gastado != null ? fmt(c.gastado) : (c.gastadoAusente ?? (item === 'horas' ? 'sin horas' : 'sin movimiento'))} color={gColor} fuerte />
      <LecturaRubro c={c} item={item} />
      {c.consumoEstimado ? <div className="pl-[68px] text-[10.5px] text-faint">{c.consumoEstimado}</div> : null}
      {item !== 'horas' ? (
        <DetalleRubro rotulo={rotulo} presupuesto={obra.presupuestoDetalle?.[item] ?? null} consumo={obra.consumoDetalle?.[item] ?? null} fuente={obra.fuentePresupuesto} />
      ) : null}
    </div>
  )
}

/**
 * DEBAJO DE LOS RUBROS: con qué base se midió lo consumido. Un número con IVA no se compara con un
 * presupuesto sin IVA. Empieza nombrando lo que corrige —«todo lo consumido»— (dueño, 17/09/2026).
 */
function NotaIva({ sinIva }: { sinIva: number | null }) {
  return (
    <p data-testid="nota-iva" className="mt-4 text-[10.5px] text-muted">
      {sinIva == null ? 'todo lo consumido está medido con IVA: la base todavía no publica el neto'
        : `todo lo consumido está medido neto de IVA · ${sinIva} ${sinIva === 1 ? 'comprobante no discrimina' : 'comprobantes no discriminan'} el IVA y ${sinIva === 1 ? 'se tomó' : 'se tomaron'} por el total`}
    </p>
  )
}

function Par({ rotulo, ancho: w, barra, valor, color, fuerte = false, titulo }: {
  rotulo: string; ancho: string; barra: string; valor: string | null; color: string; fuerte?: boolean; titulo?: string
}) {
  return (
    <div className="grid h-[18px] grid-cols-[60px_minmax(0,1fr)_minmax(0,auto)] items-center gap-2">
      <div className="text-[11px] text-faint">{rotulo}</div>
      <div className="h-2.5 min-w-0"><div className={`h-full rounded-[2px] ${barra}`} style={{ width: w }} /></div>
      <div className={`max-w-[150px] truncate whitespace-nowrap text-right ${fuerte ? 'text-[12.5px] font-semibold' : 'text-xs'} ${color}`} title={titulo ?? valor ?? undefined}>{valor}</div>
    </div>
  )
}

function LecturaRubro({ c, item }: { c: Celda; item: Item }) {
  const { texto, tono } = cierreDeRubro(c, item)
  return <div className={`min-h-[34px] pl-[68px] text-[11.5px] leading-snug ${TONO_TEXTO[tono]}`} data-testid={`lectura-${item}`}>{texto}</div>
}

function ConsumoMensual({ consumo }: { consumo: MesDeConsumo[] | null }) {
  if (consumo == null) return <p className="text-[12.5px] text-faint">El consumo mes a mes todavía no se publica en la base.</p>
  const conMes = consumo.filter((m): m is MesDeConsumo & { mes: string } => m.mes != null).slice(-12)
  const sinFecha = consumo.filter((m) => m.mes == null).reduce((a, m) => a + (m.materiales ?? 0) + (m.subcontratos ?? 0) + (m.otros ?? 0), 0)
  if (!conMes.length) return <p className="text-[12.5px] text-faint">Sin consumo registrado.</p>
  const total = (m: MesDeConsumo) => (m.manoObra ?? 0) + (m.subcontratos ?? 0) + (m.materiales ?? 0) + (m.otros ?? 0)
  const max = Math.max(1, ...conMes.map(total))
  return (
    <>
      <Columnas meses={conMes.map((m) => ({
        mes: m.mes, valor: millones(total(m)),
        partes: [
          { alto: ((m.otros ?? 0) / max) * 170, clase: 'bg-dato-otros' },
          { alto: ((m.materiales ?? 0) / max) * 170, clase: 'bg-dato-materiales' },
          { alto: ((m.subcontratos ?? 0) / max) * 170, clase: 'bg-muted' },
          { alto: ((m.manoObra ?? 0) / max) * 170, clase: 'bg-accent' },
        ],
      }))} />
      {sinFecha > 0 ? <p className="mt-3 text-[11.5px] text-faint">{millones(sinFecha)} en comprobantes sin fecha: no tienen mes.</p> : null}
    </>
  )
}

function CostoHora({ obra, obras }: { obra: ObraAnalitica; obras: ObraAnalitica[] }) {
  const medido = porHoraMedido(obra)
  const empresa = costoPorHora(obras).empresa
  const contra = medido != null && empresa ? medido / empresa - 1 : null
  const est = rotuloEstimada(obra.gasto)
  return (
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
      <Dato rotulo="costo de la hora, esta obra" valor={porHora(medido)} tono={contra != null && contra > UMBRAL_HORA_CARA ? 'text-warn' : 'text-ink'}
        falta={obra.gasto.manoObra && est ? 'sin medir' : 'sin horas'} nota={medido == null && est ? `la mano de obra es ${est}: horas × tarifa no mide la hora` : contra != null ? `${pctConSigno(contra)} contra la empresa` : undefined} />
      <Dato rotulo="costo de la hora, empresa" valor={porHora(empresa)} falta="sin medir" nota="sólo obras con recibo" />
      <Dato rotulo="horas cargadas" valor={horasTexto(obra.gasto.horas)} falta="sin horas" nota={horasTexto(obra.gasto.horasValorizadas) ? `${horasTexto(obra.gasto.horasValorizadas)} con costo` : undefined} />
    </div>
  )
}

function Dato({ rotulo, valor, falta, nota, tono = 'text-ink' }: { rotulo: string; valor: string | null; falta: string; nota?: string; tono?: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className="text-[11px] text-faint">{rotulo}</div>
      <div className={`text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${valor == null ? 'text-faint' : tono}`}>{valor ?? falta}</div>
      {nota ? <div className="text-[11.5px] text-muted">{nota}</div> : null}
    </div>
  )
}
