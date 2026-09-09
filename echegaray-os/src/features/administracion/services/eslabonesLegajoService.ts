// LOS TRES ESLABONES QUE YA VIVEN EN EL LEGAJO — la liquidación los LEE, no los vuelve a pedir.
//
// Pantalla 12 del handoff v2: retribución · ausencias con su motivo · lote de haberes contra el
// extracto. Los tres datos existen hace meses en tablas distintas y la liquidación los pedía de
// nuevo en papel.
//
// ═══ R7 · UN RECIBO NO ES PLATA GIRADA ═══
//
// Que el estudio haya liquidado un neto no dice que el banco lo haya movido. Hasta que el extracto
// muestra el giro, esa plata sigue por pagar: va como «recibo sin giro» y NO cuenta como banco. La
// regla ya vive en `liquidarLinea`; acá se reusa `girosDe`, que es su única definición.
//
// ═══ UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ» ═══
//
// Y es lo que hace peligrosa esta pantalla. Sin extracto importado para la ventana, TODOS los
// recibos aparecerían «sin giro» y el cuadro acusaría a la administración de no haber pagado. Por
// eso se cuenta primero si hay movimientos bancarios en la quincena: si no los hay, la columna dice
// «sin extracto» y ninguna fila se marca sin giro.

import type { SupabaseClient } from '@supabase/supabase-js'
import { girosDe, periodoDeRecibo, type FilaAdelanto, type FilaRecibo } from './liquidacionCuadros.ts'
import { tarifaVigenteAl } from './liquidacionQuincena.ts'
import type { Quincena } from './quincena.ts'

/** El estado del recibo del estudio en Documentos del legajo. */
export type ChipRecibo = 'cargado' | 'solicitado'

export interface EslabonPersona {
  personaId: string
  nombre: string
  /** Retribución vigente. `null` = sin retribución cargada; la fila lo dice y no inventa $ 0. */
  valorHora: number | null
  netoMensual: number | null
  origenTarifa: string | null
  /** El neto que liquidó el estudio para esta quincena. `null` = no hay recibo. */
  reciboNeto: number | null
  /** `null` = no hay recibo del estudio para esta quincena en Documentos del legajo. */
  chip: ChipRecibo | null
  /** `true` sólo si el extracto muestra el giro. Ver `girosDe`. */
  giroEnElLote: boolean
}

export interface AusenciaDeclarada {
  fecha: string
  personaId: string
  nombre: string
  tipo: 'ausencia' | 'licencia'
  motivo: string | null
}

export interface EslabonesDeLaQuincena {
  personas: EslabonPersona[]
  ausencias: AusenciaDeclarada[]
  /** `false` = no hay extracto importado para la ventana: no se puede afirmar que nada se giró. */
  hayExtracto: boolean
  /** Suma de los recibos que el extracto NO confirma. Sólo tiene sentido con extracto. */
  sinGiro: number
  errores: { que: string; error: string }[]
}

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

const numero = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface FilaLegajo {
  id: string; nombre_completo: string; cuil: string | null; en_la_empresa: boolean | null
}

/** LAS SEIS LECTURAS EN UNA TANDA. */
export async function getEslabonesDeLaQuincena(
  supabase: SupabaseClient, q: Quincena,
): Promise<EslabonesDeLaQuincena> {
  const [legajo, tarifas, recibos, adelantos, estudio, banco] = await Promise.all([
    supabase.from('persona_legajo').select('id, nombre_completo, cuil, en_la_empresa'),
    supabase.from('persona_tarifa')
      .select('persona_id, desde, valor_hora, neto_mensual, origen').lte('desde', q.hasta),
    supabase.from('nomina_recibo_neto').select('cuil, periodo, neto, fecha_pago'),
    supabase.from('nomina_adelanto').select('cuil, fecha, importe, concepto')
      .gte('fecha', q.desde).lte('fecha', q.hasta),
    // El recibo del estudio EN DOCUMENTOS DEL LEGAJO: `drive_file_id` es el chip cargado/solicitado.
    supabase.from('recibo_empleado')
      .select('persona_id, periodo_desde, periodo_hasta, neto, drive_file_id')
      .gte('periodo_desde', q.desde).lte('periodo_hasta', q.hasta),
    // NO se leen los movimientos: se cuenta si HAY. Es la diferencia entre «no giró» y «no miré».
    supabase.from('banco_movimientos')
      .select('id', { count: 'exact', head: true }).gte('fecha', q.desde).lte('fecha', q.hasta),
  ])

  const errores: { que: string; error: string }[] = []
  // UN MENSAJE VACÍO NO ES UN MENSAJE. PostgREST devuelve 403 con `message: ""` cuando falta el
  // GRANT, y un aviso en blanco manda a leer los logs para descubrir que la tabla está cerrada.
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (!e || sinTabla(e)) return
    const texto = e.message?.trim()
    errores.push({
      que,
      error: texto || `la base rechazó la consulta (permiso o GRANT faltante${e.code ? `, código ${e.code}` : ''}).`,
    })
  }
  anotar('el legajo del plantel', legajo.error)
  anotar('las retribuciones', tarifas.error)
  anotar('los recibos del estudio', recibos.error)
  anotar('los giros del extracto', adelantos.error)
  anotar('los recibos de Documentos del legajo', estudio.error)
  anotar('el extracto bancario', banco.error)

  const hayExtracto = (banco.count ?? 0) > 0
  const personas = armarPersonas(q, legajo.data, tarifas.data, recibos.data, adelantos.data, estudio.data, hayExtracto)

  return {
    personas,
    ausencias: [],
    hayExtracto,
    sinGiro: hayExtracto
      ? Math.round(personas
        .filter((p) => p.reciboNeto != null && !p.giroEnElLote)
        .reduce((s, p) => s + (p.reciboNeto ?? 0), 0) * 100) / 100
      : 0,
    errores,
  }
}

