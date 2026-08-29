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
import { planDe, paraElMotor, rolDeContrato, type Plan } from './conversacionPlan.ts'
import type { RespuestaConversacion, TurnoConversacion } from './conversacionTipos.ts'
// El motor entra por UNA puerta: `cotizadorPuente` escribe la firma que el `.mjs` no puede declarar.
import { cascadaDesdeFila, conversar, estadoDesdeFilas } from './cotizadorPuente.ts'

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

export async function hablarConElPresupuesto(
  _prev: TurnoConversacion,
  form: FormData,
): Promise<TurnoConversacion> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) {
    return { estado: 'error', texto: String(form.get('texto') ?? ''), respuesta: sinEntender(parsed.error.issues[0].message) }
  }
  const { id, texto, confirmado } = parsed.data

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  const rol = rolDeContrato(perfil.data?.rol ?? null)

  const [{ data: presupuesto, error: eP }, partidas] = await Promise.all([
    getPresupuesto(supabase, id),
    getPartidas(supabase, id),
  ])
  if (!presupuesto) return { estado: 'error', texto, respuesta: sinEntender(eP ?? 'No pude leer el presupuesto.') }

  // CONGELADO NO SE HABLA. El trigger de la base rechazaría el UPDATE igual, pero decirlo acá evita
  // que la persona escriba una frase, espere, y reciba un mensaje de Postgres.
  if (presupuesto.congelada_en) {
    return {
      estado: 'error', texto,
      respuesta: sinEntender('Este presupuesto está congelado: su composición quedó copiada tal como salió. Para cambiarlo se crea una versión nueva.'),
    }
  }

  const lista = partidas.data ?? []
  const estado = estadoDesdeFilas({ presupuesto, partidas: lista })
  const cascadaAntes = cascadaDesdeFila(presupuesto)

  // `mutar` NO escribe: arma el plan. Ver el encabezado de `conversacionPlan.ts`. El plan viaja en
  // una caja y no en un `let`: asignado desde adentro de un callback, TypeScript estrecha la
  // variable a `never` y después no deja leer ni `plan.ok`.
  const caja: { plan: Plan | null } = { plan: null }
  const turno = await conversar({
    texto, rol, actor: perfil.data?.id ?? 'desconocido',
    estado: { ...estado, partidas: paraElMotor(lista) },
    confirmado: confirmado === '1',
    cascadaAntes,
    mutar: ({ intent, validado }) => {
      caja.plan = planDe(intent, validado, id)
      return estado
    },
  })

  if (!turno.salida?.ok) {
    return { estado: turno.entendido ? 'rechazado' : 'no-entendido', texto, degradado: turno.degradado, respuesta: turno.respuesta }
  }
  // Una CONSULTA no tiene plan y no tiene por qué tenerlo.
  const p = caja.plan
  if (!p) return { estado: 'ok', texto, degradado: turno.degradado, respuesta: turno.respuesta }

  if (!p.ok) {
    return { estado: 'rechazado', texto, degradado: turno.degradado, respuesta: sinEntender(p.porQue) }
  }

  const { error } = await supabase.from(p.plan.tabla).update(p.plan.columnas).eq('id', p.plan.id)
  // El mensaje de la base se muestra tal cual: «permission denied for table cotizacion_partida»
  // apunta al arreglo; «no se pudo guardar» no apunta a nada.
  if (error) return { estado: 'error', texto, respuesta: sinEntender(error.message) }

  revalidatePath('/presupuestos')
  revalidatePath(`/presupuestos/${id}`, 'layout')

  // EL IMPACTO SE MIDE RELEYENDO, no calculándolo acá. La cascada la calcula Postgres en
  // `cotizacion_cascada`: recomputarla en JavaScript sería una segunda definición del precio, y
  // este repo ya pagó dos veces por tener dos.
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

/** El movimiento del precio. `null` cuando falta cualquiera de las dos puntas — nunca cero. */
function impactoDe(antes: number | null, despues: number | null) {
  if (antes === null || despues === null) return null
  return { antes, despues, delta: despues - antes }
}
