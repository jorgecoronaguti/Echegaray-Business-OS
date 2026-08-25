// EL BANCO DE TRABAJO DE PENDIENTES — la cola a la izquierda, la decisión a la derecha, y resolver
// sin salir de la pantalla.
//
// ═══ POR QUÉ ES UN COMPONENTE DE CLIENTE Y LA PÁGINA NO ═══
//
// El único pedazo con interactividad es éste: elegir un texto de la cola, contestar las dos
// preguntas y confirmar. La página sigue siendo de servidor y hace las lecturas; acá abajo no hay
// una sola consulta. Medido en producción, esta ruta baja 2 KB de JavaScript en total — el trabajo
// de rendimiento estaba entero del lado de la base, no del bundle.
//
// ═══ NADA NAVEGA PARA HACER ALGO QUE SE PUEDE HACER DONDE ESTÁ ═══
//
// Antes, abrir un texto era un `?c=` que volvía al servidor y redibujaba la página entera: un
// segundo de espera por cada texto que se mira. Ahora la cola ya vino completa y elegir es local.
// La escritura sigue siendo del servidor —es la única que puede serlo— y cuando contesta que sí, el
// texto sale de la cola en el acto y el siguiente queda abierto: no hay que buscar dónde se estaba.
//
// El `?c=` se sigue LEYENDO para la selección inicial, así que un enlace viejo sigue abriendo el
// texto que abría. Lo que ya no hace es escribirse en cada clic.
//
// ═══ LOS CINCO NÚMEROS DEL RESUMEN SE MUEVEN CON LA COLA ═══
//
// Si la cola se vaciara y «Herramientas · 1 sin resolver» siguiera ahí, la pantalla se estaría
// contradiciendo consigo misma. El ajuste es aritmética del efecto ya confirmado (ver
// `pendientesVista.ts`), y el `router.refresh()` que va detrás lo reemplaza por la cuenta de la
// base. Si alguna vez difirieran, gana la base.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AccionFormulario } from '@/shared/components/ui'
import { IconoNadaPendiente } from '@/shared/components/iconos'
import { Num } from '@/shared/components/ds'
import type { GrupoPendiente, ObraElegible, ResumenFuente } from '../services/imputacionService'
import { resumenTrasResolver, type Clasificacion, type Resuelto } from '../services/pendientesVista'
import { ColaPendientes } from './ColaPendientes'
import { DecisionPendiente } from './DecisionPendiente'

/** Lo contestado para el texto abierto. Vive atado a su clave: cambiar de texto no puede arrastrar
 *  la respuesta del anterior, y por eso el borrador se descarta por comparación en el render y no
 *  con un efecto que corre tarde. */
interface Borrador {
  clave: string
  clase: Clasificacion
  obra: string
}

/** La respuesta con la que se abre un texto: sólo viene marcada cuando la evidencia es un juicio
 *  humano sobre ese MISMO texto. Una inferencia nunca preselecciona. */
const borradorDe = (g: GrupoPendiente): Borrador => ({
  clave: g.clave,
  clase: 'obra',
  obra: g.sugerencia?.preseleccionar ? g.sugerencia.obra_id : '',
})

export function PendientesTrabajo({ grupos, resumen, obras, resolver, claveInicial }: {
  grupos: GrupoPendiente[]
  resumen: ResumenFuente[]
  obras: ObraElegible[]
  resolver: AccionFormulario
  claveInicial: string | null
}) {
  const router = useRouter()
  const [resueltos, setResueltos] = useState<Resuelto[]>([])
  const [preferida, setPreferida] = useState<string | null>(claveInicial)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()

  // TODO LO QUE SIGUE ES ESTADO DERIVADO EN EL RENDER, NO UN EFECTO. Cuando el texto abierto se
  // resuelve desaparece de `cola` y `activo` cae solo al siguiente; cuando el servidor vuelve con
  // la cola ya sin él, nada tiene que sincronizarse porque no había nada copiado.
  const yaResueltos = new Set(resueltos.map((r) => r.clave))
  const cola = grupos.filter((g) => !yaResueltos.has(g.clave))
  const activo = cola.find((g) => g.clave === preferida) ?? cola[0] ?? null
  const d = activo && borrador?.clave === activo.clave ? borrador : activo ? borradorDe(activo) : null
  const resumenVisible = resumenTrasResolver(resumen, grupos, resueltos)

  function resolverAhora() {
    if (!activo || !d) return
    const form = new FormData()
    form.set('clave', activo.clave)
    form.set('ejemplo', activo.textos[0])
    form.set('clasificacion', d.clase)
    form.set('obra_id', d.obra)
    empezar(async () => {
      const r = await resolver(form)
      // EL ERROR DEL SERVIDOR SE MUESTRA SIEMPRE Y NO SE SACA NADA DE LA COLA. Un texto que
      // desaparece sin haberse escrito es un pendiente perdido: vuelve mañana y nadie sabe por qué.
      if (!r.ok) { setError(r.error); return }
      setError(null)
      setResueltos((xs) => [...xs, { clave: activo.clave, clasificacion: d.clase }])
      setBorrador(null)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex min-h-0 flex-col gap-6 lg:h-[calc(100vh-232px)] lg:min-h-[440px] lg:flex-row lg:items-stretch lg:gap-0">
        <ColaPendientes
          cola={cola}
          activa={activo?.clave ?? null}
          resumen={resumenVisible}
          alAbrir={(clave) => { setPreferida(clave); setError(null) }}
        />
        {activo && d
          ? (
              <DecisionPendiente
                g={activo}
                obras={obras}
                clase={d.clase}
                obraElegida={d.obra}
                error={error}
                enCurso={enCurso}
                restantes={cola.length - 1}
                nombreDeObra={(id) => obras.find((o) => o.obra_id === id)?.nombre ?? id}
                alElegirClase={(clase) => setBorrador({ clave: activo.clave, clase, obra: '' })}
                alElegirObra={(obra) => setBorrador({ clave: activo.clave, clase: d.clase, obra })}
                alResolver={resolverAhora}
              />
            )
          : <ColaVacia total={resumen.reduce((a, r) => a + r.total, 0)} />}
      </div>
      {error && !activo && (
        <p data-testid="error-sin-cola" className="mt-3 text-[12px] text-neg">{error}</p>
      )}
    </>
  )
}

function ColaVacia({ total }: { total: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 pb-14 pl-0 lg:pl-6">
      <IconoNadaPendiente className="h-[30px] w-[30px] text-pos" />
      <div className="text-[15px] font-semibold text-ink">La cola está vacía</div>
      <p className="max-w-[380px] text-center text-[12.5px] leading-relaxed text-muted text-pretty">
        Las <Num className="text-muted">{total}</Num> filas de compras, pedidos, herramientas y
        movimientos están clasificadas. Lo que entre mañana por el sincronizador aparece acá.
      </p>
    </div>
  )
}
