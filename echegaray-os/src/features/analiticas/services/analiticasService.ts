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
import { leerFotoCaja, type LecturaCaja } from './cajaSheet'
import { pagoDeNomina, type FilaLinea, type FilaPersona, type FilaQuincena, type FilaRecibo, type NominaPagada } from './nominaPagada'
import { getDeuda } from '@/features/administracion/services/deudaProveedoresService'
import { totalesDeuda, type TotalesDeuda } from '@/features/administracion/services/deudaProveedores'

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
  /**
   * Vista Caja: lo salido dentro del período, con la forma de `caja_egreso_percibido`. Sin esa vista
   * en la base (migración 20260918T1500 sin aplicar) son las filas de `egreso_por_area` adaptadas, y
   * `criterioEgresos` lo dice: son dos criterios distintos y la pantalla no los puede confundir.
   */
  egresos: unknown[] | null
  /** `percibido` = cada pago en su fecha (Compras) · `devengado` = la fecha del comprobante. */
  criterioEgresos: CriterioEgreso
  /** Vista Caja: la pestaña CAJA leída de su espejo (`caja_sheet_vigente`). */
  cajaSheet: LecturaCaja
  /**
   * Vista Caja: lo que se les debe HOY a los proveedores, con la MISMA lectura y la misma cuenta que
   * «A quién le debo» en Proveedores (`getDeuda` + `totalesDeuda`). El dueño (18/09/2026): la deuda de
   * Caja es la de Proveedores, no la tarjeta de la pestaña. `null` = no se pudo leer (se dice, no se inventa).
   */
  deudaProveedores: (TotalesDeuda & { truncado: boolean }) | null
  /**
   * Vista Nómina: lo PAGADO a la gente en el año, blanco y negro, sin cargas sociales. `null` = no se
   * pudo leer la liquidación (la puerta de sueldos es `liquida_sueldos()`, no `ve_economia()`).
   */
  nominaPagada: NominaPagada | null
  personas: unknown[] | null
  /** Las filas de deuda de `public.cobranzas`: SÓLO para la acción del día (`planDeCobranza`). */
  documentos: unknown[] | null
  /**
   * Las MISMAS filas de deuda pero SIN el recorte por fecha de emisión: la agenda de cobros próximos
   * mira para adelante y un período pasado la dejaría vacía justo cuando hay plata por entrar.
   * Con el período en su defecto es exactamente `documentos` (no se lee dos veces).
   */
  documentosParaAgenda: unknown[] | null
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
}

export const hoySanJuan = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' })

