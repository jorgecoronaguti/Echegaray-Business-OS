import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Aviso, Vacio } from '@/shared/components/ds'
import { hs } from '../../services/jornadaPorObra'
import { correrDia, rotuloDelDia } from '../../services/diaDeJornada'
import { getJornadaDelDia, getObrasParaJornada } from '../../services/jornadaPorObraService'
import { ElegirDia, TOKEN_DIA } from './ElegirDia'
import { FormAsistencia } from './FormAsistencia'

// LA CARGA DE ASISTENCIA EN EL TELÉFONO, DENTRO DE ADMINISTRACIÓN — 08/09/2026.
//
// El dueño, textual: *«probé el diseño del registro de la asistencia por el celular con mi usuario
// admin y es la misma pantalla que muestra la computadora»*. La experiencia de teléfono existía en
// `/campo/asistencia` y ningún rol de adentro tenía cómo llegar: la barra inferior que la ofrece es
// del rol `campo`. Esto es esa misma carga —los MISMOS componentes, no una copia— servida desde
// `/administracion/personas?vista=asistencia`.
//
// ═══ DOS PASOS, NO UNA GRILLA ═══
//
// La grilla de quincena son 15 personas × 15 días: en 390px es scroll lateral con la mano ocupada.
// Acá se elige la obra, se elige el día, y se cargan las horas de esa cuadrilla. Es el mismo modelo
// mental de la obra: una obra, un día, las horas de cada uno.
//
// ═══ LO QUE NO CAMBIA ═══
//
// La casilla sigue naciendo VACÍA (ver `FormAsistencia`: es el defecto que costó un revert y 77,4
// HH escritas en una obra viva), el permiso lo siguen decidiendo las policies de `registros_hh` y
// `obra_asignacion`, y las obras que se ofrecen son las que la RLS de `obra_canonica` devuelve.

export async function BloqueAsistenciaDia({ obraPedida, dia, hrefDe, hrefQuincena }: {
  obraPedida: string | undefined
  dia: string
  /** La URL de esta misma vista con otra obra y/u otro día. */
  hrefDe: (p: { obra?: string | null; dia?: string | null }) => string
  hrefQuincena: string
}) {
  const supabase = await createClient()
  const obras = await getObrasParaJornada(supabase, dia)

  if (obras.error) {
    return (
      <Envoltorio hrefQuincena={hrefQuincena}>
        {/* UNA LISTA VACÍA PORQUE LA RLS RECHAZÓ LA CONSULTA es indistinguible de una empresa sin
            obras, y la diferencia entre las dos es todo. El error se muestra con su texto. */}
        <Aviso tono="neg" titulo="No pude leer las obras">{obras.error}</Aviso>
      </Envoltorio>
    )
  }

  const obraId = obraPedida && obras.data.some((o) => o.id === obraPedida)
    ? obraPedida
    : obras.data.length === 1 ? obras.data[0].id : null

  if (!obraId) {
    return (
      <Envoltorio hrefQuincena={hrefQuincena}>
        <ListaDeObras obras={obras.data} dia={dia} hrefDe={hrefDe} />
      </Envoltorio>
    )
  }

  const jornada = await getJornadaDelDia(supabase, obraId, dia)
  if (jornada.error || !jornada.data) {
    return (
      <Envoltorio hrefQuincena={hrefQuincena}>
        <Aviso tono="neg" titulo="No pude leer la jornada">
          {jornada.error ?? 'Esa obra no existe o no la ves.'}
        </Aviso>
        <p className="mt-3">
          <Volver href={hrefDe({ obra: null, dia })} />
        </p>
      </Envoltorio>
    )
  }

  const { obra, filas } = jornada.data
  return (
    <Envoltorio hrefQuincena={hrefQuincena}>
      <div className="mb-3">
        <Volver href={hrefDe({ obra: null, dia })} />
        <h2 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.01em] text-ink" data-testid="obra-de-la-jornada">
          {obra.nombre}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {obra.jornada > 0
            ? `${hs(obra.jornada)} hs de jornada`
            // NO SE INVENTA UNA JORNADA. Un 8 escrito acá sería una afirmación sobre el contrato de
            // esa obra que nadie hizo.
            : 'esta obra no tiene jornada pactada cargada'}
        </p>
      </div>

      <div className="mb-4">
        <ElegirDia
          dia={dia}
          rotulo={rotuloDelDia(dia)}
          hrefAyer={hrefDe({ obra: obraId, dia: correrDia(dia, -1) })}
          hrefManana={hrefDe({ obra: obraId, dia: correrDia(dia, 1) })}
          plantilla={hrefDe({ obra: obraId, dia: TOKEN_DIA })}
        />
      </div>

      {/* La MISMA definición que usa el jefe en `/campo/asistencia`. Si acá hubiera una copia, el
          día que se corrija una de las dos la otra seguiría escribiendo mal. */}
      <FormAsistencia
        obraId={obra.id}
        obraNombre={obra.nombre}
        fecha={dia}
        jornada={obra.jornada}
        filas={filas}
      />
    </Envoltorio>
  )
}

