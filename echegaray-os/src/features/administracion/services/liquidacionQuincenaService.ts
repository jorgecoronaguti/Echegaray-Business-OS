// LAS LECTURAS DE LA LIQUIDACIÓN. Ni una regla de negocio acá: trae filas y nada más.
//
// Qué significa cada peso lo deciden `liquidacionQuincena.ts` (la aritmética) y
// `liquidacionCuadros.ts` (quién entra en qué cuadro), que se prueban sin Supabase.
//
// ═══ QUIÉN VE ESTO NO SE DECIDE ACÁ ═══
//
// `persona_tarifa`, `liquidacion_quincena`, `liquidacion_linea`, `nomina_recibo_neto` y
// `nomina_adelanto` tienen RLS por `ve_economia()`: dirección y administración, jefe de obra no.
// Repetir el criterio en TypeScript sería una segunda definición del alcance que además no protege
// una llamada directa a PostgREST. La pantalla igual esconde la solapa — eso es la puerta; la
// policy es la cerradura.
//
// ═══ UNA FUENTE QUE FALLÓ SE DICE CON SU ERROR ═══
//
// Una tabla vacía porque la RLS rechazó la consulta es indistinguible de una quincena sin cargar, y
// la diferencia entre las dos es toda la plata del cuadro. Cada lectura devuelve su error y la
// pantalla lo muestra en vez de dibujar ceros.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  armarCuadros, type CuadroDeLiquidacion, type FilaAdelanto, type FilaRecibo, type FilaTarifa,
  type HorasPorPersona, type PersonaDeLiquidacion,
} from './liquidacionCuadros.ts'
import { horasDeQuincena, type PresenciaDeQuincena, type RegistroDeQuincena } from './liquidacionQuincena.ts'
import { plantelDeLaQuincena } from './liquidacionPlantelActivo.ts'
import { esJefeDeObra } from './vocabularioPersona.ts'
import {
  aplicarOverrides, camposGuardables, sinOverrides,
  type CampoEditable, type LineaConOverrides, type OverridesDeLinea,
} from './liquidacionOverrides.ts'
import type { Quincena } from './quincena.ts'

/** Un cuadro con sus líneas ya pisadas por lo que el dueño escribió a mano. */
export interface CuadroConOverrides extends Omit<CuadroDeLiquidacion, 'lineas'> {
  lineas: LineaConOverrides[]
}

export interface EstadoDeLaQuincena {
  id: string | null
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
}

export interface LiquidacionDeLaQuincena {
  cuadros: CuadroConOverrides[]
  /**
   * QUÉ CELDAS SE PUEDEN EDITAR HOY. Sale de las columnas que la base REALMENTE tiene, no de una
   * lista escrita a mano: mientras `20260909T1740` no esté aplicada, las seis celdas sin columna
   * `*_manual` se dibujan de sólo lectura en vez de guardar en una columna que no puede decir
   * «vacío». El día que se aplique, se encienden solas y sin tocar código.
   */
  camposEditables: CampoEditable[]
  estados: Record<string, EstadoDeLaQuincena>
  /** Cada fuente que no se pudo leer, con su mensaje. Vacío = se leyó todo. */
  errores: { que: string; error: string }[]
  /**
   * Quienes NO aparecen en los cuadros por no tener actividad en esta quincena.
   *
   * Se devuelven porque la pantalla tiene que poder decir «N sin actividad»: una lista que se acorta
   * en silencio es indistinguible de una que se rompió. Nadie se dio de baja — el padrón no se toca.
   */
  sinActividad: { id: string; nombre: string }[]
}

const numero = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Postgres 42P01 = la tabla no existe todavía. Se trata como «vacío», igual que `asistencia_dia`:
 * la migración la aplica una persona y hasta entonces la pantalla no puede quedar rota entera.
 */
const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

/**
 * LAS OCHO LECTURAS EN UNA SOLA TANDA. Ninguna depende de otra: en serie serían ocho viajes por
 * carga de pantalla.
 */
