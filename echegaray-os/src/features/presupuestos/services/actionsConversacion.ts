'use server'

// HABLARLE AL PRESUPUESTO — la conversación de la pantalla 15, del lado del servidor.
//
// ═══ EL RBAC SE RE-VALIDA ACÁ, SIEMPRE ═══
//
// La pantalla no dibuja lo que el rol no puede, pero eso es comodidad, no seguridad: un POST a esta
// acción no pasa por la pantalla. El rol se lee del PERFIL de la sesión —nunca de un campo del
// formulario— y se lo pasa al command layer, que autoriza ANTES de validar. El orden importa: si la
// validación fuera primera, un jefe de obra que pide «beneficio 19 %» recibiría «19 % no es un
// porcentaje válido para pctBeneficio» en vez de «no tenés permiso», y ese mensaje ya le confirmó
// que el campo existe y qué forma tiene (§40).
//
// Y la base es la tercera cerradura: `cotizacion_partida` sólo admite escritura con `ve_economia()`.
// Si algo llegara hasta el UPDATE sin permiso, Postgres lo rechaza y el mensaje que se muestra es el
// suyo — no se simula un éxito.
//
// ═══ EL MODELO NO ESCRIBE ═══
//
// Lo único que puede producir el modelo es una intención de la lista cerrada. Después corre
// `ejecutar()`, que autoriza, valida, mide el atípico y recién ahí llama a `mutar` — que acá no
// escribe: devuelve un PLAN (`conversacionPlan.ts`) que esta acción aplica con la sesión del
// usuario. Ninguna cadena de texto del modelo llega a un UPDATE.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { getPartidas, getPresupuesto } from './presupuestosService.ts'
import {
  planDe, paraElMotor, rolDeContrato, predicadoDe, veredictoDeEscritura, describir, type Plan,
} from './conversacionPlan.ts'
import type { RespuestaConversacion, TurnoConversacion } from './conversacionTipos.ts'
// El motor entra por UNA puerta: `cotizadorPuente` escribe la firma que el `.mjs` no puede declarar.
import { cascadaDesdeFila, conversar, estadoDesdeFilas } from './cotizadorPuente.ts'
import { decisionSobreCongelada } from './congelada.ts'

const schema = z.object({
  id: z.string().uuid('Falta el presupuesto'),
  // 500 caracteres: una frase sobre un presupuesto, no un documento. Un texto largo pegado acá
  // sería un intento de inyectar contexto al modelo, no una orden.
  texto: z.string().trim().min(1, 'Escribí algo').max(500, 'Es una frase, no un documento'),
  /** El «sí, aplicalo igual» de una advertencia del outlier engine. */
  confirmado: z.enum(['1', '0']).optional(),
})

const sinEntender = (porQue: string, pregunta: string | null = null): RespuestaConversacion => ({
  tono: 'no', titulo: 'No se pudo', lineas: [porQue], cambios: [], pregunta, opciones: null,
})

/**
 * LO QUE SE CONTESTA A UNA MUTACIÓN SOBRE UNA VERSIÓN CONGELADA.
 *
 * No es «no se pudo»: es «acá no, y hay un camino». El camino existe —una revisión es una versión
 * nueva y la ofertada queda intacta— y por eso se nombra el botón que lo abre en vez de dejar a la
 * persona buscando.
 */
const congeladaNoSeEdita = (version: number): RespuestaConversacion => ({
  tono: 'no',
  titulo: 'La versión está congelada',
  lineas: [
    `La v${version} quedó fija tal como salió y no admite cambios: ni cantidad, ni alcance, ni subcontrato, ni parámetros.`,
    'Preguntar sí funciona: explicar no modifica.',
  ],
  cambios: [],
  pregunta: '¿Abrimos una revisión? La versión ofertada queda intacta y el cambio se mide contra ella.',
  opciones: ['«Nueva versión», en el encabezado, crea la v+1 y ahí sí se aplica'],
})

/**
 * ═══ NINGUNA EXCEPCIÓN SE LLEVA PUESTO EL MENSAJE ═══
 *
 * Esta acción llama al motor, a PostgREST y —cuando hay— al proveedor del modelo. Cualquiera de los
 * tres puede tirar: un timeout, un JSON roto, una cookie vencida. Sin este envoltorio la excepción
 * sube al límite de la Server Action, React descarta el estado y la persona ve el campo vacío, sin
 * respuesta y sin la frase que escribió — indistinguible de «no pasó nada».
 *
 * Se devuelve un turno de error con el mensaje real y con el texto original adentro, que es lo que
 * permite volver a intentarlo sin reescribirlo.
 */
