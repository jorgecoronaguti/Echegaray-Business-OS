// EL PANEL DE UN DOCUMENTO — lo que se sabe del archivo, y la puerta a Drive.
//
// ═══ NO HAY PREVISUALIZACIÓN, Y ES A PROPÓSITO ═══
//
// El canónico dibuja un recuadro con «12 hojas · A1». El OS no tiene el archivo: tiene su ficha en
// el índice (nombre, ruta, tamaño, mime, fecha). Dibujar un recuadro de previsualización que en
// realidad no muestra nada es prometer algo que no pasa; embeber el visor de Drive obligaría a que
// cada archivo estuviera compartido con quien mira, cosa que no está resuelta. Entonces: se dice
// qué es y se abre en Drive, donde los permisos ya son los correctos.
//
// ═══ NO HAY «VERSIONES» ═══
//
// Drive las tiene, el índice no las trae y ninguna tabla del OS las guarda. Una lista de versiones
// inventada a partir de `modified_time` diría que hay una sola versión de todo, que es falso.

import Link from 'next/link'
import { BotonEnlace, Eyebrow, Nulo, Num } from '@/shared/components/ds'
import { fecha } from '@/features/obras/components/formato'
import { enlaceDrive, migajaDe, pesoLegible } from '../services/documentos'
import type { Documento } from '../types'

export function PanelDocumento({ documento, cerrarHref }: { documento: Documento; cerrarHref: string }) {
  const peso = pesoLegible(documento.size_bytes)
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
        {documento.tipo ?? 'archivo'} · {peso ?? <Nulo>tamaño sin dato</Nulo>}
      </p>

      {/* EL ARCHIVO NO SE COPIA: SE VINCULA. Este enlace es el de Drive, y sigue siendo el bueno
          aunque mañana alguien mueva el archivo de carpeta. */}
      <div className="mt-4">
        <BotonEnlace
          href={enlaceDrive(documento.drive_file_id)}
          variante="primaria"
          target="_blank"
          rel="noreferrer"
          data-testid="abrir-en-drive"
        >Abrir en Drive</BotonEnlace>
      </div>

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
            {documento.vence ? <Num className="text-ink">{fecha(documento.vence)}</Num> : <Nulo>sin control de vigencia</Nulo>}
          </Propiedad>
        </dl>
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
