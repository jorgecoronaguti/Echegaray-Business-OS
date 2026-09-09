// LA QUINCENA EN LA FICHA — el bloque que contesta «¿cómo viene esta persona?» de un vistazo.
//
// ═══ POR QUÉ DEJÓ DE SER LA SEMANA ═══
//
// El dueño, mirando el bloque anterior: *«revisá con la skill de UX la mejor manera de presentar
// esa información, así no es útil»*. Mostraba siete barras y «10,0 / 44,0 h». Tres defectos:
//
//   1. La semana NO es el período de esta empresa. Se trabaja y se paga por quincena (1–15 /
//      16–fin de mes), así que el bloque no cerraba contra ninguna liquidación.
//   2. Las 44 h eran un total teórico que no existe como dato en ninguna tabla del OS. Acá la
//      referencia son los días hábiles TRANSCURRIDOS × `obra_canonica.jornada_horas`, y se dice de
//      dónde sale. Sin jornada cargada no hay referencia: «—».
//   3. Siete barras verticales de alto proporcional ocupaban el ancho entero para decir «un día
//      con 10 h y seis vacíos». Un cuadrado por día dice lo mismo y deja lugar para las cifras que
//      contestan la pregunta, y para las cinco quincenas anteriores que dicen si esto es normal.
//
// ═══ EL COLOR SIGNIFICA, Y POR ESO SON POCOS (skill de diseño, 25 reglas) ═══
//
// Verde SÓLO estado positivo (trabajó), rojo SÓLO problema (ausencia declarada). La licencia no es
// ninguna de las dos: es neutra. «Sin registrar» va con marco punteado y «—» porque NO es una falta
// —el que no tiene quien le cargue se vería igual que el que faltó—. Un día futuro no se pinta.
// El amarillo aparece UNA vez y como marca, no como estado: el filo que dice «hoy».
//
// Ningún hex suelto: todo sale de los tokens de `globals.css`.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { TarjetaFicha } from './FichaCanonica'
import { CeldaDia, type EntradaCeldaDia } from '@/shared/components/ds'
import { tituloDeConflicto } from '@/shared/components/ds/celdaDia'
import type { BarraQuincena, CifrasQuincena, DiaDeQuincena } from '../services/quincenaDePersona'

const ICONO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

const hs = (n: number): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// ═══ LA CASILLA ES LA MISMA CELDA DE DOS CAPAS QUE LA GRILLA DE QUINCENA (dueño, 08/09/2026) ═══
//
// Arriba la PRESENCIA como estado —«A» ausencia en rojo, «L» licencia neutra, ● cuando exista una
// marca de fichaje—; abajo las HORAS como cantidad, monoespaciadas y en tinta, sin fondo de color.
// La versión anterior pintaba la casilla de verde cuando había horas: eso convertía una cantidad en
// un juicio, y dejaba «sin horas» a un paso de leerse como «no vino». Qué se dibuja lo decide
// `decidirCeldaDia` (shared/components/ds/celdaDia.ts), el mismo criterio de la grilla: una persona
// no puede tener dos caras según la pantalla.
//
// LA PRESENCIA YA VIENE DECIDIDA (08/09/2026). `diasDeLaQuincena` combina `asistencia_dia` con lo
// que declara la carga de horas en `combinarCeldaDia`, la misma función que usa la grilla; acá no se
// vuelve a derivar del estado. La versión anterior leía SÓLO `d.estado`, así que un día declarado
// ausente por el jefe y todavía sin horas se dibujaba «sin registrar» — el gris de «nadie cargó».
//
// La ficha todavía no lee `asistencia_marca` (el fichaje desde el celular no está en uso).
function entradaDe(d: DiaDeQuincena): EntradaCeldaDia {
  return {
    presencia: d.presencia,
    horas: d.horas,
    dia: d.estado === 'no_laborable' ? 'no_laborable' : d.estado === 'futuro' ? 'futuro' : 'habil',
    motivo: d.motivo,
  }
}

