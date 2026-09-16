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
// ═══ LA FILA ES DENSA: FECHA · PARA QUÉ · DOCUMENTO · TAMAÑO · QUIÉN · DRIVE ═══
//
// La fecha que se lee primero es la DEL PAPEL (`fecha_documento`) y, si no se cargó, la de la
// subida: un examen médico de marzo subido en septiembre es de marzo. El certificado médico dice
// debajo qué días respalda y cuántos de esos días el jefe declaró como licencia: cero también se
// escribe, porque cero es «falta la marca del jefe», no «no pasó nada».
//
// ═══ LA COPIA A DRIVE SE MUESTRA POR FILA ═══
//
// El papel entra al OS y se encola para la carpeta de Drive de la ficha. Mientras el consumidor del
// puente no exista, TODAS las filas van a decir «en cola para Drive», y eso es exactamente lo que
// hay que ver: una cola sin consumidor es un hecho, no un detalle de implementación.

import { Aviso, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoAbrir } from '@/shared/components/iconos'
import { urlDeDrive } from '@/features/obras/services/driveUrl'
import { diaMesAnioISO } from '@/shared/utils/fecha'
import { fechaDeArchivo, tamano } from '../services/carpetaDeEntidad'
import { ROTULO_CATEGORIA, type TipoEntidad } from '../services/subidaDeDocumento'
import { fraseDeCobertura } from '../services/certificadoDeLicencia'
import type { DocumentoSubido, Subidos } from '../services/documentosSubidosService'
import { SubirDocumento } from './SubirDocumento'

/** Qué se le dice a la persona de la copia a Drive. */
const DRIVE: Record<string, string> = {
  pendiente: 'en cola para Drive',
  copiado: 'en Drive',
  error: 'no se pudo copiar a Drive',
  sin_carpeta: 'sin carpeta de Drive',
}

export function DocumentosSubidos({
  datos, tipo, entidadId, testid = 'documentos-subidos', carpetaDrive = null,
}: {
  datos: Subidos
  tipo: TipoEntidad
  entidadId: string
  testid?: string
  /** La carpeta de Drive de la ficha, para el enlace discreto. `null` = no hay carpeta. */
  carpetaDrive?: string | null
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
        <Tabla testid={`${testid}-tabla`} minWidth={720}>
          <THead>
            <Th>Fecha</Th>
            <Th>Para qué sirve</Th>
            <Th>Documento</Th>
            <Th num>Tamaño</Th>
            <Th>Quién</Th>
            <Th>Drive</Th>
          </THead>
          <tbody>
            {datos.filas.map((f) => <Fila key={f.id} f={f} />)}
          </tbody>
        </Tabla>
      )}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {datos.filas.some((f) => f.drive_estado === 'pendiente')
          ? (
              <p className="text-[11.5px] text-faint" data-testid={`${testid}-cola`}>
                La copia a la carpeta de Drive queda encolada: el papel ya está guardado en el OS.
              </p>
            )
          : <span />}
        {carpetaDrive && (
          <a
            href={urlDeDrive(carpetaDrive, 'carpeta')} target="_blank" rel="noreferrer"
            className="text-[12px] text-muted transition-colors hover:text-ink" data-testid={`${testid}-carpeta`}
          >Carpeta en Drive →</a>
        )}
      </div>
    </div>
  )
}

function Fila({ f }: { f: DocumentoSubido }) {
  const certificado = f.licencia_desde && f.licencia_hasta
  return (
    <Tr compacta>
      {/* LA FECHA DEL PAPEL, y si no se cargó, la de la subida. Se distinguen por el tono: la
          segunda es un dato de auditoría que suple al que falta, no el mismo dato. */}
      <Td>
        {f.fecha_documento
          ? <span className="font-mono tabular-nums">{diaMesAnioISO(f.fecha_documento)}</span>
          : <span className="font-mono tabular-nums text-muted" title="Fecha de la subida: el papel no tiene fecha cargada">{fechaDeArchivo(f.creado_en)}</span>}
      </Td>
      <Td>{ROTULO_CATEGORIA[f.categoria] ?? f.categoria}</Td>
      <Td fuerte>
        {/* SIN FIRMA NO HAY ENLACE, y no se dibuja uno muerto: un `href` vacío se ve igual que uno
            bueno hasta que alguien lo aprieta. */}
        {f.url
          ? (
              <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                {f.nombre_archivo}
                <IconoAbrir />
              </a>
            )
          : <span title="No se pudo firmar el enlace">{f.nombre_archivo}</span>}
        {f.descripcion && <span className="ml-2 text-[11.5px] font-normal text-faint">{f.descripcion}</span>}
        {certificado && (
          <span className="block text-[11.5px] font-normal text-muted" data-testid="cobertura-certificado">
            {diaMesAnioISO(f.licencia_desde as string)} → {diaMesAnioISO(f.licencia_hasta as string)}
            {' · '}
            {f.cubre === null ? 'sin cruzar con la licencia declarada' : fraseDeCobertura(f.cubre)}
          </span>
        )}
      </Td>
      <Td num>{tamano(f.tamano_bytes)}</Td>
      <Td>{f.subido_por_nombre ?? <span className="text-faint">—</span>}</Td>
      <Td>
        <span className={f.drive_estado === 'copiado' ? '' : 'text-muted'}>
          {DRIVE[f.drive_estado] ?? f.drive_estado}
        </span>
      </Td>
    </Tr>
  )
}
