// EL RECORTE POR CATEGORÍA DEL MÓDULO PERSONAL — dueño, 17/09/2026: *«necesito en todo el módulo
// personal, filtro por categoría de empleados»*.
//
// ═══ QUÉ DECIDE ESTE ARCHIVO Y QUÉ NO ═══
//
// Decide EN QUÉ CAJÓN cae cada persona y CUÁNTAS anuncia cada pastilla. No dibuja nada y no sabe de
// URLs: las tres solapas arman los enlaces con `enlaceDeVista.ts` y los pintan con `FiltrosSuaves`.
//
// ═══ EL CAJÓN ES EL QUE LA FILA YA PUBLICA, NO UNO NUEVO ═══
//
// La columna CATEGORÍA del listado escribe `categoriaVisible(categoria, puesto)` — la categoría del
// legajo, y el `puesto` SÓLO cuando ese texto libre resulta ser una categoría del convenio
// disfrazada. El recorte usa esa MISMA precedencia (`cajonDeCategoria`) y su MISMA etiqueta. Si
// contar y mostrar usaran criterios distintos, la pastilla diría «Oficial 8» y la fila de abajo
// «OFICIAL» sin entrar en el recorte: la clase de defecto que nadie reporta y que hace que se deje
// de creerle a la pantalla.
//
// ═══ NADIE SE REASIGNA Y NADIE SE ESCONDE ═══
//
// Lo que está cargado manda. A quien tiene categoría no se lo saca de ella por ningún otro motivo, y
// a quien no la tiene no se le inventa una: cae en «Sin categoría», que es un hecho —falta el dato—
// y no una categoría del convenio.
//
// ═══ «FUERA DE CONVENIO» SE SUMA, NO PARTE ═══
//
// Los jefes de obra y los mensuales de oficina NO cobran por la escala del convenio: cobran un neto
// mensual (`cobraPorMes`). Medido en la base el 17/09/2026: los dos jefes activos tienen además
// `categoria = oficial_especializado` cargada en su legajo y su fila la publica.
//
// Por eso este cajón es ADITIVO y no excluyente: el jefe sigue contando en «Oficial especializado»
// —que es lo que su fila dice— y ADEMÁS aparece bajo su propia palabra. Sacarlo de la categoría que
// su propia celda muestra sería la contradicción de arriba, ahora al revés. Las pastillas de esta
// fila, entonces, NO suman el total, igual que las cuatro de la fila de los cortes («Plantel» ya
// contiene a «En obra» y a «Sin asignar»): cada una dice cuánta gente hay del otro lado del clic, y
// eso es lo que una pastilla promete.

import { CATEGORIAS_UOCRA } from '../types/index.ts'
import { categoriaVisible, claveDeCategoria, esJefeDeObra, pareceCategoria } from './vocabularioPersona.ts'

/** Falta el dato en el legajo. No es una categoría: es su ausencia, y se dice con esa palabra. */
export const SIN_CATEGORIA = 'sin-categoria'
export const ETIQUETA_SIN_CATEGORIA = 'Sin categoría'

/** No cobra por la escala del convenio: jefes de obra y mensuales de oficina (`cobraPorMes`). */
export const FUERA_DE_CONVENIO = 'fuera-de-convenio'
export const ETIQUETA_FUERA_DE_CONVENIO = 'Fuera de convenio'

/** Lo mínimo para ubicar a una persona en un cajón. Las tres solapas traen estos tres datos. */
export interface FilaConCategoria {
  /** `persona_directorio.categoria`, la clave tal cual está cargada. Ausente vale lo mismo que
   *  `null`: la fila cae en «Sin categoría», que es lo único que la pantalla puede afirmar. */
  categoria?: string | null
  /** `persona_directorio.puesto`: el rol organizacional, y a veces una categoría disfrazada. */
  puesto?: string | null
  /**
   * COBRA POR MES. Es el criterio del OS (`cobroMensual.ts`: jefe de obra o neto mensual vigente), y
   * viaja RESUELTO porque cada solapa lo sabe por su lado: el Plantel por el `puesto`, la grilla de
   * Horas y el cuadro de la quincena por su propio `esJefe`. Ausente = no se pudo mirar, y entonces
   * nadie está fuera del convenio — la ausencia de dato no se distingue de la negativa, así que se
   * falla hacia lo que ya se veía.
   */
  cobraPorMes?: boolean
}

/** Una pastilla del recorte. `clave` es lo que viaja en la URL y en los `data-testid`. */
export interface ChipDeCategoria {
  clave: string
  etiqueta: string
  cuenta: number
}

/**
 * EL CAJÓN DE ESTA PERSONA, o `null` cuando no tiene categoría cargada.
 *
 * Misma precedencia que `categoriaVisible`, que es lo que la fila muestra. Se normaliza para
 * comparar —la nómina escribe «OFICIAL», «Medio Oficial» y `medio_oficial` para el mismo puesto—,
 * así que dos grafías del mismo hecho caen en la misma pastilla en vez de abrir dos.
 */
export function cajonDeCategoria(fila: FilaConCategoria): string | null {
  const propia = claveDeCategoria(fila.categoria)
  if (propia) return propia
  const p = fila.puesto?.trim()
  return p && pareceCategoria(p) ? claveDeCategoria(p) : null
}

/** ¿No cobra por la escala del convenio? El `esJefe` de cada solapa, o el `puesto` cuando lo trae. */
export function fueraDelConvenio(fila: FilaConCategoria): boolean {
  return fila.cobraPorMes === true || esJefeDeObra(fila.puesto ?? null)
}

