import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Cliente,
  ClienteInput,
  CuentaFinanciera,
  CuentaFinancieraInput,
  Proveedor,
  ProveedorInput,
} from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getClientes(supabase: SupabaseClient): Promise<ServiceResult<Cliente[]>> {
  try {
    const { data, error } = await supabase.from('clientes').select('*').order('nombre')
    if (error) return { data: null, error: error.message }
    return { data: data as Cliente[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertCliente(
  supabase: SupabaseClient,
  input: ClienteInput
): Promise<ServiceResult<Cliente>> {
  try {
    const { data, error } = await supabase.from('clientes').insert(input).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as Cliente, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getCuentasFinancieras(
  supabase: SupabaseClient
): Promise<ServiceResult<CuentaFinanciera[]>> {
  try {
    const { data, error } = await supabase.from('cuentas_financieras').select('*').order('nombre')
    if (error) return { data: null, error: error.message }
    return { data: data as CuentaFinanciera[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertCuentaFinanciera(
  supabase: SupabaseClient,
  input: CuentaFinancieraInput
): Promise<ServiceResult<CuentaFinanciera>> {
  try {
    const { data, error } = await supabase.from('cuentas_financieras').insert(input).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as CuentaFinanciera, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getProveedores(supabase: SupabaseClient): Promise<ServiceResult<Proveedor[]>> {
  try {
    const { data, error } = await supabase.from('proveedores').select('*').order('nombre')
    if (error) return { data: null, error: error.message }
    return { data: data as Proveedor[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertProveedor(
  supabase: SupabaseClient,
  input: ProveedorInput
): Promise<ServiceResult<Proveedor>> {
  try {
    const { data, error } = await supabase.from('proveedores').insert(input).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as Proveedor, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
