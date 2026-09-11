import { SeccionEsqueleto } from '@/shared/components/carga'

// PRESUPUESTOS — la cartera, sin los datos.
//
// SIN BANDA DE ÁREA: es una solapa de NIVEL 1 (ver `presupuestos/layout.tsx`), así que no lleva la
// barra de Administración. Pero SÍ lleva la geometría del `Marco` del canon —`minHeight: 100vh`,
// fondo #F7F7F5, tabla a sangre con 20px de costado—, que es la que usa la pantalla real: con el
// ancho de lectura del `PageShell` el esqueleto dibujaba una tabla más angosta y centrada, y el
// contenido saltaba al llegar.
export default function Cargando() {
  return <SeccionEsqueleto cols={5} filas={7} anchoTitulo="w-40" vistas={2} banda={false} />
}
