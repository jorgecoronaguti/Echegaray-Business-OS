import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContenidoReporte, ConfianzaReporte } from '../types'
import calendario from '@/features/flujo-caja/data/calendario-snapshot.json'

// Generadores de los 3 reportes iniciales. Regla de la skill: el contenido lo
// dicta la fuente de verdad de cada dominio -- lo financiero sale del snapshot
// del Sheet (nunca se recalcula acá), lo de obras/acciones de Supabase. Cada
// generador declara confianza y gaps; si falta el dato, se dice, no se inventa.

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const hoyIso = () => new Date().toISOString().slice(0, 10)

export interface ResultadoGeneracion {
  contenido: ContenidoReporte
  confianza: ConfianzaReporte
  fuentes_usadas: string[]
  periodo_desde: string
  periodo_hasta: string
}

function confianzaBase(): ConfianzaReporte {
  return { confirmados: [], calculados: [], estimados: [], parciales: [], fuentes_atrasadas: [], gaps: [] }
}

async function fuentesAtrasadas(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('fuentes_datos')
    .select('nombre, ultima_lectura, criticidad')
    .eq('estado', 'activa')
    .lt('ultima_lectura', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
  return (data ?? []).map((f) => `${f.nombre} (última lectura hace más de 7 días, criticidad ${f.criticidad})`)
}

export async function generarDiarioDireccion(supabase: SupabaseClient): Promise<ResultadoGeneracion> {
  const hoy = hoyIso()
  const confianza = confianzaBase()

  const [{ data: vencidas }, { data: pendientes }, { data: backlog }] = await Promise.all([
    supabase.from('acciones').select('titulo, contraparte, monto, fecha_limite').in('estado', ['pendiente', 'en_curso']).lt('fecha_limite', hoy).order('fecha_limite'),
    supabase.from('acciones').select('id').in('estado', ['pendiente', 'en_curso']),
    supabase.from('backlog_autonomo').select('titulo, impacto, urgencia').eq('estado', 'abierto').eq('impacto', 'alta').limit(5),
  ])

  const vencidosCal = calendario.vencidos ?? []
  const cobrosVencidos = vencidosCal.filter((m) => m.monto > 0)
  const montoCobrosVencidos = cobrosVencidos.reduce((s, m) => s + m.monto, 0)

  confianza.confirmados.push('Acciones y backlog: dato real del OS (Supabase)')
  confianza.calculados.push(`Caja: snapshot del Sheet Flujo de Caja leído ${calendario.leidoEn}`)
  confianza.fuentes_atrasadas = await fuentesAtrasadas(supabase)
  if (!vencidas?.length && !pendientes?.length) confianza.gaps.push('Sin acciones cargadas — puede reflejar falta de registro, no ausencia de trabajo')

  return {
    periodo_desde: hoy,
    periodo_hasta: hoy,
    fuentes_usadas: ['acciones', 'backlog_autonomo', 'calendario_sheet', 'fuentes_datos'],
    confianza,
    contenido: {
      resumen_ejecutivo: `${vencidas?.length ?? 0} acciones vencidas, ${pendientes?.length ?? 0} abiertas en total. Saldo disponible ${calendario.saldoHoy !== null ? pesos.format(calendario.saldoHoy) : 'sin dato'}. ${cobrosVencidos.length} cobros vencidos sin ejecutar por ${pesos.format(montoCobrosVencidos)}.`,
      principales_cambios: [],
      numeros_clave: [
        { label: 'Acciones vencidas', valor: String(vencidas?.length ?? 0), link: '/acciones' },
        { label: 'Saldo disponible hoy', valor: calendario.saldoHoy !== null ? pesos.format(calendario.saldoHoy) : 'sin dato', link: '/flujo-caja' },
        { label: 'Cobros vencidos sin ejecutar', valor: pesos.format(montoCobrosVencidos), link: '/flujo-caja' },
        { label: 'Hallazgos de impacto alto abiertos', valor: String(backlog?.length ?? 0), link: '/backlog-autonomo' },
      ],
      riesgos: (backlog ?? []).map((b) => b.titulo),
      decisiones_requeridas: (vencidas ?? []).slice(0, 5).map(
        (a) => `${a.titulo}${a.contraparte ? ` — ${a.contraparte}` : ''}${a.monto ? ` (${pesos.format(a.monto)})` : ''} · venció ${a.fecha_limite}`,
      ),
      acciones_vencidas: (vencidas ?? []).map((a) => a.titulo),
      recomendaciones: cobrosVencidos.length
        ? [`Gestionar hoy los cobros vencidos: ${cobrosVencidos.map((c) => `${c.quien} ${pesos.format(c.monto)}`).join(', ')}`]
        : [],
      links_os: [
        { label: 'Calendario de cobros y pagos', href: '/flujo-caja' },
        { label: 'Centro de Acción', href: '/acciones' },
      ],
    },
  }
}

export async function generarSemanalObras(supabase: SupabaseClient): Promise<ResultadoGeneracion> {
  const hoy = hoyIso()
  const hace7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10)
  const confianza = confianzaBase()

  const [{ data: obras }, { data: actividades }, { data: hh }] = await Promise.all([
    supabase.from('obras').select('id, nombre, estado, fecha_fin_objetivo').eq('estado', 'activa'),
    supabase.from('actividades_semanales').select('obra_id, actividad, avance_objetivo, avance_real, hh_objetivo, hh_real, estado, causa_desvio').gte('semana_inicio', hace7),
    supabase.from('registros_hh').select('obra_id, horas').gte('fecha_inicio_semana', hace7),
  ])

  const nombreObra = new Map((obras ?? []).map((o) => [o.id, o.nombre]))
  const hhPorObra = new Map<string, number>()
  for (const r of hh ?? []) hhPorObra.set(r.obra_id, (hhPorObra.get(r.obra_id) ?? 0) + Number(r.horas))
  const desvios = (actividades ?? []).filter(
    (a) => a.avance_real !== null && a.avance_objetivo !== null && Number(a.avance_real) < Number(a.avance_objetivo),
  )

  confianza.confirmados.push('Obras y actividades: dato real del OS')
  if (!actividades?.length) confianza.gaps.push('Sin actividades cargadas esta semana — el avance real de la semana no está registrado en el OS')
  if (!hh?.length) confianza.gaps.push('Sin registros de HH esta semana — la fuente primaria (JORNALES) puede tener datos aún no pasados al OS')
  confianza.parciales.push('El avance de obra completo sigue viviendo en el Sheet "Avances de Obra" (Rodrigo), no migrado — este reporte solo ve lo cargado en el OS')

  return {
    periodo_desde: hace7,
    periodo_hasta: hoy,
    fuentes_usadas: ['obras', 'actividades_semanales', 'registros_hh'],
    confianza,
    contenido: {
      resumen_ejecutivo: `${obras?.length ?? 0} obras activas. ${actividades?.length ?? 0} actividades registradas en la semana, ${desvios.length} con avance bajo objetivo. ${(hh ?? []).reduce((s, r) => s + Number(r.horas), 0)} HH registradas.`,
      principales_cambios: [],
      numeros_clave: [
        { label: 'Obras activas', valor: String(obras?.length ?? 0), link: '/obras' },
        { label: 'Actividades de la semana', valor: String(actividades?.length ?? 0) },
        { label: 'Actividades con desvío', valor: String(desvios.length) },
        ...[...hhPorObra.entries()].map(([obraId, horas]) => ({
          label: `HH ${nombreObra.get(obraId) ?? 'obra'}`,
          valor: `${horas} h`,
        })),
      ],
      riesgos: desvios.map(
        (d) => `${nombreObra.get(d.obra_id) ?? 'Obra'}: "${d.actividad}" avance ${d.avance_real}% vs objetivo ${d.avance_objetivo}%${d.causa_desvio ? ` — causa: ${d.causa_desvio}` : ' — causa sin registrar'}`,
      ),
      decisiones_requeridas: desvios.filter((d) => !d.causa_desvio).length
        ? ['Hay desvíos sin causa registrada — pedir la causa a obra antes de la reunión semanal']
        : [],
      acciones_vencidas: [],
      recomendaciones: [],
      links_os: [{ label: 'Tablero de Obras', href: '/obras' }],
    },
  }
}