export async function getLiquidacionDeLaQuincena(
  supabase: SupabaseClient, q: Quincena,
): Promise<LiquidacionDeLaQuincena> {
  const [directorio, legajo, tarifas, registros, presencias, recibos, adelantos, guardadas, anterior] =
    await Promise.all([
      // `puesto` VIAJA CON EL PLANTEL para que las pantallas de Liquidación ordenen y rotulen como
      // el resto de Personal (dueño, 10/09/2026). Es la misma columna y la misma función
      // (`esJefeDeObra`) que ya usan Plantel, Asistencia y la grilla de Horas: si cada pantalla
      // decidiera por su cuenta quién es jefe, habría tantas respuestas como pantallas.
      supabase.from('persona_directorio').select('id, nombre_completo, en_la_empresa, puesto'),
      // El CUIL es la llave del recibo y del giro. Vive en `persona_legajo`, que lleva su portero
      // adentro: es el único camino de la web a ese campo (ver `personasService.ts`).
      supabase.from('persona_legajo').select('id, cuil'),
      supabase.from('persona_tarifa')
        .select('persona_id, desde, valor_hora, neto_mensual, origen').lte('desde', q.hasta),
      supabase.from('registros_hh')
        .select('persona_id, fecha, horas, tipo_hora, notas')
        .gte('fecha', q.desde).lte('fecha', q.hasta).not('persona_id', 'is', null),
      supabase.from('asistencia_dia')
        .select('persona_id, fecha, estado, motivo').gte('fecha', q.desde).lte('fecha', q.hasta),
      supabase.from('nomina_recibo_neto').select('cuil, periodo, neto, fecha_pago'),
      supabase.from('nomina_adelanto').select('cuil, fecha, importe, concepto')
        .gte('fecha', q.desde).lte('fecha', q.hasta),
      leerCabecerasGuardadas(supabase, q),
      // LA ÚLTIMA QUINCENA CERRADA ANTES DE ÉSTA: es la evidencia principal de que alguien está
      // activo («le liquidamos la quincena pasada») y de dónde sale el $/h heredado.
      supabase.from('liquidacion_quincena')
        .select('desde, hasta, liquidacion_linea(persona_id)')
        .eq('estado', 'cerrada').lt('hasta', q.desde)
        .order('hasta', { ascending: false }).limit(1),
    ])

  const errores: { que: string; error: string }[] = []
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (e && !sinTabla(e)) errores.push({ que, error: e.message })
  }
  anotar('el plantel', directorio.error)
  anotar('los CUIL del legajo', legajo.error)
  anotar('las tarifas', tarifas.error)
  anotar('las horas de la quincena', registros.error)
  anotar('la presencia declarada', presencias.error)
  anotar('los recibos del estudio', recibos.error)
  anotar('los giros del extracto', adelantos.error)
  anotar('la liquidación guardada', guardadas.error)
  anotar('la quincena anterior', anterior.error)

  const cuilPorPersona = new Map(
    ((legajo.data ?? []) as { id: string; cuil: string | null }[]).map((r) => [r.id, r.cuil]),
  )
  const personas: PersonaDeLiquidacion[] =
    ((directorio.data ?? []) as
      { id: string; nombre_completo: string; en_la_empresa: boolean; puesto: string | null }[])
      .map((r) => ({
        id: r.id,
        nombre: r.nombre_completo,
        cuil: cuilPorPersona.get(r.id) ?? null,
        enLaEmpresa: r.en_la_empresa !== false,
        esJefe: esJefeDeObra(r.puesto),
      }))

  const { estados, redondeos, overrides } = leerGuardadas(guardadas.data)
  const camposEditables = camposGuardables(guardadas.columnas)

  // ═══ SÓLO QUIENES ESTÁN ACTIVOS ESTA QUINCENA ═══
  //
  // Dueño, 09/09/2026: «solo dejame en plantel quienes estén activos esta quincena y sacá a los que
  // no, cuidado con eso». El cuidado está acá: se FILTRA UNA LECTURA. Ni una escritura sobre
  // `personas`, ni `en_la_empresa`, ni bajas. Quien no aparece se devuelve en `sinActividad`.
  const { activas, sinActividad } = plantelDeLaQuincena(personas, {
    conLineaEnLaAnterior: idsDeLaAnterior(anterior.data),
    conHoras: new Set(((registros.data ?? []) as { persona_id: string }[]).map((r) => r.persona_id)),
    conAsistencia: new Set(((presencias.data ?? []) as { persona_id: string }[]).map((r) => r.persona_id)),
    conTarifaNueva: new Set(
      ((tarifas.data ?? []) as { persona_id: string; desde: string }[])
        .filter((t) => t.desde >= q.desde).map((t) => t.persona_id),
    ),
  })

  const cuadros = armarCuadros({
      quincena: q,
      personas: activas,
      tarifas: (tarifas.data ?? []) as FilaTarifa[],
      horas: horasPorPersona(q, registros.data, presencias.data),
      recibos: ((recibos.data ?? []) as FilaRecibo[]).map((r) => ({ ...r, neto: numero(r.neto) })),
      adelantos: ((adelantos.data ?? []) as FilaAdelanto[])
        .map((a) => ({ ...a, importe: numero(a.importe) })),
      redondeos,
  })

  return {
    sinActividad: sinActividad.map((p) => ({ id: p.id, nombre: p.nombre })),
    // LA QUINCENA CERRADA NO SE PISA. Sus cifras son la foto del cierre y no admiten override: si
    // se aplicaran acá, una celda escrita después del cierre cambiaría el registro de lo que ya se
    // pagó, que es exactamente lo que cerrar existe para impedir.
    cuadros: cuadros.map((c) => ({
      ...c,
      lineas: estados[c.grupo]?.estado === 'cerrada'
        ? c.lineas.map(sinOverrides)
        : c.lineas.map((l) => aplicarOverrides(l, overrides.get(l.personaId) ?? {}, c.grupo)),
    })),
    camposEditables,
    estados,
    errores,
  }
}

