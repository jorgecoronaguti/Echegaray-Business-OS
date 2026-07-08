import type { AlertaDashboard, CategoriaAlerta } from '@/features/dashboard/types'

// Fase II — Arquitectura Operativa por Áreas + Centro de Acción.
// Este archivo es puro mapeo/normalización: no calcula ninguna alerta nueva, solo
// clasifica las que cada capacidad ya produce (vía el Dashboard, PRP-011) en el área
// de gestión responsable. Cero SQL nuevo, cero duplicación de lógica de negocio.

export type AreaOS =
  | 'direccion'
  | 'obras_produccion'
  | 'administracion_finanzas'
  | 'compras_abastecimiento'
  | 'personas_productividad'
  | 'comercial_presupuestacion'

export const AREAS_OS: AreaOS[] = [
  'direccion',
  'obras_produccion',
  'administracion_finanzas',
  'compras_abastecimiento',
  'personas_productividad',
  'comercial_presupuestacion',
]

export const AREA_LABEL: Record<AreaOS, string> = {
  direccion: 'Dirección',
  obras_produccion: 'Obras / Producción',
  administracion_finanzas: 'Administración y Finanzas',
  compras_abastecimiento: 'Compras y Abastecimiento',
  personas_productividad: 'Personas y Productividad',
  comercial_presupuestacion: 'Comercial / Presupuestación',
}

export const AREA_RUTA: Record<AreaOS, string> = {
  direccion: '/dashboard',
  obras_produccion: '/obras',
  administracion_finanzas: '/administracion',
  compras_abastecimiento: '/compras',
  personas_productividad: '/personas',
  comercial_presupuestacion: '/comercial',
}

// Cada categoría de alerta del Dashboard tiene un área responsable principal. Es una
// simplificación deliberada (una alerta puede interesarle a más de un área en la
// realidad, ej. un adicional sin cotizar le importa también a Administración) — se
// asigna al área que hoy tiene la responsabilidad operativa de resolverla primero.
export const AREA_POR_CATEGORIA: Record<CategoriaAlerta, AreaOS> = {
  control_economico: 'direccion',
  adicionales: 'obras_produccion',
  ejecucion_financiera: 'administracion_finanzas',
  hh: 'personas_productividad',
  compras: 'compras_abastecimiento',
  obligaciones: 'administracion_finanzas',
  actividad_obra: 'obras_produccion',
  posicion_caja: 'administracion_finanzas',
}

export function areaDeAlerta(alerta: AlertaDashboard): AreaOS {
  return AREA_POR_CATEGORIA[alerta.categoria]
}

export function alertasPorArea(alertas: AlertaDashboard[], area: AreaOS): AlertaDashboard[] {
  return alertas.filter((a) => areaDeAlerta(a) === area)
}
