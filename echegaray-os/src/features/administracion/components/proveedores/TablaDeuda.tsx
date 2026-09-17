// «A QUIÉN LE DEBO» — una fila por proveedor, y el clic abre el detalle a la derecha.
//
// «Necesito en la sección proveedores una tabla que me indique a quiénes les debo y cuánto y
// cuándo, discriminado, que si le hago click se amplíe en detalle de cada uno con menú a la
// derecha» (dueño, 16/09/2026).
//
// ═══ LA TABLA ES LA PANTALLA ═══
//
// Sin caja, sin tarjeta por dato y sin banda de KPIs arriba: criterio 3 del patrón v2 —filos,
// tipografía y números tabulares, el color sólo en la cifra— y la geometría del handoff v4 que ya
// usa `TablaProveedores` al lado. Los seis rótulos y el pie de totales son todo el andamiaje.
//
// ═══ EL ORDEN ES LA RECOMENDACIÓN ═══
//
// Primero quien tiene plata VENCIDA, de mayor a menor; después, por la fecha que llega antes. La
// tabla no opina en un texto sobre a quién pagar: lo dice ordenando, que es lo que se lee sin leer.
// El criterio vive en `deudaProveedores.ts` y está probado sin navegador.
//
// ═══ EL ÁMBAR ES SÓLO PARA LO VENCIDO ═══
//
// `V.warn` y el filo izquierdo `FILO_BLOQUEA` marcan la fila que ya tiene una fecha pasada — un
// problema, que es la única licencia que la regla 12 del dueño le da al rojo/naranja. Lo por vencer
// es un compromiso, no un problema, y va en tinta normal. Un vencido de $0 no pinta nada: se
// escribe «—», porque `$0,00` en ámbar se lee como una alarma que no existe.
//
// ═══ «SIN FECHA» NO SE ESCONDE Y NO SE CUENTA COMO VENCIDO ═══
//
// Una compra con saldo y sin fecha prevista se debe, pero no se puede decir cuándo. Suma al total y
// aparece bajo el importe con su rótulo. Contarla como vencida inventaría una urgencia; dejarla
// afuera publicaría una deuda más chica que la real.

import Link from 'next/link'
import {
  ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, HOVER_FILA, RotuloCol, V,
} from '@/shared/components/v2/patron'
import { plataCentavos } from '@/shared/utils/format'
import { diaMesAnioISO, diaMesISO } from '@/shared/utils/fecha'
import type { DeudaDeProveedor, TotalesDeuda } from '../../services/deudaProveedores'
import type { NotaDeProveedor } from '../../services/notasDeDeuda'

/** La grilla, literal porque Tailwind no compila un valor armado en runtime. */
const COLS
  = 'grid-cols-[minmax(220px,1.1fr)_150px_170px_160px_110px_minmax(150px,1fr)]'
  + ' max-[1199px]:grid-cols-[minmax(150px,1.4fr)_minmax(0,1fr)]'
const GAP = 16
/** Lo que se suelta en angosto. Va POR CLASE: un `display` inline le gana a la media query. */
const SOLO_ANCHO = 'max-[1199px]:hidden'
/**
 * LO QUE SÓLO EXISTE EN ANGOSTO.
 *
 * A 390px la grilla es de DOS pistas, así que sólo pueden quedar DOS celdas por fila: con cuatro,
 * las sobrantes caen a un segundo renglón y la tabla se lee como dos tablas encimadas — medido el
 * 16/09/2026 en la primera pasada de QA. En angosto sobreviven PROVEEDOR y TOTAL, y el desglose
 * vencido / por vencer baja a un renglón bajo el nombre: la misma información, una lectura sola.
 */
const SOLO_ANGOSTO = 'min-[1200px]:hidden'
const MONO = 'font-mono tabular-nums'

