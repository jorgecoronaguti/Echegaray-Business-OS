import type { ReactNode } from 'react'
import Link from 'next/link'

// LA BARRA DE CONTEXTO — `design/system/` §Cromo global, punto 2.
//
// «Fondo `#30302F`, borde izquierdo 4px `#FDC900`: migaja arriba, título de la entidad, KPIs a la
// derecha en mono con rótulo chico.» Es la barra que corona una entidad abierta —una obra, un
// presupuesto, una partida— y contesta las tres preguntas de golpe: de dónde vine, qué estoy
// mirando, y los dos o tres números que hacen falta para no tener que bajar.
//
// ═══ POR QUÉ ESTÁ EN EL DESIGN SYSTEM Y NO EN UN MÓDULO ═══
//
// El handoff la describe para cuatro pantallas de áreas distintas. La primera que la necesitó fue
// Presupuestos; escribirla ahí habría garantizado que la segunda la copie con otros píxeles, que es
// exactamente cómo `NavAdministracion` terminó dibujando su propia barra de solapas por tercera vez.
//
// ═══ EL KPI SIN DATO NO SE DIBUJA EN CERO ═══
//
// `valor` acepta `null` y entonces se escribe la ausencia en `#91918B`. Un `$ 0` en la barra de un
// presupuesto sin partidas se lee como una oferta de cero pesos.

export interface KpiContexto {
  rotulo: string
  valor: ReactNode | null
  falta?: string
  /** El número proyectado va en amarillo — es la única cifra de la barra que no es un hecho. */
  destacado?: boolean
}

export function BarraContexto({
  volverA,
  volverLabel,
  titulo,
  meta,
  kpis = [],
  acciones,
  testid = 'barra-contexto',
}: {
  volverA?: string
  volverLabel?: ReactNode
  titulo: ReactNode
  /** La línea de identidad: cliente, versión, estado. Texto claro sobre el grafito. */
  meta?: ReactNode
  kpis?: KpiContexto[]
  acciones?: ReactNode
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      className="border-l-4 border-marca bg-accent px-4 py-3.5 lg:px-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          {volverA && (
            <Link
              href={volverA}
              data-testid="barra-contexto-volver"
              className="inline-flex items-center gap-1 text-[11px] text-white/55 transition-colors hover:text-white"
            >
              <span aria-hidden>←</span>
              {volverLabel}
            </Link>
          )}
          <h1 className="mt-1 truncate text-[21px] font-semibold leading-tight text-white">{titulo}</h1>
          {meta && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-white/65">
              {meta}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-3">
          {kpis.map((k) => (
            <div key={k.rotulo} className="shrink-0" data-kpi={k.rotulo}>
              <div className="text-[10px] uppercase tracking-[0.05em] text-white/45">{k.rotulo}</div>
              <div
                className={`font-mono text-[20px] font-semibold leading-tight tabular-nums ${
                  k.valor == null ? 'text-white/45' : k.destacado ? 'text-marca' : 'text-white'
                }`}
              >
                {k.valor ?? <span className="font-sans text-[13px]">{k.falta ?? 'sin cargar'}</span>}
              </div>
            </div>
          ))}
          {acciones && <div className="flex shrink-0 flex-wrap items-center gap-3">{acciones}</div>}
        </div>
      </div>
    </div>
  )
}

/** Un dato de la línea `meta`: rótulo apagado + valor. El destacado va en amarillo. */
export function MetaContexto({
  rotulo, children, destacado,
}: { rotulo?: string; children: ReactNode; destacado?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {rotulo && <span className="text-white/40">{rotulo}</span>}
      <span className={destacado ? 'text-marca' : 'text-white/80'}>{children}</span>
    </span>
  )
}
