// DOTACIÓN → DURACIÓN, Y LA CUENTA AL REVÉS.
//
// Las dos cuentas ya están definidas UNA vez, en Postgres: `public.duracion_dias(hh, capacidad,
// jornada, dias_tecnicos)` y `public.dotacion_necesaria(hh, dias, jornada, tope)`. Acá viven sus
// puertos, porque el stepper de la 08 recalcula seis frentes con cada toque y hacer seis RPC por
// clic convierte una pantalla de simulación en una pantalla de espera.
//
// Que sean dos implementaciones de la misma regla no queda librado a la buena fe:
// `orquestador/lib/cronograma-web-conformidad.test.mjs` corre las dos —la de TypeScript y la de
// Postgres— contra la misma tabla de casos, incluidos los que devuelven NULL. Si alguien cambia la
// función SQL y no toca este archivo, el test se pone rojo.
//
// ═══ NULL NO ES CERO, Y ACÁ ES LA DIFERENCIA ENTRE «NO SE PUEDE» Y «NO HACE FALTA NADIE» ═══
//
// `dotacionNecesaria` devuelve null cuando el tope del frente impide llegar a la fecha. Eso se
// dibuja «no alcanza», nunca «0 personas». Prometer una fecha que el tope impide es peor que decir
// que no se puede: la primera se descubre el día de la entrega.
//
// ═══ LA CAPACIDAD NO ES LA CANTIDAD DE GENTE ═══
//
// Dos oficiales y dos ayudantes son cuatro personas y 3,2 de capacidad (1,0 + 1,0 + 0,6 + 0,6). La
// vista `cuadrilla_capacidad` ya la calcula con los factores de `categoria_obra`. Contar cabezas
// para dividir HH es cómo un plan sale un 25 % optimista sin un solo error de tipeo.

import type { BaseProyeccion, FilaCronograma } from './cronogramaMotor.ts'
import { hhRestantes } from './cronogramaMotor.ts'
import { claveDeGrupo, SIN_GRUPO } from './cronograma.ts'
import { avanceAgregado } from './avance.ts'

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

/**
 * PUERTO de `public.duracion_dias`. HH ÷ (capacidad × jornada), más los días técnicos que no se
 * comprimen. Devuelve null si no hay HH o no hay nadie asignado: «sin plan», nunca 0 días.
 *
 * Los días técnicos se suman aparte a propósito: curar siete días son siete días haya una persona
 * o veinte.
 */
export function duracionDias(
  hh: number | null, capacidad: number | null, jornada = 8, diasTecnicos = 0,
): number | null {
  if (hh == null) return null
  if ((capacidad ?? 0) <= 0) return null
  return Math.ceil(hh / (capacidad! * (jornada || 8))) + (diasTecnicos ?? 0)
}

/**
 * PUERTO de `public.dotacion_necesaria`. Cuánta capacidad hace falta para terminar en N días.
 * Devuelve null cuando la respuesta es «no alcanza» por el tope del frente.
 */
export function dotacionNecesaria(
  hh: number | null, dias: number | null, jornada = 8, tope: number | null = null,
): number | null {
  if (hh == null || (dias ?? 0) <= 0) return null
  const n = Math.ceil(hh / (dias! * (jornada || 8)))
  if (tope != null && n > tope) return null
  return n
}

/** Por qué el frente está donde está. Es la columna `LÍMITE` de la 08, y las cuatro son
 *  distintas: «terminado» no es «sin gente», y ninguna de las dos es «con margen». */
export type Limite = 'terminado' | 'sin gente' | 'tope del frente' | 'con margen'

