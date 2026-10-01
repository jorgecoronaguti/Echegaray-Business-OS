// UN RENGLÓN DEL ESTADO DE CUENTA DEL CLIENTE.
//
// ═══ POR QUÉ SE REHIZO (dueño, 01/10/2026) ═══
//
// «Esto realmente es inservible e inusable… no puedo saber nada de las cobranzas de ningún cliente
// en CRM admin, no se entiende, revisar y rehacer toda esa sección.»
//
// Medido sobre la ficha de Messina: veintiséis renglones repartidos en trece tablitas —una por
// obra, cada una con su propio encabezado de columnas y su lista de órdenes de compra con importes—,
// en gris de 11px, sin que ningún renglón dijera en qué ESTADO está ni cuándo se FACTURÓ. El estado
// había que deducirlo de la banda; la fecha de factura —la misma por la que el dueño pidió filtrar—
// vivía en un `title`.
//
// ═══ EL RENGLÓN AHORA ES EL DE UN ESTADO DE CUENTA ═══
//
// El lenguaje es el de la tabla «Certificados y facturas» de la pantalla 28 del diseño del dueño
// (`cuenta/TablaCertificados.tsx`): DOCUMENTO en dos líneas · las dos fechas · MONTO · ESTADO en
// palabras y en su color. Las dos fechas son las dos columnas del Sheet por las que se filtra —
// «Fecha de Factura» (Q) y «Fecha cobro» (R)—, cada una con su dato debajo: el comprobante bajo la
// factura, el medio bajo el cobro. La obra dejó de ser una tablita y es la segunda línea del
// documento, con su orden de compra y la condición comercial.
//
// Las reglas que no cambian: cifras en mono tabular; una fila anulada se ve tachada y no suma; el
// concepto no se trunca a mitad de la palabra útil; en el teléfono no hay `title`, así que lo que
// en escritorio completa el `title` ahí se escribe entero.

import Link from 'next/link'
import { pesos } from '@/shared/components/canon/formato'
import { CAJA_CONTENIDO, ENCABEZADO, HOVER_FILA, RotuloCol, V } from '@/shared/components/v2/patron'
import { C } from '../canon/tokens'
import { esRenglonDeIva, ordenDeLaFila, type FilaCobranza } from '../../services/cobranzasCliente'
import { estadoConPlazo, papelDelRenglon, type ClaveDeEstado } from '../../services/estadoDeCuenta'
import { urlDriveDelPapel } from '../../services/papelesCliente'

/** DOCUMENTO · FACTURA · COBRO · B/N · NETO · IVA · MONTO · ESTADO. */
export const COLS_COBRANZA
  = 'grid-cols-[minmax(260px,1fr)_104px_116px_28px_108px_100px_128px_128px]'
  + ' max-[1199px]:grid-cols-[minmax(180px,1fr)_104px_116px_28px_128px_128px]'
  + ' max-[899px]:grid-cols-[minmax(0,1fr)_auto]'

/** Lo que se suelta abajo de 1200px: el desglose de neto e IVA. El monto queda siempre. */
export const SOLO_ANCHO = 'max-[1199px]:hidden'
/** Lo que se suelta en la vista angosta, donde baja a la tercera línea del documento. */
export const SOLO_TABLA = 'max-[899px]:hidden'
const SOLO_ANGOSTO = 'hidden max-[899px]:flex'

const AYUDA_FACTURA = 'La «Fecha de Factura» de la pestaña Cobranzas y, debajo, el comprobante. '
  + '«a facturar» = es del circuito B y todavía no se emitió: la fecha es cuándo se prevé facturar.'
const AYUDA_COBRO = 'La «Fecha cobro» de la pestaña y, debajo, el medio. En lo que falta cobrar es '
  + 'una PREVISIÓN: la prueba de que entró es el extracto del banco.'
const AYUDA_CIRCUITO = 'B = con comprobante: el circuito facturado, con IVA. '
  + 'N = sin comprobante. Son dos circuitos, no dos estados.'
const AYUDA_ESTADO = 'Cobrado, a vencer o vencido, como lo publica la pestaña: vencido = Pendiente '
  + 'con fecha de cobro anterior a hoy. Los días se cuentan contra la fecha de cobro.'

/** El color de cada estado es el de la pantalla 28: verde lo que entró, azul lo que está en camino,
 *  rojo lo vencido. Lo anulado no es un estado de la plata: va apagado. */
const COLOR_DE_ESTADO: Record<ClaveDeEstado, string> = {
  cobrado: C.pos, a_vencer: C.curso, vencido: C.neg, anulado: V.inerte,
}

