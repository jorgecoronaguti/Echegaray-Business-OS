// LOS CUATRO DESTINOS DE ADMINISTRACIÓN — la barra de nivel 2, en un solo lugar.
//
// ═══ QUÉ CAMBIÓ (handoff CRM / Administración v4, 04/09/2026) ═══
//
// La barra queda en **Clientes · Personal · Proveedores | Compras**, y eso saca tres destinos que
// estaban en la v2. El motivo no es que sobre lugar: es que ninguno de los tres respondía una
// pregunta que no respondiera ya la sección de al lado.
//
//   · TRABAJO enumeraba lo que cada sección ya reclama en sus propias filas. Un destino que sólo
//     lista los pendientes de los demás obliga a mirar dos pantallas para el mismo trabajo, y la
//     v4 elimina además la banda de señales: lo que falta se marca en la fila que lo tiene.
//   · DOCUMENTOS era un repositorio general de archivos. Los papeles se leen colgados de su obra,
//     su persona, su cliente o su proveedor —donde ya viven las fichas—; un catálogo transversal no
//     contesta ninguna pregunta del día.
//   · BASE MAESTRA se fue a Presupuestos: tareas tipo y recursos no son administración, son la
//     materia con la que se cotiza. Se enlaza desde `/presupuestos`.
//
// NINGUNA RUTA SE BORRÓ. `/administracion` (la entrada del área, a la que sigue llevando la solapa
// de nivel 1), `/administracion/base-maestra`, `/administracion/pendientes`,
// `/administracion/asistencia`, `/administracion/usuarios` y `/documentos` siguen existiendo y
// respondiendo igual: retirar un enlace es reversible en una línea, borrar una ruta no.
//
// LAS DOS COLAS QUE ERAN DE «TRABAJO» AHORA CUELGAN DE SU SECCIÓN, que es el criterio de la v4:
// imputar un comprobante es trabajo sobre Compras, y corregir una marca es trabajo sobre Personal.
// Por eso `absorbe` las mueve ahí en vez de dejarlas sin solapa — una pantalla en la que la barra
// se apaga entera deja de decir dónde está parado el que la mira.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE ═══
//
// La lista estaba escrita DOS veces —`homeAdministracion.ts · AREAS` y `NavAdministracionTabs`— y
// había un test que leía el código fuente del segundo con una expresión regular para comprobar que
// no se desincronizaran. Eso no es una fuente única: es un detector de incendios. Acá está la
// lista, la importan los dos, y el detector sobra.
//
// Sin imports de Supabase ni de React: se prueba con `node --test` y lo puede leer un componente de
// cliente sin arrastrar el acceso a datos al navegador.

import type { Rol } from '@/features/auth/types'
import { puedeVerRuta } from '../../auth/types/areas.ts'

/** Los dos grupos de la barra. El filo va donde cambia la NATURALEZA del destino, no cada tres. */
export type GrupoArea = 'quien' | 'registro'

export interface Destino {
  clave: string
  titulo: string
  href: string
  grupo: GrupoArea
  /** Rutas que ya no tienen solapa propia y encienden ÉSTA. */
  absorbe?: readonly string[]
}

/** Un destino ya resuelto para pintar: con lo que hay del otro lado y lo que reclama trabajo. */
export interface AreaAdmin {
  clave: string
  titulo: string
  href: string
  grupo: GrupoArea
  /** `null` = no se pudo contar. Nunca 0 por defecto. */
  cuenta: number | null
  /** El texto del ⚠. `null` = nada que resolver: un aviso siempre encendido deja de leerse. */
  aviso: string | null
}

