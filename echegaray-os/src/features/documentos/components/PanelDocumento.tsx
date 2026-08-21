// EL PANEL DE UN DOCUMENTO — lo que se sabe del archivo, la puerta a Drive, y su vencimiento.
//
// ═══ LA PREVISUALIZACIÓN ES OPCIONAL Y SE PIDE ═══
//
// El visor de Drive se embebe con una URL (`/preview`), no con una integración: no hay credenciales
// de Google en esta app y el archivo no se copia a ningún lado. Pero el iframe carga con la sesión
// de Google DEL NAVEGADOR: quien no tenga acceso al archivo —o no esté logueado en Google en esa
// pestaña— ve el error de Google adentro del panel. Por eso NO se dibuja por defecto: se abre a
// pedido, y arriba se dice de qué depende. Un recuadro que a veces muestra el documento y a veces
// una pantalla de permisos de Google, sin avisar cuál de las dos es, enseña a desconfiar del panel.
//
// ═══ «NUEVA VERSIÓN» Y «SUBIR DOCUMENTO» NO ESTÁN, Y ES UNA DECISIÓN ═══
//
// Los dos botones del canónico escriben en Drive. Escribir en Drive exige credenciales de Google en
// el servidor que sirve esta pantalla (Vercel), y las credenciales de Google del OS viven en el
// orquestador de la VM, detrás de un túnel saliente. `/api/os/[...path]` no es esa vía: es un proxy
// genérico hacia la URL que el túnel publica en `os_runtime`, con CORS abierto y sin autenticación
// propia — montar la subida de archivos ahí sería inventar la integración, no usarla. Mientras
// tanto la vía de carga real es la que ya funciona: el archivo se sube a Drive (o lo carga el bot) y
// `scripts/indexar-drive.mjs` lo trae al índice en la corrida siguiente. Un botón que promete subir
// y no sube es peor que no tenerlo.
//
// ═══ NO HAY «VERSIONES» ═══
//
// Drive las tiene, el índice no las trae y ninguna tabla del OS las guarda. Una lista de versiones
// inventada a partir de `modified_time` diría que hay una sola versión de todo, que es falso.

import Link from 'next/link'
import { BotonEnlace, Eyebrow, InlineEdit, Nulo, Num } from '@/shared/components/ds'
import { fecha } from '@/features/obras/components/formato'
import { fijarVencimiento } from '../services/actions'
import { enlaceDescarga, enlaceDrive, enlacePreview, migajaDe, pesoLegible } from '../services/documentos'
import { categoriaDe, ETIQUETA_CATEGORIA } from '../services/categorias'
import type { Documento } from '../types'

