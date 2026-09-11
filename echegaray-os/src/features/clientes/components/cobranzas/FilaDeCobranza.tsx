// UNA FILA DE LA PESTAÑA COBRANZAS.
//
// ═══ POR QUÉ ESTA FILA SE REHIZO (dueño, 11/09/2026) ═══
//
// «Es realmente muy difícil de entender lo que hiciste en la sección Cobranzas dentro de Clientes.»
//
// La fila anterior tenía NUEVE columnas de 11,5px todas del mismo peso —emisión · comprobante ·
// concepto · neto · IVA · total · estado · cobro · medio— y nada sobresalía: el ojo no encontraba
// dónde empezar. Encima el concepto se truncaba con «…» justo donde estaba el dato que explicaba
// el renglón (la OC, el tipo de cambio, la condición de pago).
//
// Las cuatro decisiones del rediseño:
//
// 1 · MUERE LA COLUMNA «ESTADO». El estado ahora lo dice la SECCIÓN en la que vive la fila —por
//     cobrar, cobrado, anulada—, así que repetirlo en cada renglón era ruido que además pintaba
//     nueve palabras distintas en tres colores. Lo único que sobrevive es el ámbar de lo VENCIDO,
//     y va pegado a la fecha que lo causó, no en una celda aparte.
// 2 · MUERE LA COLUMNA «EMISIÓN» y manda la FECHA DE COBRO. En lo que falta cobrar, la fecha que
//     decide es cuándo entra la plata; la de emisión es el reloj del vencimiento y vive en el
//     `title` de la fila, con el resto de la trazabilidad.
// 3 · NACE LA COLUMNA «OC», y con ella el concepto deja de truncarse. La columna H del Sheet no es
//     un número: mezcla el número de la orden con la condición comercial («00002-00002226 · cta.
//     cte. 15 días»). `ordenDeLaFila` las separa: el número va a su columna —angosto, alineado,
//     comparable— y la condición baja como segunda línea del concepto, en texto y legible entera.
// 4 · EL CONCEPTO ENTRA EN DOS LÍNEAS. `-webkit-line-clamp:2` en vez de `truncate`: ningún «…» a
//     mitad de la primera palabra útil. El texto completo sigue en el `title`.
//
// Y dos reglas que no cambian: CIFRAS EN MONO TABULAR, FRASES EN TEXTO, nunca las dos en una celda;
// y UN SOLO ÉNFASIS —el grafito—, con el ámbar reservado a lo que reclama trabajo.

import { pesos } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import {
  comprobanteDe, esRenglonDeIva, estadoDe, ordenDeLaFila, type FilaCobranza,
} from '../../services/cobranzasCliente'
import { urlDriveDelPapel } from '../../services/papelesCliente'

/** COBRO · B/N · CONCEPTO · OC · COMPROBANTE · MEDIO · NETO · IVA · TOTAL. */
export const COLS_COBRANZA
  = 'grid-cols-[86px_30px_minmax(200px,1.7fr)_62px_118px_92px_112px_100px_124px]'
  + ' max-[1199px]:grid-cols-[86px_30px_minmax(0,1fr)_118px_92px_124px]'
  + ' max-[767px]:grid-cols-[minmax(0,1fr)_124px]'

/** Lo que se suelta abajo de 1200px: la OC —que baja al concepto— y el desglose del IVA. */
export const SOLO_ANCHO = 'max-[1199px]:hidden'
/** Lo que se suelta en el teléfono. Nunca el concepto ni el total. */
export const SOLO_ESCRITORIO = 'max-[767px]:hidden'

const AYUDA_CIRCUITO = 'B = con comprobante: el circuito facturado, con IVA. '
  + 'N = sin comprobante. Son dos circuitos, no dos estados: una fila N no es un problema.'
