// BASE MAESTRA · RECURSOS — el acceso a datos de la pantalla 18.
//
// Cuatro sub-vistas leen de tres fuentes distintas y ninguna recalcula lo que Postgres ya calculó:
//
//   Insumos / Equipos      `recurso_costo` — YA aplica el desperdicio (`costo × (1 + desperdicio)`)
//   Mano de obra           `uocra_escala` (el jornal real) + `carga_social_vigente` + `categoria_obra`
//   Versiones de precio    `recurso_precio`, agrupado por fecha y fuente
//
// ═══ EL COSTO EMPRESA SE CALCULA, NO SE TIPEA ═══
//
// Está escrito literal en el subtítulo de la pantalla y es lo que la hace auditable: sale del básico
// del convenio y de las cargas vigentes, cada uno con su fecha y su fuente. La cuenta vive en
// `reglas.ts` (`costoDeCategoria`), probada; acá sólo se juntan los insumos de esa cuenta.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CargaSocialFila, CategoriaManoObra, FichaRecurso, MetaRecursos, Plantilla, PrecioHistorico,
  RecursoFila, ServiceResult, UsoDeRecurso, VersionPrecio,
} from '../types'
import {
  JORNADA_HORAS, claveDeCategoria, contarPorCategoria, costoDeCategoria, frescuraDePrecio, sumaDeCargas,
} from './reglas'

type Fila = Record<string, unknown>
const n = (v: unknown): number | null => (v == null ? null : Number(v))
const s = (v: unknown): string | null => (v == null ? null : String(v))

/** `hoy` entra por parámetro: la frescura es una función del calendario y así se puede probar. */
export async function getRecursos(
  supabase: SupabaseClient,
  hoyISO: string,
): Promise<ServiceResult<RecursoFila[]>> {
  const { data, error } = await supabase.from('recurso_costo').select('*').eq('activo', true).order('codigo')
  if (error) return { data: null, error: error.message }
  return { data: ((data ?? []) as Fila[]).map((r) => aRecurso(r, hoyISO)), error: null }
}

function aRecurso(r: Fila, hoyISO: string): RecursoFila {
  return {
    recurso_id: String(r.recurso_id),
    codigo: String(r.codigo),
    nombre: String(r.nombre),
    unidad: String(r.unidad),
    tipo: String(r.tipo) as RecursoFila['tipo'],
    familia: s(r.familia),
    division: s(r.division),
    desperdicio: Number(r.desperdicio ?? 0),
    activo: Boolean(r.activo),
    costo_base: n(r.costo_base),
    costo_con_desperdicio: n(r.costo_con_desperdicio),
    fecha_precio: s(r.fecha_precio),
    fuente: s(r.fuente),
    proveedor: s(r.proveedor),
    frescura: frescuraDePrecio(s(r.fecha_precio), hoyISO),
  }
}

/**
 * LA FICHA DE UN RECURSO — qué vale, cómo llegó a valer eso, y a qué le pega si cambia.
 *
 * ═══ TRES LECTURAS SIMPLES EN VEZ DE UNA CON EMBEDS ═══
 *
 * El uso se arma con `analisis_linea` → `analisis` (sólo la versión vigente) → `tarea_tipo`, cada
 * una por su lado y emparejadas en memoria. Es el mismo criterio que `getTareasTipo`: un `select`
 * anidado depende del nombre exacto de la relación y falla en tiempo de ejecución, no de compilado.
 *
 * ═══ EL HISTORIAL NO SE PIDE SIN PERMISO ═══
 *
 * `recurso_precio` es `ve_economia()` y a un jefe de obra le devuelve CERO FILAS sin error — igual
 * que un recurso que nunca tuvo precio. Por eso ni se consulta, y la ficha publica
 * `historial_visible: false`: la pantalla tiene que poder escribir «sin permiso» y no «sin
 * historial», que es la mentira que manda a alguien a cargar precios que ya están cargados.
 */
export async function getFichaRecurso(
  supabase: SupabaseClient,
  recursoId: string,
  hoyISO: string,
  economia: boolean,
): Promise<ServiceResult<FichaRecurso>> {
  const { data, error } = await supabase
    .from('recurso_costo').select('*').eq('recurso_id', recursoId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'Ese recurso no existe o no está activo' }

  const avisos: string[] = []
  const [historial, usos] = await Promise.all([
    economia ? getHistorial(supabase, recursoId, avisos) : Promise.resolve([]),
    getUsoDelRecurso(supabase, recursoId, avisos),
  ])

  return {
    data: { recurso: aRecurso(data as Fila, hoyISO), historial, historial_visible: economia, usos, avisos },
    error: null,
  }
}

