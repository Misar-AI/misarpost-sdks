// k6 load profile for the MisarPost public API's read path.
//   k6 run -e MISARPOST_API_KEY=mpk_… sdks/tests/load/misarpost.k6.js
// Read-only on purpose: a load test must never schedule real posts.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    read_api: {
      executor: "constant-vus",
      vus: 50,
      duration: "60s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.MISARPOST_BASE_URL || "https://api.misar.io/post";
const API_KEY = __ENV.MISARPOST_API_KEY || "mpk_test";
const HEADERS = { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" };

export default function () {
  const endpoints = ["/posts?page=1", "/stats", "/connections", "/drafts"];
  for (const path of endpoints) {
    const res = http.get(`${BASE}${path}`, { headers: HEADERS, tags: { endpoint: path.split("?")[0] } });
    check(res, {
      "status is 200": (r) => r.status === 200,
      "not a plan refusal": (r) => !String(r.body).includes("plan_limit_exceeded"),
    });
  }
  sleep(1);
}
