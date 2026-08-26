// LO QUE PIDE TRABAJO — el libro mayor de las siete señales (00 · Home Navegación v2).
//
// ═══ POR QUÉ DEJÓ DE SER UNA BANDA DE CHIPS ═══
//
// El chip decía «14 · proveedores sin CUIT»: una cifra y un destino. Lo que no decía es lo único
// que hace que alguien deje lo que está haciendo — QUÉ SE ROMPE si eso queda así. Ahora cada señal
// es una fila con cuatro cosas: la cifra, qué falta, qué bloquea y el VERBO que lo resuelve. Es el
// criterio 2 del patrón de sección: «cada fila que reclama algo dice qué bloquea y trae su verbo a
// la derecha. No un chip que cuenta: una frase que nombra el obstáculo y un botón que lo resuelve».
//
// Y es la PRIMERA línea de contenido de la pantalla (criterio 1): lo primero que se ve es lo que
// hay que hacer, no la lista de entidades.
//
// SIN CAJAS (criterio 3): filos, tipografía y números tabulares; el color, sólo en la cifra. El
// único rojo es el duplicado —un comprobante que nadie mira se paga dos veces— y lleva además un
// filo de 2px a la izquierda de su fila. Si todo fuera rojo, el rojo no diría nada.

import Link from 'next/link'
import { Aviso } from '@/shared/components/ds'
import { C } from '@/shared/components/canon'
import { IconoBloqueo, IconoCompra, IconoHH, IconoObra, IconoProveedor } from '@/shared/components/iconos'
import { resumenDeTrabajo, type IconoSenal, type SenalTrabajo } from '../services/homeAdministracion'

/** Los tres tonos que el mockup escribe y el canon de Administración todavía no tenía nombrados. */
const TONO = {
  /** Icono de la columna «qué falta»: presente, pero por debajo del texto. */
  icono: '#A8A69F',
  /** «Dónde» se arregla, a la izquierda del verbo: es contexto, no la acción. */
  contexto: '#B5B3AC',
  /** Divisor entre filas de esta tabla. Más marcado que el de una cartera: son pocas filas. */
  divisor: '#EDECE8',
} as const

// ═══ LO QUE SE SUELTA CUANDO LA PANTALLA SE ANGOSTA (26/08/2026) ═══
//
// Medido a 390x844: 44 + 330 de columnas fijas más 42 de `gap` son 416px dentro de un contenedor de
// 350. Las dos fraccionales —«qué falta» y «qué bloquea»— caían casi a cero y el encabezado se leía
// «QUÉ FAL/TA» encima de «QUÉ BLOQUEA», con el verbo cortado contra el borde («Comp…», «Res…»).
//
// El orden en que se suelta es el de la decisión: primero el DÓNDE se arregla, que es contexto
// («Compras · duplicados»); después «qué bloquea», que es la justificación. Nunca se sueltan la
// CIFRA ni «qué falta» ni el VERBO: son las tres cosas con las que alguien decide dejar lo que está
// haciendo. Y la fila sigue siendo un enlace al lugar donde se resuelve, así que lo que se suelta
// está a un toque.
//
// Como CLASE y no inline: `gridTemplateColumns` en el atributo `style` le gana a la media query.
const COLS
  = 'grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1fr)_330px]'
  + ' max-[1249px]:grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1fr)_150px]'
  + ' max-[767px]:grid-cols-[36px_minmax(0,1fr)_120px]'

/** El «dónde» que precede al verbo: contexto, no la acción. */
const SUELTA_ANCHO = 'max-[1249px]:hidden'
/** «Qué bloquea»: en 350px no entran tres columnas de texto sin estrangular las otras dos. */
const SUELTA_TELEFONO = 'max-[767px]:hidden'

const ICONOS: Record<IconoSenal, (p: { className?: string }) => React.ReactElement> = {
  bloqueo: IconoBloqueo,
  proveedor: IconoProveedor,
  compra: IconoCompra,
  obra: IconoObra,
  tiempo: IconoHH,
}

