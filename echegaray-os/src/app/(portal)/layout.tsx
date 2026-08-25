import './portal.css'

// EL MARCO DEL PORTAL DEL CLIENTE.
//
// ═══ ACÁ NO ENTRA LA NAVEGACIÓN DEL OS ═══
//
// Vive fuera de `(main)` por la misma razón que `(empleado)` y `/campo`: `(main)` monta `AppHeader`,
// que dibuja las dos áreas del ERP —Obras y Administración— y todas sus pantallas internas. El
// cliente no es un usuario del ERP: es la contraparte del contrato. Ofrecerle una puerta a
// «Proveedores» o a «Flujo de caja» —aunque la base se la cierre— es enseñarle que existe.
//
// El encabezado que sí lleva es el del `29`: isotipo, «ECHEGARAY CONSTRUCCIONES», «Portal de
// clientes», el selector de obra y su avatar. Lo dibuja la pantalla, que es la que sabe qué obras
// abre este acceso.
//
// ═══ ESTO NO ES LA CERRADURA ═══
//
// Que estas pantallas se dibujen no decide qué datos salen. Todo lo que el portal lee pasa por las
// policies de `cliente_de_sesion()` en la base y por los permisos de `cliente_acceso`. Un empleado
// que escriba `/portal` a mano no ve la obra de ningún cliente: ve el vacío que le corresponde.
//
// `/portal/ingresar` está en este mismo grupo y llega SIN sesión —es el pedido del magic link—, así
// que este layout no puede exigir usuario. Quien lo exige es el middleware, ruta por ruta.

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children
}
