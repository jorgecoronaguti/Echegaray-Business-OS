// ATENCIÓN — LO ÚNICO QUE HAY QUE IR A HACER HOY, Y EL VERBO QUE LO HACE (M04, 390px).
//
// ═══ PORTE LITERAL DE M04 ═══
//
//   bloque   eyebrow «Atención» con el conteo (12px muted) a la derecha, `gap:6px`
//   fila     `min-height:56px`, `padding-left:10px`, `border-left:2px` rojo o ámbar, línea abajo
//   ícono    14px del color del tono (bloqueo: círculo con «!» · dato: triángulo)
//   texto    QUÉ pasa en 13,5 tinta · DÓNDE en 12 muted
//   verbo    12px/500 del color del tono, a la derecha, sin partir
//
// En el escritorio el Resumen (03) no dibuja este bloque: ahí lo que frena la obra es una tabla con
// Tipo · Qué falta · Responsable · vencimiento. Por eso este componente vive sólo en el teléfono.
//
// ═══ EL VERBO NO ES DECORACIÓN ═══
//
// «Resolver», «Cargar», «Ver» declaran qué tipo de trabajo espera del otro lado del click. Una
// alerta que no dice qué se hace con ella es una alerta que se mira y se deja.
//
// Los filtros Todo · Bloqueos · Faltan datos que tenía el bloque no están en M04 y se retiraron; la
// clase (`bloqueo` / `dato`) sigue viajando en cada ítem porque decide el ícono.

import Link from 'next/link'
import { C } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { BloqueTelefono } from './TarjetaResumen'

export type ClaseAtencion = 'bloqueo' | 'dato'

export interface ItemAtencion {
  clave: string
  tono: 'neg' | 'warn'
  clase: ClaseAtencion
  /** QUÉ pasa, corto. Va en tinta. */
  titulo: string
  /** DÓNDE pasa: la actividad, el proveedor, la fecha. Va en muted, debajo. */
  contexto?: string
  /** El verbo de la acción, a la derecha. */
  accion: string
  href: string
  /** De dónde sale el dato. Viaja en el `title`, nunca en el renglón: sirve para auditar. */
  origen?: string
}

const COLOR = { neg: C.neg, warn: C.warn } as const

export function AtencionObra({ items }: { items: ItemAtencion[] }) {
  return (
    <BloqueTelefono titulo="Atención" derecha={items.length > 0 ? String(items.length) : undefined} testid="atencion-obra">
      {items.length === 0 ? (
        <div style={{ fontSize: '12.5px', color: C.pos, display: 'flex', alignItems: 'center', gap: '6px', minHeight: '40px' }}
          data-testid="sin-atencion">
          <Ico d={P.ok} s={14} w={2.2} />Nada que atender hoy.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((i, idx) => (
            <Link key={i.clave} href={i.href} prefetch={false} title={i.origen} data-testid={`atencion-${i.clave}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px', paddingLeft: '10px',
                borderLeft: `2px solid ${COLOR[i.tono]}`,
                borderBottom: idx < items.length - 1 ? `1px solid ${C.borde}` : 'none',
              }}>
              <span style={{ color: COLOR[i.tono], display: 'flex' }}>
                <Ico d={i.clase === 'bloqueo' ? P.bloqueo : P.alerta} s={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '13.5px', color: C.tinta }}>{i.titulo}</div>
                {i.contexto && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{i.contexto}</div>}
              </div>
              <div style={{ fontSize: '12px', color: COLOR[i.tono], fontWeight: 500, whiteSpace: 'nowrap' }}>{i.accion}</div>
            </Link>
          ))}
        </div>
      )}
    </BloqueTelefono>
  )
}
