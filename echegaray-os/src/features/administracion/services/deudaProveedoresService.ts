// LA LECTURA DE «A QUIÉN LE DEBO» — seis consultas, ninguna por fila.
//
// La regla vive en `deudaProveedores.ts` y se prueba sin base. Acá sólo se juntan las piezas:
//
//   `compra_sheet`               las compras con saldo vivo. La réplica de la pestaña Compras, que
//                                es la fuente de lo que se debe. Se filtra EN POSTGRES por saldo y
//                                por anulada: traer las 969 filas para descartar 927 en memoria es
//                                pagar el viaje entero por 42 filas.
//   `proveedor_nombre_resuelto`  quién es el texto libre de Compras. El mismo puente que usan
//                                `proveedor_deuda` y `proveedor_papel`: una segunda normalización
//                                repartiría la deuda de un proveedor entre dos fichas.
//   `proveedor_deuda`            el TOTAL canónico por proveedor, sólo para cotejar. No es la
//                                fuente de la tabla: no sabe separar vencido de por vencer.
//   `proveedor_notas` + cola      la nota «Qué hacer» de cada proveedor y lo pedido que espera al
//                                Sheet (`notasDeDeuda.ts`).
//   `obra_panel`                 el nombre de la obra. `obra_canonica` no es legible por
//                                `authenticated` y `obra_celda` trae el rótulo CON el código
//                                interno («OB-0007 · LE - GALPÓN 9»), que el dueño pidió no ver.
//
// El orden de las dos primeras es indistinto y viajan juntas. La de obras va después porque su
// lista de ids sale de las compras ya leídas — es el único encadenamiento, y sobre ≤ 50 filas.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from './comprasSheetService.ts'
import {
  deudaPorProveedor, hoyISO, lineasDeDeuda,
  type CompraConSaldo, type DeudaDeProveedor, type LineaDeuda, type ProveedorResuelto,
} from './deudaProveedores.ts'
import { notasDeLaDeuda, type NotaDeProveedor, type NotaGuardada, type PedidoDeNota } from './notasDeDeuda.ts'

/** Techo de filas con saldo. Si se alcanza, la pantalla lo dice en vez de publicar una deuda corta. */
export const TOPE_DEUDA = 500

export interface DeudaLeida {
  filas: DeudaDeProveedor[]
  lineas: LineaDeuda[]
  /** `obra_id` → nombre de la obra, sin código interno. Un id que no está no se rellena. */
  obras: Map<string, string>
  /** `proveedor_id` → deuda de `public.proveedor_deuda`. Vacío = no se pudo leer: no se coteja. */
  canonica: Map<string, number>
  /** El día contra el que se decidió qué está vencido. Va en la pantalla: el corte se declara. */
  hoy: string
  /** `true` = hay más filas con saldo de las que se leyeron. */
  truncado: boolean
  /** Clave de la fila → su nota «Qué hacer». Vacío = no se pudo leer (o la migración 20260917T1400 no está). */
  notas: Map<string, NotaDeProveedor>
}

const COLUMNAS = [
  'fila', 'proveedor', 'cuit', 'fecha', 'comprobante', 'concepto', 'total', 'fecha_prevista',
  'fecha_prevista_2', 'monto_pagado', 'monto_parcial_2', 'saldo_pendiente', 'estado', 'estado_pago',
  'tramo_vencimiento', 'anulada', 'obra_id',
].join(', ')

