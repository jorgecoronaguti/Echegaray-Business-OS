// EL LOG DE LO ESCRITO A MANO EN LIQUIDACIÓN, DICHO PARA UNA CELDA.
//
// La tabla `liquidacion_cambio` guarda el hecho crudo —columna de base, números sin formato, un uuid de autor,
// un `timestamptz`—. Acá se traduce a lo que el punto ámbar enseña al pasar el mouse: CUÁNDO · QUIÉN · DE QUÉ A QUÉ.
//
// ═══ PURO, Y NO POR ELEGANCIA ═══
//
// Que un vacío se diga «vuelve al cálculo» y no «$0», que el pasado que no existe no se invente y que dos cargas del
// mismo segundo no se den vuelta sólo se prueba ejercitándolo sin base ni navegador. Mismo patrón que
// `auditoriaCambios.ts`, que hace lo mismo para la ficha de una persona.
//
// ═══ QUIÉN · CUÁNDO · CÓMO (dueño, 01/10/2026: «ahí debe salir quién cuándo y cómo») ═══
//
// Cada cambio dice el nombre de quien lo hizo, la fecha y hora, y el valor anterior → nuevo con la cuenta escrita y el
// ORIGEN («a mano en la celda», «marca de pago»…). La fila `base` NO es un cambio: es el valor que ya estaba cuando se
// activó el log, y se muestra al final como «valor previo», nunca con flecha.
//
// ═══ LO QUE ESTE LOG NO PUEDE DECIR, Y CÓMO SE DICE ═══
//
// Los manuales que ya existían no tienen autor en `liquidacion_cambio`. Para ésos se cruza `liquidacion_linea.
// actualizado_en` con `app_registro` (POST de Liquidación del mismo minuto) y, si UN solo usuario aparece, se lo nombra
// declarando «según el registro de la app». Sin cruce posible se dice «anterior al registro (30/09)»: nunca «sin
// registro» a secas y nunca un autor inventado. Límite medido: guardarCeldaLiquidacion no actualiza `actualizado_en`,
// así que el cruce acierta pocas veces; por eso es una atribución declarada y no un dato.

// RUTAS RELATIVAS CON EXTENSIÓN en los imports de VALOR: el test corre con `node --test`, que no conoce el alias `@/`.
import { COLUMNA_DE, type CampoEditable } from './liquidacionOverrides.ts'
import { horas, pesos } from '../components/liquidacion/formato.ts'

/** Una fila de `liquidacion_cambio` con el grupo de su cabecera, tal como sale de la base. */
export interface CambioCrudo {
  id: number
  liquidacion_id: string
  grupo: string
  persona_id: string
  /** Columna de `liquidacion_linea` (`por_banco_manual`, `pagado_efectivo`…). */
  columna: string
  /** `base` = el valor que ya había cuando se activó el registro; no es un cambio de nadie. */
  tipo: 'cambio' | 'base'
  /** `numeric` llega como número o como texto según el driver: se normaliza acá. `null` = «era el cálculo». */
  antes: number | string | null
  /** `null` = se vació la celda: vuelve el cálculo. */
  despues: number | string | null
  formula_antes: string | null
  formula_despues: string | null
  /** `auth.uid()` de quien lo hizo; `null` = no hubo sesión (chat, sincronización) o es la fila `base`. */
  autor: string | null
  en: string
  /** CÓMO: `pago`, `celda`, `sesion`, `sin_sello` (20261001T0700). Ausente/`null` = la base todavía no lo guarda. */
  origen?: string | null
}

/** Un POST de Liquidación en `app_registro`: sólo quién y cuándo. */
export interface PostDelRegistro { perfil_id: string | null; en: string }

/** Lo que hace falta para nombrar a quien escribió un manual anterior al trigger. */
export interface CruceConElRegistro {
  /** `${liquidacion_id}|${persona_id}` → `liquidacion_linea.actualizado_en`. */
  actualizadoEn: ReadonlyMap<string, string | null>
  posts: readonly PostDelRegistro[]
}

/**
 * EL PRIMER INSTANTE QUE CUBRE `app_registro` (primera fila, medida el 01/10/2026). Antes de eso no hay con qué
 * cruzar: «anterior al registro». Va en una constante porque la poda de la tabla movería un mínimo leído en vivo.
 */
