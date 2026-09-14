// LO LABORAL DE LA PERSONA, EN EL PANEL DE LA QUINCENA — lo que la grilla de «Horas» tenía y el cuadro no.
//
// Cuatro bloques en renglones, con el mismo patrón que la cadena del panel: esta quincena (cargadas,
// esperadas, estado), costo cargado estimado, Legajo · Laboral · Asignación, y HH por mes. «Sin cargar»
// se escribe con la palabra: un guion se lee como «no tiene» y esto es «nadie lo cargó» (R1).

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { horas as nHoras, pesos } from '../formato'
import { ALTO_LIQ } from '../solapas/tabla'
import type { CampoDelLegajo, DetalleLaboral } from '../../../services/detalleLaboral'
import type { EstadoDeFila } from '../../../services/grillaHorasQuincena'

const MONO = "'IBM Plex Mono', monospace"

const ESTADOS: Record<EstadoDeFila, { texto: string; alerta: boolean }> = {
  'al-dia': { texto: 'al día', alerta: false },
  motivo: { texto: 'ausencia sin motivo', alerta: true },
  tarifa: { texto: 'sin retribución', alerta: true },
  'sin-cargar': { texto: 'días sin cargar', alerta: true },
  licencia: { texto: 'con licencia', alerta: false },
}

export function DetalleLaboralDeLaPersona({ detalle }: { detalle: DetalleLaboral | undefined }) {
  if (!detalle) return null
  const estado = detalle.estado ? ESTADOS[detalle.estado] : null
  return (
    <>
      <section data-testid="detalle-quincena">
        <Rotulo>Horas de la quincena</Rotulo>
        <Renglon rotulo="Cargadas">{detalle.cargadas == null ? <Tenue /> : nHoras(detalle.cargadas)}</Renglon>
        <Renglon rotulo="Esperadas">{detalle.esperadas == null ? <Tenue /> : nHoras(detalle.esperadas)}</Renglon>
        <Renglon rotulo="Estado">
          {estado ? <span style={{ color: estado.alerta ? V.warn : V.tinta }}>{estado.texto}</span> : <Tenue />}
        </Renglon>
      </section>

      <section data-testid="detalle-costo">
        <Rotulo>Costo cargado · estimado</Rotulo>
        <Renglon rotulo="Bolsillo">{detalle.bolsillo == null ? <Tenue /> : pesos(detalle.bolsillo)}</Renglon>
        <Renglon rotulo="Con cargas">
          {detalle.costoCargado == null ? <Tenue texto="sin base" /> : pesos(detalle.costoCargado)}
        </Renglon>
      </section>

      <section data-testid="detalle-laboral">
        <Rotulo>Legajo · laboral · asignación</Rotulo>
        <Campos testid="detalle-legajo" campos={detalle.legajo} />
        <Campos testid="detalle-laboral-campos" campos={detalle.laboral} />
        <Campos testid="detalle-asignacion" campos={detalle.asignacion} />
      </section>

      <section data-testid="detalle-hh-mes">
        <Rotulo>HH por mes</Rotulo>
        {detalle.mesesHH.map((m) => (
          <Renglon key={m.clave} rotulo={m.rotulo} fuerte={m.actual}>
            {m.horas == null ? <Tenue /> : nHoras(m.horas)}
          </Renglon>
        ))}
      </section>
    </>
  )
}

function Campos({ campos, testid }: { campos: readonly CampoDelLegajo[]; testid: string }) {
  return (
    <div data-testid={testid}>
      {campos.map((c) => (
        <Renglon key={c.rotulo} rotulo={c.rotulo}>
          {c.valor == null ? <Tenue /> : <span style={{ fontFamily: c.mono ? MONO : undefined }}>{c.valor}</span>}
        </Renglon>
      ))}
    </div>
  )
}

function Tenue({ texto = 'sin cargar' }: { texto?: string }) {
  return <span style={{ color: V.tenue }}>{texto}</span>
}

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase', paddingBottom: 8 }}>
      {children}
    </div>
  )
}

function Renglon({ rotulo, fuerte = false, children }: { rotulo: string; fuerte?: boolean; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, minHeight: ALTO_LIQ.filaPanel,
      borderTop: `1px solid ${V.linea}`, fontSize: '12.5px', fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 600 : 400,
    }}>
      <div style={{ color: V.apagado }}>{rotulo}</div>
      <div style={{ color: V.tinta, textAlign: 'right' }}>{children}</div>
    </div>
  )
}
