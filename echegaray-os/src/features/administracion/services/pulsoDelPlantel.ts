// EL PULSO DEL DÍA DEL PLANTEL — Design 23/08/2026, pantalla 19.
//
// El canónico no dibuja un directorio: dibuja el estado del plantel HOY. Tres columnas nuevas
// (HOY · HH MES · PAPELES) y unos banners arriba con lo que hay que mirar antes de bajar la vista a
// la tabla. Esta es la lógica pura de las tres; las consultas viven en `pulsoDelPlantelService.ts`.
//
// ═══ TRES FUENTES DISTINTAS, TRES SILENCIOS DISTINTOS ═══
//
// Las tres columnas comparten un defecto de diseño posible y es el mismo: escribir 0 donde la fuente
// no dijo nada. Un 0 es una afirmación —«trabajó cero horas», «no tiene papeles vencidos»— y en las
// tres el silencio significa otra cosa:
//
//   · HOY      sin registro es SIN CARGAR, nunca «ausente» ni «sin fichar». Ver el bloque de abajo:
//              la columna dejó de hablar de fichaje el 08/09/2026.
//              (Es la misma regla que ya sostiene `asistenciaDelDia.ts`, escrita una sola vez.)
//   · HH MES   sin imputaciones es SIN HH, no 0 horas. Las 19 filas legacy de `registros_hh` vienen
//              del Sheet de JORNALES sin `persona_id`: existen, tienen horas, y no se sabe de quién
//              son. Rotularlas como 0 le atribuiría a alguien un mes sin trabajar.
//   · PAPELES  sin filas en `documentacion_legajo` es SIN LEGAJO CARGADO, no «al día». Es la
//              diferencia entre un legajo revisado y uno que nadie abrió nunca.
//
// Por eso las dos funciones de agregación devuelven un `Map` y NO un valor por persona: la ausencia
// de clave es el dato, y un `Record` con default 0 lo perdería en la primera línea.

import { clasificar, type ClasificacionDelDia } from './asistenciaDelDia.ts'
import { estadoDe } from '../../mi-cuenta/services/documentos.ts'
// LA RUTA RELATIVA CON EXTENSIÓN NO ES UN DESCUIDO: `node --test` no conoce el alias `@/`, y un
// import de VALOR por alias mata la prueba con ERR_MODULE_NOT_FOUND antes de la primera aserción.
import { esTrabajada } from '../../obras/services/tipoHora.ts'

// ── HOY ─────────────────────────────────────────────────────────────────────────────────────────

/** Lo que la pantalla puede AFIRMAR del día de una persona. No existe «ausente»: no hay fuente que
 *  lo diga. `sin_fichar` es la ausencia de marca, que es un hecho distinto y más chico. */
export type EstadoHoy = 'en_obra' | 'ya_cerro' | 'sin_fichar'

/** Una fila de `presencia_del_dia` acotada a lo que decide esta columna. */
export interface MarcaDeHoy {
  persona_id: string
  /** `activo` · `cerrada` · `falta_salida` · `sin_registrar`, tal como los publica la vista. */
  estado: string
}

/**
 * ¿HAY UNA MARCA REAL DE FICHAJE HOY? Es lo único que prende el ● de presencia en la fila.
 *
 * `HOY_LABEL`/`HOY_TONO` vivían acá y escribían «sin fichar» —en ámbar— en las diecisiete filas del
 * plantel. Se retiraron el 08/09/2026: el fichaje desde el celular no está en uso (cuatro marcas de
 * prueba en toda la historia contra cientos de registros de horas por mes), así que esa columna
 * publicaba todos los días la ausencia de una capacidad como si fuera una novedad sobre la gente.
 * La ausencia de marca NO se escribe: no hay palabra que decir sobre un dato que no existe.
 */
export function hayMarcaDeHoy(marca: MarcaDeHoy | undefined): boolean {
  return marca != null && estadoHoy(marca) !== 'sin_fichar'
}

