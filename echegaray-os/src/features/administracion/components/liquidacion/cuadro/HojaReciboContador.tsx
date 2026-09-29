'use client'

// EL PAPEL DEL RECIBO EN BLANCO, CON LA DISPOSICIÓN DEL QUE MANDA EL ESTUDIO.
//
// El orden y los rótulos son los del recibo oficial Q2-08/2026 (ver `reciboFormatoContador.ts`): empleador,
// cuatro renglones de datos del empleado, contribuciones del empleador, CONCEPTO / UNIDAD / BASE / MONTO por
// sección, composición salarial, neto, neto en letras, observaciones y firmas. Un dato que la app no tiene
// (fecha de pago de aportes, banco, obra social, sección…) va con «—»: el papel del estudio los trae, y
// escribir uno inventado sería peor que el hueco.
//
// ESTILOS EN LÍNEA, SIN CLASES: `imprimirHoja` copia el `outerHTML` a una ventana en blanco, donde ninguna
// hoja de estilos de la app existe. Tampoco hay un solo cálculo acá: se dibuja lo que armó el servicio.
//
// DISEÑO (dueño, 29/09/2026: «un diseño más lindo del recibo en blanco: colores, logo»). Marca medida del logo:
// el GRAFITO ordena (rótulos, filetes, neto) y el AMARILLO es una sola regla fina bajo el encabezado, como el
// isotipo: nunca fondo de texto. Sin media queries (no viajan a la ventana de impresión): el ancho angosto se
// resuelve con grillas `auto-fit` y filas que envuelven, y ningún importe, CUIL ni fecha se parte (`nowrap`).
//
// SIN BANNER «ESTIMADO» (dueño, 29/09/2026: «más limpio»). Lo que sigue diciendo que es estimado: el rótulo
// «SUELDO NETO ESTIMADO» y las OBSERVACIONES; `data-origen` y el título de la impresión no cambian.

import type { ReactNode, RefObject } from 'react'
import { EMPLEADOR, periodoDePago, type ReciboContador, type RenglonContador } from '../../../services/reciboFormatoContador'
import { importeEnLetras } from '../../../services/importeEnLetras'
import { V } from '@/shared/components/v2/patron'
import { fechaCorta } from './HojaDelRecibo'

const TINTA = '#1F1F1E'
const GRAFITO = V.grafito
const GRIS = '#6B6B69'
const LINEA = '#D7D5CF'
const FILETE = '#F1F0EC'
const SUAVE = '#FAFAF8'
const MONO = "'IBM Plex Mono', monospace"
const NUM = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const
const SIN_CORTE = { breakInside: 'avoid', pageBreakInside: 'avoid' } as const
const RAYA = '—'

const plata = (n: number | null): string =>
  n == null ? RAYA : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const cantidad = (n: number | null): string => (n == null ? '' : n.toLocaleString('es-AR'))
/** En el recibo del estudio, el 5480 va aparte, bajo «COSTO DERIVADO DE CCT». */
const DERIVADO_DE_CCT = new Set(['5480'])

export interface EmpleadoDelRecibo {
  nombre: string
  legajo: string | null
  cuil: string | null
  /** ISO. */
  ingreso: string | null
}

