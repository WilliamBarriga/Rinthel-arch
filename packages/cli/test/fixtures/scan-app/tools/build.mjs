import { readFileSync } from "node:fs";
import chalk from "chalk";

export const banner = chalk.bold(readFileSync("banner.txt", "utf8"));
