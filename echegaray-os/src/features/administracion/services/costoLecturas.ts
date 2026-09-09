// LAS LECTURAS DEL COSTO REAL. Ni una regla de negocio acá: trae filas y nada más.
//
// Qué significa cada peso lo decide `costoHora.ts`, que se prueba sin Supabase. Mismo reparto que
// `liquidacionQuincenaService.ts`, y por la misma razón: una regla que necesita la base para
// probarse no se prueba.
//
// ═══ UNA FUENTE QUE FALLÓ SE DICE CON SU ERROR ═══
//
// `costo_hora_alicuota` y `convenio_escala` tienen RLS por `liquida_sueldos()`. Una tabla vacía
// porque la policy rechazó la consulta es indistinguible de una tabla sin cargar, y las dos
// pantallas escriben cosas opuestas: «cargá las alícuotas» contra «no tenés permiso». Cada lectura
// devuelve su error.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Alicuota, ConceptoCosto, HorasDeObra, PersonaProyectable } from './costoHora.ts'
import type { Quincena } from './quincena.ts'

export interface Falla { que: string; error: string }

const numero = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Postgres 42P01: la migración todavía no se aplicó. Se trata como «vacío», no como pantalla rota. */
const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

export interface DatosDeCosto {
  alicuotas: Alicuota[]
  errores: Falla[]
}

/** Todas las versiones, no sólo las vigentes: la pantalla muestra el historial de cada concepto. */
export async function getAlicuotas(supabase: SupabaseClient): Promise<DatosDeCosto> {
  const r = await supabase
    .from('costo_hora_alicuota')
    .select('concepto, desde, porcentaje, base, fuente')
    .order('desde', { ascending: false })
  if (r.error) {
    return { alicuotas: [], errores: sinTabla(r.error) ? [] : [{ que: 'las alícuotas', error: r.error.message }] }
  }
  const alicuotas = (r.data ?? []).flatMap((f): Alicuota[] => {
    const p = numero(f.porcentaje)
    if (p == null) return []
    return [{
      concepto: f.concepto as ConceptoCosto,
      desde: String(f.desde).slice(0, 10),
      porcentaje: p,
      base: f.base === 'total' ? 'total' : 'declarado',
      fuente: String(f.fuente ?? ''),
    }]
  })
  return { alicuotas, errores: [] }
}

/** La tarifa por hora vigente de cada persona a la fecha. `null` = sin tarifa, nunca 0. */
export async function getValorHoraVigente(
  supabase: SupabaseClient, fecha: string,
): Promise<{ porPersona: Map<string, number>; error: Falla | null }> {
  const r = await supabase
    .from('persona_tarifa')
    .select('persona_id, desde, valor_hora')
    .lte('desde', fecha)
    .order('desde', { ascending: true })
  if (r.error) {
    return { porPersona: new Map(), error: sinTabla(r.error) ? null : { que: 'las tarifas', error: r.error.message } }
  }
  // Orden ascendente + sobrescritura = la de mayor `desde` gana. La misma regla que
  // `alicuotasVigentes`, y la única que hace que cambiar una tarifa hoy no reescriba marzo.
  const porPersona = new Map<string, number>()
  for (const f of r.data ?? []) {
    const v = numero(f.valor_hora)
    if (v != null) porPersona.set(String(f.persona_id), v)
  }
  return { porPersona, error: null }
}

export interface HorasYObras {
  obras: HorasDeObra[]
  presupuesto: Map<string, number>
  errores: Falla[]
}

/**
 * LAS HORAS DE LA QUINCENA REPARTIDAS POR OBRA, con su bolsillo y su presupuesto.
 *
 * `bolsillo` queda en `null` para la obra donde trabajó alguien sin tarifa: sumar sólo a los que sí
 * tienen daría un costo que parece completo y le falta gente. Se cuenta cuántos son.
 */
