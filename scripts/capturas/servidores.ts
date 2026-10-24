/**
 * Servidores locales del script de capturas: `dev` sobre la galeria (para capturarla) y un servidor estatico
 * desligado que sirve las capturas y la pagina de comparacion (AGENTS.md: nada de `file://`).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface DevDeGaleria {
  /** `http://127.0.0.1:<puerto>/` */
  url: string;
  detener: () => void;
}

/** Arranca `diagrams dev` sobre `workspace` en un puerto libre y espera su URL. Necesita `pnpm build`. */
export async function iniciarDevDeGaleria(repo: string, workspace: string): Promise<DevDeGaleria> {
  const bin = join(repo, 'packages/cli/dist/bin.js');
  if (!existsSync(bin)) throw new Error('Falta el build del CLI: ejecuta `pnpm build` antes de `pnpm capturas`.');
  const hijo = spawn('node', [bin, 'dev', '--workspace', workspace, '--port', '0'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise<string>((resolver, rechazar) => {
    let salida = '';
    const alRecibir = (trozo: Buffer): void => {
      salida += trozo.toString();
      const coincide = /escuchando en (http:\/\/\S+)/.exec(salida);
      if (coincide !== null) resolver(coincide[1]!);
    };
    hijo.stdout.on('data', alRecibir);
    hijo.stderr.on('data', alRecibir);
    hijo.on('exit', () => rechazar(new Error(`\`dev\` termino sin arrancar:\n${salida.trim()}`)));
  });
  return { url, detener: () => void hijo.kill() };
}

async function puertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer();
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      servidor.close(() => resolver(port));
    });
  });
}

/**
 * Sirve `raiz` en un puerto libre con un servidor desligado del script (sigue vivo al terminar) y devuelve su
 * origen. Un servidor anterior de la misma `raiz` se detiene antes (su pid queda en `servidor.json`).
 */
export async function servirEstatico(raiz: string): Promise<string> {
  const registro = join(raiz, 'servidor.json');
  if (existsSync(registro)) {
    try {
      process.kill((JSON.parse(readFileSync(registro, 'utf8')) as { pid: number }).pid);
    } catch {
      // Ya no estaba vivo.
    }
  }
  const puerto = await puertoLibre();
  const hijo: ChildProcess = spawn('python3', ['-m', 'http.server', String(puerto), '--bind', '127.0.0.1', '-d', raiz], { detached: true, stdio: 'ignore' });
  hijo.unref();
  writeFileSync(registro, JSON.stringify({ pid: hijo.pid, puerto }));
  await esperarA(puerto);
  return `http://localhost:${puerto}`;
}

async function esperarA(puerto: number): Promise<void> {
  for (let intento = 0; intento < 50; intento++) {
    try {
      await fetch(`http://127.0.0.1:${puerto}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`El servidor estatico no respondio en el puerto ${puerto}`);
}
