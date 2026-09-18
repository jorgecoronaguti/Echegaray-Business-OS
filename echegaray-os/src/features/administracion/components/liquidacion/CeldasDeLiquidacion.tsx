'use client'

import type { CSSProperties } from 'react'

// LAS CELDAS QUE SE ESCRIBEN EN LIQUIDACIÓN — una sola definición para las dos pantallas que las
// usan: el cuadro clásico (`CuadroLiquidacion`) y la solapa Pagos del handoff v2.
//
// ═══ POR QUÉ SE MUDARON ACÁ (dueño, 11/09/2026) ═══
//
// Textual: *«el módulo de liquidación de hs está mal hecho, no tengo celdas editables»*. La solapa
// Pagos —la que él abre— dibujaba las cuatro columnas escribibles como un `<span>` con marco de
// control y un comentario que prometía que «el `<input>` real lo monta la grilla editable». No lo
// montaba nadie: la pantalla enseñaba cuáles celdas se escriben y no dejaba escribir ninguna.
//
// La tentación era copiar el `Editable` del otro archivo. Copiarlo habría dado dos definiciones de
// «qué pasa cuando alguien corrige un adelanto»: dos formas de marcar lo manual, dos maneras de
// acusar el error del servidor y, el día que cambie la regla, una de las dos sin cambiar. Por eso se
// mudan enteras y los dos llamadores importan de acá.
//
// ═══ LAS REGLAS QUE ESTAS CELDAS NO PUEDEN ROMPER ═══
//
//  R1  NULL no es cero. Vaciar la celda manda `''` y la acción lo guarda como NULL: deja de haber
//      override y vuelve la cuenta. Un 0 tecleado SÍ se guarda —«no le doy nada por banco» es una
//      afirmación del dueño— y por eso el vacío no se puede traducir a 0 en ningún punto del camino.
//  R6  La quincena cerrada es una foto: `soloLectura` y, además, el servidor relee el estado. La
//      pantalla es la puerta, no la cerradura.
//  R8  Lo escrito a mano se ve que está escrito a mano: `Manual` pone un punto y la palabra, sin
//      fondo de color. Un importe manual disfrazado de calculado es el que nadie puede explicar
//      después frente al recibo.

import { useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { InlineEdit } from '@/shared/components/ds/InlineEdit'
import { V } from '@/shared/components/v2/patron'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import { guardarCeldaLiquidacion, guardarEfectivoRedondeado } from '../../services/liquidacionActions'
import { guardarValorHora } from '../../services/tarifaDeLaQuincenaActions'
import { accionDelRedondeo, debeGuardarAlSalir, efectivoMostrado, teclaDelRedondeo } from '../../services/efectivoRedondeado'
import { horas, pesos, textoDelRedondeo } from './formato'
import { leerNumeroEsAR } from '@/shared/lib/numeroEsAR'
import { useDeshacer } from '@/shared/components/deshacer/DeshacerProvider'

/**
 * LA UNIDAD DE LA CELDA, NO SU FORMATEADOR.
 *
 * ═══ POR QUÉ NO SE RECIBE UNA FUNCIÓN (medido en el navegador, 11/09/2026) ═══
 *
 * `CeldaEditable` recibía `formato: (n) => string`. Desde `CuadroLiquidacion` —que es un componente
 * de cliente— eso funciona. Desde la solapa Pagos —que es de SERVIDOR— rompe la pantalla entera:
 *
 *   Functions cannot be passed directly to Client Components unless you explicitly expose it
 *   by marking it with "use server".
 *
 * No lo veía ningún test de código fuente ni el typecheck: lo vio el primer `goto` del E2E, con la
 * pantalla en «No se pudo cargar el legajo de personas». Una unidad es un dato y cruza la frontera;
 * una función no. Además obliga a que las dos pantallas escriban el mismo número igual, que es lo
 * que `formato.ts` existe para garantizar.
 */
export type UnidadDeCelda = 'pesos' | 'horas'

const escribirComo = (unidad: UnidadDeCelda, ceroEsVacio: boolean) => (n: number | null): string => {
  if (n == null) return '—'
  // CERO SE DIBUJA «—» SÓLO DONDE SE PIDE: en Pagos, para que la tabla no se llene de «$0» en
  // columnas que casi siempre están vacías. Al entrar al campo, `InlineEdit` muestra el crudo, así
  // que un 0 escrito a mano —que SÍ es una afirmación— no se pierde ni se confunde con NULL.
  if (ceroEsVacio && n === 0) return '—'
  return unidad === 'horas' ? horas(n) : pesos(n)
}

/** La ventana de la quincena que viaja con cada escritura. */
export interface VentanaDeQuincena {
  desde: string
  hasta: string
}

/**
 * UN AVISO QUE PERSISTE ES UN ÍCONO, NO UN TEXTO (dueño, 15/09/2026: «tengo ese sin recalc pegado en diseño de liq
 * hs»). Un ⚠ chico junto al número, con el porqué en el `title`: no cambia el alto ni el ritmo de la fila.
 */
export function IconoDeAviso({ titulo, tono = 'warn', testid }: { titulo: string; tono?: 'warn' | 'neg'; testid?: string }) {
  return (
    <span role="img" aria-label={titulo} title={titulo} data-testid={testid}
      style={{ marginLeft: 3, flex: 'none', fontSize: '11px', lineHeight: 1, fontStyle: 'normal', cursor: 'help', color: tono === 'neg' ? V.neg : V.warn }}>⚠</span>
  )
}

/**
 * LA MARCA DE LO ESCRITO A MANO. Un punto y una palabra: ni fondo de color ni negrita.
 *
 * ═══ EN PAGOS VA SÓLO EL PUNTO ═══
 *
 * Las columnas de esa tabla son de 84 a 96 px y están fijadas por la grilla. La palabra «MANUAL» son
 * ~56 px más, y en la captura del E2E del 11/09/2026 el importe se montaba sobre la columna de al
 * lado: un número de plata pisando a otro número de plata. El punto ámbar se sigue viendo, el
 * `title` sigue explicando, y la fila deja de mentir sobre qué columna es cuál.
 */
export function Manual({ compacta = false }: { compacta?: boolean }) {
  return <MarcaDeOrigen origen="manual" compacta={compacta} />
}

/**
 * DE DÓNDE SALIÓ ESTE NÚMERO — un punto de color y, si hay lugar, la palabra.
 *
 * ═══ POR QUÉ «JORNALES» NO SE DIBUJA COMO «MANUAL» (dueño, 11/09/2026) ═══
 *
 * Desde que el espejo trae los adelantos de la planilla, una celda puede tener tres orígenes y los
 * tres significan cosas distintas a la hora de corregir:
 *
 *   calculado  la cuenta de la app. Se corrige cambiando el dato de origen.
 *   JORNALES   lo escribió el dueño en la planilla. Se corrige EN LA PLANILLA — o acá, y entonces
 *              pasa a manual y la planilla deja de mandarlo.
 *   manual     alguien lo escribió acá. Manda sobre los dos.
 *
 * Pintar JORNALES con el punto ámbar de «manual» haría creer que alguien lo tecleó en la app, y el
 * que fuera a corregirlo buscaría en el lugar equivocado. El azul es el mismo de la «L» de licencia
 * en la grilla: «esto viene de otra fuente», no «esto lo decidiste vos».
 */
export function MarcaDeOrigen({ origen, compacta = false, titulo }: {
  origen: 'calculado' | 'jornales' | 'manual'
  compacta?: boolean
  /** Lo que explica el número. En JORNALES, la diferencia contra lo que calculó la app. */
  titulo?: string
}) {
  if (origen === 'calculado') return null
  const esManual = origen === 'manual'
  return (
    <span
      data-testid={esManual ? 'marca-manual' : 'marca-jornales'}
      title={titulo ?? (esManual
        ? 'Escrito a mano: manda sobre el cálculo'
        : 'Lo dice la planilla JORNALES. Escribirlo acá lo vuelve manual y la planilla deja de mandarlo.')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginLeft: compacta ? 3 : 6, flex: 'none',
      }}>
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: '50%',
        background: esManual ? V.marca : '#175CD3', display: 'inline-block',
      }} />
      {!compacta && (
        <span style={{
          fontSize: '9.5px', letterSpacing: '.08em', textTransform: 'uppercase', color: V.tenue,
        }}>{esManual ? 'manual' : 'jornales'}</span>
      )}
    </span>
  )
}

