'use client'

// EL PANEL DE LA PERSONA EN EL CUADRO DE LA QUINCENA — la misma cadena que la fila, con su origen.
//
// Dueño, 14/09/2026: *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer»*. El panel
// repite la fila en vertical y dice DE DÓNDE sale cada eslabón: el blanco (recibo del estudio o
// estimado), el negro (horas que el recibo no paga × $/h negro), el total, el adelanto, lo transferido y
// el efectivo. Debajo, el historial del $/h y lo laboral que tenía «Horas».
//
// Oficina, liquidaciones finales y la quincena cerrada no tienen blanco + negro: muestran la cadena de
// siempre (`CadenaSinModelo`), con el acuerdo 50/50 donde lo hay.
//
// ═══ DRAWER Y NO `PanelDePersona` ═══
//
// `PanelDePersona` se despliega DEBAJO de la grilla y empuja la fila que se está mirando fuera de la
// pantalla. Éste flota encima (`Drawer`) y el cuadro no se mueve.
//
// Ni una cuenta nueva: las cifras son las de la línea; el cierre, `cierreDeLaFila`.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { horas as nHoras, pesos } from '../formato'
import { Escribible, Leida } from './CeldasDelEspejo'
import { origenDelBlanco, urlDelRecibo } from './CeldasBlancoNegro'
import { HistorialDeTarifa } from './HistorialDeTarifa'
import { rotuloCategoria } from './CeldaTarifa'
import { tituloDeJornales } from './estadoDelPago'
import { ALTO_LIQ } from '../solapas/tabla'
import { cierreDeLaFila, type EntradaDeHistorial } from '../../../services/cuadroDeJornales'
import type { CampoEditable } from '../../../services/liquidacionOverrides'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { DetalleLaboral } from '../../../services/detalleLaboral'
import { DetalleLaboralDeLaPersona } from './DetalleLaboralDeLaPersona'

const MONO = "'IBM Plex Mono', monospace"
const corta = (iso: string | null): string =>
  iso == null ? 'sin cargar' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

interface PropsDeCadena {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
}

