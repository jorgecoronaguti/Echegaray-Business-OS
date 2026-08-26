import Link from 'next/link'
import { estadoDePago, pesos, type Pago } from '../../cronograma'
import { TINTA } from '../../Piezas'

// EL CRONOGRAMA EN UN MES — la otra cara de la misma lista.
//
// ═══ POR QUÉ EXISTE ═══
//
// El listado contesta «qué me toca pagar»; el calendario contesta «cómo me cae el mes». Son dos
// preguntas distintas y por eso la pantalla 32 del CRM tiene las dos, con el mismo interruptor. El
// portal tenía sólo la primera: «te pedí vista listado y en calendario de todo el cronograma».
//
// LA GRILLA NO SE REESCRIBE: es `grillaDelMes` de `reglasEsquema`, la misma función probada que
// dibuja el calendario de administración. Dos calendarios que arman las semanas por su cuenta se
// desincronizan el día que uno arregle el corrimiento por huso horario y el otro no.

/** `2026-09` → `septiembre 2026`. */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
export function nombreDelMes(ym: string): string {
  const m = MESES[Number(ym.slice(5, 7)) - 1]
  return m ? `${m} ${ym.slice(0, 4)}` : ym
}

/** El mes anterior / siguiente de `YYYY-MM`, sin `Date` para no arrastrar el huso. */
export function mesVecino(ym: string, paso: 1 | -1): string {
  const a = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7)) + paso
  if (m < 1) return `${a - 1}-12`
  if (m > 12) return `${a + 1}-01`
  return `${a}-${String(m).padStart(2, '0')}`
}

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function Calendario({
  pagos, mes, semanas, hoy, montos,
}: {
  pagos: Pago[]
  /** `YYYY-MM`. */
  mes: string
  semanas: { iso: string; delMes: boolean }[][]
  hoy: string
  montos: boolean
}) {
  const delDia = (iso: string) => pagos.filter((p) => (p.fechaPago ?? p.fechaPrevista) === iso)

  return (
    <div className="mt-5">
      <div className="flex items-center gap-1">
        <Paso a={`?vista=calendario&mes=${mesVecino(mes, -1)}`} rotulo="Mes anterior">‹</Paso>
        <span className="min-w-[150px] text-center text-[13.5px] font-semibold">{nombreDelMes(mes)}</span>
        <Paso a={`?vista=calendario&mes=${mesVecino(mes, 1)}`} rotulo="Mes siguiente">›</Paso>
      </div>

      {/* La grilla scrollea dentro de su caja: en un teléfono siete columnas no entran, y el que
          tiene que scrollear es el calendario, nunca la página entera. */}
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7">
            {DIAS.map((d, i) => (
              <span key={i} className="px-1.5 pb-1.5 text-[10.5px] tracking-[.08em] text-faint">{d}</span>
            ))}
          </div>
          {semanas.map((semana, f) => (
            <div key={f} className="grid grid-cols-7 border-t border-line">
              {semana.map((dia) => {
                const suyos = delDia(dia.iso)
                const esHoy = dia.iso === hoy
                return (
                  <div
                    key={dia.iso}
                    className={
                      'min-h-[74px] border-r border-line px-1.5 py-1.5 last:border-r-0 ' +
                      (dia.delMes ? '' : 'bg-surface-sunken')
                    }
                  >
                    <span
                      className={
                        'tnum inline-block rounded-full px-1.5 text-[11px] ' +
                        (esHoy ? 'bg-marca font-semibold text-ink' : dia.delMes ? 'text-muted' : 'text-faint')
                      }
                    >
                      {Number(dia.iso.slice(8, 10))}
                    </span>
                    {suyos.map((p) => {
                      const estado = estadoDePago(p, hoy)
                      return (
                        <span key={p.id} className="mt-1 block" title={p.rotulo}>
                          {/* El monto arriba y el rótulo abajo: en una celda de 74px lo que se
                              busca de un vistazo es cuánto cae ese día. Sin permiso de montos no se
                              dibuja un guión —eso se lee «este pago no tiene importe»—: sólo el rótulo. */}
                          {montos ? (
                            <span className={`tnum block truncate font-mono text-[11px] ${TINTA[estado]}`}>
                              {pesos(p.monto, p.moneda)}
                            </span>
                          ) : null}
                          <span className="block truncate text-[10.5px] text-faint">{p.rotulo}</span>
                        </span>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Paso({ a, rotulo, children }: { a: string; rotulo: string; children: string }) {
  return (
    <Link
      href={a}
      aria-label={rotulo}
      title={rotulo}
      className="grid min-h-11 min-w-11 place-items-center rounded-[7px] text-[17px] text-muted hover:bg-surface-sunken hover:text-ink"
    >
      {children}
    </Link>
  )
}
