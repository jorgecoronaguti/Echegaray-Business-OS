// LA OBRA DE UNA FILA DE COMPRAS, COMO LA VE LA APP — la misma identificación que la columna «Obra».
//
// ═══ POR QUÉ (dueño, 14/09/2026) ═══
//
// La pestaña Compras gana la columna «Obra» con desplegable (`OB-#### · NOMBRE`, `ES-ADM`, `ES-TAL`,
// «Sin obra – X») y todas las secciones de la app tienen que nombrar la obra igual: `rotuloDeObra`.
// Hasta hoy la pantalla mostraba sólo la J («Cliente / Asignación»), que dice el cliente y no la obra.
//
// ═══ DECISIÓN E INFERENCIA NO SE MUESTRAN IGUAL ═══
//
// Hay dos fuentes y dicen cosas distintas:
//   · la celda «Obra» (`compra_sheet.obra_celda`)  → lo que una persona ELIGIÓ. Manda.
//   · `compra_obra_asignada`                         → lo que el sync INFIRIÓ de J y K.
// Si la pantalla las dibujara igual, una obra adivinada se leería como una decidida, que es la
// confusión que la columna viene a sacar. Por eso `origen` viaja con el rótulo.
//
// El rótulo sale del `obra_id`, no del texto de la celda: el código es inmutable y el nombre puede
// haber cambiado desde que se eligió. Un `obra_id` que no se pudo nombrar queda `null`, nunca un texto
// de relleno.
//
// Las opciones del desplegable son el espejo de `opcionesDeObra` de `orquestador/lib/obra-destino.mjs`
// y el test de paridad lo fija: si una cambia sola, el desplegable de la app ofrecería algo que el sync
// no entiende.

import { rotuloDeObra } from '../../../shared/utils/obra.ts'
import { normAlias } from '../../../../orquestador/lib/norm-alias.mjs'

export type DestinoObra = 'obra' | 'estructura_admin' | 'estructura_taller'

/** Los destinos que no son obras. Mismos códigos que el sync parsea. */
export const FIJOS: readonly { codigo: string; destino: DestinoObra; nombre: string }[] = [
  { codigo: 'ES-ADM', destino: 'estructura_admin', nombre: 'Estructura – Administración' },
  { codigo: 'ES-TAL', destino: 'estructura_taller', nombre: 'Estructura – Taller' },
]

/** Lo que `compra_sheet` guarda de la celda «Obra» (migración 20260915T0700). */
export interface CeldaObraDeCompra {
  fila: number
  clave: string | null
  destino: DestinoObra | null
  obra_id: string | null
  obra_celda: string | null
  obra_inconsistencia: string | null
}

/** Una fila de `compra_obra_asignada`: la inferencia del sync. */
export interface AsignacionDeCompra {
  referencia: string
  obra_id: string | null
  via: string
  cliente: string | null
  porque: string | null
}

export type OrigenObra = 'columna' | 'inferida' | 'sin_obra' | 'ninguna'

export interface ObraDeCompra {
  /** «OB-0012 · NOMBRE» o «ES-ADM · …». `null` = no hay obra que nombrar. */
  rotulo: string | null
  origen: OrigenObra
  /** El texto de la celda tal cual, para el editor (`esperado`). */
  celda: string | null
  /** La celda no se entendió o contradice la Unidad. Se muestra, no se corrige. */
  inconsistencia: string | null
  porque: string | null
}

/** La clave que une la fila con `compra_obra_asignada.referencia`. Espejo de `referenciaDeCompra`. */
export function referenciaDeCompra(f: { fila: number; sheet_id: number | null }): string {
  return f.sheet_id == null ? String(f.fila) : String(f.sheet_id)
}

/** La obra que la app muestra para una fila. PURA. */
export function obraDeLaCompra(
  celda: CeldaObraDeCompra | null | undefined,
  asignacion: AsignacionDeCompra | null | undefined,
  rotulos: Map<string, string>,
): ObraDeCompra {
  const texto = celda?.obra_celda?.trim() || null
  if (texto) {
    // Estructura y «Sin obra – X» no tienen obra_id: su rótulo ES el texto elegido.
    const rotulo = !celda?.destino ? null : celda.obra_id ? (rotulos.get(celda.obra_id) ?? null) : texto
    return { rotulo, origen: 'columna', celda: texto, inconsistencia: celda?.obra_inconsistencia ?? null, porque: null }
  }
  if (asignacion?.obra_id) {
    return { rotulo: rotulos.get(asignacion.obra_id) ?? null, origen: 'inferida', celda: null, inconsistencia: null, porque: asignacion.porque }
  }
  if (asignacion?.via === 'sin_obra') {
    return { rotulo: null, origen: 'sin_obra', celda: null, inconsistencia: null, porque: asignacion.porque }
  }
  return { rotulo: null, origen: 'ninguna', celda: null, inconsistencia: null, porque: asignacion?.porque ?? null }
}

export interface ObraParaOpciones {
  id: string
  nombre: string | null
  cliente_texto: string | null
  fusionada_en: string | null
}

/** `normAlias(rotulo_clave)` → cliente canónico, leído de `cliente_alias`. El mismo mapa que usa el sync. */
export type ClienteAlias = Map<string, string>

/**
 * LAS OPCIONES DEL DESPLEGABLE, en el orden del Sheet: fijas, obras con código, «Sin obra – X».
 *
 * «Sin obra – X» sólo para el cliente con más de una obra viva: con una sola no hay nada que decidir.
 * Y X ES EL CLIENTE CANÓNICO de `cliente_alias`, no `cliente_texto`: medido en producción el
 * 15/09/2026, agrupar por el texto crudo ofrecía «Sin obra – Messina» y «Sin obra – MESSINA» como dos
 * opciones y «Sin obra – La Estrella» con otra capitalización que la del filtro, la del Sheet
 * (`_OBRAS_OS`) y la que `obra_celda_resolver` valida. Una obra cuyo cliente no tiene alias no
 * suma a ningún «Sin obra»: es lo que hace el sync (`catalogoDeDestinos`), y no se inventa un cliente.
 */
export function opcionesDeObra(obras: ObraParaOpciones[], codigos: Map<string, string>, clienteAlias: ClienteAlias): string[] {
  const fijas = FIJOS.map((f) => rotuloDeObra({ codigo: f.codigo, nombre: f.nombre }))
  const vivas = obras.filter((o) => !o.fusionada_en)
  const conCodigo = vivas
    .map((o) => ({ ...o, codigo: codigos.get(o.id) ?? '' }))
    .filter((o) => /^OB-/i.test(o.codigo))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((o) => rotuloDeObra({ codigo: o.codigo, nombre: o.nombre }))
  const porCliente = new Map<string, number>()
  for (const o of vivas) {
    const clave = normAlias(o.cliente_texto)
    const canonico = clave ? clienteAlias.get(clave) : undefined
    if (canonico) porCliente.set(canonico, (porCliente.get(canonico) ?? 0) + 1)
  }
  const sinObra = [...porCliente].filter(([, n]) => n > 1).map(([c]) => `Sin obra – ${c}`).sort()
  return [...fijas, ...conCodigo, ...sinObra]
}

/** La FORMA de un valor elegible. El contenido lo valida la base (`compra_obra_asignar`). */
export const FORMA_VALOR_OBRA = /^((OB|ZZ)-\d{4,}\b.*|ES-(ADM|TAL)\b.*|sin\s+obra\s*[–—-]\s*\S.*)$/i