export async function generarFinancieroSemanal(supabase: SupabaseClient): Promise<ResultadoGeneracion> {
  const hoy = hoyIso()
  const en7 = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10)
  const confianza = confianzaBase()

  const dias7 = (calendario.dias ?? []).filter((d) => d.fecha <= en7)
  const cobros7 = dias7.flatMap((d) => d.movimientos).filter((m) => m.monto > 0)
  const pagos7 = dias7.flatMap((d) => d.movimientos).filter((m) => m.monto < 0)
  const totalCobros7 = cobros7.reduce((s, m) => s + m.monto, 0)
  const totalPagos7 = pagos7.reduce((s, m) => s + m.monto, 0)
  const vencidos = calendario.vencidos ?? []
  const saldoFinSemana = dias7.length ? dias7[dias7.length - 1].acumulado : (calendario.saldoHoy ?? 0)

  const { data: obligaciones } = await supabase
    .from('obligaciones')
    .select('concepto, monto_total, fecha_vencimiento')
    .gte('fecha_vencimiento', hoy)
    .lte('fecha_vencimiento', en7)

  confianza.confirmados.push(`Caja, cobros y pagos: Sheet Flujo de Caja (fuente de verdad), leído ${calendario.leidoEn}`)
  confianza.calculados.push('Saldo proyectado fin de semana: saldo real + movimientos con fecha de los próximos 7 días')
  confianza.parciales.push('Los movimientos sin fecha cargada en el Sheet no están en la proyección')

  return {
    periodo_desde: hoy,
    periodo_hasta: en7,
    fuentes_usadas: ['calendario_sheet', 'obligaciones'],
    confianza,
    contenido: {
      resumen_ejecutivo: `Próximos 7 días: cobros ${pesos.format(totalCobros7)}, pagos ${pesos.format(totalPagos7)}, saldo proyectado al cierre ${pesos.format(saldoFinSemana)}. ${vencidos.length} movimientos vencidos sin ejecutar.`,
      principales_cambios: [],
      numeros_clave: [
        { label: 'Saldo disponible hoy', valor: calendario.saldoHoy !== null ? pesos.format(calendario.saldoHoy) : 'sin dato', link: '/flujo-caja' },
        { label: 'Cobros próximos 7 días', valor: pesos.format(totalCobros7) },
        { label: 'Pagos próximos 7 días', valor: pesos.format(totalPagos7) },
        { label: 'Saldo proyectado al cierre', valor: pesos.format(saldoFinSemana) },
        { label: 'Vencidos sin ejecutar', valor: String(vencidos.length), link: '/flujo-caja' },
      ],
      riesgos: saldoFinSemana < 0 ? [`La semana cierra con caja proyectada negativa (${pesos.format(saldoFinSemana)})`] : [],
      decisiones_requeridas: vencidos.filter((m) => m.monto > 0).map((m) => `Gestionar cobro vencido: ${m.quien} ${pesos.format(m.monto)} (${m.fecha})`),
      acciones_vencidas: [],
      recomendaciones: (obligaciones ?? []).length
        ? [`Obligaciones que vencen esta semana: ${(obligaciones ?? []).map((o) => `${o.concepto} ${pesos.format(Number(o.monto_total))} (${o.fecha_vencimiento})`).join('; ')}`]
        : [],
      links_os: [{ label: 'Calendario de cobros y pagos', href: '/flujo-caja' }],
    },
  }
}

export const GENERADORES: Record<string, (s: SupabaseClient) => Promise<ResultadoGeneracion>> = {
  'diario-direccion': generarDiarioDireccion,
  'semanal-obras': generarSemanalObras,
  'financiero-semanal': generarFinancieroSemanal,
}
