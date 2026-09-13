// LA SOLAPA «ÓRDENES DE COMPRA Y DE PAGO» COMO REGISTRO (dueño, 13/09/2026).
//
// «Es como tirar documentos y archivos sin sentido alguno.» La solapa era una lista de PDFs por
// trabajo. Ahora cada OC es una FILA con su monto, lo facturado contra ella, lo cobrado, el saldo y
// su estado, y el PDF es un ícono de evidencia en la punta de la fila. Nada de esto se calcula acá:
// sale de `services/registroOrdenes.ts`, que se prueba sin navegador. Este archivo dibuja.
//
// DOS TABLAS, NO UNA. La OC es un compromiso con saldo; la OP es un pago. Mezclarlas en la misma
// tabla obligaría a columnas vacías en la mitad de las filas.
//
// SIN PÁRRAFOS: lo que explica una cifra va en el `title` de su columna o de su celda.

import type { ReactNode } from 'react'
import { IconoDocumento } from '@/shared/components/iconos'
import { fechaCortaConAnio, pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import { VARIAS_OBRAS } from '../services/papelesCliente'
import {
  ROTULO_ESTADO, SIN_TRABAJO, importeDeRenglones, totalDeGrupos, type EstadoOC, type FilaOC, type FilaOP,
  type FiltroRegistro, type GrupoRegistro, type Registro, type Renglon, type TotalOC,
} from '../services/registroOrdenes'

/** Nº · FECHA · MONTO · FACTURADO · COBRADO · POR FACTURAR · ESTADO · PDF. */
const COLS_OC = 'grid-cols-[88px_76px_repeat(4,minmax(0,1fr))_128px_24px]'
  + ' max-[899px]:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_112px_24px]'
  + ' max-[559px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24px]'
/** Nº · FECHA · TRABAJO · BRUTO · RETENCIÓN · NETO · PAGA · PDF. */
const COLS_OP = 'grid-cols-[88px_76px_minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,0.8fr)_24px]'
  + ' max-[899px]:grid-cols-[88px_76px_minmax(0,1fr)_minmax(0,1fr)_24px]'
  + ' max-[559px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24px]'
/** Lo que se suelta abajo de 900px: el desglose. Abajo de 560px: fecha, monto y trabajo. */
const ANCHO = 'max-[899px]:hidden'
const TABLET = 'max-[559px]:hidden'
/** El estado baja a la fila en el teléfono: ahí no hay columna para él. */
const SOLO_TELEFONO = 'hidden max-[559px]:inline'

const AYUDA_FACTURADO = 'Σ de las filas B de Cobranzas, ya emitidas, que CITAN esta OC en la columna '
  + 'ORDEN DE COMPRA (oc_declarada). Una factura que no la cita no suma: es un mínimo.'
const AYUDA_SALDO = 'Monto − facturado citado. Es un máximo: una factura que no cita la OC no lo descuenta.'
const AYUDA_COBRADO = 'De lo facturado contra esta OC, lo que Cobranzas da por cobrado (percibido).'
const AYUDA_PAGA = 'Las facturas que la OP cita. «no consta» = la cita de la OP no se extrae todavía.'
const AYUDA_RETENCION = 'Σ de los certificados de retención de la OP. «—» = no llegó o no trae importe.'
const AYUDA_CONCILIACION = 'Una OP se ata a un cobro por las facturas que cita. Hoy la cita de la OP no '
  + 'se extrae del PDF y Notas (W) de Cobranzas no llega a la base: por eso no hay ninguna atada.'

const TONO_ESTADO: Record<EstadoOC, string> = {
  'sin-dato': V.warn, 'sin-importe': V.warn, 'otra-moneda': V.apagado, 'sin-facturar': V.apagado,
  parcial: V.tinta, facturada: V.pos, excedida: V.neg,
}

const plata = (n: number | null, moneda: string | null = 'ARS') =>
  (n === null ? '—' : `${moneda === 'USD' ? 'U$S ' : ''}${pesos(n)}`)

const NUM = { fontSize: '12px', color: V.tinta, textAlign: 'right' as const }
const NUM_FUERTE = { ...NUM, fontWeight: 600 }
const FECHA = { fontSize: '11.5px', color: V.apagado }
const NOMBRE = { fontSize: '12px', fontWeight: 600, color: V.tinta }
const CELDA = 'truncate font-mono tabular-nums'
const FILA = { minHeight: 32, borderBottom: `1px solid ${V.lineaFila}` }

function Rotulo({ children, title, derecha }: { children: string; title?: string; derecha?: boolean }) {
  return (
    <span title={title} style={{
      fontSize: '10.5px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.tenue,
      textAlign: derecha ? 'right' : 'left', cursor: title ? 'help' : undefined, display: 'block',
    }}>{children}</span>
  )
}

function Evidencia({ href, enDrive, que }: { href: string; enDrive: boolean; que: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" data-testid="evidencia-orden"
      aria-label={`Abrir el PDF de la ${que}`}
      title={enDrive ? 'Abrir el PDF en Drive' : 'Descargar el PDF (todavía no está en Drive)'}
      className="flex items-center justify-center rounded hover:bg-surface-sunken" style={{ height: 24, color: V.apagado }}>
      <IconoDocumento className="h-[14px] w-[14px]" />
    </a>
  )
}

/** De dónde sale lo facturado, fila por fila del Sheet: la trazabilidad bajo demanda. */
function citasDe(r: readonly Renglon[]): string {
  if (!r.length) return 'Ninguna fila de Cobranzas cita esta OC.'
  const una = (x: Renglon) => `F${x.fila ?? '?'}${x.comprobante ? ` fact. ${x.comprobante}` : ''}`
    + `${x.circuito === 'N' ? ' (N)' : ''}${x.emitida ? '' : ' (a facturar)'}`
  return `Filas de Cobranzas que la citan: ${r.map(una).join(', ')}`
}

function detalleDe(o: FilaOC): string {
  return [
    o.neto ? 'importe SIN IVA: se compara contra el neto facturado' : 'importe con IVA',
    o.enN !== null ? `en N: ${pesos(o.enN)}` : null,
    o.aFacturar !== null ? `a facturar: ${pesos(o.aFacturar)}` : null,
    o.copias > 1 ? `${o.copias} copias del mismo PDF` : null,
    o.pagadaPor.length ? `pagada por OP ${o.pagadaPor.join(', ')}` : null,
  ].filter(Boolean).join(' · ')
}

function Estado({ e, clase = '' }: { e: EstadoOC; clase?: string }) {
  return (
    <span className={`truncate ${clase}`} data-testid="estado-oc" style={{ fontSize: '11.5px', color: TONO_ESTADO[e] }}>
      {ROTULO_ESTADO[e]}
    </span>
  )
}

function FilaDeOC({ o, sangria }: { o: FilaOC; sangria: number }) {
  return (
    <div id={o.ancla} role="row" data-testid="fila-oc" data-estado={o.estado}
      className={`grid items-center gap-[12px] ${COLS_OC} target:bg-surface-quiet`} style={{ ...FILA, paddingLeft: sangria }}>
      <span className="flex min-w-0 flex-col" title={detalleDe(o)}>
        <span className="truncate" style={NOMBRE}>OC {o.numeroCorto ?? 's/n'}</span>
        <Estado e={o.estado} clase={SOLO_TELEFONO} />
      </span>
      <span className={`${CELDA} ${TABLET}`} style={FECHA}>{fechaCortaConAnio(o.fecha) ?? 'sin fecha'}</span>
      <span className={`${CELDA} ${TABLET}`} style={NUM}>{plata(o.importe, o.moneda)}</span>
      <span className={`${CELDA} ${ANCHO}`} style={NUM} title={citasDe(o.renglones)}>{plata(o.facturado)}</span>
      <span className={`${CELDA} ${ANCHO}`} style={NUM}>{plata(o.cobrado)}</span>
      <span className={CELDA} style={NUM_FUERTE} data-testid="saldo-oc" title={AYUDA_SALDO}>{plata(o.saldo)}</span>
      <Estado e={o.estado} clase={TABLET} />
      <Evidencia href={o.href} enDrive={o.enDrive} que={`OC ${o.numeroCorto ?? 's/n'}`} />
    </div>
  )
}

function FilaDeTotal({ t, rotulo, sangria, testid }: { t: TotalOC; rotulo: string; sangria: number; testid: string }) {
  return (
    <div role="row" data-testid={testid} className={`grid items-center gap-[12px] ${COLS_OC}`}
      title={t.incompleto ? 'Total incompleto (·): alguna OC no tiene importe, está en U$S o mezcla neto con IVA.' : undefined}
      style={{ minHeight: 32, paddingLeft: sangria, borderBottom: `1px solid ${V.linea}` }}>
      <span className="truncate" style={NOMBRE}>{rotulo}</span>
      <span className={`${CELDA} ${TABLET}`} style={FECHA}>{t.n} OC</span>
      <span className={`${CELDA} ${TABLET}`} style={NUM_FUERTE}>{plata(t.importe)}</span>
      <span className={`${CELDA} ${ANCHO}`} style={NUM_FUERTE}>{plata(t.facturado)}</span>
      <span className={`${CELDA} ${ANCHO}`} style={NUM_FUERTE}>{plata(t.cobrado)}</span>
      <span className={CELDA} style={NUM_FUERTE}>{plata(t.saldo)}{t.incompleto ? ' ·' : ''}</span>
      <span className={TABLET} /><span />
    </div>
  )
}

function SinImputar({ registro }: { registro: Registro }) {
  if (!registro.sinImputar.length) return null
  const filas = registro.sinImputar.map((r) => `F${r.fila ?? '?'}`).join(', ')
  const sinPdf = registro.ocSinPapel.length ? ` · citan OC sin PDF: ${registro.ocSinPapel.join(', ')}` : ''
  return (
    <div role="row" data-testid="sin-imputar" className={`grid items-center gap-[12px] ${COLS_OC}`}
      title={`Filas B de Cobranzas que no citan una OC con PDF: ${filas}${sinPdf}`} style={FILA}>
      <span className="truncate" style={{ fontSize: '12px', color: V.warn }}>Sin imputar</span>
      <span className={`${CELDA} ${TABLET}`} style={FECHA}>{registro.sinImputar.length} filas</span>
      <span className={TABLET} />
      <span className={`${CELDA} ${ANCHO}`} style={NUM}>{plata(importeDeRenglones(registro.sinImputar))}</span>
      <span className={ANCHO} /><span /><span className={TABLET} /><span />
    </div>
  )
}

function TablaOC({ registro, grupos }: { registro: Registro; grupos: GrupoRegistro[] }) {
  return (
    <Seccion titulo="Órdenes de compra" n={registro.oc.length} testid="tabla-oc">
      <div role="row" className={`grid gap-[12px] ${COLS_OC}`} style={{ paddingBottom: 6, borderBottom: `1px solid ${V.linea}` }}>
        <Rotulo>Nº</Rotulo>
        <span className={TABLET}><Rotulo>Fecha</Rotulo></span>
        <span className={TABLET}><Rotulo derecha>Monto</Rotulo></span>
        <span className={ANCHO}><Rotulo derecha title={AYUDA_FACTURADO}>Facturado</Rotulo></span>
        <span className={ANCHO}><Rotulo derecha title={AYUDA_COBRADO}>Cobrado</Rotulo></span>
        <Rotulo derecha title={AYUDA_SALDO}>Por facturar</Rotulo>
        <span className={TABLET}><Rotulo>Estado</Rotulo></span>
        <span />
      </div>
      {grupos.filter((g) => g.oc.length).map((g) => (
        <div key={g.clave} data-testid="grupo-oc" data-obra={g.clave === SIN_TRABAJO ? undefined : g.clave}>
          <FilaDeTotal t={g.totalOC} rotulo={g.nombre} sangria={g.nivel ? 24 : 0} testid="total-oc-trabajo" />
          {g.oc.map((o) => <FilaDeOC key={o.ancla} o={o} sangria={g.nivel ? 40 : 16} />)}
        </div>
      ))}
      <SinImputar registro={registro} />
      <FilaDeTotal t={totalDeGrupos(grupos)} rotulo="Total del cliente" sangria={0} testid="total-oc-cliente" />
    </Seccion>
  )
}

function FilaDeOP({ o, nombreDeObra }: { o: FilaOP; nombreDeObra: Map<string, string> }) {
  const trabajo = !o.obraId ? 'sin trabajo'
    : o.obraId === VARIAS_OBRAS ? 'varias obras' : (nombreDeObra.get(o.obraId) ?? o.obraId)
  return (
    <div id={o.ancla} role="row" data-testid="fila-op" data-atada={o.cobroAtado ? '' : undefined}
      className={`grid items-center gap-[12px] ${COLS_OP} target:bg-surface-quiet`} style={FILA}>
      <span className="truncate" style={NOMBRE}>OP {o.numeroCorto ?? 's/n'}</span>
      <span className={`${CELDA} ${TABLET}`} style={FECHA}>{fechaCortaConAnio(o.fecha) ?? 'sin fecha'}</span>
      <span className={`truncate ${TABLET}`} style={{ fontSize: '12px', color: o.obraId ? V.tinta : V.tenue }}>{trabajo}</span>
      <span className={CELDA} style={NUM}>{plata(o.importe, o.moneda)}</span>
      <span className={`${CELDA} ${ANCHO}`} style={NUM} title={`${o.nRetenciones} certificado(s) de retención`}>{plata(o.retenciones)}</span>
      <span className={`${CELDA} ${ANCHO}`} style={NUM}>{plata(o.neto)}</span>
      <span className={`truncate ${ANCHO}`} style={{ fontSize: '11.5px', color: o.facturas.length ? V.tinta : V.tenue }}>
        {o.facturas.length ? `fact. ${o.facturas.join(' + ')}` : 'no consta'}
      </span>
      <Evidencia href={o.href} enDrive={o.enDrive} que={`OP ${o.numeroCorto ?? 's/n'}`} />
    </div>
  )
}

function TablaOP({ registro, nombreDeObra }: { registro: Registro; nombreDeObra: Map<string, string> }) {
  const sinAtar = registro.op.filter((o) => !o.cobroAtado).length
  return (
    <Seccion titulo="Órdenes de pago" n={registro.op.length} testid="tabla-op">
      <p data-testid="conciliacion-op" className="font-mono tabular-nums" title={AYUDA_CONCILIACION}
        style={{ fontSize: '11.5px', color: sinAtar ? V.warn : V.apagado, margin: '0 0 8px' }}>
        {sinAtar} OP sin cobro atado · {registro.cobrosSinOP.length} cobros sin OP
      </p>
      <div role="row" className={`grid gap-[12px] ${COLS_OP}`} style={{ paddingBottom: 6, borderBottom: `1px solid ${V.linea}` }}>
        <Rotulo>Nº</Rotulo>
        <span className={TABLET}><Rotulo>Fecha</Rotulo></span>
        <span className={TABLET}><Rotulo>Trabajo</Rotulo></span>
        <Rotulo derecha>Bruto</Rotulo>
        <span className={ANCHO}><Rotulo derecha title={AYUDA_RETENCION}>Retención</Rotulo></span>
        <span className={ANCHO}><Rotulo derecha>Neto</Rotulo></span>
        <span className={ANCHO}><Rotulo title={AYUDA_PAGA}>Paga</Rotulo></span>
        <span />
      </div>
      {registro.op.map((o) => <FilaDeOP key={o.ancla} o={o} nombreDeObra={nombreDeObra} />)}
    </Seccion>
  )
}

function Filtros({ filtro, grupos, periodos, accion }: {
  filtro: FiltroRegistro; grupos: GrupoRegistro[]; periodos: string[]; accion: string
}) {
  const control = { height: 28, fontSize: '12px', color: V.tinta, border: `1px solid ${V.linea}`, borderRadius: 4, padding: '0 8px' }
  return (
    <form method="get" action={accion} data-testid="filtros-ordenes" className="flex flex-wrap items-center gap-[8px]">
      <input type="hidden" name="vista" value="ordenes" />
      <select name="oobra" defaultValue={filtro.obra ?? ''} aria-label="Trabajo" className="bg-surface" style={control}>
        <option value="">Todos los trabajos</option>
        {grupos.map((g) => <option key={g.clave} value={g.clave}>{g.nivel ? '— ' : ''}{g.nombre}</option>)}
      </select>
      <select name="oestado" defaultValue={filtro.estado ?? ''} aria-label="Estado de la OC" className="bg-surface" style={control}>
        <option value="">Todos los estados</option>
        {(Object.keys(ROTULO_ESTADO) as EstadoOC[]).map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}
      </select>
      <select name="operiodo" defaultValue={filtro.periodo ?? ''} aria-label="Año" className="bg-surface" style={control}>
        <option value="">Todos los años</option>
        {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button type="submit" style={{ ...control, background: V.grafito, color: V.fondo, border: 'none' }}>Filtrar</button>
    </form>
  )
}

function Seccion({ titulo, n, children, testid }: { titulo: string; n: number; children: ReactNode; testid: string }) {
  return (
    <section data-testid={testid} className="flex flex-col">
      <h3 className="flex items-baseline gap-[8px]" style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, margin: '0 0 8px' }}>
        {titulo}<span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue }}>{n}</span>
      </h3>
      {children}
    </section>
  )
}

