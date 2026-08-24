'use client'

// 12 · OBRA DOCUMENTOS — el papel que la obra necesita, a un clic, sin salir del OS.
//
// ═══ AGRUPADO POR PARA QUÉ SIRVE (Design canónico 23/08, pantalla 12) ═══
//
// «Los documentos se agrupan por para qué sirven, no por tipo de archivo». Cuatro grupos fijos
// —Planos y documentación técnica · Contrato y cliente · Seguridad e higiene · Evidencia de obra—
// con su frase al lado, y «Sin clasificar» al final, que es trabajo pendiente y no una categoría
// más. El vocabulario y el porqué viven en `documentosCategoria.ts`.
//
// LOS GRUPOS VACÍOS SE DIBUJAN IGUAL, CON SU CERO. Es el cambio que hace que la pantalla sirva:
// hasta hoy sólo aparecían los grupos con papeles adentro, así que una obra sin contrato cargado
// se veía idéntica a una obra con el contrato cargado. Un cero es información — y además es la
// invitación a clasificar, que es lo que hace falta con 32 papeles sin categoría.
//
// La categoría no se repite como texto en cada fila: la cabecera ya la dice. Lo que hay en la fila
// es el CONTROL para moverla, escondido hasta que se apoya el mouse en los grupos ya clasificados
// (ver `CeldaCategoriaDocumento`). Los grupos se pliegan (patrón *grouped rows*) y nacen abiertos:
// una obra tiene entre cuatro y treinta papeles, y arrancar con todo cerrado obligaría a abrir
// cuatro grupos para ver una lista que entra en una pantalla.
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
  Ayuda, BotonEnlace, Buscador, CAMPO, Campo, FilaGrupo, Filtros, Nulo, Tabla, Td, Th, THead, Tr,
  Vacio,
} from '@/shared/components/ds'
import { IconoAbrir, IconoDocumento, IconoFoto } from '@/shared/components/iconos'
import type { Actividad, DocumentoObra, TipoDrive } from '../types'
import { AsignarActividad } from './AsignarActividad'
import { etiquetaDeTipo, urlDeDrive } from '../services/driveUrl'
import {
  CATEGORIAS, CATEGORIAS_CANONICAS, SIN_CLASIFICAR, categoriaDeclarada, paraQueSirve,
  porCategoriaFiltrado,
} from '../services/documentosCategoria'
import { requiereAtencion, ultimosCambios } from '../services/documentosPaneles'
import { CeldaCategoriaDocumento } from './CeldaCategoriaDocumento'
import { PanelDocumentos } from './PanelDocumentos'
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
 * LOS DOS TRAZOS QUE EL CANÓNICO DIBUJA Y EL BARRIL NO TIENE (`P.plano` y `P.seguridad`).
 *
 * Viven acá y no en `shared/components/iconos.tsx` por lo mismo que `IconoClima` vive en
 * `TabOperacion`: ese archivo lo están tocando otros frentes del mismo rediseño y un icono de una
 * sola pantalla no justifica un conflicto de merge. Si una segunda pantalla los necesita, suben.
 */
function IconoPlano({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" /><path d="M9 4v13M15 7v13" />
    </svg>
  )
}

function IconoEscudo({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" />
    </svg>
  )
}

/** El icono de cada grupo, del canónico. `Sin clasificar` no tiene: no es una categoría más. */
const ICONO_GRUPO: Record<string, (p: { className?: string }) => React.JSX.Element> = {
  [CATEGORIAS.PLANOS]: IconoPlano,
  [CATEGORIAS.CONTRATO]: IconoDocumento,
  [CATEGORIAS.SEGURIDAD]: IconoEscudo,
  [CATEGORIAS.EVIDENCIA]: IconoFoto,
}

/** El rótulo corto del chip. El nombre entero es el título del grupo; repetirlo en el chip da una
 *  fila de filtros que ocupa dos renglones y se lee peor. */
