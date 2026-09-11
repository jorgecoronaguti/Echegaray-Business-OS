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
import type {
  Alicuota, ConceptoCosto, HorasDeObra, PersonaDeEscalera, PersonaProyectable,
} from './costoHora.ts'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { leerRegistrosHH } from './registrosHHService.ts'
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

/** Una fila de `registros_hh` mirada por el costo a la obra. `horas` viaja como texto (numeric). */
export interface FilaDeObra {
  obra_id: unknown
  obra_canonica_id: unknown
  persona_id: unknown
  horas: unknown
  tipo_hora: unknown
}

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
  const [hh, obras, canonicas, oep] = await Promise.all([
    // ═══ POR LA MISMA PUERTA QUE EL RESTO DEL MÓDULO ═══
    //
    // Esta consulta estaba escrita a mano y sin `.range()`: PostgREST corta en `db-max-rows` y
    // devuelve 200 con `error: null`. Es el defecto que `registrosHHService.ts` existe para impedir
    // y que el 11/09/2026 se cerró en la lectura de la plata; acá seguía abierto, en la lectura que
    // le carga el costo a cada obra.
    leerRegistrosHH(supabase, {
      desde: q.desde, hasta: q.hasta,
      columnas: 'obra_id, obra_canonica_id, persona_id, fecha, horas, tipo_hora',
    }),
    supabase.from('obras').select('id, nombre'),
    // EL NOMBRE CANÓNICO GANA AL SLUG. `obra_canonica_id` es un slug estable ('san-francisco') y
    // hasta hoy se publicaba crudo cuando la obra no estaba en `obras`: la pantalla mandaba a la
    // reunión con un identificador de base en vez del nombre con el que la obra se factura.
    supabase.from('obra_canonica').select('id, nombre'),
    supabase.from('obra_egreso_proyectado')
      .select('obra_canonica_id, obra_rotulo, monto').eq('tipo', 'mano_de_obra'),
  ])

  const errores: Falla[] = []
  // `leerRegistrosHH` devuelve el error ya en texto: un tope alcanzado no es un error de PostgREST,
  // es una lectura que no puede afirmar que tiene todo.
  if (hh.error) errores.push({ que: 'las horas de la quincena', error: hh.error })
  if (oep.error && !sinTabla(oep.error)) errores.push({ que: 'la mano de obra presupuestada', error: oep.error.message })

  const nombreDeObra = new Map<string, string>()
  for (const o of obras.data ?? []) nombreDeObra.set(String(o.id), String(o.nombre ?? ''))
  const nombreCanonico = new Map<string, string>()
  for (const o of canonicas.data ?? []) {
    const nombre = String(o.nombre ?? '').trim()
    if (nombre) nombreCanonico.set(String(o.id), nombre)
  }

  const presupuesto = new Map<string, number>()
  const rotuloCanonico = new Map<string, string>()
  for (const f of oep.data ?? []) {
    const clave = f.obra_canonica_id == null ? null : String(f.obra_canonica_id)
    const m = numero(f.monto)
    if (clave == null || m == null) continue
    presupuesto.set(clave, (presupuesto.get(clave) ?? 0) + m)
    if (!rotuloCanonico.has(clave)) rotuloCanonico.set(clave, String(f.obra_rotulo ?? clave))
  }

  const obras_ = repartirHorasPorObra((hh.data ?? []) as FilaDeObra[], tarifas, (f) => {
    const clave = f.obra_canonica_id == null ? '' : String(f.obra_canonica_id)
    if (clave === '') return 'Sin obra imputada'
    return nombreDeObra.get(String(f.obra_id))
      ?? nombreCanonico.get(clave)
      ?? rotuloCanonico.get(clave)
      ?? clave
  })

  return { obras: obras_, presupuesto, errores }
}

