// LA SEMANA EN SIETE BARRAS — canónico 20, bloque «Asistencia de la semana».
//
// Contesta de un vistazo la pregunta que hoy obliga a abrir la solapa Horas: ¿vino esta semana y
// cuánto? Los tres estados se dibujan DISTINTO a propósito, porque significan cosas distintas:
//
//   trabajado      barra verde proporcional a la jornada de referencia.
//   ausencia       marco rosado sin barra — el día TIENE registro y dice que no vino.
//   sin registro   marco gris vacío y «—» abajo. Nadie cargó nada todavía; NO es un cero.
//
// LA ALTURA SE MIDE CONTRA LA JORNADA, NO CONTRA EL MÁXIMO DE LA SEMANA. Si la barra más alta
// llenara siempre la caja, una semana entera de medias jornadas se vería igual que una semana
// completa.

import { TarjetaFicha } from './FichaCanonica'
import type { DiaDeSemana } from '../services/semanaDePersona'

const ICONO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

/** La jornada contra la que se mide la barra. Nueve horas es la jornada de referencia del CCT que
 *  ya usa el resto del módulo; una barra más larga se recorta al tope, no rompe la caja. */
const JORNADA = 9

function hs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function SemanaDeAsistencia({
  dias, total, jornadaSemanal,
}: {
  dias: DiaDeSemana[]
  /** `null` cuando NADIE cargó la semana. Se escribe «sin cargar», nunca «0,0 h». */
  total: number | null
  /** Las horas de referencia de la semana, para el denominador del encabezado. */
  jornadaSemanal: number
}) {
  return (
    <TarjetaFicha
      titulo="Asistencia de la semana"
      icono={ICONO}
      testid="bloque-semana-asistencia"
      indicador={total == null
        ? <span className="font-sans text-[12px] text-faint">sin horas cargadas</span>
        : `${hs(total)} / ${hs(jornadaSemanal)} h`}
    >
      <div className="flex gap-2 px-4 py-3.5">
        {dias.map((d) => {
          const alto = d.horas ? Math.min(100, Math.round((d.horas / JORNADA) * 100)) : 0
          const marco = d.estado === 'ausencia'
            ? 'border-[#F3D3CF] bg-neg-soft'
            : 'border-line bg-canvas'
          return (
            <div key={d.fecha} className="flex min-w-0 flex-1 flex-col items-center gap-[7px]" data-dia={d.fecha}>
              <span className="text-[11px] text-faint">{d.rotulo}</span>
              <div className={`flex h-14 w-full items-end overflow-hidden rounded-md border ${marco}`}>
                {alto > 0 && <div className="w-full bg-pos" style={{ height: `${alto}%` }} />}
              </div>
              <span className={`whitespace-nowrap font-mono text-[11.5px] tabular-nums ${d.horas == null ? 'text-faint' : 'text-ink-soft'}`}>
                {d.horas == null ? '—' : hs(d.horas)}
              </span>
            </div>
          )
        })}
      </div>
    </TarjetaFicha>
  )
}
