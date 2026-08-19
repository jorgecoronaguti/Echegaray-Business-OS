// EL GANTT GLOBAL ES DE OBRAS — UN RENGLÓN POR OBRA, NO 344 ACTIVIDADES.
//
// El dueño, textual: *"NO quiero las 344 actividades de todas las obras desplegadas. Quiero UN
// RENGLÓN POR OBRA"* · *"El global agrega la información de las actividades canónicas por `obra_id`.
// No duplicar datos."*
//
// ═══ POR QUÉ ESTE ARCHIVO NO CALCULA UN SOLO MÍNIMO NI UN SOLO MÁXIMO ═══
//
// La agregación `min(inicio_plan)` / `max(fin_plan)` / `min(inicio_base)` / `max(fin_base)` por
// `obra_id` YA la hace la vista `obra_plan_vs_real` (CTE `plazo`), que es la misma que alimenta el
// portafolio y el bloque «Plan contra real» de cada obra. Traer las 344 actividades al navegador
// para reducirlas acá sería la SEGUNDA definición de "cuándo empieza y cuándo termina una obra": el
// día que una de las dos cambiara el recorte —las archivadas, los hitos, el tipo `resumen`— el
// renglón del Gantt global y el desvío de plazo de la ficha dirían plazos distintos de la misma
// obra, y no habría forma de saber cuál miente.
//
// ═══ LAS COLUMNAS SE PIDEN UNA POR UNA, Y ESO NO ES ESTILO ═══
//
// `obra_plan_vs_real` publica también contrato, presupuesto y los dos márgenes. Esta pantalla no
// habla de plata: un `select('*')` traería esos importes al cliente de todos los que abran el Gantt
// —enmascarados por la vista, sí, pero viajando igual— sin que ninguna línea de la pantalla los
// use. Lo que no se pide no se puede filtrar mal más tarde.
//
// LO PURO ESTÁ SEPARADO DE LA LECTURA A PROPÓSITO: el orden de los renglones y la decisión de "esta
// obra no tiene barra" se prueban con `node --test`, sin navegador y sin base.

import type { SupabaseClient } from '@supabase/supabase-js'
// Con extensión: `ganttObras.test.ts` lo corre con borrado de tipos y `ordenar` es un valor real.
import { ordenar, type CampoOrden, type Direccion } from './ordenObras.ts'
import type { Etapa, ServiceResult } from '../types'

/**
 * LO QUE EL GANTT GLOBAL NECESITA DE CADA OBRA. Es un subconjunto declarado de `PlanVsReal`, no un
 * tipo nuevo del mismo concepto: los nombres son los de la vista, letra por letra.
 */
export interface PlazoObra {
  obra_id: string
  nombre: string
  /** El cliente de la obra, ya resuelto por `obra_panel` (ficha si la hay, texto si no). */
  cliente_nombre: string | null
  /** La etapa CANÓNICA, la misma columna que lee el Resumen. `null` = sin declarar. */
  etapa: Etapa | null
  estado: string
  inicio_plan: string | null
  fin_plan: string | null
  inicio_base: string | null
  fin_base: string | null
  avance_pct: number | null
  desvio_plazo_dias: number | null
  n_actividades: number
}

/**
 * La lista literal que se le pide a PostgREST. Sin una sola columna de plata.
 *
 * `etapa` y `cliente_nombre` ENTRAN POR ACÁ Y NO POR UNA SEGUNDA CONSULTA (20/08). El dueño:
 * *"La etapa mostrada debe ser EXACTAMENTE la misma que aparece en /obras Resumen"* · *"NO crear
 * una segunda definición de etapa"*. Las dos pantallas cuelgan de `obra_panel` —el Resumen directo,
 * el Gantt a través de `obra_plan_vs_real`—, así que es la misma columna de la misma fila: no hay
 * dos definiciones que puedan separarse, ni siquiera si mañana alguien cambia cómo se calcula.
 *
 * NO SE PIDE `cliente_slug`, y no es un olvido: `obra_plan_vs_real` no lo publica —lo publica
 * `obra_panel`, que es de donde lo toma el Resumen—, y acá no hace falta porque en el Gantt el
 * cliente NO es un enlace: el renglón entero ya es un enlace a la obra y un `<a>` dentro de otro
 * `<a>` es marcado que el navegador desarma solo. La puerta a la ficha CRM está en el Resumen.
 * Pedirlo igual costaba una migración sobre la vista de la que cuelga el plazo de todo el módulo.
 */