/**
 * En qué estado está hoy una persona, según su fila de `presencia_del_dia` de HOY (o su falta).
 *
 * `sin_registrar` es una marca sin entrada —una incidencia cargada sin fichada— y se lee igual que
 * no tener fila: no hay entrada, no hay jornada. `falta_salida` no puede darse para el día en curso
 * (la vista lo reserva para días anteriores), y si llegara igual se lee como jornada abierta.
 */
export function estadoHoy(marca: MarcaDeHoy | undefined): EstadoHoy {
  if (!marca) return 'sin_fichar'
  if (marca.estado === 'activo' || marca.estado === 'falta_salida') return 'en_obra'
  if (marca.estado === 'cerrada') return 'ya_cerro'
  return 'sin_fichar'
}

/** Las marcas de hoy indexadas por persona. Dos filas de la misma persona en distintas obras se
 *  resuelven a favor de la que tiene jornada abierta: está en obra, aunque haya cerrado en otra. */
export function marcasPorPersona(marcas: MarcaDeHoy[]): Map<string, MarcaDeHoy> {
  const m = new Map<string, MarcaDeHoy>()
  for (const marca of marcas) {
    const previa = m.get(marca.persona_id)
    if (!previa || estadoHoy(previa) !== 'en_obra') m.set(marca.persona_id, marca)
  }
  return m
}

// ── HOY · LA ASISTENCIA DEL DÍA ─────────────────────────────────────────────────────────────────
//
// ═══ LA COLUMNA DEJÓ DE HABLAR DE FICHAJE (08/09/2026, defecto reportado por el dueño) ═══
//
// Decía «● sin fichar» en las diecisiete filas del Plantel, con punto ámbar. Es el mismo error
// conceptual que ya se corrigió en «En obra ahora», en la grilla de quincena y en las tres
// pantallas del jefe: NADIE FICHÓ PORQUE EL FICHAJE NO ESTÁ EN USO, y «sin horas cargadas» no es
// «sin fichar» ni «ausente». La decisión completa, en `docs/engineering/UX_ASISTENCIA_VS_HORAS.md`.
//
// Ahora la columna dice LA ASISTENCIA DEL DÍA, con la misma clasificación y el mismo vocabulario
// que `/administracion/personas/en-obra`: la regla es `clasificar()` de `asistenciaDelDia.ts` y se
// REUSA, no se copia — una segunda copia del `if` es una segunda definición de qué es una ausencia.
//
// Dos capas, como `CeldaDia`: el ● de presencia sale de una marca REAL (`asistencia_marca` vía
// `presencia_del_dia`) y nada más; debajo, lo declarado en `registros_hh`. Ninguna deriva de la
// otra, y por eso conviven «horas sin fichaje» (lo que pasa hoy en toda la empresa) y «fichó sin
// horas cargadas» sin que ninguna de las dos sea una falta.

/** Lo que no se cargó todavía. Sale de la MISMA función que el resto de los estados —`clasificar`
 *  con las manos vacías— para que «sin cargar» no tenga una segunda definición acá. */
export const SIN_CARGAR: ClasificacionDelDia = clasificar([])

/**
 * La asistencia de HOY por persona, a partir de las mismas filas del mes que alimentan HH MES.
 *
 * No se pide una consulta nueva: `mesCorriente` ya cierra la ventana en el día de hoy, así que las
 * filas de hoy vienen en esa lectura. Quien no aparece en el Map no tiene nada cargado, y eso lo
 * dice `SIN_CARGAR` en la fila — un estado en el Map para las 62 personas sería inventar filas.
 */
export function asistenciaHoyPorPersona(
  filas: FilaHHDelMes[], hoy: string,
): Map<string, ClasificacionDelDia> {
  const porPersona = new Map<string, { horas: number; tipo_hora: string; notas: string | null }[]>()
  for (const f of filas) {
    if (!f.persona_id || f.fecha == null || f.fecha.slice(0, 10) !== hoy) continue
    const fila = { horas: Number(f.horas), tipo_hora: f.tipo_hora, notas: f.notas ?? null }
    const previas = porPersona.get(f.persona_id)
    if (previas) previas.push(fila)
    else porPersona.set(f.persona_id, [fila])
  }
  const m = new Map<string, ClasificacionDelDia>()
  for (const [personaId, suyas] of porPersona) m.set(personaId, clasificar(suyas))
  return m
}

