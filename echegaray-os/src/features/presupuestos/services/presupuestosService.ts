// PRESUPUESTOS — EL ACCESO A DATOS. Cero aritmética propia.
//
// Todo lo económico sale de `cotizacion_cascada` y `cotizacion_partida_valorizada`, que son las
// vistas que la migración creó para que la cascada exista UNA sola vez. Este archivo lee, normaliza
// el tipo en el borde y devuelve. No suma, no multiplica, no aplica un porcentaje.
//
// ═══ EL BORDE NORMALIZA, EL ADENTRO CONFÍA ═══
//
// PostgREST emite los `numeric` como número JSON, pero un `select *` sobre una vista que todavía no
// tenga una columna NO falla: simplemente no la trae, y un `undefined` colado donde el tipo promete
// `number | null` hace que la pantalla decida por comparación contra `null` y muestre cualquier
// cosa. Se normaliza acá, una vez, con el mismo criterio que `clientesService`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/obras/types'
import type {
  EstadoPresupuesto, LineaComposicion, ParametroComercial, PartidaValorizada, PresupuestoCascada,
  RendimientoRecomendado,
} from '../types'
import { aNumero } from './formato'
import { desdeCongelada, desdeViva, type FilaCongelada, type FilaViva } from './composicion'

type Fila = Record<string, unknown>

const txt = (v: unknown): string | null => (v == null ? null : String(v))
const num = (v: unknown): number | null => aNumero(v)
const ent = (v: unknown): number => aNumero(v) ?? 0
const bool = (v: unknown): boolean => v === true

function aCascada(r: Fila): PresupuestoCascada {
  return {
    id: String(r.id),
    numero: txt(r.numero),
    version: ent(r.version),
    vigente: bool(r.vigente),
    estado: (txt(r.estado) ?? 'borrador') as EstadoPresupuesto,
    cliente: txt(r.cliente),
    cliente_id: txt(r.cliente_id),
    obra_nombre: txt(r.obra_nombre),
    obra_canonica_id: txt(r.obra_canonica_id),
    fecha_cotizacion: txt(r.fecha_cotizacion),
    congelada_en: txt(r.congelada_en),
    convertida_obra_id: txt(r.convertida_obra_id),
    parametro_comercial_id: txt(r.parametro_comercial_id),
    pct_gastos_generales: num(r.pct_gastos_generales) ?? 0,
    pct_beneficio: num(r.pct_beneficio) ?? 0,
    pct_financiero: num(r.pct_financiero) ?? 0,
    factor_financiero: num(r.factor_financiero) ?? 0,
    pct_iibb: num(r.pct_iibb) ?? 0,
    pct_ganancias: num(r.pct_ganancias) ?? 0,
    pct_cheque: num(r.pct_cheque) ?? 0,
    pct_iva: num(r.pct_iva) ?? 0,
    costo_directo: num(r.costo_directo),
    hh_previstas: num(r.hh_previstas),
    n_partidas: ent(r.n_partidas),
    n_sin_analisis: ent(r.n_sin_analisis),
    n_sin_computo: ent(r.n_sin_computo),
    n_sin_precio_subcontrato: ent(r.n_sin_precio_subcontrato),
    gastos_generales: num(r.gastos_generales),
    costo_industrial: num(r.costo_industrial),
    beneficio: num(r.beneficio),
    financiero: num(r.financiero),
    iibb: num(r.iibb),
    ganancias: num(r.ganancias),
    subtotal: num(r.subtotal),
    impuesto_cheque: num(r.impuesto_cheque),
    venta_sin_iva: num(r.venta_sin_iva),
    iva: num(r.iva),
    venta_final: num(r.venta_final),
    coeficiente_sin_iva: num(r.coeficiente_sin_iva),
    coeficiente_con_iva: num(r.coeficiente_con_iva),
    precio_venta: num(r.precio_venta),
    margen_sobre_precio_pct: num(r.margen_sobre_precio_pct),
  }
}

/**
 * EL PARÁMETRO COMERCIAL VIGENTE — los ocho porcentajes con los que nace un presupuesto nuevo.
 *
 * Se lee de la base y no se tipea en el formulario: los valores «de la empresa» vivían en un
 * `defaultValue` de un componente de React —sin historial, invisibles para el chat, y editables por
 * quien tocara el `.tsx`—. Si la tabla estuviera vacía devuelve `null` y la pantalla lo dice: un
 * default inventado en el front sería volver exactamente al problema.
 */
export async function getParametroComercialVigente(
  supabase: SupabaseClient,
): Promise<ParametroComercial | null> {
  const { data } = await supabase.from('parametro_comercial').select('*').eq('vigente', true).maybeSingle()
  if (!data) return null
  const r = data as Fila
  return {
    id: String(r.id),
    version: ent(r.version),
    pct_gastos_generales: num(r.pct_gastos_generales) ?? 0,
    pct_beneficio: num(r.pct_beneficio) ?? 0,
    pct_financiero: num(r.pct_financiero) ?? 0,
    factor_financiero: num(r.factor_financiero) ?? 0,
    pct_iibb: num(r.pct_iibb) ?? 0,
    pct_ganancias: num(r.pct_ganancias) ?? 0,
    pct_cheque: num(r.pct_cheque) ?? 0,
    pct_iva: num(r.pct_iva) ?? 0,
    fuente: String(r.fuente ?? ''),
    notas: txt(r.notas),
  }
}

