// LA CUENTA CORRIENTE Y LOS CERTIFICADOS DE UN CLIENTE — lecturas de las pantallas 28 y 32.
//
// ═══ STUB HASTA QUE ATERRICE back-28-32 ═══
//
// Las firmas son las del CONTRATO-28-32 y NO cambian cuando el frente de datos aterrice: lo único
// que cambia es el cuerpo, que hoy devuelve el VACÍO HONESTO —`null` y `[]`— porque las tablas
// `certificado_cliente` y la vista `cliente_cuenta_corriente` todavía no existen en la base.
//
// NO HAY DATOS DE EJEMPLO Y NO ES UNA OMISIÓN. Un saldo de mentira en una pantalla de cobranzas se
// mira, se cree y se usa para decidir a quién llamar. `null` obliga a la pantalla a escribir «no
// hay dato», que es la verdad de hoy y se distingue a simple vista de un cliente sin deuda.
//
// La fuente cuando exista: `public.cobranza` (réplica de la pestaña Cobranzas del Sheet «Flujo de
// Caja - Cash Flow», donde la columna Q es la fecha de cobro) + `public.certificado_cliente`.

import type { CertificadoCliente, CuentaCorriente } from '../types/cobranzas'

/** Saldo, vencido, DSO, efectividad y fondo de reparo. `null` = todavía no hay de dónde leerlos. */
export async function getCuentaCorriente(clienteId: string): Promise<CuentaCorriente | null> {
  // La guarda no es de adorno ni desaparece cuando llegue el cuerpo: un id vacío llegando hasta la
  // consulta devolvería la cuenta corriente de OTRO cliente o la de todos.
  if (!clienteId) return null
  return null
}

/** Los certificados y facturas emitidos al cliente, del más nuevo al más viejo. */
export async function getCertificados(clienteId: string): Promise<CertificadoCliente[]> {
  if (!clienteId) return []
  return []
}
