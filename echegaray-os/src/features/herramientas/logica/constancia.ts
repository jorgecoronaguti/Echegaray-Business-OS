// LA CONSTANCIA DE ENTREGA DE EPP Y ROPA (Res. SRT 299/2011, Anexo) — qué filas lleva el papel.
//
// Se arma desde lo que la persona TIENE hoy (`activo_existencia.persona_id`), no desde el historial: la
// constancia dice lo que el trabajador tiene en su poder y firma, y lo que ya devolvió o se dio de baja no
// está en su poder. Lo que la base no sabe (el certificado de cada elemento) NO se inventa: sale en blanco
// para completarlo a mano junto con la firma.

export interface ItemTenido {
  activoId: string
  codigo: string
  nombre: string
  talle: string | null
  clase: 'epp' | 'ropa'
  cantidad: number
  fecha: string | null
  yaLaTenia: boolean
  marca: string | null
  modelo: string | null
}

export interface FilaConstancia {
  activoId: string
  tipo: string
  descripcion: string
  marcaModelo: string | null
  talle: string | null
  cantidad: number
  /** Fecha de entrega (ISO). null = anterior al sistema o sin registro: el papel lo dice, no la inventa. */
  fecha: string | null
  anterior: boolean
}

export const TIPO_CONSTANCIA = { epp: 'EPP', ropa: 'Ropa de trabajo' } as const

/**
 * Las filas del papel: lo que tiene la persona, EPP primero y después ropa (el orden en que ya viene).
 * `seleccion` = los activos que se firman hoy; sin selección, todo lo que tiene.
 */
export function filasDeConstancia(tiene: readonly ItemTenido[], seleccion?: ReadonlySet<string>): FilaConstancia[] {
  return tiene
    .filter((t) => t.cantidad > 0 && (!seleccion || seleccion.has(t.activoId)))
    .map((t) => ({
      activoId: t.activoId,
      tipo: TIPO_CONSTANCIA[t.clase],
      descripcion: t.nombre,
      marcaModelo: [t.marca, t.modelo].filter(Boolean).join(' · ') || null,
      talle: t.talle,
      cantidad: t.cantidad,
      fecha: t.fecha,
      anterior: t.yaLaTenia || !t.fecha,
    }))
}
