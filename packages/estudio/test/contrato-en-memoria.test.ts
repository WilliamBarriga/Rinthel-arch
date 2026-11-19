import { devEnMemoria, probarContratoDeDev } from '../src/contrato';

probarContratoDeDev(async (contenido) => devEnMemoria(contenido));
