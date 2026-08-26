import Link from 'next/link'
import { corto, estadoDePago, pesos, type Pago } from '../../cronograma'
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

// ═══ CINCO DÍAS, NO SIETE (26/08/2026) ═══
//
// «En vista calendario quitale sábado y domingo, si no no se ven bien los montos.» Los dos días de
// la semana que nunca tienen un cobro se llevaban el 28% del ancho, y en un teléfono eso es la
// diferencia entre que «$ 9,0 M» entre o se recorte. Un cobro no se programa un domingo: la columna
// existía para dibujar una semana completa, no para mostrar algo.
//
// SI ALGUNA VEZ CAE UNO EN FIN DE SEMANA NO DESAPARECE: `pagosDeLaSemana` lo empuja al lunes
// siguiente de su misma fila y lo dice con «(sáb)» al lado. Esconder plata para ganar ancho sería
// cambiar una molestia por un defecto.
const DIAS = ['L', 'M', 'M', 'J', 'V']

export function Calendario({
  pagos, mes, semanas, hoy, montos, enlaceDeMes,
}: {
  pagos: Pago[]
  /** Cómo se arma la URL de otro mes CONSERVANDO el resto —la obra elegida, sobre todo—: cambiar de
   *  mes no puede tirar el filtro por obra. La arma la pantalla, que es la que conoce los filtros. */
  enlaceDeMes: (ym: string) => string
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
        <Paso a={enlaceDeMes(mesVecino(mes, -1))} rotulo="Mes anterior">‹</Paso>
        <span className="min-w-[150px] text-center text-[13.5px] font-semibold">{nombreDelMes(mes)}</span>
        <Paso a={enlaceDeMes(mesVecino(mes, 1))} rotulo="Mes siguiente">›</Paso>
      </div>

      {/* ═══ ENTRA EN LA PANTALLA, NO SE SCROLLEA (26/08/2026, iPhone 14) ═══
          Tenía `min-w-[560px]` dentro de un `overflow-x-auto`: en un teléfono de 390px el mes
          quedaba cortado y había que arrastrar de costado para ver el jueves. Un calendario existe
          para verlo ENTERO de un vistazo — si hay que scrollearlo deja de contestar «cómo me cae el
          mes», que es su única razón de ser.
          Ahora las siete columnas se reparten el ancho que haya. Lo que se achica es la celda y su
          letra, no la información: el monto sigue estando y el rótulo se recorta, que es lo que
          sobra cuando el día ya lo dice. */}
      <div className="mt-3">
        <div>
          <div className="grid grid-cols-5">
            {DIAS.map((d, i) => (
              <span key={i} className="pb-1.5 text-center text-[10px] tracking-[.06em] text-faint sm:px-1.5 sm:text-left sm:text-[10.5px]">{d}</span>
            ))}
          </div>
          {semanas.map((semana, f) => (
            <div key={f} className="grid grid-cols-5 border-t border-line">
              {semana.slice(0, 5).map((dia, i) => {
                // Lo del sábado y el domingo de ESTA fila se muestra en el lunes, que es el primer
                // día hábil en el que ese cobro se puede atender.
                const finDeSemana = i === 0 ? semana.slice(5).flatMap((d) => delDia(d.iso).map((p) => ({ ...p, finDeSemana: d.iso }))) : []
                const suyos = [...delDia(dia.iso), ...finDeSemana]
                const esHoy = dia.iso === hoy
                return (
                  <div
                    key={dia.iso}
                    className={
                      'min-h-[62px] min-w-0 border-r border-line px-0.5 py-1 last:border-r-0 sm:min-h-[74px] sm:px-1.5 sm:py-1.5 ' +
                      (dia.delMes ? '' : 'bg-surface-sunken')
                    }
                  >
                    <span
                      className={
                        'tnum inline-block rounded-full px-1 text-[10.5px] sm:px-1.5 sm:text-[11px] ' +
                        (esHoy ? 'bg-marca font-semibold text-ink' : dia.delMes ? 'text-muted' : 'text-faint')
                      }
                    >
                      {Number(dia.iso.slice(8, 10))}
                    </span>
                    {suyos.map((p) => {
                      const estado = estadoDePago(p, hoy)
                      return (
                        <span key={p.id} className="mt-1 block" title={p.rotulo}>
                          {/* Si vino de un fin de semana se dice cuál: la fecha real no se pisa. */}
                          {(p as { finDeSemana?: string }).finDeSemana ? (
                            <span className="block text-[9px] text-warn">
                              {`sáb/dom ${Number((p as { finDeSemana?: string }).finDeSemana!.slice(8, 10))}`}
                            </span>
                          ) : null}
                          {/* El monto arriba y el rótulo abajo: en una celda de 74px lo que se
                              busca de un vistazo es cuánto cae ese día. Sin permiso de montos no se
                              dibuja un guión —eso se lee «este pago no tiene importe»—: sólo el rótulo. */}
                          {/* EN EL TELÉFONO, EL MONTO EN MILLONES: «$ 9.034.356» no entra en una
                              celda de 52px y se recorta justo donde está la cifra que importa;
                              «$ 9,0 M» entra entero. El exacto está en el listado. */}
                          {montos ? (
                            <>
                              <span className={`tnum block truncate font-mono text-[9.5px] sm:hidden ${TINTA[estado]}`}>
                                {corto(p.monto, p.moneda)}
                              </span>
                              <span className={`tnum hidden truncate font-mono text-[11px] sm:block ${TINTA[estado]}`}>
                                {pesos(p.monto, p.moneda)}
                              </span>
                            </>
                          ) : null}
                          {/* El rótulo sólo desde `sm`: en 52px de ancho no entra ni una palabra, y
                              media palabra recortada no informa — informa el monto. */}
                          <span className="hidden truncate text-[10.5px] text-faint sm:block">{p.rotulo}</span>
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