export function PanelDeLaPersona({ fila, quincena, camposEditables, historial, historialCompleto, detalle, onCerrar }: PropsDeCadena & {
  historial: readonly EntradaDeHistorial[]
  historialCompleto: boolean
  /** Lo laboral que tenía la grilla de «Horas»: costo cargado, legajo, HH por mes, esperadas y estado. */
  detalle?: DetalleLaboral
  onCerrar: () => void
}) {
  const jornales = tituloDeJornales(fila.linea)
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
        {fila.linea.sueldo
          ? <CadenaBlancoNegro fila={fila} quincena={quincena} camposEditables={camposEditables} />
          : <CadenaSinModelo fila={fila} quincena={quincena} camposEditables={camposEditables} />}

        {/* SIN AVISO DE «SIN HORAS CARGADAS / NO SE PAGAN»: desde el 14/09/2026 los días completados por
            la app cuentan y se pagan (dueño). */}
        {(fila.cotejo.estado === 'difiere' || jornales) && (
          <section style={{ fontSize: '12px', color: V.apagado, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {fila.cotejo.estado === 'difiere' && (
              <div>{`La planilla dice ${nHoras(fila.cotejo.horasEnLaPlanilla)} h y la base ${nHoras(fila.cotejo.horasEnLaBase)} h.`}</div>
            )}
            {jornales && <div data-testid="panel-jornales">{jornales}</div>}
          </section>
        )}

        <HistorialDeTarifa entradas={historial} completo={historialCompleto} />

        <DetalleLaboralDeLaPersona detalle={detalle} />
      </div>
    </Drawer>
  )
}

/** BLANCO (con su origen) · NEGRO · TOTAL · − adelanto · − transferido · = efectivo. */
function CadenaBlancoNegro({ fila, quincena, camposEditables }: PropsDeCadena) {
  const l = fila.linea
  const s = l.sueldo!
  const cierre = cierreDeLaFila(l)
  const est = s.estado === 'estimado'
  return (
    <section data-testid="panel-cadena">
      <Rotulo>{`Blanco · ${s.estado === 'recibo' ? 'recibo' : 'estimado'}`}</Rotulo>
      {/* EL ORDEN DE LA FILA Y DE JORNALES: blanco · negro · adelantos · total efectivo · total quincena. */}
      <Renglon rotulo="Hs recibo" nota={origenDelBlanco(s)}>
        <Leida valor={s.horasBlanco} unidad="horas" apagada={est} />
      </Renglon>
      <Renglon rotulo="$/h cat."><Leida valor={s.valorHoraCategoria} apagada={est} /></Renglon>
      <Renglon rotulo="Bruto"><Leida valor={s.bruto} apagada={est} /></Renglon>
      <Renglon rotulo="Banco" nota={s.driveFileId ? undefined : (s.neto == null ? 'sin neto' : undefined)}>
        {s.driveFileId && (
          <a href={urlDelRecibo(s.driveFileId)} target="_blank" rel="noreferrer" data-testid="panel-recibo-pdf"
            style={{ fontSize: '11.5px', color: V.apagado, marginRight: 8 }}>recibo ↗</a>
        )}
        <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>

      <div style={{ height: 16 }} />
      <Rotulo>Negro</Rotulo>
      <Renglon rotulo="Hs"
        nota={s.reciboExcedeHoras ? 'el recibo paga más horas que las cargadas' : 'las que el recibo no paga'} alerta={s.reciboExcedeHoras}>
        <Leida valor={s.horasNegro} unidad="horas" />
      </Renglon>
      <Renglon rotulo="$/h negro"><Leida valor={s.valorHoraNegro} /></Renglon>
      <Renglon rotulo="Importe"><Leida valor={s.negro} medio /></Renglon>

      <div style={{ height: 16 }} />
      <Renglon rotulo="Adelanto banco / embargos">
        <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>
      <Renglon rotulo="Adelanto efectivo">
        <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>
      <Renglon rotulo="Total efectivo" fuerte
        nota={cierre && !cierre.cierra ? `no cierra por ${pesos(cierre.diferencia)}` : 'cobra total − banco − adelantos'} alerta={cierre?.cierra === false}>
        <Leida valor={l.enEfectivo} medio origen={l.origen.enEfectivo} />
      </Renglon>
      <Renglon rotulo="Cobra total" nota="banco + negro" fuerte>
        <Leida valor={l.cobra} medio origen={l.origen.cobra} apagada={est} />
      </Renglon>
    </section>
  )
}

/** La cadena de siempre: Oficina, finales y la quincena cerrada (la foto sellada no se recalcula). */
function CadenaSinModelo({ fila, quincena, camposEditables }: PropsDeCadena) {
  const l = fila.linea
  const cierre = cierreDeLaFila(l)
  const esHora = l.netoMensual == null
  return (
    <section data-testid="panel-cadena">
      <Rotulo>Esta quincena</Rotulo>
      <Renglon rotulo="Cobra total" nota={esHora ? `${nHoras(l.horas)} h pagas × ${pesos(l.valorHora)}/h` : 'neto mensual'}>
        <Leida valor={l.cobra} medio origen={l.origen.cobra} />
      </Renglon>
      <Renglon rotulo="− Adelanto">
        <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>
      <Renglon rotulo="− Ya transferido">
        <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>
      <Renglon rotulo="= Banco + efectivo" fuerte
        nota={cierre && !cierre.cierra ? `no cierra por ${pesos(cierre.diferencia)}` : undefined} alerta={cierre?.cierra === false}>
        <Leida valor={l.total} medio origen={l.origen.total} />
      </Renglon>
      <Renglon rotulo="Neto (banco)" nota={l.reciboSinGiro ? 'recibo sin giro en el extracto' : undefined}>
        <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>
      <Renglon rotulo="Efectivo">
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
        {nota && <div style={{ fontSize: '11px', fontWeight: 400, color: alerta ? V.warn : V.apagado }}>{nota}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>{children}</div>
    </div>
  )
}
