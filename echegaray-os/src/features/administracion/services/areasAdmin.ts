// LOS DESTINOS DE ADMINISTRACIÓN — la barra de nivel 2, en un solo lugar.
//
// ═══ PROVEEDORES SE FUE ADENTRO DE COMPRAS (dueño, 16/09/2026) ═══
//
// «Quiero que pongas todo el módulo proveedores dentro de "compras" como sección». La barra queda en
// **Clientes · Personal | Compras** y Proveedores pasa a ser una SECCIÓN de Compras, con el mismo
// patrón que Personal (Plantel · Horas · Liquidación): la lista de secciones vive en
// `seccionesDeCompras.ts` y la dibuja `CabeceraSeccion`.
//
// NO ES UN DESTINO MENOS: es el mismo destino un nivel más adentro, y con el nivel 3 plano —
// Compras · Proveedores · A quién le debo · Nombres sin resolver— la deuda y la cola de nombres
// pasan de dos clics a uno. Por eso `/administracion/proveedores` entra en el `absorbe` de Compras:
// una pantalla en la que la barra se apaga entera deja de decir dónde está parado el que la mira.
//
// LA RUTA NO SE MOVIÓ. `/administracion/proveedores`, `?vista=deuda` y `/administracion/proveedores/
// <id>` siguen siendo las mismas: el porqué está en `seccionesDeCompras.ts` (diez `revalidatePath`
// que fallan en silencio, los enlaces que el bot ya mandó por Mattermost, ocho specs).
//
// ═══ QUÉ CAMBIÓ ANTES (handoff CRM / Administración v4, 04/09/2026) ═══
//
// La barra había quedado en **Clientes · Personal · Proveedores | Compras**, y eso sacó tres
// destinos que estaban en la v2. El motivo no es que sobre lugar: es que ninguno de los tres respondía una
// pregunta que no respondiera ya la sección de al lado.
//
//   · TRABAJO enumeraba lo que cada sección ya reclama en sus propias filas. Un destino que sólo
//     lista los pendientes de los demás obliga a mirar dos pantallas para el mismo trabajo, y la
//     v4 elimina además la banda de señales: lo que falta se marca en la fila que lo tiene.
//   · DOCUMENTOS era un repositorio general de archivos. Los papeles se leen colgados de su obra,
//     su persona, su cliente o su proveedor —donde ya viven las fichas—; un catálogo transversal no
//     contesta ninguna pregunta del día. (VOLVIÓ el 23/09/2026 por decisión del dueño: ver abajo.)
//   · BASE MAESTRA se fue a Presupuestos: tareas tipo y recursos no son administración, son la
//     materia con la que se cotiza. Se enlaza desde `/presupuestos`.
//
// NINGUNA RUTA SE BORRÓ. `/administracion` (la entrada del área, a la que sigue llevando la solapa
// de nivel 1), `/administracion/base-maestra`, `/administracion/pendientes`,
// `/administracion/personas/correcciones` (antes `/administracion/asistencia`), `/administracion/usuarios` y `/documentos` siguen existiendo y
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
    absorbe: ['/administracion/personas/correcciones'],
  },
  // El libro de compras, y desde el 16/09/2026 TODO el módulo de proveedores adentro. NO entra en
  // `RUTAS_SOLO_ECONOMIA`: una compra es COSTO, no PRECIO, y el jefe de obra ve el costo de su obra
  // (19/08) — lo mismo vale para el proveedor al que se le compró.
  //
  // Absorbe tres rutas, y las tres por el mismo criterio: son trabajo SOBRE Compras.
  //   · `/administracion/pendientes`  la fila sin obra que se resuelve ahí es una fila de Compras;
  //   · `/administracion/proveedores` la sección Proveedores y sus dos colas (`?vista=deuda`,
  //     `?vista=resolver`), más la ficha de cada proveedor, que es una subruta suya.
  {
    clave: 'compras', titulo: 'Compras', href: '/administracion/compras', grupo: 'registro',
    absorbe: ['/administracion/pendientes', '/administracion/proveedores'],
  },
  // IMPUESTOS (dueño, 16/09/2026). Registro, igual que Compras. SÍ entra en `RUTAS_SOLO_ECONOMIA`: el
  // impuesto de la empresa es plata de la empresa, no el costo de una obra, y la base lo cierra con
  // `ve_economia()`. Por eso el jefe de obra no ve esta solapa.
  { clave: 'impuestos', titulo: 'Impuestos', href: '/administracion/impuestos', grupo: 'registro' },
  // PRESUPUESTOS VA ÚLTIMO (dueño, 21/09/2026: «mover "presupuestos" a después de impuestos»).
  //
  // Primero lo puse pegado a Clientes, razonando que un presupuesto se hace PARA UN CLIENTE. El
  // dueño lo corrigió mirando la barra: va al final. Y cierra mejor de lo que yo había supuesto —
  // la barra queda «a quién le hablamos» (Clientes, Personal) y después «lo que registramos»
  // (Compras, Impuestos, Presupuestos), que es el orden del trabajo, no el del organigrama. Por eso
  // pasa al grupo `registro`: si quedara en `quien` al final, el filo del grupo caería en el lugar
  // equivocado y la barra diría que un presupuesto es una persona.
  //
  // Absorbe la base maestra, que se le había mudado el 26/08: tareas tipo y recursos son la materia
  // con la que se cotiza, así que encienden la misma solapa que la cotización.
  {
    clave: 'presupuestos', titulo: 'Presupuestos', href: '/presupuestos', grupo: 'registro',
    absorbe: ['/administracion/base-maestra'],
  },
  // DOCUMENTOS Y FUENTES NO VAN EN LA BARRA (dueño, 23/09/2026: «¿qué son esas dos secciones? quitalas
  // de todo en computadora y mobile»). Las rutas `/documentos` e `/integraciones` siguen existiendo sin
  // solapa; el mapa de pantallas las tenía como huérfanas y así se quedan.
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
 * `absorbe` se mira en TODOS los destinos: Asistencia enciende Personal, y Pendientes, Proveedores
 * y la ficha de un proveedor encienden Compras. Hasta el 26/08/2026 el campo estaba declarado para
 * cualquiera y leído para uno solo, y ese era el defecto que apagaba la barra entera dentro del
 * cronograma.
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
