import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccesoDelPortal } from '../permisos'
import { alcanzaLaObra } from '../permisos'
import {
  agruparPorObra, pagosDelEsquema, sinImportes,
  type BloqueDeObra, type FilaEsquema, type PagoConObra,
} from '../esquema'

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

export type ObraDetalle = {
  id: string
  nombre: string
  contrato: number | null
  fechaInicio: string | null
  fechaCierre: string | null
  estado: string
  driveCarpetaId: string | null
}

/**
 * Una obra de `public.obras`, para Documentos y Terminadas.
 *
 * Sigue siendo `public.obras` y no `obra_canonica` porque es el registro que esas dos pantallas —y
 * `obra_adjunto_cliente`— ya usan. El cronograma, en cambio, vive en `obra_canonica`. Que existan
 * dos registros de obra es un problema anterior a este archivo y está declarado en `datos.ts`.
 */
export async function obraDetalle(obraId: string): Promise<ObraDetalle | null> {
  const { data } = await createAdminClient()
    .from('obras')
    .select('id, nombre, monto_contratado, fecha_inicio, fecha_cierre, estado, drive_carpeta_id')
    .eq('id', obraId).maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    nombre: String(data.nombre),
    // `monto_contratado` puede no estar: NULL no es cero, y la pantalla lo dice.
    contrato: data.monto_contratado == null ? null : Number(data.monto_contratado),
    fechaInicio: data.fecha_inicio ?? null,
    fechaCierre: data.fecha_cierre ?? null,
    estado: String(data.estado),
    driveCarpetaId: data.drive_carpeta_id ?? null,
  }
}

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
  contratos: Map<string, number | null>
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
  const filas = (data ?? []) as unknown as FilaEsquema[]

  const idsDeObra = [...new Set(filas.map((f) => f.obra_id).filter((id): id is string => !!id))]
  const { data: obras } = idsDeObra.length
    ? await sb.from('obra_canonica').select('id, nombre, monto_contratado').in('id', idsDeObra)
    : { data: [] as { id: string; nombre: string; monto_contratado: number | null }[] }

  const filasObra = (obras ?? []) as { id: string; nombre: string; monto_contratado: number | null }[]
  const nombres = new Map(filasObra.map((o) => [String(o.id), String(o.nombre)]))
  const contratos = new Map<string, number | null>(
    // NULL no es cero: una obra sin contrato cargado entra al mapa como `null` y la pantalla escribe
    // «sin cargar» en vez de publicar un contrato de $ 0.
    filasObra.map((o) => [String(o.id), o.monto_contratado == null ? null : Number(o.monto_contratado)]),
  )

  const visibles = pagosDelEsquema(filas, nombres, (obraId) => alcanzaLaObra(acceso.obras, obraId))
  const pagos = acceso.puedeVerMontos ? visibles : sinImportes(visibles)
  return { pagos, bloques: agruparPorObra(pagos), contratos }
}


// `contratoDelConjunto` vive en `esquema.ts` —módulo puro, sin `server-only`— para poder
// probarlo con `node --test`. Se re-exporta desde acá porque es donde lo buscan las pantallas.
export { contratoDelConjunto } from '../esquema'
export type { BloqueDeObra, PagoConObra }

/** Una obra del cliente para el Inicio: sin un peso, sólo qué es y cómo va. */
export type ObraDelInicio = {
  id: string
  nombre: string
  /** `'en ejecución'`, `'terminada'`… tal como lo declara el registro. `null` = sin declarar. */
  estado: string | null
  /** `null` = SIN FECHA DE INICIO cargada. No se rellena con la de creación del registro. */
  desde: string | null
}

/**
 * LAS OBRAS DEL CLIENTE PARA EL INICIO — desde `obra_canonica`, el registro real.
 *
 * No usa `obrasDelCliente` (que lee `public.obras`) a propósito: el alcance de un acceso —
 * `cliente_acceso.obras` — guarda ids de `obra_canonica`, así que preguntarle a la otra tabla obliga
 * a fallar cerrado cuando el acceso está acotado. Acá el filtro es exacto y un contacto con acceso a
 * dos obras ve exactamente esas dos.
 */
export async function obrasParaElInicio(acceso: AccesoDelPortal): Promise<ObraDelInicio[]> {
  const { data } = await createAdminClient()
    .from('obra_canonica')
    .select('id, nombre, estado, fecha_inicio_real, fecha_inicio_plan')
    .eq('cliente_id', acceso.clienteId)
    .order('nombre')

  type Fila = { id: string; nombre: string; estado: string | null; fecha_inicio_real: string | null; fecha_inicio_plan: string | null }
  return ((data ?? []) as Fila[])
    .filter((o) => alcanzaLaObra(acceso.obras, String(o.id)))
    .map((o) => ({
      id: String(o.id),
      nombre: String(o.nombre),
      estado: o.estado ?? null,
      // La REAL manda sobre la planificada: es cuándo arrancó de verdad. Sin ninguna de las dos,
      // `null` — y la pantalla no escribe una fecha inventada.
      desde: o.fecha_inicio_real ?? o.fecha_inicio_plan ?? null,
    }))
    // Las cerradas al final: el cliente entra a ver lo que está en curso.
    .sort((a, b) => Number(a.estado === 'cerrada') - Number(b.estado === 'cerrada'))
}
