// QUÉ REHACE EL AGENTE DEL FLUJO DE CAJA, Y QUÉ PESTAÑA DEJA CADA PASO.
//
// POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL AGENTE (21/07). La tercera columna —qué pestañas deja cada
// script— es lo que permite contestar "¿queda alguna pestaña derivada que no mantiene nadie?" sin
// que alguien se acuerde de mirar. Así apareció Recurrentes: el Cash Flow Mensual leía de ella su
// proyección y no la rehacía ningún script. Para que el auditor pueda leer esta lista sin ejecutar
// el agente entero, la lista vive en su propio archivo.
//
// EL ORDEN NO ES COSMÉTICO: cada paso lee lo que escribió el anterior.

// El nombre de la pestaña se IMPORTA de su generador: escrito a mano acá, el día que cambie queda
// una entrada que no corresponde a ninguna pestaña y el censo de dueños la reporta como huérfana.
import { PESTANA_CALENDARIO } from './calendario-cobros.mjs'

export const PASOS = [
  // PRIMERO DE TODOS: los jornales entran al archivo desde OTRO Sheet (JORNALES). Si el espejo no
  // se refresca, todo lo que sigue calcula sobre una foto vieja y ningún control lo ve — pasó el
  // 21/07: la quincena en curso quedó $1.231.963 por debajo de la real.
  ['espejar-jornales.mjs', 'espejo del archivo JORNALES (_J_OBREROS y _J_OFICINA)', ['_J_OBREROS', '_J_OFICINA']],
  // ═══ LOS RECIBOS, JUNTO AL ESPEJO DE LA PLANILLA (31/08) ═══
  //
  // `_RECIBOS_RAW` nació el 31/08 y quedó fuera de esta lista: la Nómina la cita por fórmula
  // —«POR BANCO», «ADELANTO», «YA TRANSFERIDO» y las liquidaciones finales salen todas de ahí— y
  // nadie la refrescaba. Una réplica sin dueño no da error: envejece, y la pestaña que la lee
  // publica la quincena pasada con cara de actual. Es exactamente lo que le pasó al espejo de
  // JORNALES en julio, $1.231.963 abajo.
  //
  // Va pegada al espejo porque es el otro insumo de lo mismo: el espejo trae las horas del dueño y
  // ésta lo que liquidó el estudio y lo que salió del banco.
  ['recibos-raw-pestana.mjs', '_RECIBOS_RAW — los recibos del estudio y lo ya transferido, dentro del Sheet', ['_RECIBOS_RAW']],
  // ═══ EL ESLABÓN QUE FALTABA (06/08) ═══
  //
  // `Parámetros!A72` declara desde el primer día que el bloque de índices "lo actualiza el OS solo
  // desde la web" y NINGÚN script lo escribía: cinco lectores, cero escritores. La base sí se
  // refrescaba, así que la planilla y el OS proyectaban con índices distintos (julio 2,0% contra
  // 1,8%) sin un solo error a la vista. Va ACÁ ARRIBA porque Recurrentes, Estructura y el cash flow
  // leen ese bloque: si se escribe después, todos ellos calculan una corrida atrasados.
  ['parametros-inflacion.mjs', 'Parámetros — el bloque de índices, bajado de public.indice_economico con su fecha de lectura', ['Parámetros']],
  // UN SOLO DUEÑO PARA JORNALES. Antes eran dos: la tool de sincronización de nómina escribía el
  // cuadro de quincenas y jornales-escala-uocra.mjs el bloque de la escala. Dos escritores sobre una
  // pestaña es lo que produce anchos de grilla mezclados, bloques huérfanos y —acá— el techo de 14
  // quincenas, porque la fila que insertaba uno caía fuera del rango que sumaba el otro.
  // Este generador escribe la pestaña ENTERA y publica sus rangos con nombre para las demás.
  // NÓMINA ANTES QUE JORNALES POR QUINCENA, y el orden importa: desde el 29/08 la fila de pago de
  // «Jornales por Quincena» CITA la fila de total de Nómina en vez de recalcularla. Si Nómina se
  // escribiera después, esa fila leería la corrida anterior — el mismo desfase de una vuelta que ya
  // pagamos con _CRUCE_ARCA.
  //
  // Lleva `--aplicar` porque sin la bandera el generador imprime y no escribe: dentro del pipeline
  // eso sería un paso que dice «✓» sin haber hecho nada, que es la peor de las salidas.
  ['nomina-pestana.mjs', 'Nómina y Plantel — qué se le paga a cada uno mañana y con qué papeles', ['Nómina', 'Plantel'], ['--aplicar']],
  ['jornales-pestana.mjs', 'Jornales por Quincena — quincenas reales, proyección y control de convenio', ['Jornales por Quincena']],
  // SEGUNDO: devolver la fórmula a las celdas calculadas que alguien pisó pegando un valor. Va
  // antes de todo cálculo porque una celda pisada no grita: muestra un número creíble que dejó de
  // actualizarse. El 21/07 había cuatro, y dos de ellas hacían que dos cobros de $16.200.000
  // quedaran fuera de cualquier filtro por mes.
  ['columnas-calculadas.mjs', 'devolver la fórmula a las celdas calculadas pisadas a mano', []],
  // La réplica de ARCA va ANTES de Impuestos: esa pestaña la referencia con fórmulas y necesita que
  // los comprobantes ya estén en el archivo. Es el mismo orden que el espejo de JORNALES.
  ['banco-raw-pestana.mjs', '_BANCO_RAW — el extracto del Santander dentro del Sheet', ['_BANCO_RAW']],
  ['arca-raw-pestana.mjs', '_ARCA_RAW — los comprobantes de ARCA dentro del Sheet', ['_ARCA_RAW']],
  ['rubro-caja-sheet.mjs', 'la columna "Rubro de caja" de Compras — de acá cuelga todo lo demás', []],
  // ═══ EL CRUCE CONTRA ARCA NUNCA ESTUVO EN ESTA LISTA (14/08/2026) ═══
  //
  // `_CRUCE_ARCA` tenía generador desde el 04/08, tenía dueño y NO corría: última escritura el 04/08.
  // No es una réplica dormida — de ella cuelga el bloque "3 · RESPALDO FISCAL" que comparten
  // Materiales, Estructura y Recurrentes, y que es el ÚNICO control del archivo que no se valida
  // contra Compras. Medido en Materiales el 14/08: 290 celdas leyendo la pestaña, $88.078.801 en la
  // línea "sin comprobante en el libro". Un control que mide contra una foto de hace diez días afirma
  // una cobertura fiscal que ya no es la de hoy, y no da un solo error.
  //
  // VA ACÁ POR DEPENDENCIA: DESPUÉS de `rubro-caja-sheet.mjs`, porque clasifica cada discrepancia por
  // el rubro de caja de Compras (columna AC) y sin esa columna escrita el cruce reparte los montos por
  // una columna vieja; y ANTES de sus tres lectoras —Recurrentes, Materiales y Estructura—, que la
  // suman con SUMIFS en la misma corrida.
  ['cruce-arca-pestana.mjs', '_CRUCE_ARCA — una fila por discrepancia entre Compras y el libro de IVA de ARCA', ['_CRUCE_ARCA']],
  // Recurrentes va ANTES del cash flow: el cuadro lee de ella su proyección y necesita que exista.
  ['recurrentes-pestana.mjs', 'Recurrentes — servicios fijos, sin proyectar meses ya cerrados', ['Recurrentes']],
  // ═══ LAS DOS VISTAS DE CASH FLOW SON UNA MATRIZ: CONCEPTO × TIEMPO (06/08) ═══
  //
  // `cash-flow-rehacer.mjs` escribía las mismas dos pestañas como una matriz de 51 columnas. Pasaron
  // por un diseño de bloques verticales que el dueño rechazó —98 filas para catorce días— y volvieron
  // a la forma de siempre: una fila por concepto, el tiempo a la derecha. Lo escribe
  // `cash-flow-vistas.mjs`. El viejo SALE de esta lista, no se comenta "por las dudas": dos escritores
  // sobre una misma pestaña es lo que produce el candado falso —el que escribe último sella la firma y
  // el otro se auto-canda—, y encima cada uno impondría una estructura distinta cada dos horas.
  //
  // EL PASO NO ESTÁ ACÁ: vive abajo, después del libro y de CAJA, que son sus dos fuentes. El motivo
  // está escrito en su lugar nuevo.
  //
  // El presupuesto va PRIMERO porque el Mensual cita sus rangos con nombre, igual que _CAJA_ANEXO antes
  // de CAJA: un nombre que todavía no existe deja #NAME? en la pestaña que el dueño abre todos los días.
  // (Lo publica el mismo script `cash-flow-vistas.mjs`, en su primer paso.)
  //
  // LOS NOMBRES SON LOS DE HOY. Declaraba las cuatro pestañas del diseño viejo —"Proveedores —
  // Deuda", "Proveedores — Cuenta Corriente"…— que dejaron de existir cuando el bloque se unificó en
  // una sola pestaña "Proveedores". Con nombres que no existen, el control de "todo se actualiza
  // solo" daba a Proveedores por huérfana aunque este script la rehaga en cada corrida.
  // ═══ "Proveedores" TIENE CINCO GENERADORES Y SÓLO UNO CORRÍA (05/08) ═══
  //
  // Acá había una sola línea: el generador de texto. Los otros cuatro —las dos tablas dinámicas, las
  // notas del dueño y el encabezado— sólo se ejecutaban si alguien los corría a mano. Es el modo de
  // falla más silencioso que tiene este archivo, y esta vez se pudo medir: `ANCHOS_PROVEEDORES` se
  // declaró como fuente única el 04/08 y **nunca llegó al Sheet**, porque quien los aplica es
  // `proveedores-encabezado-aplicar.mjs` y no estaba en esta lista. `auditar-pantalla.mjs` seguía
  // reportando 107 textos cortados contra anchos viejos de 60px y 28px que ya nadie defendía.
  //
  // EL ORDEN NO ES COSMÉTICO — cada uno necesita lo que dejó el anterior:
  //
  //   1. la columna derivada `CUIT (OS)` en Compras: es el ORIGEN del segundo campo de la sección 2.
  //   2. el generador de texto: escribe de la frontera para abajo y deja los títulos "3 · …", "4 · …",
  //      "5 · …". La sección 2 se ubica por "el título de la sección que sigue": sin ese "3 ·" no
  //      tiene límite inferior y no escribe.
  //   3. y 4. las dos dinámicas, que reservan filas antes del título de abajo y devuelven el sobrante.
  //   5. las notas del dueño, que se resuelven contra los nombres que la dinámica del cuadro A acaba
  //      de emitir (y de paso agrega la tercera columna de _PROVEEDORES_OS, que el paso 1 deja en dos).
  //   6. el encabezado, ÚLTIMO: su guarda aborta si la sección 1 se movió hacia arriba, así que
  //      necesita que ya esté donde va — y es el único que aplica los anchos de toda la pestaña.
  //
  // NINGUNO DE LOS CUATRO NUEVOS DECLARA "Proveedores" COMO SUYA. Son dueños de un BLOQUE, no de la
  // pestaña, y el registro es de pestañas: declararla los volvería "segundos dueños" en el censo, que
  // es exactamente el defecto que se está persiguiendo. Mismo criterio que
  // `cheques-emitidos-sync-banco.mjs`, que sincroniza una columna y declara [].
  // ═══ LAS DOS COLUMNAS DERIVADAS DE COMPRAS VAN PRIMERO, Y NO ES UN ORDEN CUALQUIERA (14/08) ═══
  //
  // Todo lo que muestra "Proveedores" —el titular, el aging, el cuadro por proveedor y el detalle—
  // suma `Compras!AL · Saldo pendiente (OS)`. Esa fórmula NO LA ESCRIBÍA NADIE: vivía tipeada a mano
  // en una celda, sin dueño, sin test y sin paso acá. El dueño: *"tomaba mal columnas de compras"*.
  // Y `AN · Tramo de vencimiento (OS)`, que alimenta el aging del encabezado, tenía script desde el
  // 05/08 y tampoco estaba en esta lista: se actualizaba sólo si alguien tipeaba el comando.
  //
  // AN se calcula CONTRA AL, así que el orden entre las dos no es negociable: primero el saldo,
  // después el tramo. Las dos son ARRAYFORMULA vivas, así que una vez ancladas Google las recalcula
  // sola; el paso existe para que la definición sea del repositorio y no de una celda.
  ['compras-saldo-pendiente.mjs', 'Compras!AL "Saldo pendiente (OS)" — la aritmética de los tres tramos de pago', [], ['--aplicar']],
  ['proveedores-aging-columna.mjs', 'Compras!AN "Tramo de vencimiento (OS)" — el aging que lee el encabezado', [], ['--aplicar']],
  ['proveedores-cuenta-corriente.mjs', 'Compras!AM "CUIT (OS)" + la auxiliar _PROVEEDORES_OS — el origen del CUIT de la sección 2', ['_PROVEEDORES_OS'], ['--aplicar']],
  // ['proveedores-materiales-pestana.mjs', …] — RETIRADO, ver PASOS_RETIRADOS al pie.
  // ANTES DE LAS DOS DINÁMICAS: los títulos "1 · …" y "2 · …" son su ANCLA y no los reponía nadie.
  // Si el dueño borra esa celda, los dos pasos que siguen fallan cerrado —correcto— y la pestaña se
  // congela en silencio. Escribe UNA celda y sólo si está vacía; ver lib/proveedores-titulos.mjs.
  ['proveedores-titulos-sembrar.mjs', 'Proveedores · los títulos de las secciones 1 y 2, que son el ancla de las dinámicas', [], ['--aplicar']],
  ['proveedores-dos-cuadros.mjs', 'Proveedores · sección 1 — las dos dinámicas: quién y cuánto, y cada operación', [], ['--aplicar']],
  // ENTRE LAS DOS DINÁMICAS. Se ubica entre el final de la sección 1 y el título de la que sigue, así
  // que la 1 tiene que estar escrita; y como cambia de alto según cuántos días de pago haya, corre
  // hacia abajo la cuenta corriente — que se reancla por su título en la corrida siguiente.
  ['proveedores-que-sale-cada-dia.mjs', 'Proveedores · sección 2 — qué sale cada día: a quiénes y por qué medio', [], ['--aplicar']],
  ['proveedores-seccion2-pivot.mjs', 'Proveedores · sección 3 — la dinámica de concentración con su resto y su total', [], ['--aplicar']],
  ['proveedores-notas-visibles.mjs', 'Proveedores · la columna "Qué hacer" del dueño, anclada a su proveedor', [], ['--aplicar']],
  ['proveedores-encabezado-aplicar.mjs', 'Proveedores · el encabezado (la posición) y LOS ANCHOS de toda la pestaña', [], ['--aplicar']],
  // ═══ OBRAS ENTRA AL PIPELINE (13/08) ═══
  //
  // La pestaña existía desde el 07/08 con su generador y su fuente, y NO estaba acá: sólo se
  // actualizaba si alguien tipeaba el comando. Es el modo de falla más silencioso que tiene este
  // archivo —el mismo de `_CHEQUES_RAW` y del espejo de JORNALES—: la pestaña no da error, envejece.
  //
  // VA ACÁ POR DEPENDENCIA, NO POR ORDEN ALFABÉTICO. Toda la Sección 1 es fórmula viva sobre
  // Cobranzas y sobre la fila "TOTAL POR OBRA" de Materiales, y cita Compras por columna:
  //   · después de `rubro-caja-sheet.mjs`, que define qué es cada gasto de Compras;
  //   · después de `proveedores-materiales-pestana.mjs`, que es quien escribe Materiales — si OBRAS
  //     corriera antes, buscaría por rótulo una fila "TOTAL POR OBRA" de la corrida anterior.
  //
  // `--escribir` NO ES OPCIONAL ACÁ: sin el flag el generador hace un ensayo y no toca el archivo, o
  // sea que el paso "correría bien" todos los días sin publicar una celda. El defecto es no escribir
  // —dirección segura para equivocarse a mano— pero en el pipeline esa seguridad se vuelve una
  // pestaña congelada que informa éxito.
  ['obras-pestana.mjs', 'OBRAS — el año entero obra por obra: venta/cobrado/pendiente por cliente y las obras del año', ['OBRAS'], ['--escribir']],
  // VA DESPUÉS DE OBRAS Y NO ES INDIFERENTE: su control de cierre LEE la Resta que OBRAS acaba de
  // publicar y aborta si no cuadra. Corriendo antes, se compararía contra la Resta de ayer.
  ['calendario-cobros-pestana.mjs', 'Calendario de Cobros — cuándo entra cada peso: cliente × mes y cada hito en su fecha', [PESTANA_CALENDARIO], ['--escribir']],
  ['estructura-pestana.mjs', 'pestaña Estructura con su proyección', ['Estructura']],
  // Escribe DOS pestañas: primero la réplica _IIBB_RAW (las DDJJ de Ingresos Brutos leídas del PDF de
  // Rentas, el insumo) y después el cuadro que la referencia. Declarar la réplica evita que el censo
  // de dueños la dé por huérfana aunque este mismo script la rehace en cada corrida.
  ['impuestos-pestana.mjs', 'Impuestos y Financieros — IVA real de ARCA + IIBB de las DDJJ (réplica _IIBB_RAW)', ['_IIBB_RAW', 'Impuestos y Financieros']],
  // ═══ CARGAS SOCIALES: UN SOLO DUEÑO (23/07) ═══
  //
  // Antes eran TRES scripts escribiendo la misma pestaña —f931-sheet el bloque 1, cargas-planes los
  // planes, cargas-proyeccion la proyección—, cada uno con su ancho de grilla y ubicando su bloque
  // por rótulo. De ahí salían los cinco anchos mezclados, los bloques sin número y —lo peor— dos
  // bloques huérfanos que ningún script reclamaba y que quedaron rotos en #VALUE! sin que nadie se
  // enterara. Ahora f931-sheet sólo mantiene la réplica _F931_RAW (el insumo) y la PESTAÑA entera
  // la escribe un único generador.
  ['f931-sheet.mjs', 'la réplica _F931_RAW — las DDJJ F931 leídas de los PDF del data room', ['_F931_RAW']],
  // ANTES DE CARGAS SOCIALES, Y NO ES ALFABÉTICO: la fila "Fondo de Cese devengado" de esa pestaña
  // hace SUMIFS sobre esta réplica. Si la réplica se refrescara después, el devengado del mes nuevo
  // aparecería recién en la corrida siguiente — el modo de falla más silencioso de este archivo: la
  // pestaña no da error, envejece.
  ['uocra-raw-pestana.mjs', 'Réplica _UOCRA_DDJJ_RAW — las DDJJ Nominativas de UOCRA leídas de los PDF de Drive (el Fondo de Cese devengado sale de acá)', ['_UOCRA_DDJJ_RAW']],
  ['cargas-sociales-pestana.mjs', 'Cargas Sociales — la pestaña entera: declarado, pagado, proyección, caja, SAC y planes', ['Cargas Sociales']],
  ['cobranzas-control.mjs', 'Cobranzas — detector de duplicados', []],
  ['cheques-cobertura-sheet.mjs', 'Cheques Emitidos — marcas de cobertura en la columna M (el bloque del Mensual se retiró: matriz 06/08)', [], ['--solo-marcas']],
  // EL REGISTRO DECLARA LA PESTAÑA QUE ESCRIBE, SIEMPRE. Estos tres pasos la dejaban en blanco, así
  // que el censo de dueños las daba por HUÉRFANAS aunque un agente las mantenía todos los días. Un
  // registro incompleto es peor que no tenerlo: contesta que no hay dueño cuando sí lo hay.
  // ═══ TARJETA: UN SOLO DUEÑO PARA LA PESTAÑA (04/08) ═══
  //
  // Antes eran dos escritores: tarjeta-control.mjs ponía su bloque DEBAJO del registro y una persona
  // mantenía a mano un panel arriba. De ahí salieron las dos numeraciones que se pisaban (1, 2, 5, 6
  // arriba; otro 1 y otro 2 abajo) y dos fotos del banco con cortes distintos contradiciéndose en la
  // misma pestaña. Ahora la pestaña entera —salvo el registro, que carga el dueño— la escribe un
  // único generador, y por eso el control puede subir arriba y los rangos del registro quedar
  // abiertos hacia abajo en vez de fosilizarse en una fila fija.
  ['tarjeta-pestana.mjs', 'Tarjeta de Credito — la línea de crédito: disponible, calendario de vencimientos, uso y control contra el resumen', ['Tarjeta de Credito']],
  // RESUMEN va DESPUÉS de proveedores, cheques, jornales y tarjeta: es un tablero que apunta con
  // fórmula a los totales de esas cuatro pestañas, así que necesita que ya existan. Reemplazó dos
  // tablas dinámicas nativas huérfanas que duplicaban Proveedores y que ningún agente mantenía.
  // ═══ RESUMEN: LA BORRÓ EL DUEÑO Y SE RESPETA (23/07) ═══
  //
  // El censo de dueños la reportó como "declarada por un paso pero NO EXISTE en el archivo": el
  // dueño eliminó la pestaña y el agente venía fallando cada dos horas intentando reescribirla.
  // La regla es clara —"si yo decido una eliminación, revisar antes de cambiar algo y respetarla"—
  // así que el paso se retira. El script sigue en el repo por si se decide volver a tenerla.
  //   ['resumen-pestana.mjs', 'RESUMEN — el tablero "LO QUE VIENE A PAGAR"', ['RESUMEN']],
  // ANTES del tablero: sincronizar el DEBITADO de los echeq contra el banco (fuente única). El banco
  // sabe si un echeq ya se pagó o sigue vivo; la marca a mano se atrasa (tenía el 305 en "No" cuando
  // ya estaba pagado, inflando el outstanding). Idempotente.
  // SINCRONIZA UNA COLUMNA, NO ESCRIBE LA PESTAÑA. Declararla lo hacía figurar como segundo dueño de
  // Cheques Emitidos —y "varios dueños" es justo el defecto que se está persiguiendo—. El dueño del
  // layout es uno solo: el tablero.
  ['cheques-emitidos-sync-banco.mjs', 'Cheques Emitidos — DEBITADO de los echeq sincronizado con el banco', []],
  // Las DOS pestañas de cheques se rehicieron el 23/07 y se leen igual: son las dos correcciones al
  // saldo del banco (los emitidos no debitados lo bajan, los valores en cartera lo suben). Las dos
  // referencian a CAJA por RÓTULO y con fórmula viva, así que NO importa que corran antes que ella.
  // Formato PROPIO — el formateador general las saltea, así que se re-aplica sola en cada corrida.
// FALTABA EN EL REGISTRO Y POR ESO NO CORRÍA EN EL AGENTE. La pestaña existía, tenía su generador y
  // su fuente (la pantalla eCHEQ del Santander), pero nadie la ejecutaba: se actualizaba sólo cuando
  // alguien corría el script a mano. Es la forma más silenciosa de que una pestaña envejezca.
  // ═══ LA RÉPLICA DE CHEQUES, QUE NADIE REFRESCABA (01/08) ═══
  //
  // `_CHEQUES_RAW` la escribe cheques-raw-pestana.mjs y NO estaba en estos pasos: sólo se
  // actualizaba si alguien la corría a mano. Medido: 30 cheques en la réplica y **35 celdas de
  // "Cheques Recibidos" que la leen por fórmula**. Una fuente que se congela sin gritar — el mismo
  // modo de falla del espejo de JORNALES, que mostró una quincena entera con valores viejos.
  //
  // Va ANTES de cheques-recibidos-tablero y del registro de esa pestaña, que la consumen los dos: la
  // cabecera por fórmula y el registro por una QUERY sobre esta misma réplica.
  ['cheques-raw-pestana.mjs', '_CHEQUES_RAW — la réplica de la cartera de cheques que lee Cheques Recibidos', ['_CHEQUES_RAW']],
  // ═══ QUIÉN ES EL DUEÑO DE "Cheques Recibidos" — DECIDIDO (01/08) ═══
  //
  // Dos generadores se la disputaban y por eso la pestaña se auto-candaba en cada corrida:
  // `cheques-recibidos-pestana` corría desde el pipeline y se frenaba solo ("sólo 7 de 34 de mis
  // rótulos siguen en la pestaña"), mientras el tablero —que ya la había escrito— no estaba en los
  // pasos y sólo corría a mano.
  //
  // Gana el TABLERO, y no por antigüedad: el registro viejo listaba OPERACIONES del homebanking
  // (Aceptación, Custodia, Depósito, Endoso) y el mismo cheque aparecía varias veces, así que la
  // cartera NO SE PODÍA SUMAR — el endoso de $20.000.000 figuraba dos veces. El tablero usa el CHEQUE
  // como unidad, que es lo que hace que el total signifique algo, y además entra la orden de pago de
  // Messina, que no tiene número de operación y en el registro viejo no tenía dónde ir.
  //
  // ═══ EL DUEÑO ESTABA DECLARADO Y EL ARCHIVO NO EXISTÍA (06/08) ═══
  //
  // Esta línea apuntaba desde el 01/08 a `cheques-recibidos-tablero.mjs`, que NO estaba en el repo:
  // el paso fallaba en cada corrida del pipeline y la pestaña envejecía sin que nada avisara. Los dos
  // generadores viejos —`cheques-recibidos-pestana.mjs` y `cheques-recibidos-cobro.mjs`— se
  // retiraron con este cambio: describían un registro por OPERACIÓN que ya no existe. Hoy el
  // registro es el derrame de una QUERY sobre `_CHEQUES_RAW` y este paso escribe SÓLO la cabecera
  // (filas 1-26). El test de este archivo comprueba que cada paso declarado exista de verdad.
  //
  // `--pestana` le dice a qué destino escribir: el real o una copia de prueba.
  ['cheques-recibidos-tablero.mjs', 'Cheques Recibidos — la cabecera de la cartera (el registro es una QUERY)', ['Cheques Recibidos'], ['--pestana', 'Cheques Recibidos']],
  ['cheques-emitidos-tablero.mjs', 'Cheques Emitidos — de lo firmado, cuánto no salió todavía y cuándo sale', ['Cheques Emitidos']],
  // Va última: ubica las líneas del Cash Flow por rótulo, así que necesita el cuadro ya escrito.
  // 'Caja' con minúsculas era el nombre viejo de la pestaña: quedó declarado y el censo lo reportaba
  // como una pestaña fantasma. Un nombre que sobrevive a su renombre apunta al vacío para siempre.
  // ═══ EL ANEXO VA ANTES QUE CAJA, Y NO ES COSMÉTICO (05/08/2026) ═══
  //
  // CAJA se rehízo entera: pasó de 143 filas a 45 y el detalle del analista —conciliaciones,
  // trazabilidad contra el extracto, el costo del descubierto— vive ahora en `_CAJA_ANEXO`. CAJA cita
  // once cifras de ese anexo POR RANGO CON NOMBRE (`ANEXO_*`), así que el anexo tiene que escribirse y
  // publicar sus nombres PRIMERO. Al revés, en un arranque en frío la pestaña que el dueño abre todos
  // los días se llena de #NAME? — y si algo tiene que mostrar un error una corrida, que sea el auxiliar.
  // ═══ EL LIBRO NUNCA ESTUVO EN ESTA LISTA, Y ES DE DONDE SALEN LOS TRES CUADROS QUE MÁS SE MIRAN ═══
  //
  // `_MOVIMIENTOS` es la fuente única de CAJA, del Cash Flow Semanal y del Cash Flow Mensual — los dos
  // cuadros lo dicen en su propio subtítulo: *"del libro de movimientos"*. Su generador
  // (`libro-movimientos-pestana.mjs`) sólo corría si alguien lo tipeaba a mano. Es el mismo modo de
  // falla que ya se pagó con Proveedores más arriba, pero sobre la pestaña de la que cuelga todo lo
  // demás, y la regla de oro 3 del dueño lo prohíbe explícitamente: *"un agente de IA por cada cosa, y
  // un MACRO AGENTE que activa a todos los demás"*.
  //
  // MEDIDO EL 13/08/2026 CONTRA EL ARCHIVO VIVO, antes de agregarlo:
  //   · `_MOVIMIENTOS` no tenía NI UNA fila con origen "Obras": los $18.880.836 de egresos proyectados
  //     de las 7 obras en curso (materiales, alquileres y combustible, con proveedor y fecha) que
  //     publica la pestaña OBRAS no llegaban a ningún cash flow. El extractor se cableó el 07/08 y el
  //     libro nunca se volvió a generar.
  //   · Los cobros proyectados del libro sumaban $348.728.268 contra los $357.487.078 que OBRAS declara
  //     pendientes de cobrar: exactamente $8.758.810 de diferencia — la venta de MAMPOSTERÍA, cargada
  //     en Cobranzas el 13/08, que el libro del 07/08 no podía conocer.
  //   · Los egresos proyectados de materiales se terminaban el 31/08: de septiembre en adelante el
  //     cuadro afirmaba que la empresa no compra nada.
  //
  // VA ACÁ Y NO ANTES: lee TODAS sus fuentes ya rehechas —Compras (con su rubro de caja), Recurrentes,
  // Jornales, Cargas Sociales, Impuestos y Financieros, Cobranzas, Cheques Emitidos, Tarjeta,
  // _BANCO_RAW y _CHEQUES_RAW— y las tres pestañas que lo consumen van inmediatamente después.
  // Escribe UNA sola pestaña (`_MOVIMIENTOS`, réplica generada y oculta) y verifica su propia
  // escritura releyéndola: si el archivo y la memoria no dicen lo mismo, sale con código ≠0.
  ['libro-movimientos-pestana.mjs', '_MOVIMIENTOS — el libro: todo movimiento de todas las fuentes, con su estado y su origen', ['_MOVIMIENTOS']],
  // ═══ EL CENTINELA VA ANTES QUE EL ANEXO, Y NO ESCRIBE NADA (15/08/2026) ═══
  //
  // Mira la celda del conteo de efectivo —la tipea el dueño— y anota en Postgres qué valor vio y
  // cuándo. De ahí sale el ANCLA con la que el anexo calcula los movimientos posteriores al conteo,
  // así que tiene que correr primero o el anexo publicaría el ancla de la corrida anterior.
  //
  // NO DEJA NINGUNA PESTAÑA (tercera columna vacía, y es correcto): pide el cliente de Google sin
  // scopes de escritura. Por eso también es el único paso de esta lista que sigue sirviendo con el
  // freno de mano puesto — y observar es justamente lo que no puede dejar de pasar: cada corrida que
  // no mira es una ventana en la que el conteo pudo cambiar sin que nadie lo viera.
  ['caja-centinela-conteo.mjs', 'centinela del conteo de efectivo: cuándo apareció el monto tipeado y qué se cargó tarde sobre filas viejas', []],
  ['caja-anexo-pestana.mjs', '_CAJA_ANEXO — el detalle y las conciliaciones que sostienen los veredictos de CAJA', ['_CAJA_ANEXO']],
  ['caja-pestana.mjs', 'CAJA — la portada ejecutiva de tesorería: cinco tarjetas y una pantalla', ['CAJA']],
  // ═══ LAS DOS VISTAS VAN DESPUÉS DEL LIBRO Y DESPUÉS DE CAJA (13/08/2026) ═══
  //
  // Estaban en el noveno lugar, antes de Impuestos, Cargas Sociales, Cheques, Tarjeta, OBRAS y CAJA.
  // No daba error porque no leen esas pestañas directamente: leen `_MOVIMIENTOS` y los rangos con
  // nombre de CAJA. Pero leerlos ANTES de que se reescriban significa mostrar la corrida anterior —
  // el ancla del saldo y el libro entero, siempre un ciclo atrasados. Acá cada cuadro se calcula
  // sobre el libro que se acaba de escribir y sobre el saldo que CAJA acaba de publicar.
  ['cash-flow-vistas.mjs', 'Cash Flow Semanal (53 semanas), Cash Flow Mensual (12 meses) y _PRESUPUESTO_MENSUAL',
    ['Cash Flow Semanal', 'Cash Flow Mensual', '_PRESUPUESTO_MENSUAL']],
  // ═══ LA ASIMETRÍA SE MIRA EN CADA CORRIDA (02/09/2026) ═══
  //
  // El hallazgo «nómina proyectada completa con $0 de material» existía en el código desde el
  // 28/08 (`cash-flow-asimetria.mjs`) pero el script era suelto: nadie lo corría, y el dueño vio
  // el cierre proyectado empeorar sin la explicación al lado. Corre DESPUÉS de las vistas (lee la
  // pestaña recién escrita) y está en REPORTES: sus hallazgos son un aviso a la vista, no un
  // fallo de datos — no bloquea ni la frescura ni el estado del servicio.
  ['asimetria-cash-flow.mjs', 'Cash Flow — aviso: los meses que proyectan la cuadrilla y no la obra', []],
  // ═══ EL FLUJO DE FONDOS ENTERO, A POSTGRES (02/09/2026) ═══
  //
  // El dueño: *"necesito que lleves toda la información del sheet flujo de fondos a bd supabase
  // ordenada de la mejor manera porque voy a armar una página de analíticas que va a consumir
  // directamente de la bd"*. Hasta hoy la base tenía el calendario financiero y las salidas del motor
  // de tesorería, pero no el LIBRO: cualquier pregunta sobre el flujo había que contestarla leyendo
  // el Sheet, y una pantalla web no puede leer el Sheet en cada render.
  //
  // VA ACÁ Y NO ANTES, por dos dependencias que no son negociables:
  //   · DESPUÉS de `libro-movimientos-pestana.mjs`, que es de donde lee. Antes, persistiría el libro
  //     de la corrida anterior — el mismo desfase de una vuelta que ya se pagó con `_CRUCE_ARCA`.
  //   · DESPUÉS de `cash-flow-vistas.mjs`, que publica `CF_MESES`/`CF_INICIO`/`CF_CIERRE`. De esos
  //     tres nombres salen el ejercicio que cubre la foto y los saldos de cierre, que son lo único de
  //     la corrida que NO se puede recalcular desde el libro (un saldo es un stock anclado en CAJA).
  //
  // NO DECLARA NINGUNA PESTAÑA, y es correcto: no escribe una sola celda. El cliente de Google nace
  // sin scopes de escritura, así que —como el centinela del conteo— sigue sirviendo con el freno de
  // mano puesto. Y si la migración todavía no se aplicó, o si `_MOVIMIENTOS` volvió vacía, no toca la
  // base y sale en verde: media foto es peor que ninguna, y un paso que explota por una tabla que
  // todavía no existe deja de registrar la frescura del Cash Flow para todo el archivo.
  ['sync-flujo-fondos.mjs', 'núcleo: el libro, los períodos mensual/semanal y los hallazgos de asimetría → public.flujo_*', []],
  // El núcleo Postgres, para que la web y el chat vean lo mismo que la planilla y no un mes atrás.
  // ÚLTIMO ANTES DEL NÚCLEO: unificar el formato de las catorce pestañas. Va al final porque cada
  // script anterior acaba de reescribir la suya, y una pasada de formato hecha antes se pierde.
  ['formato-pestanas.mjs', 'unificar tipografía, barra de título y filas congeladas en las 14 pestañas', []],
  // DESPUÉS de unificar el formato: el control de CÓMO SE VE. No arregla nada —arreglar cada
  // defecto es trabajo de la pestaña que lo produce— pero deja el número a la vista en cada corrida.
  // Sin él, la única forma de enterarse de un "30/12/99" repetido 22 veces era que el dueño lo viera.
  // ANTES de auditar: devolverle su formato a las celdas que quedaron con el de la columna. Es
  // reparación por CONTENIDO —si adentro hay una frase, no es un importe— y por eso no se
  // desincroniza cuando un bloque crece una fila, que es lo que pasa con los formatos por coordenada.
  ['reparar-pantalla.mjs', 'devolver su formato a las celdas que quedaron con el de la columna', []],
  // LA REGLA DE ORO, MEDIDA EN CADA CORRIDA. Cuenta cuántos números de cada pestaña calculada están
  // PEGADOS en vez de ser fórmula o celda derramada. Sin este censo, la única forma de enterarse era
  // que el dueño abriera una celda y mirara la barra de fórmulas — que es exactamente lo que pasó.
  ['censo-numeros-pegados.mjs', 'regla de oro: cuántos números están pegados en vez de calculados', []],
  // ═══ EL CONTROL QUE HABRÍA CAZADO `_CRUCE_ARCA` NO LO CORRÍA NADIE (14/08/2026) ═══
  //
  // El censo de dueños existe desde el 23/07 y contesta la única pregunta que este archivo no puede
  // contestar solo: qué pestaña del archivo real NO figura en esta lista. `_CRUCE_ARCA` tenía
  // generador desde el 04/08, no estaba acá y no se refrescó en diez días — el censo lo habría dicho
  // la primera mañana. No lo dijo porque el censo tampoco estaba acá: un control que hay que acordarse
  // de tipear tiene exactamente la misma disponibilidad que el defecto que persigue.
  //
  // VA AL FINAL, CON LOS DEMÁS AUDITORES, Y NO AL PRINCIPIO. Poner un aviso ANTES de escribir suena
  // mejor de lo que es, y acá está medido contra su propia definición:
  //
  //   · el censo NO puede frenar nada — el runner sigue con los demás pasos pase lo que pase, así que
  //     adelantarlo no evita una sola escritura;
  //   · corriendo primero, una pestaña que ESTA MISMA corrida crea todavía no existe en el archivo, y
  //     el censo la reportaría como FANTASMA ("declarada por un paso pero NO EXISTE"). Un falso
  //     positivo por corrida en el control que vino a detectar huérfanas lo vuelve ruido, que es cómo
  //     murió el trinquete de frescura;
  //   · corriendo último, el archivo ya tiene todas las pestañas de la corrida: cero fantasmas falsos,
  //     y una huérfana nueva se ve el MISMO día.
  //
  // Y VA EN `REPORTES`: su ≠0 significa "encontré huérfanas", no "no pude generar los datos". Contado
  // como fallo, el servicio quedaría siempre en rojo y —peor— la frescura del Cash Flow, que sólo se
  // registra si nadie falló, dejaría de registrarse. Es el motivo por el que existe esa lista.
  ['auditar-duenos-pestanas.mjs', 'censo de dueños: qué pestaña del archivo no la mantiene ningún paso de esta lista', []],
  // VA AL FINAL Y A PROPÓSITO: pregunta si las pestañas quedaron al día y si dicen lo mismo entre
  // ellas, y las dos cosas sólo se pueden contestar DESPUÉS de que todos los generadores corrieron.
  // Corrido antes, mediría la corrida de ayer. Ver `lib/coherencia-pestanas.mjs`.
  ['auditar-coherencia-pestanas.mjs', 'el control del dueño: ¿están todas al día y condicen entre sí?', []],
  // ═══ EL AUDITOR QUE HABRÍA CAZADO LOS DOCE `ARCA_*` TAMPOCO LO CORRÍA NADIE (14/08/2026) ═══
  //
  // Exactamente la misma historia que `_CRUCE_ARCA` cuatro entradas más arriba, sobre otro objeto.
  // `auditar-rangos-fosilizados.mjs` existe desde el 21/07, mira los rangos A1 que se quedaron cortos
  // y —desde el 03/08— los 80 rangos con nombre del libro, y sólo corría si alguien lo tipeaba.
  //
  // Medido el 14/08 contra el archivo vivo: los doce `ARCA_*` vivían sobre `Proveedores!B124:C129`,
  // que hoy es la tabla de comprobantes faltantes. Once de los doce publicaban un CUIT o un número de
  // comprobante bajo un nombre que promete un contador o un importe, y `ARCA_FALTAN_MONTO` —el único
  // de los doce con lectores reales— le pasaba "0038-00025483" a `Materiales!B53`. El generador de
  // Proveedores lo gritaba cada dos horas en su propio log y salía con código ≠0; el archivo entero
  // no tenía quién hiciera esa pregunta sobre los otros 68 nombres.
  //
  // VA EN `REPORTES`: su ≠0 significa "encontré rangos cortos o nombres que mienten", no "no pude
  // generar los datos". Contado como fallo dejaría el servicio siempre en rojo y —peor— la frescura
  // del Cash Flow, que sólo se registra si nadie falló, dejaría de registrarse.
  ['auditar-rangos-fosilizados.mjs', 'rangos que se quedaron cortos y rangos con nombre ciegos, huérfanos o que mienten su especie', []],
  // EL SALDO DEL BANCO CONTRA SUS PROPIOS MOVIMIENTOS (31/07). El dueño: "está mal el saldo de caja en
  // todos lados". De ese saldo cuelgan CAJA_TOTAL_DISPONIBLE, el efectivo inicial de los dos cash flow y
  // el piso proyectado: un agujero en el extracto cargado se propaga a todas las pantallas en silencio,
  // y no había ningún control que lo mirara. Medido la primera vez que corrió: faltaba $113.314,76.
  ['auditar-saldo-banco.mjs', 'el saldo del banco contra la suma de sus movimientos (el número del que cuelga todo)', []],
  // ═══ QUÉ COMPRA RESTA DOS VECES, MEDIDO EN CADA CORRIDA (14/08/2026) ═══
  //
  // Este control existía desde el 14/08 y sólo corría si alguien lo tipeaba. Encuentra las dos formas
  // en que una fila de Compras baja la caja por plata que no salió: la Fecha de caja posterior al corte
  // sobre un débito que el banco ya hizo (fila 844, Trielec, $2.205.400,34) y el "Efectivo" que en
  // realidad salió por tarjeta o débito (fila 845 más seis de junio, $3.263.770,37 entre todas). Las
  // segundas son las que hunden el cajón físico y ponen el efectivo en camino de dar negativo, que es
  // el defecto que el bloque del sello acaba de tener que degradar.
  //
  // VA EN `REPORTES` Y NO ESCRIBE NADA: su ≠0 significa "encontré filas para mirar", no "no pude
  // generar los datos". Las celdas son del dueño y el cruce es por importe —probable, no cierto—, así
  // que corregir automáticamente está prohibido: sobre una coincidencia PROBABLE ya se duplicaron
  // $2,1M en este repo. Lo único que cambia es que ahora el hallazgo aparece solo, todos los días.
  ['auditar-doble-conteo-compras.mjs', 'qué compra resta dos veces de la caja (banco ya debitado / "Efectivo" que salió del banco)', []],
  // ÚLTIMO ENTRE LOS QUE ESCRIBEN: cada script pone los anchos que declara, así que ensanchar antes
  // de que corran no sirve de nada. Lo que este paso arregla es lo que ningún script dueño puede
  // saber solo: si el texto que le tocó a esta corrida entra o no.
  ['reparar-textos.mjs', 'Que todo texto se pueda leer entero (ensancha o manda a nota)', []],
  // 2ª pasada de clase mundial: una regla condicional por pestaña calculada que pinta en rojo toda
  // celda con error. Un modelo roto grita en la pantalla en vez de esperar al auditor.
  ['formato-condicional.mjs', 'formato condicional "error en rojo" en las pestañas calculadas', []],
  ['auditar-pantalla.mjs', 'control de defectos de pantalla en las 14 pestañas', []],
  ['sync-compras.mjs', 'núcleo: Compras → costos_obra', []],
  ['sync-caja-nucleo.mjs', 'núcleo: quincenas de jornales e instrumentos de pago', []],
  // ÚLTIMO: con el Sheet ya regenerado, el motor de Ingeniería Financiera arma el calendario diario y
  // lo materializa en public.finanzas_calendario. La Web (Calendario Financiero) lee ESO — nunca el
  // Sheet ni recalcula. Va al final porque consume las pestañas que los pasos anteriores dejaron al día.
  ['sync-calendario-financiero.mjs', 'motor: calendario financiero diario → public.finanzas_calendario', []],
  // MATERIALIZACIÓN DE LAS SALIDAS DEL MOTOR PARA LA WEB (25/07). El Financial Engineering completo se
  // prueba desde la web: cada salida del motor tiene su tabla singleton que la Web LEE (0 recálculo en
  // React). Estos tres PROYECTAN lo que el calendario ya dejó materializado —no re-leen el Sheet ni
  // llaman a Google—: el modelo único de liquidez, el comparador de financiamiento sobre el bache real
  // que proyecta el calendario, y la priorización de los egresos reales de los próximos 30 días. Van
  // JUSTO después del calendario porque consumen su payload.
  ['sync-modelo-liquidez.mjs', 'motor: modelo único de liquidez → public.finanzas_modelo_liquidez (proyecta el calendario, sin re-leer)', []],
  ['sync-comparar-financiamiento.mjs', 'motor: comparador de financiamiento sobre el bache real → public.finanzas_comparar_financiamiento', []],
  ['sync-priorizar-pagos.mjs', 'motor: priorización de los egresos reales → public.finanzas_priorizar_pagos', []],
  // Las condiciones de financiamiento vigentes (tasas/límites con fuente) salen de Supabase, no del
  // Sheet — pero se materializan acá para que la Web las lea como una salida más del motor.
  ['sync-condiciones-financieras.mjs', 'motor: condiciones de financiamiento vigentes → public.finanzas_condiciones_vigentes', []],
  // RECÁLCULO AUTOMÁTICO DEL PLAN — lo ÚNICO automático de la ejecución financiera (decisión del dueño,
  // 24/07). Recalcula finanzas.plan_tesoreria y guarda el snapshot vigente; si cambió, lo deja
  // 'pendiente_ejecucion' con el detalle. NO crea tareas: la ejecución (FEO) sólo la dispara una
  // autoridad (dueño / Director IA / CFO IA / interfaz). Barato y sin efectos: sólo lee y calcula.
  ['sync-plan-tesoreria.mjs', 'motor: recálculo del Plan de Tesorería → public.finanzas_plan_vigente (pendiente de ejecución, sin crear tareas)', []],
  // RECÁLCULO DE LA ESTRATEGIA FINANCIERA (25/07) — la salida de nivel CFO que gobierna el Calendario.
  // ENSAMBLA lo que el plan/modelo ya decidieron en un documento estratégico y lo materializa en
  // public.finanzas_estrategia_vigente para que la Web haga de la ESTRATEGIA la protagonista del día.
  // No recalcula un peso ni crea tareas: consume y guarda. Va después del plan porque lo consume.
  ['sync-estrategia-financiera.mjs', 'motor: recálculo de la Estrategia Financiera → public.finanzas_estrategia_vigente (consumo, sin crear tareas)', []],
]