/** Las columnas de override, si la migración `20260909T1740` ya se aplicó. */
const COLUMNAS_MANUALES = [
  'cobra_manual', 'adelanto_manual', 'ya_transferido_manual',
  'por_banco_manual', 'en_efectivo_manual', 'total_manual',
] as const

const COLUMNAS_LINEA = ['persona_id', 'efectivo_redondeado', 'horas'] as const

/**
 * LAS CABECERAS Y SUS LÍNEAS — preguntando por las columnas de override y aceptando que no estén.
 *
 * SE PRUEBA CONTRA LA BASE, NO CONTRA `migrations/`. Un archivo `.sql` commiteado no es una columna
 * aplicada: el repo ya perdió medio día por dar una migración por vigente. Si la base contesta
 * 42703 («column does not exist») se relee sin ellas y la pantalla se degrada a sólo lectura en esas
 * seis celdas, en vez de romperse entera.
 */
async function leerCabecerasGuardadas(
  supabase: SupabaseClient, q: Quincena,
): Promise<{ data: unknown; error: { code?: string; message: string } | null; columnas: string[] }> {
  const pedir = (columnas: readonly string[]) => supabase.from('liquidacion_quincena')
    .select(`id, grupo, estado, cerrada_en, liquidacion_linea(${columnas.join(', ')})`)
    .eq('desde', q.desde).eq('hasta', q.hasta)

  const conManuales = [...COLUMNAS_LINEA, ...COLUMNAS_MANUALES]
  const primera = await pedir(conManuales)
  if (!primera.error) return { data: primera.data, error: null, columnas: [...conManuales] }
  if (primera.error.code !== '42703' && !/column .* does not exist/i.test(primera.error.message)) {
    return { data: null, error: primera.error, columnas: [] }
  }
  const segunda = await pedir(COLUMNAS_LINEA)
  return {
    data: segunda.data,
    error: segunda.error,
    columnas: segunda.error ? [] : [...COLUMNAS_LINEA],
  }
}