function aPartida(r: Fila): PartidaValorizada {
  const metodo = txt(r.metodo_medicion)
  return {
    partida_id: String(r.partida_id),
    cotizacion_id: String(r.cotizacion_id),
    orden: ent(r.orden),
    rubro: txt(r.rubro),
    codigo: txt(r.codigo),
    descripcion: txt(r.descripcion) ?? '',
    cantidad: num(r.cantidad),
    unidad: txt(r.unidad),
    tarea_tipo_id: txt(r.tarea_tipo_id),
    analisis_id: txt(r.analisis_id),
    metodo_medicion: metodo === 'cantidad' || metodo === 'pasos' || metodo === 'manual' ? metodo : null,
    subcontratada: bool(r.subcontratada),
    precio_subcontrato: num(r.precio_subcontrato),
    congelada: bool(r.congelada),
    costo_unitario: num(r.costo_unitario),
    hs_unitarias: num(r.hs_unitarias),
    subtotal: num(r.subtotal),
    hh: num(r.hh),
    sin_analisis: bool(r.sin_analisis),
  }
}

/**
 * LA CARTERA: una fila por presupuesto VIGENTE.
 *
 * Las versiones anteriores existen y se abren desde adentro del presupuesto. Traerlas acá sumaría
 * cuatro veces la misma obra en el KPI de cotizado — el índice único `cotizaciones_una_vigente`
 * garantiza que hay exactamente una por número.
 */
export async function getCartera(supabase: SupabaseClient): Promise<ServiceResult<PresupuestoCascada[]>> {
  const { data, error } = await supabase
    .from('cotizacion_cascada')
    .select('*')
    .eq('vigente', true)
    .order('fecha_cotizacion', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []).map((r) => aCascada(r as Fila)), error: null }
}

export async function getPresupuesto(
  supabase: SupabaseClient, id: string,
): Promise<ServiceResult<PresupuestoCascada>> {
  const { data, error } = await supabase.from('cotizacion_cascada').select('*').eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  // SIN FILA NO ES «SIN DATOS». `cotizacion_partida` está cerrada a `ve_economia()`, y una lectura
  // que no devuelve nada puede ser un presupuesto inexistente o un permiso que falta. La pantalla
  // distingue los dos casos con el rol; acá se dice lo que se sabe.
  if (!data) return { data: null, error: `No existe el presupuesto ${id}, o no tenés permiso para verlo.` }
  return { data: aCascada(data as Fila), error: null }
}

/** Las versiones del mismo número, de la más nueva a la más vieja. Sin número, sólo ella misma. */
export async function getVersiones(
  supabase: SupabaseClient, numero: string | null,
): Promise<ServiceResult<PresupuestoCascada[]>> {
  if (!numero) return { data: [], error: null }
  const { data, error } = await supabase
    .from('cotizacion_cascada').select('*').eq('numero', numero).order('version', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []).map((r) => aCascada(r as Fila)), error: null }
}

export async function getPartidas(
  supabase: SupabaseClient, cotizacionId: string,
): Promise<ServiceResult<PartidaValorizada[]>> {
  const { data, error } = await supabase
    .from('cotizacion_partida_valorizada')
    .select('*')
    .eq('cotizacion_id', cotizacionId)
    .order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []).map((r) => aPartida(r as Fila)), error: null }
}

export async function getPartida(
  supabase: SupabaseClient, partidaId: string,
): Promise<ServiceResult<PartidaValorizada>> {
  const { data, error } = await supabase
    .from('cotizacion_partida_valorizada').select('*').eq('partida_id', partidaId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: `No existe la partida ${partidaId}, o no tenés permiso para verla.` }
  return { data: aPartida(data as Fila), error: null }
}

export interface Composicion {
  lineas: LineaComposicion[]
  /** De dónde salió: la copia del día que salió la oferta, o la base maestra de hoy. */
  origen: 'congelada' | 'viva' | 'sin_analisis'
}

/**
 * LA COMPOSICIÓN, del lado que corresponda.
 *
 * Congelada → la copia. Viva → la base maestra. La decisión la toma `partida.congelada`, que sale
 * de la vista y mira `cotizaciones.congelada_en`: no se decide por si la copia tiene filas, porque
 * un presupuesto congelado cuyas partidas no tenían análisis TAMBIÉN tiene cero filas copiadas, y
 * ahí caer a la base maestra mostraría precios de hoy en una oferta de hace dos años.
 */