/**
 * PASOS RETIRADOS DEL PIPELINE — un freno DECLARADO, con su motivo y su condición de vuelta.
 *
 * Sacar un paso comentando su línea deja el bloque sin dueño y a nadie enterado: la pestaña se
 * queda vieja y el único rastro es un comentario que no se audita. Un freno que no se puede
 * consultar es indistinguible de un olvido. Acá cada retiro dice QUÉ dejó de actualizarse, POR QUÉ,
 * y QUÉ TIENE QUE MEDIRSE para volver a enchufarlo — y los tests exigen esos tres campos.
 *
 * `vuelve` no es una intención: es un criterio verificable por alguien que no lo escribió.
 */
export const PASOS_RETIRADOS = Object.freeze([
  Object.freeze({
    script: 'proveedores-materiales-pestana.mjs',
    desde: '2026-08-14',
    // MEDIDO en dos corridas seguidas de hoy, con los mismos datos:
    //   · "Proveedores" pasó de 249 a 265 filas;
    //   · el bloque de control de ARCA cayó en la fila 131 en una corrida y en la 148 en la
    //     siguiente — 17 filas más abajo sin que cambiara un solo dato.
    motivo: 'escribe su bloque cada vez más abajo y no borra el anterior: cada corrida apila una '
      + 'capa. Lo que se ve como "el cuadro 4 está roto y arrastra el error para abajo" son N '
      + 'corridas superpuestas —columnas A/B de una capa y C/D/F de otra en la misma fila física—, '
      + 'no un layout mal calculado. El barrido de residuo propio informa "0 vaciada(s) · '
      + '0 conservada(s) · 0 limpiada(s)": no reconoce como suyo nada de lo que él mismo escribió. '
      + 'Mientras esa cuenta dé cero, cada corrida agrava el archivo del dueño.',
    // ═══ QUÉ SE CUMPLIÓ YA, MEDIDO — Y QUÉ FALTA (15/08/2026) ═══
    //
    // La PRECONDICIÓN que faltaba era otra y no estaba en esta lista: `sheet_huella_celda` tenía CERO
    // filas para "Proveedores" y "Materiales" —las dos únicas pestañas de contenido del archivo sin una
    // sola— contra 4.430 del Cash Flow Semanal. Sin huella, `aplicarHuella` no recorre una celda y las
    // cuatro evidencias de propiedad quedan mudas de una vez: por eso el barrido daba 0 en todo.
    //
    // HOY, medido read-only con `node orquestador/scripts/medir-huella-pestana.mjs`:
    //   · Proveedores  401/401 = 100,0% (corrimiento 0, rectángulo A117:G222)
    //   · Materiales   568/568 = 100,0%
    // contra el 186/396 = 47% de antes de `selloDeLoQueQuedo`, y contra el umbral de 0,6. La huella
    // existe, describe la pestaña real y no reclama ninguna celda del dueño (0 marcas de borrada_en).
    //
    // LO QUE FALTA, y por qué NO alcanza con eso:
    //
    //  a) `limpiadas > 0` en una corrida REAL. Alinear es la condición para poder decidir; no es haber
    //     limpiado. Sólo se mide corriendo, y correr esto es escribir la pestaña del dueño.
    //  b) LA CAPA FÓSIL SIGUE EN LA PESTAÑA: filas 139-145, con la cabecera del bloque de ARCA y dos de
    //     sus líneas entreveradas fila por fila con CUITs y comprobantes de otra tabla. Volver al
    //     pipeline antes de que eso se vaya es volver a apilar sobre lo apilado.
    //  c) CUATRO IMPORTES DEL BLOQUE SON TEXTO —B179, C179, B180, C180— y el generador los reescribe
    //     así en cada corrida: el valor entra por USER_ENTERED y el `numberFormat` llega DESPUÉS, con
    //     lo cual la celda que arrastra formato TEXTO se queda en texto para siempre. Reenchufarlo hoy
    //     es republicar cuatro celdas rotas cada dos horas. Ver scripts/arca-reapuntar-nombres.mjs.
    //
    // Cada condición tiene su comando: un criterio que no se puede correr vuelve a ser una intención.
    vuelve: 'las CUATRO, medidas y no afirmadas: (1) la huella de las dos pestañas alinea por encima '
      + 'de 0,6 — medir-huella-pestana.mjs (CUMPLIDO 15/08: 100,0% y 100,0%); '
      + '(2) una corrida informa celdas limpiadas > 0; (3) la pestaña NO crece entre dos corridas '
      + 'seguidas con los mismos datos (mismo alto y misma fila del bloque de ARCA) y la capa fósil de '
      + 'las filas 139-145 ya no está; (4) arca-reapuntar-nombres.mjs sale en verde: los nombres en su '
      + 'línea y ningún importe del bloque guardado como texto.',
    // Lo que queda sin actualizar mientras dure el freno. Es el costo, dicho: es menor que apilar.
    cuesta: ['Proveedores · de la frontera para abajo (notas de crédito, ARCA y control)', 'Materiales'],
  }),
])

