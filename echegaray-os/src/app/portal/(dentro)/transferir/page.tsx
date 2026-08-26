import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { esquemaDelPortal } from '../datosObra'
import { proximoPago, pesos, diaMes } from '../../cronograma'
import { Vacio, Rubro } from '../../Piezas'
import { CUENTA_PARA_COBRAR, FALTAN_DATOS_BANCARIOS } from '../../datosBancarios'

// TRANSFERIR — los datos para pagar, y nada más.
//
// La acción primaria del Inicio abre acá. No hay pasarela ni botón que mueva plata: el cliente
// transfiere desde su banco. Lo único que el portal tiene que hacer bien es no equivocar un dígito.
//
// UN CBU NO SE INVENTA. Si el dato no está cargado, se dice que falta y se ofrece el camino humano.
// Publicar un CBU aproximado sería el error más caro que puede cometer esta pantalla.

export const dynamic = 'force-dynamic'

export default async function Transferir() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  // EL PRÓXIMO PAGO DEL CLIENTE, no el de una obra: el que transfiere paga lo que vence primero, sin
  // importar de cuál de sus obras sea.
  const acceso = await accesoDelPortal(sesion.mail, sesion.clienteId)
  if (!acceso) redirect('/portal/login')
  // SIN `puede_ver_montos` NO SE ENTRA ACÁ. Esta pantalla existe para pagar un importe; quien no
  // puede ver la plata no puede transferirla, y dibujarla sin el monto sería pedirle que pague algo
  // que no sabe cuánto es.
  if (!acceso.puedeVerMontos) redirect('/portal')

  const { pagos, bloques } = await esquemaDelPortal(acceso)
  const proximo = proximoPago(pagos)
  const variasObras = bloques.length > 1

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-.01em]">Transferir</h1>
      {proximo ? (
        <p className="mt-2 text-sm text-muted">
          {proximo.rotulo}{variasObras ? ` · ${(proximo as { obraNombre?: string }).obraNombre ?? ''}` : ''} · vence {diaMes(proximo.fechaPrevista)} ·{' '}
          <span className="tnum font-mono text-ink">{pesos(proximo.monto)}</span>
        </p>
      ) : null}

      <Rubro>DATOS DE LA CUENTA</Rubro>
      {FALTAN_DATOS_BANCARIOS.length === Object.keys(CUENTA_PARA_COBRAR).length ? (
        <div className="mt-5"><Vacio>Todavía no publicamos los datos de la cuenta. Pedínoslos y te los mandamos.</Vacio></div>
      ) : (
        <dl className="mt-5">
          {Object.entries(CUENTA_PARA_COBRAR).map(([rotulo, valor]) => (
            <div key={rotulo} className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3.5">
              <dt className="w-[150px] text-[12.5px] text-faint">{rotulo}</dt>
              <dd className={`tnum min-w-0 flex-1 font-mono text-[15px] ${valor ? '' : 'text-faint'}`}>
                {valor ?? 'sin cargar'}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {FALTAN_DATOS_BANCARIOS.length ? (
        // LO QUE FALTA SE DECLARA AL LADO DEL DATO, no se omite. Un CBU ausente en silencio se lee
        // como «no hace falta».
        <p className="mt-3 text-[12.5px] text-warn">
          Falta cargar: {FALTAN_DATOS_BANCARIOS.join(' · ')}. Escribinos y te lo pasamos.
        </p>
      ) : null}

      <p className="mt-6 text-[12.5px] text-muted">
        Mandanos el comprobante y lo imputamos el mismo día.
      </p>
    </>
  )
}
