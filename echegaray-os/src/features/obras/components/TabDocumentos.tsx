'use client'

// 12 · OBRA DOCUMENTOS — el papel que la obra necesita, a un clic, sin salir del OS.
//
// ═══ AGRUPADO POR PARA QUÉ SIRVE (Design canónico 23/08, pantalla 12) ═══
//
// «Los documentos se agrupan por para qué sirven, no por tipo de archivo». El grupo ES la categoría
// que alguien declaró en `rol` —Planos, Contrato, Seguridad, Certificaciones, Compras— con su frase
// al lado cuando el OS sabe para qué sirve, y con «Sin clasificar» al final, que es trabajo
// pendiente y no una categoría más.
//
// La categoría dejó de ser una COLUMNA: repetirla en cada fila del mismo grupo es escribir cuatro
// veces lo que la cabecera ya dice una. Los grupos se pliegan (patrón *grouped rows*) y nacen
// abiertos: una obra tiene entre cuatro y treinta papeles, y arrancar con todo cerrado obligaría a
// abrir cuatro grupos para ver una lista que entra en una pantalla.
//
// EL BUSCADOR FILTRA AL TECLEAR y arrastra al grupo: buscar «seguridad» trae el grupo entero,
// buscar «columnas» trae la fila con su cabecera. La regla vive en `porCategoriaFiltrado` —una
// función pura y probada—, no acá: `node --test` no sabe leer un `.tsx`.
//
// ═══ QUÉ ES ESTA PANTALLA Y QUÉ NO ES ═══
//
// Es un ÍNDICE, no un repositorio. El contrato, los planos y el presupuesto viven en Drive con sus
// permisos y su historial de versiones; acá vive la respuesta a "¿cuál de los 2.467 archivos del
// Drive es el contrato de ESTA obra?", que hoy sólo está en la cabeza de alguien. Por eso el nombre
// es un enlace y no un visor: el clic termina en Drive, que es donde el archivo es la verdad.
//
// ═══ LA COLUMNA RELACIÓN ═══
//
// «Confirmado» = una persona afirmó que este archivo es de esta obra. «Inferido» = lo dedujo el OS
// por la ruta del archivo. Es la misma distinción HECHO vs INFERENCIA que gobierna todo el resto
// del sistema, y va en la tabla y no en un tooltip porque cambia cuánto vale lo que se está mirando.
// Ninguno de los dos lleva color: no son un problema ni un logro, son el nivel de certeza.

import { useMemo, useState } from 'react'
import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  Ayuda, BotonEnlace, Buscador, CAMPO, Campo, FilaGrupo, Nulo, Tabla, Td, Th, THead, Tr, Vacio,
} from '@/shared/components/ds'
import { IconoAbrir, IconoDocumento } from '@/shared/components/iconos'
import type { Actividad, DocumentoObra, TipoDrive } from '../types'
import { AsignarActividad } from './AsignarActividad'
import { etiquetaDeTipo, urlDeDrive } from '../services/driveUrl'
import {
  CATEGORIAS_SUGERIDAS, SIN_CLASIFICAR, paraQueSirve, porCategoriaFiltrado,
} from '../services/documentosCategoria'
import { fecha as fmtFecha } from './formato'

/** Cómo se lee cada origen. Un mapa y no un ternario: el día que se agregue un cuarto, el ternario
 *  lo dibujaría como «Inferido» sin que nadie lo note. */
const ORIGEN: Record<DocumentoObra['origen'], string> = {
  confirmado: 'Confirmado',
  carpeta_drive: 'Carpeta de Drive',
  inferido: 'Inferido',
}

/** A partir de acá el buscador vale la fila que ocupa. Con seis papeles a la vista, filtrar es un
 *  control que nadie toca; con veinte, es la única forma de encontrar uno. */
const FILAS_PARA_BUSCAR = 12

/**
 * El alta, plegada. Hay DOS y no una: el handoff dibuja un solo «Vincular documento», pero un id de
 * Drive pelado no dice si es un archivo o una carpeta, y abrir un id de carpeta como archivo da 404
 * (ver `driveUrl.ts`). Preguntar cuál es al elegir el formulario cuesta un clic; adivinarlo cuesta
 * un vínculo roto que nadie descubre hasta tres semanas después.
 */
