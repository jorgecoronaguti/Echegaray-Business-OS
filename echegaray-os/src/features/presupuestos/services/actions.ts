'use server'

// PRESUPUESTOS — LAS ACCIONES QUE ESCRIBEN. Toda entrada pasa por Zod antes de tocar la base.
//
// ═══ ESTA CAPA ES LA PUERTA, NO LA CERRADURA ═══
//
// `cotizacion_partida` y `cotizacion_partida_composicion` sólo admiten escritura con
// `ve_economia()`, y `congelar_presupuesto` la exige de nuevo por su cuenta. Si alguien sin permiso
// llega hasta acá, la base rechaza y el mensaje que se muestra es EL DE LA BASE — no se simula un
// éxito ni se traduce a una frase amable que esconda qué pasó.
//
// ═══ LO QUE NO SE ESCRIBE NUNCA ═══
//
// `congelada_en`, `congelada_por` y la tabla de composición no se tocan desde acá: los escribe
// `congelar_presupuesto()`, que además se niega a correr dos veces. Un `update` suelto que pusiera
// la fecha de congelado sin copiar la composición dejaría un presupuesto marcado como salido y sin
// una sola línea que respalde su precio.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ESTADOS } from '../types'
import { huellaDeEntradas } from './cotizadorPuente.ts'
// El estado inicial y los tipos NO se declaran acá: un archivo `'use server'` sólo puede exportar
// funciones async, y una constante exportada rompe la pantalla en tiempo de ejecución sin que
// typecheck, lint ni build digan una palabra. Ver `./accion`.
import type { EstadoAccion, Resultado } from './accion'


const RAIZ = '/presupuestos'
const refrescar = (id?: string) => {
  revalidatePath(RAIZ)
  if (id) revalidatePath(`${RAIZ}/${id}`, 'layout')
}

/**
 * Un porcentaje llega del formulario como «12» o «12,5» y se guarda como FRACCIÓN, que es lo que
 * la vista multiplica. Guardarlo en escala 0–100 haría que la cascada devolviera un precio cien
 * veces más grande, y como todos los escalones se multiplican por la misma base, el resultado se
 * vería «coherente»: mal en todos lados a la vez es el defecto que menos se nota.
 */
const pctSchema = z.string().trim()
  .transform((v) => (v === '' ? 0 : Number(v.replace(',', '.'))))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, 'El porcentaje va entre 0 y 100')
  .transform((n) => n / 100)

/**
 * El FACTOR financiero no es un porcentaje: es qué fracción del período se financia. `0,5` es medio
 * período. Pasarlo por `pctSchema` lo dividiría por cien y el costo financiero saldría cien veces
 * más chico — un error que no se ve porque el escalón es el más chico de la cascada.
 */
const factorSchema = z.string().trim()
  .transform((v) => (v === '' ? 0 : Number(v.replace(',', '.'))))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 5, 'El factor financiero va entre 0 y 5')

/** Copia un registro sin las claves dadas. Explícito y sin variables muertas que nadie lee. */
function sin(fila: Record<string, unknown>, claves: readonly string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fila)) if (!claves.includes(k)) r[k] = v
  return r
}

async function sb() {
  try {
    return { c: await createClient(), error: null as string | null }
  } catch (err) {
    return { c: null, error: err instanceof Error ? err.message : 'No pude conectar con la base' }
  }
}

// ── el presupuesto ────────────────────────────────────────────────────────────────────────────

const nuevoSchema = z.object({
  obra_nombre: z.string().trim().min(2, 'Poné el objeto del presupuesto'),
  cliente: z.string().trim().max(200).optional(),
  cliente_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  obra_canonica_id: z.string().trim().optional(),
  parametro_comercial_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  pct_gastos_generales: pctSchema,
  pct_beneficio: pctSchema,
  pct_financiero: pctSchema,
  factor_financiero: factorSchema,
  pct_iibb: pctSchema,
  pct_ganancias: pctSchema,
  pct_cheque: pctSchema,
  pct_iva: pctSchema,
})

