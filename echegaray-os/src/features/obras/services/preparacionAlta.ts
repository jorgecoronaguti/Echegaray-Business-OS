// 02b · M03 — EL «ESTADO DE PREPARACIÓN» DEL ALTA, RÓTULO POR PASO. Módulo puro.
//
// El diseño «De cero al final» (02b) rotula la lista por los pasos del alta —Cliente · Responsable ·
// Fechas · Contrato · Drive · Equipo · Cronograma— y en ese orden, con el faltante corto («sin fecha
// de fin», «nadie asignado», «0 actividades») y el chevron que lleva a ESE paso. Las reglas no se
// duplican: responsable, contrato, drive, equipo y cronograma se leen de las líneas de
// `preparacionDeObra` (la misma definición que el Resumen); sólo cliente y fechas se miran acá.

import type { InsumosPreparacion, LineaPreparacion } from './preparacion.ts'

export interface LineaAlta { clave: string; titulo: string; listo: boolean; detalle: string; href: string }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const paso = (obraId: string, p: string) => `/obras/nueva?obra=${encodeURIComponent(obraId)}&paso=${p}`

export function preparacionDelAlta(
  i: Pick<InsumosPreparacion, 'obraId' | 'inicioPlan' | 'finPlan' | 'jefeObra' | 'personasAsignadas' | 'driveCarpetaId' | 'montoContratado' | 'verContrato'>,
  lineas: readonly LineaPreparacion[],
  cliente: string | null,
): LineaAlta[] {
  const de = (c: string) => lineas.find((l) => l.clave === c)
  const n = (() => { const m = de('cronograma')?.detalle.match(/^(\d+)/); return m ? Number(m[1]) : 0 })()
  const salida: LineaAlta[] = [
    { clave: 'cliente', titulo: 'Cliente', listo: Boolean(cliente), detalle: cliente ?? 'sin cliente', href: paso(i.obraId, 'informacion') },
    { clave: 'responsable', titulo: 'Responsable', listo: Boolean(i.jefeObra), detalle: i.jefeObra ?? 'sin jefe de obra', href: paso(i.obraId, 'responsable') },
    {
      clave: 'fechas', titulo: 'Fechas', listo: Boolean(i.inicioPlan && i.finPlan),
      detalle: i.inicioPlan && i.finPlan ? `${dm(i.inicioPlan)} → ${dm(i.finPlan)}` : i.inicioPlan ? 'sin fecha de fin' : i.finPlan ? 'sin fecha de inicio' : 'sin fechas',
      href: paso(i.obraId, 'fechas'),
    },
  ]
  const contrato = de('contrato')
  if (i.verContrato && contrato) {
    salida.push({ clave: 'contrato', titulo: 'Contrato', listo: contrato.listo, detalle: i.montoContratado == null ? 'monto sin cargar' : contrato.listo ? 'monto y fechas cargados' : contrato.detalle, href: paso(i.obraId, 'contrato') })
  }
  salida.push(
    { clave: 'drive', titulo: 'Drive', listo: Boolean(i.driveCarpetaId), detalle: i.driveCarpetaId ? 'carpeta vinculada' : 'carpeta sin vincular', href: paso(i.obraId, 'drive') },
    { clave: 'equipo', titulo: 'Equipo', listo: i.personasAsignadas > 0, detalle: i.personasAsignadas > 0 ? `${i.personasAsignadas} ${i.personasAsignadas === 1 ? 'persona asignada' : 'personas asignadas'}` : 'nadie asignado', href: paso(i.obraId, 'equipo') },
    { clave: 'cronograma', titulo: 'Cronograma', listo: n > 0, detalle: `${n} ${n === 1 ? 'actividad' : 'actividades'}`, href: paso(i.obraId, 'cronograma') },
  )
  return salida
}
