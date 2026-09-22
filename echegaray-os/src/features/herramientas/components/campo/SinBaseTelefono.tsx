// Sin la migración 20260921T2100, el teléfono tampoco muestra un cero: dice qué falta.

import { MIGRACION } from '../../logica/falta-migracion'
import type { Lectura } from '../../services/datos'
import { V } from '../estilo'
import { MarcoTelefono } from './MarcoTelefono'

export function SinBaseTelefono({ lectura, volver = '/campo' }: { lectura: Exclude<Lectura, { estado: 'ok' }>; volver?: string }) {
  return (
    <MarcoTelefono titulo="Herramientas" volver={volver}>
      <div data-testid={lectura.estado === 'falta_migracion' ? 'falta-migracion' : 'error-herramientas'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '18px', fontWeight: 600 }}>
          {lectura.estado === 'falta_migracion' ? `El módulo espera la migración ${MIGRACION}` : 'No se pudo leer el inventario'}
        </div>
        <div style={{ fontSize: '13.5px', color: lectura.estado === 'falta_migracion' ? V.apagado : V.neg, lineHeight: 1.5 }}>
          {lectura.estado === 'falta_migracion'
            ? 'Cuando se aplique, las herramientas del listado aparecen solas. Hasta entonces no hay nada que mostrar: no es que no haya herramientas.'
            : lectura.mensaje}
        </div>
      </div>
    </MarcoTelefono>
  )
}
