'use client'

// EL DETALLE DE LO QUE SE LE DEBE A UN PROVEEDOR — «que si le hago click se amplíe en detalle de
// cada uno con menú a la derecha» (dueño, 16/09/2026).
//
// ═══ ES UN `Drawer`, COMO EL DEL CRM ═══
//
// El mismo componente que abre el detalle de una celda de costo en Clientes (`PanelDetalleCosto`):
// flota ENCIMA de la tabla y no le saca un píxel de ancho —«la interfaz no se mueve mientras se
// trabaja»—, cierra con ✕, con Escape y clickeando afuera, y en 390px ocupa la pantalla entera sin
// empujar nada a un scroll lateral. Un segundo panel propio habría sido un tercer comportamiento
// para el mismo gesto.
//
// ═══ LO ÚNICO QUE SE EDITA ACÁ ES «QUÉ HACER» (17/09/2026) ═══
//
// La nota es del proveedor, no de una compra: no tiene fila en Compras donde corregirse. Viaja al Sheet
// por su cola (`NotaQueHacer`). Todo lo demás se sigue corrigiendo en Compras.
//
// ═══ CADA LÍNEA LLEVA A SU FILA EN COMPRAS ═══
//
// `/administracion/compras?s=<fila>` es el mismo destino que usa el CRM: Compras es donde se corrige
// el estado, el vencimiento o el pago. El panel no edita nada — mostrar acá un formulario haría que
// la misma compra se pudiera tocar desde dos pantallas con dos reglas.
//
// ═══ EL PANEL NO LEE NI CALCULA ═══
//
// Recibe el detalle ya armado por `detalleDeProveedor`, que se prueba sin navegador. Acá sólo se
// elige qué se ve y de qué color: ámbar para lo vencido (un problema), tinta para lo por vencer (un
// compromiso). Los subtotales del pie son los del servicio, no una segunda suma de las filas
// dibujadas: si discreparan, el panel estaría inventando su propio total.
//
// ═══ LO QUE DICE LA PESTAÑA, AL LADO DE LO QUE DICE EL CÁLCULO ═══
//
// `tramo_vencimiento` de Compras («2 · Vence esta semana») es una etiqueta congelada cuando corrió
// el generador del Sheet, y a los días miente sin que nada esté roto. Va en el `title` de la fecha
// como referencia. Lo que decide el color es el cálculo contra la fecha de hoy, que se declara en
// el subtítulo.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { plataCentavos } from '@/shared/utils/format'
import { diaMesAnioISO, diaMesISO } from '@/shared/utils/fecha'
import { conceptoConCuotaAdelante } from '../../services/deudaProveedores'
import type { DetalleDeuda, LineaDeuda } from '../../services/deudaProveedores'
import type { NotaDeProveedor } from '../../services/notasDeDeuda'
import { NotaQueHacer } from './NotaQueHacer'

const MONO = 'font-mono tabular-nums'
const COLS = '44px minmax(0,1fr) 96px'
const FILA = {
  display: 'grid', gap: 8, alignItems: 'baseline',
  padding: '6px 0', borderBottom: `1px solid ${V.lineaPanel}`,
} as const
const CABEZA = {
  fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue,
} as const