export const COLUMNAS_PLAZO =
  'obra_id,nombre,cliente_nombre,etapa,estado,'
  + 'inicio_plan,fin_plan,inicio_base,fin_base,avance_pct,desvio_plazo_dias,n_actividades'

/**
 * EL PLAZO DE CADA OBRA VISIBLE. Qué obras vuelven NO lo decide esta función: lo decide el RLS de
 * `obra_plan_vs_real` (`security_invoker`). Un jefe de obra abre `/obras/gantt` y ve los renglones
 * de SUS obras sin que haya un `if` de permiso acá.
 */
export async function getPlazoPorObra(supabase: SupabaseClient): Promise<ServiceResult<PlazoObra[]>> {
  const { data, error } = await supabase.from('obra_plan_vs_real').select(COLUMNAS_PLAZO)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as PlazoObra[], error: null }
}

const DIA = 86400000
const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const diasEntre = (desde: string, hasta: string) => Math.round((aDate(hasta).getTime() - aDate(desde).getTime()) / DIA)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL SEMÁFORO DE PLAZO — la regla, escrita una sola vez
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El dueño (20/08), textual: *"No pintar rojo sólo porque la fecha fin pasó"* · *"La prioridad
// visual es: que el rojo vuelva a significar «requiere atención»."*
//
// LO QUE ESTABA MAL. La barra era roja con una sola condición: `fin_plan < hoy && avance < 100`.
// Con eso, Comedor —93% terminada, con dos días de trabajo por delante— y Galpón 9 —96%— salían
// del mismo color que Salón Comercial, que va 0% con tres cuartas partes de su plazo consumido.
// Cuatro de cinco barras rojas: el color dejó de señalar y pasó a ser el fondo de la pantalla.
//
// LA REGLA, ENTERA:
//
//   avanceEsperado = 100 × (hoy − inicio) / (fin − inicio), acotado a [0, 100]
//   brechaPuntos   = avanceEsperado − avance, nunca negativa (ir adelantado no es un desvío)
//   atrasoDias     = brechaPuntos × duración / 100 — los días de trabajo que faltan contra el plan
//
//   sin fechas de plan, o sin avance publicado  → SIN DATOS (gris)
//   avance ≥ 100                                → AL DÍA — terminada, no importa la fecha
//   brecha > 25 puntos  o  atraso > 30 días     → ATRASO CRÍTICO (rojo)
//   brecha > 10 puntos  o  atraso > 10 días     → ATRASO MENOR (ámbar)
//   el resto                                    → AL DÍA
//
// POR QUÉ LAS DOS UNIDADES Y NO UNA. Los puntos porcentuales solos no ven el tamaño: 8 puntos en
// una obra de dos años son 58 días de trabajo perdidos y se pintarían verdes. Los días solos no
// ven la escala corta: en una obra de 19 días, 10 de atraso es más de la mitad de la obra y aún así
// pasarían por «menor». Cada unidad manda donde la otra se queda ciega, y por eso van con `o`.
//
// EL AVANCE ESPERADO ES UNA ESTIMACIÓN, NO UN HECHO: supone que el trabajo se reparte parejo sobre
// el calendario, y una obra real no avanza así. Sirve para ORDENAR la atención, no para afirmar
// cuánto se atrasó una obra — por eso la pantalla lo dice con esa palabra en el detalle de cada
// renglón, y por eso el semáforo no se guarda en ninguna columna de la base.

/** Los cuatro números de la regla, en un solo lugar: la prueba y el comentario leen de acá. */
export const UMBRAL_ATRASO = {
  menorPuntos: 10,
  criticoPuntos: 25,
  menorDias: 10,
  criticoDias: 30,
} as const

export type Semaforo = 'sin_datos' | 'al_dia' | 'atraso_menor' | 'atraso_critico'

export interface Desvio {
  semaforo: Semaforo
  /** Cuánto debería llevar avanzado por calendario. `null` = no se puede juzgar. ESTIMACIÓN. */
  avanceEsperadoPct: number | null
  /** Puntos de avance que faltan contra lo esperado. Nunca negativo. */
  brechaPuntos: number | null
  /** Esos puntos convertidos a días de trabajo del plan. ESTIMACIÓN. */
  atrasoDias: number | null
}

const SIN_DATOS: Desvio = { semaforo: 'sin_datos', avanceEsperadoPct: null, brechaPuntos: null, atrasoDias: null }

/**
 * EL SEMÁFORO DE UNA OBRA. Función pura y con el día por parámetro: la regla que decide el color de
 * la pantalla se prueba sin navegador, sin base y en cualquier fecha.
 */
