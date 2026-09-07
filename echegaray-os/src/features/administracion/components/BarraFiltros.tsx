// LA BARRA DE BÚSQUEDA Y FILTRO — un `form` GET, sin una línea de JavaScript.
//
// ═══ POR QUÉ NO ES UN COMPONENTE DE CLIENTE CON ESTADO ═══
//
// El filtro viaja en la URL, así que la pantalla filtrada se puede compartir, recargar y volver
// atrás con el botón del navegador. Un filtro guardado en `useState` se pierde en cada recarga y
// obliga a que toda la tabla —que hoy es un server component que lee de Postgres— se vuelva de
// cliente sólo para tachar filas. Y filtrar en el navegador miente en cuanto la lista pase de una
// página: se estaría buscando dentro de lo que ya se trajo, no dentro de lo que hay.
//
// El botón de aplicar existe a propósito: sin él haría falta enviar en cada tecla, que en un
// teléfono con conexión de obra es peor que un toque.

import type { ReactNode } from 'react'
import { CTRL } from '@/shared/components/ui'

export interface OpcionFiltro {
  valor: string
  etiqueta: string
}

export function BarraFiltros({
  accion,
  q,
  placeholder,
  children,
  testid,
  extra,
  compacta = false,
}: {
  /** La ruta a la que vuelve el formulario. Es la misma pantalla: GET sobre sí misma. */
  accion: string
  q?: string
  placeholder: string
  children?: ReactNode
  testid?: string
  /** Campos que hay que preservar al filtrar (p. ej. el panel abierto). */
  extra?: Record<string, string | undefined>
  /**
   * MODO COMPACTO: sólo el campo, sin rótulo y sin botón. Se envía con Enter.
   *
   * Existe para las pantallas donde la búsqueda comparte renglón con los filtros y la acción
   * primaria (Personal). Ahí un rótulo «Buscar» encima y un botón «Filtrar» al lado hacen que la
   * línea se parta en dos y compitan tres controles por la misma atención. Cuando hay desplegables
   * el botón SIGUE estando: un `select` que no envía solo necesita cómo enviarse.
   */
  compacta?: boolean
}) {
  return (
    <form method="get" action={accion} data-testid={testid} className="flex flex-wrap items-end gap-2">
      {Object.entries(extra ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <label className={compacta ? 'min-w-0 flex-1' : 'flex min-w-0 flex-1 basis-48 flex-col text-[11px] text-faint'}>
        {!compacta && 'Buscar'}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder={placeholder}
          className={compacta ? `${CTRL} mt-0` : CTRL}
          data-testid={testid ? `${testid}-q` : undefined}
        />
      </label>
      {children}
      {!compacta && <button
        type="submit"
        data-testid={testid ? `${testid}-aplicar` : undefined}
        className="rounded-control border border-line px-3 py-1.5 text-[12px] text-muted hover:bg-slate-50"
      >
        Filtrar
      </button>}
    </form>
  )
}

/**
 * UN CAMPO DE FILTRO — fecha o número. Se envía con la barra, igual que el desplegable.
 *
 * Existe porque «desde/hasta» y «importe entre» no son opciones de una lista: son valores que la
 * persona tipea. `type="date"` le da el calendario nativo del sistema —en el teléfono, el único que
 * se puede usar con una mano— y manda `YYYY-MM-DD`, que es el formato con el que `pasaCriterios`
 * compara sin arrastrar zona horaria.
 *
 * `inputMode="decimal"` y no `type="number"`: el importe se tipea «1.500.000,50» como en el Sheet, y
 * un `number` rechaza la coma en un teclado en español. `numeroDe` ya sabe leer ese formato.
 */
export function CampoFiltro({
  label, name, valor, tipo = 'text', placeholder, testid,
}: {
  label: string
  name: string
  valor?: string
  tipo?: 'text' | 'date'
  placeholder?: string
  testid?: string
}) {
  return (
    <label className="flex min-w-0 basis-32 flex-col text-[11px] text-faint">
      {label}
      <input
        type={tipo}
        name={name}
        defaultValue={valor ?? ''}
        placeholder={placeholder}
        inputMode={tipo === 'text' ? 'decimal' : undefined}
        className={CTRL}
        data-testid={testid}
      />
    </label>
  )
}

/** Un desplegable de filtro. Se envía con la barra; no hace nada solo. */
export function SelectFiltro({
  label,
  name,
  valor,
  opciones,
  testid,
}: {
  label: string
  name: string
  valor?: string
  opciones: OpcionFiltro[]
  testid?: string
}) {
  return (
    <label className="flex min-w-0 basis-36 flex-col text-[11px] text-faint">
      {label}
      <select name={name} defaultValue={valor ?? ''} className={CTRL} data-testid={testid}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
        ))}
      </select>
    </label>
  )
}
