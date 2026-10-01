// QUIÉN RINDE EFECTIVO — una sola definición para todas las puertas del bot (canal Efectivo, foto, «ER-nnnn» en
// Compras, pagos y adelantos escritos).
//
// Dueño, 01/10/2026, literal: «solo los usuarios con nivel jefe de obra y admin, rinden gastos y admin tiene abm de
// efectivo». En `public.perfiles.rol`: el `jefe_obra` rinde lo de SU entrega; `direccion` y `administracion`, lo de
// cualquiera. Un `campo` con una entrega la ve y la firma, pero no rinde: sus gastos los rinde Administración.
//
// Fail-closed: un rol vacío o desconocido no rinde. La base dice lo mismo en sus puertas
// (`rendir_gasto_sin_foto_del_chat`, `rendir_adelanto_de_sueldo` desde 20261001T0400): esto es la primera puerta,
// la que permite contestar con una explicación en vez de con el error de la base.

export const ROLES_QUE_RINDEN = Object.freeze(['jefe_obra', 'direccion', 'administracion'])
export const ROLES_QUE_RINDEN_POR_OTRO = Object.freeze(['direccion', 'administracion'])

const rolDe = (x) => String((typeof x === 'string' ? x : x?.rol) ?? '').trim().toLowerCase()

/** ¿Este perfil (o rol) rinde efectivo? */
export const rinde = (x) => ROLES_QUE_RINDEN.includes(rolDe(x))
/** ¿Rinde contra la entrega de OTRA persona? Dirección y Administración, nadie más. */
export const rindePorOtro = (x) => ROLES_QUE_RINDEN_POR_OTRO.includes(rolDe(x))

export const TEXTO_NO_RINDE = Object.freeze({
  /** Chat escrito: no se carga nada. */
  CHAT: 'No cargué nada: los gastos y pagos hechos con una entrega los rinden sólo los jefes de obra y Administración, así que los tuyos los rinde Administración. Pasale el detalle.',
  /** Chat escrito, pago o gasto con la caja (sin entrega): tampoco se carga nada. */
  CAJA: 'No cargué nada: por acá los pagos y gastos en efectivo los cargan sólo los jefes de obra y Administración. Pasale el detalle a Administración.',
  /** Foto o «ER-nnnn»: el comprobante sigue como compra común, sin tocar la entrega. */
  COMUN: 'No lo rendí contra ninguna entrega: los gastos de efectivo los rinden sólo los jefes de obra y Administración, así que los tuyos los rinde Administración. El comprobante sigue como compra común.',
})
