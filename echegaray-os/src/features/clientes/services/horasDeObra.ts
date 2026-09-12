// LAS HORAS DE CADA TRABAJO, COMO LAS DIBUJA LA FICHA DEL CLIENTE.
//
// ═══ POR QUÉ EXISTE (dueño, 11/09/2026) ═══
//
// «Necesito saber las hs que se van sumando en cada obra dentro de cada cliente» y «no tengo idea de
// cuándo empezó cada obra en el CRM, no sé cuánto llevan hs totales». Las 29.068 h de `registros_hh`
// no se veían en ninguna parte del CRM: para saber cuántas llevaba un trabajo había que salir al
// módulo Obras y abrir su solapa Personal.
//
// ═══ LA REGLA QUE ESTE ARCHIVO DEFIENDE ═══
//
// `null` no es cero y nunca se dibuja como cero. Son TRES ausencias distintas y se leen distinto:
//
//   · la obra no tiene horas cargadas   → «—»       (la base contestó, y la respuesta es ninguna)
//   · no tengo permiso para saberlo     → vacío     (`hh_obra` llega `null`: ver la migración
//                                                    20260911T2300 y la RLS de `registros_hh`)
//   · la obra no empezó todavía         → la fecha PREVISTA, en tinta apagada y dicha en el title
//
// El número NO se calcula acá ni en SQL de esta pantalla: la RPC lo lee de `obra_plan_vs_real`, que
// es la cara canónica de las HH por obra. Este archivo convierte y da formato, nada más.
//
// ═══ CADA OBRA REPORTA LO SUYO ═══
//
// Un adicional es una obra con `obra_padre_id` y publica SUS horas. La obra mayor NO las suma: las
// horas del tercer muro se cargaron contra el tercer muro, y sumarlas al playón haría que el mismo
// jornal apareciera dos veces en la misma tabla.

// LAS RUTAS VAN RELATIVAS Y CON EXTENSIÓN: el alias `@/` lo resuelve el bundler, no `node --test`, y
// de este archivo cuelgan los tests que prueban cómo se dibuja cada hueco.
import { hh } from '../../../shared/utils/format.ts'
import { diaMesAnioCompletoISO, diaMesAnioISO, diaMesISO } from '../../../shared/utils/fecha.ts'

/** Lo que la clave `hh_obra` de `pantalla_cliente` publica por trabajo. */
export interface HorasDeObra {
  obraId: string
  /** Σ de `registros_hh.horas` con `tipo_hora` de trabajo, leída de `obra_plan_vs_real`. */
  hhReal: number | null
  /** Σ de `obra_actividad.hh_plan`. Hoy ninguna obra real lo tiene cargado. */
  hhPlan: number | null
  registros: number
  personas: number
  /** La PRIMERA fecha con horas: el único inicio que está probado. ISO `YYYY-MM-DD`. */
  inicioReal: string | null
  ultimaFecha: string | null
}

/** Un `numeric` de Postgres puede llegar como texto; descartarlo dejaría la celda vacía con el dato. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function entero(v: unknown): number {
  return num(v) ?? 0
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * LAS FILAS DE `hh_obra`, POR OBRA.
 *
 * `null` ENTRA Y SALE COMO `null`: la RPC lo devuelve cuando quien pregunta no es Administración —la
 * RLS de `registros_hh` le mostraría sólo sus propias horas y media suma parece una suma—. Un `Map`
 * vacío diría «ninguna obra tiene horas», que es otra cosa.
 */
export function armarHorasPorObra(
  filas: unknown[] | null | undefined,
): Map<string, HorasDeObra> | null {
  if (filas == null) return null
  const m = new Map<string, HorasDeObra>()
  for (const f of filas) {
    const r = f as Record<string, unknown>
    const obraId = texto(r.obra_id)
    if (!obraId) continue
    m.set(obraId, {
      obraId,
      hhReal: num(r.hh_real),
      hhPlan: num(r.hh_plan),
      registros: entero(r.registros),
      personas: entero(r.personas),
      inicioReal: texto(r.inicio_real)?.slice(0, 10) ?? null,
      ultimaFecha: texto(r.ultima_fecha)?.slice(0, 10) ?? null,
    })
  }
  return m
}

/**
 * LAS HH DE LA COLUMNA: «551», «551 / 600» cuando hay plan, «—» cuando no hay ninguna hora cargada.
 *
 * Sin decimales (`hh()`, es-AR): en obra nadie discute media hora hombre, y la columna se barre con
 * la vista. Con plan se escribe `real / plan` y no un porcentaje: el desvío de HH es una lectura del
 * ERP, se mide contra el cronograma y no se decide en el CRM.
 */
export function textoHH(h: HorasDeObra | null | undefined): string {
  const real = h?.hhReal == null ? null : hh(h.hhReal)
  const plan = h?.hhPlan == null ? null : hh(h.hhPlan)
  if (real == null) return plan == null ? '—' : `— / ${plan}`
  return plan == null ? real : `${real} / ${plan}`
}

/** El detalle que respalda la cifra. `null` cuando no hay nada que respaldar. */
export function tituloHH(h: HorasDeObra | null | undefined): string | null {
  if (!h || h.hhReal == null) return null
  const partes = [
    h.inicioReal ? `desde ${diaMesISO(h.inicioReal)}` : null,
    `${h.registros} ${h.registros === 1 ? 'registro' : 'registros'}`,
    `${h.personas} ${h.personas === 1 ? 'persona' : 'personas'}`,
    h.ultimaFecha ? `última carga ${diaMesISO(h.ultimaFecha)}` : null,
  ].filter((p) => p != null)
  return partes.join(' · ')
}

/** Lo que dibuja la columna INICIO, con de dónde salió cada variante. */
export interface InicioDeObra {
  /** «05/01/26» o «—». Nunca una fecha inventada. */
  texto: string
  /** `true` = es la fecha PREVISTA, no una medida: la celda la dibuja apagada. */
  planeado: boolean
  titulo: string | null
}

/**
 * CUÁNDO EMPEZÓ EL TRABAJO — y la fecha que se muestra es la que está PROBADA.
 *
 * El inicio real es la primera fecha con horas cargadas: es lo único que prueba que alguien estuvo
 * trabajando. La fecha declarada en la obra es una previsión y viaja como tal —tinta apagada y
 * dicho en el `title`—: mezclarlas en la misma columna con la misma tinta convertiría la columna en
 * dos columnas según la fila, que es cómo un dato deja de poder compararse.
 */
export function inicioDeObra(
  h: HorasDeObra | null | undefined, planISO: string | null | undefined,
): InicioDeObra {
  const real = h?.inicioReal ?? null
  const plan = planISO ? planISO.slice(0, 10) : null
  if (real) {
    return {
      texto: diaMesAnioISO(real),
      planeado: false,
      // EL AÑO ENTERO EN EL `title`: la celda dice «05/01/26» porque la columna se barre con la
      // vista, pero quien pasa el mouse para saber de cuándo viene el trabajo merece los cuatro
      // dígitos — dos obras de este cliente arrancaron en enero y el año decide si es ésta o la
      // anterior.
      titulo: `inicio real ${diaMesAnioCompletoISO(real)}`
        + (plan ? ` · plan ${diaMesAnioCompletoISO(plan)}` : ' · sin fecha de plan cargada'),
    }
  }
  if (plan) {
    return {
      texto: diaMesAnioISO(plan),
      planeado: true,
      titulo: `sin horas cargadas · plan ${diaMesAnioCompletoISO(plan)}`,
    }
  }
  return { texto: '—', planeado: false, titulo: null }
}
