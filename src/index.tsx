import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { config } from "dotenv";
import { App } from "./app";

config();
process.env.LOG_LEVEL = "silent";

const VERSION = "0.5.37";

const program = new Command();
program.name("astreus").version(VERSION);
program.command("chat", { isDefault: true }).action(() => {
  console.clear();
  render(<App />, { exitOnCtrlC: false, patchConsole: true });
});
program.parse();
