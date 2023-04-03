import puppeteer from "puppeteer";
import fs from "fs";
import nodePath from "path";
import { fileURLToPath } from "url";
import PATHS from "./paths.js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

dotenv.config();
const ENVIRONMENTS = {
  local: {
    apiHost: "localhost:8081",
    feHost: "localhost:8080",
    protocol: "http",
  },
  dev2: {
    apiHost: "api-dev2.sandbox.game",
    feHost: "dev2.sandbox.game",
    protocol: "https",
  },
  develop: {
    apiHost: "api-develop.sandbox.game",
    feHost: "develop.sandbox.game",
    protocol: "https",
  },
  demo: {
    apiHost: "api-demo.sandbox.game",
    feHost: "demo.sandbox.game",
    protocol: "https",
  },
  staging: {
    apiHost: "api-staging.sandbox.game",
    feHost: "staging.sandbox.game",
    protocol: "https",
  },
  production: {
    apiHost: "api.sandbox.game",
    feHost: "www.sandbox.game",
    protocol: "https",
  },
};

const CURRENT_ENVIRONMENT = "demo";

const {
  apiHost: API_HOST,
  feHost: FE_HOST,
  protocol: PROTOCOL,
} = ENVIRONMENTS[CURRENT_ENVIRONMENT];

const browser = await puppeteer.launch({
  headless: false,
});

async function goToPageAndWaitForRequests(
  { pageURL, page, navigate = false },
  onResponse = () => {}
) {
  console.log("GOING TO", pageURL);
  let requestResolved = false;
  let requestCount = 0;
  page.on("request", async (request) => {
    if (
      request.url().includes(API_HOST) &&
      !request.url().includes("cdn-cgi")
    ) {
      requestCount++;
    }
  });
  page.on("response", async (response) => {
    if (
      response.url().includes(API_HOST) &&
      !response.url().includes("cdn-cgi")
    ) {
      requestCount--;

      requestCount < 0 && console.log("REQUEST", requestCount, path);
      requestResolved = true;
      onResponse(response);
    }
  });
  if (navigate) {
    await page.evaluate((pageURL) => {
      window.$nuxt.$router.push(pageURL);
    }, pageURL);
    await page.waitForNavigation();
  } else {
    await page.goto(pageURL, {
      waitUntil: "load",
      timeout: 0,
    });
  }
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (requestResolved && requestCount === 0) {
        clearInterval(interval);
        resolve();
      }
    }, 10000);
  });
}

async function StartScraping(path, section) {
  const results = {};
  const page = await browser.newPage();
  await page.setCookie({
    name: "www_tsb_token",
    value: process.env.USER_TOKEN,
    domain: API_HOST,
  });
  await page.setViewport({
    width: 1366,
    height: 768,
  });

  await goToPageAndWaitForRequests({ pageURL: `https://${FE_HOST}`, page });
  await goToPageAndWaitForRequests(
    {
      pageURL: path,
      page,
      navigate: true,
    },
    (response) => {
      if (response.status() == 200) {
        const headers = response.headers();
        const responseURL = response
          .url()
          .replace(`${PROTOCOL}://${API_HOST}`, "");
        results[responseURL] = {
          ...(headers["cache-control"]
            ? { browserCache: headers["cache-control"] }
            : {}),
          ...(headers["cdn-cache-control"]
            ? { cloudflareCache: headers["cdn-cache-control"] }
            : {}),
          // cloudflareCacheStatus: headers["cf-cache-status"],
        };
      }
    }
  );
  await page.close();
  return results;
}

async function saveResults(results, path, section) {
  // Save Files
  const dir = nodePath.join(__dirname, "Results", CURRENT_ENVIRONMENT, section);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await fs.promises.writeFile(
    nodePath.join(
      dir,
      `Page_${path === "/" ? "_Home" : path.replace(/\//g, "_")}.json`
    ),
    JSON.stringify(results, null, 2)
  );
}

Promise.all(
  Object.keys(PATHS).map((section) =>
    Promise.all(
      PATHS[section].map(async (path) => {
        const results = await StartScraping(path, section);
        await saveResults(results, path, section);
      })
    )
  )
).then(async () => {
  browser.close();
});
