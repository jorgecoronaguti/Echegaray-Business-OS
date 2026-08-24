// PLAN · REAL · PROYECCIÓN POR RUBRO — dónde se está yendo el trabajo.
//
// Las tres columnas de rendimiento son el corazón: `REND. PLAN` es lo que decía el análisis,
// `REND. REAL` lo que está pasando, y la diferencia entre ambas es la que explica el desvío de HH
// antes de que se vea en el plazo. Cuando el real es peor que el plan va en warn — no en rojo:
// rendir peor que lo cotizado es un aviso, no una falla.
//
// Ninguna celda muestra 0 por un dato que no existe. `sin dato` y `sin base` dicen cosas
// distintas: la primera es que nadie cargó HH, la segunda que no hay avance del que proyectar.

import type { FilaRubro } from '../services/dotacion'

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))
const n2 = (v: number | null) => (v == null ? null : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

// PLAN · REAL · PROYECCIÓN VAN EN MONO (canónico 08). Son tres columnas que existen para
// COMPARARSE entre sí renglón a renglón: en proporcional, «1.240» y «980» no alinean sus dígitos y
// la comparación pasa a ser una lectura en vez de un vistazo. `tnum` sola no alcanza —iguala el
// ancho de los dígitos, no el de la coma ni el del punto de miles—.
function Celda({ children, tono = 'normal' }: { children: React.ReactNode; tono?: 'normal' | 'warn' | 'faint' }) {
  const clase = tono === 'warn' ? 'text-warn' : (tono === 'faint' ? 'text-faint' : 'text-ink-soft')
  return <td className={`px-2 py-1.5 text-right font-mono text-[12px] tabular-nums ${clase}`}>{children}</td>
}

export function TablaRubrosHH({ filas }: { filas: FilaRubro[] }) {
  if (!filas.length) {
    return <p className="text-[12px] text-muted">Esta obra no tiene actividades ejecutables cargadas.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="border-b border-line-strong text-[10px] uppercase tracking-[0.05em] text-faint">
            <th className="px-2 py-1.5 text-left font-normal">Rubro</th>
            <th className="px-2 py-1.5 text-right font-normal">HH plan</th>
            <th className="px-2 py-1.5 text-right font-normal">HH real</th>
            <th className="px-2 py-1.5 text-right font-normal">Avance</th>
            <th className="px-2 py-1.5 text-right font-normal">Rend. plan</th>
            <th className="px-2 py-1.5 text-right font-normal">Rend. real</th>
            <th className="px-2 py-1.5 text-right font-normal">HH proyect.</th>
            <th className="px-2 py-1.5 text-right font-normal">Desvío</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const esRubro = f.nivel === 'rubro'
            const peor = f.rendReal != null && f.rendPlan != null && f.rendReal > f.rendPlan
            return (
              <tr key={`${f.nivel}-${f.nombre}-${i}`} className={`border-b border-surface-sunken ${esRubro ? 'bg-surface-quiet' : ''}`}>
                <td className={`px-2 py-1.5 text-left text-[12.5px] ${esRubro ? 'font-semibold uppercase tracking-[0.03em] text-ink' : 'pl-6 text-ink-soft'}`}>
                  {f.nombre}
                </td>
                <Celda tono={f.hhPlan == null ? 'faint' : 'normal'}>{n0(f.hhPlan) ?? 'sin dato'}</Celda>
                <Celda tono={f.hhReal == null ? 'faint' : 'normal'}>{n0(f.hhReal) ?? 'sin registro'}</Celda>
                <Celda tono={f.avancePct == null ? 'faint' : 'normal'}>
                  {f.avancePct == null ? 'sin plan' : `${Math.round(f.avancePct)} %`}
                </Celda>
                <Celda tono={f.rendPlan == null ? 'faint' : 'normal'}>{n2(f.rendPlan) ?? 'sin dato'}</Celda>
                <Celda tono={f.rendReal == null ? 'faint' : (peor ? 'warn' : 'normal')}>{n2(f.rendReal) ?? 'sin dato'}</Celda>
                <Celda tono={f.hhProyectadas == null ? 'faint' : 'normal'}>{n0(f.hhProyectadas) ?? 'sin base'}</Celda>
                <Celda tono={f.desvioHH == null ? 'faint' : (f.desvioHH > 0 ? 'warn' : 'normal')}>
                  {f.desvioHH == null ? 'sin base' : `${f.desvioHH > 0 ? '+' : ''}${n0(f.desvioHH)}`}
                </Celda>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