/** `2026-09-22` → `22/09/26`. Se escribe como se lee, nunca en ISO. */
export function dia(f: string | null | undefined): string | null {
  if (!f) return null
  const [a, m, d] = f.split('-')
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : f
}

/** LA CABECERA DE COLUMNAS, UNA SOLA VEZ para toda la tabla y en el MISMO archivo que la fila: una
 *  grilla declarada en dos lugares se desalinea en cuanto una de las dos se toca. */
export function EncabezadoDeColumnas() {
  return (
    // EL `display:grid` DE `ENCABEZADO` VA EN `style` Y LE GANA A CUALQUIER CLASE: para soltar la
    // cabecera en la vista angosta la clase tiene que ir en un envoltorio, no en la grilla.
    <div className={SOLO_TABLA}>
      <div className={`grid ${COLS_COBRANZA}`} style={ENCABEZADO} data-testid="encabezado-cols-cobranza">
        <RotuloCol>Documento</RotuloCol>
        <RotuloCol titulo={AYUDA_FACTURA}>Factura</RotuloCol>
        <RotuloCol titulo={AYUDA_COBRO}>Cobro</RotuloCol>
        <RotuloCol titulo={AYUDA_CIRCUITO}>B/N</RotuloCol>
        <span className={SOLO_ANCHO}><RotuloCol derecha>Neto</RotuloCol></span>
        <span className={SOLO_ANCHO}><RotuloCol derecha>IVA</RotuloCol></span>
        <RotuloCol derecha>Monto</RotuloCol>
        <RotuloCol titulo={AYUDA_ESTADO}>Estado</RotuloCol>
      </div>
    </div>
  )
}

/** Dos líneas apiladas. Por CLASE y no por `style`: un `display` en `style` no se puede soltar con
 *  una clase responsiva, y estas celdas tienen que desaparecer en la vista angosta. */
const DOS_LINEAS = 'flex flex-col gap-0.5 min-w-0'
/** Dos líneas en la tabla, ENTERO en la vista angosta: ahí no hay `title` que complete un «…». */
const CONCEPTO_CLAMP = 'line-clamp-2 max-[899px]:line-clamp-none'
const UNA_LINEA = 'truncate max-[899px]:overflow-visible max-[899px]:whitespace-normal'