export const INICIO_DEL_REGISTRO = '2026-09-30T11:43:00Z'

export interface EntradaDeHistorial {
  id: string
  /** `dd/mm/aa hh:mm` en la hora de la empresa. `null` = no hay fecha que afirmar (valor anterior al registro). */
  cuando: string | null
  quien: string
  /** `cálculo` cuando antes no había nada escrito. */
  antes: string
  /** `vuelve al cálculo` cuando se vació. */
  despues: string
  /** La cuenta tal como se escribió («=a+b»), si la hubo. */
  cuenta: string | null
  vaciado: boolean
  esBase: boolean
  /** CÓMO se escribió («a mano en la celda», «marca de pago»…). En la base: que es el valor previo al log. */
  como: string
}

export interface HistorialDeCelda { entradas: EntradaDeHistorial[] }

/** Lo que viaja de la lectura a la pantalla: todas las celdas de la quincena, por clave. */
export type HistorialDeLaQuincena = Record<string, HistorialDeCelda>

/** `liquidacion_linea.efectivo_redondeado` también se anota, aunque su celda no lleve punto. */
const CAMPO_DE_COLUMNA: ReadonlyMap<string, CampoEditable> = new Map(
  (Object.entries(COLUMNA_DE) as [CampoEditable, string][]).map(([campo, columna]) => [columna, campo]),
)

const CAMPOS_EN_HORAS: ReadonlySet<string> = new Set(['horas', 'horasRecibo', 'horasNegro'])

export const claveDeCelda = (grupo: string, personaId: string, campo: string): string => `${grupo}|${personaId}|${campo}`

// LA HORA DE LA EMPRESA, no la del proceso: Vercel corre en UTC y un cambio de las 22:00 de San Juan cae al día
// siguiente. La misma zona que `entradaService.ts`; allá no se exporta y no se toca ese archivo desde acá.
const ZONA = 'America/Argentina/Buenos_Aires'
const partes = (d: Date): Record<string, string> =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {})

function fechaDicha(iso: string): { dia: string; completa: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { dia: 'sin fecha', completa: 'sin fecha' }
  const p = partes(d)
  const dia = `${p.day}/${p.month}/${p.year}`
  return { dia, completa: `${dia} ${p.hour}:${p.minute}` }
}

const aNumero = (v: number | string | null): number | null => (v == null ? null : Number(v))

const COMO: Record<string, string> = {
  celda: 'a mano en la celda',
  pago: 'marca de pago',
  sesion: 'con la sesión de quien lo hizo, fuera de la celda',
  sin_sello: 'chat o sincronización',
}

/** El autor, sin disfrazar: sin sesión no es una persona, y un uuid sin perfil no se muestra. */
function autorDicho(autor: string | null, origen: string | null, nombres: ReadonlyMap<string, string>): string {
  if (autor === null) return origen === 'sin_sello' ? 'sin autor: chat o sincronización' : 'sin autor registrado'
  return nombres.get(autor) ?? 'sin identificar'
}

function entrada(f: CambioCrudo, campo: CampoEditable, nombres: ReadonlyMap<string, string>): EntradaDeHistorial {
  const dicho = (n: number | null) => (CAMPOS_EN_HORAS.has(campo) ? horas(n) : pesos(n))
  const antes = aNumero(f.antes)
  const despues = aNumero(f.despues)
  const origen = f.origen ?? null
  return {
    id: String(f.id),
    cuando: fechaDicha(f.en).completa,
    quien: autorDicho(f.autor, origen, nombres),
    antes: antes == null ? 'cálculo' : dicho(antes),
    despues: despues == null ? 'vuelve al cálculo' : dicho(despues),
    cuenta: f.formula_despues,
    vaciado: despues == null,
    esBase: false,
    como: origen ? COMO[origen] ?? origen : 'origen no registrado',
  }
}

/** `30/09`: el día del inicio del registro, para decir «anterior al registro (30/09)». */
const diaCorto = (iso: string): string => { const p = partes(new Date(iso)); return `${p.day}/${p.month}` }

/** El minuto de un instante ISO, en UTC: dos instantes del mismo minuto dan la misma clave. */
const minuto = (iso: string): string => iso.length >= 16 ? new Date(iso).toISOString().slice(0, 16) : iso

