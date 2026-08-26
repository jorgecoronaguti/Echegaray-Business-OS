// LOS SIETE DESTINOS DE ADMINISTRACIÓN — la barra de nivel 2, en un solo lugar.
//
// ═══ QUÉ CAMBIÓ (00 · Home Navegación v2, zip del 25/08/2026) ═══
//
// Eran DIEZ tablas en fila: al mismo nivel convivían maestros (Clientes, Personas, Proveedores),
// registros (Compras, Base maestra, Documentos), colas de trabajo (Pendientes, Asistencia) y
// configuración (Usuarios). Una barra donde todo es hermano de todo no ordena nada: sólo enumera.
//
//   · TRABAJO absorbe Pendientes y las correcciones de Asistencia. Imputar un texto de obra no es
//     un área hermana de Clientes: es trabajo sobre comprobantes, y tenerlo aparte hacía que la
//     misma fila viviera en dos pantallas. Los filtros sucios de Compras y Proveedores entran por
//     el libro mayor de la entrada, no por una solapa.
//   · QUIÉN son los tres ejes relacionales — cliente, persona, proveedor.
//   · REGISTRO Y REFERENCIA es lo que se CONSULTA, no lo que se opera.
//   · PRESUPUESTOS sube a nivel 1 (es comercial) y USUARIOS baja al menú de la cuenta: se toca una
//     vez por mes y estaba al lado de Clientes, que se toca todos los días.
//
// NINGUNA RUTA SE ROMPIÓ. `/administracion/pendientes`, `/administracion/asistencia`,
// `/administracion/usuarios` y `/presupuestos` siguen existiendo y respondiendo igual; lo único que
// cambió es desde dónde se llega. Retirar un enlace es reversible en una línea; borrar una ruta no.
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

/** Los tres grupos de la barra. El filo va donde cambia la NATURALEZA del destino, no cada tres. */
export type GrupoArea = 'trabajo' | 'quien' | 'registro'

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
  // La entrada ES el trabajo: debajo de la barra vive el libro mayor de las siete señales, y cada
  // fila lleva al filtro donde se resuelve. Por eso apunta a `/administracion` y no a una pantalla
  // nueva que sería la misma.
  {
    clave: 'trabajo', titulo: 'Trabajo', href: '/administracion', grupo: 'trabajo',
    absorbe: ['/administracion/pendientes', '/administracion/asistencia'],
  },
  // Clientes ABSORBE las dos pantallas del portal del cliente. No son un octavo destino: la barra
  // tiene siete y el mockup manda. Y no son hermanas de Clientes — son lo que se le hace A un
  // cliente: a quién de él se le da acceso, y qué cobros ve de cada obra. Con solapa propia, la
  // barra diría que hay nueve áreas; sin absorción, se apagaría entera adentro de ellas y la
  // pantalla dejaría de decir dónde está parado el que la mira.
  {
    clave: 'clientes', titulo: 'Clientes', href: '/clientes', grupo: 'quien',
    absorbe: ['/administracion/portal', '/administracion/cronograma'],
  },
  // «Personal» y no «Personas»: es el rótulo del canónico 19 y el del mockup. La clave sigue siendo
  // `personas` porque es la que nombra la ruta y los identificadores de prueba.
  { clave: 'personas', titulo: 'Personal', href: '/administracion/personas', grupo: 'quien' },
  { clave: 'proveedores', titulo: 'Proveedores', href: '/administracion/proveedores', grupo: 'quien' },
  // El libro de compras de ARCA (pantalla 24). NO entra en `RUTAS_SOLO_ECONOMIA`: una compra es
  // COSTO, no PRECIO, y el jefe de obra ve el costo de su obra (19/08).
  { clave: 'compras', titulo: 'Compras', href: '/administracion/compras', grupo: 'registro' },
  // La biblioteca de análisis de precio unitario: no se entra a hacer un trámite, se entra a mirar
  // con qué se cotiza. Lo económico de esa pantalla lo cierra la base (`recurso_precio`).
  { clave: 'base-maestra', titulo: 'Base maestra', href: '/administracion/base-maestra', grupo: 'registro' },
  // SÍ entra en `RUTAS_SOLO_ECONOMIA`, y por eso el jefe de obra no la ve: las tres carpetas raíz
  // del índice son `administracion`, `archivo-fiscal` y `libro-sueldos`.
  { clave: 'documentos', titulo: 'Documentos', href: '/documentos', grupo: 'registro' },
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
 * Se calcula sobre la lista YA filtrada por rol: si el jefe de obra no ve Documentos, el filo no
 * puede quedar colgando al final de la barra.
 */
export function hayFiloAntes(destinos: readonly Destino[], i: number): boolean {
  return i > 0 && destinos[i - 1].grupo !== destinos[i].grupo
}

/**
 * QUÉ SOLAPA ESTÁ ENCENDIDA PARA ESTA RUTA. `null` = ninguna, y eso es un estado legítimo.
 *
 * `/administracion/usuarios` devuelve `null` A PROPÓSITO: Usuarios bajó al menú de la cuenta y ya
 * no es una sección del área. La pantalla sigue abriéndose por su ruta y por el menú; lo que no
 * hace es encender una solapa que no existe.
 *
 * El orden importa: el destino más específico gana. `/administracion` es prefijo de todas las demás
 * rutas del área, así que sólo enciende Trabajo cuando es la ruta exacta o una de las absorbidas.
 *
 * `absorbe` se mira en TODOS los destinos, no sólo en Trabajo. Hasta el 26/08/2026 el campo estaba
 * declarado para cualquiera y leído para uno solo: agregar una pantalla que colgara de otra solapa
 * exigía un octavo destino —que el mockup no tiene y que un test prohíbe—, así que la única salida
 * era dejarla sin solapa. Ese es el defecto que apagaba la barra entera dentro del cronograma.
 */
export function areaActiva(pathname: string | null | undefined): string | null {
  const ruta = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/'
  const dentroDe = (base: string) => ruta === base || ruta.startsWith(`${base}/`)
  const enciende = (d: Destino) => dentroDe(d.href) || (d.absorbe?.some(dentroDe) ?? false)
  // Trabajo va al final: su `href` es prefijo de todas las rutas del área y ganaría siempre.
  for (const d of DESTINOS) {
    if (d.clave === 'trabajo') continue
    if (enciende(d)) return d.clave
  }
  const trabajo = DESTINOS[0]
  // Para Trabajo el `href` se compara EXACTO, no por prefijo, por lo mismo.
  if (ruta === trabajo.href || trabajo.absorbe?.some(dentroDe)) return trabajo.clave
  return null
}