/** El historial, del más nuevo al más viejo, con la variación contra el precio ANTERIOR de la lista. */
async function getHistorial(
  supabase: SupabaseClient, recursoId: string, avisos: string[],
): Promise<PrecioHistorico[]> {
  const { data, error } = await supabase
    .from('recurso_precio').select('costo, fecha_precio, fuente, proveedor, vigente')
    .eq('recurso_id', recursoId)
    .order('fecha_precio', { ascending: false, nullsFirst: false })
  if (error) { avisos.push(`No pude leer el historial de precio: ${error.message}`); return [] }

  const filas = (data ?? []) as Fila[]
  return filas.map((p, i): PrecioHistorico => {
    const costo = n(p.costo)
    const anterior = n(filas[i + 1]?.costo)
    return {
      costo,
      fecha_precio: s(p.fecha_precio),
      fuente: s(p.fuente),
      proveedor: s(p.proveedor),
      vigente: p.vigente === true,
      // LA VARIACIÓN ES CONTRA EL PRECIO ANTERIOR REAL, NO CONTRA UNA VENTANA FIJA. El mockup dice
      // «+38 % vs febrero»; acá no hay ningún febrero garantizado, y un porcentaje contra un mes que
      // puede no tener carga sería un número sin referente. Dividir por 0 tampoco: sería infinito.
      variacion: costo == null || anterior == null || anterior === 0 ? null : costo / anterior - 1,
    }
  })
}

/**
 * DÓNDE ENTRA ESTE RECURSO. Sólo la versión VIGENTE de cada análisis: las históricas siguen
 * existiendo —la base maestra nunca borra historia— pero cambiar un precio hoy no le pega a un
 * análisis que ya no cotiza nada.
 */
async function getUsoDelRecurso(
  supabase: SupabaseClient, recursoId: string, avisos: string[],
): Promise<UsoDeRecurso[]> {
  const lineas = await supabase.from('analisis_linea').select('analisis_id, cantidad').eq('recurso_id', recursoId)
  if (lineas.error) { avisos.push(`No pude leer dónde se usa: ${lineas.error.message}`); return [] }
  const ids = [...new Set(((lineas.data ?? []) as Fila[]).map((l) => String(l.analisis_id)))]
  if (!ids.length) return []

  const analisis = await supabase.from('analisis').select('id, tarea_tipo_id').eq('vigente', true).in('id', ids)
  if (analisis.error) { avisos.push(`No pude leer los análisis: ${analisis.error.message}`); return [] }
  const tareaPorAnalisis = new Map<string, string>()
  for (const a of ((analisis.data ?? []) as Fila[])) tareaPorAnalisis.set(String(a.id), String(a.tarea_tipo_id))
  if (!tareaPorAnalisis.size) return []

  const tareas = await supabase.from('tarea_tipo').select('id, codigo, nombre, unidad')
    .in('id', [...new Set(tareaPorAnalisis.values())])
  if (tareas.error) { avisos.push(`No pude leer las tareas tipo: ${tareas.error.message}`); return [] }
  const porTarea = new Map<string, Fila>()
  for (const t of ((tareas.data ?? []) as Fila[])) porTarea.set(String(t.id), t)

  const filas: UsoDeRecurso[] = []
  for (const l of ((lineas.data ?? []) as Fila[])) {
    const tareaId = tareaPorAnalisis.get(String(l.analisis_id))
    const t = tareaId ? porTarea.get(tareaId) : undefined
    if (!t) continue
    filas.push({
      tarea_tipo_id: String(t.id), codigo: String(t.codigo), nombre: String(t.nombre),
      unidad_tarea: String(t.unidad), cantidad: Number(l.cantidad),
    })
  }
  return filas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))
}

