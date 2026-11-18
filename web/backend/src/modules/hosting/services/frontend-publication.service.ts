import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { quoteArg, localExecutor } from "../../../shared/executor/index.js";
import { panelConfigDir } from "../../../config/paths.js";
import { ConflictError, ForbiddenError } from "../../../shared/errors/index.js";
import { getRedis } from "../../../shared/redis/index.js";
import { providerService } from "./provider.service.js";
import type { HostingProvider } from "../models/provider.model.js";

const uuid = z.string().uuid();
export const frontendPublicationSchema = z.object({
  versionId: uuid,
  versionNumber: z.number().int().positive().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  hosts: z.array(z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)).min(1).max(30),
  canonicalHost: z.string().max(253).optional(),
  localeRouting: z.object({
    locales: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(10),
    defaultLocale: z.string().regex(/^[a-z]{2}$/),
    cookie: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  }).strict().refine(x => x.locales.includes(x.defaultLocale) && new Set(x.locales).size === x.locales.length).optional(),
  apiRoutes: z.array(z.string().regex(/^\/[a-zA-Z0-9_/-]+$/)).max(10).optional(),
  proxyHosts: z.array(z.string().max(253)).max(30).optional(),
  environment: z.enum(["production", "preview"]).optional(),
  component: z.string().regex(/^[a-z][a-z0-9-]{0,29}$/).optional(),
  redirects: z.record(z.string(), z.string()).optional(),
}).strict().refine(x => new Set(x.hosts).size === x.hosts.length && (!x.canonicalHost || x.hosts.includes(x.canonicalHost)), "Dominios inválidos");
const identity = (provider: HostingProvider, account: string, project: string, previewVersion?: string) =>
  createHash("sha256").update(`${provider.id}:${uuid.parse(account)}:${uuid.parse(project)}${previewVersion ? ':preview:'+uuid.parse(previewVersion) : ''}`).digest("hex");
const registry = (id: string) => `${panelConfigDir()}/hosting/frontend-publications/${id}.json`;