export function RegistroDeOrdenes({ registro, grupos, todosLosGrupos, filtro, periodos, accion, nombreDeObra }: {
  /** `null` = los papeles no se pudieron leer. «No pude leerlas» no se dibuja como «no hay». */
  registro: Registro | null
  /** Los grupos YA filtrados: lo que se dibuja y lo que se suma al pie. */
  grupos: GrupoRegistro[]
  /** Los grupos SIN filtrar: el selector de trabajo no puede achicarse al elegir uno. */
  todosLosGrupos: GrupoRegistro[]
  filtro: FiltroRegistro
  periodos: string[]
  /** La dirección de la ficha: el formulario de filtros vuelve a ella por GET. */
  accion: string
  nombreDeObra: Map<string, string>
}) {
  if (registro === null) {
    return <p style={{ fontSize: '12.5px', color: V.warn }}>No pude leer las órdenes: no se puede afirmar que no haya ninguna.</p>
  }
  if (!todosLosGrupos.length) {
    return <p data-testid="ordenes-cliente-vacio" style={{ fontSize: '12.5px', color: V.apagado }}>Sin órdenes de compra ni de pago registradas.</p>
  }
  return (
    <div className="flex flex-col gap-[24px]" data-testid="registro-ordenes">
      <Filtros filtro={filtro} grupos={todosLosGrupos} periodos={periodos} accion={accion} />
      {!registro.cobranzasLeidas && (
        <p style={{ fontSize: '12px', color: V.warn }}>No pude leer Cobranzas: facturado, cobrado y saldo quedan sin dato.</p>
      )}
      <TablaOC registro={registro} grupos={grupos} />
      <TablaOP registro={registro} nombreDeObra={nombreDeObra} />
    </div>
  )
}