export async function getHorasPorObra(
  supabase: SupabaseClient, q: Quincena, tarifas: ReadonlyMap<string, number>,
): Promise<HorasYObras> {
  const [hh, obras, oep] = await Promise.all([
    supabase.from('registros_hh')
      .select('obra_id, obra_canonica_id, persona_id, horas')
      .gte('fecha', q.desde).lte('fecha', q.hasta),
    supabase.from('obras').select('id, nombre'),
    supabase.from('obra_egreso_proyectado')
      .select('obra_canonica_id, obra_rotulo, monto').eq('tipo', 'mano_de_obra'),
  ])

  const errores: Falla[] = []
  if (hh.error && !sinTabla(hh.error)) errores.push({ que: 'las horas de la quincena', error: hh.error.message })
  if (oep.error && !sinTabla(oep.error)) errores.push({ que: 'la mano de obra presupuestada', error: oep.error.message })

  const nombreDeObra = new Map<string, string>()
  for (const o of obras.data ?? []) nombreDeObra.set(String(o.id), String(o.nombre ?? ''))

  const presupuesto = new Map<string, number>()
  const rotuloCanonico = new Map<string, string>()
  for (const f of oep.data ?? []) {
    const clave = f.obra_canonica_id == null ? null : String(f.obra_canonica_id)
    const m = numero(f.monto)
    if (clave == null || m == null) continue
    presupuesto.set(clave, (presupuesto.get(clave) ?? 0) + m)
    if (!rotuloCanonico.has(clave)) rotuloCanonico.set(clave, String(f.obra_rotulo ?? clave))
  }

  const acc = new Map<string, { horas: number; bolsillo: number; completo: boolean; sinTarifa: Set<string>; rotulo: string }>()
  for (const f of hh.data ?? []) {
    const clave = f.obra_canonica_id == null ? '' : String(f.obra_canonica_id)
    const horas = numero(f.horas) ?? 0
    const rotulo = clave === ''
      ? 'sin obra imputada'
      : nombreDeObra.get(String(f.obra_id)) ?? rotuloCanonico.get(clave) ?? clave
    const a = acc.get(clave) ?? { horas: 0, bolsillo: 0, completo: true, sinTarifa: new Set<string>(), rotulo }
    a.horas += horas
    const persona = f.persona_id == null ? null : String(f.persona_id)
    const vh = persona == null ? undefined : tarifas.get(persona)
    if (vh == null) { a.completo = false; if (persona) a.sinTarifa.add(persona) } else { a.bolsillo += vh * horas }
    acc.set(clave, a)
  }

  const obrasSalida: HorasDeObra[] = [...acc.entries()]
    .map(([clave, a]) => ({
      obraId: clave === '' ? null : clave,
      rotulo: a.rotulo,
      horas: a.horas,
      bolsillo: a.completo ? a.bolsillo : null,
      sinTarifa: a.sinTarifa.size,
    }))
    .sort((x, y) => y.horas - x.horas)

  return { obras: obrasSalida, presupuesto, errores }
}

/**
 * Las personas que hoy están en la empresa, con su $/h vigente, para proyectar.
 *
 * EL CORTE ES `en_la_empresa`, NO `fecha_egreso is null`. Medido el 09/09/2026: 46 personas no
 * tienen egreso cargado y sólo 18 están en la empresa. Proyectar sobre las 46 publicaría una caja
 * de nómina que incluye gente que ya no trabaja acá, y como los que faltan salen contados como
 * «sin tarifa», el error se leería como un dato pendiente en vez de como un total inflado.
 * `es_prueba` sale por lo mismo: son cuentas de QA, no plantel.
 */
export async function getPersonasProyectables(
  supabase: SupabaseClient, tarifas: ReadonlyMap<string, number>,
): Promise<{ personas: PersonaProyectable[]; error: Falla | null }> {
  const r = await supabase.from('personas').select('id, nombre_completo, en_la_empresa, es_prueba')
  if (r.error) return { personas: [], error: { que: 'el plantel', error: r.error.message } }
  const personas = (r.data ?? [])
    .filter((p) => p.en_la_empresa === true && p.es_prueba !== true)
    .map((p): PersonaProyectable => ({
      personaId: String(p.id),
      nombre: String(p.nombre_completo ?? ''),
      valorHora: tarifas.get(String(p.id)) ?? null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return { personas, error: null }
}

export interface JornalesDelSheet {
  desde: string
  hasta: string
  total: number | null
  estado: string
  sincronizadoEn: string | null
}

/**
 * LA MISMA QUINCENA SEGÚN EL SHEET (línea Jornales del Flujo de Caja).
 *
 * Se muestra CON su `sincronizado_en`. Sin esa fecha una diferencia se leería como un desvío del
 * cálculo, cuando lo más probable es que el espejo del Sheet esté congelado — y una fuente que se
 * congela sin gritar ya costó caro acá.
 */
export async function getJornalesDelSheet(
  supabase: SupabaseClient, q: Quincena,
): Promise<{ fila: JornalesDelSheet | null; error: Falla | null }> {
  const r = await supabase
    .from('jornales_quincena')
    .select('desde, hasta, total, estado, sincronizado_en')
    .lte('desde', q.hasta).gte('hasta', q.desde)
    .order('desde', { ascending: false })
    .limit(1)
  if (r.error) {
    return { fila: null, error: sinTabla(r.error) ? null : { que: 'la línea Jornales del Sheet', error: r.error.message } }
  }
  const f = (r.data ?? [])[0]
  if (!f) return { fila: null, error: null }
  return {
    fila: {
      desde: String(f.desde).slice(0, 10),
      hasta: String(f.hasta).slice(0, 10),
      total: numero(f.total),
      estado: String(f.estado ?? ''),
      sincronizadoEn: f.sincronizado_en ? String(f.sincronizado_en).slice(0, 10) : null,
    },
    error: null,
  }
}
