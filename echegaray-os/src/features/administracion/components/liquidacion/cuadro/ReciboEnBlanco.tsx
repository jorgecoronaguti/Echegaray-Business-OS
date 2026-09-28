'use client'

// «RECIBO EN BLANCO (FORMATO CONTADOR)» EN EL PANEL DE LA PERSONA — se ve cómo queda y se imprime.
//
// Dueño, 28/09/2026: *«quiero que exista la opción de poder imprimir también un recibo con todo lo blanco como
// si fuese el recibo que envía el contador»*. Es otro papel que el recibo de pago (`ArmarRecibo`): aquél dice
// horas, banco y efectivo; éste, sólo lo blanco, concepto por concepto, con la forma del estudio.
//
// ═══ SÓLO IMPRIME: NO SE REGISTRA EN EL LEGAJO ═══
//
// `ArmarRecibo` sella el recibo de pago en `recibo_liquidacion` antes de imprimir, porque ése es el papel que
// la persona firma por lo que cobró. Éste, cuando es estimado, no es un documento de la empresa sino una
// vista previa del que va a mandar el estudio; sellarlo en el legajo pondría un recibo de sueldo que el
// contador nunca emitió al lado de los reales. Por eso no hay «aceptar»: se imprime o se guarda como PDF.

import { useRef, useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { DetalleLaboral } from '../../../services/detalleLaboral'
import { esReciboContador, reciboFormatoContador } from '../../../services/reciboFormatoContador'
import { HojaReciboContador, type EmpleadoDelRecibo } from './HojaReciboContador'
import { fechaCorta, imprimirHoja } from './HojaDelRecibo'
import { urlDelRecibo } from './CeldasBlancoNegro'

const BOTON = { padding: '9px 16px', lineHeight: '20px', borderRadius: 6, fontSize: '13px' } as const

/** Un campo del legajo por su rótulo; los mismos que muestra `DetalleLaboralDeLaPersona`. `null` = sin cargar. */
const delLegajo = (detalle: DetalleLaboral | undefined, rotulo: string): string | null =>
  [...(detalle?.legajo ?? []), ...(detalle?.laboral ?? [])].find((c) => c.rotulo === rotulo)?.valor ?? null

export function ReciboEnBlanco({ fila, quincena, detalle }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  detalle?: DetalleLaboral
}) {
  const hoja = useRef<HTMLDivElement>(null)
  const [bloqueado, setBloqueado] = useState(false)
  const r = reciboFormatoContador(fila.linea.sueldo)

  if (!esReciboContador(r)) {
    return (
      <section data-testid="recibo-contador" style={{ fontSize: '13px', color: V.apagado, lineHeight: 1.5 }}>
        <div data-testid="recibo-contador-falta">{`No hay recibo en blanco para imprimir: ${r.falta}.`}</div>
        {r.driveFileId && (
          <a href={urlDelRecibo(r.driveFileId)} target="_blank" rel="noreferrer" style={{ color: V.tinta }}>Abrir el recibo del estudio ↗</a>
        )}
      </section>
    )
  }

  const empleado: EmpleadoDelRecibo = {
    nombre: fila.nombre, legajo: delLegajo(detalle, 'Legajo'), cuil: delLegajo(detalle, 'CUIL'), ingreso: fila.alta,
  }
  const titulo = `Recibo en blanco${r.origen === 'estimado' ? ' ESTIMADO' : ''} ${fila.nombre} ${fechaCorta(quincena.desde)} al ${fechaCorta(quincena.hasta)}`
  const imprimir = () => setBloqueado(!imprimirHoja(hoja.current, titulo))

  return (
    <section data-testid="recibo-contador" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }}>
        {r.origen === 'recibo'
          ? 'Los conceptos del recibo del estudio de esta quincena.'
          : 'Todavía no llegó el recibo del estudio: es el blanco ESTIMADO del panel, y así sale impreso.'}
        {r.driveFileId && (
          <> <a href={urlDelRecibo(r.driveFileId)} target="_blank" rel="noreferrer" style={{ color: V.tinta }}>Abrir el PDF original ↗</a></>
        )}
      </div>
      {r.avisos.map((a) => (
        <div key={a} style={{ fontSize: '12px', color: V.warn }} data-testid="recibo-contador-aviso">{`⚠ ${a}`}</div>
      ))}

      <HojaReciboContador hoja={hoja} recibo={r} empleado={empleado} quincena={quincena} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!r.cuadra} onClick={imprimir} data-testid="recibo-contador-imprimir"
          style={{ ...BOTON, border: 0, background: V.grafito, color: '#FFFFFF', fontWeight: 600, cursor: r.cuadra ? 'pointer' : 'default', opacity: r.cuadra ? 1 : 0.5 }}>
          Imprimir / Guardar PDF
        </button>
        <span style={{ fontSize: '11.5px', color: V.apagado }}>
          {r.cuadra ? 'No se registra en el legajo: el recibo de sueldo oficial lo emite el estudio.' : 'No se imprime: el neto no se puede afirmar (ver el aviso).'}
        </span>
        {bloqueado && (
          <div style={{ width: '100%', fontSize: '12.5px', color: V.warn }} data-testid="recibo-contador-bloqueado">
            El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes de app.ecsas.com.ar y probá de nuevo.
          </div>
        )}
      </div>
    </section>
  )
}
