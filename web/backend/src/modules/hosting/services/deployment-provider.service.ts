import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { panelConfigDir } from "../../../config/paths.js";
import {
  quoteArg,
  pathExists,
  type Executor,
} from "../../../shared/executor/index.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../shared/errors/index.js";
import { providerService } from "./provider.service.js";
import { frontendPublicationService } from "./frontend-publication.service.js";
import { providerRepository } from "../repositories/provider.repository.js";
import type { HostingProvider } from "../models/provider.model.js";
import { getRedis } from "../../../shared/redis/index.js";

const uuid = z.string().uuid(),
  name = z.string().regex(/^[a-z][a-z0-9-]{0,29}$/);
const relative = z
  .string()
  .max(300)
  .refine(
    (v) =>
      v === "." ||
      (/^[A-Za-z0-9_./@-]+$/.test(v) &&
        !v.startsWith("/") &&
        v.split("/").every((p) => p && p !== "." && p !== "..")),
  );
export const deploymentSnapshotSchema = z
  .object({
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    manifest: z
      .object({
        schemaVersion: z.literal(1),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        components: z
          .array(
            z
              .object({
                name,
                context: relative,
                surface: z.enum(["http", "worker", "mobile", "static"]),
                role: z.enum(["frontend", "backend"]).optional(),
                port: z.number().int().min(1).max(65535),
                healthPath: z
                  .string()
                  .regex(/^\/[A-Za-z0-9_/?=&.-]*$/)
                  .max(200),
                stack: z.string().max(40),
                dockerfile: relative.optional(),
                recipe: z.string().max(20000).optional(),
                start: z.string().max(2000).optional(),
                build: z.string().max(2000).optional(),
                output: relative.optional(),
                generatedFiles: z
                  .record(z.string(), z.string().max(10000))
                  .refine((files) =>
                    Object.keys(files).every(
                      (p) => p === ".luxisoft-runtime/Caddyfile",
                    ),
                  )
                  .optional(),
                routePrefix: z
                  .string()
                  .regex(/^\/[a-zA-Z0-9_/-]+$/)
                  .max(100)
                  .optional(),
                volumes: z
                  .array(
                    z.object({
                      name,
                      path: z
                        .string()
                        .regex(
                          /^\/(?:app|data|srv|var\/lib)\/[A-Za-z0-9_/-]+$/,
                        ),
                    }),
                  )
                  .max(10),
              })
              .strict(),
          )
          .min(1)
          .max(10),
        resources: z
          .array(
            z.object({
              name,
              engine: z.enum(["postgres", "mysql", "redis", "mongo", "sqlite"]),
            }),
          )
          .max(5),
      })
      .strict(),
  })
  .strict();
const scratchProbe = "test -x /usr/lib/luxipanel/static-build-scratch.py && grep -Fq LUXISOFT_BUILD_SCRATCH /usr/lib/luxipanel/deployment-tenant.mjs && test -x /usr/sbin/mkfs.ext4 && test -x /usr/bin/unshare && test -c /dev/loop-control";
export const deploymentJobSchema = z
  .object({
    frontendScratchVersion: z.literal(1).optional(),
    requestId: uuid,
    versionId: uuid,
    environment: z.enum(["preview", "production"]),
    variables: z
      .record(
        z.string().regex(/^[A-Z][A-Z0-9_]{0,100}$/),
        z.string().max(10000),
      )
      .refine(
        (v) =>
          Object.keys(v).length <= 100 &&
          !Object.keys(v).some((k) =>
            /^(?:EXPO_TOKEN|LUXIPANEL_|LD_|NODE_OPTIONS|GIT_|SSH_)/.test(k),
          ),
      )
      .default({}),
    executionBudget: z.object({
      version: z.literal(1),
      maxExecutionSeconds: z.number().int().min(1).max(1900),
    }).strict().optional(),
  })
  .strict();
