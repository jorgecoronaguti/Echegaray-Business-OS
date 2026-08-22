// EL MODELO DEL CRONOGRAMA — agrupar, medir y clasificar. Sin React y sin Supabase.
//
// Vive acá y no dentro del componente porque es la parte que se puede probar sin navegador, y es
// donde están las decisiones que se pueden equivocar en silencio: de qué grupo cuelga cada fila y
// sobre cuántas actividades se toma un promedio.
//
// ═══ DE DÓNDE SALE UN GRUPO (medido contra la base real, 18/08/2026) ═══
//
// No hay columna `grupo` y no hace falta inventarla: el tracker ya trae la estructura en dos
// columnas que existen desde el día uno. De 344 actividades cargadas, 153 son filas `tipo='resumen'`
// y 309 tienen `seccion`. Y en las cuatro secciones de «le-comedor» el NOMBRE de la fila de resumen
// coincide exactamente con la `seccion` de sus hijas (4 de 4).
//
// Entonces la regla es: el grupo de una fila de resumen es SU PROPIO NOMBRE, y el de una tarea es su
// `seccion`. NO se usa la `seccion` de la fila de resumen: en los datos reales viene arrastrada de
// la sección anterior —la fila resumen «Portones» tiene `seccion='Comedor-Vestuario'`—, y agrupar
// por ahí metería cada cabecera dentro del grupo de arriba.
//
// ═══ POR QUÉ EL AVANCE DEL GRUPO SE DERIVA Y NO SE LEE ═══
//
// Las filas de resumen TIENEN un `pct` guardado, y está podrido: «Comedor-Vestuario» dice 0% con
// veintiuna hijas que promedian más de 90%. No es un error de carga que haya que arreglar acá — es
// que ese número no lo mantiene nadie. La medida canónica de la obra (vista `obra_avance`) promedia
// las actividades CON FECHA que NO son de resumen, y este promedio por grupo usa exactamente la
// misma regla para que el grupo y la obra no digan dos cosas distintas del mismo trabajo.

import type { Actividad } from '../types'

/** Las filas sin `seccion` no se cuelgan de un grupo inventado: se juntan bajo su propio rótulo. */
export const SIN_GRUPO = ' sin-grupo'

export type EstadoActividad = 'sin_fecha' | 'por_empezar' | 'en_curso' | 'atrasada' | 'terminada'

export const ESTADO_LABEL: Record<EstadoActividad, string> = {
  sin_fecha: 'sin fecha',
  por_empezar: 'por empezar',
  en_curso: 'en curso',
  atrasada: 'atrasada',
  terminada: 'terminada',
}

/**
 * EN QUÉ ESTADO ESTÁ UNA ACTIVIDAD, cruzando su ventana con su avance.
 *
 * El avance manda sobre la fecha: una actividad al 100% cuyo fin ya pasó está TERMINADA, no
 * atrasada. Al revés —clasificar por fecha y después mirar el avance— el tablero marcaría en rojo
 * todo lo que se hizo y se entregó, que es la manera más rápida de que nadie lo mire más.
 */
export function estadoDe(
  a: Pick<Actividad, 'inicio_plan' | 'fin_plan' | 'pct'>
    & Partial<Pick<Actividad, 'estado_fecha' | 'inicio_real' | 'fin_real'>>,
  hoy: string,
): EstadoActividad {
  if ((a.pct ?? 0) >= 100 || a.estado_fecha === 'terminada' || a.fin_real != null) return 'terminada'
  // SIN FECHA ES LO QUE DICE LA FUENTE, no «le falta el inicio del plan». Una actividad con fin de
  // plan cargado, o con partes de avance encima, TIENE fecha: decirle «sin fecha» acá y dibujarle
  // una barra en el Gantt es cómo la misma tarea aparecía con y sin fecha en dos pantallas.
  const sinPlan = a.inicio_plan == null && a.fin_plan == null
  if (a.estado_fecha === 'sin_fecha' || (sinPlan && a.inicio_real == null)) return 'sin_fecha'
  // EL ATRASO SE MIDE CONTRA EL PLAN. Una actividad que arrancó y no tiene fecha comprometida no
  // puede estar atrasada: no hay contra qué. Ponerla en rojo por su propia fecha de arranque es
  // castigar a la que sí registró el parte.
  const finPlan = a.fin_plan ?? a.inicio_plan
  if (finPlan != null && finPlan < hoy) return 'atrasada'
  if (a.inicio_plan != null ? a.inicio_plan <= hoy : a.inicio_real != null) return 'en_curso'
  return 'por_empezar'
}

