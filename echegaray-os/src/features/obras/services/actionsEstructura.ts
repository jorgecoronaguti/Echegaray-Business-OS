'use server'

// LA ESTRUCTURA DE LA OBRA, EDITADA DESDE EL PANEL DE LA TAREA (04) — dos acciones angostas.
//
// ═══ POR QUÉ NO SE REUSAN `crearActividad` NI `editarActividad` ═══
//
// El mismo motivo que ya está escrito en `actionsPlan.ts`: las dos validan el esquema en `partial`
// pero ESCRIBEN todos los campos del esquema, y ninguna de las dos conoce `actividad_padre_id`,
// `cantidad_objetivo`, `unidad` ni `metodo_avance`. Un frente creado con `crearActividad` nacería
// sin padre —o sea, no sería un frente— y una edición parcial con `editarActividad` le borraría a la
// actividad las fechas, las HH y el responsable sin que nadie lo pida.
//
// ═══ LOS TRIGGERS SON LA ÚLTIMA PALABRA, Y ACÁ SE LOS ANTICIPA CON UNA FRASE ═══
//
// `obra_actividad_arista_valida` y `obra_actividad_contenedor_con_hijas` van a rechazar igual lo que
// no corresponde. Lo que hacen los chequeos de abajo es traducir: «la actividad X ya es una subtarea:
// una subtarea no lleva subtareas» no le dice nada a un jefe de obra que apretó «Dividir en frentes».

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'
import { claveDeActividad } from './claves'
import { quitarDependencia } from './actions'
import { conservaLaCantidad, frentesDelTexto, motivoNoDividir, repartirOpcional } from './panelTarea'

export type ResultadoEstructura =
  | { ok: true; tocadas: number; mensaje: string }
  | { ok: false; error: string }

/** Falla CERRADA: sin perfil legible no se toca la estructura. Un error al leer el rol no es un
 *  permiso concedido. */
async function puedeEditarLaEstructura(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const perfil = await getPerfilActual(supabase)
  if (perfil.error || !perfil.data) return false
  return esAdministracion((perfil.data as { rol?: Rol | null }).rol ?? null)
}

const SIN_PERMISO = 'Cambiar la estructura de la obra es de Administración y de la jefatura de obra.'

// ── CAMBIAR LA RELACIÓN DE UNA DEPENDENCIA ───────────────────────────────────

const relacionSchema = z.object({
  tipo: z.enum(['FS', 'SS', 'FF', 'SF']),
  lag_dias: z.coerce.number().int().min(-365).max(365),
})

/**
 * CAMBIAR EL TIPO Y LA DEMORA DE UNA PRECEDENCIA QUE YA EXISTE.
 *
 * ═══ POR QUÉ UN UPDATE Y NO «QUITAR Y VOLVER A DECLARAR» ═══
 *
 * Quitar + agregar son dos escrituras sin transacción entre medio: si la segunda falla —un error de
 * red, un timeout, una policy— la precedencia queda BORRADA y nadie se entera hasta que el
 * cronograma deja de arrastrar. El update es una sola escritura y no puede dejar el grafo a medias.
 *
 * ═══ POR QUÉ NO SE VUELVE A CHEQUEAR EL CICLO ═══
 *
 * El ciclo lo producen las ARISTAS (quién habilita a quién), y esto no toca ninguna: origen y
 * destino quedan como estaban. Cambiar FS por SS o mover la demora no puede cerrar un círculo que
 * antes no existía. Lo que sí puede es volver el plan inconsistente con sus fechas, y eso es
 * legítimo: el motor lo va a seguir dibujando como lo que es.
 */