export function LibroDeTrabajo({ senales, noLeida }: { senales: SenalTrabajo[]; noLeida: boolean }) {
  return (
    // EL ÚNICO `h1` DE LA PANTALLA, y va acá: sin encabezado de página, el título de lo primero que
    // se hace es el título. Una pantalla sin `h1` deja al lector de pantalla sin punto de entrada.
    <div style={{ padding: '24px 20px 0' }} data-testid="admin-atencion">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h1 style={{ fontSize: '16px', fontWeight: 600, color: C.tinta, letterSpacing: '-.01em' }}>
          Lo que pide trabajo
        </h1>
        <span style={{ fontSize: '12px', color: C.tenue }} data-testid="resumen-trabajo">
          {noLeida
            ? 'no se pudo leer ninguna de las siete señales'
            : senales.length ? resumenDeTrabajo(senales) : 'nada pendiente de las siete señales'}
        </span>
      </div>

      {noLeida && (
        <Aviso tono="warn" titulo="No pude leer los pendientes del área" testid="admin-atencion-sin-lectura">
          Ninguna de las fuentes de atención respondió. Esta pantalla no puede afirmar que no haya
          nada que resolver.
        </Aviso>
      )}

      {/* NORMAL SILENCIOSO: sin pendientes no hay tabla, sólo el renglón de arriba diciéndolo. Una
          tabla con encabezados y sin filas se lee como si algo se hubiera roto. */}
      {!noLeida && senales.length > 0 && (
        <>
          <div className={COLS} style={{ ...grilla, alignItems: 'end', height: 26, borderBottom: `1px solid ${C.lineaFuerte}` }}>
            <span style={{ ...rotulo, textAlign: 'right' }}>N.º</span>
            <span style={rotulo}>Qué falta</span>
            <span className={SUELTA_TELEFONO} style={rotulo}>Qué bloquea</span>
            <span style={{ paddingBottom: 6 }} />
          </div>

          {senales.map((s) => {
            const Icono = ICONOS[s.icono]
            return (
              <Link
                key={s.clave}
                href={s.href}
                prefetch={false}
                data-testid={`atencion-${s.clave}`}
                className={COLS}
                style={{
                  ...grilla,
                  alignItems: 'center',
                  height: 38,
                  borderBottom: `1px solid ${TONO.divisor}`,
                  // El filo rojo de 2px a la izquierda: la fila que ya está mal se encuentra sin leer.
                  boxShadow: s.tono === 'neg' ? `inset 2px 0 0 ${C.neg}` : 'none',
                }}
              >
                {/* EL COLOR, SÓLO EN LA CIFRA. Y `—` cuando no se pudo leer: la columna de al lado
                    dice por qué, así que no es un guion mudo. */}
                <span
                  className="font-mono tabular-nums"
                  style={{
                    fontSize: '15px', fontWeight: 600, textAlign: 'right',
                    color: s.numero === null ? C.tenue : s.tono === 'neg' ? C.neg : C.warn,
                  }}
                >
                  {s.numero === null ? '—' : s.numero}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ display: 'flex', color: TONO.icono, flexShrink: 0 }}>
                    <Icono className="h-[14px] w-[14px]" />
                  </span>
                  <span className="truncate" style={{ fontSize: '12.5px', color: C.tinta }}>{s.texto}</span>
                </span>
                <span className={`truncate ${SUELTA_TELEFONO}`} style={{ fontSize: '12px', color: C.apagado }}>{s.bloquea}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, justifyContent: 'flex-end', paddingRight: 2, minWidth: 0 }}>
                  <span className={`truncate ${SUELTA_ANCHO}`} style={{ fontSize: '11.5px', color: TONO.contexto }}>{s.donde}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 500, color: C.tinta, flexShrink: 0 }}>
                    {s.accion} →
                  </span>
                </span>
              </Link>
            )
          })}
        </>
      )}
    </div>
  )
}

/** Lo que SÍ puede ir inline: ni el `display` ni el `gap` cambian con el ancho. */
const grilla: React.CSSProperties = { display: 'grid', gap: 14 }

const rotulo: React.CSSProperties = {
  fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: C.tenue, paddingBottom: 6,
}