/**
 * LA MANO DE OBRA — el jornal sale del convenio, no de una columna que alguien tipeó.
 *
 * Se toma la vigencia MÁS RECIENTE que ya empezó. Tomar el máximo a secas publicaría una escala
 * futura como si rigiera hoy; tomar la primera publicaría la de 2022. `uocra_escala` tiene 115 filas
 * justamente porque guarda la historia.
 *
 * ADVERTENCIA QUE VIAJA CON EL DATO: esta tabla la alimentaba un IMPORTHTML de una pestaña que ya no
 * existe, así que HOY NO SE ACTUALIZA SOLA. Por eso la pantalla muestra la fecha de vigencia y su
 * fuente al lado del número: un jornal sin fecha es indefendible.
 */
export async function getManoDeObra(
  supabase: SupabaseClient,
  hoyISO: string,
  // La escala UOCRA es paritaria pública, pero el server no le manda plata al navegador de quien
  // no ve economía: la UI ya la escondía con un `if` — esconder no es no mandar (auditoría 21/08).
  economia: boolean = true,
  jornadaHoras: number = JORNADA_HORAS,
): Promise<ServiceResult<{ categorias: CategoriaManoObra[]; cargas: CargaSocialFila[]; meta: Pick<MetaRecursos, 'escala_vigente' | 'escala_fuente' | 'cargas_vigencia' | 'cargas_total' | 'jornada_horas'> }>> {
  const [escala, cargas, categorias, personas] = await Promise.all([
    supabase.from('uocra_escala').select('*').lte('vigencia_desde', hoyISO)
      .order('vigencia_desde', { ascending: false }),
    supabase.from('carga_social_vigente').select('*').order('porcentaje', { ascending: false }),
    supabase.from('categoria_obra').select('*').eq('activa', true).order('orden'),
    // QUIÉN ESTÁ SE PREGUNTA POR `en_la_empresa`, NO POR LA FECHA DE EGRESO. Es la misma regla que
    // ya usa `personasService`: de los legajos fuera de la empresa, la mayoría no tiene fecha de
    // egreso cargada, así que `fecha_egreso is null` los cuenta a todos como plantel activo.
    supabase.from('personas').select('categoria').eq('en_la_empresa', true),
  ])
  if (escala.error) return { data: null, error: escala.error.message }
  if (categorias.error) return { data: null, error: categorias.error.message }

  const filasEscala = (escala.data ?? []) as Fila[]
  const vigenciaDesde = filasEscala.length ? String(filasEscala[0].vigencia_desde) : null
  const deLaVigencia = filasEscala.filter((f) => String(f.vigencia_desde) === vigenciaDesde)

  const filasCargas: CargaSocialFila[] = ((cargas.data ?? []) as Fila[]).map((c) => ({
    concepto: String(c.concepto),
    porcentaje: Number(c.porcentaje),
    vigencia_desde: String(c.vigencia_desde),
    fuente: s(c.fuente),
  }))
  const totalCargas = sumaDeCargas(filasCargas.map((c) => ({ porcentaje: c.porcentaje })))

  // Cuántas personas hay hoy en cada categoría. `personas.categoria` usa las MISMAS claves que
  // `categoria_obra` — no es un catálogo paralelo. Las personas sin categoría cargada no se
  // reparten entre las cuatro: quedan afuera, porque asignarlas inventaría un plantel.
  const porCategoria = contarPorCategoria((personas.data ?? []) as Fila[])
  const capacidadPorClave = new Map<string, number>()
  const nombrePorClave = new Map<string, string>()
  for (const c of ((categorias.data ?? []) as Fila[])) {
    capacidadPorClave.set(String(c.clave), Number(c.capacidad))
    nombrePorClave.set(String(c.clave), String(c.nombre))
  }

  const filas = deLaVigencia.map((e): CategoriaManoObra => {
    const clave = claveDeCategoria(String(e.categoria))
    const costo = costoDeCategoria(n(e.basico_hora), totalCargas, jornadaHoras)
    return {
      clave,
      nombre: nombrePorClave.get(clave) ?? String(e.categoria),
      nombre_convenio: String(e.categoria),
      basico_hora: economia ? n(e.basico_hora) : null,
      mensual: economia ? n(e.mensual) : null,
      jornal: economia ? costo.jornal : null,
      valor_hora: economia ? costo.valorHora : null,
      cargas_hora: costo.cargasHora,
      costo_empresa_hora: costo.costoEmpresaHora,
      capacidad: capacidadPorClave.get(clave) ?? null,
      personas: porCategoria.get(clave) ?? 0,
    }
  })
  // Orden de obra (oficial especializado → ayudante); lo que no está en `categoria_obra` va al final.
  const orden = [...capacidadPorClave.keys()]
  filas.sort((a, b) => (indice(orden, a.clave) - indice(orden, b.clave)) || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    data: {
      categorias: filas,
      cargas: filasCargas,
      meta: {
        escala_vigente: vigenciaDesde,
        escala_fuente: filasEscala.length ? s(filasEscala[0].fuente) : null,
        cargas_vigencia: filasCargas.length ? filasCargas[0].vigencia_desde : null,
        cargas_total: totalCargas,
        jornada_horas: jornadaHoras,
      },
    },
    error: null,
  }
}