const deploymentHostname = z.string().trim().toLowerCase().max(253).refine(
  (value) => /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value),
  "Dominio inválido",
);
export const deploymentProductionRoutesSchema = z.object({
  requestId: uuid,
  versionId: uuid,
  versionNumber: z.number().int().positive(),
  hosts: z.array(z.object({
    hostname: deploymentHostname,
    defaultComponent: name,
    redirectTo: deploymentHostname.optional(),
    expiresAt: z.string().datetime().optional(),
  }).strict()).min(1).max(30).refine(
    (rows) => new Set(rows.map((row) => row.hostname)).size === rows.length,
    "Dominio duplicado",
  ),
}).strict();
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((key) => (value as any)[key] !== undefined)
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as any)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
function publicJob(state: any) {
  const {
    id,
    status,
    versionId,
    environment,
    error,
    logs,
    result,
    usage,
    createdAt,
    updatedAt,
  } = state;
  return {
    id,
    status,
    versionId,
    environment,
    error,
    logs,
    result,
    usage,
    createdAt,
    updatedAt,
  };
}
async function readJson(executor: Executor, file: string) {
  return JSON.parse(String(await executor.readFile(file, "utf8")));
}
async function optionalJson(executor: Executor, file: string) {
  return (await pathExists(executor, file)) ? readJson(executor, file) : null;
}
async function context(
  provider: HostingProvider,
  accountRef: string,
  projectRef: string,
) {
  uuid.parse(accountRef);
  uuid.parse(projectRef);
  const owned = await providerService.ownedAccount(provider, accountRef);
  if (owned.account.status !== "active")
    throw new ForbiddenError("Cuenta suspendida");
  if (
    !/^hp[a-f0-9]{20}$/.test(owned.account.username) ||
    owned.account.homeRoot !== `/home/${owned.account.username}`
  )
    throw new ForbiddenError("Identidad hosting inválida");
  const id = hash(`${provider.id}:${accountRef}:${projectRef}`),
    root = path.join(panelConfigDir(), "hosting", "deployments", id);
  return { ...owned, id, root };
}
async function locked<T>(key: string, fn: () => Promise<T>) {
  const redis = getRedis(),
    owner = randomUUID(),
    lock = "lxp:deployment:" + hash(key);
  if ((await redis.set(lock, owner, "EX", 120, "NX")) !== "OK")
    throw new ConflictError("Operación concurrente");
  try {
    return await fn();
  } finally {
    await redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      1,
      lock,
      owner,
    );
  }
}
/** Only supervisor-staged bytes from a finished, owned job are downloadable.
 * The caller cannot supply a filesystem path or read a tenant's home. */