export function desvioDePlazo(
  inicio: string | null, fin: string | null, avancePct: number | null, hoyIso: string,
): Desvio {
  // NO SE JUZGA LO QUE NO SE PUEDE JUZGAR. Sin fechas o sin avance publicado el renglón va gris:
  // pintarlo verde diría «esta obra está bien» sobre una obra de la que no se sabe nada, que es la
  // mentira más cara de las cuatro — es justo la que hay que ir a cargar.
  if (!inicio || !fin || avancePct == null) return SIN_DATOS

  const duracion = Math.max(1, diasEntre(inicio, fin))
  const esperado = Math.min(100, Math.max(0, (diasEntre(inicio, hoyIso) / duracion) * 100))
  const brecha = Math.max(0, esperado - avancePct)
  const atrasoDias = (brecha * duracion) / 100
  const medida = {
    avanceEsperadoPct: Math.round(esperado),
    brechaPuntos: Math.round(brecha),
    atrasoDias: Math.round(atrasoDias),
  }

  // TERMINADA ES TERMINADA. Una obra al 100% no tiene nada pendiente que pueda estar atrasado,
  // aunque haya cerrado tres semanas después de su fin previsto. Ese desvío se mide contra la
  // línea base, en la ficha de la obra, no acá.
  if (avancePct >= 100) return { semaforo: 'al_dia', ...medida }
  if (brecha > UMBRAL_ATRASO.criticoPuntos || atrasoDias > UMBRAL_ATRASO.criticoDias) {
    return { semaforo: 'atraso_critico', ...medida }
  }
  if (brecha > UMBRAL_ATRASO.menorPuntos || atrasoDias > UMBRAL_ATRASO.menorDias) {
    return { semaforo: 'atraso_menor', ...medida }
  }
  return { semaforo: 'al_dia', ...medida }
}

/** La barra de una obra: sólo existe si la obra tiene cuándo empezar. */
export interface Barra {
  inicio: string
  fin: string
  /** Relleno proporcional. `null` = no hay avance publicado, y entonces no se rellena nada. */
  avancePct: number | null
  /** La línea base sellada. `null` = no está sellada, y entonces NO se dibuja ninguna marca. */
  base: { inicio: string, fin: string } | null
  /** El semáforo y sus números. Reemplaza al viejo `vencida`, que pintaba de rojo el calendario
   *  en vez del problema: ver `desvioDePlazo`. */
  desvio: Desvio
}

export interface FilaObra {
  obraId: string
  nombre: string
  clienteNombre: string | null
  etapa: Etapa | null
  avancePct: number | null
  desvioPlazoDias: number | null
  barra: Barra | null
  /** Por qué esta obra no tiene barra, en palabras. Sólo cuando `barra` es `null`. */
  motivo: string | null
}

/**
 * UNA OBRA SIN FECHAS NO TIENE BARRA, Y LO DICE.
 *
 * Una barra de largo cero —o de tres píxeles "para que se vea algo"— en el renglón de una obra sin
 * plan es una afirmación falsa dibujada: dice que la obra empieza y termina hoy. La ausencia se
 * escribe con palabras, que es lo único que no se puede leer mal de un vistazo.
 */
function motivoSinBarra(o: PlazoObra): string {
  return o.n_actividades === 0 ? 'sin cronograma cargado' : 'sin fechas de plan'
}

function barraDe(o: PlazoObra, hoyIso: string): Barra | null {
  if (!o.inicio_plan) return null
  // `fin_plan` es `max(fin_plan)` sobre las actividades: puede faltar aunque haya inicio, si ninguna
  // actividad tiene fecha de fin. La barra arranca igual y termina donde arranca — el dato de fin no
  // se inventa, se muestra el tramo que sí existe.
  const fin = o.fin_plan ?? o.inicio_plan
  return {
    inicio: o.inicio_plan,
    fin,
    avancePct: o.avance_pct,
    // LAS DOS PUNTAS O NINGUNA. Con media línea base no se puede comparar contra el plan, y media
    // marca debajo de la barra se lee como una línea base completa que casualmente coincide.
    base: o.inicio_base && o.fin_base ? { inicio: o.inicio_base, fin: o.fin_base } : null,
    desvio: desvioDePlazo(o.inicio_plan, o.fin_plan, o.avance_pct, hoyIso),
  }
}