export async function getComposicion(
  supabase: SupabaseClient, partida: PartidaValorizada,
): Promise<ServiceResult<Composicion>> {
  if (partida.congelada) {
    const { data, error } = await supabase
      .from('cotizacion_partida_composicion')
      .select('orden, recurso_codigo, recurso_nombre, unidad, tipo, cantidad, costo_unitario, desperdicio, fecha_precio')
      .eq('partida_id', partida.partida_id)
      .order('orden', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: { lineas: desdeCongelada((data ?? []) as unknown as FilaCongelada[]), origen: 'congelada' }, error: null }
  }
  if (!partida.analisis_id) return { data: { lineas: [], origen: 'sin_analisis' }, error: null }

  // DOS LECTURAS Y NO UN `embed`. `recurso_costo` es una VISTA, y el recurso embebido depende de
  // que PostgREST infiera la relación a través de ella. Cuando no la infiere no devuelve un error
  // claro: devuelve las líneas con el recurso en `null`, y la composición se dibuja entera como
  // «recurso no encontrado» sin que nada falle. Dos lecturas y un `Map` no pueden fallar así.
  const { data: lineas, error: eL } = await supabase
    .from('analisis_linea')
    .select('orden, cantidad, recurso_id')
    .eq('analisis_id', partida.analisis_id)
    .order('orden', { ascending: true })
  if (eL) return { data: null, error: eL.message }
  const ids = [...new Set((lineas ?? []).map((l) => String((l as Fila).recurso_id)))]
  if (ids.length === 0) return { data: { lineas: [], origen: 'viva' }, error: null }

  const { data: recursos, error: eR } = await supabase
    .from('recurso_costo')
    .select('recurso_id, codigo, nombre, unidad, tipo, costo_con_desperdicio, desperdicio, fecha_precio')
    .in('recurso_id', ids)
  if (eR) return { data: null, error: eR.message }
  const porId = new Map((recursos ?? []).map((x) => [String((x as Fila).recurso_id), x as Fila]))

  const filas: FilaViva[] = (lineas ?? []).map((x) => {
    const l = x as Fila
    const r = porId.get(String(l.recurso_id))
    return {
      orden: num(l.orden),
      cantidad: num(l.cantidad),
      recurso: r
        ? {
            codigo: txt(r.codigo), nombre: txt(r.nombre) ?? '', unidad: txt(r.unidad),
            tipo: txt(r.tipo), costo_con_desperdicio: num(r.costo_con_desperdicio),
            desperdicio: num(r.desperdicio), fecha_precio: txt(r.fecha_precio),
          }
        : null,
    }
  })
  return { data: { lineas: desdeViva(filas), origen: 'viva' }, error: null }
}

/**
 * EL RENDIMIENTO OBSERVADO CONTRA EL COTIZADO — el bloque «Contra el histórico» de la pantalla 16.
 *
 * `hs_recomendado` es `null` con menos de dos obras medidas, y eso NO es un error: la vista lo dice
 * con todas las letras («muestra chica: es un dato, no una recomendación»). Un promedio de una sola
 * obra presentado como recomendación es exactamente cómo una casualidad se vuelve política.
 */
export async function getRendimiento(
  supabase: SupabaseClient, tareaTipoId: string | null,
): Promise<ServiceResult<RendimientoRecomendado | null>> {
  if (!tareaTipoId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('rendimiento_recomendado').select('*').eq('tarea_tipo_id', tareaTipoId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  const r = data as Fila
  return {
    data: {
      tarea_tipo_id: String(r.tarea_tipo_id),
      codigo: txt(r.codigo) ?? '',
      nombre: txt(r.nombre) ?? '',
      unidad: txt(r.unidad) ?? '',
      hs_analisis: num(r.hs_analisis),
      muestra: ent(r.muestra),
      obras: ent(r.obras),
      hs_observado_promedio: num(r.hs_observado_promedio),
      hs_observado_mediana: num(r.hs_observado_mediana),
      dispersion: num(r.dispersion),
      hs_recomendado: num(r.hs_recomendado),
      lectura: txt(r.lectura) ?? 'sin dato',
    },
    error: null,
  }
}

export interface OpcionTarea {
  tarea_tipo_id: string
  analisis_id: string | null
  codigo: string
  nombre: string
  unidad: string
  hs_unitarias: number | null
  costo_directo: number | null
}

/**
 * LAS TAREAS TIPO CON ANÁLISIS VIGENTE, para elegir al cargar una partida.
 *
 * Sale de `analisis_costo` filtrado por `vigente`: elegir una versión que no es la vigente sería
 * cotizar con un análisis que la empresa ya reemplazó.
 */
export async function getTareasCotizables(supabase: SupabaseClient): Promise<ServiceResult<OpcionTarea[]>> {
  const { data, error } = await supabase
    .from('analisis_costo')
    .select('analisis_id, tarea_tipo_id, codigo, nombre, unidad, hs_unitarias, costo_directo, vigente')
    .eq('vigente', true)
    .order('codigo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((x) => {
      const r = x as Fila
      return {
        tarea_tipo_id: String(r.tarea_tipo_id),
        analisis_id: txt(r.analisis_id),
        codigo: txt(r.codigo) ?? '',
        nombre: txt(r.nombre) ?? '',
        unidad: txt(r.unidad) ?? '',
        hs_unitarias: num(r.hs_unitarias),
        costo_directo: num(r.costo_directo),
      }
    }),
    error: null,
  }
}
