// 23 v2 · LAS CINCO CARAS DE LA FICHA DE UN PROVEEDOR — `23 · Proveedor Ficha v2.dc.html` (110-171).
//
// Todas comparten la misma anatomía del v2: encabezado de columnas de 26px cerrado por un filo
// `#D7D5CF`, filas de 40-42px separadas por `#EDECE8`, sangría de 13px y nada de caja. Ninguna
// dibuja tarjeta, borde exterior ni pie de totales — criterio 3 del patrón.
//
// LO QUE NO SE DIBUJA, Y POR QUÉ: la solapa «Papeles» del mockup existe pero no puede afirmar nada.
// Ninguna tabla vincula un archivo con un proveedor —hoy los documentos cuelgan de una persona o de
// un cliente—, así que la cara dice exactamente eso en vez de mostrar una lista vacía, que se lee
// como «este proveedor no tiene papeles».

import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { BarraDeCostado } from '@/shared/components/v2/segundoNivel'
import { IconoDocumento, IconoObra } from '@/shared/components/iconos'
import { pesos } from '@/shared/components/canon/formato'
import type {
  CompraPorObra, ComprobanteProveedor, ConceptoProvisto, PaqueteDelProveedor,
} from '../services/fichaProveedor'

const fecha = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}` : null)

/** La nota al pie de una cara: 11px, 720px de ancho de lectura. `23v2:143`. */
export function NotaDeCara({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <p
      data-testid={testid}
      style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 12, maxWidth: 720, textWrap: 'pretty' }}
    >
      {children}
    </p>
  )
}

const COLS_COMPRAS
  = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,90px)_minmax(0,120px)]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,120px)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

/** CONCEPTO · DESTINO · FECHA · MONTO. `23v2:113-137`. */
export function ComprasDelProveedor({ filas, truncado, total }: {
  filas: ComprobanteProveedor[]
  truncado: boolean
  /** Cuántos declara `proveedor_nombre_resuelto`. Puede ser mayor que lo que se ve. */
  total: number
}) {
  return (
    <div data-testid="compras-proveedor">
      <div className={`grid gap-[14px] ${COLS_COMPRAS}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Concepto</RotuloCol>
        <RotuloCol>Destino</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Fecha</RotuloCol></span>
        <RotuloCol derecha>Monto</RotuloCol>
      </div>

      {filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="compras-vacio">
          No hay comprobantes registrados contra este proveedor.
        </p>
      )}

      {filas.map((f) => (
        <div
          key={f.id} data-testid="fila-compra"
          className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS_COMPRAS} hover:bg-[#F2F1ED]`}
          style={{
            height: ALTO_V2.fila, paddingLeft: 13, borderBottom: `1px solid ${V.lineaFila}`,
            // Sin obra imputada el filo es ROJO y no ámbar: el gasto ya ocurrió y está pesando en
            // ninguna obra, que no es «falta cargar un dato» sino plata mal atribuida (`23v2:442`).
            boxShadow: f.obra_texto?.trim() ? 'none' : `inset 2px 0 0 ${V.neg}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span className="truncate" style={{ fontSize: '12.5px', color: V.tinta }}>
              {f.concepto?.trim() || 'sin concepto'}
            </span>
            <span className="font-mono shrink-0" style={{ fontSize: '10.5px', color: V.inerte }}>
              {f.comprobante?.trim() || ''}
            </span>
          </span>

          <span
            className="truncate"
            style={{ fontSize: '12px', color: f.obra_texto?.trim() ? V.tintaSuave : V.neg }}
          >
            {f.obra_texto?.trim() || 'sin obra imputada'}
          </span>

          <span className={`grid ${SOLO_ANCHO}`}>
            <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}>
              {fecha(f.fecha) ?? 'sin fecha'}
            </span>
          </span>

          {/* SIN IMPORTE NO ES $ 0: el comprobante llegó y el monto no está cargado. */}
          <span
            className="font-mono tabular-nums"
            style={{ fontSize: '12px', color: f.total === null ? V.warn : V.tinta, textAlign: 'right' }}
          >
            {f.total === null ? 'sin importe' : pesos(f.total)}
          </span>
        </div>
      ))}

      <NotaDeCara testid="nota-compras">
        Lo comprado es histórico: la vista que lo suma no publica la fecha de cada comprobante, así
        que ningún total de arriba lleva ventana de tiempo.
        {truncado && ` Se dibujan ${filas.length} de ${total} comprobantes; el resto está en la pestaña Compras.`}
      </NotaDeCara>
    </div>
  )
}

/** Los textos libres de Compras ya resueltos contra este proveedor. `23v2:146-155`. */
export function NombresDelProveedor({ nombres }: {
  nombres: { nombre_norm: string; comprobantes: number; manual: boolean }[]
}) {
  return (
    <div data-testid="nombres-proveedor">
      {nombres.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado }} data-testid="nombres-vacio">
          Ningún texto de Compras se resolvió todavía contra este proveedor.
        </p>
      )}
      {nombres.map((n) => (
        <div
          key={n.nombre_norm} data-testid="fila-nombre"
          className={CAJA_CONTENIDO}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, height: ALTO_V2.fila, paddingLeft: 13,
            borderBottom: `1px solid ${V.lineaFila}`,
          }}
        >
          <span className="truncate font-mono" style={{ fontSize: '12.5px', color: V.tinta, minWidth: 0 }}>
            {n.nombre_norm}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>
            {n.manual ? 'resuelto a mano' : 'Compras · texto libre'}
          </span>
          <span
            className="font-mono tabular-nums shrink-0"
            style={{ fontSize: '11.5px', color: V.apagado, width: 110, textAlign: 'right' }}
          >
            {n.comprobantes}
          </span>
        </div>
      ))}
      <NotaDeCara testid="nota-nombres">
        Son los textos libres de Compras que ya se resolvieron contra este proveedor. El número es
        cuántos comprobantes entraron con esa grafía.
      </NotaDeCara>
    </div>
  )
}

/** A qué obras fue lo que se le compró. `23v2:158-169`. */
export function ObrasDelProveedor({ filas }: { filas: CompraPorObra[] }) {
  return (
    <div data-testid="obras-proveedor">
      {filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado }} data-testid="obras-vacio">
          Todavía no hay comprobantes imputados a una obra.
        </p>
      )}
      {filas.map((o) => (
        <div
          key={o.obra ?? 'sin-obra'} data-testid="fila-obra"
          className={CAJA_CONTENIDO}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, height: 42, paddingLeft: 13,
            borderBottom: `1px solid ${V.lineaFila}`,
            boxShadow: o.obra ? 'none' : FILO_BLOQUEA,
          }}
        >
          <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
            <IconoObra className="h-[15px] w-[15px]" />
          </span>
          <span
            className="truncate"
            style={{ fontSize: '12.5px', fontWeight: 500, color: o.obra ? V.tinta : V.warn, minWidth: 0 }}
          >
            {o.obra ?? 'sin obra imputada'}
          </span>
          <span style={{ fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>
            {o.comprobantes} {o.comprobantes === 1 ? 'comprobante' : 'comprobantes'}
          </span>
          <span
            className="font-mono tabular-nums shrink-0"
            style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.apagado }}
          >
            {o.total === null ? 'sin importe' : pesos(o.total)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Los paquetes de subcontrato. No está en el mockup porque su proveedor de ejemplo vendía hierro. */
export function PaquetesDelProveedor({ filas, error }: {
  filas: PaqueteDelProveedor[]
  error: string | null
}) {
  return (
    <div data-testid="paquetes-proveedor">
      {error && (
        <p style={{ fontSize: '12.5px', color: V.warn }} data-testid="paquetes-error">
          No pude leer los paquetes: {error}. Esta cara no afirma que no tenga ninguno.
        </p>
      )}
      {!error && filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado }} data-testid="paquetes-vacio">
          No tiene ningún paquete de subcontrato contratado.
        </p>
      )}
      {filas.map((p) => (
        <div
          key={p.id} data-testid="fila-paquete"
          className={CAJA_CONTENIDO}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, height: 42, paddingLeft: 13,
            borderBottom: `1px solid ${V.lineaFila}`,
          }}
        >
          <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
            <IconoObra className="h-[15px] w-[15px]" />
          </span>
          <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta, minWidth: 0 }}>
            {p.trabajo}
          </span>
          <span className="truncate" style={{ fontSize: '11.5px', color: V.tenue, minWidth: 0 }}>{p.obra}</span>
          <span style={{ fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>{p.estado}</span>
          {/* SIN PRECIO NO ES $ 0: un cero diría que se le contrató el trabajo gratis. */}
          <span
            className="font-mono tabular-nums shrink-0"
            style={{ marginLeft: 'auto', fontSize: '11.5px', color: p.precio === null ? V.warn : V.apagado }}
          >
            {p.precio === null ? 'sin precio' : pesos(p.precio)}
          </span>
        </div>
      ))}
      <NotaDeCara testid="nota-paquetes">
        La CERTIFICACIÓN de cada paquete no existe como dato: `subcontrato` guarda estado, no
        porcentaje. Por eso ninguna fila dice cuánto va ejecutado.
      </NotaDeCara>
    </div>
  )
}

/** La cara «Papeles», que no puede afirmar nada. `23v2:172-180`. */
export function PapelesDelProveedor({ nombre }: { nombre: string }) {
  return (
    <div
      data-testid="papeles-proveedor"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 11,
        border: `1px dashed ${V.lineaFuerte}`, borderRadius: 10, padding: '20px 18px',
      }}
    >
      <span style={{ display: 'flex', color: V.inerteTrabajo, flexShrink: 0, marginTop: 1 }}>
        <IconoDocumento className="h-[17px] w-[17px]" />
      </span>
      <span style={{ fontSize: '12.5px', lineHeight: 1.6, color: V.tintaSuave, maxWidth: 620, textWrap: 'pretty' }}>
        No existe ninguna tabla que vincule un archivo con un proveedor. Los papeles de {nombre}
        {' '}—constancia de ARCA, seguro, cuenta bancaria— están en Drive, sin vincular. Hasta que
        exista el vínculo, esta cara no puede afirmar que falten ni que estén.
      </span>
    </div>
  )
}

/** «Dónde se le compra»: el reparto por obra, con barra y participación. `23v2:196-208`. */
export function RepartoPorObra({ filas }: { filas: CompraPorObra[] }) {
  return (
    <>
      {filas.length === 0 && (
        <p style={{ fontSize: '12px', color: V.tenue }} data-testid="reparto-vacio">
          Ningún comprobante tiene obra imputada.
        </p>
      )}
      {filas.map((o) => (
        <div
          key={o.obra ?? 'sin-obra'} data-testid="reparto-obra"
          style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="truncate" style={{ fontSize: '12px', color: o.obra ? V.tinta : V.warn, minWidth: 0 }}>
              {o.obra ?? 'sin obra imputada'}
            </span>
            <span
              className="font-mono tabular-nums shrink-0"
              style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.apagado }}
            >
              {/* SIN PARTICIPACIÓN CALCULABLE no se escribe «0 %»: se dice que no se pudo. */}
              {o.participacion === null ? '—' : `${Math.round(o.participacion)} %`}
            </span>
          </div>
          <BarraDeCostado fraccion={(o.participacion ?? 0) / 100} />
        </div>
      ))}
    </>
  )
}

/**
 * QUÉ PROVEE — el bloque que ocupa el lugar del CONTACTO del mockup.
 *
 * `public.proveedores` no tiene contacto, teléfono ni condición de IVA, y un bloque de renglones en
 * «sin cargar» promete campos que el sistema no puede guardar. Lo que sí se puede afirmar sale de
 * los comprobantes ya leídos: qué conceptos entraron con su nombre y cuándo fue el último.
 */
export function QueProvee({ filas, total }: { filas: ConceptoProvisto[]; total: number }) {
  return (
    <>
      {filas.length === 0 && (
        <p style={{ fontSize: '12px', color: V.tenue }} data-testid="que-provee-vacio">
          Ningún comprobante suyo trae concepto cargado.
        </p>
      )}
      {filas.map((c) => (
        <div
          key={c.concepto} data-testid="concepto-provisto"
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
        >
          <span className="truncate" style={{ fontSize: '12px', color: V.tinta, minWidth: 0 }}>{c.concepto}</span>
          <span
            className="font-mono tabular-nums shrink-0"
            style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tenue }}
          >
            {c.comprobantes}
          </span>
        </div>
      ))}
      {total > filas.length && (
        <p style={{ fontSize: '11px', color: V.tenue, marginTop: 8 }} data-testid="que-provee-mas">
          {filas.length} de {total} conceptos distintos.
        </p>
      )}
    </>
  )
}