/** Los `persona_id` que tuvieron línea en la última quincena cerrada. Vacío si no hay ninguna. */
function idsDeLaAnterior(data: unknown): Set<string> {
  const filas = (data ?? []) as { liquidacion_linea: { persona_id: string }[] | null }[]
  return new Set(filas.flatMap((f) => (f.liquidacion_linea ?? []).map((l) => l.persona_id)))
}

/** Las horas liquidables de cada persona. Una pasada por persona, con la misma regla que la grilla. */
function horasPorPersona(
  q: Quincena, registros: unknown, presencias: unknown,
): Map<string, HorasPorPersona> {
  const filas = (registros ?? []) as (RegistroDeQuincena & { persona_id: string })[]
  const decl = (presencias ?? []) as (PresenciaDeQuincena & { persona_id: string })[]
  const porPersona = new Map<string, HorasPorPersona>()
  const ids = new Set([...filas.map((f) => f.persona_id), ...decl.map((d) => d.persona_id)])
  for (const id of ids) {
    const h = horasDeQuincena(
      q,
      filas.filter((f) => f.persona_id === id),
      decl.filter((d) => d.persona_id === id),
    )
    porPersona.set(id, { horas: h.horas, presentesSinHoras: h.presentesSinHoras })
  }
  return porPersona
}

type LineaGuardada = {
  persona_id: string
  efectivo_redondeado: number | string | null
  horas?: number | string | null
  cobra_manual?: number | string | null
  adelanto_manual?: number | string | null
  ya_transferido_manual?: number | string | null
  por_banco_manual?: number | string | null
  en_efectivo_manual?: number | string | null
  total_manual?: number | string | null
}

interface CabeceraGuardada {
  id: string
  grupo: string
  estado: string
  cerrada_en: string | null
  liquidacion_linea: LineaGuardada[] | null
}

/** `null`/ausente = no hay override. Un 0 guardado SÍ es un override y tiene que sobrevivir acá. */
const overrideDe = (v: number | string | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const overridesDeLinea = (l: LineaGuardada): OverridesDeLinea => ({
  horas: overrideDe(l.horas),
  cobra: overrideDe(l.cobra_manual),
  adelanto: overrideDe(l.adelanto_manual),
  yaTransferido: overrideDe(l.ya_transferido_manual),
  porBanco: overrideDe(l.por_banco_manual),
  enEfectivo: overrideDe(l.en_efectivo_manual),
  total: overrideDe(l.total_manual),
})

/** El estado de cada cuadro y el redondeo ya escrito. Sin cabecera guardada, la quincena está abierta. */
function leerGuardadas(data: unknown): {
  estados: Record<string, EstadoDeLaQuincena>
  redondeos: Map<string, number | null>
  overrides: Map<string, OverridesDeLinea>
} {
  const filas = (data ?? []) as CabeceraGuardada[]
  const estados: Record<string, EstadoDeLaQuincena> = {}
  const redondeos = new Map<string, number | null>()
  const overrides = new Map<string, OverridesDeLinea>()
  for (const f of filas) {
    estados[f.grupo] = {
      id: f.id,
      estado: f.estado === 'cerrada' ? 'cerrada' : 'abierta',
      cerradaEn: f.cerrada_en,
    }
    for (const l of f.liquidacion_linea ?? []) {
      // NULL SE GUARDA COMO NULL. Un cero acá diría «no le doy nada en mano», que es una afirmación
      // que el dueño no hizo.
      redondeos.set(l.persona_id, l.efectivo_redondeado == null ? null : numero(l.efectivo_redondeado))
      overrides.set(l.persona_id, overridesDeLinea(l))
    }
  }
  return { estados, redondeos, overrides }
}
