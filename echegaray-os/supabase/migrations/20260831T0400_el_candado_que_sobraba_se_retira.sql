-- EL CANDADO QUE SOBRABA SE RETIRA.
--
-- ═══ UN PERMISO NO ES UNA CAPACIDAD, Y CORTA PARA LOS DOS LADOS ═══
--
-- Las migraciones `20260831T0200` y `T0230` agregaron un trigger para impedir reescribir la
-- composición de una cotización congelada. **La protección ya existía**:
-- `composicion_congelada_solo_lectura_t`, que cubre INSERT, DELETE **y** UPDATE, y cuyo mensaje
-- («no se toca») tiene tests desde el 22/08 — los contraejemplos del auditor de aquella vuelta.
--
-- El error de origen fue de MEDICIÓN, no de código: se preguntó si `authenticated` tenía el GRANT de
-- UPDATE sobre la tabla, salió que sí, y de ahí se concluyó que la tabla era escribible. Pero un
-- GRANT es un permiso, no una capacidad: entre el permiso y la escritura había un trigger. La misma
-- frase que este programa usó para exigir que los controles se prueben —«existe el código» no es
-- «corrió»— vale al revés: **«tiene el permiso» tampoco es «puede»**. La forma correcta de medirlo
-- es la que quedó en `xsas-dod.mjs`: intentar el UPDATE dentro de una transacción y mirar si la base
-- lo rechaza.
--
-- Lo que el candado de más produjo, y por qué se retira en vez de dejarse «por las dudas»: los
-- triggers de un mismo evento corren en orden alfabético, así que
-- `composicion_congelada_no_se_reescribe` se adelantaba a `composicion_congelada_solo_lectura_t` y
-- devolvía OTRO mensaje. Dos tests que llevaban una semana en verde se pusieron rojos —esperaban
-- «no se toca» y recibían «no se reescribe»—, y esos tests son la evidencia de que las cinco puertas
-- que el auditor encontró abiertas siguen cerradas. Un control redundante que rompe la prueba del
-- control bueno no suma defensa: le tapa la voz.
--
-- Las dos migraciones anteriores no se editan: su hash está en el ledger y editarlas ocultaría que
-- se aplicaron. Quedan en la historia con este archivo al lado explicando qué pasó.

drop trigger if exists composicion_congelada_no_se_reescribe on public.cotizacion_partida_composicion;
drop function if exists public.una_composicion_congelada_no_se_reescribe();
