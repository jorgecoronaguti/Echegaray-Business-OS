import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal, obrasDelCliente } from '../../datos'
import { pesos } from '../../cronograma'
import { Vacio } from '../../Piezas'
import { IconoChevron, IconoTerminadas } from '../../iconos'
import { cierreDeObra, type ObraCerrada } from './cierre'

// TERMINADAS — todo lo que hicimos juntos.
//
// No es un archivo muerto: cada obra terminada se NAVEGA adentro (su carpeta en modo lectura, más el
// cierre). Por eso la fila entera es un link y no hay un botón «ver» al costado.
//
// EL FONDO DE REPARO ABIERTO SE DICE EN LA LISTA. Una obra terminada con plata retenida sin devolver
// es la única de la lista que todavía tiene algo pendiente, y esconderlo detrás de un clic la haría
// verse igual que las cerradas del todo.

export const dynamic = 'force-dynamic'

export default async function Terminadas() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')

  const acceso = await accesoDelPortal(sesion.mail, sesion.clienteId)
  if (!acceso) redirect('/portal/login')

  // EL ALCANCE SALE DE `cliente_acceso`, NO DE LA COOKIE. Antes esta consulta filtraba por el
  // `cliente_id` de la cookie y por nada más: un acceso revocado seguía viendo las obras cerradas.
  const suyas = new Set((await obrasDelCliente(acceso)).map((o) => o.id))
  const { data } = suyas.size
    ? await createAdminClient()
      .from('obras')
      .select('id, nombre, monto_contratado, fecha_inicio, fecha_cierre, estado')
      .in('id', [...suyas]).eq('estado', 'cerrada')
      .order('fecha_cierre', { ascending: false, nullsFirst: false })
    : { data: [] as { id: string; nombre: string; monto_contratado: number | null; fecha_inicio: string | null; fecha_cierre: string | null; estado: string }[] }

  const obras = data ?? []
  const cierres = await Promise.all(obras.map((o) => cierreDeObra(String(o.id))))
  // El total suma sólo lo que tiene monto: una obra sin contrato cargado no vale cero.
  const conMonto = obras.filter((o) => o.monto_contratado != null)
  const total = conMonto.reduce((s, o) => s + Number(o.monto_contratado), 0)

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-.01em]">Todo lo que hicimos juntos</h1>
      <p className="mt-1.5 text-[12.5px] text-faint">
        {obras.length === 1 ? '1 obra' : `${obras.length} obras`}
        {conMonto.length ? ` · ${pesos(total)}` : ''}
        {conMonto.length < obras.length ? ` · ${obras.length - conMonto.length} sin monto cargado` : ''}
      </p>

      {obras.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no cerramos ninguna obra suya.</Vacio></div>
      ) : (
        <div className="mt-5">
          {obras.map((o, i) => (
            <Link
              key={String(o.id)}
              href={`/portal/terminadas/${o.id}`}
              className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-4 hover:bg-surface-quiet"
            >
              <span className="text-pos"><IconoTerminadas tamano={19} /></span>
              <span className="min-w-0 flex-1 basis-[45%]">
                <span className="block truncate text-sm font-semibold">{String(o.nombre)}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{subtitulo(o, cierres[i])}</span>
              </span>
              <span className="text-right">
                <span className="tnum block font-mono text-[15px]">
                  {pesos(o.monto_contratado == null ? null : Number(o.monto_contratado))}
                </span>
                <span className={`mt-0.5 block text-[12.5px] ${cierres[i].faltaReparo ? 'text-warn' : 'text-pos'}`}>
                  {cierres[i].faltaReparo ? `falta ${pesos(cierres[i].faltaReparo)} de reparo` : cierres[i].rotuloCobro}
                </span>
              </span>
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

function subtitulo(o: { fecha_cierre?: string | null; fecha_inicio?: string | null }, c: ObraCerrada): string {
  const partes: string[] = []
  // «terminada 03/2025». Sin fecha de cierre se dice, no se pone la de inicio ni la de hoy.
  partes.push(o.fecha_cierre ? `terminada ${o.fecha_cierre.slice(5, 7)}/${o.fecha_cierre.slice(0, 4)}` : 'sin fecha de cierre')
  if (c.meses != null) partes.push(c.meses === 1 ? '1 mes' : `${c.meses} meses`)
  return partes.join(' · ')
}