/**
 * UNA CELDA DE LA LÍNEA. Guarda al salir del campo y acusa el error del servidor sin perder lo
 * escrito (contrato de `InlineEdit`).
 *
 * VACÍO BORRA EL OVERRIDE. `InlineEdit` manda `''` cuando se borra el campo, y la acción lo traduce
 * a NULL: convertirlo a 0 fabricaría un dato y liquidaría a alguien en cero.
 */
export function CeldaEditable({
  campo, valor, unidad, ceroEsVacio = false, manual, origen, tituloDeOrigen, personaId, quincena,
  grupo, soloLectura, ancho = 'w-24', marcaCompacta = false, rotuloDeshacer, expresion = null,
}: {
  campo: CampoEditable
  valor: number | null
  /** Pesos u horas. NO una función: un componente de servidor no puede pasarle una a uno de cliente. */
  unidad: UnidadDeCelda
  /** Dibujar el 0 como «—». Lo pide Pagos; el cuadro clásico muestra «$0». */
  ceroEsVacio?: boolean
  manual: boolean
  /** De dónde salió el número. Sin esto, JORNALES se dibujaría como si lo hubiera tecleado alguien. */
  origen?: 'calculado' | 'jornales' | 'manual'
  /** El `title` de la marca. Lo usa Pagos para publicar la diferencia contra el extracto. */
  tituloDeOrigen?: string
  personaId: string
  quincena: VentanaDeQuincena
  grupo: string
  soloLectura: boolean
  /** La clase de ancho de Tailwind. Pagos tiene columnas más angostas que el cuadro clásico. */
  ancho?: string
  /** Sólo el punto, sin la palabra: las columnas de Pagos no tienen los 56 px que ocupa. */
  marcaCompacta?: boolean
  /** Cómo se nombra en el aviso de deshacer («Banco de Rosales»). */
  rotuloDeshacer?: string
  /** La cuenta guardada de esta celda («=340909,09+197272,73»). Se ve al abrir el campo, no en reposo. */
  expresion?: string | null
}) {
  const formato = escribirComo(unidad, ceroEsVacio)
  // `origen` manda cuando viaja; `manual` sigue siendo el contrato viejo para los llamadores que
  // todavía no lo pasan. Los dos conviven UNA versión: quien no lo pase dibuja lo de siempre.
  const marca = origen ?? (manual ? 'manual' : 'calculado')
  if (soloLectura) {
    return <>{formato(valor)}<MarcaDeOrigen origen={marca} compacta={marcaCompacta} titulo={tituloDeOrigen} /></>
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end',
      minWidth: 0, maxWidth: '100%',
    }}>
      <InlineEdit
        valor={valor}
        tipo="numero"
        alineado="right"
        ancho={ancho}
        falta="—"
        etiqueta={`${campo} de ${personaId}`}
        testid={`celda-${campo}-${personaId}`}
        expresion={expresion}
        // EL «—» ABRE VACÍO (QA, 16/09/2026): donde el 0 se dibuja como ausencia y nadie lo escribió, el campo no
        // trae un «0» que haya que borrar antes de teclear. Un 0 manual sí se abre como 0.
        abrirVacio={ceroEsVacio && !manual}
        // UNA CUENTA SE MUESTRA COMO CUENTA. Lo pide el aviso de deshacer, que recibe lo que viajó a la acción:
        // `Number('=9*105')` es NaN y el aviso diría «$NaN» sobre una celda que se guardó bien.
        mostrar={(v) => (typeof v === 'string' && v.startsWith('=') ? v : formato(Number(v)))}
        // CMD/CTRL+Z: deshacer restaura el valor MANUAL anterior («sin manual» vuelve al calculado) y el servidor no
        // pisa lo que cambió (`esperado`).
        // `vacioRestaurable`: deshacer la primera corrección manual escribe `''` y la celda vuelve al calculado —
        // no queda vacía—, y el servidor verifica `esperado`. Es la excepción declarada a «nunca se vacía una celda».
        deshacer={{ anterior: manual ? String(valor ?? '') : '', verificaServidor: true, vacioRestaurable: true, rotulo: rotuloDeshacer }}
        guardar={async (v, contexto) => {
          const r = await guardarCeldaLiquidacion({
            ...quincena, grupo, persona_id: personaId, campo, valor: v.trim(), esperado: contexto?.esperado,
          })
          return r.ok ? { ok: true } : { ok: false, error: r.error }
        }}
      />
      <MarcaDeOrigen origen={marca} compacta={marcaCompacta} titulo={tituloDeOrigen} />
    </span>
  )
}

