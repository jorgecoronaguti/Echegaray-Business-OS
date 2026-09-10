// EL MAPEO DEL CENSO DE CARPETAS: de una fila del LEFT JOIN al estado de la carpeta.
//
// Vive separado del script para poder probarlo sin base. La REGLA no está acá —está en
// `src/features/documentos/services/carpetaDeEntidad.ts`, la misma que usa la app—; lo que está acá
// es la traducción de la forma que devuelve SQL, que es donde se cuela el error silencioso:
//
//   UN LEFT JOIN QUE NO ENCONTRÓ NADA DEVUELVE LAS COLUMNAS EN NULL, no una fila ausente. Si esas
//   columnas se pasaran como si fueran la carpeta —`trashed: null`, `path: null`—, una carpeta
//   declarada que el catálogo no conoce se clasificaría como viva y vacía, en vez de `no_indexada`.
import { estadoDeCarpeta } from '../../src/features/documentos/services/carpetaDeEntidad.ts'

/** Una fila del censo, ya clasificada. `archivos` es la cuenta de descendientes del catálogo. */
export function clasificarFila(tipo, f) {
  // La fila de `drive_index` existe SÓLO si el join la encontró, y eso se prueba con `path`:
  // `drive_index.path` no es opcional para una carpeta indexada.
  const encontrada = f.path !== null && f.path !== undefined
  const carpeta = estadoDeCarpeta(tipo, f.carpeta_id, encontrada
    ? {
        drive_file_id: f.carpeta_id,
        path: f.path,
        is_folder: true,
        trashed: f.trashed,
        ausente_en_drive: f.ausente_en_drive,
        web_view_link: f.web_view_link,
      }
    : null)
  return {
    id: f.id,
    nombre: f.nombre,
    estado: carpeta.estado,
    path: carpeta.path,
    archivos: Number(f.archivos ?? 0),
    cliente_id: f.cliente_id ?? null,
    fusionada_en: f.fusionada_en ?? null,
  }
}

export const clasificar = (tipo, filas) => filas.map((f) => clasificarFila(tipo, f))