export function PanelDocumento({
  documento, cerrarHref, previewHref, previewAbierto,
}: {
  documento: Documento
  cerrarHref: string
  /** Enlace que abre o cierra el visor embebido. El estado vive en la URL, no en el componente. */
  previewHref: string
  previewAbierto: boolean
}) {
  const peso = pesoLegible(documento.size_bytes)
  const descarga = enlaceDescarga(documento.drive_file_id, documento.mime_type)
  const preview = enlacePreview(documento.drive_file_id, documento.mime_type)
  // De los vínculos, el del legajo es el único que puede llevar una fecha de vencimiento.
  const legajo = documento.vinculos.find((v) => v.legajoId !== null)

  return (
    <aside
      data-testid="panel-documento"
      className="w-full shrink-0 border-t border-line pt-4 lg:w-[360px] lg:border-l lg:border-t-0 lg:py-1 lg:pl-6 lg:pt-0"
    >
      <div className="flex items-baseline gap-2.5">
        <h2 className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-ink">
          {documento.name}
        </h2>
        <Link
          href={cerrarHref} data-testid="cerrar-panel-documento" aria-label="Cerrar el panel"
          className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >✕</Link>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {ETIQUETA_CATEGORIA[categoriaDe(documento)]} · {documento.tipo ?? 'archivo'} ·{' '}
        {peso ?? <Nulo>tamaño sin dato</Nulo>}
      </p>

      {/* EL ARCHIVO NO SE COPIA: SE VINCULA. Los dos enlaces son de Drive y siguen siendo los
          buenos aunque mañana alguien mueva el archivo de carpeta. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <BotonEnlace
          href={enlaceDrive(documento.drive_file_id)}
          variante="primaria"
          target="_blank"
          rel="noreferrer"
          data-testid="abrir-en-drive"
        >Abrir en Drive</BotonEnlace>
        {descarga && (
          <BotonEnlace href={descarga} target="_blank" rel="noreferrer" data-testid="descargar-documento">
            Descargar
          </BotonEnlace>
        )}
        {preview && (
          <Link
            href={previewHref}
            data-testid="alternar-preview"
            className="text-[12px] text-muted underline underline-offset-2 transition-colors hover:text-ink"
          >{previewAbierto ? 'Ocultar vista previa' : 'Ver acá'}</Link>
        )}
      </div>
      {!descarga && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint" data-testid="sin-descarga">
          {documento.mime_type === 'application/vnd.google-apps.shortcut'
            ? 'Es un acceso directo de Drive: no tiene contenido propio para bajar.'
            : 'Es un archivo nativo de Google: no tiene un binario para bajar, se exporta desde Drive eligiendo el formato.'}
        </p>
      )}

      {previewAbierto && preview && (
        <div className="mt-3">
          <iframe
            src={preview}
            title={`Vista previa de ${documento.name}`}
            data-testid="preview-documento"
            className="h-[420px] w-full rounded-card border border-line bg-[#F7F7F5]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            Es el visor de Drive. Se ve si tu cuenta de Google tiene acceso al archivo — el OS no
            copia el documento ni decide sus permisos.
          </p>
        </div>
      )}

      <section className="mt-6">
        <Eyebrow className="mb-2.5">Vinculado a</Eyebrow>
        {documento.vinculos.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-muted" data-testid="documento-sin-vinculo">
            Este archivo no cuelga de ninguna persona ni de ningún cliente. Lo único que lo ubica es
            su carpeta.
          </p>
        ) : (
          <ul className="border-t border-line">
            {documento.vinculos.map((v, i) => (
              <li key={`${v.clase}-${i}`} className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-2">
                <span className="w-[54px] shrink-0 text-[10.5px] uppercase tracking-[0.05em] text-faint">
                  {v.clase}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  {v.href ? <Link href={v.href} className="hover:underline">{v.nombre}</Link> : v.nombre}
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {v.detalle ?? <Nulo>sin clasificar</Nulo>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <Eyebrow className="mb-2.5">Propiedades</Eyebrow>
        <dl className="border-t border-line">
          <Propiedad k="Carpeta">{migajaDe(documento.path, 4) ?? <Nulo>sin ruta</Nulo>}</Propiedad>
          <Propiedad k="Modificado"><Num className="text-ink">{fecha(documento.modified_time)}</Num></Propiedad>
          <Propiedad k="Formato">{documento.mime_type ?? <Nulo>sin dato</Nulo>}</Propiedad>
          <Propiedad k="Tamaño">{peso ?? <Nulo>sin dato</Nulo>}</Propiedad>
          <Propiedad k="Vence">
            {/* EL ÚNICO CAMPO ESCRIBIBLE DE LA PANTALLA. El id de la fila del legajo se ata acá con
                `.bind`: no viaja en el formulario, donde cualquiera podría cambiarlo. */}
            {legajo?.legajoId ? (
              <InlineEdit
                valor={documento.vence}
                guardar={fijarVencimiento.bind(null, legajo.legajoId)}
                tipo="fecha"
                etiqueta={`Vencimiento de ${documento.name}`}
                falta="sin control de vigencia"
                alineado="right"
                ancho="w-[130px]"
                testid="editar-vencimiento"
              />
            ) : documento.vence ? (
              <Num className="text-ink">{fecha(documento.vence)}</Num>
            ) : (
              <Nulo>sin control de vigencia</Nulo>
            )}
          </Propiedad>
        </dl>
        {!legajo?.legajoId && (
          <p className="mt-2 text-[11px] leading-relaxed text-faint" data-testid="vencimiento-no-editable">
            {documento.vinculos.length === 0
              ? 'Para ponerle vencimiento, el archivo tiene que estar vinculado al legajo de una persona: es la única tabla del OS que hoy guarda una fecha de vigencia.'
              : 'El vencimiento sólo se carga sobre el legajo de una persona. El vínculo con un cliente no tiene columna de vigencia en la base.'}
          </p>
        )}
      </section>
    </aside>
  )
}

function Propiedad({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-2">
      <dt className="shrink-0 text-[12px] text-faint">{k}</dt>
      <dd className="min-w-0 truncate text-right text-[12.5px] text-ink">{children}</dd>
    </div>
  )
}
