// LA LECTURA DE ANALÍTICAS: una consulta por fuente, con la sesión de quien mira.
//
// El permiso lo decide la base: `analiticas_costos` devuelve null sin `ve_economia()`, y las vistas
// `obra_economia_cartera`, `egreso_por_area` y `nomina_por_mes` ya filtran por rol. Cada lectura que
// falla vuelve `null` —no una lista vacía—: «no pude leer» y «no hay nada» se dibujan distinto.
import type { SupabaseClient } from '@supabase/supabase-js'
import { armarCostosPorObra, armarGastosSinObra, type GastoSinObra } from '@/features/clientes/services/costosDeObra'
import { getEconomiaDeObras } from '@/features/clientes/services/economiaObras'
import { rangoParaVista, type Filtros } from './filtros'
import { leerPaginado } from './paginar'
import { armarObra, elegirObra, pasaEstado, rubrosComparables, sinObraDe, type ObraAnalitica, type ObraPanel } from './obras'
import { leerPresupuestos, presupuestoPorObra } from './presupuesto'
import { leerConsumoMensual, ritmoPorObra, type MesDeConsumo, type Ritmo } from './consumo'

export interface DatosAnaliticas {
  hoy: string
  rango: { desde: string | null; hasta: string | null }
  /** Todas las obras de la cartera (para el menú de Obras, con su estado). */
  cartera: ObraAnalitica[]
  /** Las que pasan Estado y Obras. */
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  /** Lo sin obra de cada cliente con su apertura (materiales, subcontratos, comprobantes). */
  sinObraDetalle: Map<string, GastoSinObra>
  cuentaCorriente: unknown[] | null
  egresos: unknown[] | null
  nomina: unknown[] | null
  quincenas: unknown[] | null
  personas: unknown[] | null
  /** Las filas de deuda de `public.cobranzas`: SÓLO para la acción del día (`planDeCobranza`). */
  documentos: unknown[] | null
  /** Por qué no hay presupuesto (`null` si lo hay). */
  motivoPresupuesto: string | null
  /** La obra de la vista Obras (la pedida si pasa los filtros; si no, la que más consumió). */
  obraElegida: ObraAnalitica | null
  /** Su consumo mes a mes; `null` = no se leyó (otra vista, o la base todavía no lo publica). */
  consumoMensual: MesDeConsumo[] | null
  /** Su ritmo; `null` = no se leyó. */
  ritmo: Ritmo | null
  /** Comprobantes de cada obra tomados al total por no discriminar IVA. Vacío = la base todavía no publica el neto. */
  sinIvaDiscriminado: Map<string, number>
  /** `false` = la puerta de la base contestó null: sin permiso económico. */
  legible: boolean
}

export const hoySanJuan = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' })