export const DESTINOS: readonly Destino[] = [
  // Clientes NO absorbe nada. Durante unas horas del 26/08/2026 absorbió `/administracion/portal` y
  // `/administracion/cronograma`, dos pantallas que duplicaban las solapas 31 y 32 de la ficha del
  // cliente; se retiraron y la absorción se fue con ellas. Quién entra al portal y qué cobros ve se
  // administra DENTRO de la ficha, que es una subruta de `/clientes` y ya enciende esta solapa sola.
  { clave: 'clientes', titulo: 'Clientes', href: '/clientes', grupo: 'quien' },
  // «Personal» y no «Personas»: es el rótulo del canónico 19 y el del mockup. La clave sigue siendo
  // `personas` porque es la que nombra la ruta y los identificadores de prueba.
  // Absorbe Asistencia: corregir una marca es trabajo sobre una persona, no un área hermana.
  {
    clave: 'personas', titulo: 'Personal', href: '/administracion/personas', grupo: 'quien',
    absorbe: ['/administracion/asistencia'],
  },
  { clave: 'proveedores', titulo: 'Proveedores', href: '/administracion/proveedores', grupo: 'quien' },
  // El libro de compras. NO entra en `RUTAS_SOLO_ECONOMIA`: una compra es COSTO, no PRECIO, y el
  // jefe de obra ve el costo de su obra (19/08).
  // Absorbe Pendientes de imputación: la fila sin obra que se resuelve ahí es una fila de Compras.
  {
    clave: 'compras', titulo: 'Compras', href: '/administracion/compras', grupo: 'registro',
    absorbe: ['/administracion/pendientes'],
  },
] as const

/**
 * LOS DESTINOS QUE ESTE ROL PUEDE ABRIR.
 *
 * El filtro es `puedeVerRuta`, el mismo portero que el middleware: una solapa que se dibuja y
 * termina en un redirect mudo es un botón que lleva a nada (QA del 21/08). `rol` indefinido —el
 * perfil todavía cargando— falla CERRADO: una solapa que aparece medio segundo y desaparece es
 * peor que una que tarda medio segundo en aparecer.
 */
export function destinosVisibles(rol: Rol | null | undefined): Destino[] {
  return DESTINOS.filter((d) => puedeVerRuta(rol, d.href))
}

/**
 * ¿HAY QUE DIBUJAR UN FILO ANTES DE ESTE DESTINO? Sólo cuando cambia el grupo.
 *
 * Se calcula sobre la lista YA filtrada por rol: el día que un destino vuelva a ser sólo de quien
 * ve economía, el filo no puede quedar colgando al final de la barra de quien no lo ve.
 */
export function hayFiloAntes(destinos: readonly Destino[], i: number): boolean {
  return i > 0 && destinos[i - 1].grupo !== destinos[i].grupo
}

/**
 * QUÉ SOLAPA ESTÁ ENCENDIDA PARA ESTA RUTA. `null` = ninguna, y eso es un estado legítimo.
 *
 * Devuelven `null` A PROPÓSITO `/administracion` (la entrada del área, que ya no es un destino de
 * nivel 2), `/administracion/usuarios` (bajó al menú de la cuenta), `/administracion/base-maestra`
 * (se fue a Presupuestos) y `/documentos` (se erradicó como destino). Las cuatro pantallas siguen
 * abriéndose por su ruta; lo que no hacen es encender una solapa que no existe.
 *
 * `absorbe` se mira en TODOS los destinos: Asistencia enciende Personal y Pendientes enciende
 * Compras. Hasta el 26/08/2026 el campo estaba declarado para cualquiera y leído para uno solo, y
 * ese era el defecto que apagaba la barra entera dentro del cronograma.
 *
 * Ya no hace falta el caso exacto que protegía a «Trabajo»: `/administracion` no es el `href` de
 * ningún destino, así que dejó de ser prefijo de todos.
 */
export function areaActiva(pathname: string | null | undefined): string | null {
  const ruta = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/'
  const dentroDe = (base: string) => ruta === base || ruta.startsWith(`${base}/`)
  for (const d of DESTINOS) {
    if (dentroDe(d.href) || (d.absorbe?.some(dentroDe) ?? false)) return d.clave
  }
  return null
}
