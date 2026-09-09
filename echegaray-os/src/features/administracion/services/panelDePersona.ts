// LA PERSONA ABIERTA EN LA QUINCENA — pantallas 2 y 3 del handoff v2, sin base de datos.
//
// Todo lo que se ve al abrir una fila de la grilla se decide acá: qué cobra, qué se le descontó, qué
// queda en efectivo, y qué pasó con cada día cargado. Es una función pura por el mismo motivo que
// `grillaHorasQuincena.ts`: cada número de estos termina en un billete, y los casos que importan
// —el que no tiene retribución cargada, el día que alguien corrigió dos veces— tienen que poder
// ponerse en rojo sin levantar Supabase.
//
// ═══ LO QUE ESTE ARCHIVO NO REDEFINE ═══
//
// La cuenta de la quincena entera es `liquidacionQuincena.ts` y el reparto en cuadros es
// `liquidacionCuadros.ts`. Acá se mira UNA persona: la misma cadena de R5 aplicada a una fila.
// Si alguna vez difieren, la de la persona está mal.
//
// ═══ R1 · NULL NUNCA ES CERO ═══
//
// Sin `valorHora` cargado, COBRA no vale 0: no existe. Devolver 0 le pagaría cero a alguien que
// trabajó 56 horas y el total de la quincena cerraría igual, que es la forma más cara de que un
// error no se note.

/** R5 · las cuatro celdas que se escriben; el resto se calcula. */
export interface CadenaDePago {
  horas: number
  /** `null` = sin retribución cargada. NO es cero (R1). */
  valorHora: number | null
  adelanto: number | null
  yaTransferido: number | null
  porBanco: number | null
  /** Los billetes que el dueño entrega en mano. Vacío ≠ 0. */
  efectivoRedondeado: number | null
}

