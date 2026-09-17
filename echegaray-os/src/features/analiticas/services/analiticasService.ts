// LA LECTURA DE ANALÍTICAS: una consulta por fuente, con la sesión de quien mira.
//
// El permiso lo decide la base: `analiticas_costos` devuelve null sin `ve_economia()`, y las vistas
// `obra_economia_cartera`, `egreso_por_area` y `nomina_por_mes` ya filtran por rol. Cada lectura que
// falla vuelve `null` —no una lista vacía—: «no pude leer» y «no hay nada» se dibujan distinto.
import type { SupabaseClient } from '@supabase/supabase-js'
import { armarCostosPorObra, armarGastosSinObra } from '@/features/clientes/services/costosDeObra'
import { getEconomiaDeObras } from '@/features/clientes/services/economiaObras'
import { rangoParaVista, type Filtros } from './filtros'
import { leerPaginado } from './paginar'
import { armarObra, costoObjetivoValido, pasaEstado, sinObraDe, type ObraAnalitica, type ObraPanel } from './obras'

export interface DatosAnaliticas {
  hoy: string
  rango: { desde: string | null; hasta: string | null }
  /** Todas las obras de la cartera (para el menú de Obras, con su estado). */
  cartera: ObraAnalitica[]
  /** Las que pasan Estado y Obras. */
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  cuentaCorriente: unknown[] | null
  egresos: unknown[] | null
  nomina: unknown[] | null
  quincenas: unknown[] | null
  personas: unknown[] | null
  /** Las filas de deuda de `public.cobranzas`: SÓLO para la acción del día (`planDeCobranza`). */
  documentos: unknown[] | null
  /** `false` = la puerta de la base contestó null: sin permiso económico. */
  legible: boolean
}

export const hoySanJuan = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' })

const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export async function getDatosAnaliticas(supabase: SupabaseClient, f: Filtros): Promise<DatosAnaliticas> {
  const hoy = hoySanJuan()
  const rango = rangoParaVista(f, hoy)
  const [panel, economia, objetivo, costos] = await Promise.all([
    supabase.from('obra_panel').select('obra_id, nombre, cliente_id, cliente_slug, cliente_nombre, estado, n_comprobantes, avance_pct'),
    getEconomiaDeObras(supabase),
    supabase.from('obra_economia').select('obra_id, costo_objetivo, costo_objetivo_origen'),
    supabase.rpc('analiticas_costos', { p_desde: rango.desde, p_hasta: rango.hasta, p_obras: null }),
  ])
  const raiz = (costos.data ?? null) as Record<string, unknown> | null
  const porObra = armarCostosPorObra(Array.isArray(raiz?.obras) ? raiz.obras : null)
  const sinObraCruda = armarGastosSinObra(Array.isArray(raiz?.sin_obra) ? raiz.sin_obra : null)
  const objetivos = new Map((objetivo.data ?? []).map((r) => [String(r.obra_id), costoObjetivoValido(numero(r.costo_objetivo), r.costo_objetivo_origen)]))
  const cartera = ((panel.data ?? []) as ObraPanel[])
    .map((p) => armarObra({ ...p, n_comprobantes: numero(p.n_comprobantes), avance_pct: numero(p.avance_pct) },
      economia?.get(p.obra_id), porObra?.get(p.obra_id), objetivos.get(p.obra_id) ?? null))
    .filter((o): o is ObraAnalitica => o != null)
  const elegidas = new Set(f.obras)
  const obras = cartera.filter((o) => pasaEstado(o.estado, f.estado) && (elegidas.size === 0 || elegidas.has(o.id)))
  // LO SIN OBRA ES DEL CLIENTE: se recorta por período y NUNCA por obra.
  const sinObra = new Map([...(sinObraCruda ?? new Map()).entries()].map(([k, g]) => [k, sinObraDe(g)]))

  const conRango = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T, col: string): T => {
    let r = q
    if (rango.desde) r = r.gte(col, rango.desde)
    if (rango.hasta) r = r.lte(col, rango.hasta)
    return r
  }
  const [egresos, nomina, quincenas, personas, documentos] = await Promise.all([
    // PAGINADO (D6): la vista pasa las 1.000 filas y PostgREST corta ahí sin error.
    f.vista === 'caja'
      ? leerPaginado((a, b) => conRango(supabase.from('egreso_por_area').select('area, grupo, total, fecha'), 'fecha')
        .order('fecha').order('area').order('grupo').order('total').range(a, b))
        .then((data) => ({ data }))
      : null,
    f.vista === 'nomina' ? supabase.from('nomina_por_mes').select('mes, costo_nomina, cargas_sociales, es_estimacion') : null,
    f.vista === 'nomina' ? supabase.from('jornales_quincena').select('desde, estado') : null,
    f.vista === 'nomina' ? supabase.from('personas').select('en_la_empresa, categoria').eq('es_prueba', false) : null,
    // LA ACCIÓN DEL DÍA SE DECIDE POR DOCUMENTO DE COBRANZAS (D10), la misma fuente del saldo y con el
    // mismo recorte por emisión que la cuenta corriente. Paginado: Cobranzas pasa las 1.000 filas.
    // SÓLO COLUMNAS CON GRANT: `authenticated` no lee `id`, `numero_comprobante` ni `concepto` de
    // `cobranzas`, y pedir una sola columna sin permiso hace fallar la consulta entera (la primera
    // versión dejó a los cinco clientes en «no evaluado»). Sin `id`, el orden va por todas las columnas
    // leídas, que es lo que hace estable la paginación (ver `paginar.ts`).
    f.vista === 'cobranza'
      ? leerPaginado((a, b) => {
        let q = supabase.from('cobranzas')
          .select('cliente_id, estado, fecha_cobro, fecha_emision, total_bruto, obra_id')
          .in('estado', ['Pendiente', 'Facturado']).not('cliente_id', 'is', null)
        if (rango.desde) q = q.gte('fecha_emision', rango.desde)
        if (rango.hasta) q = q.lte('fecha_emision', rango.hasta)
        return q.order('cliente_id').order('fecha_cobro').order('fecha_emision').order('total_bruto').order('estado').order('obra_id').range(a, b)
      })
      : null,
  ])
  return {
    hoy, rango, cartera, obras, sinObra,
    cuentaCorriente: Array.isArray(raiz?.cuenta_corriente) ? raiz.cuenta_corriente : null,
    egresos: egresos?.data ?? null,
    nomina: nomina?.data ?? null,
    quincenas: quincenas?.data ?? null,
    personas: personas?.data ?? null,
    documentos: documentos ?? null,
    legible: raiz != null,
  }
}
