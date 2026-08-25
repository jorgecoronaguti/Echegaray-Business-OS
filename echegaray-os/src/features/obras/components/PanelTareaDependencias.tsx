// 04 · SOLAPA DEPENDENCIAS — qué habilita a esta actividad, a quién habilita ella, y cómo se cambia.
//
// ═══ LA SIGLA NO SE MUESTRA: SE EDITA ═══
//
// La frase («empieza cuando termina Replanteo») la arma la base en `obra_dependencia_legible`, y es
// lo único que se lee. FS/SS/FF/SF aparece SÓLO adentro del desplegable de «Cambiar relación»,
// porque ahí hay que elegir una y no hay forma de elegir sin nombrarla. El desplegable arranca en la
// relación que la dependencia TIENE hoy: si arrancara siempre en FS, cambiar la demora de una SS la
// convertiría en FS sin que nadie lo pida.
//
// ═══ QUITAR ES DESTRUCTIVO Y SE DICE, NO SE PREGUNTA ═══
//
// Sin `window.confirm` —no se lee con guantes puestos—: el botón dice qué hace y queda escrito al
// lado. Quitar una precedencia no borra trabajo, pero suelta el arrastre del cronograma.

import Link from 'next/link'
import { FormAccion } from '@/shared/components/ui'
import type { RelacionLegible } from '../services/tareasService'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

const RELACIONES: [string, string][] = [
  ['FS', 'FS · empieza cuando la otra termina'],
  ['SS', 'SS · empiezan juntas'],
  ['FF', 'FF · terminan juntas'],
  ['SF', 'SF · no termina hasta que la otra empiece'],
]

export function PanelTareaDependencias({
  antes, despues, hrefVincular, puedeEditar, cambiarRelacion, quitarRelacion,
}: {
  antes: RelacionLegible[]
  despues: RelacionLegible[]
  hrefVincular: string
  /** Cambiar el plan de la obra es de Administración y de la jefatura. La guarda de verdad vive en
   *  la acción; esto evita ofrecer un gesto que el servidor va a rechazar. */
  puedeEditar: boolean
  /** Ya atadas a la obra. El id de la dependencia se ata acá con `.bind`, NUNCA con una arrow: una
   *  arrow escrita en el servidor es una función nueva, no la acción, y React la rechaza en tiempo
   *  de ejecución. Ni el typecheck ni el build lo ven — sólo el navegador. */
  cambiarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
  quitarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
}) {
  return (
    <section data-testid="panel-dependencias">
      <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">Antes de esto</h3>
      {antes.length === 0
        ? <p className="text-[12.5px] text-muted">Nadie declaró qué tiene que pasar antes.</p>
        : (
          <ul>
            {antes.map((r) => (
              <Fila key={r.id} relacion={r} otra={r.origen} puedeEditar={puedeEditar}
                cambiar={cambiarRelacion.bind(null, r.id)} quitar={quitarRelacion.bind(null, r.id)} />
            ))}
          </ul>
        )}

      <div className="mt-3">
        <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">Después de esto</h3>
        {despues.length === 0
          ? <p className="text-[12.5px] text-muted">Nada depende de esta actividad todavía.</p>
          : (
            <ul>
              {despues.map((r) => (
                <Fila key={r.id} relacion={r} otra={r.destino} puedeEditar={puedeEditar}
                  cambiar={cambiarRelacion.bind(null, r.id)} quitar={quitarRelacion.bind(null, r.id)} />
              ))}
            </ul>
          )}
      </div>

      {/* SIN PRECEDENCIAS NO HAY CAMINO CRÍTICO. Deducirlo de las fechas sería inventar una
          secuencia: dos actividades consecutivas pueden serlo sólo porque comparten cuadrilla. */}
      {antes.length === 0 && despues.length === 0 && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Sin una sola precedencia declarada en la obra no hay camino crítico que calcular, y por eso
          ninguna actividad se muestra como crítica.
        </p>
      )}

      <Link href={hrefVincular} prefetch={false} data-testid="ir-vincular"
        className="mt-3 inline-block text-[12.5px] font-medium text-ink hover:underline">
        Vincular otra actividad
      </Link>
      {/* DECLARAR UNA PRECEDENCIA NUEVA ES EL CRONOGRAMA, y no este cajón de 412 px: elegir contra
          qué actividad se ata exige ver la lista entera de la obra y las fechas de cada una. Acá se
          cambia y se quita lo que YA está declarado, que es lo que se puede decidir mirando una
          sola actividad.
          22/08/2026 · La línea que explicaba eso se borró: el enlace de arriba YA lleva al
          cronograma, así que el párrafo describía el destino de un enlace que se lee solo. */}
    </section>
  )
}

/** Una precedencia: la frase de la base, y debajo el editor plegado. El editor NO reemplaza a la
 *  frase — la frase es lo que se lee; el editor es lo que se toca. */
function Fila({ relacion, otra, puedeEditar, cambiar, quitar }: {
  relacion: RelacionLegible
  otra: string
  puedeEditar: boolean
  cambiar: AccionFormulario
  quitar: AccionFormulario
}) {
  return (
    <li className="border-b border-[#EFEEEA] py-1.5 last:border-0">
      <span className="block text-[12.5px] text-ink-soft">{otra}</span>
      <span className="block text-[11px] text-muted">{relacion.relacion}</span>
      {puedeEditar && (
        <details className="mt-1" data-testid={`cambiar-relacion-${relacion.id}`}>
          <summary className="cursor-pointer text-[11.5px] text-faint hover:text-ink">Cambiar relación</summary>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <FormAccion accion={cambiar} enviar="Guardar la relación" mensajeOk="Relación cambiada.">
              <div className="flex flex-wrap items-end gap-1.5">
                <label className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[10.5px] text-faint">Relación</span>
                  <select name="tipo" defaultValue={relacion.tipo}
                    className="h-control w-full rounded-control border border-line-strong px-1.5 text-[12px] text-ink">
                    {RELACIONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
                <label className="w-[84px]">
                  <span className="mb-0.5 block text-[10.5px] text-faint">Demora (d)</span>
                  <input type="number" name="lag_dias" min={-365} max={365} step={1}
                    defaultValue={relacion.lag_dias}
                    className="h-control w-full rounded-control border border-line-strong px-1.5 text-[12px] text-ink" />
                </label>
              </div>
            </FormAccion>
            <FormAccion accion={quitar} enviar="Quitar la precedencia" mensajeOk="Precedencia quitada.">
              <p className="text-[10.5px] text-muted">
                Quitarla no borra trabajo: suelta el arrastre. Esta actividad deja de esperar a
                «{otra}» y el cronograma deja de moverla cuando la otra se mueve.
              </p>
            </FormAccion>
          </div>
        </details>
      )}
    </li>
  )
}
