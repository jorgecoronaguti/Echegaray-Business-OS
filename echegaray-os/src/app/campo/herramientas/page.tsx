import Link from 'next/link'
import { Fragment } from 'react'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono, FilaTelefono, primarioTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { IcoAviso, IcoBuscar, IcoEscanear, IcoFlecha, IcoLista, IcoObra, IcoReloj, IcoTaller } from '@/features/herramientas/components/iconos'
import { AZUL, V } from '@/features/herramientas/components/estilo'
import { diaMes } from '@/features/herramientas/components/formato'
import { ACCION, rotuloQueHay, rotuloVerificar, verificablesDelLugar } from '@/features/herramientas/logica/acciones-lugar'
import { conLugar, lugaresParaElegir, resolverLugar } from '@/features/herramientas/logica/lugar'
import { recuentosDelLugar } from '@/features/herramientas/logica/recuento'
import { activosEn, conProblema } from '@/features/herramientas/logica/parque'
import { textoVerificacion, verificacionDe } from '@/features/herramientas/logica/verificacion'

// M01 · INICIO DE CAMPO — caminos por objetivo, y «Escanear» abajo, al alcance del pulgar.
//
// «Control físico» es «Recuento del lugar» (23/09). «Verificar el rodado» va por cada rodado o equipo que
// está HOY en este lugar (la base no asigna un rodado a una persona) y, si no hay ninguno, una fila
// para elegirlo de la lista. Se agrega «Dar de alta una
// herramienta» (M14 no tenía entrada propia más que el QR desconocido). Permisos iguales para todos:
// cualquiera mueve entre cualquier lugar.
//
// PARIDAD CON LA COMPUTADORA (dueño, 23/09/2026). Cada fila de acá existe en Ubicaciones de escritorio
// con el mismo nombre (`DetalleLugar`); los rótulos salen de `logica/acciones-lugar`. Lo que la PC tiene
// y acá NO, con su motivo:
//   · Resumen (D01): tablero para administrar; en obra no se decide con él.
//   · Planilla y Etiquetas: se imprimen; el teléfono no tiene impresora.
//   · Rodados y Maquinarias: son el Inventario filtrado por clase para COMPARAR columnas (km, papeles,
//     horómetro); acá la clase es un chip dentro de «Qué hay» y cada activo abre su ficha.
//   · Mantenimiento: la cola de lo que está mal, para planificar desde la oficina; en obra la revisión
//     se carga por activo (M03 → «Ficha de revisión»).
//   · Movimientos: SÍ le faltaba una lectura al que está parado en el lugar («¿qué se llevaron de acá?»):
//     va abajo como «Movimientos», sólo lectura, del lugar elegido.
export const dynamic = 'force-dynamic'

