// LA LECTURA DEL MÓDULO — una sola, para todas las pantallas de Herramientas.
//
// El parque es chico (178 herramientas y 6 rodados el 21/09/2026): se lee entero y cada pantalla lo
// mira distinto. Pedirlo por pedazos obligaría a cada pantalla a rearmar «dónde está» y «quién la
// movió» con su propia consulta, que es como nacen dos versiones del mismo dato.
//
// ═══ SIN LA MIGRACIÓN, NO HAY CERO ═══
// Si `activo` no existe todavía (PGRST205 / 42P01) el resultado es `falta_migracion` y la pantalla lo
// dice. Nunca `ok` con listas vacías.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { armarParque, type Parque } from '../logica/parque'
import { faltaMigracion } from '../logica/falta-migracion'
import { COLUMNAS_PAPEL, type Papel } from '../logica/papeles'
import { COLUMNAS_RECUENTO, COLUMNAS_RECUENTO_LINEA, type Recuento, type RecuentoLinea } from '../logica/recuento'
import { COLUMNAS_REVISION, COLUMNAS_REVISION_VIGENTE, type Revision, type RevisionVigente } from '../logica/revision'
import { COLUMNAS_UNIDAD, type Unidad } from '../logica/unidades'
import { nombresDeUsuariosPlano } from '../../../shared/personas/nombresDeUsuarios.ts'
import { nombreDePersona } from '../../../shared/personas/nombre.ts'
import {
  COLUMNAS_ACTIVO, COLUMNAS_AJUSTE, COLUMNAS_EXISTENCIA, COLUMNAS_INCIDENCIA, COLUMNAS_LECTURA, COLUMNAS_MOVIMIENTO, COLUMNAS_PROVEEDOR_LUGAR, COLUMNAS_UBICACION,
  type Activo, type Ajuste, type Existencia, type Incidencia, type LecturaUso, type Movimiento, type ObraIndice, type ProveedorLugar, type Ubicacion,
} from '../types'
import { nombresDeClientes } from '../../../shared/clientes/nombresDeClientes.ts'

export type Lectura =
  | { estado: 'ok'; parque: Parque; obras: ObraIndice[]; yo: { id: string | null; nombre: string | null } }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

const TOPE = 10_000

async function leerObras(supabase: SupabaseClient): Promise<ObraIndice[]> {
  const [obras, codigos, clientes] = await Promise.all([
    supabase.from('obra_canonica').select('id, nombre, estado, cliente_id').is('fusionada_en', null),
    codigosDeObra(supabase, null),
    nombresDeClientes(supabase),
  ])
  const nombreCliente = clientes
  return ((obras.data ?? []) as { id: string; nombre: string | null; estado: string | null; cliente_id: string | null }[]).map((o) => ({
    id: o.id,
    codigo: codigos.get(o.id) ?? null,
    nombre: o.nombre,
    estado: o.estado,
    cliente: o.cliente_id ? (nombreCliente.get(o.cliente_id) ?? null) : null,
  }))
}

/** Nombres de quienes operaron (sólo los que la sesión puede ver por RLS de `personas`). */
async function nombresDePersonas(supabase: SupabaseClient, lecs: LecturaUso[] | null): Promise<Record<string, string>> {
  const ids = [...new Set((lecs ?? []).map((l) => l.operador_persona_id).filter((x): x is string => !!x))]
  if (!ids.length) return {}
  const { data } = await supabase.from('personas').select('id, nombre_completo, nombre_para_mostrar').in('id', ids)
  const out: Record<string, string> = {}
  for (const p of (data ?? []) as { id: string; nombre_completo: string | null }[]) if (p.nombre_completo) out[p.id] = p.nombre_completo
  return out
}

/** Las personas que pueden operar una máquina (M13 «Quién la opera»): las de la empresa que la sesión ve. */
export async function leerOperadores(): Promise<{ id: string; nombre: string }[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('personas').select('id, nombre_completo, nombre_para_mostrar')
      .eq('en_la_empresa', true).order('nombre_completo').limit(500)   // las de prueba las esconde la RLS de personas
    return ((data ?? []) as { id: string; nombre_completo: string | null }[])
      .filter((p) => p.nombre_completo).map((p) => ({ id: p.id, nombre: nombreDePersona(p) }))
  } catch {
    return []
  }
}

function numerosDeRevision<T extends Revision>(r: T): T {
  return { ...r, lectura: r.lectura == null ? null : Number(r.lectura), costo: r.costo == null ? null : Number(r.costo) }
}