export function HojaReciboContador({ hoja, recibo, empleado, quincena }: {
  hoja?: RefObject<HTMLDivElement | null>
  recibo: ReciboContador
  empleado: EmpleadoDelRecibo
  quincena: { desde: string; hasta: string }
}) {
  const p = periodoDePago(quincena.desde)
  const estimado = recibo.origen === 'estimado'
  return (
    <div ref={hoja} data-recibo-imprimible data-testid="recibo-contador-hoja" data-origen={recibo.origen}
      style={{ border: `1px solid ${LINEA}`, borderRadius: 6, padding: 20, background: '#FFFFFF', color: TINTA, fontSize: '12px', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box', maxWidth: '100%' }}>
      <Encabezado />

      <Datos celdas={[
        ['Q', String(p.q)], ['MES', p.mes], ['AÑO', p.anio], ['APELLIDO Y NOMBRE', empleado.nombre, true], ['N° LEGAJO', empleado.legajo],
        ['REM. ASIGNADA', recibo.valorHora == null ? null : plata(recibo.valorHora)], ['SUELDO BRUTO', plata(recibo.sueldoBruto)], ['C.U.I.L.', empleado.cuil],
      ]} />
      <Datos celdas={[
        ['FECHA INGRESO', empleado.ingreso ? fechaCorta(empleado.ingreso) : null], ['FECHA RECONOCIDA', null], ['ANTIGÜEDAD', null],
        ['CALIFICACIÓN PROFESIONAL', null, true], ['F. PAGO APORTES', null], ['PERIODO', null], ['BANCO', null],
      ]} />
      <Datos celdas={[['CATEGORÍA LABORAL', recibo.categoria, true], ['SECCIÓN', null, true], ['MODALIDAD DE CONTRATACIÓN', null, true]]} />
      <Datos celdas={[['OBRA SOCIAL', null, true], ['LUGAR Y FECHA DE PAGO', null, true], ['PERIODO DE PAGO', p.texto, true]]} />

      {recibo.contribuciones.length > 0 && <Contribuciones recibo={recibo} />}

      <Conceptos recibo={recibo} />

      <Composicion recibo={recibo} />
      <div style={{ ...SIN_CORTE, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 16px', borderTop: `2px solid ${GRAFITO}`, background: SUAVE, padding: '10px 12px', fontWeight: 700 }}>
        <span style={{ fontSize: '13px', letterSpacing: '.04em' }}>{estimado ? 'SUELDO NETO ESTIMADO' : 'SUELDO NETO'}</span>
        <span style={{ ...NUM, fontSize: '18px' }} data-testid="recibo-contador-neto">{plata(recibo.neto)}</span>
      </div>
      <div style={SIN_CORTE}>
        <span style={{ fontSize: '9.5px', color: GRIS, letterSpacing: '.04em' }}>IMPORTE EN LETRAS: </span>
        <span style={{ fontWeight: 600 }}>{importeEnLetras(recibo.neto) ?? RAYA}</span>
      </div>

      <div style={{ ...SIN_CORTE, border: `1px solid ${LINEA}`, borderRadius: 4, padding: '8px 10px', minHeight: 40 }}>
        <div style={{ fontSize: '9.5px', color: GRIS, letterSpacing: '.04em' }}>OBSERVACIONES</div>
        <div>{estimado
          ? 'Recibo ESTIMADO: sale de la liquidación del OS, no del estudio contable. Sólo blanco. Cuando llegue el recibo del estudio, manda ése.'
          : 'Copia de los conceptos del recibo del estudio cargados en el OS. El original firmado es el PDF del legajo.'}</div>
      </div>

      <div style={{ ...SIN_CORTE, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '32px 24px', marginTop: 20 }}>
        <div style={{ borderTop: `1px solid ${TINTA}`, paddingTop: 4, textAlign: 'center', fontSize: '10.5px' }}>FIRMA DEL EMPLEADO</div>
        <div style={{ borderTop: `1px solid ${TINTA}`, paddingTop: 4, textAlign: 'center', fontSize: '10.5px' }}>FIRMA DEL EMPLEADOR</div>
      </div>
      <div style={{ fontSize: '10px', color: GRIS }}>
        Recibí el importe neto de esta liquidación en pago de mi remuneración correspondiente al período indicado de la misma conforme a la ley vigente
      </div>
    </div>
  )
}

/**
 * Logo del dueño (`public/marca/logo.png`), como `<img>` y con ruta que empieza en «/» — `imprimirHoja` la vuelve
 * absoluta al copiar el HTML. El PNG trae margen transparente: los márgenes negativos alinean el dibujo al texto.
 * La regla amarilla de abajo es la única aparición del amarillo, igual que en el logo.
 */
function Encabezado() {
  return (
    <header style={{ ...SIN_CORTE, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', paddingBottom: 12, borderBottom: `3px solid ${V.marca}` }}>
      <img src="/marca/logo.png" alt="Echegaray Construcciones S.A.S." height={64}
        style={{ height: 64, width: 'auto', display: 'block', margin: '-6px 0 -6px -10px' }} />
      <div style={{ textAlign: 'right', flex: '1 1 200px' }}>
        <div style={{ fontWeight: 700, fontSize: '13px' }}>{EMPLEADOR.razonSocial}</div>
        <div style={{ color: GRIS, whiteSpace: 'nowrap' }}>{`C.U.I.T.: ${EMPLEADOR.cuit}`}</div>
        <div style={{ color: GRIS }}>{EMPLEADOR.domicilio}</div>
      </div>
    </header>
  )
}

/**
 * Celdas que envuelven en filas según el ancho (auto-fit) en vez de apretarse en una sola. El rótulo puede
 * bajar de línea entre palabras; el valor NO se parte (CUIL, fecha, importe) salvo los de texto (`texto`).
 */
function Datos({ celdas }: { celdas: [string, string | null, boolean?][] }) {
  return (
    <div style={{ ...SIN_CORTE, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', borderTop: `1px solid ${LINEA}`, borderLeft: `1px solid ${LINEA}` }}>
      {celdas.map(([rotulo, valor, texto]) => (
        <div key={rotulo} style={{ padding: '5px 8px', minWidth: 0, borderRight: `1px solid ${LINEA}`, borderBottom: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: '9px', color: GRIS, letterSpacing: '.04em', lineHeight: 1.25 }}>{rotulo}</div>
          <div style={{ fontWeight: 600, ...(texto ? { overflowWrap: 'anywhere' } : NUM) }}>{valor ?? RAYA}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * CONCEPTO + tres cifras. El concepto pide 200px y el grupo numérico tiene ancho fijo: en pantalla ancha van en
 * una línea con las columnas alineadas; en un teléfono el grupo baja debajo del concepto, alineado a la derecha.
 */
const FILA = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 } as const
const CONCEPTO = { flex: '1 1 200px', minWidth: 0 } as const
const CIFRAS = { display: 'flex', gap: 8, marginLeft: 'auto', flex: '0 0 auto' } as const
const ANCHOS = [48, 104, 108] as const
const cifra = (i: 0 | 1 | 2) => ({ ...NUM, width: ANCHOS[i], textAlign: 'right' } as const)

function Fila({ r }: { r: RenglonContador }) {
  return (
    <div data-testid={`recibo-contador-${r.codigo}`} style={{ ...SIN_CORTE, ...FILA, padding: '3px 0', borderBottom: `1px solid ${FILETE}` }}>
      <span style={CONCEPTO}><span style={{ fontFamily: MONO, marginRight: 6, color: GRIS }}>{r.codigo}</span>{r.descripcion}</span>
      <span style={CIFRAS}>
        <span style={cifra(0)}>{cantidad(r.unidad)}</span>
        <span style={cifra(1)}>{r.base == null ? '' : plata(r.base)}</span>
        <span style={{ ...cifra(2), fontWeight: 600 }}>{plata(r.monto)}</span>
      </span>
    </div>
  )
}

function Rotulos() {
  return (
    <div style={{ ...FILA, fontSize: '9.5px', color: '#FFFFFF', background: GRAFITO, padding: '3px 6px', letterSpacing: '.04em', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <span style={CONCEPTO}>CONCEPTO</span>
      <span style={CIFRAS}><span style={cifra(0)}>UNIDAD</span><span style={cifra(1)}>BASE</span><span style={cifra(2)}>MONTO</span></span>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div style={SIN_CORTE}>
      <div style={{ fontWeight: 700, fontSize: '10.5px', letterSpacing: '.06em', color: GRAFITO, padding: '8px 0 2px', borderBottom: `1px solid ${GRAFITO}` }}>{titulo}</div>
      {children}
    </div>
  )
}

function Total({ rotulo, importe }: { rotulo: string; importe: number | null }) {
  return (
    <div style={{ ...SIN_CORTE, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontWeight: 700, borderTop: `1px solid ${LINEA}`, padding: '4px 0' }}>
      <span>{rotulo}</span><span style={NUM}>{plata(importe)}</span>
    </div>
  )
}

function Composicion({ recibo }: { recibo: ReciboContador }) {
  const item = (rotulo: string, n: number | null) => (
    <span style={{ whiteSpace: 'nowrap' }}><span style={{ color: GRIS }}>{`${rotulo}: `}</span><span style={{ ...NUM, fontWeight: 600 }}>{plata(n)}</span></span>
  )
  return (
    <div style={{ ...SIN_CORTE, borderTop: `1px solid ${LINEA}`, paddingTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 20px' }}>
      <span style={{ fontWeight: 700, fontSize: '10.5px', letterSpacing: '.04em', color: GRAFITO }}>COMPOSICIÓN SALARIAL</span>
      {item('Remunerativo', recibo.totalRemunerativo)}{item('No Remunerativo', recibo.totalNoRemunerativo)}{item('Descuentos', recibo.totalDescuentos)}
    </div>
  )
}

/** Como el estudio: costo total arriba, las contribuciones, el 5480 aparte, subtotal y sueldo bruto. */
function Contribuciones({ recibo }: { recibo: ReciboContador }) {
  const comunes = recibo.contribuciones.filter((r) => !DERIVADO_DE_CCT.has(r.codigo))
  const cct = recibo.contribuciones.filter((r) => DERIVADO_DE_CCT.has(r.codigo))
  return (
    <section>
      <Total rotulo="COSTO TOTAL EMPLEADOR" importe={recibo.costoTotalEmpleador} />
      <Rotulos />
      {comunes.map((r) => <Fila key={r.codigo} r={r} />)}
      {cct.length > 0 && <Seccion titulo="COSTO DERIVADO DE CCT">{cct.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>}
      <Total rotulo="SUB TOTAL CONTRIBUCIONES EMPLEADOR" importe={recibo.contribucionesEmpleador} />
      <Total rotulo="SUELDO BRUTO" importe={recibo.sueldoBruto} />
    </section>
  )
}

function Conceptos({ recibo }: { recibo: ReciboContador }) {
  return (
    <section>
      <Rotulos />
      <Seccion titulo="REMUNERATIVO">{recibo.remunerativo.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>
      <Seccion titulo="NO REMUNERATIVO">{recibo.noRemunerativo.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>
      <Seccion titulo="DESCUENTOS">{recibo.descuentos.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>
    </section>
  )
}
