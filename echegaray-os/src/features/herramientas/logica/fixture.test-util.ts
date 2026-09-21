// Filas de prueba con la forma de la migración 20260921T2100. Sólo para tests.
import type { Activo, Incidencia, Movimiento, Ubicacion } from '../types.ts'

export function activo(p: Partial<Activo> & Pick<Activo, 'id' | 'codigo' | 'nombre'>): Activo {
  return {
    clase: 'herramienta', categoria: null, patente: null, numero_serie: null, foto_url: null,
    compra_fecha: null, compra_precio: null, ubicacion_id: null, estado: 'operativo', estado_nota: null,
    estado_desde: '2026-09-01T12:00:00Z', estado_por: null, estado_asumido: false, baja_motivo: null,
    baja_detalle: null, baja_en: null, alta_desde_obra: false, etiqueta_impresa_en: null, legado_id: null,
    creado_en: '2026-01-01T12:00:00Z',
    ...p,
  }
}

export function ubicacion(p: Partial<Ubicacion> & Pick<Ubicacion, 'id' | 'tipo'>): Ubicacion {
  return { nombre: null, obra_id: null, activo_id: null, contacto: null, archivada: false, ...p }
}

export function mov(p: Partial<Movimiento> & Pick<Movimiento, 'id' | 'activo_id' | 'destino_id' | 'fecha_hora'>): Movimiento {
  return { origen_id: null, usuario_id: null, usuario_texto: null, lote_id: null, nota: null, corrige_a: null, importado: false, ...p }
}

export function inc(p: Partial<Incidencia> & Pick<Incidencia, 'id' | 'activo_id' | 'creado_en'>): Incidencia {
  return { tipo: 'fallando', texto: null, foto_url: null, ubicacion_id: null, estado_resultante: 'requiere_mantenimiento', usuario_id: null, cerrada_en: null, ...p }
}