export interface Frente {
  clave: string
  nombre: string
  /** `camino crítico` / `sin cuadrilla` / el rubro. Lo que va en 10,5px bajo el nombre. */
  subtitulo: string | null
  subtituloTono: 'warn' | 'faint'
  esCritico: boolean
  /** HH que faltan. `null` = «sin dato»: no hay HH del análisis cargadas. NUNCA 0. */
  hhRestantes: number | null
  /** De dónde salieron esas HH. Se muestra: un número sin origen obliga a confiar en él. */
  base: BaseProyeccion
  /** Cuántas actividades del frente no tienen HH con las que contar. Mientras sea > 0, las HH
   *  restantes del frente son `null`: un total al que le falta una parte no es un total. */
  sinDato: number
  dotacion: number
  /** La dotación que el PLAN tiene escrita (`dotacion_prevista`), sin la simulación encima. Es a lo
   *  que vuelve «Volver al plan», y contra lo que se lee el delta: sin ella, una simulación no se
   *  distingue de lo que ya estaba guardado. */
  dotacionPlan: number
  tope: number | null
  /** Días con la dotación elegida. `null` si no hay HH o la dotación es 0. */
  dias: number | null
  /** Cuántos de esos días NO se comprimen con más gente (curado, fraguado, secado). Se muestra: un
   *  frente que no baja de 9 días por más gente que se le ponga tiene que poder decir por qué. */
  diasTecnicos: number
  fin: string | null
  limite: Limite
  nActividades: number
}

/**
 * DE QUÉ FRENTE ES UNA ACTIVIDAD.
 *
 * Es EXACTAMENTE la misma regla que agrupa el cronograma: `claveDeGrupo` en `cronograma.ts`, una
 * sola implementación. Dos daría un frente en el Gantt y otro distinto en la proyección, sobre las
 * mismas actividades.
 *
 * Cuando la obra declare frentes de verdad (`rol_estructura = 'frente'`) manda esa declaración.
 * Hoy no hay ninguno cargado en ninguna de las 17 obras, y por eso este derivado no es un detalle
 * de borde: es lo que se ve en pantalla.
 */
export const claveDeFrente = claveDeGrupo

export interface OpcionesFrentes {
  /** Capacidad elegida por frente, del stepper. Viene de la URL. */
  dotaciones?: Record<string, number>
  jornada?: number
  /** Para calcular el FIN. Sin fecha de arranque no hay fin: se devuelve null, no hoy. */
  desde?: string | null
  sumarDiasHabiles?: (desde: string, n: number) => string
}

/**
 * SUMA DE HH RESTANTES DE UN FRENTE — y cuántas de sus actividades no se pudieron sumar.
 *
 * ═══ EL DEFECTO QUE ESTO ARREGLA (destapado en el navegador, 21/08/2026) ═══
 *
 * Una actividad terminada devuelve 0 HH restantes, y es correcto. Una actividad sin HH cargadas
 * devuelve null, y también. Sumando «los que tienen número», un frente cuyas ÚNICAS actividades
 * medibles son las terminadas daba **0 HH restantes**, con 0 días y una fecha de fin — es decir,
 * publicaba «este frente ya está» sobre actividades al 0 % de las que no se sabe nada.
 *
 * La regla es: si alguna actividad NO terminada no tiene HH, el total no existe. Un total parcial
 * no es un total: es un piso, y presentado como total subestima el trabajo que falta. Se devuelve
 * `sinDato` para que la pantalla pueda decir sobre cuántas no pudo mirar.
 */
function sumarHH(filas: FilaCronograma[]): { hh: number | null; base: BaseProyeccion; sinDato: number } {
  let total = 0
  let alguna = false
  let observado = false
  let todasTerminadas = true
  let sinDato = 0
  for (const f of filas) {
    if (f.tipo === 'resumen') continue
    const { hh, base } = hhRestantes(f)
    if (hh == null) { sinDato++; continue }
    alguna = true
    total += hh
    if (base === 'rendimiento observado') observado = true
    if (base !== 'terminada') todasTerminadas = false
  }
  if (sinDato > 0 || !alguna) return { hh: null, base: 'sin base', sinDato }
  if (todasTerminadas) return { hh: total, base: 'terminada', sinDato: 0 }
  return { hh: total, base: observado ? 'rendimiento observado' : 'plan', sinDato: 0 }
}