function Vincular({
  tipo, accion, testid,
}: {
  tipo: TipoDrive
  accion: AccionFormulario
  testid: string
}) {
  const esCarpeta = tipo === 'carpeta'
  return (
    <details className="w-full min-w-0 sm:w-auto" data-testid={testid}>
      <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">
        Vincular {esCarpeta ? 'carpeta' : 'documento'}
      </summary>
      <div className="mt-3 w-full border-t border-[#EFEEEA] pt-3.5 sm:w-[440px]">
        <FormAccion accion={accion} testid={`${testid}-form`} enviar="Vincular" limpiarAlOk mensajeOk="Vinculado.">
          {/* El tipo viaja en el formulario y el `obra_id` NO: uno es una preferencia de quien
              carga, el otro decide sobre qué obra se escribe. */}
          <input type="hidden" name="tipo" value={tipo} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo
              rotulo={esCarpeta ? 'Enlace de la carpeta' : 'Enlace del archivo'}
              className="sm:col-span-3"
              ayuda="El que da el botón Compartir de Drive. También sirve el id."
            >
              <input
                name="enlace"
                required
                maxLength={500}
                placeholder={esCarpeta
                  ? 'https://drive.google.com/drive/folders/…'
                  : 'https://drive.google.com/file/d/…'}
                className={CAMPO}
              />
            </Campo>
            <Campo rotulo="Nombre" className="sm:col-span-2" ayuda="Sólo si el archivo no está en el índice de Drive.">
              <input name="nombre" maxLength={300} className={CAMPO} />
            </Campo>
            <Campo rotulo="Para qué sirve" ayuda="Contrato, plano, seguridad…">
              <input name="rol" maxLength={120} list="categorias-documento-obra" className={CAMPO} />
              <datalist id="categorias-documento-obra">
                {CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}

export function TabDocumentos({
  documentos, carpetaDriveId, vincular, desvincular, actividades = [], asignarActividad,
}: {
  documentos: DocumentoObra[]
  /** El cronograma vivo, para poder decir de qué actividad es un papel. Sin él no se dibuja el
   *  desplegable: uno vacío es peor que no tenerlo. */
  actividades?: Actividad[]
  asignarActividad?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  /** `obra_canonica.drive_carpeta_id`. Null en las ocho obras de hoy: nadie la declaró todavía. */
  carpetaDriveId: string | null
  vincular: AccionFormulario
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  const asignar = actividades.length > 0 ? asignarActividad : undefined
  const [query, setQuery] = useState('')
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set())

  const grupos = useMemo(() => porCategoriaFiltrado(documentos, query), [documentos, query])
  const columnas = asignar ? 5 : 4
  const plegar = (c: string) => setPlegados((p) => {
    const s = new Set(p)
    if (s.has(c)) s.delete(c); else s.add(c)
    return s
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="text-[13px] text-muted">
          Carpeta de la obra en Drive:{' '}
          {carpetaDriveId
            ? <span className="text-ink">vinculada</span>
            : <Nulo>sin vincular · se carga en Resumen › Editar la obra</Nulo>}
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:ml-auto">
          {documentos.length >= FILAS_PARA_BUSCAR && (
            <Buscador
              value={query}
              onChange={setQuery}
              placeholder="Buscar documento o categoría"
              testid="buscar-documento-obra"
              className="w-[220px]"
            />
          )}
          <Vincular tipo="archivo" accion={vincular} testid="vincular-archivo" />
          <Vincular tipo="carpeta" accion={vincular} testid="vincular-carpeta" />
          {/* LA PRIMARIA DE LA PANTALLA. Sólo existe cuando hay carpeta declarada: un botón que
              lleva a ningún lado es peor que no tener botón. */}
          {carpetaDriveId && (
            <BotonEnlace
              href={`https://drive.google.com/drive/folders/${carpetaDriveId}`}
              variante="primaria"
              target="_blank"
              rel="noreferrer"
              data-testid="abrir-carpeta-obra"
            >
              Abrir carpeta
            </BotonEnlace>
          )}
        </div>
      </div>

      {documentos.length === 0 ? (
        <Vacio>
          Todavía no hay ningún documento vinculado a esta obra. Se vincula pegando el enlace que da
          el botón Compartir de Drive.
        </Vacio>
      ) : grupos.length === 0 ? (
        <Vacio accion={
          <button type="button" onClick={() => setQuery('')} data-testid="limpiar-busqueda"
            className="text-[13px] font-medium text-ink hover:underline">Ver todo</button>
        }>
          Ningún documento coincide.
        </Vacio>
      ) : (
        <>
          <Tabla testid="tabla-documentos" minWidth={820}>
            <THead>
              <Th>Nombre</Th><Th>Relación</Th>
              {asignar && <Th>Actividad</Th>}
              <Th num>Fecha</Th><Th num />
            </THead>
            <tbody>
              {grupos.map(({ categoria, docs }) => (
                <GrupoDocumentos
                  key={categoria}
                  categoria={categoria}
                  docs={docs}
                  columnas={columnas}
                  abierto={!plegados.has(categoria)}
                  onToggle={() => plegar(categoria)}
                  actividades={actividades}
                  asignar={asignar}
                  desvincular={desvincular}
                />
              ))}
            </tbody>
          </Tabla>
          {/* 22/08/2026 · Era un párrafo permanente al pie de la tabla explicando cómo funciona la
              pantalla. Baja ENTERO a la ayuda, incluida la consecuencia de «Quitar»: `BotonAccion`
              no acepta un `title`, y ensancharlo para meter una frase es un cambio de un componente
              compartido que esta tarea no justifica. La frase sigue estando y sigue encontrándose
              con Ctrl+F — cerrar el `details` no la saca del documento. */}
          <Ayuda titulo="De dónde salen estos papeles" testid="ayuda-documentos-obra">
            Los papeles se leen de Drive: acá se agrupan por para qué sirven y se cuelgan de la
            actividad que los usa. Nada se copia — quitar un documento corta el vínculo, no borra el
            archivo.
          </Ayuda>
        </>
      )}
    </div>
  )
}

/** Un grupo: su cabecera plegable y sus filas. Separado para que ninguna función pase de 50 líneas
 *  y para que la fila del papel se lea de una sola vez. */
function GrupoDocumentos({
  categoria, docs, columnas, abierto, onToggle, actividades, asignar, desvincular,
}: {
  categoria: string
  docs: DocumentoObra[]
  columnas: number
  abierto: boolean
  onToggle: () => void
  actividades: Actividad[]
  asignar?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  const sinClasificar = categoria === SIN_CLASIFICAR
  const para = paraQueSirve(categoria)
  return (
    <>
      <FilaGrupo
        titulo={categoria}
        cuenta={docs.length}
        abierto={abierto}
        onToggle={onToggle}
        colSpan={columnas}
        testid={`grupo-documentos-${sinClasificar ? 'sin-clasificar' : categoria}`}
        /* «PARA QUÉ SIRVE» ES EL TÍTULO DEL GRUPO, NO UN SUBTÍTULO DECORATIVO: la categoría sin
           clasificar no dice para qué sirve porque nadie lo declaró, y eso se dice en `warn` —es
           trabajo pendiente— y no en gris, que se leería como «da igual». */
        derecha={para && (
          <span className={`text-[11.5px] ${sinClasificar ? 'text-warn' : 'text-muted'}`}>{para}</span>
        )}
      />
      {abierto && docs.map((d) => (
        <Tr key={d.drive_file_id} className="group" {...{ 'data-testid': 'fila-documento-obra' }}>
          <Td fuerte className="max-w-[320px]">
            <span className="flex min-w-0 items-center gap-2">
              <IconoDocumento className="h-[14px] w-[14px] shrink-0 text-faint" />
              <span className="min-w-0">
                <a
                  href={urlDeDrive(d.drive_file_id, d.tipo)}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="documento-enlace"
                  className="flex items-center gap-1.5 truncate text-[13px] text-ink hover:underline"
                >
                  {/* Sin nombre se muestra el id: es feo y es la verdad. Un rótulo inventado
                      sería peor que feo. */}
                  {d.name ?? d.drive_file_id}
                  <IconoAbrir className="h-[12px] w-[12px] shrink-0 text-faint" />
                </a>
                <span className="block truncate text-[11px] text-faint">
                  {etiquetaDeTipo(d.tipo, d.mime_type, d.name)}
                  {d.path ? ` · ${d.path}` : ''}
                </span>
              </span>
            </span>
          </Td>
          {/* TRES ORÍGENES Y NO DOS: «carpeta de Drive» es evidencia dura —el archivo vive
              adentro de la carpeta que declara la obra— pero ninguna persona lo afirmó.
              Llamarlo «Confirmado» borraría justo lo que hay que poder revisar. */}
          <Td>{ORIGEN[d.origen] ?? 'Inferido'}</Td>
          {asignar && (
            <Td>
              <AsignarActividad
                driveFileId={d.drive_file_id}
                actual={d.actividad_id}
                actividades={actividades}
                asignar={asignar}
              />
            </Td>
          )}
          <Td num className="whitespace-nowrap text-muted">
            {d.modified_time ? fmtFecha(d.modified_time) : <Nulo>sin fecha</Nulo>}
          </Td>
          <Td num>
            {/* Cortar el vínculo aparece al apoyar el mouse: es la acción menos frecuente
                de la fila y no compite con el nombre del papel. */}
            <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <BotonAccion
                accion={desvincular}
                args={[d.drive_file_id]}
                testid="desvincular-documento"
                tono="peligro"
              >
                Quitar
              </BotonAccion>
            </span>
          </Td>
        </Tr>
      ))}
    </>
  )
}