function armarPersonas(
  q: Quincena, legajo: unknown, tarifas: unknown, recibos: unknown, adelantos: unknown,
  estudio: unknown, hayExtracto: boolean,
): EslabonPersona[] {
  const periodo = periodoDeRecibo(q)
  const filasRecibo = (recibos ?? []) as FilaRecibo[]
  const filasAdelanto = ((adelantos ?? []) as FilaAdelanto[])
    .map((a) => ({ ...a, importe: numero(a.importe) }))
  const delEstudio = new Map(
    ((estudio ?? []) as { persona_id: string; neto: number | null; drive_file_id: string | null }[])
      .map((r) => [r.persona_id, r]),
  )
  const todas = (tarifas ?? []) as {
    persona_id: string; desde: string; valor_hora: number | null; neto_mensual: number | null; origen: string
  }[]

  return ((legajo ?? []) as FilaLegajo[])
    .filter((p) => p.en_la_empresa !== false)
    .map((p) => {
      const vigente = tarifaVigenteAl(
        todas.filter((t) => t.persona_id === p.id).map((t) => ({
          valorHora: t.valor_hora == null ? null : Number(t.valor_hora),
          netoMensual: t.neto_mensual == null ? null : Number(t.neto_mensual),
          desde: t.desde, origen: t.origen,
        })),
        q.hasta,
      )
      const doc = delEstudio.get(p.id)
      const neto = p.cuil
        ? (filasRecibo.find((r) => r.cuil === p.cuil && r.periodo === periodo)?.neto ?? null)
        : null
      const reciboNeto = neto != null ? numero(neto) : (doc?.neto != null ? numero(doc.neto) : null)
      // SIN EXTRACTO NADIE SE MARCA SIN GIRO: no se puede afirmar lo que no se pudo mirar.
      const giro = hayExtracto
        ? girosDe(q, filasAdelanto, p.cuil, 'sueldo', reciboNeto).giroEnElLote
        : false
      return {
        personaId: p.id,
        nombre: p.nombre_completo,
        valorHora: vigente?.valorHora ?? null,
        netoMensual: vigente?.netoMensual ?? null,
        origenTarifa: vigente?.origen ?? null,
        reciboNeto,
        chip: doc == null ? null : (doc.drive_file_id ? ('cargado' as const) : ('solicitado' as const)),
        giroEnElLote: giro,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Las ausencias declaradas de la ventana, con su motivo. Lectura aparte: la tabla es otra. */
export async function getAusenciasDeLaQuincena(
  supabase: SupabaseClient, q: Quincena, nombres: ReadonlyMap<string, string>,
): Promise<AusenciaDeclarada[]> {
  const { data } = await supabase.from('asistencia_dia')
    .select('persona_id, fecha, estado, motivo')
    .gte('fecha', q.desde).lte('fecha', q.hasta)
    .in('estado', ['ausente', 'licencia'])
    .order('fecha', { ascending: false })
  return ((data ?? []) as { persona_id: string; fecha: string; estado: string; motivo: string | null }[])
    .map((a) => ({
      fecha: a.fecha,
      personaId: a.persona_id,
      nombre: nombres.get(a.persona_id) ?? 'sin nombre en el legajo',
      tipo: a.estado === 'licencia' ? ('licencia' as const) : ('ausencia' as const),
      motivo: a.motivo,
    }))
}
