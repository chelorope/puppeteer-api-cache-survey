import puppeteer from "puppeteer";
import fs from "fs";
import nodePath from "path";
import PATHS from "./paths.js";

const USER_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiOTlmNTQ3ZGMtZmUwYS00ZGEyLWI3ZTQtZTgzZmUzZjA0OWRkIiwiYWNjZXNzTGV2ZWwiOiJtYXJrZXRwbGFjZSIsImxvZ2luVHlwZSI6ImJ1aWx0aW4iLCJ3YWxsZXRBZGRyZXNzIjoiMHg5ZjlmNTI0NWM4ZmNlY2QwNDdkNWJhMzE0YjJjZmY1MmIzMmY4NWI1In0sImlhdCI6MTY3ODgyNTIxOCwiZXhwIjoxNjgxNDE3MjE4fQ.b01Cx4kVcUt9naKMEbsj5JioM_U6INFf9G1rSgeBJ58";
const SANDBOX_API_HOST = "api.sandbox.game";
const SANDBOX_FE_HOST = "www.sandbox.game";

const browser = await puppeteer.launch({
  headless: false,
});

async function StartScraping(path) {
  const responses = {};
  let requestResolved = false;
  let requestCount = 0;
  const page = await browser.newPage();
  await page.setCookie({
    name: "www_tsb_token",
    value: USER_TOKEN,
    domain: SANDBOX_API_HOST,
  });

  await page.setViewport({
    width: 1366,
    height: 768,
  });
  page.on("request", async (request) => {
    if (
      request.url().includes(SANDBOX_API_HOST) &&
      !request.url().includes("cdn-cgi")
    ) {
      requestCount++;
    }
  });
  page.on("response", async (response) => {
    if (
      response.url().includes(SANDBOX_API_HOST) &&
      !response.url().includes("cdn-cgi")
    ) {
      requestCount--;

      requestCount < 0 && console.log("REQUEST", requestCount, path);
      if (response.status() == 200) {
        requestResolved = true;
        const headers = response.headers();
        const responseURL = response
          .url()
          .replace(`https://${SANDBOX_API_HOST}`, "");
        responses[responseURL] = {
          ...(headers["cache-control"]
            ? { browserCache: headers["cache-control"] }
            : {}),
          cloudflareCache: headers["cf-cache-status"],
        };
      }
    }
  });

  await page.goto(`https://${SANDBOX_FE_HOST}${path}`, {
    waitUntil: "load",
    timeout: 0,
  });
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (requestResolved && requestCount === 0) {
        clearInterval(interval);
        page.close();
        resolve();
      }
    }, 10000);
  });
  await fs.promises.writeFile(
    `./Results/Page_${path === "/" ? "_Home" : path.replace(/\//g, "_")}.json`,
    JSON.stringify(responses, null, 2)
  );
}
Promise.all(PATHS.map((path) => StartScraping(path))).then(async () => {
  browser.close();
});
