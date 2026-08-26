// 20 v2 · EL COSTADO DEL LEGAJO — `20 · Persona Legajo 360 v2.dc.html` (líneas 201-224).
//
// Tres bloques: quién es, dónde está y cuánto trabajó por mes. Sin tarjetas: rótulo en versalitas,
// renglones de 96px de rótulo y valor, y barras de 5px. Es el criterio 3 del patrón.
//
// ═══ POR QUÉ «LEGAJO» SIGUE PARTIDO EN DOS ═══
//
// El mockup los junta en un solo bloque. Acá siguen separados —identidad y laboral— porque son los
// DOS GRUPOS QUE EL PANEL EDITA POR SEPARADO: fundirlos daría un único «Editar» que abre veinte
// campos, que es exactamente lo que el panel lateral vino a evitar. La separación no es estética:
// es la que hace que el enlace de arriba de cada bloque signifique algo.
//
// ═══ LO QUE NO SE DIBUJA ═══
//
//   RETRIBUCIÓN   `persona_legajo` no publica la columna. Se dice que no llega a esta pantalla, en
//                 vez de escribir «sin cargar» — que afirmaría que nadie la cargó.
//   VENCIMIENTO   `documento_legajo` no guarda fecha de vencimiento. Por eso el costado no dice «al
//                 día»: sería una afirmación sobre un control que nadie está haciendo.

import Link from 'next/link'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import { BarraDeCostado, DatoDeCostado } from '@/shared/components/v2/segundoNivel'
import type { MesDeHH } from '../services/hhPorMes'

/** Un enlace de edición discreto, al lado del rótulo del bloque. */
function Editar({ href, testid }: { href: string; testid: string }) {
  return (
    <Link
      href={href} prefetch={false} data-testid={testid}
      className="hover:text-[#1F1F1E]"
      style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.apagado }}
    >
      Editar
    </Link>
  )
}

export interface DatoDeLegajo { k: string; v: string | null; falta?: string; mono?: boolean }

export function CostadoLegajo({ identidad, laboral, asignacion, meses, hrefIdentidad, hrefLaboral, puedeEditar }: {
  identidad: DatoDeLegajo[]
  laboral: DatoDeLegajo[]
  asignacion: DatoDeLegajo[]
  meses: MesDeHH[]
  hrefIdentidad: string
  hrefLaboral: string
  puedeEditar: boolean
}) {
  // El tope de la barra es el mes con más horas de la serie: comparan entre sí, no contra una
  // jornada teórica. Por eso ninguna dice un porcentaje.
  const tope = meses.reduce((a, m) => Math.max(a, m.horas ?? 0), 0)

  return (
    <>
      <div data-testid="bloque-identidad">
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <RotuloPanel>Legajo</RotuloPanel>
          {puedeEditar && <Editar href={hrefIdentidad} testid="bloque-identidad-editar" />}
        </div>
        {identidad.map((d) => (
          <DatoDeCostado key={d.k} k={d.k} v={d.v} falta={d.falta} mono={d.mono} />
        ))}
      </div>

      <div data-testid="bloque-laboral" style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <RotuloPanel>Laboral</RotuloPanel>
          {puedeEditar && <Editar href={hrefLaboral} testid="bloque-laboral-editar" />}
        </div>
        {laboral.map((d) => (
          <DatoDeCostado key={d.k} k={d.k} v={d.v} falta={d.falta} mono={d.mono} />
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <RotuloPanel>Asignación</RotuloPanel>
      </div>
      {asignacion.map((d) => (
        <DatoDeCostado key={d.k} k={d.k} v={d.v} falta={d.falta} mono={d.mono} />
      ))}

      <div style={{ marginTop: 22 }}>
        <RotuloPanel>HH por mes</RotuloPanel>
      </div>
      {meses.map((m) => (
        <div key={m.clave} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }} data-testid="hh-mes">
          <span style={{ fontSize: '11.5px', color: V.apagado, width: 44, flexShrink: 0 }}>{m.rotulo}</span>
          <span style={{ display: 'flex', flex: 1, minWidth: 0 }}>
            <BarraDeCostado fraccion={tope === 0 ? 0 : (m.horas ?? 0) / tope} />
          </span>
          {/* UN MES SIN REGISTROS ESCRIBE «—» Y NO 0: la persona pudo haber entrado después. */}
          <span
            className="font-mono tabular-nums"
            style={{ fontSize: '11.5px', color: m.horas === null ? V.tenue : V.tinta, width: 34, textAlign: 'right', flexShrink: 0 }}
          >
            {m.horas ?? '—'}
          </span>
        </div>
      ))}
    </>
  )
}
