'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { cronogramaSchema } from '@/features/administracion/services/cronogramaAdmin'

// GUARDAR EL CRONOGRAMA QUE VE EL CLIENTE.
//
// EL PORTERO ESTÁ ACÁ, NO EN LA PANTALLA. Una acción de servidor se puede invocar sin pasar por el
// formulario que la dibuja; comprobar el rol sólo al renderizar deja la escritura abierta.
//
// SE ESCRIBE CON LA CLAVE DE SERVICIO porque `pago_programado` tiene RLS sin políticas: el portal
// entra por el servidor y esto también. La autorización es este chequeo, explícito y arriba de todo.

export type Resultado = { ok: boolean; mensaje: string }

export async function guardarCronograma(_previo: Resultado, form: FormData): Promise<Resultado> {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])
  if (!usuario || !veEconomia(perfil.data?.rol)) return { ok: false, mensaje: 'No tenés permiso para editar cobros' }

  let crudo: unknown
  try { crudo = JSON.parse(String(form.get('cronograma') ?? '')) } catch { return { ok: false, mensaje: 'No pude leer el formulario' } }

  const v = cronogramaSchema.safeParse(crudo)
  if (!v.success) {
    // El primer error alcanza: la pantalla lo muestra al lado del campo y el resto se ve al corregirlo.
    const e = v.error.issues[0]
    return { ok: false, mensaje: `${e.path.join('.') || 'cronograma'}: ${e.message}` }
  }

  const sb = createAdminClient()
  const { obraId, filas } = v.data

  // SE BORRA LO QUE YA NO ESTÁ Y SE REESCRIBE EL RESTO. El formulario manda el cronograma ENTERO, así
  // que una fila que el administrador sacó tiene que desaparecer del portal, no quedar huérfana.
  const ids = filas.map((f) => f.id).filter(Boolean) as string[]
  await sb.from('pago_programado').delete().eq('obra_id', obraId)
    .not('id', 'in', `(${ids.length ? ids.map((i) => `"${i}"`).join(',') : '""'})`)

  for (const f of filas) {
    const fila = {
      obra_id: obraId, orden: f.orden, tipo: f.tipo, rotulo: f.rotulo, monto: f.monto, moneda: f.moneda,
      fecha_prevista: f.fechaPrevista, fecha_pago: f.fechaPago, factura_numero: f.facturaNumero,
      recibo_numero: f.reciboNumero, estado: f.estado, nota: f.nota, updated_at: new Date().toISOString(),
    }
    const { error } = f.id
      ? await sb.from('pago_programado').update(fila).eq('id', f.id)
      : await sb.from('pago_programado').insert(fila)
    if (error) return { ok: false, mensaje: `Fila ${f.orden}: ${error.message}` }
  }

  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO: un 204 no prueba que se escribió.
  const { count } = await sb.from('pago_programado').select('id', { count: 'exact', head: true }).eq('obra_id', obraId)
  revalidatePath('/administracion/cronograma')
  revalidatePath('/portal')
  return { ok: true, mensaje: `Guardado: ${count} pago(s) en la base. El cliente ya lo ve.` }
}