function Envoltorio({ children, hrefQuincena }: {
  children: React.ReactNode; hrefQuincena: string
}) {
  return (
    <div className="px-4 pb-8 pt-4" data-testid="asistencia-dia">
      {children}
      {/* DISCRETO A PROPÓSITO. La grilla sigue existiendo y sigue siendo la vista de control de
          Administración; en el teléfono es la salida de emergencia, no el default. */}
      <p className="mt-6 border-t border-line pt-3 text-center">
        <Link
          prefetch={false}
          href={hrefQuincena}
          data-testid="ver-quincena"
          className="inline-flex min-h-[44px] items-center px-2 text-[12.5px] text-muted underline hover:text-ink"
        >
          Ver la quincena completa
        </Link>
      </p>
    </div>
  )
}

function Volver({ href }: { href: string }) {
  return (
    <Link
      prefetch={false}
      href={href}
      data-testid="cambiar-obra"
      className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink"
    >
      ← Otra obra
    </Link>
  )
}

/**
 * El paso 1: qué obra. Una LISTA de objetivos altos y no un desplegable — en el teléfono, parado y
 * con una mano, tocar una fila grande es más rápido y no se equivoca. Mismo criterio que
 * `ElegirObra` de `/campo`, que no se reusa porque aquélla no dice cuánta gente hay que cargar y
 * ése es justamente el dato que decide cuál tocar.
 */
function ListaDeObras({ obras, dia, hrefDe }: {
  obras: { id: string; nombre: string; jornada: number; asignados: number | null }[]
  dia: string
  hrefDe: (p: { obra?: string | null; dia?: string | null }) => string
}) {
  if (obras.length === 0) {
    return <Vacio>No hay obras activas. La asistencia se carga sobre una obra activa.</Vacio>
  }
  return (
    <div>
      <p className="mb-2 text-[12.5px] text-muted">¿De qué obra?</p>
      <ul className="border-t border-line" data-testid="obras-para-asistencia">
        {obras.map((o) => (
          <li key={o.id} className="border-b border-line">
            <Link
              prefetch={false}
              href={hrefDe({ obra: o.id, dia })}
              data-testid="obra-para-asistencia"
              className="flex min-h-[56px] items-center justify-between gap-3 py-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{o.nombre}</span>
              {/* `null` NO SE DIBUJA COMO 0. Cero afirma que la obra está sin gente —una razón para
                  no tocarla— y `null` sólo dice que no se pudo contar. */}
              <span className="shrink-0 text-[12px] text-faint" data-testid="asignados">
                {o.asignados === null
                  ? 'sin conteo'
                  : `${o.asignados} ${o.asignados === 1 ? 'persona' : 'personas'}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
