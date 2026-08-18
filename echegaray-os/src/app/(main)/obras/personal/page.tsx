// PERSONAL — quién está en qué obra, y las horas imputadas. Toda la cartera en una tabla.
//
// MISMA FUENTE QUE LA SOLAPA PERSONAL DE LA OBRA: `getAsignaciones(supabase)` y
// `getRegistrosHH(supabase)` son las mismas funciones que usa la ficha, sin el `where` de la obra.
// La única columna que aparece acá y no allá es «Obra», porque adentro de la obra es redundante.
//
// LO QUE NO ESTÁ ACÁ: el alta de asignaciones y la imputación de horas. Se hacen en la obra, donde
// la acción está atada a `obra_id` por `bind` y el id no viaja en un campo del formulario. Un alta
// global tendría que pedir la obra en un desplegable — es decir, un id editable desde el navegador.

import { createClient } from '@/lib/supabase/server'
import { getAsignaciones, getRegistrosHH } from '@/features/obras/services/personalService'
import { getContextoGlobal, hrefObra } from '@/features/obras/services/vistaGlobal'
import { FiltroObra, NavObras } from '@/features/obras/components/NavObras'
import { C, CeldaObra, Fila, Tabla, Vacio } from '@/features/obras/components/tablas'
import { fecha, horas } from '@/features/obras/components/formato'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const ROL = { responsable: 'Responsable', integrante: 'Integrante' } as const

export default async function PersonalGlobalPage() {
  const supabase = await createClient()
  const ctx = await getContextoGlobal(supabase)
  const [asignaciones, registros] = await Promise.all([
    getAsignaciones(supabase),
    getRegistrosHH(supabase),
  ])
  const filas = asignaciones.data ?? []
  const hh = registros.data ?? []
  const nombre = (id: string | null) => (id ? ctx.nombreDeObra.get(id) : undefined)

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Personal"
      subtitle={`${filas.length} asignacion${filas.length === 1 ? '' : 'es'} en las obras visibles. Quién trabaja dónde; el legajo es de Administración.`}
    >
      <NavObras />

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <FiltroObra obras={ctx.obras} vista="personal" />
      </div>

      {asignaciones.error && <Callout tono="neg">No pude leer las asignaciones: {asignaciones.error}</Callout>}

      {!asignaciones.error && (
        filas.length === 0 ? (
          <Vacio>Todavía no hay nadie asignado a ninguna de las obras visibles.</Vacio>
        ) : (
          <Tabla
            testid="tabla-personal-global"
            min={720}
            cols={[{ k: 'Obra' }, { k: 'Persona' }, { k: 'Rol' }, { k: 'Especialidad' }, { k: 'Cuadrilla' }, { k: 'Desde' }]}
          >
            {filas.map((a) => (
              <Fila key={a.id} obra={a.obra_id}>
                <CeldaObra id={a.obra_id} nombre={nombre(a.obra_id)} href={hrefObra(a.obra_id, 'personal')} />
                {/* Sin nombre se publica la fila igual: perderla escondería una asignación que
                    existe. Ver `getAsignaciones`. */}
                <C fuerte>{a.persona_nombre ?? <span className="text-faint">persona fuera del plantel</span>}</C>
                <C>{ROL[a.rol]}</C>
                <C>{a.persona_especialidad ?? '—'}</C>
                <C>{a.cuadrilla ?? '—'}</C>
                <C num>{fecha(a.desde)}</C>
              </Fila>
            ))}
          </Tabla>
        )
      )}

      {/* LAS HORAS, DEBAJO Y APARTE. Son el respaldo del total de HH que publica `obra_plan_vs_real`,
          no una segunda cuenta: acá no se suma nada por obra. */}
      {hh.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Horas imputadas</h2>
          <Tabla
            testid="tabla-hh-global"
            min={620}
            cols={[{ k: 'Obra' }, { k: 'Semana' }, { k: 'Trabajador o cuadrilla' }, { k: 'Categoría' }, { k: 'Horas', num: true }]}
          >
            {hh.map((r) => (
              <Fila key={r.id} obra={r.obra_canonica_id}>
                <CeldaObra
                  id={r.obra_canonica_id}
                  nombre={nombre(r.obra_canonica_id)}
                  href={r.obra_canonica_id ? hrefObra(r.obra_canonica_id, 'personal') : undefined}
                />
                <C num>{fecha(r.fecha_inicio_semana)}</C>
                <C fuerte>{r.trabajador_o_cuadrilla}</C>
                <C>{r.categoria ?? '—'}</C>
                <C num fuerte>{horas(r.horas)}</C>
              </Fila>
            ))}
          </Tabla>
        </section>
      )}
    </PageShell>
  )
}