/**
 * EL $/HORA DEL CUADRO CLÁSICO. Escribe con `guardarValorHora`, que desde el 14/09/2026 es la misma
 * regla que el cuadro de la quincena (`planDeTarifa`): `desde` = inicio de la quincena, fila nueva si
 * no hay una, corrección con rastro si la hay y la quincena está abierta. Vaciar la celda ya no
 * borra la tarifa: un tipeo se corrige escribiendo el valor bueno.
 */
export function CeldaValorHora({ valor, origen, personaId, quincena, grupo, soloLectura }: {
  valor: number | null
  origen: string | null
  personaId: string
  quincena: VentanaDeQuincena
  grupo: string
  soloLectura: boolean
}) {
  if (soloLectura) return <span title={origen ?? undefined}>{pesos(valor)}</span>

  return (
    <span title={origen ?? undefined} style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
      <InlineEdit
        valor={valor}
        tipo="numero"
        alineado="right"
        ancho="w-20"
        falta="sin tarifa"
        etiqueta={`valor hora de ${personaId}`}
        testid={`celda-valorHora-${personaId}`}
        mostrar={(v) => pesos(Number(v))}
        guardar={async (v) => {
          const r = await guardarValorHora({
            ...quincena, grupo, persona_id: personaId, valor: v.trim(),
          })
          return r.ok ? { ok: true } : { ok: false, error: r.error }
        }}
      />
    </span>
  )
}

const ESTILOS_DEL_REDONDEO = new Map<number, CSSProperties>()

/** El `style` del campo del redondeo: el MISMO objeto para cada ancho, sin nada que dependa del estado. */
export function estiloDelRedondeo(ancho: number): CSSProperties {
  let e = ESTILOS_DEL_REDONDEO.get(ancho)
  if (!e) {
    e = { width: ancho, minHeight: 32, textAlign: 'right', fontSize: '12.5px', padding: '3px 6px', borderRadius: 4, background: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }
    ESTILOS_DEL_REDONDEO.set(ancho, e)
  }
  return e
}