const AYUDA_COBRO = 'La fecha de cobro de la pestaña. En lo que falta cobrar es una PREVISIÓN — la '
  + 'prueba de que entró es el extracto del banco. El ▲ ámbar marca lo vencido: emisión + 30 días.'
const AYUDA_OC = 'El número de la orden de compra que encargó este renglón, cuando la columna '
  + '«ORDEN DE COMPRA» del Sheet trae uno. Lo que no es número —la condición comercial— baja como '
  + 'segunda línea del concepto.'
const AYUDA_COMPROBANTE = 'El papel que respalda el renglón: la factura, o el documento firmado '
  + 'cuando no hay factura. «a facturar» = es del circuito B y todavía no se emitió.'

/** `2026-09-22` → `22/09/26`. Se escribe como se lee, nunca en ISO. */
export function dia(f: string | null): string | null {
  if (!f) return null
  const [a, m, d] = f.split('-')
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : f
}

/** LA CABECERA DE COLUMNAS, en el MISMO archivo que la fila: una grilla declarada en dos lugares
 *  se desalinea en cuanto una de las dos se toca. */
export function EncabezadoDeColumnas() {
  return (
    <div className={`grid gap-[12px] ${COLS_COBRANZA}`} style={ENCABEZADO} data-testid="encabezado-cols-cobranza">
      <span className={SOLO_ESCRITORIO}><RotuloCol titulo={AYUDA_COBRO}>Cobro</RotuloCol></span>
      <span className={SOLO_ESCRITORIO}><RotuloCol titulo={AYUDA_CIRCUITO}>B/N</RotuloCol></span>
      <RotuloCol>Concepto</RotuloCol>
      <span className={SOLO_ANCHO}><RotuloCol titulo={AYUDA_OC}>OC</RotuloCol></span>
      <span className={SOLO_ESCRITORIO}><RotuloCol titulo={AYUDA_COMPROBANTE}>Comprobante</RotuloCol></span>
      <span className={SOLO_ESCRITORIO}><RotuloCol>Medio</RotuloCol></span>
      <span className={SOLO_ANCHO}><RotuloCol derecha>Neto</RotuloCol></span>
      <span className={SOLO_ANCHO}><RotuloCol derecha>IVA</RotuloCol></span>
      <RotuloCol derecha>Total</RotuloCol>
    </div>
  )
}

/**
 * EL CONCEPTO: dos líneas en escritorio, ENTERO EN EL TELÉFONO.
 *
 * El recorte a dos líneas es aceptable donde el `title` completa el texto al pasar el mouse. En
 * táctil NO HAY `title`, y ahí un «…» esconde el dato para siempre — el auditor lo midió el
 * 11/09/2026 sobre `quattropani-final-390.png`: el «…» se comía el tipo de cambio («a TC 1.550»).
 * Abajo de 768px el clamp se suelta y la fila crece, que es lo que un teléfono puede hacer y una
 * grilla de nueve columnas no.
 */
const CONCEPTO_CLAMP = 'line-clamp-2 max-[767px]:line-clamp-none'
const CONCEPTO = { fontSize: '12px', lineHeight: 1.35 }
/** La condición comercial: una línea con `title` en escritorio, entera en el teléfono. */
const CONDICION_CLAMP = 'truncate max-[767px]:overflow-visible max-[767px]:whitespace-normal'

