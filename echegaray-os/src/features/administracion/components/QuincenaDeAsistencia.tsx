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
import type { BarraQuincena, CifrasQuincena, DiaDeQuincena, EstadoDia } from '../services/quincenaDePersona'

const ICONO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

const hs = (n: number): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Qué se escribe y con qué aire. El texto SIEMPRE dice algo: una casilla muda obliga a adivinar
 *  si el sistema no sabe o si no pasó nada. */
const PINTA: Record<EstadoDia, { clase: string; vacio: string; titulo: string }> = {
  trabajado: { clase: 'border-transparent bg-pos-soft text-ink', vacio: '', titulo: 'Trabajó' },
  ausencia: { clase: 'border-transparent bg-neg-soft text-neg', vacio: 'aus.', titulo: 'Ausencia declarada' },
  licencia: { clase: 'border-transparent bg-surface-quiet text-muted', vacio: 'lic.', titulo: 'Licencia declarada' },
  no_laborable: { clase: 'border-transparent bg-surface-sunken text-faint', vacio: '·', titulo: 'No laborable' },
  sin_registrar: { clase: 'border-dashed border-line bg-transparent text-faint', vacio: '—', titulo: 'Sin registro: no es una falta, es que nadie cargó nada' },
  futuro: { clase: 'border-transparent bg-transparent text-faint', vacio: '', titulo: 'Todavía no pasó' },
}

function Casilla({ d }: { d: DiaDeQuincena }) {
  const p = PINTA[d.estado]
  const detalle = [
    `${d.nombre} ${Number(d.fecha.slice(8, 10))}`,
    p.titulo,
    d.motivo,
    d.extras > 0 ? `incluye ${hs(d.extras)} h extra` : null,
    d.obras.length > 1 ? `repartido: ${d.obras.join(' + ')}` : d.obras[0] ?? null,
  ].filter(Boolean).join(' · ')
  return (
    <div
      data-testid="casilla-dia" data-estado={d.estado} data-fecha={d.fecha} title={detalle}
      className={`flex flex-col items-center justify-center gap-px rounded-control border py-1 ${p.clase} ${
        // EL FILO AMARILLO ES LA ÚNICA MARCA DE LA PANTALLA: dice «acá estás», no un estado.
        d.esHoy ? 'border-b-[2px] border-b-marca' : ''}`}
    >
      <span className={`text-[10.5px] leading-none ${d.finDeSemana ? 'text-faint' : 'text-muted'}`}>
        {d.etiqueta}
      </span>
      <span className="flex items-baseline font-mono text-[12px] leading-tight tabular-nums">
        {d.horas == null ? p.vacio : hs(d.horas)}
        {d.obras.length > 1 && <sup className="ml-px text-[9px] text-muted" aria-hidden>2</sup>}
        {d.extras > 0 && <sup className="ml-px text-[9px] text-muted" aria-hidden>+</sup>}
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
  /** La obra de la asignación vigente, con la jornada que fija la referencia. `null` sin asignación. */
  obra: { nombre: string; desde: string | null; jornada: number | null } | null
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(38px,1fr))] gap-1 px-3.5 pb-3 pt-3.5"
        data-testid="franja-quincena">
        {dias.map((d) => <Casilla key={d.fecha} d={d} />)}
      </div>

      {/* LA REFERENCIA, UNA LÍNEA. Sin ella «—» y «aus.» se leen como sinónimos, que es exactamente
          la confusión que este módulo no puede permitirse. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 pb-3 text-[10.5px] text-faint">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-pos-soft align-middle" />trabajó</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-neg-soft align-middle" />ausencia</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-surface-quiet align-middle" />licencia</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] border border-dashed border-line align-middle" />sin registrar (no es una falta)</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-surface-sunken align-middle" />no laborable</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line-hairline px-3.5 py-3 sm:grid-cols-4"
        data-testid="cifras-quincena">
        <Cifra
          k="HH trabajadas" v={sinDatos ? guion : <span data-testid="hh-quincena">{hs(cifras.trabajadas)}</span>}
          // NO SE INVENTA UNA JORNADA. Sin `obra_canonica.jornada_horas` no hay contra qué comparar,
          // y se dice QUÉ falta en vez de dibujar un porcentaje que nadie puede verificar.
          detalle={cifras.referencia == null
            ? (obra ? 'la obra no tiene jornada pactada' : 'sin obra asignada: no hay referencia')
            : `de ${hs(cifras.referencia)} h · ${hs(obra?.jornada ?? 0)} h × ${cifras.diasHabiles} días hábiles`}
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
            ? <>En <span className="text-ink">{obra.nombre}</span>{obra.desde ? ` desde ${obra.desde}` : ''}</>
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
