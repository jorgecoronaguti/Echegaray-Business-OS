import { EstadoNoEncontrado } from '@/shared/components/estado'

// EL PRESUPUESTO NO EXISTE — y eso NO es lo mismo que no poder leerlo.
//
// La página separa los dos casos: si la lectura falla, dibuja el error con el mensaje de la base;
// sólo llama a `notFound()` cuando la consulta anduvo y no devolvió fila. Acá la distinción es
// crítica: todo el módulo está detrás de `ve_economia()`, así que «no aparece» puede ser un permiso
// y no una ausencia. Por eso la última línea del cartel lo dice.
//
// Y la dirección lleva el `id`, no el número: un enlace a la versión 3 de un presupuesto sigue
// siendo válido cuando nace la 4 — pero deja de serlo si alguien borró esa versión.
export default function NoEncontrado() {
  return (
    <EstadoNoEncontrado
      entidad="ese presupuesto"
      volver={{ href: '/presupuestos', texto: 'Presupuestos' }}
      detalle="Ningún presupuesto responde a esa dirección. Puede ser una versión que se reemplazó, o un enlace de antes."
    />
  )
}