function Casilla({ d }: { d: DiaDeQuincena }) {
  const detalle = [
    `${d.nombre} ${Number(d.fecha.slice(8, 10))}`,
    d.extras > 0 ? `incluye ${hs(d.extras)} h extra` : null,
    d.obras.length > 1 ? `repartido: ${d.obras.join(' + ')}` : d.obras[0] ?? null,
  ].filter(Boolean).join(' · ')
  return (
    <div
      data-testid="casilla-dia" data-estado={d.estado} data-fecha={d.fecha} title={detalle}
      className="relative flex flex-col items-center gap-0.5"
    >
      <span className={`text-[10.5px] leading-none ${d.finDeSemana ? 'text-faint' : 'text-muted'}`}>
        {d.etiqueta}
      </span>
      <span className="relative">
        {/* EL CONFLICTO NO SE ESCONDE: ausencia declarada y horas cargadas el mismo día no pueden
            ser las dos ciertas, y una de las dos se liquida. La celda lo marca y no elige. */}
        <CeldaDia
          entrada={entradaDe(d)} conflicto={d.conflicto}
          tituloConflicto={tituloDeConflicto({
            declarada: d.estado === 'ausencia' ? 'ausente' : d.estado === 'licencia' ? 'licencia' : null,
            horas: d.horas,
            dia: 'habil',
          })}
        />
        {/* EL FILO AMARILLO ES LA ÚNICA MARCA DE LA PANTALLA: dice «acá estás», no un estado. */}
        {d.esHoy && (
          <span className="absolute inset-x-1 -bottom-[3px] h-[2px] rounded-full bg-marca" aria-hidden />
        )}
        {(d.obras.length > 1 || d.extras > 0) && (
          <span className="absolute -right-0.5 top-0 text-[9px] leading-none text-muted" aria-hidden>
            {d.obras.length > 1 ? '2' : '+'}
          </span>
        )}
      </span>
    </div>
  )
}

/** Una cifra del período: rótulo chico arriba, número abajo, y el de dónde sale al lado. Sin
 *  tarjeta — una fila de KPIs no son cuatro cards (regla 3 de la skill). */
function Cifra({ k, v, detalle }: { k: string; v: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] text-muted">{k}</span>
      <span className="font-mono text-[17px] font-semibold leading-tight tabular-nums text-ink">{v}</span>
      {detalle != null && <span className="truncate text-[11px] text-faint">{detalle}</span>}
    </div>
  )
}

/** Las cinco anteriores y la actual, comparables entre sí. La escala es la de la quincena más alta
 *  de las seis: comparar contra la jornada dejaría seis barras casi llenas e indistinguibles. */