/**
 * LA CELDA DEL DUEÑO: los billetes que entrega en mano. Viene SUGERIDA y se sobrescribe.
 *
 * Dueño, 14/09/2026: *«tiene q traer un valor de lo q corresponde en efectivo ya predeterminado con el
 * redondeo en 0 y me tiene q permitir editar»*. Las reglas viven en `efectivoRedondeado.ts`:
 *
 *   sin guardado      el sugerido precargado, en gris. Salir sin cambiarlo NO guarda nada.
 *   con guardado      ese valor, en tinta. Si el sugerido de hoy es otro, lo dice el `title`.
 *   vaciar el campo   borra lo guardado y vuelve el sugerido. Nunca escribe cero.
 *   quincena cerrada  el guardado o el sugerido, de sólo lectura.
 *
 * ═══ EL PRIMER RENDER ES EL MISMO EN EL SERVIDOR Y EN EL NAVEGADOR ═══
 *
 * QA, 14/09/2026: warning de hidratación sobre el `style` de este input. Todo lo que decide el primer
 * dibujo —texto, color, borde, `title`— sale de las props y de `efectivoMostrado`, que es puro: ni un
 * valor que sólo exista en el navegador, ni una clave de estilo que aparezca o desaparezca.
 *
 * ═══ EL ERROR SE LEE, NO SE ADIVINA (QA, 15/09/2026) ═══
 *
 * Sólo con `title` y borde rojo, seis filas de la 01/09 parecían guardadas y ninguna lo estaba. El error va en
 * texto chico y rojo debajo del campo mientras está en foco o recién falló (4 s); después queda un ⚠ rojo con el
 * `title`, para no romper el alto de la fila (dueño, 15/09/2026). Corregir o Escape lo borran. No rompe la hidratación: el error sólo existe después de un guardado en el
 * navegador, y la caja que lo contiene está siempre, con un estilo fijo.
 */
const CAJA_DEL_REDONDEO: CSSProperties = { display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }
const ERROR_DEL_REDONDEO: CSSProperties = { fontSize: 11, lineHeight: '13px', color: V.neg, whiteSpace: 'normal', maxWidth: 160, textAlign: 'right' }

