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
import type { Quincena } from './quincena.ts'

export interface EstadoDeLaQuincena {
  id: string | null
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
}

export interface LiquidacionDeLaQuincena {
  cuadros: CuadroDeLiquidacion[]
  estados: Record<string, EstadoDeLaQuincena>
  /** Cada fuente que no se pudo leer, con su mensaje. Vacío = se leyó todo. */
  errores: { que: string; error: string }[]
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
  const [directorio, legajo, tarifas, registros, presencias, recibos, adelantos, guardadas] =
    await Promise.all([
      supabase.from('persona_directorio').select('id, nombre_completo, en_la_empresa'),
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
      supabase.from('liquidacion_quincena')
        .select('id, grupo, estado, cerrada_en, liquidacion_linea(persona_id, efectivo_redondeado)')
        .eq('desde', q.desde).eq('hasta', q.hasta),
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

  const cuilPorPersona = new Map(
    ((legajo.data ?? []) as { id: string; cuil: string | null }[]).map((r) => [r.id, r.cuil]),
  )
  const personas: PersonaDeLiquidacion[] =
    ((directorio.data ?? []) as { id: string; nombre_completo: string; en_la_empresa: boolean }[])
      .map((r) => ({
        id: r.id,
        nombre: r.nombre_completo,
        cuil: cuilPorPersona.get(r.id) ?? null,
        enLaEmpresa: r.en_la_empresa !== false,
      }))

  const { estados, redondeos } = leerGuardadas(guardadas.data)

  return {
    cuadros: armarCuadros({
      quincena: q,
      personas,
      tarifas: (tarifas.data ?? []) as FilaTarifa[],
      horas: horasPorPersona(q, registros.data, presencias.data),
      recibos: ((recibos.data ?? []) as FilaRecibo[]).map((r) => ({ ...r, neto: numero(r.neto) })),
      adelantos: ((adelantos.data ?? []) as FilaAdelanto[])
        .map((a) => ({ ...a, importe: numero(a.importe) })),
      redondeos,
    }),
    estados,
    errores,
  }
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

interface CabeceraGuardada {
  id: string
  grupo: string
  estado: string
  cerrada_en: string | null
  liquidacion_linea: { persona_id: string; efectivo_redondeado: number | string | null }[] | null
}

/** El estado de cada cuadro y el redondeo ya escrito. Sin cabecera guardada, la quincena está abierta. */
function leerGuardadas(data: unknown): {
  estados: Record<string, EstadoDeLaQuincena>
  redondeos: Map<string, number | null>
} {
  const filas = (data ?? []) as CabeceraGuardada[]
  const estados: Record<string, EstadoDeLaQuincena> = {}
  const redondeos = new Map<string, number | null>()
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
    }
  }
  return { estados, redondeos }
}
