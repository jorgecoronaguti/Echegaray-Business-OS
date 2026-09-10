// LO QUE SE SUBIÓ DESDE LA PLATAFORMA — el control para cargar y la lista de lo cargado.
//
// Va JUNTO en un bloque a propósito: el botón que sube y la lista de lo subido son la misma
// pregunta («¿qué papeles tiene esta ficha en el OS?») y separarlos deja a alguien apretando un
// botón sin ver qué pasó.
//
// ═══ TRES ESTADOS, Y NINGUNO SE DIBUJA COMO LOS OTROS ═══
//
//   · la tabla no existe todavía  → migración sin aplicar; el control se esconde porque subir
//                                   guardaría el archivo en el bucket y perdería la fila.
//   · la lectura falló            → se dice, no se dibuja una lista vacía.
//   · no hay papeles              → eso sí es un cero, y recién acá significa «no hay».
//
// ═══ LA COPIA A DRIVE SE MUESTRA POR FILA ═══
//
// El papel entra al OS y se encola para la carpeta de Drive de la ficha. Mientras el consumidor del
// puente no exista, TODAS las filas van a decir «en cola para Drive», y eso es exactamente lo que
// hay que ver: una cola sin consumidor es un hecho, no un detalle de implementación.

import { Aviso, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoAbrir } from '@/shared/components/iconos'
import { fechaDeArchivo, tamano } from '../services/carpetaDeEntidad'
import { ROTULO_CATEGORIA, type TipoEntidad } from '../services/subidaDeDocumento'
import type { Subidos } from '../services/documentosSubidosService'
import { SubirDocumento } from './SubirDocumento'

/** Qué se le dice a la persona de la copia a Drive. */
const DRIVE: Record<string, string> = {
  pendiente: 'en cola para Drive',
  copiado: 'en Drive',
  error: 'no se pudo copiar a Drive',
  sin_carpeta: 'sin carpeta de Drive',
}

export function DocumentosSubidos({
  datos, tipo, entidadId, testid = 'documentos-subidos',
}: {
  datos: Subidos
  tipo: TipoEntidad
  entidadId: string
  testid?: string
}) {
  if (datos.pendienteDeMigracion) {
    return (
      <div data-testid={testid} data-estado="sin-migracion">
        <Aviso tono="warn" testid={`${testid}-sin-tabla`}>
          La carga de documentos desde la ficha está construida pero todavía no habilitada: falta
          aplicar la migración <code>20260910T2320_entidad_documento.sql</code>. El control no se
          muestra porque el archivo se guardaría en el bucket y la ficha nunca podría listarlo.
        </Aviso>
      </div>
    )
  }

  return (
    <div data-testid={testid} data-estado="ok">
      <SubirDocumento tipo={tipo} entidadId={entidadId} testid={`${testid}-subir`} />

      {datos.error && (
        <Aviso tono="neg" testid={`${testid}-error`}>No se pudieron leer los documentos: {datos.error}</Aviso>
      )}
      {!datos.error && datos.filas.length === 0 && (
        <Vacio>Todavía no se subió ningún documento desde la plataforma.</Vacio>
      )}
      {datos.filas.length > 0 && (
        <Tabla testid={`${testid}-tabla`} minWidth={640}>
          <THead>
            <Th>Documento</Th>
            <Th>Para qué sirve</Th>
            <Th>Cargado</Th>
            <Th>Drive</Th>
            <Th num>Tamaño</Th>
          </THead>
          <tbody>
            {datos.filas.map((f) => (
              <Tr key={f.id} compacta>
                <Td fuerte>
                  {/* SIN FIRMA NO HAY ENLACE, y no se dibuja uno muerto: un `href` vacío se ve igual
                      que uno bueno hasta que alguien lo aprieta. */}
                  {f.url
                    ? (
                        <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                          {f.nombre_archivo}
                          <IconoAbrir />
                        </a>
                      )
                    : <span title="No se pudo firmar el enlace">{f.nombre_archivo}</span>}
                  {f.descripcion && <span className="ml-2 text-[11.5px] text-faint">{f.descripcion}</span>}
                </Td>
                <Td>{ROTULO_CATEGORIA[f.categoria] ?? f.categoria}</Td>
                <Td>{fechaDeArchivo(f.creado_en)}</Td>
                <Td>
                  <span className={f.drive_estado === 'copiado' ? '' : 'text-muted'}>
                    {DRIVE[f.drive_estado] ?? f.drive_estado}
                  </span>
                </Td>
                <Td num>{tamano(f.tamano_bytes)}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {datos.filas.some((f) => f.drive_estado === 'pendiente') && (
        <p className="mt-2 text-[11.5px] text-faint" data-testid={`${testid}-cola`}>
          La copia a la carpeta de Drive queda encolada. El papel ya está guardado en el OS: lo que
          falta es el proceso que lo sube a Drive y compara la huella del archivo en el destino.
        </p>
      )}
    </div>
  )
}
