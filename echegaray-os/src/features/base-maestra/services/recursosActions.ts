'use server'

// BASE MAESTRA · EDITAR UN RECURSO Y ACTUALIZAR SU PRECIO.
//
// ═══ POR QUÉ EXISTEN ═══
//
// `18 · Base Maestra Recursos.dc.html` dibuja «Actualizar precio» como la ÚNICA primaria del panel,
// y hasta hoy no escribía nada: los precios entraban sólo por la ingestión de la Planilla para
// Cotizar. El dueño, textual: *"necesito que la pantalla permita que si quiero editar edite ahí
// mismo"*. Con 409 precios y una economía como la argentina, la lista de proveedor llega por mail y
// el que la mira es el que tiene que poder cargarla.
//
// ═══ UN PRECIO NO SE PISA: SE AGREGA ═══
//
// `recurso_precio` es HISTORIA —la ficha la dibuja— y `recurso_precio_uno_vigente` es un índice
// único parcial: NO PUEDEN CONVIVIR DOS VIGENTES del mismo recurso. Sin transacciones en PostgREST,
// el orden es la única garantía, y es éste:
//
//   1. Insertar el precio nuevo con `vigente = false`   ← no puede chocar con el índice
//   2. Bajar el vigente anterior                        ← si falla, se borra el nuevo y no pasó nada
//   3. Subir el nuevo                                   ← si falla, se vuelve a subir el anterior
//
// Entre 2 y 3 hay una ventana sin ningún precio vigente. Es el estado seguro: el recurso se ve «sin
// precio» —visible y falso por defecto, no invisible y falso— y el paso 3 tiene reparación.
//
// ═══ EL PORTERO ES LA BASE ═══
//
// `recurso_precio_escribe` exige `ve_economia()` y `recurso_escribe` exige `es_administracion()`,
// las dos con su GRANT. Acá no se re-implementa el permiso: si un jefe de obra manda el formulario,
// la base lo rechaza y el mensaje se ve en el panel. Comprobarlo también en el código daría dos
// definiciones de quién puede, y la que se desincroniza es siempre la de arriba.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string }

const RUTA = '/administracion/base-maestra/recursos'

const vacioEsNulo = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

// ═══ EL PRECIO ═════════════════════════════════════════════════════════════════════════════════
//
// LA FECHA ES DEL PRECIO, NO DE LA CARGA, y por eso se pregunta: una lista de proveedor de la
// semana pasada cargada hoy vale desde la semana pasada, y la frescura —que decide si ese número
// todavía sirve para cotizar— se mide contra ESA fecha. `cargado_en` la pone la base sola.
//
// LA FUENTE ES OBLIGATORIA. Un precio sin procedencia no se puede defender delante de un cliente ni
// auditar tres meses después: es exactamente el estado del que este modelo vino a sacarnos.
const esquemaPrecio = z.object({
  costo: z.coerce.number({ message: 'El precio tiene que ser un número' })
    .nonnegative('Un precio no puede ser negativo')
    .finite(),
  fecha_precio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha del precio va en AAAA-MM-DD'),
  fuente: z.string().trim().min(1, 'Decí de dónde salió el precio (lista, compra, convenio…)').max(200),
  proveedor: z.string().trim().max(200).optional(),
})

export async function actualizarPrecioRecurso(recursoId: string, form: FormData): Promise<Resultado> {
  const id = z.string().uuid().safeParse(recursoId)
  if (!id.success) return { ok: false, error: 'Recurso inválido' }
  const parsed = esquemaPrecio.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  // El vigente de HOY, leído antes de tocar nada: es lo que hay que poder devolver si algo falla.
  const anterior = await supabase.from('recurso_precio')
    .select('id').eq('recurso_id', id.data).eq('vigente', true).maybeSingle()
  if (anterior.error) return { ok: false, error: anterior.error.message }

  const nuevo = await supabase.from('recurso_precio')
    .insert({
      recurso_id: id.data,
      costo: d.costo,
      fecha_precio: d.fecha_precio,
      fuente: d.fuente,
      proveedor: vacioEsNulo(d.proveedor),
      vigente: false,
    })
    .select('id').single()
  if (nuevo.error) return { ok: false, error: nuevo.error.message }
  const nuevoId = nuevo.data.id as string

  if (anterior.data?.id) {
    const baja = await supabase.from('recurso_precio')
      .update({ vigente: false }).eq('id', anterior.data.id)
    if (baja.error) {
      // No pasó nada: se borra el que se acaba de insertar y el precio de ayer sigue siendo el de hoy.
      await supabase.from('recurso_precio').delete().eq('id', nuevoId)
      return { ok: false, error: baja.error.message }
    }
  }

  const alta = await supabase.from('recurso_precio').update({ vigente: true }).eq('id', nuevoId)
  if (alta.error) {
    // REPARACIÓN: sin esto el recurso queda sin ningún precio vigente y la base maestra pierde un
    // número que sí tenía. Se devuelve el anterior a su lugar y el precio nuevo queda como historia.
    if (anterior.data?.id) {
      await supabase.from('recurso_precio').update({ vigente: true }).eq('id', anterior.data.id)
    }
    return { ok: false, error: alta.error.message }
  }

  revalidatePath(RUTA)
  return { ok: true, id: nuevoId, mensaje: 'Precio actualizado. El anterior queda en el historial.' }
}