/**
 * LOS DÍAS DEL FRENTE QUE NO SE COMPRIMEN CON MÁS GENTE.
 *
 * ═══ EL DEFECTO QUE ESTO ARREGLA ═══
 *
 * `duracionDias` recibe los días técnicos como cuarto argumento y los suma aparte —está así desde el
 * día uno, y su función SQL gemela también—, pero `frentesDe` NUNCA se lo pasaba. Consecuencia: un
 * frente de hormigón con siete días de curado se comprimía como si el curado fuera trabajo. La
 * pantalla contestaba «poné el doble de gente y terminás en la mitad de tiempo» sobre un frente
 * donde el hormigón cura siete días haya una persona o veinte, y esa respuesta se descubre el día
 * de la entrega.
 *
 * ═══ CÓMO SE SABE CUÁL ES TÉCNICA — Y POR QUÉ NO SE ADIVINA ═══
 *
 * Lo dice la actividad: `tiempo_tecnico`, que la conversión de partida a plan copia del paso de la
 * plantilla que ya lo declaraba. NO se deduce de «tiene `dias_plan` y se mide manual»: ése es el
 * estado por defecto de las 344 actividades traídas del tracker, y con esa regla los días de plan de
 * TODA la obra se habrían sumado como días técnicos. Un frente inflado es peor defecto que el que se
 * está arreglando.
 *
 * Una técnica YA CUMPLIDA no vuelve a sumar sus días: el curado que pasó, pasó.
 */
function diasTecnicosDe(filas: FilaCronograma[]): number {
  let total = 0
  for (const f of filas) {
    if (f.tipo === 'resumen' || !f.tiempo_tecnico) continue
    if (hhRestantes(f).base === 'terminada') continue
    total += num(f.dias_plan) ?? 0
  }
  return total
}

/** Con qué límite topa el frente: ya está hecho, nadie asignado, el tope, o todavía hay lugar.
 *
 *  «Terminado» va primero y gana: un frente al 100 % con nadie asignado no está frenado por falta
 *  de gente, y decir «sin gente» ahí manda a buscar personal para un trabajo que ya se hizo. */
export function limiteDe(dotacion: number, tope: number | null, hhRestantes: number | null = null): Limite {
  if (hhRestantes === 0) return 'terminado'
  if (dotacion <= 0) return 'sin gente'
  if (tope != null && dotacion >= tope) return 'tope del frente'
  return 'con margen'
}

/**
 * LOS FRENTES DE LA OBRA con su simulación de dotación.
 *
 * Se arma sobre las actividades YA calculadas por el motor: la criticidad de un frente es la de
 * sus actividades, y calcularla de nuevo acá daría dos caminos críticos distintos en la misma
 * pantalla.
 */
