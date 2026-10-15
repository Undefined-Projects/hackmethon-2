import { API_URL } from './socket';

/**
 * URL del logo de un equipo, o `null` si no tiene.
 *
 * Los bytes NO viajan en el snapshot: diez logos serían varios megas
 * repetidos en cada repintado y a cada cliente. Lo que viaja es
 * `logoAt`, la fecha del logo, y con ella se compone esta URL.
 *
 * Esa fecha en la query es justo lo que hace que el cambio se vea: la
 * respuesta se cachea para siempre —es inmutable por definición, porque
 * cambiar el logo cambia la URL— y sin el parámetro el proyector
 * seguiría enseñando el anterior hasta que alguien recargara a mano.
 */
export const urlLogo = (teamId: string, logoAt: number | null): string | null =>
  logoAt === null ? null : `${API_URL}/api/equipos/${teamId}/logo?v=${logoAt}`;

export const LOGO_MAX = 512 * 1024;

/** Lo que el servidor puede rechazar, dicho para una persona. */
export const ERROR_IDENTIDAD: Record<string, string> = {
  NOMBRE_VACIO: 'El nombre no puede quedar vacío',
  NOMBRE_LARGO: 'El nombre no puede pasar de 24 caracteres',
  NOMBRE_REPETIDO: 'Ya hay otro equipo con ese nombre',
  ARCHIVO_VACIO: 'Ese archivo está vacío',
  DEMASIADO_GRANDE: 'El logo pasa de 512 kB',
  NO_ES_IMAGEN: 'Ese archivo no es un PNG, un JPG ni un WEBP',
  NOT_ALLOWED: 'Esa acción es solo del panel',
  TIMEOUT: 'El servidor no respondió',
};
