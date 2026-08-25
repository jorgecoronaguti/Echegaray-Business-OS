// STUB hasta que aterrice back-28-32
//
// LO QUE EL PORTAL LEE — las firmas son las del CONTRATO 28–32; el cuerpo todavía no.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE VACÍO ═══
//
// Las pantallas `29` y `30` se portan en paralelo con las migraciones (`cliente_acceso`,
// `certificado_cliente`, `esquema_pago`, `consulta_portal`) y sus porteros, que los escribe el
// frente «back-28-32». Este archivo declara EXACTAMENTE los nombres del contrato para que ese
// trabajo entre reemplazando cuerpos, sin tocar una línea de las pantallas.
//
// ═══ EL VACÍO ES HONESTO, NO ES UNA LISTA VACÍA ═══
//
// Ninguna de estas funciones devuelve `[]`. Una lista vacía en el portal se lee «Echegaray no le
// emitió ningún certificado», y eso es una afirmación sobre la relación comercial que este código
// no puede hacer. Devuelven `data: null` con el motivo dicho —falta la capacidad en la base— y la
// pantalla escribe ese motivo. Es el mismo criterio que `features/empleado/services/empleadoService`
// usa para su migración, y el mismo que la regla «un control que no pudo mirar no dice “no está”».
//
// ═══ POR QUÉ NO RECIBEN EL `SupabaseClient` ═══
//
// El resto del repo pasa el cliente como primer parámetro. Acá no, y es a propósito: el contrato las
// nombra `getMiObra()` / `getMisCertificados()` sin argumentos porque TODAS son de la sesión — no
// existe «la obra de otro» que pedirles. El filtro no lo pone este archivo: lo ponen las policies de
// `cliente_de_sesion()` en la base. Si el filtro estuviera acá, una llamada directa a PostgREST con
// el token del cliente devolvería la cartera entera.

import { createClient } from '@/lib/supabase/server'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { CertificadoPortal, ConsultaPortal, DocumentoPortal, MiObra } from '../types'

/** La migración que trae el portal a la base. Su nombre se escribe en la pantalla cuando falta. */
export const MIGRACION_PORTAL = '20260825T1200_portal_del_cliente'

const noDisponible = (que: string): string =>
  `Todavía no puedo mostrar ${que}: falta aplicar en la base la migración ${MIGRACION_PORTAL}. `
  + 'No es que no haya nada — es que esta base no tiene la capacidad todavía.'

/**
 * El stub. Cuando `back-28-32` llegue, cada función reemplaza esta línea por su lectura real; el
 * `await createClient()` queda para que el reemplazo no tenga que agregarlo (y para que este archivo
 * falle acá, en el servidor, y no en el navegador, si alguien lo importa desde un componente cliente).
 */
async function pendiente<T>(que: string): Promise<ServiceResult<T>> {
  await createClient()
  return { data: null, error: noDisponible(que) }
}

/**
 * Quién sos, qué obras abrís y cuál estás mirando.
 *
 * @param obraId la obra del selector. Ausente = la primera que el acceso abre.
 */
export async function getMiObra(obraId?: string): Promise<ServiceResult<MiObra | null>> {
  void obraId
  return pendiente<MiObra | null>('su obra')
}

/** Los certificados y facturas del cliente, de todas sus obras (el `29` dice «todas sus obras»). */
export async function getMisCertificados(obraId?: string): Promise<ServiceResult<CertificadoPortal[]>> {
  void obraId
  return pendiente<CertificadoPortal[]>('sus certificados y facturas')
}

/** Los documentos de la obra publicados al cliente. */
export async function getMisDocumentos(obraId?: string): Promise<ServiceResult<DocumentoPortal[]>> {
  void obraId
  return pendiente<DocumentoPortal[]>('los documentos de su obra')
}

/**
 * Las consultas del cliente y su respuesta.
 *
 * NO ESTÁ EN LA LISTA DEL CONTRATO y se agrega acá: el `29` dibuja el bloque «Consultas» con tres
 * hilos y su estado, y el contrato sólo nombra `crearConsulta(...)`. Un alta sin lectura deja al
 * cliente escribiendo a un buzón que no puede volver a abrir.
 */
export async function getMisConsultas(): Promise<ServiceResult<ConsultaPortal[]>> {
  return pendiente<ConsultaPortal[]>('sus consultas')
}