export function TablaDeuda({ filas, totales, hoy, notas, seleccionada, hrefDe }: {
  filas: DeudaDeProveedor[]
  /** Clave de la fila → su nota «Qué hacer» del Sheet. */
  notas?: Map<string, NotaDeProveedor>
  totales: TotalesDeuda
  /** El día contra el que se decidió qué venció. Se declara: mañana la misma fila dice otra cosa. */
  hoy: string
  seleccionada?: string
  hrefDe: (clave: string) => string
}) {
  if (!filas.length) {
    return (
      <div data-testid="deuda-vacia" style={{ padding: '24px 0', fontSize: '13px', color: V.apagado }}>
        No hay ninguna compra con saldo pendiente.
      </div>
    )
  }
  return (
    <div data-testid="tabla-deuda">
      <div className={`grid ${COLS}`} style={{ ...ENCABEZADO, gap: GAP }}>
        <RotuloCol>Proveedor</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={`Saldo con fecha prevista de pago anterior o igual al ${diaMesAnioISO(hoy)}.`}>
            Vencido
          </RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Saldo comprometido con fecha posterior a hoy. Todavía no se debe.">
            Por vencer
          </RotuloCol>
        </span>
        <RotuloCol derecha titulo="Todo el saldo pendiente de la pestaña Compras, sin anuladas.">
          Total adeudado
        </RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Filas de Compras con saldo. Una fila con dos cuotas cuenta una vez.">
            Comprob.
          </RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol titulo="La fecha que hay que atender: la vencida más vieja si hay, si no la próxima.">
            Próximo venc.
          </RotuloCol>
        </span>
      </div>

      {filas.map((f) => (
        <FilaDeuda key={f.clave} f={f} nota={notas?.get(f.clave)} elegida={f.clave === seleccionada} href={hrefDe(f.clave)} />
      ))}

      <Pie totales={totales} />
    </div>
  )
}

function FilaDeuda({ f, nota, elegida, href }: {
  f: DeudaDeProveedor; nota?: NotaDeProveedor; elegida: boolean; href: string
}) {
  const vencida = f.vencido > 0
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid="fila-deuda"
      data-clave={f.clave}
      aria-current={elegida ? 'true' : undefined}
      className={`grid ${COLS} ${CAJA_CONTENIDO} ${elegida ? '' : HOVER_FILA}`}
      style={{
        gap: GAP, alignItems: 'center', minHeight: ALTO_V2.fila,
        borderBottom: `1px solid ${V.lineaFila}`,
        background: elegida ? V.seleccion : undefined,
        // EL FILO DICE «ESTO BLOQUEA PLATA», y es el mismo de las demás listas de Administración.
        boxShadow: vencida ? FILO_BLOQUEA : undefined,
        paddingLeft: vencida ? 8 : undefined,
      }}
    >
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span className="truncate" style={{ fontSize: '13.5px', fontWeight: 500, color: V.tinta }}>{f.nombre}</span>
        {/* SIN FICHA: la deuda es real, pero el texto de Compras todavía no es nadie del maestro, y
            por eso esta fila no lleva a una ficha. Se dice; no se inventa un proveedor. */}
        {!f.proveedorId && (
          <span data-testid="deuda-sin-ficha" style={{ fontSize: '11px', color: V.warn }}>
            sin ficha de proveedor
          </span>
        )}
        {/* «QUÉ HACER», LA NOTA DEL SHEET, bajo el nombre y en una línea: es la instrucción que decide
            a quién pagar, y en el Sheet va al lado del proveedor. Entera en el `title` y en el panel. */}
        {(nota?.pendiente ?? nota?.nota) && (
          <span
            data-testid="deuda-nota" className="truncate" title={nota?.pendiente ?? nota?.nota}
            style={{ fontSize: '11.5px', lineHeight: '14px', color: V.tintaSuave, fontStyle: 'italic' }}
          >
            {nota?.pendiente ?? nota?.nota}
            {nota?.pendiente !== null && nota?.pendiente !== undefined && <span style={{ fontStyle: 'normal', color: V.tenue }}> · esperando al Sheet</span>}
          </span>
        )}
        {/* UN CONFLICTO CON EL SHEET SE VE EN LA FILA, no sólo al abrir el panel: puede ser una nota que
            el dueño borró y el OS no borró porque fueron varias a la vez. */}
        {nota?.rechazo && (
          <span data-testid="deuda-nota-conflicto" className="truncate" title={nota.rechazo} style={{ fontSize: '11px', lineHeight: '13px', color: V.warn }}>
            conflicto con el Sheet
          </span>
        )}
        {/* EL DESGLOSE EN ANGOSTO. A 390px las columnas Vencido y Por vencer no caben, y el dato que
            hacen falta —cuánto ya venció y desde cuándo— no se puede perder: baja acá, en una línea. */}
        <span
          data-testid="deuda-desglose-angosto"
          className={`${MONO} ${SOLO_ANGOSTO} truncate`}
          title={vencida
            ? `${plataCentavos(f.vencido)} vencidos desde el ${diaMesAnioISO(f.masViejaVencida)}`
            : `El primer vencimiento es el ${diaMesAnioISO(f.proximoVencimiento)}`}
          style={{ fontSize: '11px', lineHeight: '13px', color: vencida ? V.warn : V.tenue }}
        >
          {/* CORTO A PROPÓSITO: a 390px la celda mide ~150px y «$81.000,00 vencido desde 14/09/26»
              se cortaba en «desde 1…». El año no aporta en una deuda viva; la fecha entera vive en
              el `title` y en la columna de escritorio. */}
          {vencida
            ? `${plataCentavos(f.vencido)} vencido · ${diaMesISO(f.masViejaVencida)}`
            : `vence ${diaMesISO(f.proximoVencimiento)}`}
        </span>
      </span>

      <span className={`grid ${SOLO_ANCHO}`}>
        <Importe
          valor={f.vencido} fecha={f.masViejaVencida} rotuloFecha="desde"
          color={vencida ? V.warn : V.tenue} peso={vencida ? 600 : 400} testid="deuda-vencido"
        />
      </span>
      <span className={`grid ${SOLO_ANCHO}`}>
        <Importe
          valor={f.porVencer} fecha={f.proximoVencimiento} rotuloFecha="desde"
          color={V.tintaSuave} peso={400} testid="deuda-por-vencer"
        />
      </span>

      <span style={{ display: 'grid', justifyItems: 'end', minWidth: 0 }}>
        <span className={MONO} data-testid="deuda-total" style={{ fontSize: '13.5px', fontWeight: 600, color: V.tinta }}>
          {plataCentavos(f.total)}
        </span>
        {f.sinFecha > 0 && (
          <span
            className={MONO} data-testid="deuda-sin-fecha"
            title="Saldo sin fecha prevista de pago en Compras: se debe, pero no se puede decir cuándo."
            style={{ fontSize: '10.5px', lineHeight: '12px', color: V.warn }}
          >
            {`${plataCentavos(f.sinFecha)} sin fecha`}
          </span>
        )}
      </span>

      <span className={`${MONO} ${SOLO_ANCHO}`} style={{ fontSize: '12.5px', color: V.tintaSuave, textAlign: 'right' }}>
        {f.comprobantes}
      </span>
      <span
        className={`${MONO} ${SOLO_ANCHO}`} data-testid="deuda-proximo"
        style={{ fontSize: '12.5px', color: vencida ? V.warn : V.tintaSuave }}
      >
        {diaMesAnioISO(f.masViejaVencida ?? f.proximoVencimiento)}
      </span>
    </Link>
  )
}

