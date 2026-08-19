// LAS PIEZAS CHICAS DE LA FICHA — el bloque, el dato y el alta de documento.
//
// Viven separadas de la página porque las tres se usan varias veces y porque una página de 300
// líneas con el marcado de un `<dl>` repetido ocho veces deja de leerse.
//
// UN DATO SIN CARGAR SE DICE, NO SE DIBUJA VACÍO. `Dato` escribe «sin cargar» en gris: una ficha con
// ocho renglones en blanco es indistinguible de una ficha que no se pudo leer.

import type { ReactNode } from 'react'
import { Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { CATEGORIAS_DOCUMENTO } from '../types'

export function Bloque({
  titulo, testid, ayuda, children,
}: {
  titulo: string
  testid: string
  ayuda?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-white px-4 py-3.5" data-testid={testid}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-faint">{titulo}</h2>
        {ayuda && <p className="text-[11px] text-faint">{ayuda}</p>}
      </div>
      {children}
    </section>
  )
}

export function Dato({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <span className="shrink-0 text-[12px] text-faint">{k}</span>
      <span className={`min-w-0 truncate text-right text-[13px] ${v ? 'text-ink' : 'text-faint'}`}>
        {v ?? 'sin cargar'}
      </span>
    </div>
  )
}

/** El estado del plantel se DERIVA de la fecha de egreso. No hay una bandera `activo` al lado: dos
 *  verdades sobre el mismo hecho se contradicen sin avisar. */
export function EstadoPersona({ fechaEgreso }: { fechaEgreso: string | null }) {
  return fechaEgreso
    ? <span className="text-faint">inactiva desde el {fechaEgreso}</span>
    : <span className="text-pos">en el plantel</span>
}

/** Vincular un documento de Drive al legajo. NO sube el archivo: pide el enlace y guarda el id. */
export function AltaDocumento({ vincular }: { vincular: AccionFormulario }) {
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface-quiet" data-testid="alta-documento">
      <summary className="cursor-pointer px-3.5 py-2 text-[12px] text-muted">+ Vincular documento</summary>
      <div className="border-t border-line p-3.5">
        <FormAccion accion={vincular} testid="form-documento" enviar="Vincular" limpiarAlOk mensajeOk="Vinculado.">
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
