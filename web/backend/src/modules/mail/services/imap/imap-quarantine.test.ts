import { describe, it, expect, vi } from "vitest";
import { normalizeQuarantineStep } from "./imap-quarantine.js";
import { folderTreeProtected, isProtectedFolder } from "../mail-folder-policy.js";
function mailbox(initial: Record<string, number[]>, move = true) {
  const data = new Map(Object.entries(initial));
  let selected = "";
  const client: any = {
    capabilities: new Set(move ? ["MOVE"] : []),
    list: vi.fn(async () =>
      [...data.keys()].map((path) => ({ path, name: path.split("/").pop(), delimiter: "/" })),
    ),
    mailboxCreate: vi.fn(async (path: string) => {
      data.set(path, []);
    }),
    mailboxRename: vi.fn(async (from: string, to: string) => {
      for (const [path, rows] of [...data])
        if (path === from || path.startsWith(from + "/")) {
          data.set(to + path.slice(from.length), rows);
          data.delete(path);
        }
    }),
    getMailboxLock: vi.fn(async (path: string) => {
      selected = path;
      return { release() {} };
    }),
    search: vi.fn(async () => [...(data.get(selected) || [])]),
    messageMove: vi.fn(async (uids: number[], dest: string) => {
      data.set(dest, [...(data.get(dest) || []), ...uids]);
      data.set(
        selected,
        (data.get(selected) || []).filter((uid) => !uids.includes(uid)),
      );
      return { destination: dest };
    }),
    mailboxDelete: vi.fn(async (path: string) => {
      if (data.get(path)?.length) throw Error("nonempty");
      data.delete(path);
    }),
  };
  return { client, data };
}
describe("protected mailbox folders", () => {
  it.each(["Cuarentena", "quarantine", "REVISAR-IA", "Junk", "spam", "INBOX", "Sent", "Trash"])(
    "%s cannot be changed",
    (name) => expect(isProtectedFolder({ path: name, name })).toBe(true),
  );
  it("protects special-use folders and parents, but permits ordinary child folders", () => {
    expect(isProtectedFolder({ path: "Filtered", name: "Filtered", specialUse: "\\Junk" })).toBe(true);
    const parent = { path: "Personal", name: "Personal", delimiter: "/" };
    expect(folderTreeProtected(parent, [parent, { path: "Personal/Junk", name: "Junk" }])).toBe(true);
    expect(isProtectedFolder({ path: "Junk/Receipts", name: "Receipts" })).toBe(false);
  });
});
describe("quarantine normalization", () => {
  it("renames the legacy tree without changing messages", async () => {
    const { client, data } = mailbox({ "Revisar-IA": [1, 2], "Revisar-IA/Child": [3] });
    await normalizeQuarantineStep(client);
    expect(data.get("Cuarentena")).toEqual([1, 2]);
    expect(data.get("Cuarentena/Child")).toEqual([3]);
    expect(client.messageMove).not.toHaveBeenCalled();
  });
  it("merges all legacy folders in bounded steps, preserves Junk and is idempotent", async () => {
    const { client, data } = mailbox({
      Cuarentena: [99],
      "Revisar-IA": Array.from({ length: 601 }, (_, i) => i + 1),
      Quarantine: [700],
      "Quarantine/Child": [800],
      Junk: [900],
    });
    for (let i = 0; i < 20; i++) {
      if ((await normalizeQuarantineStep(client)).complete) break;
    }
    expect(data.get("Cuarentena")).toHaveLength(603);
    expect(data.get("Cuarentena/Child")).toEqual([800]);
    expect(data.get("Junk")).toEqual([900]);
    expect(data.has("Revisar-IA")).toBe(false);
    expect((await normalizeQuarantineStep(client)).complete).toBe(true);
    expect(data.get("Cuarentena")).toHaveLength(603);
  });
  it("leaves messages untouched when native MOVE is unavailable", async () => {
    const { client, data } = mailbox({ Cuarentena: [], "Revisar-IA": [1] }, false);
    await expect(normalizeQuarantineStep(client)).rejects.toMatchObject({ statusCode: 409 });
    expect(data.get("Revisar-IA")).toEqual([1]);
    expect(client.mailboxDelete).not.toHaveBeenCalled();
  });
  it("never deletes after an unconfirmed movement or lost lease", async () => {
    const { client, data } = mailbox({ Cuarentena: [], "Revisar-IA": [1] });
    client.messageMove.mockResolvedValue(false);
    await expect(normalizeQuarantineStep(client)).rejects.toThrow();
    expect(data.get("Revisar-IA")).toEqual([1]);
    expect(client.mailboxDelete).not.toHaveBeenCalled();
    await expect(
      normalizeQuarantineStep(client, () => {
        throw Error("lease lost");
      }),
    ).rejects.toThrow("lease lost");
  });
});
