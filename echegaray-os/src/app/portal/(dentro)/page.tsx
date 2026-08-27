import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../sesion'
import { accesoDelPortal } from '../datos'
import { obrasParaElInicio, type ObraDelInicio } from './datosObra'
import { Vacio } from '../Piezas'
import { IconoInicio, IconoFlecha } from '../iconos'

// INICIO — a quién saludamos y qué le estamos haciendo. Nada más.
//
// ═══ ACÁ NO HAY UN PESO (26/08/2026, decisión del dueño) ═══
//
// Abría con el próximo pago en 38px y tres líneas de vencido / pendiente / pagado. Textual: «no
// quiero q el inicio de los clientes sea el monto de la obra o lo q deben, no me gusta eso; esa es
// una función exclusiva de la sección Pagos. En el inicio darle la bienvenida y listar las obras».
//
// Es una decisión de relación, no de diseño: la primera pantalla que ve un cliente al entrar no
// puede ser un recordatorio de deuda. La plata tiene su lugar —Pagos— y está a un clic.
//
// MINIMALISMO: un saludo, la lista de sus obras, y un enlace al cronograma. Ni una tarjeta, ni un
// gráfico, ni un contador. Lo que no aporta a «qué me están haciendo» no entra.
//
// LO QUE NO SE INVENTA: una obra sin fecha de inicio cargada no dice cuándo empezó, y una sin estado
// no se rotula «en ejecución» por descarte. Ausencia se escribe como ausencia.

export const dynamic = 'force-dynamic'

export default async function Inicio() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const obras = await obrasParaElInicio(acceso)

  return (
    <section className="flex flex-col">
      {/* SE SALUDA A LA PERSONA SI ADMINISTRACIÓN CARGÓ SU NOMBRE; si no, al cliente. Nunca se
          deriva del mail: «j.perez@» no es «J Perez». */}
      <h1 className="text-[26px] font-semibold tracking-[-.02em] md:text-[30px]">
        Bienvenido, {acceso.persona ?? acceso.clienteNombre}
      </h1>
      <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-muted">
        Acá está lo que estamos construyendo para usted. Toque una obra para ver su cronograma de
        pagos; sus facturas y los papeles de cada obra están en el menú.
      </p>

      <h2 className="mt-11 text-[11px] tracking-[.09em] text-faint">
        {obras.length === 1 ? 'SU OBRA' : 'SUS OBRAS'}
      </h2>

      {obras.length === 0 ? (
        <div className="mt-4">
          <Vacio>Todavía no tenemos ninguna obra asociada a su acceso. Escribinos y lo resolvemos.</Vacio>
        </div>
      ) : (
        <ul className="mt-1">
          {obras.map((o) => <FilaObra key={o.id} obra={o} />)}
        </ul>
      )}

      <Link
        href="/portal/pagos"
        className="mt-9 inline-flex min-h-11 items-center gap-2 self-start text-[13.5px] font-semibold text-ink"
      >
        Ver el cronograma de pagos
        <IconoFlecha tamano={16} />
      </Link>
    </section>
  )
}

/** El mes y el año en que arrancó: «desde mar 2026». El día no le dice nada al cliente. */
function desdeCuando(iso: string | null): string | null {
  if (!iso || iso.length < 7) return null
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const m = MES[Number(iso.slice(5, 7)) - 1]
  return m ? `desde ${m} ${iso.slice(0, 4)}` : null
}

/**
 * UNA OBRA DEL INICIO LLEVA A SUS PAGOS (27/08/2026).
 *
 * «Hacer clic en una obra tiene que llevar a la pantalla de Pagos de esa obra.» No llevaba a ningún
 * lado: era texto con cara de fila tocable. El enlace arrastra el filtro —`?obra=` es el mismo
 * parámetro que usan las pastillas de Pagos— así que el cliente cae en su cronograma ya acotado a
 * la obra que tocó, y de ahí puede sacar el filtro con «Todas las obras».
 *
 * `obra_canonica.id` es el MISMO id que guarda `esquema_pago.obra_id`: por eso el filtro engancha.
 * Y si esa obra todavía no tiene cronograma publicado, Pagos lo dice en vez de mostrar todo como si
 * el filtro hubiera funcionado.
 *
 * ESTO NO ES PLATA EN EL INICIO: la fila sigue sin mostrar un peso. Lo único que cambia es que
 * ahora se puede tocar.
 */
function FilaObra({ obra }: { obra: ObraDelInicio }) {
  const cerrada = obra.estado === 'cerrada'
  // El renglón de abajo se arma con lo que HAY. Sin estado y sin fecha no se escribe nada: una obra
  // puede estar cargada sin esos datos y rellenarlos sería afirmar algo que nadie declaró.
  const detalle = [cerrada ? 'terminada' : obra.estado, desdeCuando(obra.desde)].filter(Boolean).join(' · ')

  return (
    <li className="border-b border-line">
      <Link
        href={`/portal/pagos?obra=${encodeURIComponent(obra.id)}`}
        className="flex min-h-[58px] items-center gap-3.5 py-3.5"
      >
        <span className={cerrada ? 'text-faint' : 'text-muted'}><IconoInicio tamano={19} /></span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[15px] ${cerrada ? 'text-muted' : 'text-ink'}`}>{obra.nombre}</span>
          {detalle ? <span className="mt-0.5 block truncate text-[12.5px] text-faint">{detalle}</span> : null}
        </span>
        {/* La flecha dice que la fila lleva a algún lado. Sin ella, una fila tocable se toca por
            accidente y no se toca a propósito. */}
        <span className="shrink-0 text-faint"><IconoFlecha tamano={15} /></span>
      </Link>
    </li>
  )
}