export function CeldaRedondeo({ personaId, valor, enEfectivo, quincena, grupo, bloqueada, ancho = 96 }: {
  personaId: string
  valor: number | null
  /** El efectivo de la fila (`enEfectivo`). De acá sale el sugerido. */
  enEfectivo: number | null
  quincena: VentanaDeQuincena
  grupo: string
  bloqueada: boolean
  ancho?: number
}) {
  const deshacer = useDeshacer()
  const mostrado = efectivoMostrado({ efectivoRedondeado: valor, enEfectivo })
  const inicial = mostrado.valor == null ? '' : String(mostrado.valor)
  const [texto, setTexto] = useState(inicial)
  const [base, setBase] = useState(inicial)
  const [tocado, setTocado] = useState(false)
  // EN EDICIÓN SE VE EL NÚMERO; EN REPOSO, CON FORMATO (`textoDelRedondeo`). Arranca en falso en los dos lados:
  // el primer dibujo del servidor y del navegador es el mismo.
  const [enEdicion, setEnEdicion] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()
  const cancelado = useRef(false)
  const [errorReciente, setErrorReciente] = useState(false)
  // EL VALOR DE AFUERA MANDA cuando la línea se vuelve a leer del servidor, salvo mientras alguien
  // escribe. Se ajusta durante el render, no en un efecto: sin fotograma con el valor viejo.
  if (!tocado && inicial !== base) {
    setBase(inicial)
    setTexto(inicial)
  }

  const titulo = error
    ?? (mostrado.sugerido
      ? `sugerido: efectivo ${pesos(enEfectivo)} redondeado a miles`
      : (valor != null && mostrado.sugeridoAhora != null && mostrado.sugeridoAhora !== valor
        ? `guardado ${pesos(valor)} · el sugerido de hoy es ${pesos(mostrado.sugeridoAhora)}`
        : undefined))
  const gris = mostrado.sugerido && !tocado

  if (bloqueada) {
    return <span title={titulo} style={{ color: mostrado.sugerido ? V.apagado : V.tinta }}>{pesos(mostrado.valor)}</span>
  }

  // ENTER GUARDA, ESCAPE REVIERTE SIN GUARDAR, TAB GUARDA Y PASA (QA 15/09/2026: «deja cosas pegadas»). Escape saca
  // el foco en el mismo evento y ese `blur` todavía ve `tocado` de antes de revertir: la ref lo frena.
  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    const t = teclaDelRedondeo(e.key)
    if (t === 'revertir') {
      e.preventDefault(); cancelado.current = true
      setTexto(inicial); setTocado(false); setError(null)
      e.currentTarget.blur()
    } else if (t === 'guardar') { e.preventDefault(); e.currentTarget.blur() }
  }
  const fallar = (mensaje: string) => {
    setError(mensaje)
    setErrorReciente(true)
    setTimeout(() => setErrorReciente(false), 4000)
  }
  const alSalir = () => {
    // LO QUE NO ES NÚMERO NO SE GUARDA Y SE DICE (el mismo parser que el resto: `leerNumeroEsAR`).
    if (!leerNumeroEsAR(texto).ok) { fallar('número inválido'); return }
    const a = accionDelRedondeo({ texto, guardado: valor, sugerido: mostrado.sugeridoAhora })
    if (a.accion === 'nada') {
      setTocado(false)
      setTexto(inicial)
      return
    }
    empezar(async () => {
      const r = await guardarEfectivoRedondeado({
        ...quincena, grupo, persona_id: personaId, importe: a.accion === 'borrar' ? '' : String(a.importe),
      })
      if (r.ok) setError(null); else fallar(r.error)
      if (r.ok) {
        setTocado(false)
        // CMD/CTRL+Z: el redondeo guardado se puede deshacer con la misma acción.
        const nuevo = a.accion === 'borrar' ? '' : String(a.importe)
        const anterior = valor == null ? '' : String(valor)
        deshacer?.registrar({
          clave: `redondeo-${personaId}`, rotulo: 'Efectivo redondeado', anterior, nuevo,
          anteriorTexto: anterior === '' ? 'sugerido' : pesos(Number(anterior)), nuevoTexto: nuevo === '' ? 'sugerido' : pesos(Number(nuevo)),
          // `''` = vuelve al sugerido, no una celda vacía; y la acción verifica `esperado`.
          vacioRestaurable: true,
        }, (v, esperado) => guardarEfectivoRedondeado({ ...quincena, grupo, persona_id: personaId, importe: v, esperado }))
      }
    })
  }

  return (
    <span style={CAJA_DEL_REDONDEO}>
    <input
      value={textoDelRedondeo({ enEdicion, texto, valor: mostrado.valor })}
      onFocus={() => { cancelado.current = false; setEnEdicion(true) }}
      onChange={(e) => { setTocado(true); setTexto(e.target.value); setError(null) }}
      onKeyDown={alTeclear}
      onBlur={() => {
        setEnEdicion(false)
        const fueCancelado = cancelado.current
        cancelado.current = false
        // SALIR SIN HABER TECLEADO, O DESPUÉS DE ESCAPE, NO GUARDA.
        if (debeGuardarAlSalir({ tocado, cancelado: fueCancelado })) alSalir()
      }}
      disabled={guardando}
      inputMode="decimal"
      aria-label="Efectivo redondeado"
      title={titulo}
      data-testid={`redondeo-${personaId}`}
      data-sugerido={gris ? '1' : '0'}
      data-error={error ? '1' : '0'}
      // EL ESTILO ES UN OBJETO FIJO POR ANCHO, IGUAL EN EL SERVIDOR Y EN EL NAVEGADOR (QA, 14/09/2026: warning
      // de hidratación al buscar «rosales» con navegación del lado del cliente). El sugerido y el error no
      // arman otro `style`: van como atributos y los pinta la clase con los tokens.
      className="border border-line text-ink data-[sugerido='1']:text-muted data-[error='1']:border-neg"
      style={estiloDelRedondeo(ancho)}
    />
    {error && ((enEdicion || errorReciente) ? <span role="alert" data-testid={`redondeo-error-${personaId}`} style={ERROR_DEL_REDONDEO}>{error}</span>
      : <IconoDeAviso titulo={error} tono="neg" testid={`redondeo-aviso-${personaId}`} />)}
    </span>
  )
}