/** Un importe con su fecha debajo, en un bloque que recorta: un `nowrap` en línea pisa la celda de al lado. */
function Importe({ valor, fecha, rotuloFecha, color, peso, testid }: {
  valor: number; fecha: string | null; rotuloFecha: string
  color: string; peso: number; testid: string
}) {
  return (
    <span style={{ display: 'grid', justifyItems: 'end', minWidth: 0 }}>
      <span className={MONO} data-testid={testid} style={{ fontSize: '13.5px', fontWeight: peso, color }}>
        {valor > 0 ? plataCentavos(valor) : '—'}
      </span>
      {valor > 0 && fecha && (
        <span
          className={MONO}
          style={{
            display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
            fontSize: '10.5px', lineHeight: '12px', color: V.tenue, whiteSpace: 'nowrap',
          }}
        >
          {`${rotuloFecha} ${diaMesAnioISO(fecha)}`}
        </span>
      )}
    </span>
  )
}

/** EL PIE. Suma las filas que se dibujaron, no una segunda consulta: la tabla y su total no pueden discrepar. */
function Pie({ totales }: { totales: TotalesDeuda }) {
  return (
    <div
      className={`grid ${COLS}`} data-testid="deuda-totales"
      style={{
        gap: GAP, alignItems: 'center', minHeight: ALTO_V2.fila,
        borderTop: `1px solid ${V.lineaFuerte}`, marginTop: -1,
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: 600, color: V.tinta }}>
        {`${totales.proveedores} ${totales.proveedores === 1 ? 'proveedor' : 'proveedores'}`}
      </span>
      <span className={`${MONO} ${SOLO_ANCHO}`} style={{ fontSize: '13px', fontWeight: 600, color: totales.vencido > 0 ? V.warn : V.tenue, textAlign: 'right' }}>
        {totales.vencido > 0 ? plataCentavos(totales.vencido) : '—'}
      </span>
      <span className={`${MONO} ${SOLO_ANCHO}`} style={{ fontSize: '13px', color: V.tintaSuave, textAlign: 'right' }}>
        {plataCentavos(totales.porVencer)}
      </span>
      <span className={MONO} style={{ fontSize: '13.5px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}>
        {plataCentavos(totales.total)}
      </span>
      <span className={`${MONO} ${SOLO_ANCHO}`} style={{ fontSize: '12.5px', color: V.tintaSuave, textAlign: 'right' }}>
        {totales.comprobantes}
      </span>
      <span className={SOLO_ANCHO} />
    </div>
  )
}
