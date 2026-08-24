import { Barra, BarraConPlan, Fila, Metricas, Nada, Panel, Rotulo, porcentaje } from './Piezas'
import { IconoAvance, IconoBloqueo } from '@/shared/components/iconos'
import { IconoAlerta } from './Iconos'
import type { CausaDeAtraso, Esperado, FinProyectado, GrupoDeAvance, HHDeLaObra } from '../services/progreso'

// J03 · CÓMO VIENE LA OBRA — real contra esperado, y después el por qué.
//
// ═══ EL JEFE NO VE UN PESO ACÁ, Y NO ES POR PRUDENCIA ═══
//
// Esta pantalla compara AVANCE FÍSICO contra PLAN y HORAS contra HORAS. Nada de eso necesita el
// contratado ni el costo: la pregunta que contesta es «¿llego?», no «¿gano?». La cerradura sigue
// siendo `ve_economia()` en la base; lo de acá es que la pregunta económica no vive en este perfil.
//
// ═══ HH NO ES AVANCE ═══
//
// Van en su propio bloque y con su rótulo. Un 28 % de obra y 612 HH consumidas son dos hechos, y
// dibujarlos juntos en la misma barra —que es la tentación— afirma una proporción que no existe.

export function ComoVieneLaObra({
  real, esperado, hh, fin, frentes, causas, hoy,
}: {
  /** El avance de la obra tal como lo publica `obra_panel`. */
  real: number | null
  esperado: Esperado
  hh: HHDeLaObra
  fin: FinProyectado
  frentes: GrupoDeAvance[]
  causas: CausaDeAtraso[]
  hoy: string
}) {
  const delta = real != null && esperado.pct != null ? Math.round((real - esperado.pct) * 10) / 10 : null

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <section className="rounded-[14px] bg-surface px-[18px] py-[17px]" data-testid="avance-fisico">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-muted">Avance físico</span>
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-semibold tabular-nums text-ink">
              {real == null ? '—' : porcentaje(real)}
            </span>
            {delta != null && delta < 0 && (
              <span className="text-[12px] text-neg" data-testid="delta-obra">
                ↓ {Math.abs(delta)} pts
              </span>
            )}
            {delta != null && delta >= 0 && (
              <span className="text-[12px] text-pos" data-testid="delta-obra">en fecha</span>
            )}
          </span>
        </div>
        <div className="mt-2.5">
          <BarraConPlan pct={real} esperado={esperado.pct} />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px] text-muted">
          <span>real</span>
          {/* SIN PLAN NO HAY ESPERADO, y no se dibuja un 0 %: nadie dijo cuándo iba cada tarea. */}
          <span>
            {esperado.pct == null
              ? 'sin plan cargado'
              : `esperado ${porcentaje(esperado.pct)}`}
          </span>
        </div>
        {esperado.pct != null && esperado.conPlan < esperado.total && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            El esperado sale de {esperado.conPlan} de {esperado.total} tareas: el resto no tiene
            fechas de plan.
          </p>
        )}
      </section>

      <Metricas
        testid="jefe-avance-metricas"
        metricas={[
          {
            clave: 'HH',
            valor: hh.real == null ? '—' : formatear(hh.real),
            sub: hh.plan == null ? 'sin plan de horas' : `de ${formatear(hh.plan)} plan`,
          },
          {
            clave: 'Desvío HH',
            valor: hh.desvioCerrado == null ? '—' : conSigno(hh.desvioCerrado),
            sub: hh.desvioCerrado == null
              ? 'sin tareas cerradas'
              : `en ${hh.terminadas} ${hh.terminadas === 1 ? 'tarea cerrada' : 'tareas cerradas'}`,
            tono: (hh.desvioCerrado ?? 0) > 0 ? 'warn' : 'ink',
          },
          {
            clave: 'Fin proyectado',
            valor: fin.fecha ? diaMes(fin.fecha) : '—',
            sub: fin.fecha == null
              ? 'sin proyección'
              : fin.dias == null
                ? 'sin fin de plan'
                : fin.dias > 0 ? `${fin.dias} d sobre el plan` : 'dentro del plan',
            tono: (fin.dias ?? 0) > 0 ? 'neg' : 'ink',
          },
        ]}
      />

      <div>
        <Rotulo
          icono={<IconoAvance className="h-[16px] w-[16px]" />}
          extra={`${frentes.length} ${frentes.length === 1 ? 'frente' : 'frentes'}`}
        >
          Por frente
        </Rotulo>
        <Panel testid="avance-por-frente">
          {frentes.length === 0 ? (
            <Nada>Esta obra todavía no tiene tareas cargadas. Se arman desde la planificación.</Nada>
          ) : (
            <>
              {frentes.map((f) => <FilaDeFrente key={f.clave} f={f} />)}
              <p className="flex items-center gap-2 px-[18px] pb-3.5 pt-1 text-[11px] text-faint">
                <span aria-hidden className="h-[11px] w-[1.5px] shrink-0 bg-muted" />
                la marca es lo que debería estar hecho hoy
              </p>
            </>
          )}
        </Panel>
      </div>

      <div>
        <Rotulo
          tono={causas.length > 0 ? 'neg' : 'faint'}
          icono={<IconoBloqueo className="h-[16px] w-[16px]" />}
          extra={causas.length > 0 ? `${causas.length} ${causas.length === 1 ? 'causa' : 'causas'}` : undefined}
        >
          Qué frena el trabajo
        </Rotulo>
        <Panel testid="causas-de-atraso" filo={causas.length > 0 ? 'neg' : undefined}>
          {causas.length === 0 ? (
            <Nada>Ningún impedimento abierto. Los carga quien encuentra el problema, desde el frente.</Nada>
          ) : (
            causas.map((c) => (
              <Fila
                key={c.clave}
                testid="causa"
                titulo={c.tipo}
                detalle={detalleDeCausa(c)}
                tonoDetalle="neg"
                icono={
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-neg-soft text-neg">
                    <IconoAlerta className="h-[19px] w-[19px]" />
                  </span>
                }
                derecha={
                  <span className="shrink-0 font-mono text-[16px] font-semibold tabular-nums text-neg">
                    {c.tareas || c.n}
                  </span>
                }
              />
            ))
          )}
          {/* EL HUECO DECLARADO. El contrato J03 pide HH perdidas por causa y ese dato no existe:
              nadie imputa horas detenidas contra un impedimento. Se dice, no se estima. */}
          {causas.length > 0 && (
            <p className="px-[18px] pb-3.5 pt-1 text-[11.5px] leading-relaxed text-faint">
              El número son las tareas frenadas. Las horas detenidas por cada causa no se registran
              todavía.
            </p>
          )}
        </Panel>
      </div>

      <p className="px-1 text-[11px] text-faint" data-testid="fecha-del-corte">
        Al {diaMes(hoy)}.
      </p>
    </div>
  )
}

