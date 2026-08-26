// QUÉ CUENTAS SE VEN — el recorte de la lista de usuarios, sin React y sin base.
//
// Vivía dentro de `UsuariosManager.tsx`, el componente de cliente que el v2 retiró. Se mudó a un
// `.ts` porque es una REGLA —qué cuenta como «de Administración», qué cuenta como «sin acceso»— y
// una regla se prueba sin montar React.
//
// ═══ UNA CUENTA SIN ACCESO NO CUENTA COMO PARTE DE SU ÁREA ═══
//
// No ve nada, esté donde esté. Contarla en «Administración» diría que hay una persona más mirando
// la economía de la empresa que las que hay de verdad, y ése es justo el número por el que se abre
// esta pantalla.

import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import type { UsuarioGestion } from '../types.ts'

export type Filtro = 'todos' | 'administracion' | 'obras' | 'sin_acceso'

export const FILTROS: readonly { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'administracion', label: 'Administración' },
  { value: 'obras', label: 'Obras' },
  { value: 'sin_acceso', label: 'Sin acceso' },
]

export function esFiltro(v: unknown): v is Filtro {
  return typeof v === 'string' && FILTROS.some((f) => f.value === v)
}

export function coincide(u: UsuarioGestion, texto: string, filtro: Filtro): boolean {
  const enTexto = contieneEnAlguno([u.nombre, u.email], texto)
  const enFiltro
    = filtro === 'todos' ? true
      : filtro === 'sin_acceso' ? u.estado === 'sin_acceso'
        // Una cuenta sin acceso no cuenta como parte de su área: no ve nada, esté donde esté.
        : u.area === filtro && u.estado === 'activo'
  return enTexto && enFiltro
}