/**
 * LAS HORAS DE LA VENTANA REPARTIDAS POR OBRA. Pura: la regla se prueba sin base.
 *
 * ═══ A UNA OBRA SE LE CARGAN LAS HORAS TRABAJADAS, NO LAS DECLARADAS ═══
 *
 * EL DEFECTO, medido en la pantalla real el 11/09/2026: «Costo a la obra» publicaba 1.385,4 HH para
 * la 1ª quincena de septiembre y «Productividad» —la tabla de abajo, en la MISMA solapa— 1.227,0.
 * Las dos cuentan las horas de la misma ventana. La diferencia, 158,4 h, eran ausencias y licencias:
 * filas que la consulta sumaba porque no miraba el `tipo_hora`.
 *
 * Ninguna de las dos se le carga a una obra. Una ausencia sin motivo no se paga (R4) y no produjo
 * nada; una licencia que SÍ se paga es un costo de la empresa, no de la obra donde esa persona
 * hubiera estado — imputarla infla el costo de mano de obra contra el que se mide el presupuesto,
 * que es exactamente lo que esta pantalla existe para calcular. El propio CHECK de la base lo dice:
 * `obra_canonica_id is not null OR tipo_hora in ('ausencia','licencia')`; son las filas que por
 * definición no llevan obra, y acá terminaban todas juntas en «Sin obra imputada».
 *
 * `esTrabajada` es la misma definición que ya usan Productividad y `horasLiquidablesDelDia`. Lo
 * trabajado SÍ suma entre filas: el día repartido entre dos obras es una hora de cada una, y ése es
 * justamente el reparto que esta tabla publica.
 *
 * ═══ EL BOLSILLO DE UNA OBRA CON ALGUIEN SIN TARIFA ES NULL, NO UN PARCIAL ═══
 *
 * R1. Sumar sólo a los que sí tienen tarifa daría un costo que parece completo y le falta gente; se
 * cuenta cuántos son para que la pantalla pueda escribir «1 sin tarifa».
 */
export function repartirHorasPorObra(
  filas: readonly FilaDeObra[],
  tarifas: ReadonlyMap<string, number>,
  rotuloDe: (f: FilaDeObra) => string,
): HorasDeObra[] {
  const acc = new Map<string, {
    horas: number; bolsillo: number; completo: boolean
    sinTarifa: Set<string>; gente: Set<string>; rotulo: string
  }>()
  for (const f of filas) {
    if (!esTrabajada(String(f.tipo_hora))) continue
    const clave = f.obra_canonica_id == null ? '' : String(f.obra_canonica_id)
    const horas = numero(f.horas) ?? 0
    const a = acc.get(clave) ?? {
      horas: 0, bolsillo: 0, completo: true,
      sinTarifa: new Set<string>(), gente: new Set<string>(), rotulo: rotuloDe(f),
    }
    a.horas += horas
    const persona = f.persona_id == null ? null : String(f.persona_id)
    if (persona) a.gente.add(persona)
    const vh = persona == null ? undefined : tarifas.get(persona)
    if (vh == null) { a.completo = false; if (persona) a.sinTarifa.add(persona) } else { a.bolsillo += vh * horas }
    acc.set(clave, a)
  }
  return [...acc.entries()]
    .map(([clave, a]) => ({
      obraId: clave === '' ? null : clave,
      rotulo: a.rotulo,
      horas: Math.round(a.horas * 100) / 100,
      gente: a.gente.size,
      bolsillo: a.completo ? Math.round(a.bolsillo * 100) / 100 : null,
      sinTarifa: a.sinTarifa.size,
    }))
    .sort((x, y) => y.horas - x.horas)
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

/**
 * EL PLANTEL CON SU CATEGORÍA Y SU $/h, para la escalera de la pantalla 5.
 *
 * Mismo corte que `getPersonasProyectables` y por la misma razón: `en_la_empresa`. Una escalera
 * armada sobre los 46 sin egreso cargado publicaría categorías que hoy no se pagan.
 */
export async function getPlantelParaEscalera(
  supabase: SupabaseClient, tarifas: ReadonlyMap<string, number>,
): Promise<{ personas: PersonaDeEscalera[]; error: Falla | null }> {
  const r = await supabase.from('persona_directorio').select('id, categoria, en_la_empresa')
  if (r.error) {
    return { personas: [], error: sinTabla(r.error) ? null : { que: 'el plantel', error: r.error.message } }
  }
  const personas = (r.data ?? [])
    .filter((p) => p.en_la_empresa !== false)
    .map((p): PersonaDeEscalera => ({
      personaId: String(p.id),
      categoria: p.categoria == null ? null : String(p.categoria),
      valorHora: tarifas.get(String(p.id)) ?? null,
    }))
  return { personas, error: null }
}