export function FilaDeCobranza({ f, obra }: {
  f: FilaCobranza
  /** La obra a la que la imputación ató el renglón. `null` = Cobranzas lo anota contra el cliente. */
  obra: { obra_id: string; nombre: string } | null
}) {
  const estado = estadoConPlazo(f)
  const anulada = estado.clave === 'anulado'
  const papel = papelDelRenglon(f)
  const { oc, condicion } = ordenDeLaFila(f.orden_compra)
  const concepto = f.concepto?.trim() || 'sin concepto'
  const medio = f.forma_cobro?.trim() || null

  // EL `title` ES LA TRAZABILIDAD DE LA FILA: el renglón exacto del Sheet y lo que la tabla no dibuja.
  const titulo = [
    f.fila ? `Cobranzas fila ${f.fila}` : 'Fila sin número en la réplica',
    `fecha de venta ${dia(f.fecha_emision) ?? 'sin fecha'}`,
    concepto,
    f.orden_compra ? `col. ORDEN DE COMPRA: ${f.orden_compra}` : null,
    f.retenciones ? `retenciones ${pesos(f.retenciones)}` : null,
    f.estado ? `estado en el Sheet: ${f.estado}` : null,
    anulada ? 'ANULADA: se muestra porque existe en el Sheet, y no se suma en ningún total.' : null,
  ].filter(Boolean).join(' · ')

  const tinta = anulada ? V.inerte : V.tinta
  const suave = anulada ? V.inerte : V.apagado
  const tenue = anulada ? V.inerte : V.tenue
  const colorEstado = COLOR_DE_ESTADO[estado.clave]
  const fechaFactura = dia(f.fecha_venta)
  const fechaCobro = dia(f.fecha_cobro)

  const elPapel = papel.clase === 'respaldo' && f.respaldo_drive_id
    ? (
      <a
        href={urlDriveDelPapel(f.respaldo_drive_id)} target="_blank" rel="noopener noreferrer"
        data-testid="respaldo-cobranza" title={f.respaldo_nota ?? 'Abrir el papel en Drive'}
        className="hover:underline" style={{ color: suave }}
      >
        {papel.texto} ↗
      </a>
    )
    : papel.texto

  return (
    <div
      role="row" data-testid="fila-cobranza" data-estado={estado.clave} data-fila={f.fila ?? undefined}
      title={titulo}
      className={`grid gap-[14px] ${CAJA_CONTENIDO} ${COLS_COBRANZA} ${HOVER_FILA}`}
      style={{
        // 54px es el alto de fila de la tabla de la 28; va como `minHeight` porque un concepto de dos
        // líneas más su segunda línea hacen crecer la fila en vez de recortar el texto.
        minHeight: 54, alignItems: 'center', paddingTop: 4, paddingBottom: 4,
        borderBottom: `1px solid ${V.lineaFila}`,
        textDecoration: anulada ? 'line-through' : undefined,
      }}
    >
      <span className={DOS_LINEAS}>
        <span className={CONCEPTO_CLAMP} style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.35, color: tinta }}>
          {/* UN RENGLÓN DE IVA CUELGA DE SU FACTURA: es un cobro real con fecha propia, así que no se
              fusiona con ella; se marca para que nadie lo lea como una venta más. */}
          {esRenglonDeIva(f.concepto) && <span aria-hidden style={{ color: tenue, marginRight: 4 }}>↳</span>}
          {concepto}
        </span>
        {/* DE QUÉ OBRA ES, CON QUÉ ORDEN Y EN QUÉ CONDICIÓN. Son datos del Sheet, no una explicación. */}
        <span className={UNA_LINEA} data-testid="obra-cobranza" style={{ fontSize: '11.5px', color: tenue }}>
          {obra
            ? (
              <Link href={`/obras/${obra.obra_id}`} prefetch={false} className="hover:underline" style={{ color: suave }}>
                {obra.nombre}
              </Link>
            )
            : 'sin obra atribuida'}
          {oc && <span className="font-mono tabular-nums"> · OC {oc}</span>}
          {condicion && <span data-testid="condicion-cobranza"> · {condicion}</span>}
        </span>
        {/* LA VISTA ANGOSTA NO TIENE COLUMNAS: lo que la tabla reparte en cinco baja a esta línea,
            con el estado primero —es lo que decide— y el resto en el orden de la tabla. */}
        <span
          className={`${SOLO_ANGOSTO} flex-wrap`} data-testid="resumen-angosto-cobranza"
          style={{ columnGap: 8, rowGap: 2, fontSize: '11.5px', color: tenue }}
        >
          <span style={{ color: colorEstado }}>{estado.texto}</span>
          <span className="font-mono tabular-nums">cobro {fechaCobro ?? 's/fecha'}</span>
          {medio && <span>{medio}</span>}
          <span className="font-mono">{f.categoria ?? '·'}</span>
          <span>{elPapel}{fechaFactura ? ` ${fechaFactura}` : ''}</span>
        </span>
      </span>

      <span className={`${DOS_LINEAS} ${SOLO_TABLA}`} data-testid="factura-cobranza">
        <span className="font-mono tabular-nums" style={{ fontSize: '12.5px', color: suave }}>
          {fechaFactura ?? '—'}
        </span>
        <span className="truncate" style={{ fontSize: '11.5px', color: tenue }}>{elPapel}</span>
      </span>

      <span className={`${DOS_LINEAS} ${SOLO_TABLA}`} data-testid="cobro-cobranza">
        <span className="font-mono tabular-nums" style={{ fontSize: '12.5px', color: estado.clave === 'vencido' ? C.neg : suave }}>
          {fechaCobro ?? '—'}
        </span>
        <span className="truncate" style={{ fontSize: '11.5px', color: tenue }}>{medio ?? '—'}</span>
      </span>

      <span
        className={`font-mono ${SOLO_TABLA}`} title={AYUDA_CIRCUITO} data-testid="circuito-cobranza"
        style={{ fontSize: '11.5px', color: tenue }}
      >
        {f.categoria ?? '·'}
      </span>

      <span className={`font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '12.5px', color: tenue, textAlign: 'right' }}>
        {f.monto_neto == null ? '—' : pesos(f.monto_neto)}
      </span>
      {/* «—» EN IVA ES «esta fila no lleva IVA», que es el caso de todas las `N`: no es cero. */}
      <span className={`font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '12.5px', color: tenue, textAlign: 'right' }}>
        {f.iva == null ? '—' : pesos(f.iva)}
      </span>

      <span className="font-mono tabular-nums" data-testid="total-cobranza" style={{ fontSize: '13px', color: tinta, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {f.total_bruto == null ? '—' : pesos(f.total_bruto)}
      </span>

      <span
        className={SOLO_TABLA} data-testid="estado-cobranza"
        style={{ fontSize: '12.5px', color: colorEstado, whiteSpace: 'nowrap', textDecoration: 'none' }}
      >
        {estado.texto}
      </span>
    </div>
  )
}