export function FilaDeCobranza({ f }: { f: FilaCobranza }) {
  const estado = estadoDe(f)
  const anulada = estado === 'anulado'
  const vencida = estado === 'vencido'
  const comprobante = comprobanteDe(f)
  const { oc, condicion } = ordenDeLaFila(f.orden_compra)
  const esIva = esRenglonDeIva(f.concepto)
  const concepto = f.concepto?.trim() || 'sin concepto'

  // EL `title` ES LA TRAZABILIDAD DE LA FILA: el renglón exacto del Sheet, la fecha de emisión que
  // explica el vencimiento, el neto y el estado crudo de la réplica. Sin esto, cruzar la pantalla
  // contra el archivo que el dueño abre es a ojo.
  const titulo = [
    f.fila ? `Cobranzas fila ${f.fila}` : 'Fila sin número en la réplica',
    `emitida ${dia(f.fecha_emision) ?? 'sin fecha'}`,
    concepto,
    f.orden_compra ? `col. ORDEN DE COMPRA: ${f.orden_compra}` : null,
    f.monto_neto != null ? `neto ${pesos(f.monto_neto)}` : null,
    f.retenciones ? `retenciones ${pesos(f.retenciones)}` : null,
    f.estado ? `estado en el Sheet: ${f.estado}` : null,
    anulada ? 'ANULADA: se muestra porque existe en el Sheet, y no se suma en ningún total.' : null,
  ].filter(Boolean).join(' · ')

  const tinta = anulada ? V.inerte : V.tinta
  const tenue = anulada ? V.inerte : V.tenue
  const apagado = anulada ? V.inerte : V.apagado

  return (
    <div
      role="row" data-testid="fila-cobranza" data-estado={estado} data-fila={f.fila ?? undefined}
      title={titulo}
      className={`grid gap-[12px] ${CAJA_CONTENIDO} ${COLS_COBRANZA} hover:bg-[#F2F1ED]`}
      style={{
        // El alto sale de `ALTO_V2.hija` como toda fila colgada de un bloque, y va como `minHeight`:
        // un concepto de dos líneas más su condición comercial hacen crecer la fila en vez de
        // recortar el texto, que era exactamente el defecto que el dueño marcó.
        minHeight: ALTO_V2.hija, borderBottom: `1px solid ${V.lineaFila}`,
        // 4px = el medio paso de la grilla de 8. El alto resultante es DERIVADO —como
        // `hijaConOrdenes` en el patrón—: la fila de una línea queda en el ritmo y la de tres crece.
        alignItems: 'center', paddingTop: 4, paddingBottom: 4,
        textDecoration: anulada ? 'line-through' : undefined,
      }}
    >
      {/* LA FECHA QUE DECIDE: cuándo entra la plata. El ▲ ámbar va pegado a ella y no en una celda
          propia — el vencimiento es un atributo de la fecha, no un estado suelto. */}
      <span
        className={`font-mono tabular-nums ${SOLO_ESCRITORIO}`}
        data-testid="cobro-cobranza"
        style={{ fontSize: '11.5px', color: vencida ? V.warn : apagado, whiteSpace: 'nowrap' }}
      >
        {/* EL TRIÁNGULO OCUPA SU LUGAR SIEMPRE, vencida o no: si sólo existiera en las vencidas
            correría los dígitos de esas filas y la columna dejaría de compararse de arriba abajo,
            que es lo único que una columna de fechas tiene que saber hacer. */}
        <span aria-hidden style={{ display: 'inline-block', width: 11, visibility: vencida ? undefined : 'hidden' }}>▲</span>
        {dia(f.fecha_cobro) ?? '—'}
      </span>
      {/* EL CIRCUITO EN UNA LETRA. Nunca en ámbar: N no es un problema, es otro circuito. */}
      <span
        className={`font-mono ${SOLO_ESCRITORIO}`} title={AYUDA_CIRCUITO} data-testid="circuito-cobranza"
        style={{ fontSize: '10.5px', color: tenue }}
      >
        {f.categoria ?? '·'}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span className={CONCEPTO_CLAMP} style={{ ...CONCEPTO, color: tinta }} title={concepto}>
          {/* UN RENGLÓN DE IVA CUELGA DE SU FACTURA. Es un cobro real con fecha propia —el IVA de
              la 220 entró el 19/08 y el neto el 31/07—, así que no se fusiona: se marca, para que
              nadie lo lea como una venta más. */}
          {esIva && <span aria-hidden style={{ color: tenue, marginRight: 4 }}>↳</span>}
          {concepto}
        </span>
        {/* LA CONDICIÓN COMERCIAL, EN TEXTO Y COMPLETA EN EL `title`: «cta. cte. 30 días»,
            «certificación quincenal 3/9», «Cargar OC». Es dato del Sheet, no una explicación. */}
        {condicion && (
          <span
            className={CONDICION_CLAMP} data-testid="condicion-cobranza" title={condicion}
            style={{ fontSize: '10.5px', color: tenue }}
          >
            {condicion}
          </span>
        )}
        {/* LA SEGUNDA LÍNEA DEL TELÉFONO: ahí no hay columnas, y una fila que no dice cuándo entra
            ni cómo no sirve para decidir nada. */}
        <span className="flex md:hidden" style={{ gap: 8, fontSize: '10.5px', color: tenue }}>
          <span className="font-mono tabular-nums" style={{ color: vencida ? V.warn : tenue }}>
            {vencida ? '▲ ' : ''}{dia(f.fecha_cobro) ?? 's/fecha'}
          </span>
          <span className="font-mono">{f.categoria ?? '·'}</span>
          {/* LA OC NO TIENE COLUMNA ABAJO DE 1200px: en el teléfono baja acá, porque «con OC si
              corresponde» es parte del pedido y no puede depender del ancho de la pantalla. */}
          {oc && <span className="font-mono tabular-nums">OC {oc}</span>}
          {f.forma_cobro?.trim() && <span>{f.forma_cobro.trim()}</span>}
        </span>
      </span>
      <span className={`font-mono tabular-nums truncate ${SOLO_ANCHO}`} title={AYUDA_OC} style={{ fontSize: '11.5px', color: apagado }}>
        {oc ?? '—'}
      </span>
      {/* EL PAPEL DEL RENGLÓN. «a facturar» en vez de «—»: una fila B sin comprobante no es un dato
          que falte, es una factura que todavía no se emitió —las nueve certificaciones de
          Quattropani—, y decirlo con la palabra convierte ocho guiones mudos en un plan de
          facturación. Una fila N puede tener respaldo firmado, y entonces es un enlace al papel. */}
      <span className={`truncate ${SOLO_ESCRITORIO}`} style={{ fontSize: '11.5px', color: comprobante || f.respaldo_drive_id ? (anulada ? V.inerte : V.tintaSuave) : tenue }}>
        {comprobante ?? (f.respaldo_drive_id
          ? (
            <a
              href={urlDriveDelPapel(f.respaldo_drive_id)} target="_blank" rel="noopener noreferrer"
              data-testid="respaldo-cobranza" title={f.respaldo_nota ?? f.respaldo_titulo ?? 'Abrir el papel en Drive'}
              className="hover:underline" style={{ color: V.tintaSuave }}
            >
              {f.respaldo_titulo ?? 'respaldo'} ↗
            </a>
          )
          : (f.categoria === 'B' ? 'a facturar' : 'sin comprobante'))}
      </span>
      <span className={`truncate ${SOLO_ESCRITORIO}`} style={{ fontSize: '11.5px', color: apagado }}>
        {f.forma_cobro?.trim() || '—'}
      </span>
      <span className={`font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '11px', color: tenue, textAlign: 'right' }}>
        {f.monto_neto == null ? '—' : pesos(f.monto_neto)}
      </span>
      {/* «—» EN IVA ES «esta fila no lleva IVA», que es el caso de todas las `N`: no es cero. */}
      <span className={`font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '11px', color: tenue, textAlign: 'right' }}>
        {f.iva == null ? '—' : pesos(f.iva)}
      </span>
      <span className="font-mono tabular-nums" data-testid="total-cobranza" style={{ fontSize: '12.5px', color: tinta, textAlign: 'right' }}>
        {f.total_bruto == null ? '—' : pesos(f.total_bruto)}
      </span>
    </div>
  )
}