export default async function InicioHerramientasCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, en)

  if (!lugar) {
    const lugares = lugaresParaElegir(p, lectura.obras)
    return (
      <MarcoTelefono titulo="Herramientas" volver="/campo" pie={<Link href="/campo/herramientas/escanear" prefetch={false} style={primarioTelefono}><IcoEscanear tam={17} />Escanear</Link>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-.01em' }}>¿Dónde estás?</h1>
          <div style={{ fontSize: '13px', color: V.apagado }}>Elegí la obra o el Taller. Se puede escanear sin elegir.</div>
        </div>
        <div data-testid="elegir-lugar">
          {lugares.map((l, i) => (
            <Fragment key={l.clave}>
              {/* El cliente encabeza sus obras, como en Ubicaciones de escritorio y en la cartera (25/09). */}
              {l.cliente && l.cliente !== lugares[i - 1]?.cliente && (
                <div data-testid="cliente-telefono" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, padding: '14px 0 4px' }}>
                  {l.cliente} <span style={{ fontWeight: 400, color: V.tenue }}>{lugares.filter((x) => x.cliente === l.cliente).reduce((s, x) => s + x.cuenta, 0)}</span>
                </div>
              )}
              <FilaTelefono href={conLugar('/campo/herramientas', l.clave)} titulo={l.rotulo}
                bajada={`${l.cuenta} ${l.cuenta === 1 ? 'activo' : 'activos'}`} ultima={i === lugares.length - 1 || (!!lugares[i + 1] && lugares[i + 1].cliente !== l.cliente)} testid="lugar" />
            </Fragment>
          ))}
        </div>
        <FilaTelefono href="/campo/herramientas/buscar" icono={<IcoBuscar tam={18} color={AZUL} />} titulo="Buscar una herramienta" bajada="en todo el parque" ultima />
      </MarcoTelefono>
    )
  }

  const aca = lugar.ubicacionId ? activosEn(p, lugar.ubicacionId) : []
  const prob = aca.filter(conProblema).length
  const verificables = verificablesDelLugar(p, lugar.ubicacionId)
  const ultimoRec = lugar.ubicacionId ? recuentosDelLugar(p.recuentos, lugar.ubicacionId)[0] ?? null : null
  // La obra del lugar, para abrir Material ya acotado a ella. Un Taller no pide material.
  const obraDelLugar = !lugar.esObra ? null : lugar.ubicacionId ? (p.ubicacionPorId.get(lugar.ubicacionId)?.obra_id ?? null) : lugar.clave.startsWith('obra:') ? lugar.clave.slice(5) : null
  return (
    <MarcoTelefono
      titulo={<span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>Herramientas</span>}
      volver="/campo"
      derecha={<Link href="/campo/herramientas" prefetch={false} style={{ textDecoration: 'underline' }}>Cambiar lugar</Link>}
      pie={<Link href={conLugar('/campo/herramientas/escanear', lugar.clave)} prefetch={false} className="min-h-[52px]" style={primarioTelefono} data-testid="escanear"><IcoEscanear tam={17} />Escanear</Link>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-.01em' }} data-testid="lugar-actual">{lugar.rotulo}</h1>
        <div style={{ fontSize: '13px', color: V.apagado }}>
          {aca.length} {aca.length === 1 ? 'activo' : 'activos'} acá{prob ? ` · ${prob} con problema` : ''}
        </div>
      </div>
      <div>
        <FilaTelefono href={conLugar('/campo/herramientas/buscar', lugar.clave)} icono={<IcoBuscar tam={18} color={AZUL} />} titulo={ACCION.buscar} bajada="por nombre o código" testid="ir-buscar" />
        <FilaTelefono href={conLugar('/campo/herramientas/lugar', lugar.clave)} icono={lugar.esObra ? <IcoObra tam={18} color={V.pos} /> : <IcoTaller tam={18} color={V.warn} />}
          titulo={rotuloQueHay(lugar.esObra)} bajada={`${aca.length} ${aca.length === 1 ? 'activo' : 'activos'}`} testid="ir-lugar" />
        <FilaTelefono href={conLugar('/campo/herramientas/lugar', lugar.clave)} icono={<IcoFlecha tam={18} color={V.tinta} />} titulo={ACCION.mover} bajada="una o varias" testid="ir-mover" />
        <FilaTelefono href={conLugar('/campo/herramientas/buscar?para=reportar', lugar.clave)} icono={<IcoAviso tam={18} color={V.warn} />} titulo={ACCION.reportar} bajada="no mueve nada de lugar" testid="ir-reportar" />
        {verificables.map((a) => {
          const v = verificacionDe(p, a.id)
          return (
            <FilaTelefono key={a.id} href={conLugar(`/campo/herramientas/a/${encodeURIComponent(a.codigo)}/verificar`, lugar.clave)}
              icono={<IcoLista tam={18} color={v.tipo === 'hoy' ? V.pos : V.warn} />}
              titulo={rotuloVerificar(a)}
              bajada={v.tipo === 'hoy' ? `hecha ${textoVerificacion(v)}` : v.tipo === 'sin_base' ? 'sin la migración' : `sin verificar hoy · última: ${textoVerificacion(v)}`}
              tonoBajada={v.tipo === 'hoy' ? V.pos : undefined} testid="ir-verificar" />
          )
        })}
        {verificables.length === 0 && (
          <FilaTelefono href={conLugar('/campo/herramientas/verificar', lugar.clave)} icono={<IcoLista tam={18} color={V.apagado} />}
            titulo={ACCION.verificarElegir} bajada="antes de salir o de arrancar" testid="ir-verificar" />
        )}
        <FilaTelefono href={conLugar('/campo/herramientas/alta', lugar.clave)} icono={<IcoTaller tam={18} color={V.apagado} />} titulo={ACCION.alta} bajada="tres datos y una foto" testid="ir-alta" />
        {aca.length > 0 && (
          <FilaTelefono href={conLugar('/campo/herramientas/recuento', lugar.clave)} icono={<IcoLista tam={18} color={V.apagado} />} titulo={ACCION.recuento}
            bajada={p.recuentos == null ? 'sin la migración' : ultimoRec ? `último: ${diaMes(ultimoRec.cerrado_en!)}` : 'contar todo contra lo esperado'} testid="ir-recuento" />
        )}
        <FilaTelefono href={conLugar('/campo/herramientas/movimientos', lugar.clave)} icono={<IcoReloj tam={18} color={V.apagado} />} titulo={ACCION.movimientos} bajada={lugar.esObra ? 'qué entró y salió de esta obra' : 'qué entró y salió de acá'} testid="ir-movimientos" />
        {/* MATERIAL (dueño, 23/09/2026): el mismo módulo que la solapa «Material» de Herramientas en la computadora. */}
        <FilaTelefono href={obraDelLugar ? `/campo/material?obra=${encodeURIComponent(obraDelLugar)}` : '/campo/material'} icono={<IcoLista tam={18} color={V.apagado} />} titulo="Material" bajada="pedir y ver lo pedido" ultima testid="ir-material" />
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }}>Ves todo el parque y podés moverlo entre cualquier lugar.</div>
    </MarcoTelefono>
  )
}