export function PanelDeudaProveedor({ detalle, nota, obras, hoy, aviso, cerrarHref, fichaHref, hrefComprasBase }: {
  detalle: DetalleDeuda
  /** `null` = no hay nota que mostrar (sin grafía de Compras o sin lectura de notas). */
  nota: NotaDeProveedor | null
  /** `obra_id` → nombre de la obra, SIN el código interno. Un id que no está se dibuja «—». */
  obras: Map<string, string>
  hoy: string
  /** El descuadre contra `public.proveedor_deuda`, si lo hay. `null` = cierran o no hay con qué cotejar. */
  aviso: string | null
  cerrarHref: string
  /** La ficha del proveedor. `null` = el texto de Compras todavía no es nadie del maestro. */
  fichaHref: string | null
  hrefComprasBase: string
}) {
  const router = useRouter()
  const vencidas = detalle.lineas.filter((l) => l.estado === 'vencido')
  const porVencer = detalle.lineas.filter((l) => l.estado === 'por_vencer')
  const sinFecha = detalle.lineas.filter((l) => l.estado === 'sin_fecha')
  // LAS NOTAS DE CRÉDITO, EN SU PROPIO BLOQUE. No vencen y no se pagan: restan del total.
  const aFavor = detalle.lineas.filter((l) => l.estado === 'a_favor')
  return (
    <Drawer
      titulo={detalle.nombre}
      subtitulo={`${detalle.lineas.length} ${detalle.lineas.length === 1 ? 'línea' : 'líneas'} con saldo · al ${diaMesAnioISO(hoy)}`}
      ancho={460}
      onCerrar={() => router.push(cerrarHref)}
      testid="panel-deuda-proveedor"
    >
      {/* La `key` reinicia el campo cuando el Sheet trae otra nota o el pedido se resuelve. */}
      {nota && <NotaQueHacer key={`${nota.claveNota}|${nota.nota}|${nota.pendiente ?? ''}`} nota={nota} />}
      {vencidas.length > 0 && <Bloque titulo="Vencido" lineas={vencidas} total={detalle.vencido} obras={obras} base={hrefComprasBase} problema />}
      {porVencer.length > 0 && <Bloque titulo="Por vencer" lineas={porVencer} total={detalle.porVencer} obras={obras} base={hrefComprasBase} />}
      {sinFecha.length > 0 && <Bloque titulo="Sin fecha prevista" lineas={sinFecha} total={detalle.sinFecha} obras={obras} base={hrefComprasBase} problema />}
      {aFavor.length > 0 && <Bloque titulo="Notas de crédito (restan)" lineas={aFavor} total={detalle.aFavor} obras={obras} base={hrefComprasBase} />}

      <div
        data-testid="deuda-detalle-total"
        style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, paddingTop: 12, borderTop: `1px solid ${V.lineaFuerte}`, marginTop: 12 }}
      >
        <span />
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>Total adeudado</span>
        <span className={MONO} style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}>
          {plataCentavos(detalle.total)}
        </span>
      </div>

      {aviso && (
        <p data-testid="deuda-no-cierra" style={{ fontSize: '11.5px', color: V.warn, paddingTop: 8 }}>{aviso}</p>
      )}

      {/* LO POR VENCER NO SE DEBE TODAVÍA: sin esta línea, el total del panel se lee como plata a
          pagar hoy. Va una vez, al pie, y no repetida bajo cada importe. */}
      {porVencer.length > 0 && (
        <p style={{ fontSize: '11.5px', color: V.tenue, paddingTop: 6 }}>
          {`Lo por vencer tiene fecha posterior al ${diaMesAnioISO(hoy)}: está comprometido, no exigible hoy.`}
        </p>
      )}

      {fichaHref
        ? (
            <Link href={fichaHref} prefetch={false} data-testid="deuda-ver-ficha" style={{ display: 'inline-block', marginTop: 16, fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
              Ver la ficha del proveedor →
            </Link>
          )
        : (
            <p data-testid="deuda-sin-ficha-panel" style={{ marginTop: 16, fontSize: '11.5px', color: V.apagado }}>
              Este nombre de Compras todavía no está vinculado a un proveedor: no tiene ficha que abrir.
              Se resuelve en «Nombres sin resolver».
            </p>
          )}
    </Drawer>
  )
}