/** ¿Este script está frenado a propósito? */
export function estaRetirado(script) { return PASOS_RETIRADOS.some((p) => p.script === script) }

// PASOS DE PRESENTACIÓN Y AUDITORÍA — su salida ≠0 es un DEFECTO A LA VISTA, no un fallo de datos.
//
// POR QUÉ (24/07). Estos pasos no generan datos: formatean, reparan la pantalla o AUDITAN. Un auditor
// que encuentra defectos sale con código ≠0 —es su forma de avisar—, y un formateador puede terminar
// con un residuo cosmético. El orquestador los contaba como "FALLARON", con dos consecuencias malas:
// el servicio de systemd quedaba SIEMPRE en rojo aunque los datos estuvieran perfectos, y —peor— la
// frescura del Cash Flow sólo se registra si `fallaron.length === 0`, así que NUNCA se registraba y la
// planilla figuraba desactualizada aunque se reconstruye en cada corrida. Separar presentación de datos
// arregla las dos: un fallo real (un generador que crashea) sigue siendo un fallo; un defecto de
// pantalla o de auditoría es un REPORTE visible que no bloquea ni la frescura ni el estado del servicio.
export const REPORTES = new Set([
  'formato-pestanas.mjs', 'reparar-pantalla.mjs', 'censo-numeros-pegados.mjs', 'auditar-saldo-banco.mjs',
  'reparar-textos.mjs', 'formato-condicional.mjs', 'auditar-pantalla.mjs', 'auditar-duenos-pestanas.mjs',
  'auditar-coherencia-pestanas.mjs',
  'auditar-doble-conteo-compras.mjs', 'auditar-rangos-fosilizados.mjs',
  // Sus hallazgos («jornales proyectados con $0 de material») son una lectura de lo que falta
  // cargar, no un error de cuadre: reporte visible, jamás un fallo del pipeline.
  'asimetria-cash-flow.mjs',
])

/** NÚCLEO PURO: ¿este paso es de presentación/auditoría (su ≠0 es un reporte, no un fallo de datos)? */
export function esReporte(script) { return REPORTES.has(script) }
