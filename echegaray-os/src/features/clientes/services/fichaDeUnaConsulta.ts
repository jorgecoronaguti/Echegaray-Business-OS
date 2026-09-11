// LAS QUINCE LECTURAS DE LA FICHA DEL CLIENTE, EN UN VIAJE.
//
// ═══ NO ERAN QUINCE CONSULTAS: ERAN TRES OLAS ═══
//
// Medido con `PERF_TRAZA=1` el 10/09/2026 sobre `/clientes/messina`: 24 viajes por navegación —seis
// de la campanita, dos de la solapa, quince de la ficha—, y los quince NO salían juntos:
//
//   1ª  la ficha y el perfil
//   2ª  responsables · contactos · obras · economía de obras · economía del cliente · papeles ·
//       presupuestos · documentos, y adentro de «actividad» otras cinco
//   3ª  `drive_index` (necesita los ids que devuelve `cliente_documento`) y `certificados`
//       (necesita las obras). No compiten: ESPERAN.
//
// El costo dominante es el arranque en frío por CONEXIÓN —~800 ms de catálogo la primera vez que un
// backend ve las vistas anidadas del OS—, y quince consultas pueden caer en quince backends del
// pool. Las dos de la tercera ola son peores: además de poder estrenar conexión, empiezan cuando la
// segunda terminó. Adentro de un solo cuerpo SQL esa dependencia es una subconsulta y deja de
// costar un viaje.
//
// ═══ LA RPC TRANSPORTA; LOS CRUCES SIGUEN EN TYPESCRIPT ═══
//
// Los tres cruces que la ficha hace en memoria tienen una decisión adentro y por eso NO se
// convirtieron en `join`:
//
//   · vínculo de Drive + archivo → si el índice no conoce el archivo, se publica el vínculo con el
//     nombre en `null` en vez de perder la fila (el índice se rehace cada 4 horas).
//   · nota + autor → si el perfil ya no está, la nota queda SIN FIRMA en vez de perderse.
//   · certificado + obra → sin obra, «obra sin identificar».
//
// Un `left join` los reproduciría hoy y se separaría el día que alguien lo toque. Las listas viajan
// separadas, exactamente como viajaban, y las cruzan las MISMAS funciones que usa el camino de
// PostgREST (`armarDocumentosCliente`, `armarNotasCliente`, `armarFuentesActividad`).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from '@/features/auth/types'
import type {
  ClientePanel, Contacto, DocumentoCliente, LineaDeTiempo, Responsable,
} from '../types'
import type { ObraPanel } from '@/features/obras/types'
import type { PresupuestoCascada } from '@/features/presupuestos/types'
import {
  armarDocumentosCliente, armarFuentesActividad, armarNotasCliente, normalizar,
} from './clientesFilas.ts'
import { construirLineaDeTiempo } from './timeline.ts'
import { agruparPapeles, type PapelCrudo, type PapelesDelCliente } from './papelesCliente.ts'
import { armarEconomiaDeObras, type EconomiaDeObra } from './economiaObras.ts'
import { armarEconomiaDeCliente, type EconomiaDeCliente } from './economiaCliente.ts'
import {
  armarCobradoPorObra, type CobroPorObra,
} from '../../administracion/services/homeCartera.ts'
import { armarPresupuestos } from '@/features/presupuestos/services/presupuestosService'
import { papelesPorObra, type PapelDeObra, type PapelesDeUnaObra } from './papelesDeObra.ts'

/** Todo lo que la ficha necesita, ya en los tipos que consumen los componentes. */
export interface FichaLeida {
  /** `null` = la lectura falló (con `error`) o el cliente no existe (con `error` en `null`). */
  cliente: ClientePanel | null
  error: string | null
  perfil: Perfil | null
  responsables: Responsable[]
  contactos: Contacto[]
  obras: ObraPanel[]
  documentos: DocumentoCliente[]
  actividad: LineaDeTiempo | null
  presupuestos: PresupuestoCascada[]
  economia: Map<string, EconomiaDeObra> | null
  /** `null` = no se pudo leer, el rol no ve economía, o el cliente no tiene fila. */
  economiaCliente: EconomiaDeCliente | null
  /** `null` = la lectura falló. «No pude leerlos» nunca se dibuja como «no tiene ninguno». */
  papeles: PapelesDelCliente | null
  /**
   * CUÁNTOS VÍNCULOS A DRIVE TIENE EL CLIENTE, en las nueve caras.
   *
   * `documentos` viene VACÍO fuera de las caras Documentos y Actividad (94 KB de 199 que las otras
   * siete pagaban para nada, 20260911T1200), así que su `.length` ya no puede contar. La barra de
   * solapas usa ESTE número, que la RPC cuenta con el mismo `where` que las filas: sin él, recortar
   * el peso escribiría «Documentos · 0» sobre un cliente con 208 papeles.
   */
  nDocumentos: number
  /**
   * LO COBRADO POR TRABAJO (`public.obra_cuenta`), con la MISMA conversión que usa `/clientes`
   * (`armarCobradoPorObra`). Con una conversión propia acá, las dos pantallas del módulo volverían
   * a poder decir números distintos sobre la misma obra.
   */
  cobradoPorObra: CobroPorObra | null
  /**
   * LOS PAPELES DE DRIVE DE CADA OBRA, ya agrupados por categoría (dueño, 11/09/2026: «no encuentro
   * las cotizaciones, los documentos… que han conformado todas las obras»).
   *
   * VIENE VACÍO fuera de la cara Documentos, que es la única que los dibuja: son 226 filas en la
   * cartera entera. Una obra con entrada y `total: 0` es «no tiene papeles»; una obra SIN entrada no
   * tiene carpeta vinculada, y la pantalla lo dice distinto.
   */
  papelesObra: Map<string, PapelesDeUnaObra>
}

