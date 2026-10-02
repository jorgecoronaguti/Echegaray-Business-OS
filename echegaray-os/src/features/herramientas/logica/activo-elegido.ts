// QUÉ ACTIVO ES EL DE `?activo=` — puro, para que la pantalla y el test usen la misma regla.
//
// Por qué no alcanza `normalizarCodigo` + igualdad: esa función rellena a 4 cifras los prefijos del primer
// esquema (ROD, HER, EQU), pero la migración 20260922T0900 renumeró los códigos existentes a 3 cifras
// (`ROD-007`). `ROD-007` en la URL pasaba a `ROD-0007`, no coincidía con ningún activo y el panel no se
// montaba. La URL la genera la propia tabla con el código tal cual está en la base, así que primero manda
// la igualdad exacta; después, prefijo + número comparados como número, sin importar las cifras.
import { normalizarCodigo } from './codigo.ts'

const PARTES = /^([A-Z]{3})[\s_-]*0*(\d{1,4})$/

function clave(codigo: string): string | null {
  const m = PARTES.exec(codigo.trim().toUpperCase())
  return m ? `${m[1]}-${Number(m[2])}` : null
}

export function activoElegido<T extends { codigo: string }>(crudo: string | null | undefined, activos: readonly T[]): T | null {
  if (!crudo || !crudo.trim()) return null
  const exacto = crudo.trim().toUpperCase()
  const directo = activos.find((a) => a.codigo.toUpperCase() === exacto)
  if (directo) return directo
  const normal = normalizarCodigo(crudo)
  const porNormal = normal ? activos.find((a) => a.codigo === normal) : undefined
  if (porNormal) return porNormal
  const k = clave(crudo)
  return k ? activos.find((a) => clave(a.codigo) === k) ?? null : null
}