export async function cambiarRelacion(
  obraId: string, dependenciaId: string, form: FormData,
): Promise<ResultadoEstructura> {
  const parsed = relacionSchema.safeParse({
    tipo: form.get('tipo'),
    lag_dias: String(form.get('lag_dias') ?? '0').trim() || '0',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  if (!await puedeEditarLaEstructura(supabase)) return { ok: false, error: SIN_PERMISO }

  // `.select()` devuelve lo que QUEDÓ escrito: un 204 no prueba una escritura, y una fila que la
  // RLS no dejó tocar vuelve como lista vacía y no como error.
  const { data, error } = await supabase.from('obra_dependencia')
    .update({ tipo: parsed.data.tipo, lag_dias: parsed.data.lag_dias })
    .eq('id', dependenciaId).eq('obra_id', obraId)
    .select('id, tipo, lag_dias')
  if (error) return { ok: false, error: error.message }
  const fila = (data ?? [])[0]
  if (!fila) return { ok: false, error: 'Esa precedencia no es de esta obra' }

  revalidatePath(`/obras/${obraId}`)
  return {
    ok: true,
    tocadas: 1,
    mensaje: `La relación quedó en ${fila.tipo}${Number(fila.lag_dias) !== 0 ? ` con ${fila.lag_dias} d de demora` : ' sin demora'}.`,
  }
}

/**
 * QUITAR UNA PRECEDENCIA DESDE UN FORMULARIO.
 *
 * `quitarDependencia` (en `actions.ts`) recibe dos argumentos y ningún FormData —se escribió para un
 * botón sin campos— y `FormAccion` manda uno siempre. El adaptador vive acá en vez de cambiarle la
 * firma: la 07 ya la llama con dos argumentos, y agregarle un tercero obligaría a tocar una pantalla
 * que no está en juego. El permiso y la RLS los sigue haciendo cumplir la acción original.
 */
export async function quitarRelacion(
  obraId: string, dependenciaId: string, form: FormData,
): Promise<ResultadoEstructura> {
  // El formulario no lleva un solo campo: para quitar una precedencia alcanza con su id, que viene
  // atado por `bind` y no del navegador. Se recibe igual porque `FormAccion` manda uno siempre.
  void form
  const r = await quitarDependencia(obraId, dependenciaId)
  return r.ok
    ? { ok: true, tocadas: 1, mensaje: 'Precedencia quitada: esta actividad deja de esperar a la otra.' }
    : r
}

// ── DIVIDIR UNA ACTIVIDAD EN FRENTES ─────────────────────────────────────────

const frentesSchema = z.object({
  nombres: z.string().trim().min(1, 'Escribí los nombres de los frentes, separados por coma'),
})

/** Lo que hace falta saber de la actividad antes de partirla. */
const COLUMNAS_ACTIVIDAD = [
  'id', 'obra_id', 'nombre', 'tipo', 'seccion', 'orden', 'actividad_padre_id', 'archivada',
  'unidad', 'cantidad_objetivo', 'hh_plan', 'metodo_avance', 'analisis_id', 'tarea_tipo_id',
  'cotizacion_partida_id', 'partida_codigo', 'dias_plan', 'tiempo_tecnico', 'tope_frente',
].join(', ')

interface ActividadADividir {
  id: string
  nombre: string
  tipo: string
  seccion: string | null
  orden: number
  actividad_padre_id: string | null
  archivada: boolean
  unidad: string | null
  cantidad_objetivo: number | null
  hh_plan: number | null
  metodo_avance: string
  analisis_id: string | null
  tarea_tipo_id: string | null
  cotizacion_partida_id: string | null
  partida_codigo: string | null
  dias_plan: number | null
  tiempo_tecnico: boolean
  tope_frente: number | null
}

/**
 * CONVERTIR UNA ACTIVIDAD EN UN CONTENEDOR CON N FRENTES, repartiendo su cantidad.
 *
 * ═══ LA REGLA QUE MANDA: LA CANTIDAD SE CONSERVA O NO SE GENERA NADA ═══
 *
 * Es la misma de `convertir_partida_a_plan`, con la misma tolerancia (cuatro decimales) y la misma
 * consecuencia: si las partes no suman el total, no se escribe una sola fila. Partir 1,08 m³ en tres
 * frentes de 0,36 y que la obra quede con 1,07 es una fuga que no grita — nadie la busca hasta que
 * el cómputo no cierra contra el presupuesto, meses después.
 *
 * ═══ LOS CINCO PORTAZOS, Y POR QUÉ CADA UNO ═══
 *
 * 1. YA ES CONTENEDOR o es un HITO: no hay trabajo que repartir.
 * 2. YA TIENE HIJAS: partirla otra vez sería reescribir una estructura que alguien ya declaró.
 * 3. VIENE DE UNA PARTIDA (`cotizacion_partida_id`): los frentes de una partida los declara la
 *    conversión, que además es la dueña de la regla «la cantidad se conserva» contra la partida
 *    ORIGINAL. Partirla acá dejaría dos criterios sobre la misma cantidad.
 * 4. TIENE AVANCE REGISTRADO o PASOS: los dos hechos quedarían colgados de un contenedor, que es
 *    exactamente el defecto que `obra_ejecucion_sobre_contenedor` sale a denunciar en la 03.
 * 5. ES UNA SUBTAREA (su padre es ejecutable): `obra_actividad_arista_valida` la rechaza, porque una
 *    subtarea no lleva subtareas. Se dice con palabras antes de que lo diga Postgres.
 */
export async function dividirEnFrentes(
  obraId: string, actividadId: string, form: FormData,
): Promise<ResultadoEstructura> {
  const parsed = frentesSchema.safeParse({ nombres: String(form.get('nombres') ?? '') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const nombres = frentesDelTexto(parsed.data.nombres)
  if (nombres.length < 2) return { ok: false, error: 'Un frente solo no es una división: escribí al menos dos, separados por coma' }
  if (nombres.length > 20) return { ok: false, error: 'Veinte frentes es el tope: más que eso no es una división, es otra obra' }
  if (new Set(nombres.map((n) => n.toLowerCase())).size !== nombres.length) {
    return { ok: false, error: 'Hay dos frentes con el mismo nombre: no se podrían distinguir en la lista' }
  }
  if (nombres.some((n) => n.length < 2 || n.length > 120)) {
    return { ok: false, error: 'Cada frente necesita un nombre de entre 2 y 120 caracteres' }
  }

  const supabase = await createClient()
  if (!await puedeEditarLaEstructura(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data, error } = await supabase.from('obra_actividad')
    .select(COLUMNAS_ACTIVIDAD).eq('obra_id', obraId).eq('id', actividadId).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Esa actividad no es de esta obra' }
  const act = data as unknown as ActividadADividir

  const portazo = await porQueNoSePuedeDividir(supabase, act)
  if (portazo) return { ok: false, error: portazo }

  const cantidades = repartirOpcional(
    act.cantidad_objetivo == null ? null : Number(act.cantidad_objetivo), nombres.length,
  )
  const horas = repartirOpcional(act.hh_plan == null ? null : Number(act.hh_plan), nombres.length)
  if (act.cantidad_objetivo != null
      && !conservaLaCantidad(cantidades as number[], Number(act.cantidad_objetivo))) {
    return { ok: false, error: 'El reparto no conserva la cantidad de la actividad: no se generó nada' }
  }

  const { data: ultima } = await supabase.from('obra_actividad')
    .select('orden').eq('obra_id', obraId).order('orden', { ascending: false }).limit(1).maybeSingle()
  let orden = ((ultima?.orden as number) ?? 0) + 1

  const filas = nombres.map((frente, k) => ({
    obra_id: obraId,
    clave: claveDeActividad(act.seccion, `${act.nombre} · ${frente}`),
    seccion: act.seccion,
    nombre: `${act.nombre} · ${frente}`,
    tipo: 'tarea',
    orden: orden++,
    actividad_padre_id: act.id,
    unidad: act.unidad,
    cantidad_objetivo: cantidades[k],
    hh_plan: horas[k],
    metodo_avance: act.metodo_avance,
    analisis_id: act.analisis_id,
    tarea_tipo_id: act.tarea_tipo_id,
    partida_codigo: act.partida_codigo,
    // EL TOPE ES DEL FRENTE, NO DE LA ACTIVIDAD: cuántas personas entran a trabajar a la vez en ese
    // pedazo de obra. Cada frente hereda el mismo tope porque cada uno es un lugar distinto — dos
    // frentes de 4 son 8 personas trabajando, y ése es justamente el sentido de partirla.
    tope_frente: act.tope_frente,
    // EL TIEMPO TÉCNICO NO SE REPARTE: el hormigón cura dos días en cada frente, no un día en cada
    // uno. Los días de plan se copian SÓLO cuando son técnicos; si fueran la duración de la
    // actividad entera, copiarlos multiplicaría el plazo por la cantidad de frentes.
    tiempo_tecnico: act.tiempo_tecnico,
    dias_plan: act.tiempo_tecnico ? act.dias_plan : null,
    fuente: 'web',
    creada_en_web: true,
    editado_a_mano: true,
  }))

  const chocan = await clavesQueChocan(supabase, obraId, filas.map((f) => f.clave))
  if (chocan.length) {
    return { ok: false, error: `Ya hay una actividad llamada «${chocan[0]}» en esta obra: elegí otro nombre de frente` }
  }

  // EL PADRE PRIMERO. Al revés, las hijas nacerían colgadas de una actividad ejecutable —o sea,
  // como SUBTAREAS— y `obra_wbs` no las contaría como estructura: `es_contenedor` es `tipo =
  // 'resumen'`, y el rollup del avance sólo agrega debajo de un contenedor.
  //
  // SU CANTIDAD Y SUS HH NO SE BORRAN. Podría parecer que ahora duplican a las de sus frentes, pero
  // no: `aporteDe` (en `wbs.ts`) ignora los números PROPIOS de un contenedor y usa el agregado de
  // sus hijas, y `sumarHH` (en `dotacion.ts`) saltea las filas de tipo resumen. Borrarlas sería
  // destruir el total original —contra el que se compara que el reparto cerró— para arreglar un
  // problema que no existe.
  const { data: convertida, error: eTipo } = await supabase.from('obra_actividad')
    .update({ tipo: 'resumen', editado_a_mano: true })
    .eq('obra_id', obraId).eq('id', act.id).select('id, tipo')
  if (eTipo) return { ok: false, error: `No pude convertirla en contenedor: ${eTipo.message}` }
  if (!(convertida ?? []).length) return { ok: false, error: 'No pude convertirla en contenedor: la escritura no tocó ninguna fila' }

  const { data: creadas, error: eInsert } = await supabase.from('obra_actividad').insert(filas).select('id')
  if (eInsert || (creadas ?? []).length !== filas.length) {
    // SIN LOS FRENTES, EL CONTENEDOR NO TIENE SENTIDO: se vuelve al tipo original. Dejar una
    // actividad convertida en resumen y vacía la saca de todo total sin que nadie lo haya decidido.
    await supabase.from('obra_actividad').update({ tipo: act.tipo })
      .eq('obra_id', obraId).eq('id', act.id)
    return { ok: false, error: `No pude crear los frentes y dejé la actividad como estaba: ${eInsert?.message ?? 'la escritura volvió vacía'}` }
  }

  // SE LEE EL EFECTO, NO SE AFIRMA EL ÉXITO: cuántas hijas tiene de verdad después de escribir.
  const { count } = await supabase.from('obra_actividad')
    .select('id', { count: 'exact', head: true })
    .eq('obra_id', obraId).eq('actividad_padre_id', act.id)

  revalidatePath(`/obras/${obraId}`)
  return {
    ok: true,
    tocadas: creadas?.length ?? 0,
    mensaje: `«${act.nombre}» quedó como contenedor de ${count ?? creadas?.length} frentes${
      act.cantidad_objetivo != null
        ? `, repartiendo ${Number(act.cantidad_objetivo).toLocaleString('es-AR')} ${act.unidad ?? ''}`.trimEnd()
        : ''}.`,
  }
}

/**
 * EL PRIMER MOTIVO por el que esta actividad NO se puede dividir, en palabras. `null` = se puede.
 *
 * La REGLA es `motivoNoDividir` (pura, probada), la misma que usa el panel para no ofrecer el gesto.
 * Lo que agrega esta función son los HECHOS que la regla necesita y que sólo la base sabe: cuántas
 * hijas, cuántos avances, cuántos pasos y de qué tipo es el padre. Dos reglas escritas por separado
 * —una en la pantalla y otra acá— es cómo se llega a que el botón esté encendido y la escritura
 * falle, o peor: al revés.
 */
async function porQueNoSePuedeDividir(
  supabase: Awaited<ReturnType<typeof createClient>>, act: ActividadADividir,
): Promise<string | null> {
  if (act.archivada) return 'Esta actividad está archivada: primero hay que desarchivarla'

  const [hijas, avances, pasos, padre] = await Promise.all([
    supabase.from('obra_actividad').select('id', { count: 'exact', head: true })
      .eq('actividad_padre_id', act.id),
    supabase.from('obra_ejecucion').select('id', { count: 'exact', head: true })
      .eq('actividad_id', act.id),
    supabase.from('obra_actividad_paso').select('id', { count: 'exact', head: true })
      .eq('actividad_id', act.id),
    act.actividad_padre_id
      ? supabase.from('obra_actividad').select('tipo').eq('id', act.actividad_padre_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const motivo = motivoNoDividir({
    esContenedor: act.tipo === 'resumen',
    tieneHijas: (hijas.count ?? 0) > 0,
    tipo: act.tipo,
    cotizacionPartidaId: act.cotizacion_partida_id,
    nAvances: avances.count ?? 0,
    nPasos: pasos.count ?? 0,
    tipoPadre: (padre.data as { tipo?: string } | null)?.tipo ?? null,
  })
  return motivo == null ? null : `Esta actividad ${motivo}`
}

/** Las claves que ya existen en la obra. La clave sale del CONTENIDO (sección + nombre), igual que
 *  la del sincronizador de Drive: dos frentes con el mismo nombre chocarían contra el índice único
 *  a mitad del insert y dejarían la actividad convertida y a medio partir. */
async function clavesQueChocan(
  supabase: Awaited<ReturnType<typeof createClient>>, obraId: string, claves: string[],
): Promise<string[]> {
  const { data } = await supabase.from('obra_actividad')
    .select('nombre, clave').eq('obra_id', obraId).in('clave', claves)
  return (data ?? []).map((f) => String((f as { nombre: string }).nombre))
}