export async function getDeuda(
  supabase: SupabaseClient, hoy: string = hoyISO(),
): Promise<ServiceResult<DeudaLeida>> {
  const [compras, resueltos, canon, notasLeidas, pedidos] = await Promise.all([
    supabase.from('compra_sheet').select(COLUMNAS)
      .gt('saldo_pendiente', 0).not('anulada', 'is', true)
      .order('fecha_prevista', { ascending: true, nullsFirst: false })
      .limit(TOPE_DEUDA + 1),
    supabase.from('proveedor_nombre_resuelto').select('nombre_norm, proveedor_id, proveedor_nombre, estado'),
    supabase.from('proveedor_deuda').select('proveedor_id, deuda'),
    // LAS NOTAS Y SU COLA, en el mismo viaje. Si fallan (sin grant hasta 20260917T1400/T1410), la deuda
    // se dibuja igual y sin notas: una lectura accesoria no esconde lo que se debe.
    supabase.from('proveedor_notas').select('clave, nota, actualizado_en'),
    supabase.from('proveedor_nota_cambio').select('clave, nota_nueva, estado, motivo, creado_at')
      .order('creado_at', { ascending: false }).limit(200),
  ])
  if (compras.error) return { data: null, error: compras.error.message }

  const leidas = (compras.data ?? []) as unknown as CompraConSaldo[]
  const truncado = leidas.length > TOPE_DEUDA
  const visibles = truncado ? leidas.slice(0, TOPE_DEUDA) : leidas

  // NO SE PUDO RESOLVER ⇒ MAPA VACÍO, NO ERROR. Sin el puente, cada texto de Compras arma su propia
  // fila con su grafía: la deuda se sigue viendo entera y lo único que se pierde es el enlace a la
  // ficha. Esconder la tabla porque falló una lectura accesoria publicaría una deuda de cero.
  const puente = new Map<string, ProveedorResuelto>()
  for (const r of ((resueltos.data ?? []) as unknown as ProveedorResuelto[])) {
    if (r.nombre_norm) puente.set(r.nombre_norm, r)
  }

  const lineas = lineasDeDeuda(visibles, puente, hoy)
  const filas = deudaPorProveedor(lineas, puente, visibles)

  const canonica = new Map<string, number>()
  for (const f of ((canon.data ?? []) as unknown as { proveedor_id: string; deuda: number | string }[])) {
    if (f.proveedor_id) canonica.set(f.proveedor_id, Number(f.deuda ?? 0))
  }

  // SIN LECTURA DE NOTAS NO HAY EDITOR: un campo vacío sobre una nota que no se pudo leer se lee como
  // «no hay nota», y guardar encima sería pedir un cambio contra algo que nadie vio.
  const notas = notasLeidas.error ? new Map() : notasDeLaDeuda({
    filas, lineas, compras: visibles,
    notas: (notasLeidas.data ?? []) as unknown as NotaGuardada[],
    pedidos: pedidos.error ? [] : (pedidos.data ?? []) as unknown as PedidoDeNota[],
  })
  return { data: { filas, lineas, obras: await nombresDeLasObras(supabase, lineas), canonica, hoy, truncado, notas }, error: null }
}

/**
 * EL NOMBRE DE LA OBRA, SIN EL CÓDIGO INTERNO (dueño, 16/09/2026).
 *
 * `nombresDeObra` de clientes devuelve «OB-0007 · LE - GALPÓN 9» —el rótulo con código que el CRM
 * necesita para no confundir dos obras del mismo cliente—, y acá el pedido fue explícito: el
 * nombre. Se lee de `obra_panel`, que es la vista legible por `authenticated`.
 *
 * Un error de lectura devuelve un Map VACÍO y la celda queda sin obra: un nombre de relleno en una
 * fila de deuda se lee como la obra real a la que se le está cargando el gasto.
 */
async function nombresDeLasObras(supabase: SupabaseClient, lineas: LineaDeuda[]): Promise<Map<string, string>> {
  const ids = [...new Set(lineas.map((l) => l.obraId).filter((id): id is string => !!id))]
  if (!ids.length) return new Map()
  const { data, error } = await supabase.from('obra_panel').select('obra_id, nombre').in('obra_id', ids)
  if (error || !data) return new Map()
  return new Map((data as unknown as { obra_id: string; nombre: string | null }[])
    .filter((o) => o.obra_id && o.nombre)
    .map((o) => [o.obra_id, o.nombre as string]))
}
