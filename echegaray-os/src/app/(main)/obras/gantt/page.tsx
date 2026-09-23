// 02 · CARTERA · GANTT — LA MISMA CARTERA, SOBRE EL CALENDARIO (diseño ERP Obras 02 / M02).
//
// El dueño, textual: *"GANTT GLOBAL = obras. GANTT OBRA = actividades. No son dos sistemas"*.
//
// ═══ MISMA LECTURA QUE LA TABLA (23/09/2026) ═══
//
// Lee `obra_panel` por `getCartera`, igual que `/obras`: mismas filas, mismos filtros, mismo
// `forecast_fin`. Hasta hoy leía `obra_plan_vs_real` y pintaba con un semáforo propio (avance contra
// calendario consumido); el diseño aprobado dibuja el plazo con la MISMA regla que la columna PLAZO
// —proyección = `forecast_fin − fecha_fin_plan`— y su pie lo dice con todas las letras. Dos dibujos
// del mismo plazo con dos reglas eran dos pantallas contestando distinto sobre la misma obra.
//
// ESTA PANTALLA NO HABLA DE PLATA: `monto_contratado` viaja en la lectura compartida y no se dibuja.

import { createClient } from '@/lib/supabase/server'
import { getCartera } from '@/features/obras/services/obrasService'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { getSenalesCartera } from '@/features/obras/services/senalesCarteraService'
import { GanttObras } from '@/features/obras/components/GanttObras'
import type { FilaCartera } from '@/features/obras/components/CarteraObras'
import { RecordarVista } from '@/features/obras/components/RecordarVista'
import { EstadoError } from '@/shared/components/estado'

export const dynamic = 'force-dynamic'

export default async function GanttGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ archivadas?: string }>
}) {
  const { archivadas: verArchivadas } = await searchParams
  const supabase = await createClient()
  // EL DÍA SE FIJA EN EL SERVIDOR Y VIAJA: la línea de HOY y la ventana de meses no pueden depender
  // del reloj del navegador que las mira.
  const hoyIso = new Date().toISOString().slice(0, 10)
  const [{ data, error }, senales, codigos] = await Promise.all([
    getCartera(supabase),
    getSenalesCartera(supabase, hoyIso),
    codigosDeObra(supabase, null),
  ])
  if (error) return <EstadoError mensaje={error} que="el plazo de las obras" />

  const todas = data ?? []
  const visibles = verArchivadas === '1' ? todas : todas.filter((o) => o.estado !== 'cerrada')
  const filas: FilaCartera[] = visibles.map((o) => ({
    obra_id: o.obra_id,
    nombre: o.nombre,
    codigo: codigos.get(o.obra_id) ?? null,
    cliente_slug: o.cliente_slug,
    cliente_nombre: o.cliente_nombre,
    cliente_texto: o.cliente_texto,
    estado: o.estado,
    etapa: o.etapa,
    avance_pct: o.avance_pct,
    fecha_inicio_plan: o.fecha_inicio_plan,
    fecha_fin_plan: o.fecha_fin_plan,
    forecast_fin: o.forecast_fin,
    impedimentos: senales.impedimentos ? (senales.impedimentos.get(o.obra_id) ?? 0) : null,
  }))

  return (
    <>
      <RecordarVista />
      <GanttObras obras={filas} hoyIso={hoyIso} />
    </>
  )
}