/** ¿Esta persona entra en la pastilla elegida? El `null` de la URL es «todas», no «ninguna». */
export function estaEnLaCategoria(fila: FilaConCategoria, clave: string): boolean {
  if (clave === FUERA_DE_CONVENIO) return fueraDelConvenio(fila)
  if (clave === SIN_CATEGORIA) return cajonDeCategoria(fila) === null
  return cajonDeCategoria(fila) === clave
}

/**
 * LAS FILAS RECORTADAS. Sin categoría elegida devuelve todo: un parámetro vacío no es un filtro.
 *
 * Se recorta EN MEMORIA y no con un `eq()` más en la consulta, por el mismo motivo que el recorte
 * por obra: así el recorte usa la misma regla que cuenta las pastillas y se puede probar sin base.
 */
export function filtrarPorCategoria<T extends FilaConCategoria>(
  filas: readonly T[], elegida?: string,
): T[] {
  const clave = elegida?.trim()
  if (!clave) return [...filas]
  return filas.filter((f) => estaEnLaCategoria(f, clave))
}

/** El orden del catálogo (de mayor a menor calificación); lo que no está en él va después. */
const ORDEN = new Map<string, number>(CATEGORIAS_UOCRA.map((c, i) => [c, i]))

/**
 * LAS PASTILLAS: una por cada categoría presente, más las dos que se dicen con su palabra.
 *
 * ═══ LA ETIQUETA SALE DE LA FILA, NO DE UN DICCIONARIO APARTE ═══
 *
 * Se toma el texto que la primera fila del cajón publica (`categoriaVisible`). Con eso, un valor que
 * el catálogo no conoce —la base real tuvo códigos como «1591» en esa columna— se ofrece tal cual
 * está cargado en vez de desaparecer o de mostrarse con otro nombre que el de su fila.
 *
 * ═══ LA ELEGIDA SIEMPRE TIENE SU PASTILLA, AUNQUE HOY NO ALCANCE A NADIE ═══
 *
 * Es la lección del 11/09/2026 en la grilla de Horas: *«le pongo el filtro a obra y no se puede
 * sacar después»*. Al cambiar de corte o de quincena la categoría elegida puede quedarse sin gente;
 * si además desaparece su pastilla, el recorte queda puesto sin nada que apretar para apagarlo.
 *
 * Un cajón vacío que NADIE eligió no se dibuja: una pastilla que promete cero filas es una puerta a
 * una pieza vacía.
 */
export function categoriasDelCorte(
  filas: readonly FilaConCategoria[], elegida?: string,
): ChipDeCategoria[] {
  const cuentas = new Map<string, { etiqueta: string; cuenta: number }>()
  let sinCategoria = 0
  let fuera = 0
  for (const f of filas) {
    if (fueraDelConvenio(f)) fuera += 1
    const cajon = cajonDeCategoria(f)
    if (!cajon) { sinCategoria += 1; continue }
    const ya = cuentas.get(cajon)
    if (ya) { ya.cuenta += 1; continue }
    cuentas.set(cajon, {
      etiqueta: categoriaVisible(f.categoria ?? null, f.puesto ?? null) ?? cajon,
      cuenta: 1,
    })
  }
  const chips = [...cuentas.entries()]
    .map(([clave, v]) => ({ clave, etiqueta: v.etiqueta, cuenta: v.cuenta }))
    .sort(porCatalogo)
  // LOS DOS CASOS QUE NO SON UNA CATEGORÍA VAN AL FINAL, en ese orden: primero el dato que falta,
  // después el grupo que se suma. Mezclarlos entre las categorías los haría leer como una más.
  if (sinCategoria > 0) chips.push({ clave: SIN_CATEGORIA, etiqueta: ETIQUETA_SIN_CATEGORIA, cuenta: sinCategoria })
  if (fuera > 0) chips.push({ clave: FUERA_DE_CONVENIO, etiqueta: ETIQUETA_FUERA_DE_CONVENIO, cuenta: fuera })
  return conLaElegida(chips, elegida)
}

/** El catálogo primero y en su orden; lo que no conoce, alfabético en español. */
function porCatalogo(a: ChipDeCategoria, b: ChipDeCategoria): number {
  const ia = ORDEN.get(a.clave) ?? Number.MAX_SAFE_INTEGER
  const ib = ORDEN.get(b.clave) ?? Number.MAX_SAFE_INTEGER
  return ia - ib || a.etiqueta.localeCompare(b.etiqueta, 'es')
}

/** La pastilla puesta en la URL no puede faltar: sin ella el recorte no se puede apagar. */
function conLaElegida(chips: ChipDeCategoria[], elegida?: string): ChipDeCategoria[] {
  const puesta = elegida?.trim()
  if (!puesta || chips.some((c) => c.clave === puesta)) return chips
  return [...chips, { clave: puesta, etiqueta: etiquetaDeLaElegida(puesta), cuenta: 0 }]
}

/** Cómo se nombra una categoría que hoy no alcanza a nadie: por su catálogo, o por su propio texto. */
export function etiquetaDeLaElegida(clave: string): string {
  if (clave === SIN_CATEGORIA) return ETIQUETA_SIN_CATEGORIA
  if (clave === FUERA_DE_CONVENIO) return ETIQUETA_FUERA_DE_CONVENIO
  return categoriaVisible(clave, null) ?? clave
}
