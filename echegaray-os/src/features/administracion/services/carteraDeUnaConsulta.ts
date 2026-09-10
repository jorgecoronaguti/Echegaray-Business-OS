// LAS DIEZ LECTURAS DE `/clientes`, EN UN VIAJE.
//
// ═══ POR QUÉ UN VIAJE Y NO DIEZ RÁPIDOS ═══
//
// El costo dominante de esta pantalla no es ninguna consulta: es el ARRANQUE EN FRÍO POR CONEXIÓN.
// Un backend de Postgres que nunca tocó las vistas anidadas del OS paga ~800 ms cargando el
// catálogo antes de planificar nada (medido con `explain analyze` como `authenticated`, commit
// 32969f03); ya caliente, cada vista cuesta 13-23 ms. Diez consultas en paralelo pueden caer en
// diez backends distintos del pool de PostgREST, y bajo saturación varios estrenan conexión: diez
// arranques de ~800 ms compitiendo por la misma CPU. Medido en la traza local del 10/09/2026, en la
// ola de `/obras`: `obra_plan_vs_real` 8.313 ms y `obra_economia` 7.384 ms — las mismas vistas que
// solas cuestan decenas de ms.
//
// Consecuencia incómoda y ya escrita en el commit anterior: paralelizar de más AMPLIFICA el
// problema. Lo que paga es reducir el NÚMERO DE VIAJES. De ahí `public.pantalla_clientes()`.
//
// ═══ LA RPC TRANSPORTA, ESTE ARCHIVO NO INTERPRETA ═══
//
// La función SQL devuelve las mismas filas y columnas que pedían las diez consultas. La conversión
// a los tipos de la pantalla la hacen las MISMAS funciones que usa el camino de PostgREST
// (`armarClientes`, `armarObrasPorCliente`, `armarCobradoPorObra`, `armarPapelesDeLaCartera`,
// `armarEconomiaDeObras`, `armarEconomiaDeClientes`), y quien arma las filas sigue siendo
// `armarCartera`. Una conversión, dos transportes: si cada uno tuviera la suya, la misma pantalla
// podría decir números distintos según por dónde entró el dato — que es exactamente el defecto que
// el registro de definiciones existe para impedir.
//
// ═══ QUÉ PASA CUANDO FALLA ═══
//
// Con diez consultas, cada lectura fallaba sola y la pantalla podía dibujar la mitad. Con una,
// falla todo junto. NO es un empeoramiento disfrazado: las diez salían de la misma sesión y la
// misma base, así que las fallas realistas (permisos, red, saturación) las voltean juntas de todos
// modos. Lo que sí se conserva es la distinción que importa: CERO FILAS POR RLS NO ES UN ERROR.
// `ve_economia()` le devuelve `[]` al jefe de obra en `cobrado_por_obra` y `economia_clientes`, y
// eso llega como lista vacía, no como `null` — la pantalla no dibuja esas columnas para su rol y no
// tiene que confundir «no te toca» con «no pude leer».

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from '@/features/auth/types'
import type { ClientePanel, ObraDePanel } from '@/features/clientes/types'
import { armarClientes, armarObrasPorCliente } from '../../clientes/services/clientesFilas.ts'
import { armarEconomiaDeObras, type EconomiaDeObra } from '../../clientes/services/economiaObras.ts'
import {
  armarEconomiaDeClientes, type EconomiaDeCliente,
} from '../../clientes/services/economiaCliente.ts'
import { armarPapelesDeLaCartera } from '../../clientes/services/ordenesCliente.ts'
import type { PapelesDelCliente } from '../../clientes/services/papelesCliente.ts'
import {
  armarCobradoPorObra, type CobroPorObra, type FilaCertificado, type ObraDeCartera,
} from './homeCartera.ts'