function FilaDeFrente({ f }: { f: GrupoDeAvance }) {
  return (
    <div className="border-t border-surface-sunken px-[18px] py-3 first:border-t-0" data-testid="frente-avance-fila">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13.5px] text-ink">{f.nombre}</span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className="font-mono text-[13.5px] font-semibold tabular-nums text-ink">
            {f.pct == null ? '—' : porcentaje(f.pct)}
          </span>
          <span className={`font-mono text-[11.5px] tabular-nums ${
            f.delta == null ? 'text-faint' : f.delta < -5 ? 'text-neg' : f.delta < 0 ? 'text-warn' : 'text-pos'
          }`}>
            {f.delta == null ? 'sin plan' : f.delta < 0 ? `${f.delta}` : 'en fecha'}
          </span>
        </span>
      </div>
      {f.pct == null && f.esperado == null
        ? <Barra pct={null} />
        : <BarraConPlan pct={f.pct} esperado={f.esperado} />}
      {f.medidas < f.total && (
        <div className="mt-2 text-[11.5px] text-faint">{f.medidas} de {f.total} medidas</div>
      )}
    </div>
  )
}

function detalleDeCausa(c: CausaDeAtraso): string {
  const partes: string[] = []
  partes.push(`${c.n} ${c.n === 1 ? 'impedimento abierto' : 'impedimentos abiertos'}`)
  if (c.diasElMasViejo != null && c.diasElMasViejo > 0) {
    partes.push(`el más viejo hace ${c.diasElMasViejo} ${c.diasElMasViejo === 1 ? 'día' : 'días'}`)
  }
  return partes.join(' · ')
}

const formatear = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)
const conSigno = (n: number) => (n > 0 ? `+${formatear(n)}` : formatear(n))
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