/**
 * EL VALOR PREVIO AL LOG, CON LO QUE SE PUEDE AFIRMAR DE QUIÉN LO ESCRIBIÓ.
 *
 * Tres respuestas y ninguna inventa: (1) la línea se actualizó antes de que existiera el registro, o no hay fecha:
 * «anterior al registro (30/09)»; (2) se actualizó después y UN solo usuario hizo POST a Liquidación ese minuto: se lo
 * nombra «según el registro de la app»; (3) se actualizó después y el registro no alcanza a decidir: se dice que no.
 */
function valorPrevio(
  f: CambioCrudo, campo: CampoEditable, nombres: ReadonlyMap<string, string>, cruce: CruceConElRegistro | null,
): EntradaDeHistorial {
  const despues = aNumero(f.despues)
  const anteriorAlRegistro = `anterior al registro (${diaCorto(INICIO_DEL_REGISTRO)})`
  const act = cruce?.actualizadoEn.get(`${f.liquidacion_id}|${f.persona_id}`) ?? null
  let cuando: string | null = null
  let quien = anteriorAlRegistro
  if (act && Date.parse(act) >= Date.parse(INICIO_DEL_REGISTRO)) {
    cuando = fechaDicha(act).completa
    const perfiles = new Set((cruce?.posts ?? []).filter((p) => p.perfil_id && minuto(p.en) === minuto(act)).map((p) => p.perfil_id as string))
    quien = perfiles.size === 1
      ? `${nombres.get([...perfiles][0]) ?? 'sin identificar'}, según el registro de la app`
      : perfiles.size === 0 ? 'sin POST de Liquidación en el registro a esa hora' : 'varios usuarios en el registro de ese minuto: no se atribuye'
  }
  return {
    id: String(f.id), cuando, quien, antes: 'cálculo',
    despues: despues == null ? 'vuelve al cálculo' : (CAMPOS_EN_HORAS.has(campo) ? horas(despues) : pesos(despues)),
    cuenta: f.formula_despues, vaciado: despues == null, esBase: true, como: 'valor previo al log',
  }
}

/**
 * LAS FILAS CRUDAS DE LA QUINCENA, AGRUPADAS POR CELDA Y ORDENADAS: lo más reciente primero. A igual instante, el id
 * mayor (el que se anotó después). Una columna que la pantalla no conoce se descarta: no hay celda donde dibujarla.
 */
export function historialDeCeldas(
  filas: readonly CambioCrudo[], nombres: ReadonlyMap<string, string>, cruce: CruceConElRegistro | null = null,
): HistorialDeLaQuincena {
  const porCelda = new Map<string, { f: CambioCrudo; campo: CampoEditable }[]>()
  for (const f of filas) {
    const campo = CAMPO_DE_COLUMNA.get(f.columna)
    if (!campo) continue
    const clave = claveDeCelda(f.grupo, f.persona_id, campo)
    porCelda.set(clave, [...(porCelda.get(clave) ?? []), { f, campo }])
  }
  const salida: HistorialDeLaQuincena = {}
  for (const [clave, lista] of porCelda) {
    const orden = [...lista].sort((a, b) => {
      const dt = Date.parse(b.f.en) - Date.parse(a.f.en)
      return dt !== 0 && !Number.isNaN(dt) ? dt : b.f.id - a.f.id
    })
    // LA BASE NO ES UN CAMBIO: va al final, como el punto de partida, y nunca antes de uno real.
    const cambios = orden.filter(({ f }) => f.tipo !== 'base').map(({ f, campo }) => entrada(f, campo, nombres))
    const previos = orden.filter(({ f }) => f.tipo === 'base').map(({ f, campo }) => valorPrevio(f, campo, nombres, cruce))
    salida[clave] = { entradas: [...cambios, ...previos] }
  }
  return salida
}

/**
 * EL SELLO QUE VIAJA EN LA MISMA ESCRITURA (`escribio_id`, `escribio_en`). `escribio_en` es un instante nuevo en cada
 * guardado: el trigger sólo toma el autor cuando CAMBIÓ, así una escritura posterior de otro camino (chat,
 * sincronización) no hereda el nombre del último que tipeó acá.
 */
export const selloDeAutor = (autorId: string | null, ahora: Date = new Date()): { escribio_id: string | null; escribio_en: string } =>
  ({ escribio_id: autorId, escribio_en: ahora.toISOString() })
