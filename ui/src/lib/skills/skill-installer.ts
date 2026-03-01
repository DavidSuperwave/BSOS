import { sshExec } from "@/lib/ssh";
import type { SkillInstallResult, SkillInstallSpec } from "./types";

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function toCommand(spec: SkillInstallSpec): string | null {
  if (spec.kind === "node" && spec.package) {
    return `npm install -g --ignore-scripts ${shQuote(spec.package)}`;
  }
  if (spec.kind === "download" && spec.url) {
    const targetDir = spec.targetDir || "/data/skills/downloads";
    const fileName = spec.url.split("/").pop() || "skill-download";
    const filePath = `${targetDir}/${fileName}`;
    const archive = (spec.archive || "").toLowerCase();
    const strip = Number.isFinite(spec.stripComponents) ? Math.max(0, Number(spec.stripComponents)) : 0;
    const extract = spec.extract ?? Boolean(archive);

    const commands: string[] = [
      `mkdir -p ${shQuote(targetDir)}`,
      `curl -fsSL ${shQuote(spec.url)} -o ${shQuote(filePath)}`,
    ];

    if (extract) {
      if (archive === "tar.gz" || archive === "tgz") {
        commands.push(
          `tar -xzf ${shQuote(filePath)} -C ${shQuote(targetDir)}${strip > 0 ? ` --strip-components=${strip}` : ""}`
        );
      } else if (archive === "tar.bz2" || archive === "tbz2") {
        commands.push(
          `tar -xjf ${shQuote(filePath)} -C ${shQuote(targetDir)}${strip > 0 ? ` --strip-components=${strip}` : ""}`
        );
      } else if (archive === "zip") {
        commands.push(`unzip -o ${shQuote(filePath)} -d ${shQuote(targetDir)}`);
      } else {
        return null;
      }
    }

    return commands.join(" && ");
  }
  return null;
}

function validateInstallSpec(spec: SkillInstallSpec): string | null {
  if (spec.kind === "node") {
    if (!spec.package) return "Node installer requires package";
    if (!/^[A-Za-z0-9@/_\-.]+$/.test(spec.package)) {
      return "Node package contains unsupported characters";
    }
    return null;
  }

  if (spec.kind === "download") {
    if (!spec.url) return "Download installer requires url";
    if (!/^https?:\/\//i.test(spec.url)) return "Download url must be http/https";
    return null;
  }

  return "Installer kind is not supported in this runtime";
}

export async function installSkillOnCompanyContainer(params: {
  containerName: string | null;
  installSpec: SkillInstallSpec;
}): Promise<SkillInstallResult> {
  if (!params.containerName) {
    return {
      ok: false,
      message: "Company container is not provisioned",
      code: null,
    };
  }

  const validationError = validateInstallSpec(params.installSpec);
  if (validationError) {
    return {
      ok: false,
      message: validationError,
      code: null,
    };
  }

  const command = toCommand(params.installSpec);
  if (!command) {
    return {
      ok: false,
      message: "Could not build installer command",
      code: null,
    };
  }

  try {
    const execResult = await sshExec([
      `docker exec ${params.containerName} sh -lc ${shQuote(command)}`,
    ]);
    return {
      ok: execResult.code === 0,
      message: execResult.code === 0 ? "Installed" : `Install failed (exit ${execResult.code})`,
      stdout: execResult.stdout.trim(),
      stderr: execResult.stderr.trim(),
      code: execResult.code,
      warnings: execResult.code === 0 ? [] : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Installer execution failed",
      code: null,
    };
  }
}