export async function hablarConElPresupuesto(
  prev: TurnoConversacion,
  form: FormData,
): Promise<TurnoConversacion> {
  const texto = String(form.get('texto') ?? '')
  try {
    return await hablar(form)
  } catch (e) {
    // El mensaje de la excepción se muestra tal cual: «fetch failed» apunta a la red y «permission
    // denied» a la RLS. «Ocurrió un error» no apunta a nada.
    const porQue = e instanceof Error ? e.message : String(e)
    return { estado: 'error', texto, degradado: prev.degradado, respuesta: sinEntender(`Se cortó antes de contestar: ${porQue}`) }
  }
}

async function hablar(form: FormData): Promise<TurnoConversacion> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) {
    return { estado: 'error', texto: String(form.get('texto') ?? ''), respuesta: sinEntender(parsed.error.issues[0].message) }
  }
  const { id, texto, confirmado } = parsed.data

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  const rol = rolDeContrato(perfil.data?.rol ?? null)

  const [{ data: presupuesto, error: eP }, partidas, alcance] = await Promise.all([
    getPresupuesto(supabase, id),
    getPartidas(supabase, id),
    // El ALCANCE es parte del estado: una partida excluida no genera issues de precio, y sin leerlo
    // la conversación contestaría «falta el precio de la pintura» sobre una pintura que se sacó.
    supabase.from('cotizacion_alcance').select('*').eq('cotizacion_id', id),
  ])
  if (!presupuesto) return { estado: 'error', texto, respuesta: sinEntender(eP ?? 'No pude leer el presupuesto.') }

  const lista = partidas.data ?? []
  const estado = estadoDesdeFilas({ presupuesto, partidas: lista, alcance: alcance.data ?? [] })
  const cascadaAntes = cascadaDesdeFila(presupuesto)

  // `mutar` NO escribe: arma el plan. Ver el encabezado de `conversacionPlan.ts`. El plan viaja en
  // una caja y no en un `let`: asignado desde adentro de un callback, TypeScript estrecha la
  // variable a `never` y después no deja leer ni `plan.ok`.
  const caja: { plan: Plan | null } = { plan: null }
  const turno = await conversar({
    texto, rol, actor: perfil.data?.id ?? 'desconocido',
    estado: { ...estado, partidas: paraElMotor(lista) },
    confirmado: confirmado === '1',
    // El MISMO «sí» explícito vale para las dos guardas: la del outlier y la del origen. Lo que no
    // se hereda es la ausencia de guarda — una intención del modelo nunca se aplica sin este paso.
    confirmadoDelModelo: confirmado === '1',
    cascadaAntes,
    mutar: ({ intent, validado }) => {
      caja.plan = planDe(intent, validado, id)
      return estado
    },
  })

  // ═══ EL CORTE DEL CONGELADO VA ACÁ, NO EN LA PUERTA ═══
  //
  // En la puerta rechazaba también las preguntas, y la conversación promete lo contrario. Acá ya se
  // sabe QUÉ pidió la persona: si la intención muta, se ofrece la revisión; si es una consulta,
  // sigue de largo y contesta. Ninguna escritura pasó todavía — `mutar` sólo arma el plan, y el plan
  // se aplica más abajo.
  if (decisionSobreCongelada({
    congelada: Boolean(presupuesto.congelada_en),
    accion: turno.intencion?.action,
    hayPlan: caja.plan !== null,
  }) === 'ofrecer-revision') {
    return {
      estado: 'rechazado', texto, degradado: turno.degradado,
      respuesta: congeladaNoSeEdita(presupuesto.version),
    }
  }

  if (!turno.salida?.ok) {
    return { estado: turno.entendido ? 'rechazado' : 'no-entendido', texto, degradado: turno.degradado, respuesta: turno.respuesta }
  }
  // Una CONSULTA no tiene plan y no tiene por qué tenerlo.
  const p = caja.plan
  if (!p) return { estado: 'ok', texto, degradado: turno.degradado, respuesta: turno.respuesta }

  if (!p.ok) {
    return { estado: 'rechazado', texto, degradado: turno.degradado, respuesta: sinEntender(p.porQue) }
  }

  // ═══ ESCRIBIR Y COMPROBAR QUE SE ESCRIBIÓ ═══
  //
  // Las tres decisiones —qué predicado, qué significa cero filas, qué significa la relectura— viven
  // en `conversacionPlan.ts` como funciones PURAS. Acá sólo se traducen a PostgREST y se ejecutan:
  // esta capa necesita cookies y un request, así que todo lo que decida adentro es código que
  // `node --test` no puede alcanzar. El auditor mutó las tres piezas cuando vivían acá y las tres
  // quedaron verdes con 540 tests.
  let filas: unknown[] | null = null
  let error: { message: string } | null = null

  if (p.plan.operacion === 'upsert') {
    const r = await supabase.from(p.plan.tabla).upsert(p.plan.columnas, { onConflict: p.plan.onConflict }).select('id')
    filas = r.data; error = r.error
  } else {
    let q = supabase.from(p.plan.tabla).update(p.plan.columnas).eq('id', p.plan.id!)
    for (const c of predicadoDe(p.plan)) {
      q = c.operador === 'is' ? q.is(c.columna, null) : q.eq(c.columna, c.valor as never)
    }
    // `.select()` en un UPDATE de PostgREST devuelve LAS FILAS TOCADAS: cero filas es la señal, y
    // no hace falta pedir un `count` aparte.
    const r = await q.select('id')
    filas = r.data; error = r.error
  }

  // El mensaje de la base se muestra tal cual: «permission denied for table cotizacion_partida»
  // apunta al arreglo; «no se pudo guardar» no apunta a nada.
  if (error) return { estado: 'error', texto, respuesta: sinEntender(error.message) }

  // LA RELECTURA DEL DESTINO, siempre — también cuando hubo cero filas, porque ahí es JUSTAMENTE
  // donde hace falta saber qué hay para poder decirlo.
  const quedo = await valorActual(supabase, p.plan)
  const veredicto = veredictoDeEscritura({ plan: p.plan, filasTocadas: (filas ?? []).length, quedo })

  if (veredicto.tipo === 'CONFLICTO') {
    return {
      estado: 'rechazado', texto, degradado: turno.degradado,
      respuesta: sinEntender(
        `Alguien cambió esto mientras escribías. Cuando leí decía ${describir(veredicto.esperado)}, y ahora dice ${describir(veredicto.actual)}. No apliqué nada: lo que pediste se calculó sobre el valor viejo.`,
        '¿Lo mirás y lo volvés a pedir?',
      ),
    }
  }

  if (veredicto.tipo === 'DESAJUSTE') {
    return {
      estado: 'error', texto, degradado: turno.degradado,
      respuesta: sinEntender(
        `Escribí el cambio y la base devolvió otra cosa: pedí ${describir(veredicto.pedido)} y quedó ${describir(veredicto.quedo)}. No lo doy por hecho.`,
      ),
    }
  }

  // LA PANTALLA TIENE QUE VER LO QUE PASÓ. Se revalida SÓLO acá: después de que el veredicto dijo
  // APLICADO. Revalidar tras un CONFLICTO o un DESAJUSTE repintaría la pantalla como si algo hubiera
  // cambiado —y no cambió—, que es la misma clase de mentira que el resto de esta función evita.
  //
  // Mi refactor de la vuelta 2 se lo llevó puesto, y lo delató el lint por una variable sin usar.
  revalidatePath('/presupuestos')
  revalidatePath(`/presupuestos/${id}`, 'layout')

  const { data: despues } = await getPresupuesto(supabase, id)
  return {
    estado: 'ok', texto, degradado: turno.degradado,
    respuesta: {
      ...turno.respuesta,
      lineas: [...turno.respuesta.lineas, p.plan.detalle],
      impacto: impactoDe(cascadaAntes?.ventaSinIva ?? null, despues?.venta_sin_iva ?? null),
    },
  }
}

/** Las columnas que este plan toca, tal como están AHORA en la fila. `null` si no se pudo leer. */
async function valorActual(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plan: { tabla: string; id?: string; columnas: Record<string, unknown>; onConflict?: string },
): Promise<Record<string, unknown> | null> {
  if (!plan.id) return null
  const cols = Object.keys(plan.columnas).join(', ')
  const { data } = await supabase.from(plan.tabla).select(cols).eq('id', plan.id).maybeSingle()
  return (data ?? null) as Record<string, unknown> | null
}



/** El movimiento del precio. `null` cuando falta cualquiera de las dos puntas — nunca cero. */
function impactoDe(antes: number | null, despues: number | null) {
  if (antes === null || despues === null) return null
  return { antes, despues, delta: despues - antes }
}
