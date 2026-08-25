// 08 · EL MECANISMO DEL CANÓNICO: HH → DOTACIÓN → DURACIÓN, «los tres se calculan entre sí».
//
// ═══ QUÉ CAMBIA RESPECTO DE LO QUE HABÍA ═══
//
// La pantalla mostraba TODOS los frentes a la vez, cada uno con su stepper, y la única pregunta que
// contestaba era «con esta gente, ¿cuándo termino?». El canónico 08 («08 · Obra Dotación y
// Proyección.dc.html») simula UN frente por vez con tres modos —HH es dato de base; Dotación y
// Duración se fijan y el otro se calcula—, que es la pregunta que el jefe de obra hace de verdad
// cuando el cliente pone una fecha: «para el 12, ¿cuánta gente?».
//
// Las dos cuentas siguen siendo las de `dotacion.ts` (puertos de `public.duracion_dias` y
// `public.dotacion_necesaria`). Acá no se define ninguna aritmética nueva: se decide CUÁL de las
// dos corre según el modo, y se nombra lo que la cuenta se niega a contestar.
//
// ═══ LOS DÍAS TÉCNICOS ROMPEN LA SIMETRÍA, Y POR ESO LA INVERSA NO ES UNA DIVISIÓN ═══
//
// `duracionDias` suma los días técnicos APARTE: curar siete días son siete días haya una persona o
// veinte. Entonces la vuelta no es `hh / (dias × jornada)` sino `hh / ((dias − técnicos) × jornada)`,
// y cuando los días pedidos no superan a los técnicos la respuesta no es «muchísima gente»: es que
// NO EXISTE dotación que llegue. El mockup no tiene días técnicos —su frente es una columna de
// hormigón sin curado— así que este caso no está dibujado ahí; se dice con la misma nota roja que
// el canónico usa para «no entran en el frente».
//
// ═══ EL TOPE NO SE DIBUJA COMO UNA DURACIÓN MÁS CORTA ═══
//
// El mockup deja subir la dotación por encima del tope y muestra la duración que saldría con esa
// gente, en rojo. Acá no: `simularFrente` recorta por el tope desde el día uno, y la duración que se
// publica es la que el frente PUEDE dar. La nota del canónico —«más gente no acelera»— es
// literalmente lo que pasa, y una duración que el tope impide se descubre el día de la entrega.
// Ver `dotacion.ts`: «prometer una fecha que el tope impide es peor que decir que no se puede».

import { dotacionNecesaria, simularFrente, TOPE_DOTACION, type Frente, type Simulacion } from './dotacion.ts'

/** Los tres botones de la cabecera del canónico. `hh` no es seleccionable: es el dato de base. */
export const MODOS = [
  { id: 'hh', rotulo: 'HH', detalle: 'dato de base', tip: 'Las HH salen del análisis de precio' },
  { id: 'dot', rotulo: 'Dotación', detalle: 'yo la fijo', tip: 'Fijo la gente y el sistema calcula la duración' },
  { id: 'dias', rotulo: 'Duración', detalle: 'yo la fijo', tip: 'Fijo los días y el sistema calcula la gente necesaria' },
] as const

export type ModoSimulacion = (typeof MODOS)[number]['id']

export const esModo = (v: string | undefined): v is ModoSimulacion =>
  MODOS.some((m) => m.id === v)

export interface EstadoSimulado {
  /** La gente del frente. `null` sólo en modo `dias`, cuando NINGUNA dotación llega a esa fecha. */
  dotacion: number | null
  /** La dotación que se pidió antes de que el tope la recortara. Se muestra el recorte, no se
   *  esconde: un número en pantalla que el motor no usó enseña a desconfiar de la pantalla. */
  pedida: number
  dias: number | null
  fin: string | null
  /** La celda lleva la pastilla «calculado» del canónico: no la fijó nadie, salió de la otra. */
  dotacionCalculada: boolean
  diasCalculada: boolean
  /** Lo pedido no entra en el frente. Es el disparador de la nota roja y del estado «no ejecutable». */
  sobreTope: boolean
  /** En modo `dias`: los días pedidos no superan a los técnicos, así que no hay gente que alcance. */
  imposiblePorTecnicos: boolean
  /** El frente ya está: no queda trabajo que repartir. NO es «0 personas» ni «0 días». */
  sinTrabajo: boolean
  /** La dotación que la cuenta devolvió no cabe en el contrato de la URL ni de la escritura
   *  (`TOPE_DOTACION`). Es una respuesta legítima que NO se puede aplicar, y la pantalla lo dice
   *  en vez de ofrecer un botón que escribiría nada. */
  fueraDeContrato: boolean
}

/**
 * LA CUENTA INVERSA CON DÍAS TÉCNICOS DESCONTADOS.
 *
 * `null` cuando no hay HH, cuando los días pedidos no dejan ni un día de trabajo, o cuando la
 * respuesta sería «ninguna dotación alcanza». No es cero: cero personas terminan cero trabajo.
 *
 * Se apoya en `dotacionNecesaria` —el puerto de `public.dotacion_necesaria`— y NO le pasa el tope:
 * el canónico quiere mostrar cuánta gente haría falta aunque no entre, para poder decir «hacen
 * falta 7 y no entran». Recortar acá borraría justamente el número que la nota necesita.
 */
export function dotacionParaDuracion(
  hh: number | null, dias: number | null, jornada: number, diasTecnicos: number,
): number | null {
  if (hh == null || dias == null) return null
  const trabajables = dias - (diasTecnicos ?? 0)
  if (trabajables <= 0) return null
  return dotacionNecesaria(hh, trabajables, jornada, null)
}

