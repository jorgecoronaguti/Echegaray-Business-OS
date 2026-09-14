'use client'

// EL PANEL DE LA PERSONA EN EL CUADRO DE LA QUINCENA — lo que no entra en la fila, sin perderlo.
//
// Dueño, 14/09/2026: *«no se entiende nada… no sé cuánto es el total que cobra cada persona»*. El
// cuadro se quedó con lo que contesta «cuánto cobra y cómo se le paga»; lo demás se mudó acá, no se
// borró: la cadena entera con sus descuentos editables, POR BANCO editable, el acuerdo 50/50, la
// jornada automática sin confirmar, el cotejo con la planilla y el historial del valor hora.
//
// ═══ DRAWER Y NO `PanelDePersona` ═══
//
// `PanelDePersona` se despliega DEBAJO de la grilla y empuja la fila que se está mirando fuera de la
// pantalla. Éste flota encima (`Drawer`) y el cuadro no se mueve.
//
// ═══ NI UNA CUENTA NUEVA ═══
//
// Las cifras son las de la línea (`getLiquidacionDeLaQuincena`); el cierre, `cierreDeLaFila`.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { horas as nHoras, pesos } from '../formato'
import { Escribible, Leida } from './CeldasDelEspejo'
import { HistorialDeTarifa } from './HistorialDeTarifa'
import { rotuloCategoria } from './CeldaTarifa'
import { ALTO_LIQ } from '../solapas/tabla'
import { cierreDeLaFila, type EntradaDeHistorial } from '../../../services/cuadroDeJornales'
import type { CampoEditable } from '../../../services/liquidacionOverrides'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { DetalleLaboral } from '../../../services/detalleLaboral'
import { DetalleLaboralDeLaPersona } from './DetalleLaboralDeLaPersona'

const MONO = "'IBM Plex Mono', monospace"
const corta = (iso: string | null): string =>
  iso == null ? 'sin cargar' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

export function PanelDeLaPersona({ fila, quincena, camposEditables, historial, historialCompleto, detalle, onCerrar }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  historial: readonly EntradaDeHistorial[]
  historialCompleto: boolean
  /** Lo laboral que tenía la grilla de «Horas»: costo cargado, legajo, HH por mes, esperadas y estado. */
  detalle?: DetalleLaboral
  onCerrar: () => void
}) {
  const l = fila.linea
  const cierre = cierreDeLaFila(l)
  const esHora = l.netoMensual == null
  return (
    <Drawer
      titulo={fila.nombre}
      subtitulo={`${fila.categoria ? rotuloCategoria(fila.categoria) : 'sin categoría'} · alta ${corta(fila.alta)}`}
      onCerrar={onCerrar}
      ancho={520}
      testid="panel-cuadro-persona"
      pie={<Link href={`/administracion/personas/${fila.personaId}`} prefetch={false} style={{ fontSize: '12.5px', color: V.tinta }}>Ver el legajo completo</Link>}
    >
      <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section data-testid="panel-cadena">
          <Rotulo>Esta quincena</Rotulo>
          <Renglon rotulo="Cobra total" nota={esHora ? `${nHoras(l.horas)} h pagas × ${pesos(l.valorHora)}/h` : 'neto mensual'}>
            <Leida valor={l.cobra} medio origen={l.origen.cobra} />
          </Renglon>
          <Renglon rotulo="− Adelanto">
            <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={120} />
          </Renglon>
          <Renglon rotulo="− Ya transferido">
            <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={120} />
          </Renglon>
          <Renglon rotulo="= Banco + efectivo" fuerte
            nota={cierre && !cierre.cierra ? `no cierra por ${pesos(cierre.diferencia)}` : undefined} alerta={cierre?.cierra === false}>
            <Leida valor={l.total} medio origen={l.origen.total} />
          </Renglon>
          <Renglon rotulo="Por banco (blanco)" nota={l.reciboSinGiro ? 'recibo sin giro en el extracto' : undefined}>
            <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={120} />
          </Renglon>
          <Renglon rotulo="En efectivo">
            <Leida valor={l.enEfectivo} origen={l.origen.enEfectivo} />
          </Renglon>
          {l.blancoAcuerdo != null && (
            <Renglon rotulo="Acuerdo 50/50" nota="lo acordado; el banco manda lo que dice el recibo">
              <span style={{ fontSize: '12px', color: V.apagado }}>{`banco ${pesos(l.blancoAcuerdo)} · efectivo ${pesos(l.efectivoAcuerdo)}`}</span>
            </Renglon>
          )}
          {l.reciboNeto != null && (
            <Renglon rotulo="Recibo del estudio"><span>{pesos(l.reciboNeto)}</span></Renglon>
          )}
        </section>

        {(fila.horasPorTipo.automaticas > 0 || fila.cotejo.estado === 'difiere') && (
          <section style={{ fontSize: '12px', color: V.apagado, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {fila.horasPorTipo.automaticas > 0 && (
              <div data-testid="panel-automaticas" style={{ color: V.warn }}>
                {/* EN LLANO (dueño, 14/09/2026: «8a 9a no se q es eso»): las fechas, y que no se pagan. */}
                {`${fila.celdas.filter((c) => c.marca !== 'horas' && c.automatica != null)
                  .map((c) => `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}`).join(' y ')} sin horas cargadas (no se pagan)`}
              </div>
            )}
            {fila.cotejo.estado === 'difiere' && (
              <div>{`La planilla dice ${nHoras(fila.cotejo.horasEnLaPlanilla)} h y la base ${nHoras(fila.cotejo.horasEnLaBase)} h.`}</div>
            )}
          </section>
        )}

        <HistorialDeTarifa entradas={historial} completo={historialCompleto} />

        <DetalleLaboralDeLaPersona detalle={detalle} />
      </div>
    </Drawer>
  )
}

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase', paddingBottom: 8 }}>
      {children}
    </div>
  )
}

function Renglon({ rotulo, nota, fuerte = false, alerta = false, children }: {
  rotulo: string; nota?: string; fuerte?: boolean; alerta?: boolean; children: ReactNode
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, minHeight: ALTO_LIQ.filaPanel,
      borderTop: fuerte ? `1px solid ${V.grafito}` : `1px solid ${V.linea}`, fontSize: '12.5px',
      fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 600 : 400,
    }}>
      <div>
        <div style={{ color: V.tinta }}>{rotulo}</div>
        {nota && <div style={{ fontSize: '11px', fontWeight: 400, color: alerta ? V.neg : V.apagado }}>{nota}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  )
}
