// LOS SUB-RUBROS DE ESTRUCTURA — UNA SOLA DEFINICIÓN.
//
// POR QUÉ ESTÁN ACÁ Y NO ADENTRO DEL SCRIPT QUE LOS ESCRIBE (21/07). El auditor de reglas de oro
// verifica que ninguna fórmula del archivo use un sub-rubro que esta lista no conozca —un criterio
// escrito a mano devuelve $0 para siempre y ningún control de partición lo nota— y para eso tiene
// que poder leer la lista sin ejecutar el script que rehace la pestaña.
//
// EL ORDEN ES PARTE DE LA REGLA: gana el primero que matchea. "Equipos y rodados" va primero y
// aparte a propósito: una moto o una grúa NO son gasto del mes, son inversión. Mezclarlas con el
// combustible hace parecer que la estructura cuesta el doble.

export const SUBRUBROS = [
  ['Equipos y rodados (inversión)', 'compra moto|\\\\bmoto\\\\b|grua|pm1000|acoplado|camioneta'],
  ['Combustible', 'combustible|nafta|gasoil'],
  ['Vehículos y taller', 'arreglo|repuesto|neumatico|neumagom|bater|bujia|reparacion|lubricentro|camion|corta corriente|piñon|service|patente|seguro|\\\\bford\\\\b|toyota|mercedes|goldstein|hilux|amarok'],
  ['Insumos y ferretería', 'insumo|ferret|caño|freno|manguito|carretel|foco|aceite|amoladora|herramienta|cortina|bomba'],
  ['Honorarios y servicios', 'abogado|honorario|contador|google|servicio'],
  ['Oficina e informática', 'notebook|oficina|impresora|cartucho|papeler'],
  ['Ropa y seguridad', 'ropa de traba|casco|guante|calzado|seguridad'],
]
export const OTROS = 'Otros'
