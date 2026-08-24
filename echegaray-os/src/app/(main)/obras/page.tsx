// 01 OBRAS · CARTERA — encontrar y abrir una obra. Nada más que eso.
//
// El dueño (20/08), textual: *"Quiero una vista ejecutiva MUY limpia de todas las obras. NO
// desplegar actividades. NO convertir esto en dashboard. NO meter todos los dominios."*
//
// ═══ ESTA PÁGINA DECIDE QUÉ SE LEE; EL MOCKUP DECIDE CÓMO SE VE (24/08/2026) ═══
//
// El dibujo entero se fue a `components/CarteraObras.tsx`, que es el porte LITERAL de
// «01 · Obras Cartera.dc.html»: sus px, sus colores y su grilla de nueve columnas. Acá queda lo que
// una pantalla no puede delegar —qué consultas salen, con qué permiso, y qué se hace con lo que no
// se pudo leer—, que es exactamente lo que el mockup no puede saber.
//
// LO QUE EL ZIP SACÓ DE LA TABLA: la columna ETAPA, la columna CONTRATADO y la columna COSTO REAL.
// Contratado no se pierde —el zip lo pone en el pie, que es donde se lee una vez y no trece—; costo
// real sí sale de esta pantalla, y su lugar es la solapa Economía de la obra, que es donde se
// decide sobre él. La única exclusión que el dueño dejó por escrito (MARGEN) sigue viva.
//
// LO COMERCIAL DEPENDE DEL ROL, Y NO POR LA PANTALLA. «Contratado» sólo lo ve Administración, y el
// filtro NO es este `esAdmin`: el dato ya viene en NULL desde `obra_panel`, que lo enmascara en
// Postgres (ver `20260819T0400_economia_comercial_solo_administracion.sql`). Acá sólo se evita
// dibujar una columna de guiones.
//
// FUENTE: la vista `obra_panel`, que sale de `obra_canonica` cruzada con `obra_costo_real`. NO se
// lee `public.obras` legacy —era la tabla con 4 obras pausadas que hacía que la web dijera "0 obras
// activas" mientras cuatro obras facturaban $287M—, y tampoco `obra_canonica` cruda: un `select('*')`
// sobre ella devuelve 403 para todos, Administración incluida.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPortafolio, getPlanVsRealPortafolio } from '@/features/obras/services/obrasService'
import { RecordarVista } from '@/features/obras/components/RecordarVista'
import { CarteraObras, type FilaCartera } from '@/features/obras/components/CarteraObras'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { getSenalesCartera } from '@/features/obras/services/senalesCarteraService'
import { personasQueFicharon } from '@/features/obras/services/senalesCartera'
import { EstadoError } from '@/shared/components/estado'

export const dynamic = 'force-dynamic'

