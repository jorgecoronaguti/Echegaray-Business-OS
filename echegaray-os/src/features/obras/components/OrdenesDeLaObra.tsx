// LA OC DE LA OBRA, EN LA FICHA DE LA OBRA — pedido del dueño el 10/09/2026 a las 16:26:
// «no veo el número de OC, no sé dónde está la OC ni su número una vez que entro a la obra».
//
// ═══ POR QUÉ VA ACÁ Y NO EN DOCUMENTOS ═══
//
// La jerarquía del trabajo es OBRA → OC → PLATA: la orden de compra es lo que ENCARGA la obra, no
// un papel más de la carpeta. Por eso vive en la columna de contexto del Resumen, pegada a «La
// obra» —donde ya están el cliente y el responsable—, y no a dos clics dentro de Documentos, que es
// donde estaba y donde el dueño no la encontró.
//
// ═══ QUÉ SE VE Y QUÉ NO ═══
//
// El NÚMERO manda: es lo que el dueño dice por teléfono y lo que busca en el mail. Va grande y solo
// en su renglón. La fecha y el importe van debajo, en mono, alineados; el número crudo
// («00002-00002266») y de dónde sale el PDF viajan en el `title`, no en un párrafo permanente.
//
// EL IMPORTE ES PRECIO DE VENTA, así que lo gobierna `veComercial` — el mismo recorte que ya hacen
// la ficha del cliente y el Resumen. La RLS decide si el jefe de obra ve la ORDEN (ve la de SU obra,
// `cliente_orden_select`); esta prop decide si además ve cuánto se vendió.
//
// UNA sola tarjeta con dos secciones, y no dos tarjetas: las OP son el reverso de las OC —lo que
// nos encargaron y lo que nos mandaron pagar— y una card por dato es justo lo que el dueño rechazó.

import { Tarjeta, CabeceraTarjeta, Chevron } from './TarjetaResumen'
import { C, MONO } from './canon/tokens'
import type { BloqueOrdenes, LineaOrden } from '../services/ordenesDeLaObra'
import { fecha as fechaLarga, plata } from './formato'

/** El importe de una orden, con su moneda. `null` NO es cero: el PDF no lo dijo. */
function importeDe(l: LineaOrden): string {
  if (l.importe == null) return 'sin importe'
  return `${l.moneda === 'USD' ? 'U$S ' : ''}${plata(l.importe)}`
}

/** UNA ORDEN. La fila entera es el enlace al PDF —un solo `<a>`, nunca dos anidados. */
function Fila({ l, veComercial }: { l: LineaOrden; veComercial: boolean }) {
  return (
    <a
      href={l.href}
      target="_blank"
      rel="noreferrer"
      data-testid="obra-orden"
      data-tipo={l.rotulo.startsWith('OC') ? 'oc' : 'op'}
      data-drive={l.enDrive ? '' : undefined}
      title={l.title}
      style={{
        display: 'block', padding: '9px 0', borderBottom: `1px solid ${C.bordeLista}`,
        textDecoration: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {/* EL NÚMERO, GRANDE. Es la pregunta que trajo al dueño a esta pantalla. */}
        <span style={{ fontSize: '15px', fontWeight: 600, color: C.tinta, letterSpacing: '-0.01em' }}>
          {l.rotulo}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: '11.5px', color: C.tenue, marginLeft: 'auto',
          flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        }}>
          {l.fecha ? fechaLarga(l.fecha) : 'sin fecha'}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: '2px' }}>
        {veComercial && (
          <span style={{
            fontFamily: MONO, fontSize: '12px', color: C.tintaMedia,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {importeDe(l)}
          </span>
        )}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto', flexShrink: 0,
          fontSize: '11.5px', color: C.tintaSuave,
        }}>
          Ver PDF<Chevron />
        </span>
      </span>
    </a>
  )
}

/** El rótulo de la segunda sección. No es una tarjeta nueva: es el mismo bloque, otra pregunta. */
function Seccion({ titulo }: { titulo: string }) {
  return (
    <div style={{
      padding: '10px 0 2px', fontSize: '11px', fontWeight: 600, color: C.tenue,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {titulo}
    </div>
  )
}

/**
 * LAS ÓRDENES DEL CLIENTE PARA ESTA OBRA. `bloque` lo arma `bloqueDeOrdenes`, que es puro y está
 * probado; acá no se decide nada de negocio.
 */
export function OrdenesDeLaObra({ bloque, cliente, veComercial = true }: {
  bloque: BloqueOrdenes
  /** De quién es la orden. Se dibuja en la cabecera porque una OC sin cliente no se puede reclamar. */
  cliente?: string | null
  veComercial?: boolean
}) {
  return (
    <Tarjeta testid="obra-ordenes">
      <CabeceraTarjeta
        titulo="Orden de compra"
        accion={
          cliente
            ? <span style={{ fontSize: '11.5px', color: C.tintaSuave }} title="El cliente que emitió la orden">{cliente}</span>
            : undefined
        }
      />
      <div style={{ padding: '2px 16px 8px' }}>
        {bloque.fallo ? (
          // UN CONTROL QUE NO PUDO MIRAR NO DICE «NO HAY». Distinguirlo del vacío es la diferencia
          // entre «esta obra no tiene OC» y «no te la pude leer».
          <p style={{ fontSize: '12.5px', color: C.warn, padding: '8px 0', margin: 0 }} data-testid="obra-ordenes-fallo">
            No pude leer las órdenes de esta obra.
          </p>
        ) : bloque.oc.length === 0 ? (
          <p style={{ fontSize: '12.5px', color: C.tenue, padding: '8px 0', margin: 0 }} data-nulo="" data-testid="obra-sin-oc">
            {bloque.vacioOC}
          </p>
        ) : (
          bloque.oc.map((l) => <Fila key={l.clave} l={l} veComercial={veComercial} />)
        )}

        {/* LAS OP SÓLO APARECEN CUANDO LAS HAY: un rótulo «Órdenes de pago» sobre un vacío en cada
            obra del OS es un renglón que enseña a saltear el bloque entero. */}
        {bloque.op.length > 0 && (
          <>
            <Seccion titulo="Órdenes de pago" />
            {bloque.op.map((l) => <Fila key={l.clave} l={l} veComercial={veComercial} />)}
          </>
        )}
      </div>
    </Tarjeta>
  )
}
