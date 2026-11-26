import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";

const ensureAccount = vi.hoisted(() => vi.fn(async () => ({ id: "guest" })));
vi.mock("../services/provider.service.js", () => ({
  providerService: { authenticate: async () => ({id:"test"}), assertOperation: vi.fn(), ensureAccount },
}));
import { providerRouter } from "./provider.routes.js";
const app = express();
app.use(express.json());
app.use(providerRouter);
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).end();
});
it.each([{}, {email:""}, {email:"   "}])("accepts an account without a contact email", async body => {
  const response = await request(app).put("/api/hosting/v1/accounts/guest").set("Authorization","Bearer lhp_test").send(body);
  expect(response.status).toBe(200);
  expect(ensureAccount).toHaveBeenLastCalledWith({id:"test"}, "guest", expect.not.objectContaining({email:expect.any(String)}));
});
it("rejects a malformed nonempty email", async () => {
  const response = await request(app).put("/api/hosting/v1/accounts/guest").set("Authorization","Bearer lhp_test").send({email:"invalid"});
  expect(response.status).toBe(400);
});