export default async function ObrasPage({
  searchParams,
}: {
  searchParams: Promise<{ archivadas?: string }>
}) {
  const { archivadas: verArchivadas } = await searchParams
  const conArchivadas = verArchivadas === '1'

  const supabase = await createClient()
  // EL DÍA LO FIJA EL SERVIDOR: ni el plazo ni las señales de hoy pueden depender del reloj del
  // navegador que las mira.
  const hoyIso = new Date().toISOString().slice(0, 10)
  // LAS CUATRO LECTURAS SALEN JUNTAS. Contra Vercel una cascada se paga cara: la función corre en
  // iad1 y la base está en São Paulo, así que cada viaje encadenado son ~120 ms de puro cable.
  // Ninguna de las señales es la razón por la que se abre esta pantalla, así que ninguna puede
  // empujar la tabla hacia atrás: si una falla, la cartera se dibuja igual y el pie dice qué no se
  // pudo mirar.
  const [perfil, { data, error }, { data: planes }, senales] = await Promise.all([
    getPerfilActual(supabase),
    getPortafolio(supabase),
    getPlanVsRealPortafolio(supabase),
    getSenalesCartera(supabase, hoyIso),
  ])
  if (error) return <EstadoError mensaje={error} que="la cartera de obras" />

  // El nivel del usuario decide si se DIBUJA el pie comercial. Falla al nivel MENOS privilegiado.
  const esAdmin = esAdministracion(perfil.data?.rol ?? null)
  const todas = data ?? []
  const porObra = new Map((planes ?? []).map((p) => [p.obra_id, p]))

  // ARCHIVADA = `cerrada`. La obra terminada sale de la cartera; la `pausada` NO — sigue siendo un
  // compromiso abierto aunque hoy no avance, y esconderla sería esconder trabajo pendiente.
  const archivadas = todas.filter((o) => o.estado === 'cerrada')
  const visibles = conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')

  const filas: FilaCartera[] = visibles.map((o) => {
    const p = porObra.get(o.obra_id)
    return {
      obra_id: o.obra_id,
      nombre: o.nombre,
      cliente_slug: o.cliente_slug,
      cliente_nombre: o.cliente_nombre,
      cliente_texto: o.cliente_texto,
      estado: o.estado,
      etapa: o.etapa,
      avance_pct: o.avance_pct,
      fecha_inicio_plan: o.fecha_inicio_plan,
      fecha_fin_plan: o.fecha_fin_plan,
      // EL ATRASO DE LA CARTERA SALE DE ACÁ (ver `services/carteraCanon.ts`): fin proyectado al
      // ritmo medido contra el fin comprometido. No de `desvio_plazo_dias`, que compara el plan
      // contra su propia línea base y daba 0 en las once obras vivas.
      forecast_fin: o.forecast_fin,
      monto_contratado: o.monto_contratado,
      hh_plan: p?.hh_plan ?? p?.hh_estimada ?? null,
      hh_real: p?.hh_real ?? null,
      // `null` NO ES `false`: lectura caída y «todavía no cargó» son dos huecos distintos, y el
      // mockup dibuja un ícono distinto para cada uno (o ninguno).
      conParte: senales.partesHoy == null ? null : senales.partesHoy.has(o.obra_id),
      impedimentos: senales.impedimentos ? (senales.impedimentos.get(o.obra_id) ?? 0) : null,
    }
  })

  // PERSONAS HOY se cuenta sobre las obras que SE VEN: un número que habla de obras que no están en
  // la pantalla no se puede verificar mirándola.
  const personasHoy = senales.ficharon
    ? personasQueFicharon(senales.ficharon, filas.map((f) => f.obra_id))
    : null

  return (
    <>
      {/* GUARDA CÓMO QUEDÓ ESTA VISTA. Es lo único que corre en el navegador de esta pantalla, y
          está acá y no en el middleware porque una precarga de Next no monta nada: sólo se guarda
          lo que alguien está mirando de verdad. */}
      <RecordarVista />
      <CarteraObras
        obras={filas}
        personasHoy={personasHoy}
        esAdmin={esAdmin}
        sinDato={senales.sinDato.map((s) => `No pude leer ${s.senal}: ${s.error}`)}
        pie={
          // LA PUERTA DE VUELTA. El mockup no dibuja las archivadas —no las tiene— y la base sí:
          // sin esta línea, archivar sería indistinguible de borrar para quien mira la pantalla,
          // que es la única prueba que le importa al que la usa.
          archivadas.length > 0 ? (
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#91918B' }} data-testid="pie-archivadas">
              {conArchivadas ? (
                <>
                  Se muestran también {archivadas.length} obra{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'}.{' '}
                  <Link href="/obras" style={{ color: '#1F1F1E', textDecoration: 'underline' }}>Ocultarlas</Link>.
                </>
              ) : (
                <>
                  {archivadas.length} obra{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'} fuera de esta lista.{' '}
                  <Link href="/obras?archivadas=1" data-testid="ver-archivadas"
                    style={{ color: '#1F1F1E', textDecoration: 'underline' }}>Verlas</Link>.
                </>
              )}
            </p>
          ) : null
        }
      />
    </>
  )
}
