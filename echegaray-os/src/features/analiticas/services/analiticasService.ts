// LA LECTURA DE ANALÍTICAS: una consulta por fuente, con la sesión de quien mira.
//
// El permiso lo decide la base: `analiticas_costos` devuelve null sin `ve_economia()`, y las vistas
// `obra_economia_rubros`, `egreso_por_area` y `nomina_por_mes` ya filtran por rol. Cada lectura que
// falla vuelve `null` —no una lista vacía—: «no pude leer» y «no hay nada» se dibujan distinto.
//
// ═══ DE DÓNDE SALE CADA CONCEPTO (dueño, 18/09/2026: «los mismos lugares en toda la app») ═══
//
//   contratado y presupuestado por rubro → `obra_economia_rubros` (la vista única; `contratado` es
//                                          `contratado_de_obra`, lo mismo que obra_panel, la ficha y el CRM)
//   consumido por rubro (con período)     → `analiticas_costos_rubros` → `costo_de_obras_a_la_fecha_rubros`
//                                          (lo mismo que el CRM, sin IVA acá) y `costo_de_obras_por_rubro`
//                                          para el detalle
//   consumo mes a mes                     → `analiticas_consumo_mensual_rubros`
//
// ═══ POR QUÉ `*_rubros` Y NO LAS DE SIEMPRE (auditoría 18/09/2026) ═══
//
// `analiticas_costos`, `costo_de_obras_a_la_fecha` y `analiticas_consumo_mensual` las lee también el
// código PUBLICADO, que no conoce «otros». Cambiarlas en la base antes de publicar dejó $ 22,6 M de costo
// invisibles en producción: se devolvieron a como estaban (T1500) y los cuatro rubros viven en objetos
// nuevos con la misma regla. Al publicar esta rama, una migración unifica y retira el duplicado.
import type { SupabaseClient } from '@supabase/supabase-js'
import { armarCostosPorObra, armarGastosSinObra, type GastoSinObra } from '@/features/clientes/services/costosDeObra'
import { rangoParaVista, type Filtros } from './filtros'
import { leerPaginado } from './paginar'
import { armarObra, elegirObra, pasaEstado, rubrosComparables, sinObraDe, type ObraAnalitica, type ObraPanel } from './obras'
import { leerEconomiaRubros } from './presupuesto'
import { leerConsumoMensual, leerConsumoPorRubro, ritmoPorObra, type MesDeConsumo, type Ritmo } from './consumo'

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
  /** `true` = el costo que llegó es neto de IVA (la base lo marca obra por obra). */
  netoDeIva: boolean
  /** `false` = la puerta de la base contestó null: sin permiso económico. */
  legible: boolean
  /** `false` = el detalle por rubro (`costo_de_obras_por_rubro`) no se pudo leer. */
  detalleLegible: boolean
}

export const hoySanJuan = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' })

const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export const COLUMNAS_RUBROS = 'obra_canonica_id, contratado, contratado_usd, contratado_origen, contratado_referencia, '
  + 'contrato_mano_obra, contrato_mano_obra_usd, contrato_materiales, contrato_materiales_usd, contrato_total, contrato_fuente_nombre, contrato_cita, '
  + 'presupuesto_estado, presupuesto_motivo, presupuestado_total, presupuesto_estimado, presupuesto_fuente_drive_id, presupuesto_fuente_nombre, '
  + 'presupuesto_fecha, presupuesto_cita, presupuesto_rubros, presupuesto_hh'

export async function getDatosAnaliticas(supabase: SupabaseClient, f: Filtros): Promise<DatosAnaliticas> {
  const hoy = hoySanJuan()
  const rango = rangoParaVista(f, hoy)
  const [panel, rubros, costos] = await Promise.all([
    supabase.from('obra_panel').select('obra_id, nombre, cliente_id, cliente_slug, cliente_nombre, estado, n_comprobantes, avance_pct, orden, obra_padre_id'),
    supabase.from('obra_economia_rubros').select(COLUMNAS_RUBROS),
    supabase.rpc('analiticas_costos_rubros', { p_desde: rango.desde, p_hasta: rango.hasta, p_obras: null }),
  ])
  const raiz = (costos.data ?? null) as Record<string, unknown> | null
  const porObra = armarCostosPorObra(Array.isArray(raiz?.obras) ? raiz.obras : null)
  const sinObraCruda = armarGastosSinObra(Array.isArray(raiz?.sin_obra) ? raiz.sin_obra : null)
  const economia = leerEconomiaRubros(rubros.error ? null : (rubros.data ?? []))
  const ids = ((panel.data ?? []) as ObraPanel[]).map((p) => p.obra_id)
  // EL DETALLE POR RUBRO, CON EL MISMO PERÍODO que el costo: una sola llamada para toda la cartera.
  const detalle = ids.length && raiz != null
    ? await supabase.rpc('costo_de_obras_por_rubro', { p_obras: ids, p_desde: rango.desde, p_hasta: rango.hasta, p_neto: true })
    : null
  const consumoPorRubro = detalle && !detalle.error ? leerConsumoPorRubro(detalle.data) : null
  const cartera = ((panel.data ?? []) as ObraPanel[])
    .map((p) => armarObra({ ...p, n_comprobantes: numero(p.n_comprobantes), avance_pct: numero(p.avance_pct) },
      economia.porObra.get(p.obra_id), porObra?.get(p.obra_id), consumoPorRubro?.get(p.obra_id) ?? null))
    .filter((o): o is ObraAnalitica => o != null)
  const elegidas = new Set(f.obras)
  const obras = cartera.filter((o) => pasaEstado(o.estado, f.estado) && (elegidas.size === 0 || elegidas.has(o.id)))
  // EL CONSUMO MES A MES, SÓLO DE LA OBRA ELEGIDA: la consulta de toda la cartera tardó 2,6 s el
  // 17/09/2026 (recorre las quincenas como `analiticas_costos`) y la base está justa.
  const obraElegida = f.vista === 'obras' ? elegirObra(obras, f.obra) : null
  const consumo = obraElegida ? await supabase.rpc('analiticas_consumo_mensual_rubros', { p_obras: [obraElegida.id] }) : null
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
    motivoPresupuesto: economia.motivo,
    obraElegida, consumoMensual: mensual,
    // EL RITMO DEL «ALCANZA» ES DE LOS MISMOS RUBROS QUE EL «QUEDA»: sin presupuesto, todo lo consumido.
    ritmo: mensual && obraElegida
      ? (ritmoPorObra(mensual, hoy, obraElegida.presupuesto != null ? rubrosComparables(obraElegida.presupuestoRubros) : undefined).get(obraElegida.id)
        ?? { porMes: null, ventana: [], conEstimada: false })
      : null,
    netoDeIva: (Array.isArray(raiz?.obras) ? raiz.obras : []).some((x: unknown) => (x as Record<string, unknown> | null)?.neto_de_iva === true),
    sinIvaDiscriminado: new Map((Array.isArray(raiz?.obras) ? raiz.obras : []).flatMap((x: unknown) => {
      const r = (x ?? {}) as Record<string, unknown>
      return typeof r.obra_id === 'string' && r.neto_de_iva === true ? [[r.obra_id, Number(r.n_sin_iva_discriminado ?? 0)] as [string, number]] : []
    })),
    legible: raiz != null,
    detalleLegible: consumoPorRubro != null,
  }
}
