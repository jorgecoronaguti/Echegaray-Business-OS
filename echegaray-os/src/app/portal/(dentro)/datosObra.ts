import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccesoDelPortal } from '../permisos'
import { alcanzaLaObra } from '../permisos'
import {
  agruparPorObra, pagosDelEsquema, sinImportes,
  type BloqueDeObra, type FilaEsquema, type PagoConObra, type ContratoDeObra,
} from '../esquema'
import { refrescarConCobranzas, type FilaCobranzaViva } from '../vivo.ts'
import { FILA_BASE } from '../../../../orquestador/lib/portal/cobranzas-a-cliente.mjs'
import { esObraAnterior, obrasDelCliente, type FilaObraCanonica, type ObraDelInicio } from '../obrasDelCliente'

// LO QUE SE LE PREGUNTA A LA BASE. Una sola vez, para las tres pantallas de plata.
//
// ═══ EL CRONOGRAMA SALE DE `esquema_pago` (26/08/2026) ═══
//
// Salía de `pago_programado`, una tabla que el portal se creó para sí mismo. La pantalla 32 de la
// ficha del cliente ya administraba el mismo cronograma en `esquema_pago`, con su flujo de
// publicación: administración movía una fecha ahí, la publicaba, y el cliente seguía viendo la
// vieja. LA FICHA DEL CLIENTE GANA.
//
// ═══ EL CRONOGRAMA ES POR CLIENTE, NO POR OBRA ═══
//
// `esquema_pago.cliente_id` es NOT NULL y `obra_id` es opcional. Se pide TODO el esquema del cliente
// en una consulta y se agrupa acá: pedirlo por obra dejaría afuera, sin que nadie lo note, los pagos
// acordados que todavía no cuelgan de ninguna obra.

// `obraDetalle` y `ObraDetalle` SE FUERON (10/09/2026). Leían `public.obras` para la pantalla de una
// obra terminada, que ahora sale de `obra_canonica` como el resto del portal. Un lector del registro
// viejo que ya no usa nadie es la puerta por la que vuelve la segunda definición.

