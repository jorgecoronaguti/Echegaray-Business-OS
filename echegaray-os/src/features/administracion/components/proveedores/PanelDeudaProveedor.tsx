'use client'

// EL DETALLE DE LO QUE SE LE DEBE A UN PROVEEDOR — «que si le hago click se amplíe en detalle de
// cada uno con menú a la derecha» (dueño, 16/09/2026).
//
// ═══ PRIMERO LOS COMPROBANTES, POR OBRA (dueño, 18/09/2026) ═══
//
// «Necesito, al hacer click en el menú derecho, que primero salgan los comprobantes que estoy
// debiendo y en relación a las obras que esto incluyen». Hasta hoy el panel abría con la nota «Qué
// hacer» y recién después las líneas, partidas en tres bloques por vencimiento, con la obra como una
// palabra dentro de cada renglón. Ahora:
//
//   1. una línea de resumen: «$X vencido · $Y por vencer · $Z sin fecha» — el CUÁNDO no se pierde,
//      pasa de ser la agrupación a ser un atributo;
//   2. un bloque por OBRA, con el nombre como cabecera y el subtotal adeudado por obra; «sin obra»
//      al final y dicho como tal; adentro cada comprobante con vencimiento, número, concepto (la
//      cuota adelante) y saldo — lo vencido en ámbar, lo por vencer en tinta, línea por línea;
//   3. el total, el cotejo contra `proveedor_deuda` y la aclaración de lo por vencer;
//   4. «Qué hacer», que no se quita (lo pidió el dueño el 17/09): baja debajo de los comprobantes;
//   5. el enlace a la ficha.
//
// El agrupado, el orden de las obras y los subtotales los arma `deudaPorObra` en el servicio, que se
// prueba sin navegador. Acá sólo se elige qué se ve y de qué color.
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
// el estado, el vencimiento, el pago o la obra. El panel no edita nada — mostrar acá un formulario
// haría que la misma compra se pudiera tocar desde dos pantallas con dos reglas.
//
// ═══ EL PANEL NO LEE NI CALCULA ═══
//
// Recibe el detalle ya armado por `detalleDeProveedor`. Los subtotales por obra y el total son los
// del servicio, no una segunda suma de las filas dibujadas: si discreparan, el panel estaría
// inventando su propio total. Ámbar para lo vencido (un problema), tinta para lo por vencer (un
// compromiso). Un subtotal de obra sin nada vencido NO va en ámbar: el color es de la cifra que
// bloquea, no del bloque.
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
import type { DetalleDeuda, DeudaPorObra, LineaDeuda } from '../../services/deudaProveedores'
import type { NotaDeProveedor } from '../../services/notasDeDeuda'
import { NotaQueHacer } from './NotaQueHacer'

const MONO = 'font-mono tabular-nums'
/**
 * 110 PX PARA EL SALDO, no 96: medido el 18/09/2026, «$12.666.727,27» (14 caracteres en mono de
 * 12,5-13 px) se cortaba en el subtotal y en el total con 96 px. Un total que no se lee entero es un
 * total distinto.
 */
