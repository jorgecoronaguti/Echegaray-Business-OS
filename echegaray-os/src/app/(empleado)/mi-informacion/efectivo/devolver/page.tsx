import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMiEfectivo, getMisDevoluciones } from '@/features/efectivo/campo/datos'
import { abiertas, cifra, conVuelta, destino, diaMes, pesos, resumenMiEfectivo } from '@/features/efectivo/campo/logica'
import { Caja, CifraGrande, Contorno, Renglon, Rotulo, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo } from '@/features/efectivo/campo/components/TarjetasHoy'
import { DevolverYFirmar, type EntregaParaDevolver } from '@/features/efectivo/campo/components/DevolverYFirmar'

// M08 · DEVOLVER EL VUELTO — porte de `efectivo-a-rendir.dc.html`, pantalla M08.
//
// ═══ QUIÉN HACE QUÉ, Y POR QUÉ SON DOS ACTOS ═══
//
// El mockup dice «Devolver y firmar» y abajo «Queda registrado con las dos firmas. Administración lo
// confirma al recibirlo». Eso son DOS hechos y la base los guarda como dos: la persona DECLARA cuánto
// devuelve y lo firma (`declarar_devolucion_efectivo`), y quien recibe la plata la CONFIRMA cuando la
// cuenta (`registrar_devolucion_efectivo`, que confirma la declaración que coincide en vez de duplicarla).
//
// Lo declarado NO baja el saldo. La plata sigue en la mano de la persona hasta que alguien la recibe, y
// una pantalla que la descontara antes sería una forma de dejar de deber plata sin moverla de lugar. Lo
// que sí hace es descontarse del TOPE: declarar dos veces $ 172.300 con $ 172.300 en la mano no se puede.

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string }>

export default async function DevolverPage({ searchParams }: { searchParams: Params }) {
  const ctx = await contextoEfectivo(await searchParams)
  const volver = { href: ctx.volverA, label: 'Mi efectivo' }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Devolver efectivo" volver={{ ...volver }}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }
  const lectura = await getMiEfectivo(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Devolver efectivo" volver={{ ...volver }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const r = resumenMiEfectivo(lectura.dato.entregas, lectura.dato.tickets)
  const enLaMano = Math.max(0, r.tengoQueRendir)
  const devoluciones = await getMisDevoluciones(ctx.supabase, r.entregas.map((e) => e.id))
  const declaradas = devoluciones.estado === 'ok' ? devoluciones.dato.filter((d) => d.estado === 'declarada') : []
  const declaradoPor = (id: string) => declaradas.filter((d) => d.entrega_id === id).reduce((s, d) => s + d.monto, 0)

  // Sólo las que tienen algo para devolver. Una entrega ya rendida entera no entra al selector: elegirla
  // sería elegir un cero.
  const paraDevolver: EntregaParaDevolver[] = r.entregas
    .map((e) => ({ id: e.id, codigo: e.codigo, destino: destino(e), disponible: Math.max(0, e.en_su_poder - declaradoPor(e.id)) }))
    .filter((e) => e.disponible > 0)

  // A quién llevársela: quienes le entregaron la plata. El que no tiene persona vinculada en su perfil
  // igual se ofrece —con `id: null`— porque el nombre es cierto aunque la base no pueda guardarlo.
  const quienes = [...new Map(
    r.entregas
      .filter((e) => e.entregada_por_nombre)
      .map((e) => [e.entregada_por_nombre!, { id: e.entregada_por_persona ?? null, nombre: e.entregada_por_nombre! }]),
  ).values()]

  return (
    <PantallaEmpleado titulo="Devolver efectivo" volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
        {r.entregas.length === 0 ? <SinEfectivo esperandoFirma={abiertas(lectura.dato.entregas).some((e) => !e.conformidad)} /> : (
          <Caja testid="devolver-en-la-mano">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Rotulo>Tenés en la mano</Rotulo>
              <CifraGrande>{pesos(enLaMano)}</CifraGrande>
            </div>
            {r.pendienteMonto > 0 && (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, paddingTop: 12, borderTop: `1px solid ${C.divisorSuave}` }}>
                Los {cifra(r.pendienteMonto)} que mandaste todavía no están en Compras: si devolvés todo, van a quedar
                sin respaldo.
              </div>
            )}
          </Caja>
        )}

        {declaradas.length > 0 && (
          <Caja fondo={C.warnFondo} borde={C.warnBorde} gap={9} relleno="16px 18px" testid="devolver-ya-declaradas">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.warn }}>
              {declaradas.length === 1 ? 'Ya firmaste una devolución' : `Ya firmaste ${declaradas.length} devoluciones`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {declaradas.map((d) => (
                <Renglon
                  key={d.id}
                  rotulo={`${d.entrega} · ${diaMes(d.fecha)} · a ${d.recibe ?? 'Administración'}`}
                  valor={cifra(d.monto)}
                  numero
                />
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: C.inkSuave, lineHeight: 1.5 }}>
              Tu saldo baja cuando cuenten la plata y la reciban. Hasta entonces sigue figurando en tu mano.
            </div>
          </Caja>
        )}

        {devoluciones.estado === 'error' && (
          <AvisoError testid="devolver-sin-devoluciones">
            No pude leer tus devoluciones anteriores: {devoluciones.error}. El monto de abajo puede no contar lo que
            ya declaraste.
          </AvisoError>
        )}

        {paraDevolver.length > 0 ? (
          <DevolverYFirmar entregas={paraDevolver} quienes={quienes} volverA={ctx.volverA} />
        ) : r.entregas.length > 0 && (
          <Caja gap={10} relleno="16px 18px" testid="devolver-nada-que-devolver">
            <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
              {declaradas.length
                ? 'Ya declaraste todo lo que tenías en la mano. Llevásela a quien te la dio.'
                : 'No te queda efectivo sin rendir para devolver.'}
            </div>
            <Contorno href={conVuelta('/mi-informacion/efectivo/rendir', ctx.sufijo)} testid="devolver-primero-rendir">
              Rendir un gasto
            </Contorno>
          </Caja>
        )}
      </div>
    </PantallaEmpleado>
  )
}
