// UNA FILA DE LA PESTAÑA COBRANZAS, DIBUJADA COMO SE LEE EN EL SHEET.
//
// ═══ LAS DECISIONES DE DISEÑO, Y DE DÓNDE SALEN ═══
//
// · CIFRAS EN MONO TABULAR, FRASES EN TEXTO, y nunca las dos en una celda. Es la regla del módulo
//   Administración y la que el dueño marcó tres veces el 10/09/2026 («hay mezcla de diseño»).
// · UN SOLO COLOR DE ÉNFASIS —el grafito— y el ÁMBAR sólo para lo VENCIDO, que es lo único que
//   reclama trabajo. Un cobro que entró no es un estado positivo que haya que pintar de verde: es
//   lo normal, y se lee en tinta plena.
// · EL NÚMERO DE FILA DEL SHEET VA EN EL `title` de la fila entera. Es lo que hace auditable cada
//   renglón contra el archivo que el dueño abre: «Cobranzas fila 78».
// · A 390px LA FILA SE APILA: sobreviven el concepto y el total, y debajo del concepto entran la
//   fecha, el estado y cuándo se cobra. No se esconde nada — se cambia de forma.

import { pesos } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, V } from '@/shared/components/v2/patron'
import { comprobanteDe, estadoDe, type FilaCobranza } from '../../services/cobranzasCliente'

/** FECHA · COMPROBANTE · CONCEPTO · NETO · IVA · TOTAL · ESTADO · COBRO · MEDIO. */
export const COLS_COBRANZA
  = 'grid-cols-[84px_110px_minmax(200px,1.6fr)_120px_110px_130px_104px_92px_108px]'
  + ' max-[1199px]:grid-cols-[84px_110px_minmax(0,1fr)_130px_104px]'
  + ' max-[767px]:grid-cols-[minmax(0,1fr)_120px]'

/** Lo que se suelta abajo de 1200px: el desglose del IVA y el detalle del cobro. */
export const SOLO_MEDIO = 'max-[1199px]:hidden'
/** Lo que se suelta en el teléfono. Nunca el concepto ni el total. */
export const SOLO_ANCHO_COB = 'max-[767px]:hidden'

/** `2026-09-22` → `22/09/26`. Se escribe como se lee, nunca en ISO. */
export function dia(f: string | null): string | null {
  if (!f) return null
  const [a, m, d] = f.split('-')
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : f
}

/** El estado, con SU palabra y su tinta. El ámbar es sólo para lo vencido. */
const TINTA_ESTADO: Record<string, string> = {
  cobrado: V.tinta, vencido: V.warn, pendiente: V.apagado, anulado: V.inerte,
}
const PALABRA_ESTADO: Record<string, string> = {
  cobrado: 'cobrado', vencido: 'vencido', pendiente: 'pendiente', anulado: 'anulado',
}

export function FilaDeCobranza({ f }: { f: FilaCobranza }) {
  const estado = estadoDe(f)
  const comprobante = comprobanteDe(f)
  const anulada = estado === 'anulado'
  // EL `title` ES LA TRAZABILIDAD DE LA FILA: el renglón exacto del Sheet, su orden de compra y el
  // estado crudo de la réplica. Sin esto, cruzar la pantalla contra el archivo es a ojo.
  const titulo = [
    f.fila ? `Cobranzas fila ${f.fila}` : 'Fila sin número en la réplica',
    f.orden_compra ? `OC ${f.orden_compra}` : null,
    f.estado ? `estado en el Sheet: ${f.estado}` : null,
    f.retenciones ? `retenciones ${pesos(f.retenciones)}` : null,
    anulada ? 'ANULADA: se muestra porque existe en el Sheet, y no se suma en ningún total.' : null,
  ].filter(Boolean).join(' · ')
  const tinta = anulada ? V.inerte : V.tinta
  return (
    <div
      role="row" data-testid="fila-cobranza" data-estado={estado} data-fila={f.fila ?? undefined}
      title={titulo}
      className={`grid items-center gap-[12px] ${CAJA_CONTENIDO} ${COLS_COBRANZA} hover:bg-[#FAFAF8]`}
      style={{
        // EL ALTO SALE DE `ALTO_V2`, como toda fila del patrón: `hija` es el renglón denso de una
        // lista que cuelga de otra, que es exactamente lo que es una fila de Cobranzas dentro de su
        // grupo. Clavar un número acá rompería el ritmo vertical del módulo.
        minHeight: ALTO_V2.hija, borderBottom: `1px solid ${V.lineaFila}`,
        textDecoration: anulada ? 'line-through' : undefined,
      }}
    >
      <span className={`font-mono tabular-nums ${SOLO_ANCHO_COB}`} style={{ fontSize: '11.5px', color: V.apagado }}>
        {dia(f.fecha_emision) ?? '—'}
      </span>
      {/* EL COMPROBANTE ES UN RÓTULO, NO UNA CIFRA: «FA 230» se lee, no se compara de arriba abajo.
          Una fila `N` no tiene comprobante y lo dice con su letra, que es el dato. */}
      <span className={`truncate ${SOLO_ANCHO_COB}`} style={{ fontSize: '11.5px', color: comprobante ? V.tintaSuave : V.tenue }}>
        {comprobante ?? (f.categoria === 'N' ? 'sin comprobante' : '—')}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
        <span className="truncate" style={{ fontSize: '12px', color: tinta }}>
          {f.concepto?.trim() || 'sin concepto'}
        </span>
        {/* LA SEGUNDA LÍNEA EXISTE SÓLO EN EL TELÉFONO: ahí no hay columnas para la fecha ni el
            estado, y una fila que no dice cuándo ni cómo está no sirve para decidir nada. */}
        <span className="flex md:hidden" style={{ gap: 8, fontSize: '10.5px', color: V.tenue }}>
          <span className="font-mono tabular-nums">{dia(f.fecha_emision) ?? '—'}</span>
          <span style={{ color: TINTA_ESTADO[estado] }}>{PALABRA_ESTADO[estado]}</span>
          {f.fecha_cobro && <span className="font-mono tabular-nums">cobra {dia(f.fecha_cobro)}</span>}
        </span>
      </span>
      <span className={`font-mono tabular-nums ${SOLO_MEDIO}`} style={{ fontSize: '11.5px', color: V.apagado, textAlign: 'right' }}>
        {f.monto_neto == null ? '—' : pesos(f.monto_neto)}
      </span>
      {/* «—» EN IVA ES «esta fila no lleva IVA», que es el caso de todas las `N`: no es cero. */}
      <span className={`font-mono tabular-nums ${SOLO_MEDIO}`} style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}>
        {f.iva == null ? '—' : pesos(f.iva)}
      </span>
      <span className="font-mono tabular-nums" data-testid="total-cobranza" style={{ fontSize: '12px', color: tinta, textAlign: 'right' }}>
        {f.total_bruto == null ? '—' : pesos(f.total_bruto)}
      </span>
      <span className={`truncate ${SOLO_ANCHO_COB}`} data-testid="estado-cobranza" style={{ fontSize: '11.5px', color: TINTA_ESTADO[estado] }}>
        {PALABRA_ESTADO[estado]}
      </span>
      <span className={`font-mono tabular-nums ${SOLO_MEDIO}`} style={{ fontSize: '11.5px', color: V.apagado, textAlign: 'right' }}>
        {dia(f.fecha_cobro) ?? '—'}
      </span>
      <span className={`truncate ${SOLO_MEDIO}`} style={{ fontSize: '11.5px', color: V.tenue }}>
        {f.forma_cobro?.trim() || '—'}
      </span>
    </div>
  )
}