interface FichaCruda {
  cliente: Record<string, unknown> | null
  n_documentos: number | null
  perfil: Perfil | null
  responsables: Responsable[]
  contactos: Contacto[]
  obras: Record<string, unknown>[]
  economia_obras: unknown[]
  economia_cliente: Record<string, unknown> | null
  papeles: unknown[]
  documentos: unknown[]
  drive: unknown[]
  notas: unknown[]
  autores: unknown[]
  actividad_cliente: Record<string, unknown> | null
  certificados: unknown[]
  presupuestos: unknown[]
  cobrado_por_obra: unknown[]
  papeles_obra: unknown[]
  carpetas_obra: { obra_id: string }[]
}

function nadaLeido(error: string | null): FichaLeida {
  return {
    cliente: null, error, perfil: null, responsables: [], contactos: [], obras: [],
    documentos: [], actividad: null, presupuestos: [], economia: null, economiaCliente: null,
    papeles: null, cobradoPorObra: null, nDocumentos: 0, papelesObra: new Map(),
  }
}

/**
 * UN VIAJE. Devuelve las mismas estructuras que las quince llamadas que reemplaza.
 *
 * `cliente: null` con `error: null` es «no existe o no lo podés ver» —la pantalla hace `notFound()`
 * — y `cliente: null` con `error` es «no pude leer». Confundir los dos escondió un defecto de
 * permisos detrás de un «página no encontrada» durante horas, y por eso siguen separados.
 */
export async function leerFichaDeUnaConsulta(
  supabase: SupabaseClient, slug: string, solapa: string,
): Promise<FichaLeida> {
  // `p_solapa` NO ES UN PERMISO, ES UN RECORTE DE DIBUJO: dice qué va a pintar esta cara para no
  // transportar lo que ninguna otra mira. Quien recorta por rol sigue siendo la RLS adentro de las
  // vistas.
  //
  // LA FIRMA ACEPTA CUALQUIER TEXTO Y UN VALOR DESCONOCIDO RECIBE EL MÍNIMO, no la ficha entera
  // (fail-closed, verificado por el auditor de cierre el 11/09/2026). `solapaDe()` ya normaliza a
  // una de las nueve caras antes de llegar acá, así que en esta pantalla no puede pasar.
  const { data, error } = await supabase.rpc('pantalla_cliente', { p_slug: slug, p_solapa: solapa })
  if (error) return nadaLeido(error.message)
  const j = (data ?? {}) as FichaCruda
  if (!j.cliente) return nadaLeido(null)

  const notas = armarNotasCliente(j.notas ?? [], j.autores ?? [])
  return {
    // LA MISMA `normalizar` que aplica `getCliente`: sin ella, una vista que todavía no publique un
    // campo deja `undefined` colado en un tipo que promete `string | null`, y la pantalla decide por
    // comparación contra null y muestra cualquier cosa.
    cliente: normalizar(j.cliente),
    error: null,
    nDocumentos: j.n_documentos ?? 0,
    perfil: j.perfil ?? null,
    responsables: j.responsables ?? [],
    contactos: j.contactos ?? [],
    obras: (j.obras ?? []) as unknown as ObraPanel[],
    documentos: armarDocumentosCliente(j.documentos ?? [], j.drive ?? []),
    actividad: j.actividad_cliente
      ? construirLineaDeTiempo(armarFuentesActividad({
        ficha: j.actividad_cliente,
        obras: j.obras ?? [],
        contactos: j.contactos ?? [],
        documentos: j.documentos ?? [],
        archivosDeDrive: j.drive ?? [],
        notas,
        // La tabla de notas EXISTE: el cuerpo de la RPC la nombra, así que una respuesta exitosa lo
        // prueba. El aviso de «migración pendiente» ya no puede corresponder por este camino.
        notasNoDisponibles: null,
        certificados: j.certificados ?? [],
      }))
      : null,
    presupuestos: armarPresupuestos(j.presupuestos ?? []),
    economia: armarEconomiaDeObras(j.economia_obras ?? []),
    economiaCliente: j.economia_cliente ? armarEconomiaDeCliente(j.economia_cliente) : null,
    papeles: agruparPapeles((j.papeles ?? []) as PapelCrudo[]),
    // `disponible: true` no es un supuesto: `obra_cuenta` reparte el cobro por obra por
    // construcción (sale de `cobranza_imputacion`), así que una respuesta exitosa lo prueba.
    cobradoPorObra: armarCobradoPorObra(j.cobrado_por_obra ?? [], true),
    // LA COTIZACIÓN ACEPTADA NO SE DEDUCE DEL NOMBRE: la dice `obra_contrato`, que es el papel que
    // el OS ya leyó para escribir el precio, y viaja en `economia_obras.contrato_fuente_drive_id`.
    // «FINAL», «APROBADA» y «v2» conviven en la misma carpeta y ninguna de las tres palabras prueba
    // nada.
    papelesObra: papelesPorObra((j.papeles_obra ?? []) as PapelDeObra[], {
      obrasConCarpeta: new Set((j.carpetas_obra ?? []).map((c) => c.obra_id)),
      aceptadas: new Set(((j.economia_obras ?? []) as { contrato_fuente_drive_id?: string | null }[])
        .map((e) => e.contrato_fuente_drive_id).filter((x): x is string => !!x)),
    }),
  }
}