/**
 * EL ESTADO DEL FRENTE SEGÚN EL MODO. Una sola función para las dos direcciones, porque son la
 * misma pantalla: en `dot` se fija la gente y se calculan los días; en `dias` al revés.
 *
 * `hh` se comporta como `dot` —la dotación queda como está y los días se calculan— porque el
 * canónico no lo deja seleccionar: existe para mostrar de dónde sale el insumo.
 */
export function simularModo(
  frente: Pick<Frente, 'hhRestantes' | 'tope' | 'diasTecnicos'>,
  modo: ModoSimulacion,
  dotElegida: number,
  diasElegidos: number,
  jornada: number,
  habiles: readonly string[],
): EstadoSimulado {
  const sinTrabajo = frente.hhRestantes === 0
  if (modo !== 'dias') {
    const sim: Simulacion = simularFrente(frente, dotElegida, jornada, habiles)
    return {
      dotacion: sim.dotacion,
      pedida: dotElegida,
      dias: sim.dias,
      fin: sim.fin,
      dotacionCalculada: false,
      diasCalculada: true,
      sobreTope: sim.recortada,
      imposiblePorTecnicos: false,
      sinTrabajo,
      fueraDeContrato: sim.dotacion > TOPE_DOTACION,
    }
  }
  // UN FRENTE TERMINADO NO PIDE «0 PERSONAS». `dotacionNecesaria(0, …)` devuelve 0 —la división es
  // correcta— y eso en pantalla se lee «con nadie llegás», sobre un frente que ya está hecho.
  // Medido en Messina el 25/08/2026: dos frentes al 100 % contestaban «0 personas · fin 27/08», o
  // sea prometían una fecha de terminación para algo terminado.
  const necesaria = sinTrabajo
    ? null
    : dotacionParaDuracion(frente.hhRestantes, diasElegidos, jornada, frente.diasTecnicos)
  const sobreTope = necesaria != null && frente.tope != null && necesaria > frente.tope
  return {
    dotacion: necesaria,
    pedida: necesaria ?? 0,
    dias: sinTrabajo ? 0 : diasElegidos,
    // El fin es el día hábil número `dias` desde el arranque. Sin gente que llegue no hay fecha:
    // dibujarla igual sería prometer el plazo que la cuenta acaba de declarar imposible.
    fin: necesaria == null ? null : habiles[diasElegidos - 1] ?? null,
    dotacionCalculada: true,
    diasCalculada: false,
    sobreTope,
    imposiblePorTecnicos: !sinTrabajo && frente.hhRestantes != null && necesaria == null
      && diasElegidos <= frente.diasTecnicos,
    sinTrabajo,
    fueraDeContrato: necesaria != null && necesaria > TOPE_DOTACION,
  }
}

/**
 * HASTA DÓNDE LLEGA LA BARRA DEL CANÓNICO. El mockup fija la escala en 8 personas porque su frente
 * topa en 4; una obra con 18 en el plantel dibujaría la barra siempre llena.
 *
 * La escala NO depende del valor que se está moviendo: si dependiera, el fondo se movería con la
 * barra y el gesto perdería la referencia que la barra existe para dar.
 */
export function escalaDotacion(tope: number | null, disponibles: number | null): number {
  return Math.max(8, tope ?? 0, disponibles ?? 0)
}

/** Lo mismo para la barra de duración: el mockup la escala a 10 días. Un frente cuyo plan son 30
 *  días necesita que 30 entren en la barra, y los días técnicos son su piso. */
export function escalaDias(duracionPlan: number | null, diasTecnicos: number): number {
  return Math.max(10, duracionPlan ?? 0, diasTecnicos + 1)
}

/**
 * DE DÓNDE SALEN ESAS HH — la nota bajo el primer campo del canónico.
 *
 * El mockup escribe el análisis de precio de su frente («2,40 m³ × 34,00 HH/m³ · base maestra
 * T1010»). Acá se escribe lo que la obra REALMENTE tiene: cuántas actividades se sumaron y con qué
 * base se proyectaron. Cuando falta alguna, eso es lo único que importa decir — un total al que le
 * falta un sumando no es un total, y `hhRestantes` ya vale `null` por eso.
 */
export function notaDeOrigen(
  f: Pick<Frente, 'hhRestantes' | 'base' | 'sinDato' | 'nActividades'>,
): { texto: string; alerta: boolean } {
  if (f.sinDato > 0) {
    return {
      texto: f.sinDato === 1
        ? '1 actividad sin HH del análisis: el total del frente no existe'
        : `${f.sinDato} actividades sin HH del análisis: el total del frente no existe`,
      alerta: true,
    }
  }
  if (f.hhRestantes == null) {
    return { texto: 'ninguna actividad del frente tiene HH cargadas', alerta: true }
  }
  if (f.hhRestantes === 0) {
    return { texto: 'frente terminado: no queda trabajo que repartir', alerta: false }
  }
  const n = f.nActividades
  return { texto: `${n} ${n === 1 ? 'actividad' : 'actividades'} · base: ${f.base}`, alerta: false }
}

/**
 * CON QUÉ FRENTE ABRE LA PANTALLA.
 *
 * El que tiene trabajo por delante y con qué calcularlo: abrir en un frente terminado o sin HH
 * muestra una simulación vacía y hace parecer que la pantalla no anda. Si ninguno califica se
 * devuelve el primero —hay que mostrar alguno— y la pantalla dirá por qué está vacío.
 */
export function frenteInicial(frentes: readonly Frente[]): string | null {
  if (!frentes.length) return null
  const util = frentes.find((f) => f.hhRestantes != null && f.hhRestantes > 0)
  return (util ?? frentes[0]).clave
}
