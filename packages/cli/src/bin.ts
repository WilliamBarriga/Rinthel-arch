#!/usr/bin/env node
import { run } from './index';

const resultado = await run(process.argv.slice(2));
process.stdout.write(resultado.stdout);
process.stderr.write(resultado.stderr);
process.exitCode = resultado.exitCode;
