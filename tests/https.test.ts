import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("public HTTP redirects to HTTPS while HTTPS and local health checks remain reachable", () => {
  const saved = process.env.APP_URL;
  process.env.APP_URL = "https://calendar.dbautoaudit.stream";
  try {
    const request = (host: string, protocol: string, pathname = "/") => new NextRequest(`http://${host}${pathname}`, { headers: { host, "x-forwarded-proto": protocol } });
    const redirect = proxy(request("calendar.dbautoaudit.stream", "http", "/b/company/campaign?x=1"));
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), "https://calendar.dbautoaudit.stream/b/company/campaign?x=1");
    assert.equal(proxy(request("calendar.dbautoaudit.stream", "https")).status, 200);
    assert.equal(proxy(request("127.0.0.1:3210", "http", "/api/health/ready")).status, 200);
  } finally { process.env.APP_URL = saved; }
});