export async function leerParque(): Promise<Lectura> {
  try {
    const supabase = await createClient()
    const [activos, ubicaciones, movimientos, incidencias, obras, nombresUsuarios, usuario, categorias, lecturas, existencias, ajustes, papeles, unidades, revisiones, vigentes, recuentos, recuentoLineas, proveedores] = await Promise.all([
      supabase.from('activo').select(COLUMNAS_ACTIVO).order('codigo').limit(TOPE),
      supabase.from('ubicacion').select(COLUMNAS_UBICACION).limit(TOPE),
      supabase.from('activo_movimiento').select(COLUMNAS_MOVIMIENTO).order('fecha_hora', { ascending: false }).limit(TOPE),
      supabase.from('activo_incidencia').select(COLUMNAS_INCIDENCIA).order('creado_en', { ascending: false }).limit(TOPE),
      leerObras(supabase),
      nombresDeUsuariosPlano(supabase),
      getUsuarioActual(supabase),
      supabase.from('activo_categoria').select('nombre').order('orden'),
      supabase.from('activo_lectura_uso').select(COLUMNAS_LECTURA).order('fecha_hora', { ascending: false }).limit(TOPE),
      supabase.from('activo_existencia').select(COLUMNAS_EXISTENCIA).limit(TOPE),
      supabase.from('activo_ajuste').select(COLUMNAS_AJUSTE).order('creado_en', { ascending: false }).limit(TOPE),
      supabase.from('activo_papel_vigente').select(COLUMNAS_PAPEL).limit(TOPE),
      supabase.from('activo_unidad').select(COLUMNAS_UNIDAD).order('codigo').limit(TOPE),
      supabase.from('activo_revision').select(COLUMNAS_REVISION).order('fecha', { ascending: false }).limit(TOPE),
      supabase.from('activo_revision_vigente').select(COLUMNAS_REVISION_VIGENTE).limit(TOPE),
      supabase.from('activo_recuento').select(COLUMNAS_RECUENTO).order('iniciado_en', { ascending: false }).limit(TOPE),
      supabase.from('activo_recuento_linea').select(COLUMNAS_RECUENTO_LINEA).limit(TOPE),
      // Un servicio técnico es un proveedor (20260923T2400): el lugar toma su nombre de acá.
      supabase.from('proveedores').select(COLUMNAS_PROVEEDOR_LUGAR).eq('activo', true).order('nombre').limit(TOPE),
    ])
    // Las unidades con código (20260923T1500) y la revisión (20260923T1510): sin esas tablas el resto del
    // módulo anda igual y la ficha dice «sin la migración», nunca «ninguna» ni «al día».
    // El recuento físico del lugar (20260923T1700) igual: sin sus tablas, «sin la migración».
    for (const r of [unidades, revisiones, vigentes, recuentos, recuentoLineas]) if (r.error && !faltaMigracion(r.error)) return { estado: 'error', mensaje: r.error.message }
    // Las existencias por lugar son de 20260922T1300: sin esa tabla, cada activo está entero en su lugar.
    if (existencias.error && !faltaMigracion(existencias.error)) return { estado: 'error', mensaje: existencias.error.message }
    for (const r of [activos, ubicaciones, movimientos, incidencias]) {
      if (faltaMigracion(r.error)) return { estado: 'falta_migracion' }
      if (r.error) return { estado: 'error', mensaje: r.error.message }
    }
    // Quién movió algo: el nombre de su persona, resuelto por el vínculo (src/shared/personas).
    const nombres: Record<string, string> = nombresUsuarios
    const perfil = usuario ? await getPerfilActual(supabase, usuario.id) : null
    // La verificación de uso es de 20260922T1200: si esa tabla todavía no existe, el resto del módulo
    // anda igual y la verificación dice «sin la migración» (null), nunca «nunca».
    if (lecturas.error && !faltaMigracion(lecturas.error)) return { estado: 'error', mensaje: lecturas.error.message }
    // Los papeles son de 20260922T2400: sin esa vista la pantalla dice «sin cargar», que es la verdad.
    if (papeles.error && !faltaMigracion(papeles.error)) return { estado: 'error', mensaje: papeles.error.message }
    const lecs = lecturas.error ? null : ((lecturas.data ?? []) as unknown as LecturaUso[]).map((l) => ({
      ...l, lectura: l.lectura == null ? null : Number(l.lectura),
    }))
    const personas = await nombresDePersonas(supabase, lecs)
    return {
      estado: 'ok',
      obras,
      parque: armarParque({
        activos: (activos.data ?? []) as unknown as Activo[],
        ubicaciones: (ubicaciones.data ?? []) as unknown as Ubicacion[],
        movimientos: (movimientos.data ?? []) as unknown as Movimiento[],
        incidencias: (incidencias.data ?? []) as unknown as Incidencia[],
        obras,
        nombres,
        proveedores: proveedores.error ? [] : ((proveedores.data ?? []) as unknown as ProveedorLugar[]),
        categorias: ((categorias.data ?? []) as { nombre: string }[]).map((c) => c.nombre),
        lecturas: lecs,
        personas,
        existencias: existencias.error ? undefined : ((existencias.data ?? []) as unknown as Existencia[]),
        ajustes: ajustes.error ? [] : ((ajustes.data ?? []) as unknown as Ajuste[]),
        papeles: papeles.error ? null : ((papeles.data ?? []) as unknown as Papel[]).map((p) => ({
          ...p, dias: p.dias == null ? null : Number(p.dias),
        })),
        unidades: unidades.error ? null : ((unidades.data ?? []) as unknown as Unidad[]),
        // `lectura` y `costo` son numeric: PostgREST los manda como string; se normalizan al leer.
        revisiones: revisiones.error ? null : ((revisiones.data ?? []) as unknown as Revision[]).map(numerosDeRevision),
        revisionesVigentes: vigentes.error ? null : ((vigentes.data ?? []) as unknown as RevisionVigente[]).map((r) => ({
          ...numerosDeRevision(r), dias: r.dias == null ? null : Number(r.dias),
        })),
        recuentos: recuentos.error ? null : ((recuentos.data ?? []) as unknown as Recuento[]),
        recuentoLineas: recuentoLineas.error ? null : ((recuentoLineas.data ?? []) as unknown as RecuentoLinea[]),
      }),
      yo: { id: usuario?.id ?? null, nombre: (usuario?.id && nombresUsuarios[usuario.id]) || perfil?.data?.nombre || null },
    }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
