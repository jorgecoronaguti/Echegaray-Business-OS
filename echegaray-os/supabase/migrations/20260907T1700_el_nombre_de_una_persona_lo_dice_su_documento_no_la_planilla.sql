-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL NOMBRE DE UNA PERSONA LO DICE SU DOCUMENTO, NO LA PLANILLA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 07/09/2026: «revisá en base a los DNI de cada empleado si el nombre creado y
-- cargado en app.ecsas.com.ar está correcto».
--
-- Se auditaron las 17 personas del plantel ACTIVO contra el documento oficial de su carpeta de
-- Drive —DNI escaneado cuando existe, y si no la constancia de alta de ARCA o el formulario FWEB
-- del IERIC—, abriendo el archivo, nunca deduciendo del nombre del archivo (esa trampa ya se pagó:
-- «HM.pdf» resultó ser una libreta del IERIC).
--
-- Resultado: 8 correctas, 6 con el nombre incompleto o mal escrito, 3 sin DNI cargado.
--
-- ═══ EL PATRÓN, Y POR QUÉ IMPORTA MÁS QUE LAS SEIS FILAS ═══
--
-- No son errores de tipeo sueltos: seis de los ocho son APELLIDOS DOBLES Y SEGUNDOS NOMBRES que se
-- perdieron al cargar. «PETINA RODRIGUEZ JAIRO EMANUEL» entró como «PETINA JAIRO»; «NIEVAS VILLEGAS
-- JUAN PABLO» como «NIEVAS JUAN PABLO». Un nombre truncado no es cosmético cuando hay que emitir un
-- recibo, dar de alta en el IERIC o contestar un oficio judicial: es el nombre legal de la persona.
--
-- Y uno NO es un truncamiento sino un apellido que no existe: «ZOGBER» — el DNI dice «ZOGBE», y la
-- zona MRZ del documento (`ZOGBE<RAMOS`) lo confirma por segunda vía.
--
-- ═══ LOS TRES DNI VACÍOS ═══
--
-- No se inventan: los tres salen de un documento y los tres CIERRAN contra el CUIL que ya estaba
-- cargado (el CUIL lleva el DNI en el medio). Que dos fuentes independientes coincidan es la razón
-- por la que se pueden escribir sin preguntar.
--
-- ═══ LO QUE NO SE TOCA ═══
--
-- Los legajos INACTIVOS quedan afuera: hay doce con DNI o CUIL vacío y uno (`ROSALES CARLOS
-- ENRIQUE`) cuyo CUIL no contiene su DNI. El pedido fue sobre el plantel, y auditar a los inactivos
-- es otro trabajo — se declara acá para que no se pierda.

-- ── los nombres, como los escribe el documento ─────────────────────────────────────────────────
update public.personas set nombre_completo = 'MALDONADO BATISTA EMILIANO MIGUEL'
 where nombre_completo = 'MALDONADO BATISTA EMILIANO';
update public.personas set nombre_completo = 'NIEVAS VILLEGAS JUAN PABLO'
 where nombre_completo = 'NIEVAS JUAN PABLO';
update public.personas set nombre_completo = 'PASTRAN MARCELO IVAN'
 where nombre_completo = 'PASTRAN MARCELO';
update public.personas set nombre_completo = 'PETINA RODRIGUEZ JAIRO EMANUEL'
 where nombre_completo = 'PETINA JAIRO';
update public.personas set nombre_completo = 'RETA RAMON HECTOR SEBASTIAN'
 where nombre_completo = 'RETA RAMON HECTOR SEBAST';
update public.personas set nombre_completo = 'TELLO JUAN ALBERTO'
 where nombre_completo = 'TELLO JUAN';
update public.personas set nombre_completo = 'ZOGBE RAMOS WALTER LEONARDO'
 where nombre_completo = 'ZOGBER RAMOS WALTER LEONARDO';

-- ── los tres DNI que faltaban, cada uno con su CUIL como segunda vía ───────────────────────────
-- La condición `dni is null` no es decorativa: si alguien cargó uno en el medio, el suyo manda.
update public.personas set dni = '40367976'
 where nombre_completo = 'NIEVAS VILLEGAS JUAN PABLO' and (dni is null or dni = '');
update public.personas set dni = '16971187'
 where nombre_completo = 'CASTILLO BENITEZ JUAN CARLOS' and (dni is null or dni = '');
update public.personas set dni = '35850878'
 where nombre_completo = 'ROSALES DIEGO JOSE' and (dni is null or dni = '');
