import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import * as path from "path";
import { Xid } from "xid-ts";
import binaryen from "assemblyscript/lib/binaryen.js";
import { Colors } from "assemblyscript/util/terminal.js";
import { WriteStream as FSWriteStream } from "fs";
import { WriteStream as TTYWriteStream } from "tty";
import { FunctionSignature, TypeDefinition } from "./types.js";
import writeLogo from "./logo.js";

export class HypermodeMetadata {
  buildId: string;
  buildTs: string;
  plugin: string;
  library: string;
  gitRepo?: string;
  gitCommit?: string;
  functions: FunctionSignature[] = [];
  types: TypeDefinition[] = [];

  static generate(): HypermodeMetadata {
    const m = new HypermodeMetadata();

    m.buildId = new Xid().toString();
    m.buildTs = new Date().toISOString();
    m.plugin = getPluginInfo();
    m.library = getHypermodeInfo();

    if (isGitRepo()) {
      m.gitRepo = getGitRepo();
      m.gitCommit = getGitCommit();
    }

    return m;
  }

  addFunctions(functions: FunctionSignature[]) {
    this.functions.push(...functions);
  }

  addTypes(types: TypeDefinition[]) {
    this.types.push(...types);
  }

  writeToModule(module: binaryen.Module) {
    const encoder = new TextEncoder();
    const json = JSON.stringify(this);
    module.addCustomSection("hypermode_meta", encoder.encode(json));
  }

  logToStream(stream: FSWriteStream | TTYWriteStream, markdown = false) {
    writeLogo(stream, markdown);

    const isTTY = stream instanceof TTYWriteStream;
    const boldOn = isTTY ? "\u001b[1m" : "";
    const boldOff = isTTY ? "\u001b[0m" : "";

    const colors = new Colors(stream as { isTTY: boolean });
    const writeHeader = (text: string) => {
      if (markdown) {
        stream.write(`### ${text}\n`);
      } else {
        stream.write(boldOn + colors.blue(text) + boldOff + "\n");
      }
    };

    const writeItem = (text: string) => {
      if (markdown) {
        stream.write(`  - ${text}\n`);
      } else {
        stream.write(`  ${colors.cyan(text)}\n`);
      }
    };

    const writeTable = (rows: string[][]) => {
      const pad = rows.reduce(
        (max, row) => [
          Math.max(max[0], row[0].length),
          Math.max(max[1], row[1].length),
        ],
        [0, 0],
      );

      if (markdown) {
        stream.write(`| ${" ".repeat(pad[0])} | ${" ".repeat(pad[1])} |\n`);
        stream.write(`| ${"-".repeat(pad[0])} | ${"-".repeat(pad[1])} |\n`);
      }
      rows.forEach((row) => {
        if (row) {
          const padding0 = " ".repeat(pad[0] - row[0].length);
          const padding1 = " ".repeat(pad[1] - row[1].length);
          if (markdown) {
            stream.write(`| ${row[0]}${padding0} | ${row[1]}${padding1} |\n`);
          } else {
            const key = colors.cyan(row[0] + ":");
            const value = colors.blue(row[1]);
            stream.write(`  ${key}${padding0} ${value}\n`);
          }
        }
      });
    };

    writeHeader("Plugin Metadata:");
    writeTable([
      ["Plugin Name", this.plugin],
      ["Library", this.library],
      ["Build ID", this.buildId],
      ["Build Timestamp", this.buildTs],
      this.gitRepo ? ["Git Repo", this.gitRepo] : undefined,
      this.gitCommit ? ["Git Commit", this.gitCommit] : undefined,
    ]);
    stream.write("\n");

    writeHeader("Hypermode Functions:");
    this.functions.forEach((f) => writeItem(f.toString()));
    stream.write("\n");

    const types = this.types.filter((t) => !t.isHidden());
    if (types.length > 0) {
      writeHeader("Custom Data Types:");
      types.forEach((t) => writeItem(t.toString()));
      stream.write("\n");
    }

    if (process.env.HYPERMODE_DEBUG) {
      writeHeader("Metadata JSON:");
      stream.write(JSON.stringify(this, undefined, 2));
      stream.write("\n\n");
    }
  }
}

function getHypermodeInfo(): string {
  const filePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "package.json",
  );
  const json = readFileSync(filePath).toString();
  const lib = JSON.parse(json);
  return `${lib.name}@${lib.version}`;
}

function getPluginInfo(): string {
  const pluginName = process.env.npm_package_name;
  const pluginVersion = process.env.npm_package_version;
  return `${pluginName}@${pluginVersion}`;
}

function isGitRepo(): boolean {
  try {
    // This will throw if not in a git repo, or if git is not installed.
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

function getGitRepo(): string {
  let url = execSync("git remote get-url origin").toString().trim();

  // Convert ssh to https
  if (url.startsWith("git@")) {
    url = url.replace(":", "/").replace("git@", "https://");
  }

  // Remove the .git suffix
  if (url.endsWith(".git")) {
    url = url.slice(0, -4);
  }

  return url;
}

function getGitCommit(): string {
  return execSync("git rev-parse HEAD").toString().trim();
}
