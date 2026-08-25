import { hoyEnObra } from '@/features/jefe/services/contexto'
import { getMiObra, getMisCertificados, getMisConsultas, getMisDocumentos } from './portalService'
import type { CertificadoPortal, ConsultaPortal, DocumentoPortal, MiObra } from '../types'

// LO QUE LEE EL PORTAL, EN UNA SOLA TANDA — lo usan `/portal` y `/portal/obra/[obra]`, que dibujan
// exactamente la misma pantalla con otra obra elegida.
//
// ═══ LAS CUATRO LECTURAS VAN EN PARALELO ═══
//
// Son independientes entre sí. En serie, la pantalla tarda la suma; con `Promise.all`, la más lenta.
// El dueño rechazó cuatro entregas diciendo, entre otras cosas, «el sitio es lento».
//
// ═══ UN ERROR NO BORRA LA PANTALLA ═══
//
// Si los documentos no se pueden leer, el cliente igual tiene que poder ver sus certificados. Cada
// motivo se junta en `avisos` y se escribe arriba de la columna; NUNCA se cambia por una lista
// vacía, que se leería como «no hay nada».
//
// ═══ «HOY» SE RESUELVE EN EL SERVIDOR Y EN LA ZONA DE LA OBRA ═══
//
// De eso dependen «vencido», «en 24 d» y el día resaltado del calendario. Leído en el navegador, el
// cliente que abre el portal desde otro huso vería vencimientos corridos un día; leído en UTC, a
// partir de las 21:00 de San Juan «hoy» sería mañana.

export interface DatosDelPortal {
  miObra: MiObra | null
  certificados: CertificadoPortal[]
  documentos: DocumentoPortal[]
  consultas: ConsultaPortal[]
  hoy: string
  avisos: string[]
}

export async function cargarPortal(obraId?: string): Promise<DatosDelPortal> {
  const [mi, certificados, documentos, consultas] = await Promise.all([
    getMiObra(obraId),
    getMisCertificados(obraId),
    getMisDocumentos(obraId),
    getMisConsultas(),
  ])

  const avisos = [...new Set(
    [mi.error, certificados.error, documentos.error, consultas.error].filter((e): e is string => !!e),
  )]

  return {
    miObra: mi.data ?? null,
    certificados: certificados.data ?? [],
    documentos: documentos.data ?? [],
    consultas: consultas.data ?? [],
    hoy: hoyEnObra(),
    avisos,
  }
}
