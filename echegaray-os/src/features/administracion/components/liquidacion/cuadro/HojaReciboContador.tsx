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

import type { ReactNode, RefObject } from 'react'
import { EMPLEADOR, periodoDePago, type ReciboContador, type RenglonContador } from '../../../services/reciboFormatoContador'
import { importeEnLetras } from '../../../services/importeEnLetras'
import { fechaCorta } from './HojaDelRecibo'

const TINTA = '#1F1F1E'
const GRIS = '#6B6B69'
const LINEA = '#BDBCB8'
const MONO = "'IBM Plex Mono', monospace"
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
      style={{ border: `1px solid ${LINEA}`, borderRadius: 4, padding: 16, background: '#FFFFFF', color: TINTA, fontSize: '11px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {estimado && (
        <div data-testid="recibo-contador-estimado" style={{ border: `2px solid ${TINTA}`, padding: '6px 10px', fontWeight: 700, fontSize: '12px', textAlign: 'center', letterSpacing: '.04em' }}>
          ESTIMADO · NO ES EL RECIBO DEL ESTUDIO
          <div style={{ fontWeight: 400, fontSize: '10.5px', letterSpacing: 0 }}>
            Importes de la liquidación estimada del OS. El recibo oficial lo emite el contador.
          </div>
        </div>
      )}
      <header>
        <div style={{ fontWeight: 700, fontSize: '13px' }}>{EMPLEADOR.razonSocial}</div>
        <div>{`C.U.I.T.: ${EMPLEADOR.cuit}`}</div>
        <div>{EMPLEADOR.domicilio}</div>
      </header>

      <Datos celdas={[
        ['Q', String(p.q)], ['MES', p.mes], ['AÑO', p.anio], ['APELLIDO Y NOMBRE', empleado.nombre], ['N° LEGAJO', empleado.legajo],
        ['REM. ASIGNADA', recibo.valorHora == null ? null : plata(recibo.valorHora)], ['SUELDO BRUTO', plata(recibo.sueldoBruto)], ['C.U.I.L.', empleado.cuil],
      ]} />
      <Datos celdas={[
        ['FECHA INGRESO', empleado.ingreso ? fechaCorta(empleado.ingreso) : null], ['FECHA RECONOCIDA', null], ['ANTIGÜEDAD', null],
        ['CALIFICACIÓN PROFESIONAL', null], ['F. PAGO APORTES', null], ['PERIODO', null], ['BANCO', null],
      ]} />
      <Datos celdas={[['CATEGORÍA LABORAL', recibo.categoria], ['SECCIÓN', null], ['MODALIDAD DE CONTRATACIÓN', null]]} />
      <Datos celdas={[['OBRA SOCIAL', null], ['LUGAR Y FECHA DE PAGO', null], ['PERIODO DE PAGO', p.texto]]} />

      {recibo.contribuciones.length > 0 && <Contribuciones recibo={recibo} />}

      <Conceptos recibo={recibo} />

      <div style={{ borderTop: `1px solid ${LINEA}`, paddingTop: 6 }}>
        {`COMPOSICIÓN SALARIAL: Remunerativo: ${plata(recibo.totalRemunerativo)}   No Remunerativo: ${plata(recibo.totalNoRemunerativo)}   Descuentos: ${plata(recibo.totalDescuentos)}`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1.5px solid ${TINTA}`, paddingTop: 6, fontSize: '13px', fontWeight: 700 }}>
        <span>{estimado ? 'SUELDO NETO ESTIMADO' : 'SUELDO NETO'}</span>
        <span style={{ fontFamily: MONO }} data-testid="recibo-contador-neto">{plata(recibo.neto)}</span>
      </div>
      <div>{`IMPORTE EN LETRAS: ${importeEnLetras(recibo.neto) ?? RAYA}`}</div>

      <div style={{ border: `1px solid ${LINEA}`, padding: '6px 8px', minHeight: 34 }}>
        <div style={{ fontSize: '9.5px', color: GRIS }}>OBSERVACIONES</div>
        <div>{estimado
          ? 'Recibo ESTIMADO: sale de la liquidación del OS, no del estudio contable. Sólo blanco. Cuando llegue el recibo del estudio, manda ése.'
          : 'Copia de los conceptos del recibo del estudio cargados en el OS. El original firmado es el PDF del legajo.'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <div style={{ borderTop: `1px solid ${TINTA}`, paddingTop: 4, textAlign: 'center' }}>FIRMA DEL EMPLEADO</div>
        <div style={{ borderTop: `1px solid ${TINTA}`, paddingTop: 4, textAlign: 'center' }}>FIRMA DEL EMPLEADOR</div>
      </div>
      <div style={{ fontSize: '10px', color: GRIS }}>
        Recibí el importe neto de esta liquidación en pago de mi remuneración correspondiente al período indicado de la misma conforme a la ley vigente
      </div>
    </div>
  )
}

function Datos({ celdas }: { celdas: [string, string | null][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${celdas.length}, auto)`, border: `1px solid ${LINEA}` }}>
      {celdas.map(([rotulo, valor], i) => (
        <div key={rotulo} style={{ padding: '3px 6px', borderLeft: i ? `1px solid ${LINEA}` : 0, minWidth: 0 }}>
          <div style={{ fontSize: '8.5px', color: GRIS, whiteSpace: 'nowrap' }}>{rotulo}</div>
          <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{valor ?? RAYA}</div>
        </div>
      ))}
    </div>
  )
}

const COLUMNAS = 'minmax(0, 1fr) 44px 86px 96px'

function Fila({ r }: { r: RenglonContador }) {
  return (
    <div data-testid={`recibo-contador-${r.codigo}`} style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 6, padding: '1px 0' }}>
      <span><span style={{ fontFamily: MONO, marginRight: 6 }}>{r.codigo}</span>{r.descripcion}</span>
      <span style={{ textAlign: 'right', fontFamily: MONO }}>{cantidad(r.unidad)}</span>
      <span style={{ textAlign: 'right', fontFamily: MONO }}>{r.base == null ? '' : plata(r.base)}</span>
      <span style={{ textAlign: 'right', fontFamily: MONO }}>{plata(r.monto)}</span>
    </div>
  )
}

function Encabezado() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 6, fontSize: '9.5px', color: GRIS, borderBottom: `1px solid ${LINEA}`, paddingBottom: 2 }}>
      <span>CONCEPTO</span><span style={{ textAlign: 'right' }}>UNIDAD</span><span style={{ textAlign: 'right' }}>BASE</span><span style={{ textAlign: 'right' }}>MONTO</span>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: '10px', paddingTop: 4 }}>{titulo}</div>
      {children}
    </>
  )
}

function Total({ rotulo, importe }: { rotulo: string; importe: number | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: `1px solid ${LINEA}`, paddingTop: 2 }}>
      <span>{rotulo}</span><span style={{ fontFamily: MONO }}>{plata(importe)}</span>
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
      <Encabezado />
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
      <Encabezado />
      <Seccion titulo="REMUNERATIVO">{recibo.remunerativo.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>
      <Seccion titulo="NO REMUNERATIVO">{recibo.noRemunerativo.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>
      <Seccion titulo="DESCUENTOS">{recibo.descuentos.map((r) => <Fila key={r.codigo} r={r} />)}</Seccion>
    </section>
  )
}