// ═══ EL RECURSO ════════════════════════════════════════════════════════════════════════════════
//
// LO QUE NO SE EDITA ACÁ: el `tipo`. Cambiar un material por mano de obra reclasifica hacia atrás
// el costo de todos los análisis que lo usan —y las HH, porque `hs_unitarias` es la suma de las
// cantidades de `mano_obra`—: una tarea pasaría de 24 a 0 horas por unidad sin que se haya tocado
// su análisis. Si un recurso está mal tipado, se da de baja y se carga bien; no se muta.
const esquemaRecurso = z.object({
  nombre: z.string().trim().min(1, 'El recurso necesita un nombre').max(200),
  unidad: z.string().trim().min(1, 'Falta la unidad (m³, kg, h…)').max(20),
  familia: z.string().trim().max(120).optional(),
  // Fracción, no porcentaje: 0,05 es 5 %. Es el mismo CHECK que la base (`>= 0 and < 1`).
  desperdicio: z.coerce.number().min(0, 'El desperdicio no puede ser negativo')
    .lt(1, 'El desperdicio es una fracción: 0,05 es 5 %'),
})

// EL TIPO SÓLO SE ELIGE AL CREAR. Ver el porqué arriba de `esquemaRecurso`.
const esquemaAlta = esquemaRecurso.extend({
  codigo: z.string().trim().min(1, 'El recurso necesita un código').max(40),
  tipo: z.enum(['material', 'equipo', 'mano_obra', 'carga_social', 'otro'], {
    message: 'Elegí de qué tipo es el recurso',
  }),
})

/**
 * EL ALTA. `+ Recurso` es la primaria de la banda del canónico 18 y no escribía nada: los 409
 * recursos entraron por la importación de la Planilla para Cotizar. Un material nuevo —el que se
 * compró la semana pasada y todavía no está en ninguna tarea— no tenía puerta.
 *
 * NACE SIN PRECIO, y la lista lo dice: «sin precio» es cierto y es la única fila sobre la que hay
 * algo concreto que hacer después de crearlo. Cargarlo en el alta obligaría a inventar una fecha y
 * una fuente para poder guardar.
 */
export async function crearRecurso(form: FormData): Promise<Resultado> {
  const parsed = esquemaAlta.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.from('recurso')
    .insert({
      codigo: d.codigo.toUpperCase().replace(/\s+/g, ''),
      nombre: d.nombre,
      unidad: d.unidad,
      tipo: d.tipo,
      familia: vacioEsNulo(d.familia),
      desperdicio: d.desperdicio,
      origen: 'web',
    })
    .select('id').single()

  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? `Ya existe un recurso con el código ${d.codigo.toUpperCase()}.`
        : error.message,
    }
  }
  revalidatePath(RUTA)
  return { ok: true, id: data.id as string, mensaje: 'Creado. Falta cargarle el precio.' }
}

export async function editarRecurso(recursoId: string, form: FormData): Promise<Resultado> {
  const id = z.string().uuid().safeParse(recursoId)
  if (!id.success) return { ok: false, error: 'Recurso inválido' }
  const parsed = esquemaRecurso.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('recurso')
    .update({
      nombre: d.nombre,
      unidad: d.unidad,
      familia: vacioEsNulo(d.familia),
      desperdicio: d.desperdicio,
    })
    .eq('id', id.data)
  if (error) return { ok: false, error: error.message }

  revalidatePath(RUTA)
  return { ok: true }
}