const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export async function getDatosAnaliticas(supabase: SupabaseClient, f: Filtros): Promise<DatosAnaliticas> {
  const hoy = hoySanJuan()
  const rango = rangoParaVista(f, hoy)
  const [panel, economia, costos, presupuestos] = await Promise.all([
    supabase.from('obra_panel').select('obra_id, nombre, cliente_id, cliente_slug, cliente_nombre, estado, n_comprobantes, avance_pct, orden, obra_padre_id'),
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

  const [egresos, nominaPagada, personas, documentos, cajaSheet, deuda] = await Promise.all([
    // LO QUE SALIÓ, CADA PAGO EN SU FECHA (dueño, 18/09/2026: criterio percibido, filtrable por fechas). Lo
    // pendiente y lo «Pagado» sin monto viajan también: se cuentan aparte. PAGINADO (D6): ~960 filas el 18/09.
    f.vista === 'caja' ? leerEgresosDeCaja(supabase, rango) : null,
    // LA NÓMINA ES LO PAGADO A LA GENTE, NO EL COSTO DE NÓMINA (dueño, 22/09/2026). Se arma en
    // `nominaPagada.ts` sobre la liquidación sellada y los recibos del estudio: `nomina_por_mes` ya no
    // se lee — mezclaba cargas sociales y publicaba un factor en vez de pesos desde agosto.
    f.vista === 'nomina' ? leerNominaPagada(supabase, Number(hoy.slice(0, 4))) : null,
    f.vista === 'nomina' ? supabase.from('personas').select('en_la_empresa, categoria').eq('es_prueba', false) : null,
    // LA ACCIÓN DEL DÍA SE DECIDE POR DOCUMENTO DE COBRANZAS (D10), la misma fuente del saldo y con el
    // mismo recorte por emisión que la cuenta corriente. Se lee de `cliente_cobranza`, la vista canónica
    // fila por fila (DEFINICIONES: «cobrado»): `public.cobranzas` es la réplica cruda y no se lee desde la
    // app. Paginado por `cobranza_id`, que es único: Cobranzas pasa las 1.000 filas.
    f.vista === 'cobranza' ? leerDeudaDeCobranzas(supabase, rango) : null,
    f.vista === 'caja' ? leerCajaSheet(supabase) : Promise.resolve<LecturaCaja>({ estado: 'no_leida' }),
    f.vista === 'caja' ? getDeuda(supabase) : null,
  ])
  // LA AGENDA NO SE RECORTA POR EL PERÍODO (dueño, 21/09/2026: «que me marque con claridad los cobros
  // próximos»): un cobro de octubre no está emitido en el período que se esté mirando y desaparecería.
  // Sin período apartado del defecto las dos lecturas son la misma fila por fila: no se lee dos veces.
  const recorta = rango.desde != null || rango.hasta != null
  const documentosParaAgenda = f.vista === 'cobranza' && recorta
    ? await leerDeudaDeCobranzas(supabase, { desde: null, hasta: null })
    : documentos
  return {
    hoy, rango, cartera, obras, sinObra, sinObraDetalle: sinObraCruda ?? new Map(),
    cajaSheet,
    deudaProveedores: deuda?.data ? { ...totalesDeuda(deuda.data.filas), truncado: deuda.data.truncado } : null,
    cuentaCorriente: Array.isArray(raiz?.cuenta_corriente) ? raiz.cuenta_corriente : null,
    egresos: egresos?.filas ?? null,
    criterioEgresos: egresos?.criterio ?? 'percibido',
    nominaPagada: nominaPagada ?? null,
    personas: personas?.data ?? null,
    documentos: documentos ?? null,
    documentosParaAgenda: documentosParaAgenda ?? null,
    motivoPresupuesto: lecturaPresupuestos.motivo,
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
  }
}

export type CriterioEgreso = 'percibido' | 'devengado'

/**
 * LO QUE SALIÓ, Y CON QUÉ CRITERIO SALIÓ.
 *
 * La fuente buena es `caja_egreso_percibido`: cada pago de Compras en la fecha en que se pagó (criterio
 * percibido, regla de oro 5). Vive en la migración 20260918T1500, que se aplica DESPUÉS de publicar esta
 * rama. Mientras no esté, en vez de dejar la vista muda se lee `egreso_por_area` —lo que la Caja mostraba
 * hasta hoy, por fecha del comprobante— y se devuelve `devengado` para que la pantalla lo DIGA. Dos
 * criterios distintos no se pueden dibujar iguales; tampoco se publica una pantalla en blanco.
 */
export async function leerEgresosDeCaja(
  supabase: SupabaseClient, rango: { desde: string | null; hasta: string | null },
): Promise<{ criterio: CriterioEgreso; filas: unknown[] | null }> {
  const acotar = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T, col: string): T => {
    let r = q
    if (rango.desde) r = r.gte(col, rango.desde)
    if (rango.hasta) r = r.lte(col, rango.hasta)
    return r
  }
  const sonda = await supabase.from('caja_egreso_percibido').select('fila').limit(1)
  if (!sonda.error) {
    return {
      criterio: 'percibido',
      filas: await leerPaginado((a, b) => acotar(supabase.from('caja_egreso_percibido').select('area, fecha_pago, monto, naturaleza, fila'), 'fecha_pago')
        .order('fecha_pago').order('fila').order('naturaleza').order('monto').range(a, b)),
    }
  }
  if (!SIN_RELACION.has(String(sonda.error.code))) return { criterio: 'percibido', filas: null }
  const viejas = await leerPaginado((a, b) => acotar(supabase.from('egreso_por_area').select('area, grupo, total, fecha'), 'fecha')
    .order('fecha').order('area').order('grupo').order('total').range(a, b))
  // Con la forma de `caja_egreso_percibido`, para que abajo haya UNA sola lectura: cada comprobante es
  // un «pago» en la fecha de su comprobante. No se inventa nada — el criterio viaja al lado.
  return {
    criterio: 'devengado',
    filas: viejas?.map((f) => {
      const r = f as Record<string, unknown>
      return { area: r.area, fecha_pago: r.fecha, monto: r.total, naturaleza: 'pago', fila: null }
    }) ?? null,
  }
}

/**
 * LA DEUDA VIVA DE COBRANZAS, fila por fila. Se lee de `cliente_cobranza`, la vista canónica
 * (DEFINICIONES: «cobrado»): `public.cobranzas` es la réplica cruda y no se lee desde la app.
 * Paginado por `cobranza_id`, que es único: Cobranzas pasa las 1.000 filas que corta PostgREST.
 *
 * `certificado_cliente` NO sirve acá: es un subconjunto y ya dejó a San Francisco «sin nada pendiente
 * hoy» con $ 26,6 M que vencían al día siguiente (auditoría 17/09/2026, D10).
 */
export function leerDeudaDeCobranzas(supabase: SupabaseClient, rango: { desde: string | null; hasta: string | null }) {
  return leerPaginado((a, b) => {
    let q = supabase.from('cliente_cobranza')
      .select('cobranza_id, cliente_id, estado, fecha_cobro, fecha_emision, total_bruto, obra_id, numero_comprobante, factura, concepto')
      .in('estado', ['Pendiente', 'Facturado']).not('cliente_id', 'is', null)
    if (rango.desde) q = q.gte('fecha_emision', rango.desde)
    if (rango.hasta) q = q.lte('fecha_emision', rango.hasta)
    return q.order('cobranza_id').range(a, b)
  })
}

/**
 * LO PAGADO A LA GENTE EN EL AÑO: la liquidación sellada y los recibos del estudio, sin una sola carga social.
 *
 * ═══ POR QUÉ `null` CUANDO NO HAY QUINCENAS ═══
 *
 * `liquidacion_quincena` y `recibo_sueldo_linea` tienen su propia puerta —`liquida_sueldos()`: dirección
 * y administración—, distinta de la de Analíticas (`ve_economia()`). Hoy los dos conjuntos coinciden,
 * pero el día que no coincidan la RLS devuelve una lista VACÍA, no un error: publicar «$ 0 pagado en el
 * año» sería la peor respuesta posible. Cero quincenas = no se pudo leer, y la pantalla lo dice.
 *
 * Paginado: `liquidacion_linea` va por 348 filas en 2026 y crece ~25 por quincena; el corte de 1.000 de
 * PostgREST llega en 2028 sin avisar.
 */
export async function leerNominaPagada(supabase: SupabaseClient, anio: number): Promise<NominaPagada | null> {
  const [quincenas, lineas, recibos, personas] = await Promise.all([
    supabase.from('liquidacion_quincena').select('id, desde, estado'),
    leerPaginado((a, b) => supabase.from('liquidacion_linea')
      .select('id, liquidacion_id, persona_id, cobra, cobra_manual').order('id').range(a, b)),
    leerPaginado((a, b) => supabase.from('recibo_sueldo_linea')
      .select('id, persona_id, periodo, neto').order('id').range(a, b)),
    supabase.from('persona_directorio').select('id, nombre_completo'),
  ])
  if (quincenas.error || !quincenas.data?.length || !lineas || !recibos) return null
  return pagoDeNomina({
    anio,
    quincenas: quincenas.data as FilaQuincena[],
    lineas: lineas as FilaLinea[],
    recibos: recibos as FilaRecibo[],
    personas: (personas.data ?? []) as FilaPersona[],
  })
}

/** «No existe la relación» en PostgREST (schema cache) o en Postgres: la migración del espejo no está aplicada. */
const SIN_RELACION = new Set(['PGRST205', '42P01'])

/**
 * LA PESTAÑA CAJA DESDE SU ESPEJO. Cuatro estados distintos porque se dibujan distinto: sin la
 * migración la app dice que el espejo no está publicado (la base no va adelante del código, y el
 * código puede ir adelante de la base); sin foto, que el sync no guardó ninguna; con foto, CAJA.
 */
export async function leerCajaSheet(supabase: SupabaseClient): Promise<LecturaCaja> {
  const [vigente, sync] = await Promise.all([
    supabase.from('caja_sheet_vigente').select('*').maybeSingle(),
    supabase.from('caja_sheet_sync').select('intento_en, ok, error').eq('id', 1).maybeSingle(),
  ])
  if (vigente.error) return SIN_RELACION.has(String(vigente.error.code)) ? { estado: 'sin_espejo' } : { estado: 'no_leida' }
  const foto = vigente.data ? leerFotoCaja(vigente.data) : null
  if (!foto) return { estado: 'sin_foto', error: sync.data && sync.data.ok === false ? String(sync.data.error ?? 'sin detalle') : null }
  return { estado: 'foto', foto }
}
