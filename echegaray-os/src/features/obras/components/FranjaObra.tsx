// LAS CIFRAS DE LA OBRA, EN UNA LÍNEA AL PIE DEL PLAN.
//
// ═══ POR QUÉ UNA LÍNEA Y NO SEIS TARJETAS ═══
//
// Son seis números, no seis temas. En tarjetas ocuparían media pantalla y empujarían el cronograma
// —que es el trabajo— abajo del pliegue. Acá viven al pie, en la fila donde uno mira cuando termina
// de leer el plan, y ocupan una línea.
//
// Cada cifra responde una de las preguntas con las que se abre una obra: cómo viene, cuántas horas
// lleva, si se está pasando, cuánto trabajo hay, qué está trabado y qué viene. Ninguna es
// decorativa: la que no responda una pregunta que alguien hace, no va.
//
// ═══ EL COLOR SIGNIFICA UN PROBLEMA, NO UNA CATEGORÍA ═══
//
// Rojo sólo en dos lugares y sólo cuando corresponde: horas por encima del plan e impedimentos
// vencidos. El resto es gris. Un tablero donde todo tiene color es un tablero donde nada resalta.

import type { ResumenDelPlan } from '../services/resumenDelPlan'

const n = (v: number | null, dec = 0) =>
  v == null ? null : v.toLocaleString('es-AR', { maximumFractionDigits: dec })

function Cifra({
  rotulo, valor, nota, tono = 'ink',
}: {
  rotulo: string
  valor: string | null
  nota?: string | null
  tono?: 'ink' | 'neg'
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] uppercase tracking-wide text-faint">{rotulo}</p>
      <p className={`text-[17px] font-semibold leading-tight tabular-nums ${tono === 'neg' ? 'text-neg' : 'text-ink'}`}>
        {/* SIN CARGAR NO ES CERO. Un 0 acá diría que la obra no avanzó, o que no consumió horas. */}
        {valor ?? <span className="text-[13px] font-normal text-faint">sin cargar</span>}
      </p>
      {nota && <p className="truncate text-[11px] text-muted">{nota}</p>}
    </div>
  )
}

export function FranjaObra({ r, semanas = 2 }: { r: ResumenDelPlan; semanas?: number }) {
  const seExcede = r.desvioHH != null && r.desvioHH > 0
  return (
    <section
      data-testid="franja-obra"
      className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-line bg-surface px-4 py-3 sm:grid-cols-3 lg:grid-cols-6"
    >
      <Cifra rotulo="Avance físico" valor={r.avance == null ? null : `${r.avance}%`} />
      <Cifra
        rotulo="HH consumidas" valor={n(r.hhReal, 1)}
        nota={r.hhPlan == null ? 'sin plan de HH' : `de ${n(r.hhPlan, 1)} previstas`}
      />
      <Cifra
        rotulo="Desvío HH"
        valor={r.desvioHH == null ? null : `${r.desvioHH > 0 ? '+' : ''}${n(r.desvioHH, 1)}`}
        nota={r.desvioHH == null ? 'falta una punta' : 'contra el plan'}
        tono={seExcede ? 'neg' : 'ink'}
      />
      <Cifra rotulo="Actividades" valor={String(r.actividades)} nota={`${r.enCurso} en curso`} />
      <Cifra
        rotulo="Impedimentos" valor={String(r.impedimentosAbiertos)}
        nota={r.impedimentosVencidos > 0 ? `${r.impedimentosVencidos} vencido(s)` : 'ninguno vencido'}
        tono={r.impedimentosVencidos > 0 ? 'neg' : 'ink'}
      />
      <Cifra rotulo={`Próximas ${semanas} semanas`} valor={String(r.proximas)} nota="por arrancar o cerrar" />
    </section>
  )
}