const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export async function getDatosAnaliticas(supabase: SupabaseClient, f: Filtros): Promise<DatosAnaliticas> {
  const hoy = hoySanJuan()
  const rango = rangoParaVista(f, hoy)
  const [panel, economia, costos, presupuestos] = await Promise.all([
    supabase.from('obra_panel').select('obra_id, nombre, cliente_id, cliente_slug, cliente_nombre, estado, n_comprobantes, avance_pct'),
    getEconomiaDeObras(supabase),
    supabase.rpc('analiticas_costos', { p_desde: rango.desde, p_hasta: rango.hasta, p_obras: null }),
    // SÓLO EL APROBADO: 'reemplazado' y 'cotizado' no son presupuesto vigente (migración 20260917T1700).
    supabase.from('presupuestos')
      .select('id, obra_canonica_id, estado, costo_directo_presupuestado, costo_pendiente_motivo, fuente_legacy, hh_estimada')
      .eq('estado', 'aprobado').not('obra_canonica_id', 'is', null),
  ])
  const raiz = (costos.data ?? null) as Record<string, unknown> | null
  const porObra = armarCostosPorObra(Array.isArray(raiz?.obras) ? raiz.obras : null)
  const sinObraCruda = armarGastosSinObra(Array.isArray(raiz?.sin_obra) ? raiz.sin_obra : null)
  const aprobados = presupuestos.error ? null : (presupuestos.data ?? [])
  const partidas = aprobados?.length
    ? await supabase.from('partidas_presupuesto').select('presupuesto_id, codigo, descripcion, monto')
      .in('presupuesto_id', aprobados.map((x) => String(x.id)))
    : null
  const lecturaPresupuestos = leerPresupuestos(aprobados, partidas && !partidas.error ? (partidas.data ?? []) : null)
  const presupuestoDe = presupuestoPorObra(lecturaPresupuestos)
  const cartera = ((panel.data ?? []) as ObraPanel[])
    .map((p) => armarObra({ ...p, n_comprobantes: numero(p.n_comprobantes), avance_pct: numero(p.avance_pct) },
      economia?.get(p.obra_id), porObra?.get(p.obra_id), presupuestoDe.get(p.obra_id) ?? null))
    .filter((o): o is ObraAnalitica => o != null)
  const elegidas = new Set(f.obras)
  const obras = cartera.filter((o) => pasaEstado(o.estado, f.estado) && (elegidas.size === 0 || elegidas.has(o.id)))
  // EL CONSUMO MES A MES, SÓLO DE LA OBRA ELEGIDA: la consulta de toda la cartera tardó 2,6 s el
  // 17/09/2026 (recorre las quincenas como `analiticas_costos`) y la base está justa.
  const obraElegida = f.vista === 'obras' ? elegirObra(obras, f.obra) : null
  const consumo = obraElegida ? await supabase.rpc('analiticas_consumo_mensual', { p_obras: [obraElegida.id] }) : null
  const mensual = consumo && !consumo.error ? leerConsumoMensual(consumo.data) : null
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
    // mismo recorte por emisión que la cuenta corriente. Se lee de `cliente_cobranza`, la vista canónica
    // fila por fila (DEFINICIONES: «cobrado»): `public.cobranzas` es la réplica cruda y no se lee desde la
    // app. Paginado por `cobranza_id`, que es único: Cobranzas pasa las 1.000 filas.
    f.vista === 'cobranza'
      ? leerPaginado((a, b) => {
        let q = supabase.from('cliente_cobranza')
          .select('cobranza_id, cliente_id, estado, fecha_cobro, fecha_emision, total_bruto, obra_id, numero_comprobante, factura, concepto')
          .in('estado', ['Pendiente', 'Facturado']).not('cliente_id', 'is', null)
        if (rango.desde) q = q.gte('fecha_emision', rango.desde)
        if (rango.hasta) q = q.lte('fecha_emision', rango.hasta)
        return q.order('cobranza_id').range(a, b)
      })
      : null,
  ])
  return {
    hoy, rango, cartera, obras, sinObra, sinObraDetalle: sinObraCruda ?? new Map(),
    cuentaCorriente: Array.isArray(raiz?.cuenta_corriente) ? raiz.cuenta_corriente : null,
    egresos: egresos?.data ?? null,
    nomina: nomina?.data ?? null,
    quincenas: quincenas?.data ?? null,
    personas: personas?.data ?? null,
    documentos: documentos ?? null,
    motivoPresupuesto: lecturaPresupuestos.motivo,
    obraElegida, consumoMensual: mensual,
    // EL RITMO DEL «ALCANZA» ES DE LOS MISMOS RUBROS QUE EL «QUEDA»: sin presupuesto, todo lo consumido.
    ritmo: mensual && obraElegida
      ? (ritmoPorObra(mensual, hoy, obraElegida.presupuesto != null ? rubrosComparables(obraElegida.presupuestoRubros) : undefined).get(obraElegida.id)
        ?? { porMes: null, ventana: [], conEstimada: false })
      : null,
    sinIvaDiscriminado: new Map((Array.isArray(raiz?.obras) ? raiz.obras : []).flatMap((x: unknown) => {
      const r = (x ?? {}) as Record<string, unknown>
      return typeof r.obra_id === 'string' && r.neto_de_iva === true ? [[r.obra_id, Number(r.n_sin_iva_discriminado ?? 0)] as [string, number]] : []
    })),
    legible: raiz != null,
  }
}