const CHIP_CORTO: Record<string, string> = {
  [CATEGORIAS.PLANOS]: 'Planos',
  [CATEGORIAS.CONTRATO]: 'Contrato',
  [CATEGORIAS.SEGURIDAD]: 'Seguridad',
  [CATEGORIAS.EVIDENCIA]: 'Evidencia',
  [SIN_CLASIFICAR]: 'Sin clasificar',
}

/** El chip del canónico: rótulo y, al lado, su número en monoespaciada. El número no se pega al
 *  texto con un punto medio — es un dato, y los datos van en mono en todo el OS. */
function ChipCuenta({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="font-mono text-[10.5px] tabular-nums text-faint">{n}</span>
    </span>
  )
}

/**
 * EL RESUMEN DEL GRUPO, a la derecha de su cabecera.
 *
 * El canónico escribe ahí «1 para resolver» / «3 al día» a partir de vencimientos y revisiones, que
 * `obra_documento` NO tiene (ver `documentosPaneles.ts`). Lo que sí es verificable contra las filas
 * es cuántos vínculos nadie confirmó, y cuántos papeles nadie clasificó. Eso es lo que se publica:
 * la misma forma del dibujo, con el único trabajo pendiente que los datos prueban.
 */
function resumenGrupo(categoria: string, docs: DocumentoObra[]): { texto: string; alerta: boolean } | null {
  if (docs.length === 0) return null
  if (categoria === SIN_CLASIFICAR) return { texto: `${docs.length} para clasificar`, alerta: true }
  const sinConfirmar = docs.filter((d) => d.origen !== 'confirmado').length
  return sinConfirmar > 0
    ? { texto: `${sinConfirmar} sin confirmar`, alerta: true }
    : { texto: `${docs.length} confirmados`, alerta: false }
}

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
            {/* El alta ofrece EL MISMO vocabulario que la tabla. Sigue siendo un `datalist` y no un
                `select`: se puede dejar vacío —y entonces el papel cae en «Sin clasificar», que es
                honesto— y se puede escribir otra cosa, porque `rol` es texto libre en la base. */}
            <Campo rotulo="Para qué sirve" ayuda="Se puede dejar vacío y clasificarlo después.">
              <input name="rol" maxLength={120} list="categorias-documento-obra" className={CAMPO} />
              <datalist id="categorias-documento-obra">
                {CATEGORIAS_CANONICAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}