const indice = (arr: string[], v: string) => {
  const i = arr.indexOf(v)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/**
 * LAS VERSIONES DE PRECIO. `recurso_precio` no tiene una entidad «versión»: tiene precios sueltos
 * con fecha y fuente. Una versión ES ese par (fecha, fuente) — así se cargó una lista entera de
 * proveedor o una actualización de convenio.
 *
 * NO SE CALCULA UNA «VARIACIÓN %». Con precios de recursos distintos en cada tanda, un promedio de
 * variaciones no significa nada, y el contrato la marca como opcional (`—`). Preferimos la columna
 * vacía a un porcentaje que nadie pueda explicar.
 */
export async function getVersionesDePrecio(
  supabase: SupabaseClient,
  hoyISO: string,
): Promise<ServiceResult<VersionPrecio[]>> {
  const { data, error } = await supabase
    .from('recurso_precio').select('fecha_precio, fuente, proveedor, vigente')
    .order('fecha_precio', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  const grupos = new Map<string, VersionPrecio>()
  for (const p of ((data ?? []) as Fila[])) {
    const fecha = s(p.fecha_precio)
    const fuente = s(p.fuente)
    const clave = `${fecha ?? 'sin-fecha'}||${fuente ?? 'sin-fuente'}`
    const g = grupos.get(clave) ?? {
      fecha, fuente, proveedor: s(p.proveedor), n_recursos: 0, vigentes: 0,
      frescura: frescuraDePrecio(fecha, hoyISO),
    }
    g.n_recursos += 1
    if (p.vigente === true) g.vigentes += 1
    grupos.set(clave, g)
  }
  const filas = [...grupos.values()].sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')))
  return { data: filas, error: null }
}

/** LAS PLANTILLAS DE SECUENCIA, con sus pasos ordenados. */
export async function getPlantillas(supabase: SupabaseClient): Promise<ServiceResult<Plantilla[]>> {
  const { data, error } = await supabase
    .from('plantilla_secuencia')
    .select('id, nombre, descripcion, se_repite_por, activa, plantilla_paso(orden, nombre, peso, tiempo_tecnico, dias_tecnicos)')
    .order('nombre')
  if (error) return { data: null, error: error.message }
  const filas = ((data ?? []) as Fila[]).map((p): Plantilla => ({
    id: String(p.id),
    nombre: String(p.nombre),
    descripcion: s(p.descripcion),
    se_repite_por: (p.se_repite_por as string[]) ?? null,
    activa: Boolean(p.activa),
    pasos: ((p.plantilla_paso ?? []) as Fila[])
      .map((x) => ({
        orden: Number(x.orden), nombre: String(x.nombre), peso: Number(x.peso),
        tiempo_tecnico: Boolean(x.tiempo_tecnico), dias_tecnicos: n(x.dias_tecnicos),
      }))
      .sort((a, b) => a.orden - b.orden),
  }))
  return { data: filas, error: null }
}

/** Los contadores del subtítulo. Se derivan de las filas ya leídas: cero consultas extra. */
export function contarRecursos(filas: RecursoFila[]): Pick<MetaRecursos, 'n_insumos' | 'n_familias' | 'n_equipos' | 'n_sin_precio'> {
  const insumos = filas.filter((f) => f.tipo === 'material')
  return {
    n_insumos: insumos.length,
    n_familias: new Set(insumos.map((f) => f.familia).filter(Boolean)).size,
    n_equipos: filas.filter((f) => f.tipo === 'equipo').length,
    n_sin_precio: filas.filter((f) => f.costo_base == null).length,
  }
}
