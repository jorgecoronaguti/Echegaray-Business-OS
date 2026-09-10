// LO QUE HAY EN LA CARPETA DE DRIVE DE ESTA ENTIDAD — leído del catálogo, no de Drive.
//
// ═══ QUÉ AGREGA SOBRE LA LISTA DE VÍNCULOS QUE YA EXISTE ═══
//
// Las fichas ya muestran lo VINCULADO: los papeles tipificados del legajo, los documentos que
// alguien ató a la obra. Este bloque muestra otra cosa —LO QUE ESTÁ EN LA CARPETA—, que es lo que
// el dueño pidió tres veces: que las carpetas de Drive se comuniquen con la plataforma. Un papel
// puede estar en la carpeta sin que nadie lo haya vinculado todavía; hasta hoy eso era invisible
// desde la app y había que ir a Drive a buscarlo a mano.
//
// ═══ NINGUNA DE LAS CINCO SITUACIONES SE DIBUJA COMO «SIN ARCHIVOS» ═══
//
// Sin carpeta declarada, carpeta fuera del catálogo, carpeta en la papelera, carpeta marcada
// ausente y carpeta vacía son cinco hechos distintos. La papelera es la peligrosa: se lee vacía y
// sin error, así que una carpeta con treinta papeles adentro se dibujaría igual que una vacía. Cada
// una tiene su frase en `MOTIVO`.
//
// ═══ Y LA LISTA DICE HASTA DÓNDE VE ═══
//
// La RLS de `drive_index` abre el catálogo entero a Dirección y Administración, y al resto sólo los
// archivos ya vinculados a lo suyo. Con `alcance: 'solo_vinculados'` la lista puede estar recortada
// y se dice: una lista recortada presentada como completa haría que alguien concluya que un papel
// no existe cuando lo que pasa es que no lo puede ver.

import { Aviso, Nulo, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoAbrir } from '@/shared/components/iconos'
import { enlaceDrive } from '../services/documentos'
import { MOTIVO, NOMBRE_DE_TIPO, tamano, type TipoEntidad } from '../services/carpetaDeEntidad'
import type { ArchivosDeEntidad } from '../services/carpetaDeEntidadService'

/** La fecha como se lee en una tabla: 10/09/2026. Sin hora — nadie decide con la hora de un papel. */
const fecha = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export function ArchivosDeDrive({
  datos, tipo, testid = 'archivos-de-drive',
}: {
  datos: ArchivosDeEntidad
  tipo: TipoEntidad
  testid?: string
}) {
  const { carpeta, archivos, alcance, truncado, error } = datos

  const encabezado = (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-[12.5px] text-muted" data-testid={`${testid}-titulo`}>
        {carpeta.estado === 'ok'
          ? <>En la carpeta de Drive de {NOMBRE_DE_TIPO[tipo]}: {archivos.length}{truncado ? '+' : ''} archivo{archivos.length === 1 ? '' : 's'}</>
          : <>Archivos en Drive</>}
      </p>
      {carpeta.drive_carpeta_id && (
        <a
          href={carpeta.web_view_link ?? `https://drive.google.com/drive/folders/${carpeta.drive_carpeta_id}`}
          target="_blank" rel="noreferrer"
          className="text-[12px] text-muted transition-colors hover:text-ink"
          data-testid={`${testid}-abrir-carpeta`}
        >abrir la carpeta en Drive →</a>
      )}
    </div>
  )

  // Los cuatro estados que NO son «pude mirar y esto hay». Se dicen con su motivo, y la ruta cuando
  // se conoce: sin la ruta, «no está en el catálogo» no le sirve a nadie para ir a buscarla.
  if (carpeta.estado !== 'ok') {
    return (
      <div data-testid={testid} data-estado={carpeta.estado}>
        {encabezado}
        <Aviso tono={carpeta.estado === 'en_papelera' ? 'warn' : 'info'} testid={`${testid}-motivo`}>
          {MOTIVO[carpeta.estado]}
          {carpeta.path && <span className="text-faint"> · {carpeta.path}</span>}
        </Aviso>
      </div>
    )
  }

  return (
    <div data-testid={testid} data-estado="ok">
      {encabezado}
      {error && <Aviso tono="neg" testid={`${testid}-error`}>No se pudo leer el catálogo: {error}</Aviso>}
      {!error && archivos.length === 0 && (
        <Vacio>La carpeta está en el catálogo y no tiene archivos adentro.</Vacio>
      )}
      {archivos.length > 0 && (
        <Tabla testid={`${testid}-tabla`} minWidth={620}>
          <THead>
            <Tr>
              <Th>Archivo</Th>
              <Th>Subcarpeta</Th>
              <Th>Modificado</Th>
              <Th num>Tamaño</Th>
            </Tr>
          </THead>
          <tbody>
            {archivos.map((a) => (
              <Tr key={a.drive_file_id} compacta>
                <Td fuerte>
                  <a
                    href={enlaceDrive(a.drive_file_id, a.web_view_link)}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-ink"
                  >
                    {a.name}
                    <IconoAbrir />
                  </a>
                  {/* La marca va PEGADA al nombre y no en una columna: es una propiedad del archivo
                      que cambia cómo se lee todo lo demás, no un atributo más para comparar. */}
                  {a.trashed && <span className="ml-2 text-[11px] text-warn">en la papelera</span>}
                  {a.ausente_en_drive && <span className="ml-2 text-[11px] text-faint">ausente en Drive</span>}
                </Td>
                <Td>{a.subcarpeta || <Nulo />}</Td>
                <Td>{fecha(a.modified_time)}</Td>
                <Td num>{tamano(a.size_bytes)}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {truncado && (
        <p className="mt-2 text-[11.5px] text-faint">
          Se muestran los primeros archivos por fecha. Hay más en la carpeta.
        </p>
      )}
      {alcance === 'solo_vinculados' && (
        <p className="mt-2 text-[11.5px] text-faint" data-testid={`${testid}-alcance`}>
          Se listan los archivos vinculados a lo suyo. El catálogo completo de la carpeta lo ven
          Dirección y Administración: que un papel no aparezca acá no prueba que no esté en Drive.
        </p>
      )}
    </div>
  )
}