async function staticArtifact(
  provider: HostingProvider, account: string, project: string, job: string, component: string,
) {
  uuid.parse(job);
  name.parse(component);
  const c = await context(provider, account, project);
  const root = path.join(c.root, "jobs", job);
  const state = await optionalJson(c.executor, path.join(root, "state.json"));
  if (!state || state.status !== "finished") throw new NotFoundError("Artefacto no disponible");
  const part = state.result?.components?.find((p: { name: string }) => p.name === component);
  if (part?.surface !== "static" || part.port !== null ||
      !/^[a-f0-9]{64}$/.test(part.staticArchive?.sha256 ?? "") ||
      !Number.isSafeInteger(part.staticArchive?.bytes) ||
      part.staticArchive.bytes < 1 || part.staticArchive.bytes > 32 * 1024 * 1024)
    throw new NotFoundError("Artefacto no disponible");
  return { ...c, file: path.join(root, "static", component + ".zip"), meta: part.staticArchive as { bytes: number; sha256: string } };
}
export const deploymentProviderService = {
  async staticArtifact(provider: HostingProvider, account: string, project: string, job: string, component: string) {
    const c = await staticArtifact(provider, account, project, job, component);
    const state = await readJson(c.executor, path.join(c.root,'jobs',job,'state.json'));
    const bytes = await frontendPublicationService.readArtifact(provider,account,project,uuid.parse(state.versionId),component,c.meta);
    if(bytes.length!==c.meta.bytes||hash(bytes)!==c.meta.sha256)throw new ConflictError("Artefacto estático inválido");
    return { bytes, sha256: c.meta.sha256 };
  },
  async deleteStaticArtifact(provider: HostingProvider, account: string, project: string, job: string, component: string) {
    const c = await staticArtifact(provider, account, project, job, component);
    return locked(c.id, async () => {
      if (await pathExists(c.executor, c.file)) await c.executor.unlink(c.file);
      return { removed: true };
    });
  },
  async retainStaticArtifact(
    provider: HostingProvider, account: string, project: string, job: string, component: string, bytes: unknown,
  ) {
    const c = await staticArtifact(provider, account, project, job, component);
    if (!Buffer.isBuffer(bytes) || bytes.length !== c.meta.bytes || hash(bytes) !== c.meta.sha256)
      throw new ConflictError("Artefacto estático inválido");
    return locked(c.id, async () => {
      const state = await readJson(c.executor, path.join(c.root,'jobs',job,'state.json'));
      const versionId=uuid.parse(state.versionId);
      await frontendPublicationService.putArtifact(provider,account,project,versionId,component,bytes);
      const metadataFile=path.join(c.root,'versions',versionId,'frontend-artifacts.json');
      const previous=await optionalJson(c.executor,metadataFile)??{};
      await c.executor.writeFile(metadataFile,JSON.stringify({...previous,[component]:c.meta}),{mode:0o600});
      return { retained: true, versionId, component, sha256: c.meta.sha256 };
    });
  },
  async register(provider: HostingProvider, account: string, project: string) {
    const c = await context(provider, account, project);
    await c.executor.mkdir(c.root, { recursive: true });
    const probe = await c.executor.exec(
      "test -x /usr/lib/luxipanel/deployment-helper && command -v podman",
      { timeoutMs: 5000 },
    );
    if (
      probe.exitCode === 0 &&
      (await pathExists(c.executor, path.join(c.root, "retire.json")))
    ) {
      const resume = path.join(c.root, "resume.json");
      await c.executor.writeFile(
        resume,
        JSON.stringify({
          projectId: project,
          username: c.account.username,
          home: c.account.homeRoot,
          root: c.root,
        }),
        { mode: 0o600 },
      );
      const result = await c.executor.exec(
        `/usr/bin/sudo -n /usr/lib/luxipanel/deployment-helper ${quoteArg(resume)} resume`,
        { timeoutMs: 30000 },
      );
      if (result.exitCode !== 0)
        throw new ConflictError("deployment_resume_failed");
      await c.executor.unlink(path.join(c.root, "retire.json"));
      await c.executor.unlink(resume);
    }
    const scratch = await c.executor.exec(scratchProbe, {timeoutMs:5000});
    return { id:c.id, runtimeInstalled:probe.exitCode === 0, frontendScratchVersion:scratch.exitCode === 0 ? 1 : 0 };
  },
  async snapshot(
    provider: HostingProvider,
    account: string,
    project: string,
    version: string,
    input: z.infer<typeof deploymentSnapshotSchema>,
  ) {
    uuid.parse(version);
    const c = await context(provider, account, project);
    const { digest, ...contents } = input.manifest;
    if (hash(canonicalJson(contents)) !== digest)
      throw new ConflictError("Manifiesto modificado");
    {
      const frontend = input.manifest.components.filter(p => p.surface === "static" || p.surface === "mobile" && p.role === "frontend");
      if(frontend.length)await frontendPublicationService.requireTarget(provider);
      if (frontend.length > 1) throw new ConflictError("Consolida la interfaz en un componente frontend independiente");
      for (const part of input.manifest.components) {
        if (part.surface === 'mobile' && part.role !== 'frontend')
          throw new ConflictError('El preview web móvil debe exportarse al servidor frontend');
        if (part.surface === "http" && part.role !== "backend")
          throw new ConflictError("Separa la interfaz estática y la API backend antes de desplegar; no se permite servir interfaces en BACKEND");
        if (part.surface === "static" && part.role === "backend")
          throw new ConflictError("La interfaz pertenece al servidor frontend");
        if (frontend.length && part.surface === "http" && !part.routePrefix)
          throw new ConflictError("La API backend requiere un prefijo de ruta independiente");
      }
    }
    return locked(c.id, async () => {
      const root = path.join(c.root, "versions", version),
        file = path.join(root, "manifest.json"),
        old = await optionalJson(c.executor, file);
      if (
        old &&
        (old.sourceDigest !== input.sourceDigest ||
          old.manifest.digest !== digest)
      )
        throw new ConflictError("Versión inmutable");
      await c.executor.mkdir(root, { recursive: true });
      if (!old)
        await c.executor.writeFile(file, JSON.stringify(input), {
          mode: 0o600,
        });
      return { versionId: version, sourceDigest: input.sourceDigest };
    });
  },
  async source(
    provider: HostingProvider,
    account: string,
    project: string,
    version: string,
    buffer: Buffer,
  ) {
    uuid.parse(version);
    if (!Buffer.isBuffer(buffer) || buffer.length > 32 * 1024 * 1024)
      throw new ConflictError("Archivo inválido o demasiado grande");
    const c = await context(provider, account, project),
      root = path.join(c.root, "versions", version),
      manifest = await readJson(c.executor, path.join(root, "manifest.json"));
    if (hash(buffer) !== manifest.sourceDigest)
      throw new ConflictError("Código no coincide con la versión");
    return locked(c.id, async () => {
      const file = path.join(root, "source.zip");
      if (!(await pathExists(c.executor, file)))
        await c.executor.writeFile(file, buffer, { mode: 0o600 });
      return { versionId: version };
    });
  },
  async enqueue(
    provider: HostingProvider,
    account: string,
    project: string,
    input: z.infer<typeof deploymentJobSchema>,
  ) {
    const c = await context(provider, account, project);
    return locked(c.id, async () => {
      if (await pathExists(c.executor, path.join(c.root, "retire.json")))
        throw new ConflictError("deployment_retired");
      const root = path.join(c.root, "jobs", input.requestId),
        stateFile = path.join(root, "state.json"),
        requestDigest = hash(JSON.stringify(input)),
        old = await optionalJson(c.executor, stateFile);
      if (old) {
        if (old.requestDigest !== requestDigest)
          throw new ConflictError("Identificador de trabajo reutilizado");
        return publicJob(old);
      }
      const versionRoot = path.join(c.root, "versions", input.versionId),
        snapshot = deploymentSnapshotSchema.parse(
          await readJson(c.executor, path.join(versionRoot, "manifest.json")),
        );
      if (input.frontendScratchVersion === 1) {
        const {components, resources} = snapshot.manifest;
        if (input.environment !== 'preview' || !components.length || resources.length || components.some(part => part.surface !== 'static'))
          throw new ConflictError('invalid_frontend_scratch_scope');
        if ((await c.executor.exec(scratchProbe, {timeoutMs:5000})).exitCode !== 0)
          throw new ConflictError('frontend_build_scratch_unavailable');
      }
      const frontend = snapshot.manifest.components.filter(p=>p.surface==='static'||p.surface==='mobile'&&p.role==='frontend');
      for(const part of snapshot.manifest.components)if(part.surface==='http'&&part.role!=='backend')throw new ConflictError('backend_role_required');
      if(frontend.length)await frontendPublicationService.requireTarget(provider);
      const artifacts=await optionalJson(c.executor,path.join(versionRoot,'frontend-artifacts.json'))??{};
      if(input.environment==='production'&&frontend.some(part=>!artifacts[part.name])) {
        const jobs=await c.executor.readdir(path.join(c.root,'jobs')).catch(()=>[]);
        for(const job of jobs){
          if(!/^[a-f0-9-]{36}$/.test(job.name))continue;
          const previous=await optionalJson(c.executor,path.join(c.root,'jobs',job.name,'state.json'));
          if(previous?.versionId!==input.versionId||previous?.status!=='finished')continue;
          for(const part of previous.result?.components??[])if(part.surface==='static'&&part.staticArchive&&!artifacts[part.name]) {
            const bytes=await frontendPublicationService.readArtifact(provider,account,project,input.versionId,part.name,part.staticArchive);
            artifacts[part.name]=await frontendPublicationService.putArtifact(provider,account,project,input.versionId,part.name,bytes);
          }
        }
        if(frontend.some(part=>!artifacts[part.name]))throw new ConflictError('frontend_artifact_missing_rebuild_preview');
      }
      if (!(await pathExists(c.executor, path.join(versionRoot, "source.zip"))))
        throw new ConflictError("Falta el código de la versión");
      const probe = await c.executor.exec(
        "test -x /usr/lib/luxipanel/deployment-helper && command -v podman",
        { timeoutMs: 5000 },
      );
      if (probe.exitCode !== 0)
        throw new ConflictError("deployment_runtime_not_installed");
      await c.executor.mkdir(root, { recursive: true });
      const state = {
        id: input.requestId,
        status: "queued",
        versionId: input.versionId,
        environment: input.environment,
        requestDigest,
        createdAt: new Date().toISOString(),
      };
      await c.executor.writeFile(stateFile, JSON.stringify(state), {
        mode: 0o600,
      });
      const task = {
        ...input,
        projectId: project,
        accountId: account,
        providerId: provider.id,
        username: c.account.username,
        home: c.account.homeRoot,
        root,
        versionRoot,
        snapshot,
        frontendPolicyVersion:2,
        frontendArtifacts: artifacts,
        limits: {
          memoryMb: 512,
          cpuPercent: 100,
          maxProcesses: 128,
          diskMb: c.account.diskQuotaMb,
          maxDatabases: c.account.maxDatabases,
        },
      };
      const manifest = path.join(root, "input.json");
      await c.executor.writeFile(manifest, JSON.stringify(task), {
        mode: 0o600,
      });
      const command = `nohup /usr/bin/sudo -n /usr/lib/luxipanel/deployment-helper ${quoteArg(manifest)} </dev/null >${quoteArg(path.join(root, "launch.log"))} 2>&1 &`;
      const result = await c.executor.exec(`sh -lc ${quoteArg(command)}`, {
        timeoutMs: 10000,
      });
      if (result.exitCode !== 0) {
        await c.executor.unlink(manifest).catch(() => {});
        throw new ConflictError("deployment_launch_failed");
      }
      return publicJob(state);
    });
  },
  async job(
    provider: HostingProvider,
    account: string,
    project: string,
    id: string,
  ) {
    uuid.parse(id);
    const c = await context(provider, account, project);
    const state = await optionalJson(
      c.executor,
      path.join(c.root, "jobs", id, "state.json"),
    );
    if (!state) throw new NotFoundError("Trabajo de despliegue");
    if (
      !["finished", "failed"].includes(state.status) &&
      Date.now() - Date.parse(state.createdAt) > 35 * 60_000
    )
      return publicJob({
        ...state,
        status: "failed",
        error: "deployment_job_timeout",
      });
    return publicJob(state);
  },
  async activate(
    provider: HostingProvider,
    account: string,
    project: string,
    id: string,
    operation: "activate" | "cleanup" = "activate",
  ) {
    uuid.parse(id);
    const c = await context(provider, account, project),
      root = path.join(c.root, "jobs", id),
      state = await readJson(c.executor, path.join(root, "state.json"));
    if (state.status !== "finished" || state.environment !== "production")
      throw new ConflictError("Publicación no preparada");
    const result = await c.executor.exec(
      `/usr/bin/sudo -n /usr/lib/luxipanel/deployment-helper ${quoteArg(path.join(root, "state.json"))} ${operation}`,
      { timeoutMs: 120000 },
    );
    if (result.exitCode !== 0)
      throw new ConflictError("deployment_activation_failed");
    return { active: true };
  },
  async replaceProductionRoutes(
    provider: HostingProvider,
    account: string,
    project: string,
    input: z.infer<typeof deploymentProductionRoutesSchema>,
  ) {
    const c = await context(provider, account, project);
    return locked(c.id, async () => {
      const jobRoot = path.join(c.root, "jobs", input.requestId),
        state = await readJson(c.executor, path.join(jobRoot, "state.json"));
      if (state.status !== "finished" || state.environment !== "production" ||
          state.versionId !== input.versionId || state.result?.versionId !== input.versionId)
        throw new ConflictError("Publicación no preparada");
      for (const host of input.hosts) {
        if (host.redirectTo && (!host.expiresAt || host.hostname === host.redirectTo || !input.hosts.some(target => target.hostname === host.redirectTo && !target.redirectTo)))
          throw new ConflictError("Destino de redirección inválido");
        if (host.expiresAt && !host.redirectTo) throw new ConflictError("Vencimiento sin redirección");
      }
      const redirects = Object.fromEntries(input.hosts.filter(host => host.redirectTo).map(host => [host.hostname,host.redirectTo!]));
      const relocated = await frontendPublicationService.get(provider, account, project);
      const migratedBackend = new Set<string>(relocated?.versionId === input.versionId ? (relocated.backendOnlyComponents ?? []) : []);
      if (relocated?.versionId === input.versionId && !relocated.apiRoutes?.length && !relocated.proxyHosts?.length) {
        await frontendPublicationService.reconfigure(provider, account, project, input.hosts.map(host => host.hostname), redirects);
        return { revision: relocated.sha256, versionId: input.versionId, hosts: input.hosts.length, targetId: relocated.targetId };
      }
      const snapshot = deploymentSnapshotSchema.parse(await readJson(
        c.executor,
        path.join(c.root, "versions", input.versionId, "manifest.json"),
      ));
      const resultByName = new Map((state.result?.components ?? []).map((part: any) => [part.name, part]));
      const components = [] as Array<Record<string, unknown>>;
      for (const manifest of snapshot.manifest.components) {
        const result = resultByName.get(manifest.name) as any;
        const surface = manifest.surface === "mobile" ? (manifest.role === "frontend" ? "static" : "http") : manifest.surface;
        if (!result || result.surface !== surface) throw new ConflictError("Componente publicado inválido");
        if (surface === "http") {
          if (!Number.isInteger(result.port) || result.port < 1024 || result.port > 65535)
            throw new ConflictError("Puerto publicado inválido");
          components.push({ name: manifest.name, surface, port: result.port, routePrefix: migratedBackend.has(manifest.name) ? relocated.apiRoutes[0] : manifest.routePrefix ?? null, ...(migratedBackend.has(manifest.name) ? {role:'backend'} : manifest.role ? {role:manifest.role} : {}) });
          continue;
        }
        if (surface !== "static") continue;
        const meta = result.staticArchive;
        if (result.port !== null || !/^[a-f0-9]{64}$/.test(meta?.sha256 ?? "") ||
            !Number.isSafeInteger(meta?.bytes) || meta.bytes < 1 || meta.bytes > 32 * 1024 * 1024)
          throw new ConflictError("Artefacto estático inválido");
        await frontendPublicationService.readArtifact(provider,account,project,input.versionId,manifest.name,meta);
        components.push({
          name: manifest.name,
          surface,
          port: null,
          routePrefix: manifest.routePrefix ?? null,
          staticArchive: { sha256: meta.sha256, bytes: meta.bytes, spa: ["vite", "expo"].includes(manifest.stack) },
        });
      }
      for (const host of input.hosts) {
        if (host.redirectTo && (!host.expiresAt || host.hostname === host.redirectTo || !input.hosts.some(target => target.hostname === host.redirectTo && !target.redirectTo)))
          throw new ConflictError("Destino de redirección inválido");
        if (host.expiresAt && !host.redirectTo) throw new ConflictError("Vencimiento sin redirección");
      }
      const publicNames = new Set(components.map((part) => String(part.name)));
      for (const host of input.hosts)
        if (!publicNames.has(host.defaultComponent)) throw new ConflictError("Componente principal inválido");
      const staticParts = components.filter(part => part.surface === "static");
      {
        for (const part of components) {
          // Legacy forms already have a separate API with an explicit prefix.
          // An unclassified HTTP app must be rebuilt before it can resume here.
          if (part.surface === 'http' && part.role !== 'backend' && !(staticParts.length === 1 && part.routePrefix))
            throw new ConflictError("Separa la interfaz del backend antes de reactivar esta versión");
        }
      }
      if (provider.frontendTargetId && migratedBackend.size && staticParts.length === 0)
        await frontendPublicationService.reconfigure(provider, account, project, input.hosts.map(host => host.hostname), redirects);
      if (staticParts.length === 1) {
        await frontendPublicationService.requireTarget(provider);
        const part = staticParts[0] as { name: string; staticArchive: { sha256: string; bytes:number } };
        const bytes = await frontendPublicationService.readArtifact(provider,account,project,input.versionId,part.name,part.staticArchive);
        if (!Buffer.isBuffer(bytes)) throw new ConflictError("Artefacto estático inválido");
        const backend = components.filter(part => part.surface === "http");
        await frontendPublicationService.publish(provider, account, project, {
          versionId: input.versionId, versionNumber: input.versionNumber,
          component: part.name, sha256: part.staticArchive.sha256, hosts: input.hosts.map(host => host.hostname),
          redirects,
          ...(backend.length ? { apiRoutes: backend.map(part => String(part.routePrefix)), proxyHosts: input.hosts.filter(host => host.defaultComponent !== part.name).map(host => host.hostname) } : {}),
          ...(input.hosts.find(host => !host.hostname.endsWith('.luxisoft.com') && !host.hostname.startsWith('www.')) ? {canonicalHost:input.hosts.find(host => !host.hostname.endsWith('.luxisoft.com') && !host.hostname.startsWith('www.'))!.hostname} : {}),
        }, bytes);
        const file = path.join(c.root, "routes.json");
        if (!backend.length) {
          if (await pathExists(c.executor, file)) await c.executor.unlink(file);
          return { revision: hash(bytes), versionId: input.versionId, hosts: input.hosts.length, targetId: provider.frontendTargetId };
        }
        components.splice(0, components.length, ...backend);
        for (const host of input.hosts) if (host.defaultComponent === part.name) host.defaultComponent = String(backend[0]!.name);
      }
      const record = {
        schemaVersion: 1,
        providerId: provider.id,
        accountId: account,
        projectId: project,
        requestId: input.requestId,
        versionId: input.versionId,
        versionNumber: input.versionNumber,
        updatedAt: new Date().toISOString(),
        hosts: input.hosts,
        components,
      };
      const file = path.join(c.root, "routes.json");
      await c.executor.writeFile(file + ".next", JSON.stringify(record), { mode: 0o600 });
      const moved = await c.executor.exec(`mv -f -- ${quoteArg(file + ".next")} ${quoteArg(file)}`, { timeoutMs: 5000 });
      if (moved.exitCode !== 0) throw new ConflictError("No se pudo activar la ruta publicada");
      return { revision: hash(canonicalJson(record)), versionId: input.versionId, hosts: input.hosts.length };
    });
  },
  async removeProductionRoutes(provider: HostingProvider, account: string, project: string) {
    await frontendPublicationService.withdraw(provider, account, project);
    const c = await context(provider, account, project);
    return locked(c.id, async () => {
      const file = path.join(c.root, "routes.json");
      if (await pathExists(c.executor, file)) await c.executor.unlink(file);
      return { removed: true };
    });
  },
  async retire(provider: HostingProvider, account: string, project: string) {
    await frontendPublicationService.remove(provider, account, project);
    const c = await context(provider, account, project),
      marker = path.join(c.root, "retire.json");
    const routes = path.join(c.root, "routes.json");
    if (await pathExists(c.executor, routes)) await c.executor.unlink(routes);
    await c.executor.writeFile(
      marker,
      JSON.stringify({
        projectId: project,
        username: c.account.username,
        home: c.account.homeRoot,
        root: c.root,
      }),
      { mode: 0o600 },
    );
    const result = await c.executor.exec(
      `/usr/bin/sudo -n /usr/lib/luxipanel/deployment-helper ${quoteArg(marker)} retire`,
      { timeoutMs: 130000 },
    );
    if (result.exitCode !== 0)
      throw new ConflictError("deployment_retirement_failed");
    // Account/project rows must remain until all owned legacy site bindings
    // have been removed, otherwise their nginx records become unreachable.
    for (const site of await providerRepository.listSitesForAccount(provider.id, account))
      if (site.externalSiteId.startsWith(`gh:${project}:`))
        await providerService.unbindSite(provider, account, site.externalSiteId);
    return { retired: true };
  },
};
