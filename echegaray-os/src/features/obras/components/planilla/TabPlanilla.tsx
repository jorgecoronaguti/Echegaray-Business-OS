import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDiasHabiles, getHistoriasPeso } from '../../services/obrasService'
import { getPersonas } from '../../services/personalService'
import { getActivosEnObra } from '../../services/ejecucionService'
import { SubNavTrabajo } from '../SubNavTrabajo'
import { PlanillaGrilla } from './PlanillaGrilla'
import type { CeldaPlanilla, ControlDeTarea, NodoWbs } from './planillaObra.ts'
import { nombreDePersona } from '../../../../shared/personas/nombre.ts'

// 04c · TRABAJO · PLANILLA (diseño ERP Obras, 23/09/2026) — tarea × día hábil con la fracción de cada
// parte. SÓLO ESCRITORIO: en el teléfono se dice «Esta planilla se usa en computadora» con la puerta
// al Parte diario (lo decide `PlanillaGrilla` por el ancho de la ventana).
//
// FUENTES, cada una la suya: las celdas de `planilla_obra(obra, desde, hasta)`; el árbol de
// `obra_wbs`; unidad, cantidad y fechas de `obra_actividad_control`; costo y peso de cada historia
// de `obra_historia_peso`; los días que la obra trabaja de `obra_canonica.dias_habiles` y el
// calendario de no laborables. Se leen DIEZ semanas hacia atrás y dos hacia adelante de una vez:
// el ‹ › de la toolbar corre la ventana en el navegador sin volver al servidor.

const DIA = 86_400_000
const corrido = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10)

export async function TabPlanilla({ obraId }: { obraId: string }) {
  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = corrido(hoy, -70)
  const hasta = corrido(hoy, 14)
  const [celdas, wbs, control, historias, isodows, feriados, personas, activos] = await Promise.all([
    supabase.rpc('planilla_obra', { p_obra_id: obraId, p_desde: desde, p_hasta: hasta }),
    supabase.from('obra_wbs').select('actividad_id, nombre, nivel, ruta_orden, tiene_hijas, archivada, tipo').eq('obra_id', obraId).limit(3000),
    supabase.from('obra_actividad_control')
      .select('actividad_id, unidad, cantidad_objetivo, cantidad_ejecutada, avance_pct, inicio_plan, fin_plan, estado_operativo')
      .eq('obra_id', obraId).limit(3000),
    getHistoriasPeso(supabase, obraId),
    getDiasHabiles(supabase, obraId),
    supabase.from('calendario_no_laborable').select('fecha, alcance, obra_id').or(`obra_id.is.null,obra_id.eq.${obraId}`).limit(2000),
    getPersonas(supabase),
    getActivosEnObra(supabase, obraId),
  ])
  const fallas = [celdas.error?.message, wbs.error?.message, control.error?.message, historias.error, feriados.error?.message]
    .filter((e): e is string => Boolean(e))
  const num = (v: unknown) => (v == null ? null : Number(v))
  return (
    <>
      <SubNavTrabajo obraId={obraId} sub="planilla" />
      {/* Quien llega a la planilla desde un enlace en el teléfono: es una pantalla de escritorio (tarea
          × día hábil no entra en 390) y se lo dice con la puerta a lo mismo en su formato. */}
      <div className="flex md:hidden" data-testid="planilla-telefono" style={{ padding: '20px 16px', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#6B6B67' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#1F1F1E' }}>La planilla se mira en la computadora</div>
        <div>Tarea × día hábil no entra en el teléfono. Lo mismo, tarea por tarea, está en Tareas y en el Parte diario.</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link href={`/obras/${obraId}?vista=tareas&sub=arbol`} prefetch={false} style={{ color: '#1F1F1E', textDecoration: 'underline' }}>Tareas</Link>
          <Link href={`/obras/${obraId}?vista=tareas&sub=parte`} prefetch={false} style={{ color: '#1F1F1E', textDecoration: 'underline' }}>Parte diario</Link>
        </div>
      </div>
      <div className="hidden md:block">
      <PlanillaGrilla
        obraId={obraId}
        hoy={hoy}
        isodows={isodows}
        feriados={((feriados.data ?? []) as { fecha: string }[]).map((f) => f.fecha)}
        celdas={((celdas.data ?? []) as Record<string, unknown>[]).map((c): CeldaPlanilla => ({
          actividad_id: String(c.actividad_id), fecha: String(c.fecha), fraccion: num(c.fraccion), cantidad: num(c.cantidad),
          personas: (c.personas as string[] | null) ?? [], activos: (c.activos as string[] | null) ?? [], n_partes: Number(c.n_partes ?? 0),
        }))}
        wbs={((wbs.data ?? []) as Record<string, unknown>[]).map((n): NodoWbs => ({
          actividad_id: String(n.actividad_id), nombre: String(n.nombre), nivel: Number(n.nivel ?? 0),
          ruta_orden: (n.ruta_orden as number[] | null) ?? [], tiene_hijas: Boolean(n.tiene_hijas),
          archivada: Boolean(n.archivada), tipo: String(n.tipo ?? 'tarea'),
        }))}
        control={((control.data ?? []) as Record<string, unknown>[]).map((c): ControlDeTarea => ({
          actividad_id: String(c.actividad_id), unidad: c.unidad == null ? null : String(c.unidad),
          cantidad_objetivo: num(c.cantidad_objetivo), cantidad_ejecutada: num(c.cantidad_ejecutada), avance_pct: num(c.avance_pct),
          inicio_plan: c.inicio_plan == null ? null : String(c.inicio_plan), fin_plan: c.fin_plan == null ? null : String(c.fin_plan),
          estado_operativo: String(c.estado_operativo ?? ''),
        }))}
        historias={historias.data ?? []}
        personas={(personas.data ?? []).map((p) => ({ id: p.id, nombre: nombreDePersona(p) }))}
        activos={(activos.data ?? []).map((a) => ({ id: a.id, nombre: a.nombre }))}
        fallas={fallas}
      />
      </div>
    </>
  )
}