export interface GrupoCronograma {
  clave: string
  nombre: string
  /** La fila `resumen` del tracker, si esta obra la trae. Puede no existir. */
  cabecera: Actividad | null
  hijas: Actividad[]
  /** Derivados de las hijas: la fila de resumen no trae fechas (0 de 4 en los datos reales). */
  inicio: string | null
  fin: string | null
  /** Promedio simple sobre las hijas CON FECHA. `null` si ninguna se puede medir todavía. */
  pct: number | null
  /** Sobre cuántas actividades se tomó ese promedio. Es la cobertura del número y viaja con él. */
  medidas: number
}

/**
 * DE QUÉ GRUPO ES UNA FILA — la regla, sola, para que no exista dos veces.
 *
 * El grupo de una fila de resumen es SU PROPIO NOMBRE, y el de una tarea es su `seccion`. En los
 * datos reales la `seccion` de una fila de resumen viene arrastrada de la sección anterior —la
 * fila «Encofrado» de Messina trae `seccion='Armadura…'`—, así que agrupar la cabecera por ahí la
 * metería dentro del grupo de arriba.
 *
 * Se extrajo de `agruparActividades` cuando la 08 necesitó la MISMA regla para armar los frentes
 * de la dotación: dos implementaciones de esto darían un frente en el cronograma y otro distinto
 * en la proyección, sobre las mismas actividades.
 */
export function claveDeGrupo(a: { tipo?: string | null; nombre: string; seccion?: string | null }): string {
  if (a.tipo === 'resumen') return a.nombre
  const s = a.seccion?.trim()
  return s ? s : SIN_GRUPO
}

/**
 * AGRUPA EL CRONOGRAMA respetando el orden del tracker.
 *
 * La fila de resumen se consume como CABECERA del grupo y no vuelve a aparecer como hija: si
 * apareciera en los dos lados, el promedio del grupo se tomaría sobre un denominador con una fila
 * que no es trabajo, y el avance saldría diluido sin que nadie vea un error.
 */
export function agruparActividades(actividades: Actividad[]): GrupoCronograma[] {
  const porClave = new Map<string, GrupoCronograma>()
  const orden: string[] = []

  const tomar = (clave: string, nombre: string): GrupoCronograma => {
    let g = porClave.get(clave)
    if (!g) {
      g = { clave, nombre, cabecera: null, hijas: [], inicio: null, fin: null, pct: null, medidas: 0 }
      porClave.set(clave, g)
      orden.push(clave)
    }
    return g
  }

  for (const a of actividades) {
    if (a.tipo === 'resumen') {
      const g = tomar(a.nombre, a.nombre)
      // Dos filas de resumen con el mismo nombre: la primera manda y la segunda cae como hija, que
      // es preferible a perderla. No se inventa un grupo nuevo con el mismo rótulo.
      if (g.cabecera === null) g.cabecera = a
      else g.hijas.push(a)
    } else {
      const clave = claveDeGrupo(a)
      tomar(clave, clave === SIN_GRUPO ? 'Sin clasificar' : clave).hijas.push(a)
    }
  }

  for (const g of porClave.values()) derivar(g)
  // LO QUE NADIE CLASIFICÓ VA AL FINAL, Y SE LLAMA «SIN CLASIFICAR» (20/08/2026). Se llamaba «Sin
  // sección» y, por venir en el orden del tracker, encabezaba la pantalla: la primera lectura de la
  // obra era un bloque que dice que falta un dato. El trabajo clasificado va arriba y lo pendiente
  // de clasificar queda abajo, que es donde se lo va a buscar cuando se lo quiera acomodar.
  const conRubro = orden.filter((c) => c !== SIN_GRUPO)
  if (orden.includes(SIN_GRUPO)) conRubro.push(SIN_GRUPO)
  return conRubro.map((c) => porClave.get(c)!)
}

