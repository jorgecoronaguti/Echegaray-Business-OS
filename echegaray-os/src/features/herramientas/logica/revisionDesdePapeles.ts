// LA RTO Y EL SEGURO SE CARGAN UNA VEZ: EN «PAPELES» (dueño, 01/10/2026: «la revisión de mantenimiento de
// rodados nunca la hiciste»).
//
// La ficha del rodado tenía dos bloques que hablan del mismo vencimiento con dos fuentes: «Papeles» leía
// `activo_papel_vigente` —donde están cargadas la RTO y la póliza de cada unidad— y «Revisión técnica» leía
// `activo_revision_vigente`, que está vacía. Resultado: la misma camioneta con la RTO «vencida hace 180 días»
// arriba y «sin cargar» abajo, y Mantenimiento sin un solo vencimiento que avisar.
//
// Un concepto, una fuente: para `rto` y `seguro`, la revisión vigente es la del papel cuando no hay una
// revisión cargada o cuando el papel vence más tarde (es el más nuevo). Service e inspección no tienen
// papel y siguen saliendo sólo de las revisiones y del libro de vida.

import type { Papel } from './papeles.ts'
import type { RevisionVigente, TipoRevision } from './revision.ts'

const TIPOS_CON_PAPEL: readonly TipoRevision[] = ['rto', 'seguro']

/** El papel, visto como revisión vigente. Sin vencimiento no dice nada que la revisión necesite. */
function comoRevision(p: Papel, tipo: TipoRevision): RevisionVigente | null {
  if (!p.vence_en) return null
  const fecha = p.emitido_en ?? p.vence_en
  return {
    id: `papel:${p.id}`, activo_id: p.activo_id, tipo, fecha, vencimiento: p.vence_en, lectura: null, resultado: null,
    lugar: p.emisor, numero: p.numero, costo: null, observaciones: 'Según el papel cargado en Papeles',
    adjunto_url: null, creado_en: fecha, creado_por: null, dias: p.dias,
  }
}

/**
 * Las revisiones vigentes, completadas con los papeles. `null` en revisiones (falta la migración) se respeta:
 * la pantalla tiene que seguir diciendo «falta la migración», no pintar un parque a medias.
 */
export function vigentesConPapeles(
  vigentes: RevisionVigente[] | null, papeles: readonly Papel[] | null | undefined,
): RevisionVigente[] | null {
  if (vigentes == null) return null
  const salida = [...vigentes]
  for (const p of papeles ?? []) {
    const tipo = TIPOS_CON_PAPEL.find((t) => t === p.tipo)
    const delPapel = tipo ? comoRevision(p, tipo) : null
    if (!tipo || !delPapel) continue
    const i = salida.findIndex((r) => r.activo_id === p.activo_id && r.tipo === tipo)
    if (i < 0) salida.push(delPapel)
    else if ((salida[i].vencimiento ?? '') < delPapel.vencimiento!) salida[i] = delPapel
  }
  return salida
}