/** Qué dibuja la celda HOY. El chip es el ESTADO declarado; el texto, la cantidad o la palabra. */
export interface RotuloHoy {
  /** `A` ausencia · `L` licencia · `null` cuando no hay nada declarado. Nunca hay un chip para el
   *  silencio: no declarar no es un estado de la persona. */
  chip: 'A' | 'L' | null
  chipTono: 'neg' | 'neutro' | null
  texto: string
  /**
   * `cantidad` son horas —tinta plena, monoespaciada, y NUNCA un tono de estado: 9 h no es «bien»
   * ni «mal», es 9 h—. `motivo` es la palabra que acompaña al chip, legible pero secundaria.
   * `silencio` es la falta de dato: el gris más tenue de la fila, el mismo de «sin HH».
   */
  tono: 'cantidad' | 'motivo' | 'silencio'
}

/**
 * La celda en palabras. Es sólo presentación: qué estado tiene la persona ya lo decidió
 * `clasificar`, y acá no se vuelve a mirar `tipo_hora`.
 *
 * El motivo va al lado del chip porque una ausencia sin motivo y una con «carpeta médica» son dos
 * novedades distintas para quien liquida, y en 110 px entra. Cuando no se declaró motivo se escribe
 * la palabra del estado y no un hueco: un hueco al lado de una «A» se lee como un dato perdido.
 */
export function rotuloHoy(c: ClasificacionDelDia): RotuloHoy {
  switch (c.estado) {
    case 'con_horas':
      return { chip: null, chipTono: null, texto: `${horasVisibles(c.horas ?? 0)} h`, tono: 'cantidad' }
    case 'ausente':
      return { chip: 'A', chipTono: 'neg', texto: c.motivo?.toLowerCase() ?? 'ausencia', tono: 'motivo' }
    case 'licencia':
      return { chip: 'L', chipTono: 'neutro', texto: c.motivo?.toLowerCase() ?? 'licencia', tono: 'motivo' }
    case 'presente':
      // DECLARADO PRESENTE POR EL JEFE (`asistencia_dia`, 08/09/2026) y sin horas todavía. NO es
      // «sin cargar»: alguien lo miró y dijo que estaba, y eso es más de lo que la columna sabía
      // hasta hoy. Sin chip de estado —el chip es para A y L, que son las novedades— y en gris,
      // porque lo que falta sigue siendo la carga de horas.
      return { chip: null, chipTono: null, texto: 'presente · sin horas', tono: 'silencio' }
    case 'sin_cargar':
      // NUNCA «sin fichar» ni «ausente»: es que Administración todavía no cargó el día, y eso no
      // es una falta de la persona. Por eso va en gris neutro y sin punto de alerta.
      return { chip: null, chipTono: null, texto: 'sin cargar', tono: 'silencio' }
  }
}

// ── HH DEL MES ──────────────────────────────────────────────────────────────────────────────────

/** Una fila de `registros_hh` acotada a lo que deciden estas dos columnas. */
export interface FilaHHDelMes {
  persona_id: string | null
  fecha: string | null
  horas: number
  tipo_hora: string
  /** El motivo de la ausencia o la licencia. Opcional porque HH DEL MES no lo mira: sólo lo lee la
   *  columna HOY, que sí tiene que poder decir POR QUÉ alguien no está. */
  notas?: string | null
}

/** Del 1 al día de hoy. El mes corriente se cierra en HOY y no a fin de mes: sumar hasta el 31
 *  incluiría imputaciones futuras —que las hay, cargadas por adelantado— y el número dejaría de
 *  contestar «cuánto lleva trabajado». */
export function mesCorriente(hoy: string): { desde: string; hasta: string } {
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
}

/**
 * Horas TRABAJADAS por persona en la ventana. Una ausencia tiene horas y no es trabajo: sumarla
 * diría que la persona trabajó el día que faltó — misma regla que `hhPersonaService.horasEntre`.
 *
 * La persona sin ninguna fila NO aparece en el Map. Ver el encabezado: eso es «sin HH», no 0.
 */
