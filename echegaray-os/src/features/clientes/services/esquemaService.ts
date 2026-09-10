// PANTALLA 32 — el esquema de pago: el admin arma las fechas y las publica al portal.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/obras/types'
import type { EsquemaCliente, PagoEsquema } from '../types'
import { nombresDeObra } from './nombresDeObra.ts'
import { getEconomiaDeCliente } from './economiaCliente.ts'

const COLUMNAS =
  'id, cliente_id, obra_id, cobranza_fila, concepto, fecha, monto, moneda, factura_numero,'
  + ' recibo_numero, reparo, estado, medio,'
  + ' visible_portal, aviso_dias, mostrar_reprogramaciones, nota_interna, reprogramaciones,'
  + ' publicado_at, cambio_pendiente, orden'

/**
 * El esquema completo del cliente, en el orden en que el admin lo dejó.
 *
 * `orden` primero y `fecha` como desempate: la pantalla 32 deja reordenar a mano, y ordenar sólo por
 * fecha perdería ese trabajo en cada recarga. Dos pagos del mismo día sin orden explícito caen por
 * fecha, que es el criterio que una persona espera.
 */
export async function getEsquema(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<PagoEsquema[]>> {
  const { data, error } = await supabase
    .from('esquema_pago')
    .select(COLUMNAS)
    .eq('cliente_id', clienteId)
    .order('orden', { ascending: true })
    .order('fecha', { ascending: true, nullsFirst: false })

  if (error) return { data: null, error: error.message }
  const filas = (data ?? []) as unknown as Record<string, unknown>[]
  const nombres = await nombresDeObra(supabase, filas.map((f) => (f.obra_id as string) ?? null))
  return {
    data: filas.map((f) => ({
      ...f,
      obra_nombre: f.obra_id ? nombres.get(f.obra_id as string) ?? null : null,
    })) as unknown as PagoEsquema[],
    error: null,
  }
}

/**
 * LO CONTRATADO DE LAS OBRAS EN CURSO — el mismo número que publica `/clientes` y la ficha.
 *
 * ═══ EL DEFECTO QUE ARREGLÓ (10/09/2026, primera vuelta) ═══
 *
 * `contrato_total` salía de `cliente_panel.contratado`, que suma `obra_panel.monto_contratado`: el
 * campo del formulario que nadie carga. En Messina daba $31.846.475 —los de las CINCO obras
 * cerradas, las únicas con el formulario completo— y la pantalla 32 avisaba «El esquema asigna
 * $204,61 M MÁS que el contrato» sobre un cliente cuyo contratado real es $156.174.253. Una alarma
 * que grita sobre todos los clientes deja de mirarse, y con ella la sobreasignación de verdad.
 *
 * ═══ Y POR QUÉ AHORA NO SUMA NADA (H1, misma jornada) ═══
 *
 * La primera vuelta lo arregló acá, sumando en el servicio; la ficha lo arreglaba en la página y la
 * lista en `armarCartera`. Tres sumas correctas y ninguna canónica: el panel lateral y el portal
 * seguían diciendo otra cosa. La suma la hace ahora `public.contratado_de_cliente()` y esta capa
 * sólo la lee de `cliente_economia.contratado_en_curso`.
 *
 * SE MIDE SOBRE LAS OBRAS EN CURSO, que es la misma ventana que la cifra «Contratado en curso» de
 * la ficha. Sumar además las cerradas mezclaría el contrato de trabajo terminado con un esquema que
 * el admin usa para planificar lo que falta cobrar.
 *
 * `null` cuando NINGUNA obra en curso tiene precio —o cuando la vista no se pudo leer—: entonces la
 * pantalla no puede afirmar «falta asignar $X» porque no sabe contra qué. Cero diría que el cliente
 * contrató nada.
 */

/**
 * EL ESQUEMA MÁS EL CONTRATO CONTRA EL QUE SE CONTROLA, que es lo que dibuja la pantalla 32.
 *
 * `contrato_total` es `cliente_economia.contratado_en_curso`: lo contratado de las obras EN CURSO
 * según la pestaña OBRAS, sumado por la base. La vista arranca de `obra_panel`, que ya deja afuera
 * las fusionadas — una obra que se absorbió en otra sumaría su contrato dos veces.
 */
export async function getEsquemaCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<EsquemaCliente>> {
  const [pagos, economia] = await Promise.all([
    getEsquema(supabase, clienteId),
    // `null` = no se pudo leer, o el rol no ve economía. No es «no tiene contrato»: por eso el
    // contrato viaja en null y la pantalla no afirma ninguna sobreasignación.
    getEconomiaDeCliente(supabase, clienteId),
  ])
  if (pagos.error !== null) return { data: null, error: pagos.error }
  return {
    data: {
      cliente_id: clienteId,
      contrato_total: economia?.contratado_en_curso ?? null,
      pagos: pagos.data,
    },
    error: null,
  }
}

/**
 * ¿HAY ALGO SIN PUBLICAR? Es lo que enciende el botón «Publicar al cliente» de la pantalla 32.
 *
 * Son dos casos distintos y los dos cuentan: un pago que nunca se publicó (`publicado_at` nulo y
 * marcado visible) y uno publicado que después cambió de fecha o de monto (`cambio_pendiente`).
 * Mirar sólo el segundo dejaría el esquema nuevo sin avisar nunca.
 */
export function hayCambiosSinPublicar(pagos: PagoEsquema[]): boolean {
  return pagos.some((p) => p.visible_portal && (p.publicado_at === null || p.cambio_pendiente))
}

/**
 * El próximo vencimiento que le corresponde ver al cliente. Alimenta el mail de publicación.
 *
 * Sólo mira lo visible y no cobrado: recordarle a alguien un pago que ya hizo es la clase de error
 * que hace que el cliente deje de leer los avisos.
 */
export function proximoVencimiento(pagos: PagoEsquema[], hoy = new Date()): PagoEsquema | null {
  const dia = hoy.toISOString().slice(0, 10)
  const candidatos = pagos
    .filter((p) => p.visible_portal && p.estado !== 'cobrado' && p.fecha && p.fecha >= dia)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  return candidatos[0] ?? null
}