/** Hoy, en la zona de San Juan. Comparar contra UTC corre el vencimiento tres horas. */
export function hoyEnObra(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export type EsquemaDelPortal = {
  /** Todos los pagos que este acceso puede ver, en el orden de la pantalla 32. */
  pagos: PagoConObra[]
  /** Los mismos, agrupados por obra, con las filas sin obra al final. */
  bloques: BloqueDeObra[]
  /** `Map<obra_canonica.id, monto_contratado>`. Sin la obra en el mapa: no hay contrato cargado. */
  contratos: Map<string, ContratoDeObra>
}

/**
 * EL ESQUEMA DE PAGO QUE ESTE ACCESO PUEDE VER.
 *
 * Se leen las filas del cliente ENTERAS (`select('*')`) a propósito: tres columnas que la pantalla
 * de Facturas necesita —`moneda`, `factura_numero`, `recibo_numero`— llegan en una migración que
 * todavía no se aplicó, y nombrarlas en el `select` haría que PostgREST devolviera error hasta que
 * alguien la corra: el portal entero quedaría vacío por una columna que falta. Con `*` llega lo que
 * exista y `aPagoDelPortal` trata la ausencia como ausencia. La tabla ya se lee entera en la
 * pantalla 32, así que no se está trayendo nada nuevo.
 *
 * El filtro por obra y el recorte de importes se aplican DESPUÉS, en funciones puras con test.
 */
export async function esquemaDelPortal(acceso: AccesoDelPortal): Promise<EsquemaDelPortal> {
  const sb = createAdminClient()
  const { data } = await sb.from('esquema_pago').select('*').eq('cliente_id', acceso.clienteId)
  const guardadas = (data ?? []) as unknown as FilaEsquema[]
  const filas = refrescarConCobranzas(guardadas, await cobranzasVivas(guardadas))

  const idsDeObra = [...new Set(filas.map((f) => f.obra_id).filter((id): id is string => !!id))]
  const { data: obras } = idsDeObra.length
    ? await sb.from('obra_canonica').select('id, nombre, estado, monto_contratado, contrato_moneda, contrato_monto').in('id', idsDeObra)
    : { data: [] as { id: string; nombre: string; estado: string | null; monto_contratado: number | null }[] }

  type FilaObra = { id: string; nombre: string; estado?: string | null; monto_contratado: number | null; contrato_moneda?: string | null; contrato_monto?: number | null }
  const filasObra = (obras ?? []) as FilaObra[]
  const nombres = new Map(filasObra.map((o) => [String(o.id), String(o.nombre)]))
  // EL CONTRATO EN LA MONEDA EN QUE SE FIRMÓ. Quattropani se firmó en U$S 63.000 por ajuste alzado:
  // publicar su equivalente en pesos publica un número que mañana está mal. `monto_contratado` queda
  // para los tableros internos, que suman en pesos; el portal usa el declarado cuando existe.
  // NULL no es cero: una obra sin contrato entra como `null` y la pantalla escribe «sin cargar».
  const contratos = new Map<string, { monto: number | null; moneda: 'ARS' | 'USD' }>(
    filasObra.map((o) => {
      const propio = o.contrato_monto == null ? null : Number(o.contrato_monto)
      const moneda = o.contrato_moneda === 'USD' ? 'USD' as const : 'ARS' as const
      return [String(o.id), propio != null
        ? { monto: propio, moneda }
        : { monto: o.monto_contratado == null ? null : Number(o.monto_contratado), moneda: 'ARS' as const }]
    }),
  )

  // EL ESTADO DE LA OBRA VIAJA CON EL PAGO. Es la definición canónica de «obra terminada» —la misma
  // que parte la lista del Inicio— y sin ella la pantalla de Pagos volvía a inventarse la suya.
  const cerradas = new Set(filasObra.filter((o) => esObraAnterior({ estado: o.estado ?? null }))
    .map((o) => String(o.id)))

  const visibles = pagosDelEsquema(filas, nombres, (obraId) => alcanzaLaObra(acceso.obras, obraId), cerradas)
  const pagos = acceso.puedeVerMontos ? visibles : sinImportes(visibles)
  return { pagos, bloques: agruparPorObra(pagos), contratos }
}


/**
 * LAS FILAS VIVAS DE COBRANZAS QUE LE CORRESPONDEN A ESTE ESQUEMA.
 *
 * Se piden por `sheet_id` —la columna A de la pestaña— y no por `cliente_id`: `cobranzas.cliente_id`
 * lo resuelve un sync por alias y hay filas donde no resolvió (4 de 96, medido el 10/09/2026).
 * Preguntar por el cliente dejaría esas filas sin refrescar y el portal seguiría publicando su copia
 * vieja, que es exactamente el defecto que este camino existe para cerrar.
 *
 * Sin ninguna fila con `cobranza_fila` no se consulta: un `.in()` vacío trae la tabla entera.
 */
async function cobranzasVivas(filas: FilaEsquema[]): Promise<FilaCobranzaViva[]> {
  const ids = [...new Set(filas
    .map((f) => f.cobranza_fila)
    .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
    .map((n) => String(n - FILA_BASE)))]
  if (!ids.length) return []
  const { data } = await createAdminClient()
    .from('cobranzas')
    .select('sheet_id, categoria, concepto, estado, fecha_cobro, monto_neto, monto_neto_origen, iva, total_bruto, total_bruto_origen, moneda, tipo_cambio')
    .eq('origen', 'cobranzas_sheet')
    .in('sheet_id', ids)
  return (data ?? []) as unknown as FilaCobranzaViva[]
}

// `contratoDelConjunto` vive en `esquema.ts` —módulo puro, sin `server-only`— para poder
// probarlo con `node --test`. Se re-exporta desde acá porque es donde lo buscan las pantallas.
export { contratoDelConjunto } from '../esquema'
export type { BloqueDeObra, PagoConObra, ContratoDeObra }
// El tipo vive con la regla que lo produce (`obrasDelCliente.ts`, puro y con test); se re-exporta
// desde acá porque es donde lo buscan las pantallas.
export type { ObraDelInicio }

/**
 * LAS OBRAS DEL CLIENTE PARA EL INICIO Y PARA DOCUMENTOS — desde `obra_canonica`, el registro real.
 *
 * No usa `obrasDelCliente` de `datos.ts` (que lee `public.obras`) a propósito: el alcance de un
 * acceso —`cliente_acceso.obras`— guarda ids de `obra_canonica`, así que preguntarle a la otra tabla
 * obliga a fallar cerrado cuando el acceso está acotado. Acá el filtro es exacto y un contacto con
 * acceso a dos obras ve exactamente esas dos.
 *
 * TAMPOCO USA `obra_panel`, que ya deja afuera las fusionadas: el portal necesita saber CUÁLES se
 * absorbieron para poder encontrar sus papeles, archivados bajo el id viejo. Se traen todas y el
 * recorte lo hace `obrasDelCliente`, que es puro y tiene test.
 */
export async function obrasParaElInicio(acceso: AccesoDelPortal): Promise<ObraDelInicio[]> {
  const { data } = await createAdminClient()
    .from('obra_canonica')
    .select('id, nombre, estado, fecha_inicio_real, fecha_inicio_plan, fecha_fin_real, drive_carpeta_id, fusionada_en')
    .eq('cliente_id', acceso.clienteId)
    .order('nombre')

  return obrasDelCliente(
    (data ?? []) as unknown as FilaObraCanonica[],
    (obraId) => alcanzaLaObra(acceso.obras, obraId),
  )
}