/** Los ocho de la cascada, tal como los guarda la base: en FRACCIÓN, salvo el factor. */
function cascadaDe(d: z.infer<typeof nuevoSchema>) {
  return {
    parametro_comercial_id: d.parametro_comercial_id || null,
    pct_gastos_generales: d.pct_gastos_generales,
    pct_beneficio: d.pct_beneficio,
    pct_financiero: d.pct_financiero,
    factor_financiero: d.factor_financiero,
    pct_iibb: d.pct_iibb,
    pct_ganancias: d.pct_ganancias,
    pct_cheque: d.pct_cheque,
    pct_iva: d.pct_iva,
  }
}

/**
 * EL NÚMERO SE DERIVA, NO SE PIDE. `COT-2026-024`.
 *
 * Pedirlo en el formulario significa que alguien tipea la clave por la que se agrupan las
 * versiones, y dos presupuestos con el mismo número tipeado harían fallar el índice único con un
 * error de Postgres que no dice nada. Se lee el máximo del año y se suma uno. Que dos altas
 * simultáneas puedan chocar es real y está declarado: el índice único lo rechaza en vez de crear
 * un duplicado, que es el modo de fallar correcto.
 */
async function proximoNumero(c: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const anio = new Date().getFullYear()
  const prefijo = `COT-${anio}-`
  const { data } = await c.from('cotizaciones').select('numero')
    .like('numero', `${prefijo}%`).order('numero', { ascending: false }).limit(1)
  const ultimo = data?.[0]?.numero as string | undefined
  const n = ultimo ? Number(ultimo.slice(prefijo.length)) : 0
  return `${prefijo}${String((Number.isFinite(n) ? n : 0) + 1).padStart(3, '0')}`
}

export async function crearPresupuesto(form: FormData): Promise<Resultado> {
  const parsed = nuevoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { c, error } = await sb()
  if (!c) return { ok: false, error: error! }
  const d = parsed.data

  const { data, error: e } = await c.from('cotizaciones').insert({
    numero: await proximoNumero(c),
    version: 1,
    vigente: true,
    estado: 'borrador',
    obra_nombre: d.obra_nombre,
    cliente: d.cliente || null,
    cliente_id: d.cliente_id || null,
    obra_canonica_id: d.obra_canonica_id || null,
    ...cascadaDe(d),
  }).select('id').single()
  if (e) return { ok: false, error: e.message }
  refrescar()
  return { ok: true, id: String(data.id) }
}

const cabeceraSchema = nuevoSchema.extend({ id: z.string().uuid() })

export async function guardarCabecera(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const parsed = cabeceraSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { c, error } = await sb()
  if (!c) return { error: error! }
  const { id, ...d } = parsed.data
  const { error: e } = await c.from('cotizaciones').update({
    obra_nombre: d.obra_nombre,
    cliente: d.cliente || null,
    cliente_id: d.cliente_id || null,
    obra_canonica_id: d.obra_canonica_id || null,
    ...cascadaDe(d),
  }).eq('id', id)
  // El trigger `cotizacion_congelada_solo_lectura` rechaza este UPDATE si el presupuesto ya salió,
  // y su mensaje —que nombra la vía legítima— se muestra tal cual.
  if (e) return { error: e.message }
  refrescar(id)
  return { error: null, ok: true }
}

const estadoSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(ESTADOS as unknown as [string, ...string[]]),
})

export async function cambiarEstado(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const parsed = estadoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'Ese estado no existe en el modelo' }
  const { c, error } = await sb()
  if (!c) return { error: error! }
  const { error: e } = await c.from('cotizaciones')
    .update({ estado: parsed.data.estado }).eq('id', parsed.data.id)
  if (e) return { error: e.message }
  refrescar(parsed.data.id)
  return { error: null, ok: true }
}

/**
 * CONGELAR. Copia la composición viva de cada partida y fija el costo unitario.
 *
 * DESDE LA 4400 DEVUELVE UN jsonb, no un entero. El entero eran «líneas copiadas» y cero líneas
 * significaba tres cosas distintas sin poder distinguirlas: sin partidas, sin análisis, o todo
 * subcontratado —que ni siquiera es deuda—. Ahora el mensaje dice qué quedó congelado y qué no.
 */