async function readPublication(id: string) {
  try { return JSON.parse(String(await localExecutor.readFile(registry(id), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

/** Registry is on the panel; the immutable release and nginx are on its pinned
 * target. Never resolve deletion using the provider's current preference. */
export const frontendPublicationService = {
  async get(provider: HostingProvider, account: string, project: string) {
    await providerService.ownedAccount(provider, account);
    return readPublication(identity(provider, account, project));
  },
  async publish(provider: HostingProvider, account: string, project: string, raw: unknown, bytes: Buffer) {
    const owned=await providerService.ownedAccount(provider, account);
    if(owned.account.status !== 'active')throw new ForbiddenError('Cuenta suspendida');
    const input = frontendPublicationSchema.parse(raw);
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 32 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex") !== input.sha256)
      throw new ConflictError("Artefacto frontend inválido");
    return this.apply(provider, account, project, input, bytes);
  },
  /** Preserve an existing suspended release without ever exposing its hosts. */
  async stage(provider: HostingProvider, account: string, project: string, raw: unknown, bytes: Buffer) {
    await providerService.ownedAccount(provider, account);
    const input = frontendPublicationSchema.parse(raw);
    if (input.environment === 'preview' || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 32 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex") !== input.sha256)
      throw new ConflictError("Artefacto frontend inválido");
    return this.apply(provider, account, project, input, bytes, false, true);
  },
  async remove(provider: HostingProvider, account: string, project: string) {
    await providerService.ownedAccount(provider, account);
    let entries: Awaited<ReturnType<typeof localExecutor.readdir>>;
    try { entries = await localExecutor.readdir(`${panelConfigDir()}/hosting/frontend-publications`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; entries = []; }
    const current = await readPublication(identity(provider, account, project));
    const records = current ? [current] : [];
    for (const entry of entries) {
      if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
      const row = await readPublication(entry.name.slice(0,-5));
      if (row?.providerId === provider.id && row.accountId === account && row.projectId === project && row.environment === 'preview') records.push(row);
    }
    for (const row of records) await this.apply(provider, account, project, row, undefined);
    return { removed: true, alreadyRemoved: !records.length };
  },
  async withdraw(provider: HostingProvider, account: string, project: string) {
    const current=await this.get(provider,account,project);
    if(!current)return {removed:true,alreadyRemoved:true};
    return this.apply(provider,account,project,current,undefined,true);
  },
  async reconfigure(provider: HostingProvider, account: string, project: string, hosts: string[], redirects: Record<string,string> = {}) {
    const id = identity(provider, account, project);
    const current = await this.get(provider, account, project);
    if (!current) throw new ConflictError("Publicación frontend ausente");
    const bytes = await localExecutor.readFile(`${panelConfigDir()}/hosting/frontend-publications/${id}-${current.sha256}.zip`);
    if (!Buffer.isBuffer(bytes)) throw new ConflictError("Artefacto frontend ausente");
    return this.publish(provider, account, project, {
      versionId: current.versionId, versionNumber: current.versionNumber, sha256: current.sha256, hosts,
      redirects,
      ...(current.component ? { component: current.component } : {}),
      ...(current.localeRouting ? { localeRouting: current.localeRouting } : {}),
      ...(current.canonicalHost && hosts.includes(current.canonicalHost) ? { canonicalHost: current.canonicalHost } : {}),
      ...(current.apiRoutes ? { apiRoutes: current.apiRoutes, proxyHosts: (current.proxyHosts ?? []).filter((host: string) => hosts.includes(host)) } : {}),
    }, bytes);
  },
  async apply(provider: HostingProvider, account: string, project: string, input: z.infer<typeof frontendPublicationSchema> & { targetId?: string }, bytes?: Buffer, retain = false, stageOnly = false) {
    const id = identity(provider, account, project, input.environment === 'preview' ? input.versionId : undefined), redis = getRedis(), token = randomUUID(), key = `lxp:frontend:${id}`;
    if (await redis.set(key, token, "EX", 180, "NX") !== "OK") throw new ConflictError("Publicación en curso");
    try {
      const previous = await readPublication(id);
      if (stageOnly && previous && previous.active !== false) throw new ConflictError("Publicación frontend activa");
      const targetId = previous?.targetId ?? provider.frontendTargetId;
      if (!targetId) throw new ConflictError("Selecciona el servidor frontend en HOSTING");
      if (bytes && previous && previous.targetId !== provider.frontendTargetId)
        throw new ConflictError("La publicación requiere migración al nuevo servidor");
      const executor = await providerService.frontendExecutor(provider, targetId);
      const directory = `/tmp/lxp-frontend-${randomUUID()}`;
      await executor.mkdir(directory);
      try {
        // Explicit allowlist: adoptionHashes, paths and commands are never API data.
        const request = { providerId: provider.id, accountId: account, projectId: project, targetId,
          versionId: input.versionId, sha256: input.sha256, hosts: input.hosts,
          ...(input.redirects ? {redirects:input.redirects} : {}),
          ...(input.localeRouting ? {localeRouting:input.localeRouting} : {}),
          ...(input.versionNumber ? { versionNumber: input.versionNumber } : {}),
          ...(input.component ? { component: input.component } : {}),
          ...(input.environment === 'preview' ? { environment: 'preview', previewAuthorizationUrl: provider.previewAuthorizationUrl } : {}),
          ...(input.apiRoutes?.length || input.proxyHosts?.length ? { apiRoutes: input.apiRoutes ?? [], proxyHosts: input.proxyHosts ?? [], backendOrigin: input.environment === 'preview' ? provider.previewBackendGatewayUrl : provider.backendGatewayUrl } : {}),
          ...(input.canonicalHost ? { canonicalHost: input.canonicalHost } : {}) };
        await executor.writeFile(directory + "/request.json", JSON.stringify(request), { mode: 0o600 });
        if (bytes) {
          await localExecutor.mkdir(`${panelConfigDir()}/hosting/frontend-publications`, { recursive: true });
          await localExecutor.writeFile(`${panelConfigDir()}/hosting/frontend-publications/${id}-${input.sha256}.zip`, bytes, { mode: 0o600 });
          await executor.writeFile(directory + "/artifact.zip", bytes, { mode: 0o600 });
        }
        const command = `/usr/bin/sudo -n /usr/lib/luxipanel/frontend-publication ${bytes ? (stageOnly ? "stage" : "publish") : "remove"} ${quoteArg(directory + "/request.json")}${bytes ? " " + quoteArg(directory + "/artifact.zip") : ""}`;
        const result = await executor.exec(command, { timeoutMs: 120000 });
        if (result.exitCode !== 0) throw new ConflictError("No se pudo actualizar la publicación frontend");
        const receipt = JSON.parse(result.stdout);
        await localExecutor.mkdir(`${panelConfigDir()}/hosting/frontend-publications`, { recursive: true });
        if (bytes) {
          const staged = registry(id) + ".next";
          await localExecutor.writeFile(staged, JSON.stringify({ ...request, ...receipt, active:!stageOnly }), { mode: 0o600 });
          const saved = await localExecutor.exec(`mv -f -- ${quoteArg(staged)} ${quoteArg(registry(id))}`, { timeoutMs: 5000 });
          if (saved.exitCode !== 0) throw new ConflictError("Registro frontend pendiente de reconciliar");
        } else if (previous && retain) await localExecutor.writeFile(registry(id),JSON.stringify({...previous,active:false}),{mode:0o600});
        else if (previous) await localExecutor.unlink(registry(id));
        return receipt;
      } finally {
        await executor.exec(`rm -f -- ${quoteArg(directory + "/artifact.zip")} ${quoteArg(directory + "/request.json")} && rmdir -- ${quoteArg(directory)}`, { timeoutMs: 10000 });
      }
    } finally {
      await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, key, token);
    }
  },
};
