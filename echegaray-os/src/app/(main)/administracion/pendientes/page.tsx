// PENDIENTES DE IMPUTACIÓN — los textos que nadie clasificó, con lo que hace falta para clasificarlos.
//
// ═══ LO QUE MIDE ESTA PANTALLA, MEDIDO EL 18/08/2026 CONTRA LA BASE ═══
//
//   Compras (costos_obra)           845 filas · 533 a una obra · 312 estructura · 0 pendientes
//   Pedidos (pedidos_materiales)     17 filas ·  17 a una obra ·   0 estructura · 0 pendientes
//   Herramientas                    149 filas · 118 a una obra ·  29 estructura · 1 pendiente + 1 sin texto
//   Movimientos                      53 filas ·  27 a una obra ·  25 estructura · 1 pendiente
//
// El encargo llegó con «Compras 533/845». Esas 312 filas de diferencia NO son trabajo pendiente: son
// filas que alguien YA declaró costo de estructura (Administración, Taller, F931, UOCRA…).
// Confundirlas con pendientes manda a resolver algo resuelto, y peor, invita a imputarle a una obra
// costo que es de la empresa. Por eso el resumen de arriba separa las cinco columnas: sin él, la
// pantalla contestaría «faltan 312» a una pregunta cuya respuesta real es «falta 1».
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No propone obras por parecido de nombre. «Sugerido» sale vacío salvo que exista evidencia —un
// juicio humano previo sobre el MISMO texto, o un proveedor que nunca compró para otra obra—, y
// cuando sale, dice por qué. Hoy, con los datos reales, no sale nunca: no hay evidencia para el
// único texto pendiente. Eso es el comportamiento correcto, no una falta.

import { createClient } from '@/lib/supabase/server'
import { getPortafolio } from '@/features/obras/services/obrasService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { resolverImputacion } from '@/features/obras/services/actionsImputacion'
import { PageShell } from '@/shared/components/ui'
import { Aviso, Num } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { TablaPendientes } from '@/features/administracion/components/TablaPendientes'
import { PanelPendiente } from '@/features/administracion/components/PanelPendiente'
import {
  ETIQUETA_TIPO, getPendientesDeImputacion, type ResumenFuente,
} from '@/features/administracion/services/imputacionService'

export const dynamic = 'force-dynamic'

/** Una cifra del resumen. Ámbar SÓLO en «pendientes» y sólo cuando hay alguno: es la única columna
 *  que pide trabajo, y encenderla siempre la volvería invisible. */
function Cifra({ rotulo, valor, tono }: { rotulo: string; valor: number; tono?: 'warn' | 'faint' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</span>
      <span
        className={`font-mono text-[15px] font-semibold tabular-nums ${
          tono === 'warn' ? 'text-warn' : tono === 'faint' ? 'text-faint' : 'text-muted'
        }`}
      >{valor}</span>
    </div>
  )
}

function ResumenFuentes({ resumen }: { resumen: ResumenFuente[] }) {
  return (
    <div className="mb-6 flex flex-wrap gap-x-14 gap-y-6" data-testid="resumen-fuentes">
      {resumen.map((r) => (
        <div key={r.tipo} data-testid={`resumen-${r.tipo}`} className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold text-ink">{ETIQUETA_TIPO[r.tipo]}</span>
          <div className="flex gap-5">
            <Cifra rotulo="A una obra" valor={r.obra} />
            <Cifra rotulo="Estructura" valor={r.estructura} />
            <Cifra rotulo="Pendientes" valor={r.pendiente} tono={r.pendiente > 0 ? 'warn' : undefined} />
            {/* Sin texto = ningún alias puede resolverlo. Se cuenta, pero no entra a la cola:
                ofrecer resolverlo sería ofrecer un trabajo imposible. */}
            <Cifra rotulo="Sin texto" valor={r.sin_texto} tono="faint" />
            <Cifra rotulo="Total" valor={r.total} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function PendientesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  // LA PUERTA NO ES LA CERRADURA: las cuatro fuentes filtran por `ve_obra_texto()` en la base, y
  // `resolverImputacion` vuelve a preguntar quién llama. Este `if` sólo evita mostrarle a un jefe de
  // obra una pantalla que le va a salir vacía.
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <PageShell title="Pendientes de imputación">
        <NavAdministracion />
        <Aviso tono="info">Esta pantalla es de Administración.</Aviso>
      </PageShell>
    )
  }

  const [pendientes, portafolio] = await Promise.all([
    getPendientesDeImputacion(supabase),
    getPortafolio(supabase),
  ])

  if (pendientes.error || !pendientes.data) {
    return (
      <PageShell title="Pendientes de imputación">
        <NavAdministracion />
        <div data-testid="pendientes-error">
          <Aviso tono="neg" titulo="No pude leer las fuentes">{pendientes.error}</Aviso>
        </div>
      </PageShell>
    )
  }

  const obras = portafolio.data ?? []
  const nombreDeObra = (obraId: string) => obras.find((o) => o.obra_id === obraId)?.nombre ?? obraId
  const elegibles = obras.filter((o) => o.estado !== 'cerrada').map((o) => ({ obra_id: o.obra_id, nombre: o.nombre }))
  const { grupos, resumen } = pendientes.data
  const abierta = sp.c ? grupos.find((g) => g.clave === sp.c) : undefined
  const href = (clave?: string) => `/administracion/pendientes${clave ? `?c=${encodeURIComponent(clave)}` : ''}`
  const totalPendiente = resumen.reduce((a, r) => a + r.pendiente, 0)

  return (
    <PageShell
      title="Pendientes de imputación"
      subtitle="Textos de obra que aparecen en compras, pedidos, herramientas o movimientos y que todavía no se sabe a qué obra pertenecen."
    >
      <NavAdministracion />
      <ResumenFuentes resumen={resumen} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className={`min-w-0 flex-1 ${abierta ? '' : 'lg:max-w-[1000px]'}`}>
          <TablaPendientes
            grupos={grupos}
            seleccionada={abierta?.clave}
            hrefDe={href}
            nombreDeObra={nombreDeObra}
          />
          <p className="mt-3 max-w-[760px] text-[11px] leading-relaxed text-faint">
            {/* «0 pendientes» acá NO es un hueco: es la respuesta, y sale de la misma cuenta que el
                resumen de arriba. Que los dos números salgan del mismo cálculo es lo que impide que
                la pantalla se contradiga consigo misma. */}
            {/* FILAS Y TEXTOS SON DOS NÚMEROS DISTINTOS y confundirlos hace parecer que la cola es
                más larga de lo que es: dos filas que dicen lo mismo se resuelven de una sola vez.
                Los dos salen de la misma cuenta que el resumen de arriba, que es lo que impide que
                la pantalla se contradiga consigo misma. */}
            <Num className="text-faint">{totalPendiente}</Num> fila(s) sin clasificar en las cuatro
            fuentes, en <Num className="text-faint">{grupos.length}</Num> texto(s) distinto(s).
            Resolver un texto escribe una sola fila en el diccionario de obras, y esa fila vale para
            todas las filas que dicen lo mismo — las de hoy y las que entren mañana. Textos distintos
            se resuelven por separado: nunca en lote.
          </p>
        </div>
        {abierta && (
          <PanelPendiente
            grupo={abierta}
            obras={elegibles}
            resolver={resolverImputacion}
            cerrarHref={href()}
            nombreDeObra={nombreDeObra}
          />
        )}
      </div>
    </PageShell>
  )
}