export function TabDocumentos({
  documentos, carpetaDriveId, vincular, desvincular, actividades = [], asignarActividad, clasificar,
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
  /** Escribe `obra_documento.rol`. Sin ella la pantalla es de sólo lectura y no se dibuja el
   *  selector: un control que no guarda es peor que no tenerlo. */
  clasificar?: (driveFileId: string, categoria: string) => Promise<ResultadoAccion>
}) {
  const asignar = actividades.length > 0 ? asignarActividad : undefined
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<string | null>(null)
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set())

  const grupos = useMemo(() => porCategoriaFiltrado(documentos, query, chip), [documentos, query, chip])
  // Los conteos de los chips salen de TODOS los papeles, no de los filtrados: un chip que dice «0»
  // porque el otro chip está apretado es un número que miente.
  const cuentas = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of documentos) {
      const c = categoriaDeclarada(d.rol)
      m.set(c, (m.get(c) ?? 0) + 1)
    }
    return m
  }, [documentos])
  const avisos = useMemo(() => requiereAtencion(documentos), [documentos])
  const cambios = useMemo(() => ultimosCambios(documentos), [documentos])
  const columnas = 4 + (asignar ? 1 : 0) + (clasificar ? 1 : 0)
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

      {/* LOS CHIPS DE CATEGORÍA. Están los cinco grupos siempre, con su conteo — también en cero:
          «Contrato y cliente · 0» es la forma más corta de decir que a esta obra le falta el
          contrato. Filtrar es una elección explícita, así que el chip deja el grupo aunque quede
          vacío; el buscador, en cambio, esconde los grupos sin coincidencias. */}
      {documentos.length > 0 && (
        <Filtros
          testid="chips-categoria-documento"
          opciones={[
            {
              label: <ChipCuenta label="Todo" n={documentos.length} />,
              onClick: () => setChip(null),
              activo: chip === null,
              testid: 'chip-todo',
            },
            ...[...CATEGORIAS_CANONICAS, SIN_CLASIFICAR].map((c) => ({
              label: <ChipCuenta label={CHIP_CORTO[c] ?? c} n={cuentas.get(c) ?? 0} />,
              onClick: () => setChip(c),
              activo: chip === c,
              testid: `chip-${c === SIN_CLASIFICAR ? 'sin-clasificar' : c}`,
            })),
          ]}
        />
      )}

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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <Tabla testid="tabla-documentos" minWidth={clasificar ? 980 : 820}>
                <THead>
                  <Th>Nombre</Th><Th>Relación</Th>
                  {asignar && <Th>Actividad</Th>}
                  {clasificar && <Th>Categoría</Th>}
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
                      clasificar={clasificar}
                      desvincular={desvincular}
                    />
                  ))}
                </tbody>
              </Tabla>
            </div>
            <PanelDocumentos avisos={avisos} cambios={cambios} irA={setChip} />
          </div>
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
  categoria, docs, columnas, abierto, onToggle, actividades, asignar, clasificar, desvincular,
}: {
  categoria: string
  docs: DocumentoObra[]
  columnas: number
  abierto: boolean
  onToggle: () => void
  actividades: Actividad[]
  asignar?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  clasificar?: (driveFileId: string, categoria: string) => Promise<ResultadoAccion>
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  const sinClasificar = categoria === SIN_CLASIFICAR
  const para = paraQueSirve(categoria)
  const Icono = ICONO_GRUPO[categoria]
  const resumen = resumenGrupo(categoria, docs)
  return (
    <>
      <FilaGrupo
        /* EL TÍTULO DEL CANÓNICO ES ICONO + NOMBRE + PARA QUÉ SIRVE, los tres en el mismo renglón.
           «Para qué sirve» NO es un subtítulo decorativo: es lo que hace que quien busca el papel
           para cobrar sepa dónde mirar sin abrir cuatro grupos. La categoría sin clasificar no dice
           para qué sirve porque nadie lo declaró, y eso se escribe en `warn` —es trabajo pendiente—
           y no en gris, que se leería como «da igual». */
        titulo={
          <span className="flex min-w-0 items-center gap-2">
            {Icono && <Icono className="h-[14px] w-[14px] shrink-0 text-muted" />}
            <span className="truncate">{categoria}</span>
            {para && (
              <span className={`truncate font-normal ${sinClasificar ? 'text-warn' : 'text-muted'}`}>{para}</span>
            )}
          </span>
        }
        cuenta={docs.length}
        abierto={abierto}
        onToggle={onToggle}
        colSpan={columnas}
        testid={`grupo-documentos-${sinClasificar ? 'sin-clasificar' : categoria}`}
        derecha={resumen && (
          <span
            data-testid="resumen-grupo-documentos"
            className={`font-mono text-[11.5px] tabular-nums ${resumen.alerta ? 'text-warn' : 'text-muted'}`}
          >
            {resumen.texto}
          </span>
        )}
      />
      {/* EL GRUPO VACÍO DICE QUÉ FALTA. No es un estado de error ni un «no hay resultados»: es la
          ausencia de un papel que la obra debería tener, escrita donde se busca ese papel. */}
      {abierto && docs.length === 0 && (
        <Tr>
          <Td colSpan={columnas} className="text-[12.5px] text-faint">
            Ningún documento en este grupo todavía.
          </Td>
        </Tr>
      )}
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
          {clasificar && (
            <Td>
              <CeldaCategoriaDocumento doc={d} clasificar={clasificar} />
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
