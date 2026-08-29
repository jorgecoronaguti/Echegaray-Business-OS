// LA COSTURA CON EL COTIZADOR — el único lugar donde la web importa el motor.
//
// ═══ POR QUÉ EXISTE UN ARCHIVO SÓLO PARA ESTO ═══
//
// El motor vive en `orquestador/lib/cotizador/*.mjs`: JavaScript puro, sin tipos, y con `allowJs`
// TypeScript lo infiere de los valores por defecto. `conversar({estado = {}, mutar = null})` se
// infiere como `estado: {}` y `mutar: null`, así que pasarle un estado real o una función es un
// error de tipo — no porque esté mal, sino porque el `.mjs` no puede declarar lo que acepta.
//
// La firma se escribe UNA VEZ, acá, y el resto del módulo importa de este archivo. Si el CORE
// cambia el contrato, se cambia esta firma y TypeScript señala todos los puntos que hay que
// acompañar. Repartir el `as unknown as` por seis archivos convertiría cada uno en un lugar donde
// el contrato puede empezar a diferir sin que nadie lo note.
//
// ═══ ESTE ARCHIVO SE ADELGAZA SOLO ═══
//
// Cuando el CORE entregue sus adaptadores de Postgres tipados, `estadoDesdeFilas` desaparece de
// acá y queda sólo `conversar`. La costura ya está donde tiene que estar.

import type { PresupuestoCascada, PartidaValorizada } from '../types/index.ts'
import type { RespuestaConversacion } from './conversacionTipos.ts'
import type { Intencion, Validado } from './conversacionPlan.ts'
import { conversar as conversarMjs } from '../../../../orquestador/lib/cotizador/conversacion.mjs'
// El intérprete de respaldo vive FUERA de `cotizador/` y se inyecta: esa carpeta no importa un
// cliente de IA y `claude-zero.test.mjs` lo verifica. Ver el encabezado de `conversacion.mjs`.
import { interpretarConModelo } from '../../../../orquestador/lib/interprete-presupuesto-llm.mjs'
import {
  estadoDesdeFilas as estadoDesdeFilasMjs,
  cascadaDesdeFila as cascadaDesdeFilaMjs,
} from '../../../../orquestador/lib/cotizador/desde-base.mjs'

/** Un issue de la cola de atención (§22). `impact` es plata o `null`, nunca cero. */
export interface IssueCola {
  type: string
  severity: 'BLOQUEANTE' | 'ALTA' | 'MEDIA' | 'BAJA'
  entity: string
  impact: number | null
  recommended_action: string | null
  detalle: string | null
  bloquea: boolean
  porQueBloquea: string | null
}

export interface Cola {
  issues: IssueCola[]
  bloqueantes: IssueCola[]
  noBloqueantes: IssueCola[]
  total: number
  nBloqueantes: number
  /** La plata conocida que cuelga de bloqueantes. `null` si ninguno la trae — no cero. */
  plataEnRiesgo: number | null
  /** Cuántos bloqueantes no tienen impacto medido. La métrica honesta del §30. */
  bloqueantesSinMedir: number
}

/** El gate de congelado (§24): un estado con motivos, no un booleano opaco. */
export interface Gate {
  ready: boolean
  blocking_issues: { tipo: string; entidad: string; detalle: string | null; impacto: number | null; accion: string | null }[]
  warnings: { tipo: string; entidad: string; detalle: string | null; impacto: number | null }[]
  porQue: string
}

export interface CascadaMotor {
  estado: string
  costoDirecto: number | null
  ventaSinIva: number | null
  ventaFinal: number | null
  iva: number | null
  coeficienteSinIva: number | null
  porQue: string | null
}

export interface EstadoPresupuestoVivo {
  partidas: unknown[]
  politica: unknown
  cascada: CascadaMotor | null
  cola: Cola
  gate: Gate
  costoConocido: number | null
  /** La cola sale de las FILAS, no de las once etapas: es real y no es toda. */
  parcial: boolean
}

interface OpcionesConversar {
  texto: string
  rol: string
  actor: string
  estado: Record<string, unknown>
  confirmado?: boolean
  cascadaAntes?: CascadaMotor | null
  usarModelo?: boolean
  conModelo?: unknown
  mutar?: (x: { intent: Intencion; validado: Validado }) => unknown
}

export interface TurnoDelMotor {
  entendido: boolean
  comoSeEntendio: string | null
  degradado: boolean
  intencion: Intencion | null
  salida: { ok: boolean; etapaQueParo: string | null; porQue: string | null } | null
  respuesta: RespuestaConversacion
  eventos: { entidad: string; campo: string | null; antes: unknown; despues: unknown }[]
}

// El doble `as unknown as` es el precio de una frontera entre un módulo sin tipos y uno tipado, y
// está acá y en ninguna otra parte. `unknown` y no `any`: `any` apagaría el chequeo dentro de la
// firma también, y la firma es justamente lo que hay que chequear.
const conversarSinModelo = conversarMjs as unknown as (o: OpcionesConversar) => Promise<TurnoDelMotor>

/**
 * `conversar` con el respaldo del modelo YA ENCHUFADO.
 *
 * El enchufe está acá y en ningún otro lado: quien llame desde la web tiene el respaldo, y quien
 * llame a `cotizador/conversacion.mjs` directo corre determinístico. Un caller no puede olvidarse de
 * enchufarlo ni enchufarlo dos veces.
 */
export const conversar = (o: OpcionesConversar) => conversarSinModelo({ conModelo: interpretarConModelo, ...o })

export const estadoDesdeFilas = estadoDesdeFilasMjs as unknown as (
  o: { presupuesto: PresupuestoCascada; partidas: PartidaValorizada[] },
) => EstadoPresupuestoVivo

export const cascadaDesdeFila = cascadaDesdeFilaMjs as unknown as (
  p: PresupuestoCascada | null,
) => CascadaMotor | null
