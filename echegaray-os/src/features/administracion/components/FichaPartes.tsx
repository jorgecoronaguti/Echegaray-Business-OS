// LAS PIEZAS CHICAS DE LA FICHA — el bloque, el dato y el alta de documento.
//
// ═══ EL BLOQUE YA NO ES UNA CAJA ═══
//
// Tenía borde, radio y fondo blanco. `design/system/SPACING_BORDERS.md`: *"Antes de crear una caja:
// ¿hace falta para entender el dato? La jerarquía se consigue con tipografía, espacio, alineación y
// proximidad."* Seis cajas apiladas en una ficha son seis bordes que el ojo tiene que procesar para
// leer nueve renglones de texto. Queda el rótulo en `Eyebrow` y el espacio.
//
// UN DATO SIN CARGAR SE DICE, NO SE DIBUJA VACÍO. `Dato` escribe «sin cargar» en `faint`: una ficha
// con ocho renglones en blanco es indistinguible de una ficha que no se pudo leer.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { Eyebrow, Nulo } from '@/shared/components/ds'
import { CATEGORIAS_DOCUMENTO } from '../types'

export function Bloque({
  titulo, testid, ayuda, editarHref, children,
}: {
  titulo: string
  testid: string
  ayuda?: ReactNode
  /** Con enlace, el bloque se edita en el panel lateral. Sin él es de sólo lectura y NO dibuja un
   *  control que no lleva a ninguna parte. */
  editarHref?: string
  children: ReactNode
}) {
  return (
    <section data-testid={testid}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Eyebrow>{titulo}</Eyebrow>
        <span className="flex-1" />
        {ayuda && <span className="text-[12px] text-faint">{ayuda}</span>}
        {/* La acción secundaria va discreta: la primaria de esta pantalla es «Dar de baja» y vive en
            el encabezado. Dos botones sólidos compitiendo no dejan ver cuál es cuál. */}
        {editarHref && (
          <Link
            href={editarHref}
            data-testid={`${testid}-editar`}
            className="text-[12px] text-muted transition-colors hover:text-ink"
          >Editar</Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** Un renglón rotulado: etiqueta a la izquierda, valor a la derecha, hairline abajo. */
export function Dato({ k, v, mono }: { k: string; v: string | null; mono?: boolean }) {
  // `min-w-0` EN LA RAÍZ, NO SÓLO EN EL VALOR (QA en teléfono): un ítem de grid arranca con
  // `min-width:auto`, así que sin esto la pista crece hasta el ancho del texto y estira la PÁGINA
  // ENTERA — 557px de contenido en una pantalla de 390. Una nota larga alcanzaba para romperla.
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-[#EFEEEA] py-[9px] last:border-0">
      <span className="shrink-0 text-[12px] text-muted">{k}</span>
      <span className={`min-w-0 truncate text-right ${mono ? 'font-mono text-[12.5px] tabular-nums text-ink' : 'text-[12.5px] text-ink'}`}>
        {v ?? <Nulo>sin cargar</Nulo>}
      </span>
    </div>
  )
}

/** Vincular un documento de Drive al legajo. NO sube el archivo: pide el enlace y guarda el id. */
export function AltaDocumento({ vincular }: { vincular: AccionFormulario }) {
  return (
    <details className="mt-4 border-t border-line pt-3" data-testid="alta-documento">
      <summary className="cursor-pointer text-[12px] text-muted transition-colors hover:text-ink">
        + Vincular documento
      </summary>
      <div className="pt-3">
        <FormAccion
          accion={vincular} testid="form-documento" enviar="Vincular" limpiarAlOk
          mensajeOk="Vinculado."
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Campo label="Categoría">
              <select name="tipo_documento" required defaultValue="" className={CTRL}>
                <option value="" disabled>elegir</option>
                {CATEGORIAS_DOCUMENTO.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Nombre" ancho="col-span-2">
              <input name="nombre" required maxLength={300} className={CTRL} />
            </Campo>
            <Campo label="Fecha"><input type="date" name="fecha_documento" className={CTRL} /></Campo>
            <Campo
              label="Enlace de Drive" ancho="col-span-2 sm:col-span-4"
              ayuda="El que da el botón Compartir del archivo, o el id. El archivo no se copia."
            >
              <input name="enlace" required className={CTRL} />
            </Campo>
            <Campo label="Notas" ancho="col-span-2 sm:col-span-4">
              <input name="notas" maxLength={300} className={CTRL} />
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}