/**
 * Las fechas y el avance de un grupo, DERIVADOS de sus hijas. Una sola implementación para los dos
 * ejes de agrupación —por sección y por obra—: si cada uno derivara el suyo, el mismo trabajo
 * mostraría dos porcentajes según desde qué pantalla se lo mire.
 */
function derivar(g: GrupoCronograma): void {
  let suma = 0
  for (const h of g.hijas) {
    if (h.inicio_plan && (g.inicio === null || h.inicio_plan < g.inicio)) g.inicio = h.inicio_plan
    const fin = h.fin_plan ?? h.inicio_plan
    if (fin && (g.fin === null || fin > g.fin)) g.fin = fin
    // Misma regla que la vista `obra_avance`: con fecha y sin filas de resumen.
    if (h.inicio_plan && h.tipo !== 'resumen') { suma += h.pct ?? 0; g.medidas++ }
  }
  g.pct = g.medidas ? Math.round(suma / g.medidas) : null
}

/**
 * EL MISMO CRONOGRAMA, AGRUPADO POR OBRA — lo que dibuja el Gantt global de `/obras/cronograma`.
 *
 * El dueño (19/08): *"El Gantt global y el Gantt de una obra deben consumir exactamente las mismas
 * actividades canónicas"*. Por eso esto NO es otro modelo: son las mismas `Actividad`, el mismo
 * componente y la misma derivación (`derivar`). Lo único que cambia es el eje: en la obra el grupo
 * es la sección del tracker; acá es la obra.
 *
 * ═══ LAS FILAS DE RESUMEN NO SE DIBUJAN COMO TAREAS ═══
 *
 * En la vista de la obra, cada `tipo='resumen'` se consume como CABECERA de su sección y no aparece
 * como una barra más. Si acá entraran como hijas, la misma obra tendría 153 barras de más que en su
 * propia ficha —el trabajo contado dos veces— y las dos pantallas dirían cosas distintas del mismo
 * cronograma. Son títulos del tracker, no trabajo.
 */
export function agruparPorObra(
  actividades: Actividad[],
  nombreDeObra: ReadonlyMap<string, string>,
): GrupoCronograma[] {
  const porClave = new Map<string, GrupoCronograma>()
  const orden: string[] = []
  for (const a of actividades) {
    if (a.tipo === 'resumen') continue
    let g = porClave.get(a.obra_id)
    if (!g) {
      // Sin nombre en el portafolio se usa el id: es feo y es la verdad. Un rótulo inventado sería
      // peor que feo.
      g = {
        clave: a.obra_id, nombre: nombreDeObra.get(a.obra_id) ?? a.obra_id,
        cabecera: null, hijas: [], inicio: null, fin: null, pct: null, medidas: 0,
      }
      porClave.set(a.obra_id, g)
      orden.push(a.obra_id)
    }
    g.hijas.push(a)
  }
  for (const g of porClave.values()) derivar(g)
  return orden.map((c) => porClave.get(c)!)
}

/**
 * LAS ARCHIVADAS NO ENTRAN A NINGUNA LISTA: para eso se archivan. Está acá y no escrito a mano en
 * cada pantalla porque el Gantt de la obra y el global tienen que recortar IGUAL — si uno filtrara y
 * el otro no, la lista global mostraría trabajo que la obra ya sacó de su plan.
 */
export const sinArchivar = (actividades: Actividad[]): Actividad[] => actividades.filter((a) => !a.archivada)

/**
 * ¿AGREGAR ESTA PRECEDENCIA CIERRA UN CÍRCULO?
 *
 * La base ya impide las dos formas obvias —una actividad contra sí misma, y la misma pareja dos
 * veces—, pero no puede ver un círculo largo: A antes que B, B antes que C, C antes que A. Un
 * cronograma con un círculo no tiene principio, y cualquier cosa que después calcule fechas o camino
 * crítico se cuelga o devuelve cualquier cosa. Se corta acá, cuando todavía hay a quién avisarle.
 *
 * Se recorre hacia adelante desde el destino: si desde ahí se llega al origen, la nueva arista lo
 * cierra.
 */