/** Todo lo que `/clientes` necesita, ya convertido a los tipos que consumen los componentes. */
export interface CarteraLeida {
  /** `null` = la lectura falló, con el mensaje en `error`. */
  clientes: ClientePanel[] | null
  error: string | null
  /** Quién mira. Viene en el mismo viaje: el rol decide qué columnas se dibujan. */
  perfil: Perfil | null
  obras: ObraDeCartera[] | null
  /**
   * LO COBRADO POR OBRA, de `public.obra_cuenta`: la fila de la pestaña OBRAS traducida a Postgres
   * —contrato, cobro con IVA, saldo, vencido con el reloj de la emisión + 30 días y el próximo
   * cobro con su medio—. La pantalla NO resta ninguno de esos números: esa resta hecha en el
   * cliente era la segunda definición de «lo que falta cobrar». `null` = no se pudo leer; vacío =
   * el rol no ve economía, que no es lo mismo que «no debe nada».
   */
  cobrado: CobroPorObra | null
  certificados: FilaCertificado[] | null
  todasLasObras: Map<string, ObraDePanel[]>
  papeles: { porCliente: Map<string, PapelesDelCliente>; fallo: boolean }
  economia: Map<string, EconomiaDeObra> | null
  contratos: Set<string> | null
  economiaCliente: Map<string, EconomiaDeCliente> | null
}

/** La forma cruda que devuelve la RPC. Es JSON: nada garantiza los tipos, por eso se leen como
 *  `unknown` y las conversiones son las mismas que las del camino de PostgREST. */
interface CarteraCruda {
  perfil: Perfil | null
  clientes: unknown[]
  obras_activas: unknown[]
  obras_todas: unknown[]
  cobrado_por_obra: unknown[]
  certificados: unknown[]
  papeles: unknown[]
  economia_obras: unknown[]
  contratos: string[]
  economia_clientes: unknown[]
}

/** Lo que se devuelve cuando el viaje falló: nada afirmado, ni una lista vacía que se lea como
 *  «no hay». Las listas que la pantalla no distingue (papeles, panel lateral) llevan su marca. */
function nadaLeido(error: string): CarteraLeida {
  return {
    clientes: null, error, perfil: null, obras: null, cobrado: null, certificados: null,
    todasLasObras: new Map(), papeles: { porCliente: new Map(), fallo: true },
    economia: null, contratos: null, economiaCliente: null,
  }
}

/**
 * UN VIAJE. Devuelve exactamente las mismas estructuras que las diez llamadas que reemplaza.
 *
 * `disponible: true` en lo cobrado NO es un supuesto: el cuerpo de `pantalla_clientes()` nombra
 * `public.obra_cuenta`, que reparte el cobro por obra POR CONSTRUCCIÓN —sale de
 * `cobranza_imputacion`—: si la función pudo correr, la base sabe repartir. La regla de «todo o
 * nada» del dueño sigue siendo la misma y ahora su respuesta es sí.
 */
export async function leerCarteraDeUnaConsulta(supabase: SupabaseClient): Promise<CarteraLeida> {
  const { data, error } = await supabase.rpc('pantalla_clientes')
  if (error) return nadaLeido(error.message)
  if (!data) return nadaLeido('La base no devolvió la cartera.')
  const j = data as CarteraCruda
  return {
    clientes: armarClientes(j.clientes ?? []),
    error: null,
    perfil: j.perfil ?? null,
    obras: (j.obras_activas ?? []) as ObraDeCartera[],
    cobrado: armarCobradoPorObra(j.cobrado_por_obra ?? [], true),
    certificados: (j.certificados ?? []) as FilaCertificado[],
    todasLasObras: armarObrasPorCliente(j.obras_todas ?? []),
    papeles: { porCliente: armarPapelesDeLaCartera(j.papeles ?? []), fallo: false },
    economia: armarEconomiaDeObras(j.economia_obras ?? []),
    contratos: new Set(j.contratos ?? []),
    economiaCliente: armarEconomiaDeClientes(j.economia_clientes ?? []),
  }
}
