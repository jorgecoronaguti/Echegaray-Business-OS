import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { esquemaDelPortal, obrasParaElInicio } from '../datosObra'
import { partirEnCursoYAnteriores } from '../../obrasDelCliente'
import { pesos } from '../../cronograma'
import { Vacio } from '../../Piezas'
import { IconoChevron, IconoTerminadas } from '../../iconos'
import { cierreDeObra } from './cierre'

// TERMINADAS — todo lo que hicimos juntos.
//
// ═══ RESPONDÍA «0 OBRAS» A TODO EL MUNDO (10/09/2026) ═══
//
// La consulta salía de `public.obras` con `estado = 'cerrada'`, y el alcance lo daba `obrasDelCliente`
// de `datos.ts`, que lee ESA MISMA tabla. `public.obras` es el registro viejo: las obras cerradas de
// verdad viven en `obra_canonica` —Messina tiene 6, La Estrella 3, ARCOR 1— y esta pantalla le
// contestaba «Todavía no cerramos ninguna obra suya» a los tres. No era una pantalla vacía: era una
// afirmación falsa sobre el trabajo que la empresa hizo para ese cliente.
//
// Por eso el destino estaba apagado en el menú desde el 26/08 («es confuso lo de terminadas»), pero
// la ruta seguía respondiendo, y con dato falso. Ahora lee `obra_canonica` —la MISMA fuente que parte
// la lista del Inicio y que decide qué es una «obra anterior» en Pagos— y la economía sale de los
// mismos pagos que dibuja Pagos. Tres pantallas, una definición.
//
// EL FONDO DE REPARO ABIERTO SE DICE EN LA LISTA. Una obra terminada con plata retenida sin devolver
// es la única de la lista que todavía tiene algo pendiente, y esconderlo detrás de un clic la haría
// verse igual que las cerradas del todo.

export const dynamic = 'force-dynamic'

export default async function Terminadas() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')

  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  // EL ALCANCE SALE DE `cliente_acceso`, NO DE LA COOKIE: `obrasParaElInicio` aplica
  // `alcanzaLaObra` fila por fila, así que un acceso revocado o acotado no ve nada de más.
  const { anteriores } = partirEnCursoYAnteriores(await obrasParaElInicio(acceso))
  const { pagos, contratos } = await esquemaDelPortal(acceso)

  const obras = anteriores.map((o) => ({
    ...o,
    contrato: contratos.get(o.id) ?? null,
    cierre: cierreDeObra(pagos.filter((p) => p.obraId === o.id), o.desde, o.hasta),
  }))
  // El total suma sólo lo que tiene contrato cargado y está en pesos: una obra sin contrato no vale
  // cero, y sumar dólares con pesos daría un número que no existe.
  const conMonto = obras.filter((o) => o.contrato?.monto != null && o.contrato.moneda === 'ARS')
  const total = conMonto.reduce((s, o) => s + Number(o.contrato?.monto ?? 0), 0)
  const montos = acceso.puedeVerMontos

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-.01em]">Todo lo que hicimos juntos</h1>
      <p className="mt-1.5 text-[12.5px] text-faint">
        {obras.length === 1 ? '1 obra' : `${obras.length} obras`}
        {montos && conMonto.length ? ` · ${pesos(total)}` : ''}
        {montos && conMonto.length < obras.length ? ` · ${obras.length - conMonto.length} sin monto cargado` : ''}
      </p>

      {obras.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no cerramos ninguna obra suya.</Vacio></div>
      ) : (
        <div className="mt-5">
          {obras.map((o) => (
            <Link prefetch={false}
              key={o.id}
              href={`/portal/terminadas/${o.id}`}
              className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-4 hover:bg-surface-quiet"
            >
              <span className="text-pos"><IconoTerminadas tamano={19} /></span>
              <span className="min-w-0 flex-1 basis-[45%]">
                <span className="block truncate text-sm font-semibold">{o.nombre}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{subtitulo(o.hasta, o.cierre.meses)}</span>
              </span>
              {montos ? (
                <span className="text-right">
                  <span className="tnum block font-mono text-[15px]">
                    {pesos(o.contrato?.monto ?? null, o.contrato?.moneda ?? 'ARS')}
                  </span>
                  <span className={`mt-0.5 block text-[12.5px] ${o.cierre.faltaReparo ? 'text-warn' : 'text-pos'}`}>
                    {o.cierre.faltaReparo ? `falta ${pesos(o.cierre.faltaReparo)} de reparo` : o.cierre.rotuloCobro}
                  </span>
                </span>
              ) : null}
              <span className="text-faint"><IconoChevron tamano={18} /></span>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-6 text-[12.5px] text-faint">
        Cada obra terminada guarda su cotización, contrato, planos y recibos.
      </p>
    </>
  )
}

/** «terminada 08/2026 · 3 meses». Sin fecha de cierre se DICE; no se pone la de inicio ni la de hoy. */
function subtitulo(hasta: string | null, meses: number | null): string {
  const partes = [hasta ? `terminada ${hasta.slice(5, 7)}/${hasta.slice(0, 4)}` : 'sin fecha de cierre']
  if (meses != null) partes.push(meses === 1 ? '1 mes' : `${meses} meses`)
  return partes.join(' · ')
}
