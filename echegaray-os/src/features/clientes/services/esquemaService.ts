// PANTALLA 32 — el esquema de pago: el admin arma las fechas y las publica al portal.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/obras/types'
import type { EsquemaCliente, PagoEsquema } from '../types'
import { nombresDeObra } from './nombresDeObra.ts'
import { aNumero, getEconomiaDeObras } from './economiaObras.ts'

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

/** Una obra del cliente, con lo justo para decidir contra qué contrato se controla el esquema. */
export type ObraParaElContrato = {
  obra_id: string
  estado: string | null
  /** `obra_panel.monto_contratado`, el campo del formulario. Respaldo, nunca la primera fuente. */
  monto_contratado: number | null
}

/**
 * LO CONTRATADO DE LAS OBRAS EN CURSO — el mismo número que publica `/clientes`.
 *
 * ═══ EL DEFECTO QUE ARREGLA (10/09/2026) ═══
 *
 * `contrato_total` salía de `cliente_panel.contratado`, que suma `obra_panel.monto_contratado`: el
 * campo del formulario que nadie carga. En Messina daba $31.846.475 —los de las CINCO obras
 * cerradas, las únicas con el formulario completo— y la pantalla 32 avisaba «El esquema asigna
 * $204,61 M MÁS que el contrato» sobre un cliente cuyo contratado real es $156.174.253. Una alarma
 * que grita sobre todos los clientes deja de mirarse, y con ella la sobreasignación de verdad.
 *
 * El precio lo publica la pestaña OBRAS del Flujo de Caja en `obra_economia_cartera`, que es lo que
 * ya lee `/clientes` y la ficha del cliente (ver el comentario de `src/app/(main)/clientes/page.tsx`).
 * `monto_contratado` queda de respaldo para la obra que OBRAS no tiene, igual que ahí.
 *
 * SE MIDE SOBRE LAS OBRAS EN CURSO, que es la misma ventana que la cifra «Contratado en curso» de
 * la ficha. Sumar además las cerradas mezclaría el contrato de trabajo terminado con un esquema que
 * el admin usa para planificar lo que falta cobrar.
 *
 * `null` cuando NINGUNA obra en curso tiene precio: entonces la pantalla no puede afirmar «falta
 * asignar $X» porque no sabe contra qué. Cero diría que el cliente contrató nada.
 */
export function contratoEnCurso(
  obras: ObraParaElContrato[],
  economia: Map<string, { contratado: number | null }> | null,
): number | null {
  const valores = obras
    .filter((o) => o.estado === 'activa')
    .map((o) => economia?.get(o.obra_id)?.contratado ?? o.monto_contratado)
    .filter((v): v is number => v != null)
  return valores.length ? valores.reduce((a, b) => a + b, 0) : null
}

/**
 * EL ESQUEMA MÁS EL CONTRATO CONTRA EL QUE SE CONTROLA, que es lo que dibuja la pantalla 32.
 *
 * `contrato_total` es lo contratado de las obras EN CURSO según la pestaña OBRAS — ver
 * `contratoEnCurso`, que es puro y tiene el porqué. Las obras salen de `obra_panel`, que ya deja
 * afuera las fusionadas: una obra que se absorbió en otra sumaría su contrato dos veces.
 */
export async function getEsquemaCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<EsquemaCliente>> {
  const [pagos, obras, economia] = await Promise.all([
    getEsquema(supabase, clienteId),
    supabase.from('obra_panel').select('obra_id, estado, monto_contratado').eq('cliente_id', clienteId),
    // `null` = no se pudo leer OBRAS. No es lo mismo que «OBRAS no tiene el dato», y por eso el
    // respaldo del formulario sigue en pie en vez de publicar un contrato en cero.
    getEconomiaDeObras(supabase),
  ])
  if (pagos.error !== null) return { data: null, error: pagos.error }
  if (obras.error) return { data: null, error: obras.error.message }
  const filas = ((obras.data ?? []) as Record<string, unknown>[]).map((o) => ({
    obra_id: String(o.obra_id),
    estado: (o.estado as string) ?? null,
    monto_contratado: aNumero(o.monto_contratado),
  }))
  return {
    data: {
      cliente_id: clienteId,
      contrato_total: contratoEnCurso(filas, economia),
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