export interface CadenaCalculada extends CadenaDePago {
  /** horas × $/h. `null` cuando no hay retribución: la fila queda pendiente, no en cero. */
  cobra: number | null
  /** COBRA − ADELANTO − YA TRANSFERIDO − POR BANCO. `null` sin retribución. */
  enEfectivo: number | null
  /** POR BANCO + EN EFECTIVO. `null` sin retribución. */
  total: number | null
  sinRetribucion: boolean
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * LA CADENA DE UNA PERSONA. Cuatro celdas escritas, tres calculadas.
 *
 * Un giro hecho ANTES de armar el lote no es un adelanto: va en «ya transferido». Acá los dos
 * restan igual, pero se guardan separados porque contestan preguntas distintas el día que el
 * extracto no cuadra.
 */
export function calcularCadena(c: CadenaDePago): CadenaCalculada {
  if (c.valorHora == null) {
    return { ...c, cobra: null, enEfectivo: null, total: null, sinRetribucion: true }
  }
  const cobra = r2(c.horas * c.valorHora)
  const enEfectivo = r2(cobra - (c.adelanto ?? 0) - (c.yaTransferido ?? 0) - (c.porBanco ?? 0))
  return {
    ...c,
    cobra,
    enEfectivo,
    total: r2((c.porBanco ?? 0) + enEfectivo),
    sinRetribucion: false,
  }
}

/** Una corrección ya guardada en `registro_hh_correccion`, tal como sale de la base. */
export interface CorreccionDeDia {
  horasAntes: number | null
  horasDespues: number | null
  autor: string | null
  corregidoEn: string
}

export interface RastroDeDia {
  /** «corrigió J. Corona el 08/09 · era 9». `null` = el día nunca se corrigió. */
  texto: string | null
  /** Las horas con las que el día NACIÓ. Es lo que muestra «Ver el original». */
  original: number | null
  veces: number
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0')

/** `2026-09-08T…` → `08/09`. La fecha del rastro se lee al lado del día, no en otra pantalla. */
function diaYMes(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${dosDigitos(d.getUTCDate())}/${dosDigitos(d.getUTCMonth() + 1)}`
}

/** «Jorge Corona» → «J. Corona». El nombre entero no entra en 210 px y el apellido es el que importa. */
export function nombreCorto(nombre: string | null): string {
  if (!nombre) return 'alguien'
  const partes = nombre.trim().split(/\s+/)
  return partes.length < 2 ? nombre : `${partes[0][0]}. ${partes.slice(1).join(' ')}`
}

const horasDichas = (n: number | null): string =>
  n == null ? 'sin cargar' : n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * R8 · EL RASTRO DE UN DÍA CORREGIDO.
 *
 * El original es el `horas_antes` de la PRIMERA corrección, no el de la última: después de dos
 * correcciones «era 9» tiene que seguir diciendo 9 y no el valor intermedio. Por eso el historial es
 * una tabla y no dos columnas — dos columnas sólo guardan la última y borran el original.
 *
 * Se ordena acá y no se confía en el orden en que llegaron las filas: un `order` que alguien saque
 * de la consulta convertiría el original en «la que Postgres devolvió primero».
 */
export function rastroDelDia(correcciones: readonly CorreccionDeDia[]): RastroDeDia {
  if (correcciones.length === 0) return { texto: null, original: null, veces: 0 }
  const orden = [...correcciones].sort((a, b) => a.corregidoEn.localeCompare(b.corregidoEn))
  const ultima = orden[orden.length - 1]
  return {
    texto: `corrigió ${nombreCorto(ultima.autor)} el ${diaYMes(ultima.corregidoEn)} · era ${horasDichas(orden[0].horasAntes)}`,
    original: orden[0].horasAntes,
    veces: orden.length,
  }
}

/** Una fila de la pantalla 3: un día cargado, con quién lo cargó y qué se le hizo después. */
export interface DiaDelPanel {
  registroId: string
  fecha: string
  obra: string | null
  actividad: string | null
  clase: string
  /** «Jorge Corona · 09/09» o la planilla de origen. Nunca vacío: el día lo cargó alguien. */
  cargo: string
  horas: number | null
  rastro: RastroDeDia
  /** Quincena cerrada = sólo lectura. Lo decide el estado de la quincena, no la fila. */
  editable: boolean
}

export interface RegistroDelPanel {
  id: string
  fecha: string
  horas: number | null
  tipo_hora: string | null
  obra: string | null
  actividad: string | null
  cargo: string | null
  fuenteLegacy: string | null
  creadoEn: string | null
}

const CLASES: Record<string, string> = {
  normal: 'Normal',
  extra_50: 'Extra 50%',
  extra_100: 'Extra 100%',
  licencia: 'Licencia',
  ausencia: 'Ausencia',
}

/** El nombre de la clase de hora tal como se lee, nunca la clave cruda de la base. */
export const claseDicha = (tipo: string | null): string =>
  tipo == null ? 'sin clase' : (CLASES[tipo] ?? tipo)

/**
 * LOS DÍAS DE LA PERSONA EN LA QUINCENA, del más nuevo al más viejo.
 *
 * QUIÉN CARGÓ NO SE INVENTA: si no hay perfil y la fila vino de la planilla, se dice «JORNALES
 * (planilla)». Escribir el nombre de quien corrigió como si hubiera cargado el día borraría la
 * diferencia entre el dato original y la corrección, que es justo lo que R8 protege.
 */
export function diasDelPanel(
  registros: readonly RegistroDelPanel[],
  correcciones: ReadonlyMap<string, readonly CorreccionDeDia[]>,
  opciones: { editable: boolean },
): DiaDelPanel[] {
  return [...registros]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((r) => ({
      registroId: r.id,
      fecha: r.fecha,
      obra: r.obra,
      actividad: r.actividad,
      clase: claseDicha(r.tipo_hora),
      cargo: quienCargo(r),
      horas: r.horas,
      rastro: rastroDelDia(correcciones.get(r.id) ?? []),
      editable: opciones.editable,
    }))
}

function quienCargo(r: RegistroDelPanel): string {
  const cuando = r.creadoEn ? ` · ${diaYMes(r.creadoEn)}` : ''
  if (r.cargo) return `${r.cargo}${cuando}`
  if (r.fuenteLegacy) return `${r.fuenteLegacy} (planilla)${cuando}`
  return `sin registrar${cuando}`
}

export interface MesDeHH {
  /** `sep` — el mes en tres letras, que es lo que entra en la columna del panel. */
  rotulo: string
  clave: string
  /** `null` = ese mes no tiene NINGUNA hora cargada. No es cero trabajado: es sin cargar. */
  horas: number | null
  actual: boolean
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * HH POR MES — los últimos `cuantos` meses, del más viejo al más nuevo.
 *
 * Un mes sin ninguna hora cargada devuelve `null` y el panel escribe «sin cargar». Un 0 diría que
 * esa persona estuvo el mes entero sin trabajar, que es una afirmación sobre su legajo que nadie
 * hizo — y la que después aparece en una discusión de sueldo.
 */
export function hhPorMes(
  filas: readonly { fecha: string; horas: number | null }[],
  hasta: string,
  cuantos = 5,
): MesDeHH[] {
  const anio = Number(hasta.slice(0, 4))
  const mes = Number(hasta.slice(5, 7))
  const meses: MesDeHH[] = []
  for (let i = cuantos - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1))
    const clave = `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}`
    const delMes = filas.filter((f) => f.fecha.slice(0, 7) === clave)
    meses.push({
      clave,
      rotulo: MES_CORTO[d.getUTCMonth()],
      horas: delMes.length === 0 ? null : r2(delMes.reduce((s, f) => s + (f.horas ?? 0), 0)),
      actual: i === 0,
    })
  }
  return meses
}