export function hhPorPersona(
  filas: FilaHHDelMes[], desde: string, hasta: string,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of filas) {
    if (!f.persona_id || f.fecha == null) continue
    if (f.fecha < desde || f.fecha > hasta) continue
    if (!esTrabajada(f.tipo_hora)) continue
    m.set(f.persona_id, (m.get(f.persona_id) ?? 0) + Number(f.horas))
  }
  return m
}

/** `7.5` → `7,5` · `160` → `160`. Con coma porque es es-AR y sin decimales inútiles. */
export function horasVisibles(horas: number): string {
  return horas.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

// ── PAPELES ─────────────────────────────────────────────────────────────────────────────────────

/** Una fila de `documentacion_legajo` acotada a lo que decide esta columna. */
export interface PapelDeLegajo {
  persona_id: string
  presente: boolean | null
  fecha_vencimiento: string | null
}

/** Cómo está el legajo de una persona. `total` existe para poder distinguir «todo en orden» de
 *  «no hay nada cargado», que sin él serían los mismos tres ceros. */
export interface EstadoDePapeles {
  vencidos: number
  porVencer: number
  faltan: number
  total: number
}

/**
 * El estado de los papeles por persona. La clasificación de CADA papel la hace `estadoDe`, que ya
 * vive en `mi-cuenta/services/documentos.ts` con su prueba: acá sólo se agrega. Una segunda
 * definición de «vencido» sería la primera que se desincroniza el día que cambien los 30 días de
 * aviso.
 *
 * `presente` nulo no se cuenta como faltante: la columna es `not null` en la base, y si algún día
 * dejara de serlo, un nulo sería «no se declaró» — que no es lo mismo que «Administración dijo que
 * no está».
 */
export function papelesPorPersona(
  papeles: PapelDeLegajo[], hoy: string,
): Map<string, EstadoDePapeles> {
  const m = new Map<string, EstadoDePapeles>()
  for (const p of papeles) {
    const acc = m.get(p.persona_id) ?? { vencidos: 0, porVencer: 0, faltan: 0, total: 0 }
    acc.total += 1
    if (p.presente === false) acc.faltan += 1
    else if (p.presente === true) {
      const estado = estadoDe({ presente: true, fecha_vencimiento: p.fecha_vencimiento }, hoy)
      if (estado === 'vencido') acc.vencidos += 1
      else if (estado === 'por_vencer') acc.porVencer += 1
    }
    m.set(p.persona_id, acc)
  }
  return m
}

/**
 * ¿HAY DE VERDAD UN CONTROL DE VENCIMIENTOS, O SÓLO UNA COLUMNA DONDE GUARDARLO?
 *
 * SONDA DEL 24/08/2026 sobre la base real: `documentacion_legajo` tenía 847 filas, 62 personas con
 * legajo, y **0 filas con `fecha_vencimiento` cargada** y **0 con `presente = false`**. La columna
 * la había agregado la migración 20260820T3000 y nadie la cargaba todavía.
 *
 * REMEDIDO EL 05/09/2026: 938 filas, 75 personas, **2 con vencimiento** y **3 marcadas ausentes**.
 * El control existe desde que alguien cargó la primera fecha, y esta función lo enciende sola — que
 * es exactamente para lo que se escribió. Los números de arriba se dejan porque son la razón por la
 * que la columna se retiró en agosto, no una medición vigente.
 *
 * Con esos datos, la columna PAPELES escribiría «al día» en 61 filas. Eso no es un dato: es una
 * afirmación —«revisé sus papeles y están vigentes»— sostenida por un campo que nadie completó, y
 * es peor que no tener la columna, porque apaga la pregunta. La columna se dibuja SÓLO si la fuente
 * tiene contenido; el día que Administración cargue el primer vencimiento (o marque el primer papel
 * como ausente) aparece sola, sin tocar código.
 *
 * NO alcanza con que la columna exista en la base: el control lo prueba el dato, no el esquema.
 */
export function hayControlDeVencimientos(papeles: PapelDeLegajo[]): boolean {
  return papeles.some((p) => p.fecha_vencimiento != null || p.presente === false)
}

/** Qué dice la celda PAPELES y con qué peso. El color lo pone la tabla: acá no entra un hex. */
export interface RotuloDePapeles {
  texto: string
  /** `bloquea` = rojo (no puede estar en obra) · `falta` = tenue · `dato` = apagado. */
  tono: 'bloquea' | 'falta' | 'dato' | 'sin_lectura'
}

/**
 * LA CELDA PAPELES CUENTA, NO CERTIFICA (handoff CRM / Administración v4).
 *
 * ═══ POR QUÉ ESTA COLUMNA VOLVIÓ DICIENDO OTRA COSA ═══
 *
 * La versión de agosto escribía «al día» y por eso se retiró: con 847 papeles cargados y CERO con
 * `fecha_vencimiento`, «al día» era una afirmación —«revisé sus papeles y están vigentes»— sostenida
 * por una columna que nadie completó. Un conteo no afirma nada de eso: «6 cargados» es exactamente
 * lo que la base sabe, y «sin cargar» es la ausencia que sí importa, porque un legajo vacío es el
 * que no se puede presentar ante el IERIC.
 *
 * ═══ LAS CUATRO RESPUESTAS SON CUATRO COSAS DISTINTAS, Y NINGUNA ES UN CERO ═══
 *
 *   sin lectura   no se pudo leer la tabla. UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ». Es la
 *                 razón por la que `leidos` es un parámetro y no se deduce de un mapa vacío: un
 *                 error de RLS y una persona sin papeles llegan acá idénticos.
 *   N vencidos    gana sobre todo lo demás, y sólo existe si `controlDeVencimientos`. Con la libreta
 *                 o el apto médico vencido no se puede estar en obra: es la señal que la banda
 *                 retirada dibujaba arriba sin poder decir de quién.
 *   sin cargar    se leyó y no hay ni un papel presente. Falta, pero no bloquea el ingreso de hoy.
 *   N cargados    el conteo. En singular cuando es uno: «1 cargados» delata que nadie lo miró.
 *
 * ═══ «CARGADOS» ES LO QUE ESTÁ, NO LAS FILAS DE LA TABLA ═══
 *
 * `total` cuenta también los papeles que Administración marcó como AUSENTES (`presente = false`):
 * son filas que existen justamente para decir que el papel NO está. Medido el 05/09/2026 sobre la
 * base real hay 3. Contarlas como «cargados» diría que un legajo tiene un papel que la propia
 * Administración declaró faltante — es la misma clase de mentira que «al día» sobre un control que
 * nadie hace, en chiquito.
 */
export function rotuloDePapeles(
  estado: EstadoDePapeles | undefined,
  { leidos, controlDeVencimientos }: { leidos: boolean; controlDeVencimientos: boolean },
): RotuloDePapeles {
  if (!leidos) return { texto: 'sin lectura', tono: 'sin_lectura' }
  const vencidos = controlDeVencimientos ? (estado?.vencidos ?? 0) : 0
  if (vencidos > 0) {
    return { texto: `${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`, tono: 'bloquea' }
  }
  const cargados = (estado?.total ?? 0) - (estado?.faltan ?? 0)
  if (cargados <= 0) return { texto: 'sin cargar', tono: 'falta' }
  return { texto: `${cargados} ${cargados === 1 ? 'cargado' : 'cargados'}`, tono: 'dato' }
}

// ═══ LO QUE SE FUE CON EL PORTE 19 v2 (25/08/2026) ═══
//
// `lecturaDePapeles`, `partirCifra`, `alertasDelPlantel` y `AlertaDelPlantel` vivían acá para
// alimentar dos cosas que la pantalla ya no dibuja: la columna PAPELES de la fila —que decía «al
// día» sobre un control que nadie está haciendo— y la banda de tres pastillas de alerta.
//
// Las mismas cuentas las hace ahora `senalesPersonal.senalesDePersonal`, que devuelve la cifra, qué
// bloquea y el verbo por separado: eso es lo que el bloque de trabajo necesita, y era exactamente
// lo que `partirCifra` intentaba recuperar partiendo una frase ya armada. Una función que deshace
// lo que la de al lado acaba de juntar es la señal de que el dato nace con la forma equivocada.