export function frentesDe(filas: FilaCronograma[], opciones: OpcionesFrentes = {}): Frente[] {
  const { dotaciones = {}, jornada = 8, desde = null, sumarDiasHabiles } = opciones
  const porClave = new Map<string, FilaCronograma[]>()
  for (const f of filas) {
    const k = claveDeFrente(f)
    const lista = porClave.get(k) ?? []
    lista.push(f)
    porClave.set(k, lista)
  }

  return [...porClave.entries()].map(([clave, hijas]) => {
    const { hh, base, sinDato } = sumarHH(hijas)
    const esCritico = hijas.some((h) => h.critica)
    const sinCuadrilla = hijas.every((h) => !h.cuadrilla_id && !h.cuadrilla_prevista)
    const topes = hijas.map((h) => num(h.tope_frente)).filter((x): x is number => x != null)
    const tope = topes.length ? Math.min(...topes) : null
    const previstas = hijas.map((h) => num(h.dotacion_prevista)).filter((x): x is number => x != null)
    // El tope del frente no es decorativo: una dotación pedida por la URL (`?dot=99`) no puede
    // producir un plazo que el tope declara imposible. Se recorta acá, donde nace el divisor
    // — el stepper de la pantalla ya lo respetaba, pero la URL entraba sin pasar por el stepper.
    const delPlan = previstas.length ? Math.max(...previstas) : 0
    const pedida = dotaciones[clave] ?? delPlan
    const dotacion = tope != null ? Math.min(pedida, tope) : pedida
    // Los días técnicos NO se comprimen: entran por el cuarto argumento, sumados aparte.
    const diasTecnicos = diasTecnicosDe(hijas)
    // Un frente sin trabajo pendiente no se planifica: 0 días y ninguna fecha. Publicar «termina
    // hoy» sobre algo que ya está hecho llena el fin de obra de fechas que nadie va a esperar.
    const dias = hh === 0 ? 0 : (dotacion > 0 ? duracionDias(hh, dotacion, jornada, diasTecnicos) : null)
    return {
      clave,
      nombre: clave === SIN_GRUPO ? 'Sin clasificar' : clave,
      subtitulo: esCritico ? 'camino crítico' : (sinCuadrilla ? 'sin cuadrilla' : (hijas[0]?.rubro ?? null)),
      subtituloTono: (esCritico || sinCuadrilla ? 'warn' : 'faint') as 'warn' | 'faint',
      esCritico,
      hhRestantes: hh,
      base,
      sinDato,
      dotacion,
      dotacionPlan: tope != null ? Math.min(delPlan, tope) : delPlan,
      tope,
      dias,
      diasTecnicos,
      fin: dias != null && dias > 0 && desde && sumarDiasHabiles
        ? sumarDiasHabiles(desde, dias - 1)
        : null,
      limite: limiteDe(dotacion, tope, hh),
      nActividades: hijas.filter((h) => h.tipo !== 'resumen').length,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL SIMULADOR, RECALCULADO EN EL NAVEGADOR
//
// El stepper de la 08 navegaba: cada clic era una vuelta al servidor con seis frentes recalculados
// y la pantalla entera remontada. Mover una dotación de 2 a 6 costaba cuatro navegaciones y cuatro
// esqueletos. Ahora la cuenta corre donde está el gesto y la URL se sincroniza con `replaceState`,
// así que el link compartido sigue abriendo la MISMA simulación.
//
// Lo único que el navegador no puede saber es qué días trabaja la obra: el calendario vive en el
// servidor (`CalendarioObra`, con los feriados y los no laborables cargados). Por eso la página
// manda los días hábiles ya resueltos y acá sólo se INDEXA — no se recalcula un calendario paralelo
// que el día que aparezca un feriado nuevo diría otra fecha que el resto del OS.

export interface Simulacion {
  /** La pedida ya recortada por el tope del frente. */
  dotacion: number
  dias: number | null
  fin: string | null
  limite: Limite
  /** La pedida superaba el tope y se recortó. La pantalla lo dice: un stepper que muestra 8 cuando
   *  el motor calculó con 4 enseña a desconfiar del número. */
  recortada: boolean
}

export function simularFrente(
  f: Pick<Frente, 'hhRestantes' | 'tope' | 'diasTecnicos'>,
  pedida: number,
  jornada: number,
  habiles: readonly string[],
): Simulacion {
  const dotacion = f.tope != null ? Math.min(pedida, f.tope) : pedida
  const dias = f.hhRestantes === 0
    ? 0
    : (dotacion > 0 ? duracionDias(f.hhRestantes, dotacion, jornada, f.diasTecnicos) : null)
  return {
    dotacion,
    dias,
    // El fin es el día hábil número `dias` contando desde el arranque, y el arranque es el índice 0:
    // un frente de un día termina el día que empieza. Fuera del calendario que mandó el servidor no
    // se inventa una fecha — se devuelve null y la pantalla dice «sin plan».
    fin: dias != null && dias > 0 ? habiles[dias - 1] ?? null : null,
    limite: limiteDe(dotacion, f.tope, f.hhRestantes),
    recortada: f.tope != null && pedida > f.tope,
  }
}

export interface ResumenSimulacion {
  genteTotal: number
  fin: string | null
  /** Días de trabajo contra el fin del plan. `null` sin plan o sin simulación.
   *
   *  ═══ EL DEFECTO QUE ESTO ARREGLA ═══
   *
   *  La cuenta anterior era `habilesEntre(finPlan, finSimulado) - 1 || 0`, y `habilesEntre` devuelve
   *  0 cuando el hasta es anterior al desde. O sea: CUALQUIER adelanto —un día o dos meses— se
   *  publicaba como «−1 d». La pantalla que existe para decir cuánto se gana poniendo gente decía
   *  siempre lo mismo. Con índices de día hábil con signo, adelantar 12 días dice −12. */
  desvioDias: number | null
}

export function resumenSimulacion(
  sims: readonly { dotacion: number; dias: number | null }[],
  idxFinPlan: number | null,
  habiles: readonly string[],
): ResumenSimulacion {
  const dias = sims.map((s) => s.dias).filter((d): d is number => d != null && d > 0)
  const maxDias = dias.length ? Math.max(...dias) : null
  return {
    genteTotal: sims.reduce((a, s) => a + s.dotacion, 0),
    fin: maxDias == null ? null : habiles[maxDias - 1] ?? null,
    desvioDias: maxDias == null || idxFinPlan == null ? null : (maxDias - 1) - idxFinPlan,
  }
}

export interface OpcionInversa {
  fecha: string
  dias: number
  /** null = «no alcanza». Es una respuesta, no un dato faltante. */
  dotacion: number | null
}

/**
 * AL REVÉS: fijá la fecha y el sistema dice la dotación.
 *
 * Se ofrecen varias fechas y no una sola porque la pregunta real del jefe de obra no es «¿cuánta
 * gente para el 25?» sino «¿a partir de cuándo esto se vuelve posible?».
 */
export function opcionesInversas(
  hh: number | null, objetivos: { fecha: string; dias: number }[], jornada = 8, tope: number | null = null,
): OpcionInversa[] {
  return objetivos.map((o) => ({ ...o, dotacion: dotacionNecesaria(hh, o.dias, jornada, tope) }))
}

export interface FilaRubro {
  nivel: 'rubro' | 'partida'
  nombre: string
  hhPlan: number | null
  hhReal: number | null
  avancePct: number | null
  rendPlan: number | null
  rendReal: number | null
  hhProyectadas: number | null
  desvioHH: number | null
}

/** Rendimiento = HH por unidad. `null` cuando falta cualquiera de los dos, y cuando la cantidad es
 *  0: dividir por cero para llenar una celda es fabricar un número. */
export function rendimiento(hh: number | null, cantidad: number | null): number | null {
  if (hh == null || cantidad == null || cantidad === 0) return null
  return hh / cantidad
}

/**
 * Las HH que va a consumir entera, al ritmo de hoy. `null` sin base para proyectar.
 *
 * Una actividad al 100 % SIN NINGUNA HH cargada devuelve 0 restantes —es verdad, no le falta
 * trabajo— pero eso no la convierte en «va a consumir 0 HH»: nadie sabe cuántas consumió. Sin
 * `hh_plan` ni `hh_real` no hay nada de dónde proyectar, y la celda dice «sin base».
 */
export function hhProyectadas(f: Pick<FilaCronograma, 'hh_plan' | 'hh_real' | 'avance_pct'>): number | null {
  if (num(f.hh_plan) == null && num(f.hh_real) == null) return null
  const { hh, base } = hhRestantes(f)
  if (hh == null || base === 'sin base') return null
  const real = num(f.hh_real) ?? 0
  return real + hh
}

/**
 * SUMA QUE SE NIEGA A SER PARCIAL. `null` en cuanto falta un sumando.
 *
 * Es la regla de los números que DECIDEN —las HH proyectadas de la obra, que fijan el plazo—, no
 * la de los descriptivos. Un total al que le falta una parte no es un total: es un piso, y
 * presentado como total subestima. `sumar` (parcial) queda para HH plan y HH real, que describen
 * lo que hay cargado y no se usan para prometer una fecha.
 */
export function sumaCompleta(vs: (number | null)[]): number | null {
  if (!vs.length || vs.some((v) => v == null)) return null
  return vs.reduce((a: number, b) => a + (b as number), 0)
}

/**
 * PLAN · REAL · PROYECCIÓN POR RUBRO. Una fila por rubro y una por actividad debajo.
 *
 * El rubro sale de la columna `rubro` cuando está cargada y del frente cuando no. No se inventa
 * una taxonomía: se usa la que la obra tiene.
 */
export function rubrosDe(filas: FilaCronograma[]): FilaRubro[] {
  const porRubro = new Map<string, FilaCronograma[]>()
  for (const f of filas) {
    if (f.tipo === 'resumen') continue
    const k = f.rubro?.trim() || claveDeFrente(f)
    const lista = porRubro.get(k) ?? []
    lista.push(f)
    porRubro.set(k, lista)
  }
  const salida: FilaRubro[] = []
  for (const [clave, hijas] of porRubro) {
    salida.push({ ...agregar(hijas), nivel: 'rubro', nombre: clave === SIN_GRUPO ? 'Sin clasificar' : clave })
    for (const h of hijas) salida.push({ ...deUna(h), nivel: 'partida', nombre: h.nombre })
  }
  return salida
}

function deUna(f: FilaCronograma): Omit<FilaRubro, 'nivel' | 'nombre'> {
  const hhPlan = num(f.hh_plan)
  const hhReal = num(f.hh_real)
  const cant = num(f.cantidad_objetivo)
  const fc = hhProyectadas(f)
  return {
    hhPlan,
    hhReal,
    avancePct: num(f.avance_pct),
    rendPlan: rendimiento(hhPlan, cant),
    rendReal: rendimiento(hhReal, cant == null || num(f.avance_pct) == null ? null : cant * (num(f.avance_pct)! / 100)),
    hhProyectadas: fc,
    desvioHH: fc == null || hhPlan == null ? null : fc - hhPlan,
  }
}

/** El total de un rubro. Cada columna se suma sólo sobre las filas que tienen ese dato, y si no
 *  hay ninguna el total queda en null. Un rubro entero sin HH cargadas dice «sin dato». */
function agregar(hijas: FilaCronograma[]): Omit<FilaRubro, 'nivel' | 'nombre'> {
  const partes = hijas.map(deUna)
  const suma = (k: keyof Omit<FilaRubro, 'nivel' | 'nombre'>): number | null => {
    const vs = partes.map((p) => p[k]).filter((x): x is number => x != null)
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null
  }
  const hhPlan = suma('hhPlan')
  // Las HH proyectadas del rubro, con `sumaCompleta`: si una sola partida no tiene base, el rubro
  // dice «sin base». Sumar las que sí tienen daría un total menor al real y con cara de total.
  const fc = sumaCompleta(partes.map((p) => p.hhProyectadas))
  const cant = hijas.map((h) => num(h.cantidad_objetivo)).filter((x): x is number => x != null)
  const cantTotal = cant.length ? cant.reduce((a, b) => a + b, 0) : null
  return {
    hhPlan,
    hhReal: suma('hhReal'),
    // UNA SOLA REGLA DE AVANCE AGREGADO para todo el OS: `avanceAgregado` en `avance.ts`.
    avancePct: avanceAgregado(hijas.map((h) => ({ avance_pct: num(h.avance_pct), hh_plan: num(h.hh_plan) }))).pct,
    rendPlan: rendimiento(hhPlan, cantTotal),
    rendReal: rendimiento(suma('hhReal'), cantTotal),
    hhProyectadas: fc,
    desvioHH: fc == null || hhPlan == null ? null : fc - hhPlan,
  }
}