/**
 * LOS RENGLONES DEL GANTT GLOBAL, en el orden en que se leen: por fecha de arranque, que es lo que
 * arma la escalera del croquis del dueño. Las obras sin plan van al final —no compiten por la
 * atención con las que sí tienen cronograma— pero NO se ocultan: una obra que desaparece de la
 * cartera porque le falta un dato es exactamente la que hay que ir a cargar.
 *
 * `hoyIso` ENTRA POR PARÁMETRO Y NO SE LEE DEL RELOJ ACÁ: «vencida» compara una fecha de plan
 * contra hoy, y una función que consulta el reloj por su cuenta sólo se puede probar el día que el
 * dato caiga del lado correcto. Con el día adentro de la firma, el caso «pasó su fin sin llegar al
 * 100%» se prueba en cualquier fecha.
 *
 * @param incluirArchivadas Las obras `cerrada` quedan afuera por defecto, igual que en el portafolio
 * y en `getContextoGlobal`. Un Gantt de la cartera es de lo que está en curso.
 */
export function filasDeObras(
  obras: PlazoObra[],
  hoyIso: string,
  incluirArchivadas = false,
  // EL ORDEN ELEGIDO PISA AL CRONOLÓGICO, Y SÓLO SI SE ELIGE UNO. Un Gantt sin pedido explícito se
  // lee por fecha de arranque: es lo que hace que las barras bajen en diagonal y se vea la secuencia
  // de la cartera. Pero "mostrame primero las más atrasadas" es una pregunta legítima y distinta.
  orden: CampoOrden | null = null,
  dir: Direccion = 'desc',
): FilaObra[] {
  if (orden) {
    const elegidas = obras.filter((o) => incluirArchivadas || o.estado !== 'cerrada')
    const desvio = new Map(elegidas.map((o) => [o.obra_id, o.desvio_plazo_dias ?? null]))
    return ordenar(elegidas, orden, dir, (id) => desvio.get(id) ?? null)
      .map((o) => { const barra = barraDe(o, hoyIso); return {
        obraId: o.obra_id, nombre: o.nombre, clienteNombre: o.cliente_nombre, etapa: o.etapa,
        avancePct: o.avance_pct, desvioPlazoDias: o.desvio_plazo_dias, barra, motivo: barra ? null : motivoSinBarra(o),
      } })
  }
  return obras
    .filter((o) => incluirArchivadas || o.estado !== 'cerrada')
    .map((o) => {
      const barra = barraDe(o, hoyIso)
      return {
        obraId: o.obra_id,
        nombre: o.nombre,
        clienteNombre: o.cliente_nombre,
        etapa: o.etapa,
        avancePct: o.avance_pct,
        desvioPlazoDias: o.desvio_plazo_dias,
        barra,
        motivo: barra ? null : motivoSinBarra(o),
      }
    })
    .sort((a, b) => {
      if (!a.barra && !b.barra) return a.nombre.localeCompare(b.nombre, 'es')
      if (!a.barra) return 1
      if (!b.barra) return -1
      return a.barra.inicio.localeCompare(b.barra.inicio) || a.nombre.localeCompare(b.nombre, 'es')
    })
}

/**
 * LA VENTANA DE TIEMPO QUE ABARCA LA CARTERA. `null` cuando ninguna obra tiene fechas: ahí no hay
 * eje que dibujar, y la pantalla lo dice en vez de inventar un mes cualquiera.
 *
 * `hoyIso` entra en el rango a propósito: sin eso, una cartera cuyo plan terminó el mes pasado
 * dibuja un Gantt donde la línea de hoy queda fuera de la pantalla y el atraso no se ve. Y entra
 * como TEXTO, el mismo que fijó el servidor: si el navegador leyera su propio reloj, alrededor de la
 * medianoche el eje que dibuja el cliente no sería el que ordenó el servidor.
 */
export function ventana(filas: FilaObra[], hoyIso: string): { desde: Date, hasta: Date } | null {
  let min = Infinity
  let max = -Infinity
  for (const f of filas) {
    if (!f.barra) continue
    const b = f.barra
    for (const iso of [b.inicio, b.fin, b.base?.inicio, b.base?.fin]) {
      if (!iso) continue
      const t = aDate(iso).getTime()
      min = Math.min(min, t)
      max = Math.max(max, t)
    }
  }
  if (min === Infinity) return null
  const h = aDate(hoyIso).getTime()
  // Una semana de margen a cada lado: la primera barra no nace pegada al borde y la última no se
  // corta contra el marco.
  return { desde: new Date(Math.min(min, h) - 7 * DIA), hasta: new Date(Math.max(max, h) + 7 * DIA) }
}
