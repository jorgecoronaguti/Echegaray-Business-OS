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
// ═══ LO QUE ESTE LOG NO PUEDE DECIR ═══
//
// Los manuales que ya existían cuando se activó el registro no tienen historia: la migración dejó UNA fila `base` con
// el valor de ese día y esta capa la dibuja como «sin registro anterior al <día>». No hay autor ni hora anteriores
// porque `actualizado_en` de la línea no dice quién ni qué celda tocó: usarlo sería fabricar un dato.

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
}

export interface EntradaDeHistorial {
  id: string
  /** `dd/mm/aa hh:mm` en la hora de la empresa. */
  cuando: string
  quien: string
  /** `cálculo` cuando antes no había nada escrito. */
  antes: string
  /** `vuelve al cálculo` cuando se vació. */
  despues: string
  /** La cuenta tal como se escribió («=a+b»), si la hubo. */
  cuenta: string | null
  vaciado: boolean
  esBase: boolean
  /** Sólo en la fila `base`: «sin registro anterior al <día>». */
  nota: string | null
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

/** El autor, sin disfrazar: sin sesión no es una persona, y un uuid sin perfil no se muestra. */
function autorDicho(autor: string | null, nombres: ReadonlyMap<string, string>): string {
  if (autor === null) return 'sin autor registrado'
  return nombres.get(autor) ?? 'sin identificar'
}

function entrada(f: CambioCrudo, campo: CampoEditable, nombres: ReadonlyMap<string, string>): EntradaDeHistorial {
  const dicho = (n: number | null) => (CAMPOS_EN_HORAS.has(campo) ? horas(n) : pesos(n))
  const antes = aNumero(f.antes)
  const despues = aNumero(f.despues)
  const cuando = fechaDicha(f.en)
  return {
    id: String(f.id),
    cuando: cuando.completa,
    quien: autorDicho(f.autor, nombres),
    antes: antes == null ? 'cálculo' : dicho(antes),
    despues: despues == null ? 'vuelve al cálculo' : dicho(despues),
    cuenta: f.formula_despues,
    vaciado: despues == null,
    esBase: f.tipo === 'base',
    nota: f.tipo === 'base' ? `sin registro anterior al ${cuando.dia}` : null,
  }
}

/**
 * LAS FILAS CRUDAS DE LA QUINCENA, AGRUPADAS POR CELDA Y ORDENADAS: lo más reciente primero. A igual instante, el id
 * mayor (el que se anotó después). Una columna que la pantalla no conoce se descarta: no hay celda donde dibujarla.
 */
export function historialDeCeldas(
  filas: readonly CambioCrudo[], nombres: ReadonlyMap<string, string>,
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
    salida[clave] = { entradas: orden.map(({ f, campo }) => entrada(f, campo, nombres)) }
  }
  return salida
}
