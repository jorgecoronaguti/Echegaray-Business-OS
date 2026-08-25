// PENDIENTES DE IMPUTACIÓN — los textos que nadie clasificó, con lo que hace falta para clasificarlos.
//
// ═══ LO PRIMERO QUE SE VE ES EL TRABAJO, NO UN MAESTRO ═══
//
// La primera línea de contenido es la cola: cuántos textos esperan una decisión. El inventario de
// las cuatro fuentes —845 compras, 17 pedidos, 149 herramientas, 53 movimientos— queda debajo de la
// cola y en letra chica, porque no es lo que hay que hacer: es el contexto de lo que hay que hacer.
//
// ═══ LOS CINCO NÚMEROS DE CADA FUENTE, Y POR QUÉ NO ALCANZA CON DOS ═══
//
// El encargo llegó con «Compras 533/845». Esas 312 filas de diferencia NO son trabajo pendiente:
// son filas que alguien YA declaró costo de estructura (Administración, Taller, F931, UOCRA…).
// Confundirlas con pendientes manda a resolver algo resuelto, y peor, invita a imputarle a una obra
// costo que es de la empresa. Por eso cada fuente separa a-una-obra · estructura · pendientes ·
// sin-texto · total: sin eso, la pantalla contestaría «faltan 312» a una pregunta cuya respuesta
// real es «falta 1».
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No propone obras por parecido de nombre. «Sugerido» sale vacío salvo que exista evidencia —un
// juicio humano previo sobre el MISMO texto, o un proveedor que nunca compró para otra obra—, y
// cuando sale, dice por qué. Hoy, con los datos reales, no sale nunca: no hay evidencia para el
// único texto pendiente. Eso es el comportamiento correcto, no una falta.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { resolverImputacion } from '@/features/obras/services/actionsImputacion'
import { PageShell } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { PendientesTrabajo } from '@/features/administracion/components/PendientesTrabajo'
import {
  getObrasParaImputar, getPendientesDeImputacion,
} from '@/features/administracion/services/imputacionService'

export const dynamic = 'force-dynamic'

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <PageShell title="Pendientes de imputación" encabezado={false}>
      <NavAdministracion />
      {children}
    </PageShell>
  )
}

export default async function PendientesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()

  // LAS TRES LECTURAS ARRANCAN JUNTAS, INCLUIDA LA DEL PERFIL.
  //
  // Antes el perfil se esperaba SOLO y recién después salían los datos: ~200 ms de ida y vuelta
  // puestos en serie delante de todo lo demás. Se pueden solapar porque LA PUERTA NO ES LA
  // CERRADURA — las cuatro fuentes filtran por `ve_obra_texto()` en la base y `resolverImputacion`
  // vuelve a preguntar quién llama—, así que arrancar la lectura antes de saber el rol no muestra
  // de más: a quien no le corresponde, la base le devuelve lo suyo y esta página ni lo dibuja.
  const [perfil, pendientes, obras] = await Promise.all([
    getPerfilActual(supabase),
    getPendientesDeImputacion(supabase),
    getObrasParaImputar(supabase),
  ])

  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return <Marco><Aviso tono="info">Esta pantalla es de Administración.</Aviso></Marco>
  }

  if (pendientes.error || !pendientes.data) {
    return (
      <Marco>
        <div data-testid="pendientes-error">
          <Aviso tono="neg" titulo="No pude leer las fuentes">{pendientes.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const { grupos, resumen } = pendientes.data
  // Una obra cerrada no recibe costo nuevo: ofrecerla es ofrecer imputar contra un cierre.
  const elegibles = (obras.data ?? []).filter((o) => o.estado !== 'cerrada')
  const clasificadas = resumen.reduce((a, r) => a + r.obra + r.estructura, 0)
  const totalFilas = resumen.reduce((a, r) => a + r.total, 0)
  const mil = (n: number) => n.toLocaleString('es-AR')

  return (
    <Marco>
      {/* LA CIFRA ES LO QUE HAY QUE HACER, Y ES EL ÚNICO COLOR DE LA PANTALLA. Cuenta TEXTOS, no
          filas: dos filas que dicen lo mismo se resuelven de una sola vez, y contarlas por separado
          haría parecer la cola más larga de lo que es. */}
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="flex items-baseline gap-[11px]">
          <span
            data-testid="textos-pendientes"
            className={`font-mono text-[38px] font-semibold leading-[.9] tracking-[-0.02em] tabular-nums ${
              grupos.length ? 'text-warn' : 'text-pos'
            }`}
          >{grupos.length}</span>
          <div>
            <h1 className="text-[17px] font-semibold leading-tight text-ink">
              {grupos.length === 1 ? 'texto espera una decisión' : 'textos esperan una decisión'}
            </h1>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {mil(clasificadas)} de {mil(totalFilas)} filas ya están clasificadas
            </div>
          </div>
        </div>
        <p className="ml-auto max-w-[330px] text-right text-[11.5px] leading-relaxed text-faint text-pretty">
          Un texto resuelto escribe una fila en el diccionario de obras y vale para todas las filas
          que digan lo mismo — hoy y mañana.
        </p>
      </div>

      <PendientesTrabajo
        grupos={grupos}
        resumen={resumen}
        obras={elegibles}
        resolver={resolverImputacion}
        claveInicial={sp.c ?? null}
      />
    </Marco>
  )
}