function Historial({ barras }: { barras: BarraQuincena[] }) {
  const tope = Math.max(...barras.map((b) => b.horas), 1)
  return (
    <div data-testid="historial-quincenas">
      {barras.map((b) => (
        <div key={b.clave} data-testid="barra-quincena" data-actual={b.actual ? 'si' : 'no'}
          className="flex items-center gap-2.5 py-[3px]">
          <span className={`w-[42px] shrink-0 text-[11.5px] ${b.actual ? 'font-medium text-ink' : 'text-muted'}`}>
            {b.rotulo}
          </span>
          <span className="h-2 w-[92px] shrink-0 overflow-hidden rounded-[2px] bg-surface-sunken">
            {b.horas > 0 && (
              <span
                className={`block h-full rounded-[2px] ${b.actual ? 'bg-ink' : 'bg-line-strong'}`}
                style={{ width: `${Math.max(3, Math.round((b.horas / tope) * 100))}%` }}
              />
            )}
          </span>
          <span className="w-[52px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft">
            {/* CERO NO SE ESCRIBE COMO NÚMERO: una quincena sin una sola imputación no afirma que
                la persona no trabajó, afirma que no hay registro. */}
            {b.horas > 0 ? hs(b.horas) : <span className="text-faint">—</span>}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-faint">
            {b.horas > 0 ? `${b.dias} ${b.dias === 1 ? 'día' : 'días'}${b.obra ? ` · ${b.obra}` : ''}` : 'sin registro'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function QuincenaDeAsistencia({
  dias, cifras, barras, obra, rotuloVentana, hrefHoras,
}: {
  dias: DiaDeQuincena[]
  cifras: CifrasQuincena
  barras: BarraQuincena[]
  /** Dónde está y dónde fueron sus horas. `jornada` es la de la obra a la que se imputaron —es la
   *  que fija la referencia—, e `imputadaA` sólo viene cuando NO es la de la asignación vigente. */
  obra: {
    nombre: string; desde: string | null; jornada: number | null; imputadaA?: string | null
  } | null
  rotuloVentana: string
  hrefHoras: string
}) {
  // NADA CARGADO NO ES CERO. Sin una sola imputación en la quincena, las cuatro cifras escriben «—»:
  // un «0,0» diría que esta persona no trabajó, que es otra afirmación y nadie la puede sostener.
  const sinDatos = cifras.diasTrabajados + cifras.ausencias + cifras.licencias === 0
  const guion = <span className="text-faint">—</span>
  return (
    <TarjetaFicha
      titulo="Asistencia de la quincena" icono={ICONO} testid="bloque-quincena-asistencia"
      indicador={<span className="font-sans text-[11.5px] text-muted" data-testid="ventana-quincena">{rotuloVentana}</span>}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(38px,1fr))] gap-x-1 gap-y-2 px-3.5 pb-3.5 pt-3.5"
        data-testid="franja-quincena">
        {dias.map((d) => <Casilla key={d.fecha} d={d} />)}
      </div>

      {/* LA REFERENCIA, UNA LÍNEA. Sin ella el marco punteado y la «A» se leen como sinónimos, que
          es exactamente la confusión que este módulo no puede permitirse. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 pb-3 text-[10.5px] text-faint">
        <span><b className="mr-1 font-semibold text-pos">●</b>fichó</span>
        <span><b className="mr-1 font-semibold text-neg">A</b>ausencia</span>
        <span><b className="mr-1 font-semibold text-muted">L</b>licencia</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] border border-dashed border-line align-middle" />sin horas cargadas (no es una falta)</span>
        <span><span className="mr-1 font-mono text-ink">8,0</span>horas cargadas</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line-hairline px-3.5 py-3 sm:grid-cols-4"
        data-testid="cifras-quincena">
        <Cifra
          k="HH trabajadas" v={sinDatos ? guion : <span data-testid="hh-quincena">{hs(cifras.trabajadas)}</span>}
          // LA REFERENCIA ES LA JORNADA DEL DÍA, NO LA DE LA OBRA. El renglón decía «8,8 h × 7 días
          // hábiles» porque multiplicaba `obra_canonica.jornada_horas` por la cantidad de días; con
          // 9 de L a J y 8 los V no hay un factor único que escribir, así que se nombra la regla.
          detalle={`de ${hs(cifras.referencia)} h · 9 h de L a J y 8 h los V · ${cifras.diasHabiles} días hábiles`}
        />
        <Cifra
          k="Días trabajados" v={sinDatos ? guion : cifras.diasTrabajados}
          detalle={`de ${cifras.diasHabiles} hábiles transcurridos`}
        />
        <Cifra
          k="Ausencias" v={sinDatos ? guion : cifras.ausencias}
          detalle={[
            cifras.motivoFrecuente,
            cifras.licencias > 0 ? `${cifras.licencias} de licencia` : null,
            cifras.sinRegistrar > 0 ? `${cifras.sinRegistrar} sin registrar` : null,
          ].filter(Boolean).join(' · ') || 'ninguna declarada'}
        />
        <Cifra
          k="Horas extra" v={sinDatos ? guion : hs(cifras.extras)}
          detalle={cifras.enDosObras > 0
            ? `${cifras.enDosObras} ${cifras.enDosObras === 1 ? 'día' : 'días'} en dos obras`
            : '50% y 100%, ya incluidas'}
        />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line-hairline px-3.5 py-3">
        <span className="text-[11.5px] text-muted" data-testid="obra-de-la-quincena">
          {obra
            ? (
                <>
                  En <span className="text-ink">{obra.nombre}</span>
                  {obra.desde ? ` desde ${obra.desde}` : ''}
                  {/* ASIGNADO ACÁ, IMPUTANDO ALLÁ. No es un detalle: la jornada de referencia y el
                      costo de la obra salen de dónde se cargaron las horas, no de la asignación. */}
                  {obra.imputadaA && (
                    <span className="text-warn"> · esta quincena imputó a {obra.imputadaA}</span>
                  )}
                </>
              )
            : 'Sin asignación vigente a una obra'}
        </span>
        <Link href={hrefHoras} prefetch={false}
          className="text-[12px] font-medium text-ink hover:underline" data-testid="ir-a-horas">
          Ver la cronología completa →
        </Link>
      </div>

      <div className="border-t border-line-hairline px-3.5 py-3">
        <p className="mb-1.5 text-[11px] text-muted">Últimas 6 quincenas</p>
        <Historial barras={barras} />
      </div>
    </TarjetaFicha>
  )
}
