// EL POOL «SIN CUADRILLA» — la gente que hoy no aparece en ninguna lista operativa.
//
// Es la mitad que le faltaba a la pantalla: el listado muestra las cuadrillas y sus integrantes, y
// quien NO está en ninguna era invisible. Un ayudante que quedó fuera de toda cuadrilla no deja de
// cobrar ni de estar en obra — deja de ser mirado.
//
// ═══ EL REORDENAMIENTO CON ⠿ DEL DISEÑO NO ESTÁ, A PROPÓSITO ═══
//
// El diseño dibuja un tirador para arrastrar personas entre cuadrillas. No se implementó: no existe
// campo de ORDEN en `cuadrilla_integrante` ni en `cuadrilla`, así que un arrastre movería píxeles y
// al recargar la pantalla volvería todo a su lugar sin decir por qué. Asignar SÍ tiene efecto real
// —abre un período nuevo y cierra el anterior—, y eso es lo que este bloque hace.

import Link from 'next/link'
import { CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { Eyebrow, Nulo } from '@/shared/components/ds'
import type { SinCuadrilla } from '../types'
import type { CategoriaCapacidad } from '@/features/obras/services/cronogramaObraService'

export function PoolSinCuadrilla({
  personas, cuadrillas, factores, asignar,
}: {
  personas: SinCuadrilla[]
  cuadrillas: { id: string; nombre: string }[]
  factores: CategoriaCapacidad[]
  asignar: AccionFormulario
}) {
  const nombreDe = (clave: string | null) =>
    (clave ? factores.find((f) => f.clave === clave)?.nombre : null) ?? null

  return (
    <section data-testid="pool-sin-cuadrilla" className="mt-8 border-t border-line pt-4">
      <Eyebrow className="mb-2.5">Sin cuadrilla · {personas.length}</Eyebrow>

      {personas.length === 0
        ? <p className="text-[12.5px] text-muted">Todo el plantel activo integra alguna cuadrilla.</p>
        : (
            <ul className="space-y-1.5">
              {personas.map((p) => (
                <li
                  key={p.id}
                  data-testid="fila-sin-cuadrilla"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#EFEEEA] py-1.5 text-[12.5px] last:border-b-0"
                >
                  <Link href={`/administracion/personas/${p.id}`} className="min-w-0 flex-1 truncate text-ink hover:underline">
                    {p.nombre_completo}
                  </Link>
                  <span className="shrink-0 text-[11px] text-muted">
                    {nombreDe(p.categoria) ?? <Nulo>sin categoría</Nulo>}
                  </span>
                  {/* LA OBRA A LA VISTA: alguien sin cuadrilla PERO asignado a una obra no es lo
                      mismo que alguien parado, y la decisión de a qué cuadrilla mandarlo cambia. */}
                  <span className="w-[150px] shrink-0 truncate text-[11px] text-faint">
                    {p.obra_actual ?? 'sin obra vigente'}
                  </span>
                  {cuadrillas.length === 0
                    ? <span className="text-[11px] text-faint">no hay cuadrillas activas</span>
                    : (
                        <FormAccion
                          accion={asignar}
                          testid="form-asignar-cuadrilla"
                          enviar="Asignar"
                          mensajeOk="Asignado."
                          // El botón de `FormAccion` vive en un bloque con `mt-3`; acá la fila es de
                          // una sola línea, así que se le saca el margen al hijo en vez de duplicar
                          // el componente sólo para cambiarle el aire.
                          className="flex shrink-0 items-center gap-2 [&>div]:mt-0"
                        >
                          <input type="hidden" name="persona_id" value={p.id} />
                          <select
                            name="cuadrilla_id" required defaultValue=""
                            aria-label={`Cuadrilla para ${p.nombre_completo}`}
                            className={`${CTRL} mt-0 w-[190px]`}
                          >
                            <option value="" disabled>elegir cuadrilla</option>
                            {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                          </select>
                        </FormAccion>
                      )}
                </li>
              ))}
            </ul>
          )}

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Asignar abre un período nuevo en la cuadrilla elegida y cierra el anterior el día previo:
        nadie queda en dos cuadrillas a la vez, y el historial no se pisa.
      </p>
    </section>
  )
}