export function haceCiclo(
  aristas: readonly { origen_id: string; destino_id: string }[],
  origenId: string,
  destinoId: string,
): boolean {
  if (origenId === destinoId) return true
  const salidas = new Map<string, string[]>()
  for (const e of aristas) {
    const xs = salidas.get(e.origen_id)
    if (xs) xs.push(e.destino_id)
    else salidas.set(e.origen_id, [e.destino_id])
  }
  const vistos = new Set<string>()
  const pila = [destinoId]
  while (pila.length) {
    const n = pila.pop()!
    if (n === origenId) return true
    if (vistos.has(n)) continue
    vistos.add(n)
    for (const s of salidas.get(n) ?? []) pila.push(s)
  }
  return false
}

export type Fila =
  | { tipo: 'grupo'; clave: string; grupo: GrupoCronograma }
  | { tipo: 'actividad'; clave: string; actividad: Actividad; grupo: GrupoCronograma }

/**
 * LA LISTA PLANA QUE SE DIBUJA, ya con los grupos colapsados sacados.
 *
 * El Gantt ubica cada barra por su ÍNDICE en esta lista, así que la grilla de la izquierda y las
 * barras de la derecha tienen que recorrer exactamente esto mismo: dos recorridos distintos es de
 * donde sale una barra dibujada en la fila de otra actividad.
 */
export function filasVisibles(grupos: GrupoCronograma[], colapsados: ReadonlySet<string>): Fila[] {
  const filas: Fila[] = []
  for (const g of grupos) {
    // Un grupo sin nombre real —el cajón de las que no tienen sección— no dibuja cabecera cuando es
    // el único: sería un rótulo que no agrupa nada contra qué compararlo.
    const soloCajon = grupos.length === 1 && g.clave === SIN_GRUPO
    if (!soloCajon) filas.push({ tipo: 'grupo', clave: `g:${g.clave}`, grupo: g })
    if (colapsados.has(g.clave)) continue
    for (const a of g.hijas) filas.push({ tipo: 'actividad', clave: a.id, actividad: a, grupo: g })
  }
  return filas
}

// ═══ DÓNDE EMPIEZA CADA FILA — la aritmética que alinea la tabla con el Gantt ═══
//
// La tabla dibuja las filas en flujo y el Gantt las dibuja POSICIONADAS: la barra de la fila `i`
// vive en un lienzo absoluto y tiene que caer exactamente sobre el renglón `i` de la izquierda. Los
// dos lados leen esta misma función, y por eso no pueden desfasarse.
//
// EL SALTO DE 8px ANTES DE CADA RUBRO SE ACUMULA. Es el detalle que se equivoca en silencio: la
// tabla lo agrega como margen y el lienzo lo tiene que SUMAR a todas las filas que vienen después.
// Calculando `top = i × alto` —el camino obvio— la primera actividad queda alineada, la del segundo
// rubro cae 8px arriba de su barra, la del tercero 16, y a la quinta sección la pantalla muestra el
// avance de la actividad de al lado sin un solo error visible.

/** El alto de la fila compacta del handoff (`--os-row-h-compacta`). */
export const ALTO_FILA = 38
/** La separación que abre cada rubro. `COMPONENTS.md` §Table: «separación de 8px antes de cada grupo». */
export const SALTO_RUBRO = 8

export interface Disposicion {
  /** El desplazamiento vertical de cada fila dentro del lienzo, en el orden de `filas`. */
  tops: number[]
  /** El aire que abre cada fila. Es el `margin-top` de la tabla y ya está sumado en `tops`. */
  saltos: number[]
  alto: number
  /** El alto del lienzo entero: la última fila más su alto. */
  total: number
}

export function disposicionDeFilas(
  filas: readonly Fila[],
  alto: number = ALTO_FILA,
  salto: number = SALTO_RUBRO,
): Disposicion {
  const tops: number[] = []
  const saltos: number[] = []
  let y = 0
  filas.forEach((f, i) => {
    // El primer rubro no abre aire: arriba tiene el encabezado, que ya lo separa.
    const s = f.tipo === 'grupo' && i > 0 ? salto : 0
    y += s
    saltos.push(s)
    tops.push(y)
    y += alto
  })
  return { tops, saltos, alto, total: y }
}