export async function congelar(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get('id') ?? '')
  if (!z.string().uuid().safeParse(id).success) return { error: 'Falta el presupuesto' }
  const { c, error } = await sb()
  if (!c) return { error: error! }

  // ═══ EL GATE VA ANTES DE MUTAR, Y LO CORRE LA BASE (QA visual, 29/08/2026) ═══
  //
  // Hasta acá esta acción llamaba directo a `congelar_presupuesto`, que informa a posteriori qué
  // quedó sin respaldo — cuando ya no se puede deshacer. El QA congeló un presupuesto con un
  // bloqueante VIVO y precio $0: la pantalla decía «NO se congela: 1 bloqueo(s)» y el botón estaba
  // habilitado al lado. `puedeCongelar()` nunca miraba el gate, y el RPC tampoco.
  //
  // `cot_congelar_con_gate` corre el gate y SÓLO si pasa congela, todo en una transacción, y LEVANTA
  // EXCEPCIÓN si no pasa. Que sea la BASE la que decide es lo que importa: un control en la pantalla
  // no protege de un POST a esta acción, y ésta es la única cerradura que no se puede saltear.
  const [{ data: pres }, { data: partidas }, { data: alcance }] = await Promise.all([
    c.from('cotizacion_cascada').select('*').eq('id', id).maybeSingle(),
    c.from('cotizacion_partida_valorizada').select('*').eq('cotizacion_id', id),
    c.from('cotizacion_alcance').select('*').eq('cotizacion_id', id),
  ])

  // La HUELLA DE ENTRADAS (§39) se calcula ANTES de congelar, sobre lo que se está por congelar.
  // Sin ella una revisión posterior no puede decir qué cambió, y `congelar()` del motor se niega a
  // correr sin huella justamente por eso.
  const huella = huellaDeEntradas({
    partidas: partidas ?? [], alcance: alcance ?? [],
    politica: pres ? { version: pres.version } : null,
  })

  const { data, error: e } = await c.rpc('cot_congelar_con_gate', {
    p_cotizacion_id: id,
    p_sha256: huella.sha256,
    p_partes: huella.partes,
    p_resumen: huella.resumen,
  })
  // El mensaje de la excepción nombra los bloqueos: se muestra tal cual, porque es lo que dice qué
  // hay que arreglar. Traducirlo a «no se pudo congelar» perdería exactamente esa información.
  if (e) return { error: e.message }
  refrescar(id)

  // `cot_congelar_con_gate` envuelve el resultado de `congelar_presupuesto` en `congelado`.
  const envuelto = (data ?? {}) as { congelado?: unknown; huella?: string }
  const r = (envuelto.congelado ?? {}) as {
    lineas_composicion?: number; n_partidas?: number; n_partidas_congeladas?: number
    n_subcontratadas?: number; n_sin_analisis?: number; n_subcontratadas_sin_precio?: number
  }
  const n = (v: number | undefined) => Number(v ?? 0)
  const partes = [`${n(r.n_partidas_congeladas)} de ${n(r.n_partidas)} partidas congeladas`]
  if (n(r.lineas_composicion) > 0) partes.push(`${n(r.lineas_composicion)} líneas de composición`)
  if (n(r.n_subcontratadas) > 0) partes.push(`${n(r.n_subcontratadas)} subcontratadas`)
  // Lo que NO quedó respaldado se dice, no se festeja: es deuda que ya no se puede corregir sin
  // crear una versión nueva.
  if (n(r.n_sin_analisis) > 0) partes.push(`${n(r.n_sin_analisis)} sin análisis, sin composición que respalde su precio`)
  if (n(r.n_subcontratadas_sin_precio) > 0) partes.push(`${n(r.n_subcontratadas_sin_precio)} paquetes sin precio contratado`)

  return { error: null, ok: true, mensaje: `Congelado: ${partes.join(' · ')}. Huella ${String(envuelto.huella ?? '').slice(0, 12)}.` }
}

