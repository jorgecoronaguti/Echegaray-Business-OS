import type { AlertaDashboard, CategoriaAlerta } from '@/features/dashboard/types'

// Arquitectura Operativa por Áreas + Centro de Acción.
// Este archivo es puro mapeo/normalización: no calcula ninguna alerta nueva, solo
// clasifica las que cada capacidad ya produce (vía el Dashboard, PRP-011) en el área
// de gestión responsable. Cero SQL nuevo, cero duplicación de lógica de negocio.
//
// Las 8 áreas son la división REAL de la empresa definida por el dueño: Gestión General,
// Administración y Finanzas, Compras, Obras, Calidad, Comercial, Contabilidad y Legales, Personas.

export type AreaOS =
  | 'gestion_general'
  | 'administracion_finanzas'
  | 'compras'
  | 'obras'
  | 'calidad'
  | 'comercial'
  | 'contabilidad_legales'
  | 'personas'

export const AREAS_OS: AreaOS[] = [
  'gestion_general',
  'administracion_finanzas',
  'compras',
  'obras',
  'calidad',
  'comercial',
  'contabilidad_legales',
  'personas',
]

export const AREA_LABEL: Record<AreaOS, string> = {
  gestion_general: 'Gestión General',
  administracion_finanzas: 'Administración y Finanzas',
  compras: 'Compras',
  obras: 'Obras',
  calidad: 'Calidad',
  comercial: 'Comercial',
  contabilidad_legales: 'Contabilidad y Legales',
  personas: 'Personas',
}

export const AREA_RUTA: Record<AreaOS, string> = {
  gestion_general: '/dashboard',
  administracion_finanzas: '/administracion',
  compras: '/compras',
  obras: '/obras',
  // Calidad y Contabilidad y Legales son áreas nuevas todavía sin pantalla propia:
  // apuntan al dashboard hasta que se construya su feature (evita rutas rotas).
  calidad: '/dashboard',
  comercial: '/comercial',
  contabilidad_legales: '/dashboard',
  personas: '/personas',
}

// Cada categoría de alerta del Dashboard tiene un área responsable principal. Es una
// simplificación deliberada (una alerta puede interesarle a más de un área en la
// realidad, ej. un adicional sin cotizar le importa también a Administración) — se
// asigna al área que hoy tiene la responsabilidad operativa de resolverla primero.
export const AREA_POR_CATEGORIA: Record<CategoriaAlerta, AreaOS> = {
  control_economico: 'gestion_general',
  adicionales: 'obras',
  ejecucion_financiera: 'administracion_finanzas',
  hh: 'personas',
  compras: 'compras',
  obligaciones: 'administracion_finanzas',
  actividad_obra: 'obras',
  posicion_caja: 'administracion_finanzas',
  exposicion_financiera: 'administracion_finanzas',
  riesgo_operacion_financiero: 'obras',
}

export function areaDeAlerta(alerta: AlertaDashboard): AreaOS {
  return AREA_POR_CATEGORIA[alerta.categoria]
}

export function alertasPorArea(alertas: AlertaDashboard[], area: AreaOS): AlertaDashboard[] {
  return alertas.filter((a) => areaDeAlerta(a) === area)
}