function Bloque({ titulo, lineas, total, obras, base, problema }: {
  titulo: string; lineas: LineaDeuda[]; total: number
  obras: Map<string, string>; base: string; problema?: boolean
}) {
  return (
    <div data-testid={`deuda-bloque-${titulo.toLowerCase().replace(/\s+/g, '-')}`} style={{ marginBottom: 14 }}>
      <div style={{ ...FILA, gridTemplateColumns: COLS, borderBottom: `1px solid ${V.lineaFuerte}` }}>
        <span style={CABEZA}>Vence</span>
        <span style={{ ...CABEZA, color: problema ? V.warn : V.tenue }}>{titulo}</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Saldo</span>
      </div>
      {lineas.map((l) => <Linea key={`${l.fila}-${l.cuota ?? ''}`} l={l} obras={obras} base={base} problema={problema} />)}
      <div style={{ ...FILA, gridTemplateColumns: COLS, borderBottom: 'none', paddingTop: 6 }}>
        <span />
        <span style={{ fontSize: '11.5px', color: V.apagado }}>{`Subtotal ${titulo.toLowerCase()}`}</span>
        <span className={MONO} style={{ fontSize: '12.5px', fontWeight: 600, color: problema ? V.warn : V.tinta, textAlign: 'right' }}>
          {plataCentavos(total)}
        </span>
      </div>
    </div>
  )
}

function Linea({ l, obras, base, problema }: {
  l: LineaDeuda; obras: Map<string, string>; base: string; problema?: boolean
}) {
  const obra = l.obraId ? obras.get(l.obraId) ?? null : null
  // EL COMPROBANTE Y LA OBRA IDENTIFICAN LA LÍNEA; el concepto la explica. La cuota va adelante
  // cuando existe: seis líneas del mismo concepto largo se ven idénticas si el recorte se come el
  // «2 de 2» del final — es la trampa que ya pagó el panel de costos del CRM.
  const encabezado = [l.comprobante, obra ?? 'sin obra'].filter(Boolean).join(' · ')
  const detalle = [l.cuota ? `cuota ${l.cuota}` : null, conceptoConCuotaAdelante(l.concepto)]
    .filter(Boolean).join(' · ')
  const pagadoParcial = l.pagado > 0 && l.total != null && l.pagado < l.total
  return (
    <Link
      href={`${base}${l.fila}`}
      prefetch={false}
      data-testid="deuda-linea"
      data-fila={l.fila}
      className="hover:underline"
      style={{ ...FILA, gridTemplateColumns: COLS }}
    >
      <span
        className={MONO}
        title={[
          l.vence ? `Vence el ${diaMesAnioISO(l.vence)}` : 'Sin fecha prevista de pago en Compras',
          l.tramoSheet ? `la pestaña dice: ${l.tramoSheet}` : null,
        ].filter(Boolean).join(' · ')}
        style={{ fontSize: '11.5px', color: problema ? V.warn : V.tenue }}
      >
        {diaMesISO(l.vence) ?? 's/f'}
      </span>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span className="truncate" style={{ fontSize: '12px', fontWeight: 500, color: V.tinta }}>{encabezado}</span>
        {detalle && (
          <span
            className="truncate"
            // EL TEXTO ENTERO, EN EL ORDEN ORIGINAL: lo de arriba está reordenado para que se
            // distinga de un vistazo, y acá se puede leer lo que Compras escribió.
            title={[l.comprobante, l.concepto].filter(Boolean).join(' · ')}
            style={{ fontSize: '11px', color: V.apagado }}
          >
            {detalle}
          </span>
        )}
        {/* EL PAGO PARCIAL SE DICE: sin esto, un saldo menor que el total se lee como un error de
            carga en vez de como lo que es — una entrega a cuenta ya hecha. */}
        {pagadoParcial && (
          <span className={MONO} data-testid="deuda-pagado-parcial" style={{ fontSize: '10.5px', color: V.tenue }}>
            {`de ${plataCentavos(l.total)} · pagado ${plataCentavos(l.pagado)}`}
          </span>
        )}
      </span>
      <span className={MONO} style={{ fontSize: '12.5px', color: problema ? V.warn : V.tinta, textAlign: 'right' }}>
        {plataCentavos(l.saldo)}
      </span>
    </Link>
  )
}
