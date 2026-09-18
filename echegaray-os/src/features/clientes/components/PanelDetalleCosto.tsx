'use client'

// EL PANEL DE LO QUE COMPONE UNA CELDA DE COSTO — lo que el clic en Materiales, Subcontratos, Mano de
// obra o HH promete que hay adentro (dueño, 15/09/2026).
//
// ═══ EL TOTAL DEL PANEL ES EL DE LA CELDA, O SE DICE ═══
//
// Las filas se SUMAN acá (`sumaDeFilas`) y se cotejan contra el número que la tabla dibujó: si no
// cierran al centavo, el pie lo escribe en ámbar. Un panel que muestra 11 comprobantes que suman otra
// cosa que la celda es exactamente el «has inventado costos» que motivó esto.
//
// ═══ DOS COLUMNAS: A LA FECHA · POR VENCER ═══
//
// Cada comprobante entra por lo que Compras dice de él (Pagado → entero; vencimiento posterior a hoy →
// sólo lo pagado). Lo por vencer se lista al lado, nunca sumado, y el pie lo totaliza aparte.
//
// EL PANEL VIVE EN LA URL (`?trabajo=<obra>&rubro=` · `?sinobra=1&rubro=`): se comparte por chat, se
// cierra con el botón de atrás y lo lee el SERVIDOR con la RLS de quien mira. Este componente no lee
// nada: recibe el detalle ya convertido. Lista densa, sin tarjetas, sin sombras, en la grilla de 8.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { hh as fmtHH, plataCentavos } from '@/shared/utils/format'
import { diaMesISO } from '@/shared/utils/fecha'
import { etiquetaDeBloque } from '../services/desgloseHH'
import {
  avisoDeCotejo, subtituloDelDetalle, sumaDeFilas,
  type ComprobanteDeDetalle, type DetalleCosto, type PersonaDeHH, type QuincenaDePersona, type Rubro,
} from '../services/detalleCostoDeObra'

