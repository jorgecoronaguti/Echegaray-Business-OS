// 23 v2 · LAS CINCO CARAS DE LA FICHA DE UN PROVEEDOR — `23 · Proveedor Ficha v2.dc.html` (110-171).
//
// Todas comparten la misma anatomía: encabezado de columnas cerrado por un filo `#D7D5CF`, filas
// separadas por `#F1F0EC`, sangría de 13px y nada de caja. Ninguna dibuja tarjeta, borde exterior
// ni pie de totales — criterio 3 del patrón.
//
// EL ALTO ES `ALTO_V2.cara` Y ESO ES UNA INFERENCIA, NO UNA MEDIDA. El handoff v4 no redibujó la
// ficha de proveedor: dibujó las caras del eje CLIENTE en 46px (`v4B:192`). Se toma ése porque la
// pieza es la misma —una cara colgada de una ficha, no una lista de nivel 2— y porque el archivo
// entero mezclaba 40 y 42 sin que nada explicara la diferencia. Si algún día llega el canvas de
// proveedor y dice otro número, manda el canvas.
//
// La solapa «Papeles» del mockup era acá un cartel que mandaba a otra pantalla. Desde el 14/09/2026
// salió: el papel de cada compra está al lado de la compra (`proveedores/ComprasDelProveedor.tsx`).
// Lo que se SUBE contra la ficha —contratos, seguros, audiovisual— sigue en «Documentos».

import Link from 'next/link'
import { ALTO_V2, CAJA_CONTENIDO, FILO_BLOQUEA, V } from '@/shared/components/v2/patron'
import { BarraDeCostado } from '@/shared/components/v2/segundoNivel'
import { IconoObra } from '@/shared/components/iconos'
import { pesos } from '@/shared/components/canon/formato'
import type {
  CompraPorObra, ConceptoProvisto, PaqueteDelProveedor,
} from '../services/fichaProveedor'

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

// La cara «Compras» —con el comprobante al lado de cada compra— vive desde el 14/09/2026 en
// `proveedores/ComprasDelProveedor.tsx` y lee `proveedor_compra`.

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
            display: 'flex', alignItems: 'center', gap: 11, height: ALTO_V2.cara, paddingLeft: 13,
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

/**
 * A qué obras fue lo que se le compró. `23v2:158-169`.
 *
 * ═══ CADA OBRA SE ABRE Y MUESTRA SUS COMPROBANTES (dueño, 22/09/2026) ═══
 *
 * «la sección "obras" q marca los montos, me tiene q permitir abrir una por una y mostrarme cuáles
 * son esos comprobantes aparejados». Abrir una obra NO es un panel nuevo: es la lista de
 * comprobantes que la ficha ya tiene, con un filtro más (`?obra=`). Por eso el monto de esta fila y
 * la suma que la lista publica abajo salen de la misma regla y tienen que dar igual — y por eso el
 * enlace lleva `anio=todos`: este monto es histórico, y el default de la lista es el año en curso.
 */
export function ObrasDelProveedor({ filas, hrefDe }: {
  filas: CompraPorObra[]
  /** `undefined` = no se puede abrir (no hay lista de comprobantes que mirar). */
  hrefDe?: (obra: string | null) => string
}) {
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
          className={`relative ${CAJA_CONTENIDO}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, height: ALTO_V2.cara, paddingLeft: 13,
            borderBottom: `1px solid ${V.lineaFila}`,
            boxShadow: o.obra ? 'none' : FILO_BLOQUEA,
          }}
        >
          <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
            <IconoObra className="h-[15px] w-[15px]" />
          </span>
          {/* El enlace se estira sobre la fila entera, como en la cartera: `after:inset-0` en vez de
              anidar la fila dentro de un `<a>`, que rompe el tabulador. */}
          {hrefDe
            ? (
                <Link
                  href={hrefDe(o.obra)} prefetch={false} data-testid="abrir-obra-proveedor"
                  className="min-w-0 truncate hover:underline after:absolute after:inset-0 after:content-['']"
                  style={{ fontSize: '12.5px', fontWeight: 500, color: o.obra ? V.tinta : V.warn }}
                  title="Ver los comprobantes de esta obra"
                >
                  {o.obra ?? 'sin obra imputada'}
                </Link>
              )
            : (
                <span
                  className="truncate"
                  style={{ fontSize: '12.5px', fontWeight: 500, color: o.obra ? V.tinta : V.warn, minWidth: 0 }}
                >
                  {o.obra ?? 'sin obra imputada'}
                </span>
              )}
          <span style={{ fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>
            {o.comprobantes === 0
              ? 'ninguno'
              : `${o.comprobantes} ${o.comprobantes === 1 ? 'comprobante' : 'comprobantes'}`}
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
            display: 'flex', alignItems: 'center', gap: 11, height: ALTO_V2.cara, paddingLeft: 13,
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

/** «Dónde se le compra»: el reparto por obra, con barra y participación. `23v2:196-208`. */
export function RepartoPorObra({ filas, hrefDe }: {
  filas: CompraPorObra[]
  /** El MISMO enlace que la cara «Obras»: una obra se abre igual desde los dos lados. */
  hrefDe?: (obra: string | null) => string
}) {
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
            {hrefDe
              ? (
                  <Link
                    href={hrefDe(o.obra)} prefetch={false} data-testid="abrir-obra-reparto"
                    className="min-w-0 truncate hover:underline"
                    style={{ fontSize: '12px', color: o.obra ? V.tinta : V.warn }}
                    title="Ver los comprobantes de esta obra"
                  >
                    {o.obra ?? 'sin obra imputada'}
                  </Link>
                )
              : (
                  <span className="truncate" style={{ fontSize: '12px', color: o.obra ? V.tinta : V.warn, minWidth: 0 }}>
                    {o.obra ?? 'sin obra imputada'}
                  </span>
                )}
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