/**
 * UNA VERSIÓN NUEVA — la única manera de cambiar un presupuesto que ya salió.
 *
 * La nueva nace en borrador, sin congelar y SIN los costos fijados: se revaloriza contra la base
 * maestra de hoy, que es exactamente para lo que uno hace una versión nueva. El override de
 * rendimiento también se limpia por la misma razón — el modelo guarda el override y el congelado
 * en la misma columna (`hs_unitarias`) y no se pueden distinguir, así que conservarlo arrastraría
 * un rendimiento viejo disfrazado de decisión nueva.
 *
 * NO ES ATÓMICA. PostgREST no da transacción: se inserta la versión nueva apagada, se apaga la
 * vieja y recién ahí se enciende la nueva. Si algo falla en el medio queda un estado recuperable
 * —nunca dos vigentes, que es lo que el índice único prohíbe—, y se dice cuál es.
 */
export async function nuevaVersion(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get('id') ?? '')
  if (!z.string().uuid().safeParse(id).success) return { error: 'Falta el presupuesto' }
  const { c, error } = await sb()
  if (!c) return { error: error! }

  const { data: origen, error: eO } = await c.from('cotizaciones').select('*').eq('id', id).maybeSingle()
  if (eO) return { error: eO.message }
  if (!origen) return { error: 'No encontré ese presupuesto, o no tenés permiso para verlo.' }

  const { data: versiones } = await c.from('cotizaciones')
    .select('version').eq('numero', origen.numero).order('version', { ascending: false }).limit(1)
  const proxima = Number(versiones?.[0]?.version ?? origen.version) + 1

  // Lo que NO se copia: la identidad de la fila vieja y todo lo que es propio de HABER SALIDO.
  // Arrastrar `congelada_en` haría nacer la versión nueva marcada como congelada, sin una sola
  // línea de composición copiada — un presupuesto que dice que salió y no tiene con qué probarlo.
  const resto = sin(origen as Record<string, unknown>,
    ['id', 'created_at', 'congelada_en', 'congelada_por', 'convertida_obra_id'])
  const { data: nueva, error: eN } = await c.from('cotizaciones').insert({
    ...resto, version: proxima, vigente: false, estado: 'borrador',
  }).select('id').single()
  if (eN) return { error: eN.message }
  const nuevoId = String(nueva.id)

  const { data: partidas, error: eP } = await c.from('cotizacion_partida')
    .select('*').eq('cotizacion_id', id).order('orden', { ascending: true })
  if (eP) return { error: `Creé la versión ${proxima} pero no pude leer sus partidas: ${eP.message}` }
  if ((partidas ?? []).length > 0) {
    const copia = (partidas ?? []).map((x) => ({
      ...sin(x as Record<string, unknown>, ['id', 'cotizacion_id', 'creado_en', 'costo_unitario', 'hs_unitarias']),
      cotizacion_id: nuevoId,
      // El costo y el rendimiento vuelven a NULL: la versión nueva se revaloriza contra la base
      // maestra de hoy, que es exactamente para lo que uno hace una versión nueva.
      costo_unitario: null,
      hs_unitarias: null,
    }))
    const { error: eC } = await c.from('cotizacion_partida').insert(copia)
    if (eC) return { error: `Creé la versión ${proxima} pero no pude copiar las partidas: ${eC.message}` }
  }

  const { error: eV } = await c.from('cotizaciones').update({ vigente: false }).eq('id', id)
  if (eV) return { error: `La versión ${proxima} quedó creada pero sin activar: ${eV.message}` }
  const { error: eA } = await c.from('cotizaciones').update({ vigente: true }).eq('id', nuevoId)
  if (eA) return { error: `La versión ${proxima} existe pero ninguna quedó vigente: ${eA.message}` }

  refrescar(nuevoId)
  refrescar(id)
  return { error: null, ok: true, mensaje: `Versión ${proxima} creada, en borrador.` }
}