const MONO = 'font-mono tabular-nums'
const FILA = { display: 'grid', gap: 8, alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${V.lineaFila}` } as const
const CABEZA = { fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue } as const
const COLS_COMPROBANTE = '40px minmax(0,1fr) 88px 88px'
const COLS_QUINCENA = '58px minmax(0,1fr) 44px 92px'
const COLS_PERSONA = 'minmax(0,1fr) 36px 96px 60px'

export function PanelDetalleCosto({
  titulo, rubro, detalle, error, celda, cerrarHref, hrefDesgloseHH, hrefComprasBase,
}: {
  titulo: string
  rubro: Rubro
  /** `null` sin `error` = no puedo verlo: lo ve Administración. */
  detalle: DetalleCosto | null
  error: string | null
  /** Lo que la celda dibujó, para cotejar. `null` = la celda estaba vacía o decía «—». */
  celda: number | null
  cerrarHref: string
  /** La pantalla completa persona × día (`?hh=`), sólo en el rubro HH de una obra. */
  hrefDesgloseHH: string | null
  /** Adónde va cada comprobante: la fila en la pestaña Compras. Se completa con la fila. */
  hrefComprasBase: string
}) {
  const router = useRouter()
  return (
    <Drawer
      titulo={titulo}
      subtitulo={subtituloDelDetalle(rubro, detalle)}
      ancho={460}
      onCerrar={() => router.push(cerrarHref)}
      testid="panel-detalle-costo"
    >
      {error && <p style={{ fontSize: '12.5px', color: V.warn }}>{`No pude leer el detalle: ${error}`}</p>}
      {!error && !detalle && (
        <p data-testid="detalle-sin-permiso" style={{ fontSize: '12.5px', color: V.apagado }}>
          No puedo mostrar este detalle: lo ve Administración.
        </p>
      )}
      {detalle?.rubro === 'hh' && <ListaHH filas={detalle.filas} href={hrefDesgloseHH} />}
      {detalle?.rubro === 'mo' && (
        <ListaManoObra filas={detalle.filas} horasSinTarifa={detalle.horasSinTarifa} puedeVerTarifas={detalle.puedeVerTarifas} />
      )}
      {(detalle?.rubro === 'materiales' || detalle?.rubro === 'subcontratos' || detalle?.rubro === 'otros') && (
        <ListaComprobantes filas={detalle.filas} corte={detalle.corte} base={hrefComprasBase} />
      )}
      {detalle && <Cotejo detalle={detalle} total={sumaDeFilas(detalle)} celda={celda} />}
    </Drawer>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <p data-testid="detalle-vacio" style={{ fontSize: '12.5px', color: V.apagado, padding: '4px 0' }}>{texto}</p>
}

// ═══ MATERIALES Y SUBCONTRATOS: comprobante por comprobante, a la fecha y por vencer ═══

function ListaComprobantes({ filas, corte, base }: { filas: ComprobanteDeDetalle[]; corte: string | null; base: string }) {
  if (filas.length === 0) return <Vacio texto="Ningún comprobante asignado." />
  const porVencer = filas.reduce((a, f) => a + f.porVencer, 0)
  return (
    <div data-testid="detalle-comprobantes">
      <div style={{ ...FILA, gridTemplateColumns: COLS_COMPROBANTE, borderBottom: `1px solid ${V.lineaFuerte}` }}>
        <span style={CABEZA}>Fecha</span>
        <span style={CABEZA}>Proveedor · concepto</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>A la fecha</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Por vencer</span>
      </div>
      {filas.map((f) => <Comprobante key={f.referencia ?? `${f.fila}`} f={f} base={base} />)}
      <div data-testid="detalle-total" style={{ ...FILA, gridTemplateColumns: COLS_COMPROBANTE, borderBottom: 'none', paddingTop: 8 }}>
        <span />
        <span style={{ fontSize: '12px', fontWeight: 600, color: V.tinta }}>Total</span>
        <span className={MONO} style={{ fontSize: '12px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}>
          {plataCentavos(sumaALaFecha(filas))}
        </span>
        <span className={MONO} style={{ fontSize: '12px', color: V.tenue, textAlign: 'right' }}>
          {porVencer ? plataCentavos(porVencer) : ''}
        </span>
      </div>
      {porVencer > 0 && (
        <p data-testid="detalle-por-vencer" style={{ fontSize: '11.5px', color: V.tenue, paddingTop: 4 }}>
          {`Por vencer: cuotas con vencimiento posterior al ${diaMesISO(corte) ?? 'corte'}. No entran a la fecha.`}
        </p>
      )}
    </div>
  )
}

/** Σ a la fecha, sumada de las filas que se ven. */
function sumaALaFecha(filas: ComprobanteDeDetalle[]): number {
  return filas.reduce((a, f) => a + f.aLaFecha, 0)
}

function Comprobante({ f, base }: { f: ComprobanteDeDetalle; base: string }) {
  // LA CUOTA ADELANTE: seis cuotas con el mismo concepto largo se veían idénticas porque el recorte se comía el
  // «cuota N de 6» del final (QA 15/09). El tramo que las distingue va primero; el texto entero queda en el title.
  const cuota = f.concepto?.match(/(cuota|pago)\s+\d+\s+de\s+\d+/i)?.[0] ?? null
  const conceptoOrdenado = cuota && f.concepto ? `${cuota} · ${f.concepto.replace(cuota, '').replace(/\s*·\s*$/, '').replace(/^\s*·\s*/, '').trim()}` : f.concepto
  const detalle = [f.comprobante, conceptoOrdenado].filter((x) => x).join(' · ')
  const detalleCompleto = [f.comprobante, f.concepto].filter((x) => x).join(' · ')
  const cuerpo = (
    <>
      <span className={MONO} style={{ fontSize: '11.5px', color: V.tenue }}>{diaMesISO(f.fecha) ?? '—'}</span>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span className="truncate" style={{ fontSize: '12px', fontWeight: 500, color: V.tinta }}>{f.proveedor ?? 'sin proveedor'}</span>
        {detalle && <span className="truncate" title={detalleCompleto} style={{ fontSize: '11px', color: V.apagado }}>{detalle}</span>}
      </span>
      <span className={MONO} style={{ fontSize: '12px', color: V.tinta, textAlign: 'right' }}>{plataCentavos(f.aLaFecha)}</span>
      <span
        className={MONO}
        title={f.fechaPrevista ? `Vence el ${diaMesISO(f.fechaPrevista)} · ${f.estado ?? 'sin estado'}` : undefined}
        style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}
      >
        {f.porVencer ? plataCentavos(f.porVencer) : ''}
      </span>
    </>
  )
  const estilo = { ...FILA, gridTemplateColumns: COLS_COMPROBANTE }
  // LA FILA LLEVA A SU COMPROBANTE EN COMPRAS, que es donde se corrige el estado o el vencimiento.
  return f.fila != null
    ? <Link href={`${base}${f.fila}`} prefetch={false} data-testid="detalle-comprobante" className="hover:bg-[#F2F1ED]" style={estilo}>{cuerpo}</Link>
    : <div data-testid="detalle-comprobante" style={estilo}>{cuerpo}</div>
}

// ═══ MANO DE OBRA: persona × quincena, con su estado ═══

function ListaManoObra({ filas, horasSinTarifa, puedeVerTarifas }: {
  filas: QuincenaDePersona[]; horasSinTarifa: number | null; puedeVerTarifas: boolean
}) {
  if (!puedeVerTarifas) return <Vacio texto="No puedo valorizar las horas: los recibos y las tarifas los lee Administración." />
  if (filas.length === 0) return <Vacio texto="Ninguna hora cargada en este trabajo." />
  const horas = filas.reduce((a, f) => a + (f.estado === 'falta_dato' ? 0 : f.horas ?? 0), 0)
  return (
    <div data-testid="detalle-mano-obra">
      <div style={{ ...FILA, gridTemplateColumns: COLS_QUINCENA, borderBottom: `1px solid ${V.lineaFuerte}` }}>
        <span style={CABEZA}>Quincena</span>
        <span style={CABEZA}>Persona</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Horas</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Costo</span>
      </div>
      {filas.map((f) => <Quincena key={`${f.personaId ?? 'sin-persona'}-${f.quincenaDesde}`} f={f} />)}
      <div data-testid="detalle-total" style={{ ...FILA, gridTemplateColumns: COLS_QUINCENA, borderBottom: 'none', paddingTop: 8 }}>
        <span />
        <span style={{ fontSize: '12px', fontWeight: 600, color: V.tinta }}>Total</span>
        <span className={MONO} style={{ fontSize: '12px', color: V.tinta, textAlign: 'right' }}>{fmtHH(horas)}</span>
        <span className={MONO} style={{ fontSize: '12px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}>
          {plataCentavos(filas.reduce<number | null>((a, f) => (f.estado === 'falta_dato' || f.total == null ? a : (a ?? 0) + f.total), null))}
        </span>
      </div>
      {(horasSinTarifa ?? 0) > 0 && (
        <p data-testid="detalle-sin-tarifa" style={{ fontSize: '11.5px', color: V.warn, paddingTop: 4 }}>
          {`${fmtHH(horasSinTarifa)} h sin valorizar: falta la tarifa o el neto de alguien.`}
        </p>
      )}
    </div>
  )
}

function Quincena({ f }: { f: QuincenaDePersona }) {
  const faltaDato = f.estado === 'falta_dato'
  return (
    <div data-testid="detalle-quincena" title={f.origen ?? undefined} style={{ ...FILA, gridTemplateColumns: COLS_QUINCENA }}>
      <span className={MONO} style={{ fontSize: '11.5px', color: V.tenue }}>{etiquetaDeBloque(f.quincenaDesde, f.quincenaHasta ?? f.quincenaDesde)}</span>
      <span className="truncate" style={{ fontSize: '12px', fontWeight: 500, color: V.tinta }}>{f.nombre ?? 'fila sin persona'}</span>
      <span className={MONO} style={{ fontSize: '12px', color: V.tintaSuave, textAlign: 'right' }}>{fmtHH(f.horas)}</span>
      <span className={MONO} style={{ fontSize: '12px', color: faltaDato ? V.warn : V.tinta, textAlign: 'right' }}>
        {faltaDato ? 'sin tarifa' : plataCentavos(f.total)}
        {/* ESTIMADO ≠ REAL: sin recibo del estudio todavía. */}
        {f.estado === 'estimado' && <span style={{ marginLeft: 4, fontSize: '10.5px', color: V.tenue }}>est.</span>}
      </span>
    </div>
  )
}

// ═══ HH: una persona por fila, y la puerta a la grilla por día ═══

function ListaHH({ filas, href }: { filas: PersonaDeHH[]; href: string | null }) {
  if (filas.length === 0) return <Vacio texto="Ninguna hora cargada en este trabajo." />
  return (
    <div data-testid="detalle-hh">
      <div style={{ ...FILA, gridTemplateColumns: COLS_PERSONA, borderBottom: `1px solid ${V.lineaFuerte}` }}>
        <span style={CABEZA}>Persona</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Días</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Período</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>HH</span>
      </div>
      {filas.map((p) => (
        <div key={p.personaId ?? p.nombre ?? 'sin-persona'} data-testid="detalle-persona" style={{ ...FILA, gridTemplateColumns: COLS_PERSONA }}>
          <span className="truncate" style={{ fontSize: '12px', fontWeight: 500, color: V.tinta }}>{p.nombre ?? 'fila sin persona'}</span>
          <span className={MONO} style={{ fontSize: '12px', color: V.tintaSuave, textAlign: 'right' }}>{p.dias}</span>
          <span className={MONO} style={{ fontSize: '11px', color: V.tenue, textAlign: 'right' }}>
            {p.primera && p.ultima ? etiquetaDeBloque(p.primera, p.ultima) : ''}
          </span>
          <span className={MONO} style={{ fontSize: '12px', color: V.tinta, textAlign: 'right' }}>{fmtHH(p.hh) ?? '—'}</span>
        </div>
      ))}
      <div data-testid="detalle-total" style={{ ...FILA, gridTemplateColumns: COLS_PERSONA, borderBottom: 'none', paddingTop: 8 }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: V.tinta }}>Total</span>
        <span /><span />
        <span className={MONO} style={{ fontSize: '12px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}>
          {fmtHH(filas.reduce((a, p) => a + (p.hh ?? 0), 0))}
        </span>
      </div>
      {href && (
        <Link href={href} prefetch={false} data-testid="ver-desglose-completo" style={{ display: 'inline-block', marginTop: 16, fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
          Ver el desglose completo por día →
        </Link>
      )}
    </div>
  )
}

// ═══ EL COTEJO CONTRA LA CELDA ═══

function Cotejo({ detalle, total, celda }: { detalle: DetalleCosto; total: number | null; celda: number | null }) {
  // QUÉ SE DICE Y SI ES UN PROBLEMA LO DECIDE EL SERVICIO (`avisoDeCotejo`), que se puede testear sin
  // navegador. Acá sólo se elige el color: ámbar es problema; una caché de minutos es texto secundario.
  const aviso = avisoDeCotejo(detalle, total, celda, new Date())
  if (!aviso) return null
  return (
    <p
      data-testid={aviso.problema ? 'detalle-no-cierra' : 'detalle-de-cache'}
      style={{ fontSize: '11.5px', color: aviso.problema ? V.warn : V.tenue, paddingTop: 8 }}
    >
      {aviso.texto}
    </p>
  )
}