const COLS = '44px minmax(0,1fr) 110px'
const COLS_CABECERA_OBRA = 'minmax(0,1fr) 110px'
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
  const conObra = detalle.obras.filter((o) => o.obraId !== null).length
  return (
    <Drawer
      titulo={detalle.nombre}
      subtitulo={subtitulo(detalle, conObra, hoy)}
      ancho={460}
      onCerrar={() => router.push(cerrarHref)}
      testid="panel-deuda-proveedor"
    >
      <Resumen detalle={detalle} />

      <div style={{ ...FILA, gridTemplateColumns: COLS, borderBottom: `1px solid ${V.lineaFuerte}`, marginTop: 10 }}>
        <span style={CABEZA}>Vence</span>
        <span style={CABEZA}>Comprobante · concepto</span>
        <span style={{ ...CABEZA, textAlign: 'right' }}>Saldo</span>
      </div>

      {detalle.obras.map((o) => (
        <BloqueObra key={o.obraId ?? 'sin-obra'} o={o} nombre={o.obraId ? obras.get(o.obraId) ?? null : null} base={hrefComprasBase} />
      ))}

      <div
        data-testid="deuda-detalle-total"
        style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, paddingTop: 12, borderTop: `1px solid ${V.lineaFuerte}`, marginTop: 4 }}
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
      {detalle.porVencer > 0 && (
        <p style={{ fontSize: '11.5px', color: V.tenue, paddingTop: 6 }}>
          {`Lo por vencer tiene fecha posterior al ${diaMesAnioISO(hoy)}: está comprometido, no exigible hoy.`}
        </p>
      )}

      {/* «QUÉ HACER» BAJA DEBAJO DE LOS COMPROBANTES (18/09/2026): lo primero que se ve es lo que se
          debe. La nota no se quita — la pidió el dueño el 17/09 — y sigue siendo lo único editable.
          La `key` reinicia el campo cuando el Sheet trae otra nota o el pedido se resuelve. */}
      {nota && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${V.linea}` }}>
          <NotaQueHacer key={`${nota.claveNota}|${nota.nota}|${nota.pendiente ?? ''}`} nota={nota} />
        </div>
      )}

      {fichaHref
        ? (
            <Link href={fichaHref} prefetch={false} data-testid="deuda-ver-ficha" style={{ display: 'inline-block', marginTop: nota ? 4 : 16, fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
              Ver la ficha del proveedor →
            </Link>
          )
        : (
            <p data-testid="deuda-sin-ficha-panel" style={{ marginTop: nota ? 4 : 16, fontSize: '11.5px', color: V.apagado }}>
              Este nombre de Compras todavía no está vinculado a un proveedor: no tiene ficha que abrir.
              Se resuelve en «Nombres sin resolver».
            </p>
          )}
    </Drawer>
  )
}

/** «9 comprobantes en 1 obra · al 18/09/2026». Cuenta obras de verdad: «sin obra» no es una obra. */
function subtitulo(detalle: DetalleDeuda, conObra: number, hoy: string): string {
  const n = detalle.lineas.length
  const partes = [`${n} ${n === 1 ? 'comprobante' : 'comprobantes'} con saldo`]
  if (conObra > 0) partes.push(`en ${conObra} ${conObra === 1 ? 'obra' : 'obras'}`)
  return `${partes.join(' ')} · al ${diaMesAnioISO(hoy)}`
}

/**
 * EL CUÁNDO, EN UNA LÍNEA: «$X vencido · $Y por vencer · $Z sin fecha». Sólo las partes que existen:
 * «$0,00 vencido» en ámbar se lee como una alarma que no está (el mismo criterio que la tabla).
 */
function Resumen({ detalle }: { detalle: DetalleDeuda }) {
  const partes: { texto: string; color: string; testid: string }[] = []
  if (detalle.vencido > 0) partes.push({ texto: `${plataCentavos(detalle.vencido)} vencido`, color: V.warn, testid: 'deuda-resumen-vencido' })
  if (detalle.porVencer > 0) partes.push({ texto: `${plataCentavos(detalle.porVencer)} por vencer`, color: V.tinta, testid: 'deuda-resumen-por-vencer' })
  if (detalle.sinFecha > 0) partes.push({ texto: `${plataCentavos(detalle.sinFecha)} sin fecha`, color: V.warn, testid: 'deuda-resumen-sin-fecha' })
  if (!partes.length) return null
  return (
    <p data-testid="deuda-resumen" className={MONO} style={{ fontSize: '12px', color: V.tenue, lineHeight: '18px' }}>
      {partes.map((p, i) => (
        <span key={p.testid}>
          {i > 0 && <span> · </span>}
          <span data-testid={p.testid} style={{ color: p.color, fontWeight: p.color === V.warn ? 600 : 500 }}>{p.texto}</span>
        </span>
      ))}
    </p>
  )
}

/** Una obra: su nombre y su subtotal como cabecera, y debajo sus comprobantes. */
function BloqueObra({ o, nombre, base }: { o: DeudaPorObra; nombre: string | null; base: string }) {
  const sinObra = o.obraId === null
  // UN ID QUE NO ESTÁ EN `obra_panel` no se rellena con nada: se dibuja el id en tenue y se ve que
  // falta el nombre, que es distinto de «sin obra» — la imputación existe, el rótulo no.
  const titulo = sinObra ? 'Sin obra imputada' : nombre ?? o.obraId
  return (
    <div data-testid="deuda-obra" data-obra={o.obraId ?? ''} style={{ marginBottom: 10 }}>
      <div
        data-testid="deuda-obra-cabecera"
        style={{ ...FILA, gridTemplateColumns: COLS_CABECERA_OBRA, paddingTop: 12, borderBottom: `1px solid ${V.lineaPanel}` }}
      >
        <span style={{ display: 'grid', minWidth: 0 }}>
          <span
            className="truncate"
            title={sinObra ? 'Comprobantes con saldo que Compras todavía no imputó a ninguna obra. Se imputan en Compras.' : titulo ?? undefined}
            style={{ fontSize: '12.5px', fontWeight: 600, color: sinObra ? V.apagado : nombre ? V.tinta : V.tenue, fontStyle: sinObra ? 'italic' : undefined }}
          >
            {titulo}
          </span>
          {/* A 390 PX ESTA LÍNEA QUIEBRA, y quiebra por tramo entero: medido el 18/09/2026, con un
              solo `span` el corte caía adentro del importe y «vencido» quedaba solo en el renglón
              de abajo. `flex-wrap` baja «$332.256,84 vencido» completo. */}
          <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, fontSize: '11px', color: V.tenue }}>
            <span style={{ whiteSpace: 'nowrap' }}>
              {`${o.comprobantes} ${o.comprobantes === 1 ? 'comprobante' : 'comprobantes'}`}
              {o.vencido > 0 && ' ·'}
            </span>
            {/* LO VENCIDO DE ESTA OBRA, al lado del conteo: el subtotal de la derecha es lo que se
                debe; esto es la parte que ya bloquea. Sólo si existe: «$0,00 vencido» no se escribe. */}
            {o.vencido > 0 && (
              <span className={MONO} data-testid="deuda-obra-vencido" style={{ color: V.warn, whiteSpace: 'nowrap' }}>
                {`${plataCentavos(o.vencido)} vencido`}
              </span>
            )}
          </span>
        </span>
        {/* EL SUBTOTAL VA EN TINTA: es lo que se debe por esta obra, no lo que bloquea. Lo que
            bloquea está al lado del conteo, en ámbar, con su propia cifra. */}
        <span
          className={MONO} data-testid="deuda-obra-subtotal"
          style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}
        >
          {plataCentavos(o.total)}
        </span>
      </div>
      {o.lineas.map((l) => <Linea key={`${l.fila}-${l.cuota ?? ''}`} l={l} base={base} />)}
    </div>
  )
}

function Linea({ l, base }: { l: LineaDeuda; base: string }) {
  // ÁMBAR PARA LO QUE YA BLOQUEA: vencido, y sin fecha (se debe y no se puede decir cuándo). Lo por
  // vencer es un compromiso y va en tinta.
  const problema = l.estado !== 'por_vencer'
  // EL COMPROBANTE IDENTIFICA LA LÍNEA; el concepto la explica. La cuota va adelante cuando existe:
  // seis líneas del mismo concepto largo se ven idénticas si el recorte se come el «2 de 2» del
  // final — es la trampa que ya pagó el panel de costos del CRM.
  const concepto = [l.cuota ? `cuota ${l.cuota}` : null, conceptoConCuotaAdelante(l.concepto)]
    .filter(Boolean).join(' · ')
  // SIN NÚMERO DE COMPROBANTE, EL CONCEPTO ES LA LÍNEA PRINCIPAL. Medido el 18/09/2026: las nueve
  // filas de Pedro Tello no tienen número, y «sin número de comprobante» nueve veces en negrita
  // tapaba lo único que las distingue. Que falta el número se dice en el `title`, no en la fila.
  const principal = l.comprobante ?? (concepto || 'sin comprobante ni concepto en Compras')
  const secundario = l.comprobante ? concepto : ''
  const pagadoParcial = l.pagado > 0 && l.total != null && l.pagado < l.total
  return (
    <Link
      href={`${base}${l.fila}`}
      prefetch={false}
      data-testid="deuda-linea"
      data-fila={l.fila}
      data-estado={l.estado}
      className="hover:underline"
      style={{ ...FILA, gridTemplateColumns: COLS }}
    >
      <span
        className={MONO}
        title={[
          l.vence ? `Vence el ${diaMesAnioISO(l.vence)}` : 'Sin fecha prevista de pago en Compras',
          l.estado === 'vencido' ? 'vencido' : l.estado === 'por_vencer' ? 'por vencer' : null,
          l.tramoSheet ? `la pestaña dice: ${l.tramoSheet}` : null,
        ].filter(Boolean).join(' · ')}
        style={{ fontSize: '11.5px', color: problema ? V.warn : V.tenue }}
      >
        {diaMesISO(l.vence) ?? 's/f'}
      </span>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span
          className="truncate"
          // EL TEXTO ENTERO, EN EL ORDEN ORIGINAL: lo de la fila está reordenado para que se
          // distinga de un vistazo, y acá se puede leer lo que Compras escribió.
          title={[l.comprobante ?? 'sin número de comprobante', l.concepto].filter(Boolean).join(' · ')}
          style={{ fontSize: '12px', fontWeight: 500, color: l.comprobante || concepto ? V.tinta : V.apagado }}
        >
          {principal}
        </span>
        {secundario && (
          <span className="truncate" title={l.concepto ?? undefined} style={{ fontSize: '11px', color: V.apagado }}>
            {secundario}
          </span>
        )}
        {/* EL PAGO PARCIAL SE DICE: sin esto, un saldo menor que el total se lee como un error de
            carga en vez de como lo que es — una entrega a cuenta ya hecha. */}
        {pagadoParcial && (
          <span
            className={MONO} data-testid="deuda-pagado-parcial"
            // Dos tramos que quiebran enteros a 390 px, no una frase cortada por la mitad de un importe.
            style={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, fontSize: '10.5px', color: V.tenue }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>{`de ${plataCentavos(l.total)} ·`}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{`pagado ${plataCentavos(l.pagado)}`}</span>
          </span>
        )}
      </span>
      <span className={MONO} style={{ fontSize: '12.5px', color: problema ? V.warn : V.tinta, textAlign: 'right' }}>
        {plataCentavos(l.saldo)}
      </span>
    </Link>
  )
}
