import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import test, { after, before } from "node:test";
import puppeteer from "puppeteer-core";
import {
  DEMO_AS_OF,
  DEMO_LABEL,
  demoEvidence,
  demoQuestions,
  demoViews,
} from "../lib/demo-data-repository.mjs";
const VIEWPORTS = [
  [320, 844],
  [390, 844],
  [768, 900],
  [1366, 768],
  [1440, 900],
];
let browser, child, origin, localPort;
export function browserCandidates(
  platform = process.platform,
  env = process.env,
) {
  if (env.BROWSER_EXECUTABLE_PATH) return [env.BROWSER_EXECUTABLE_PATH];
  if (platform === "win32")
    return [
      env.PROGRAMFILES &&
        join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      env.LOCALAPPDATA &&
        join(
          env.LOCALAPPDATA,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        ),
    ].filter(Boolean);
  return [
    ...(env.PATH || "")
      .split(delimiter)
      .flatMap((d) => ["google-chrome", "chromium"].map((n) => join(d, n))),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
}
async function randomPort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function newPage(w = 1366, h = 768) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h });
  return p;
}
function demoPayload() {
  return {
    demo: true,
    label: DEMO_LABEL,
    metadata: { migrationVersion: 1, seedVersion: 1, asOf: DEMO_AS_OF },
    headline: {
      questionId: demoQuestions[0].id,
      views: demoViews.map((view) => ({ ...view, demo: true })),
      evidence: demoEvidence.map((item) => ({ ...item, demo: true })),
      outcome: {
        state: "unresolved",
        demo: true,
        threshold: demoQuestions[0].threshold,
        deadline: demoQuestions[0].deadline,
      },
    },
    questions: demoQuestions.map((question) => ({ ...question, demo: true })),
    platforms: ["Spotify", "Apple Music", "YouTube"].map((name) => ({
      name,
      state: "pending",
      url: null,
    })),
  };
}
async function useDeterministicDemo(page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/demo-state") {
      request.respond({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify(demoPayload()),
      });
      return;
    }
    request.continue();
  });
}
before(async () => {
  localPort = await randomPort();
  const childEnv = { ...process.env, PORT: String(localPort), DEMO_MODE: "false" };
  delete childEnv.DATABASE_URL;
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server did not start")),
      5000,
    );
    child.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (c) => reject(new Error(`Server exited ${c}`)));
  });
  origin = `http://127.0.0.1:${localPort}`;
  const executablePath = browserCandidates().find(existsSync);
  if (!executablePath) throw new Error("No Chromium");
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", `--explicitly-allowed-ports=${localPort}`],
  });
});
after(async () => {
  await browser?.close();
  if (child?.exitCode === null) {
    const done = new Promise((r) => child.once("exit", r));
    child.kill();
    await done;
  }
});
test("browser discovery and randomized port are portable", () => {
  const linuxCandidates = browserCandidates("linux", { PATH: "/usr/bin" });
  assert.deepEqual(linuxCandidates.slice(0, 2), [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ]);
  assert.ok(linuxCandidates.some((x) => x.endsWith("/chromium")));
  assert.ok(localPort > 0);
});
test("episode cut tabs are keyboard logical and never autoplay", async () => {
  const p = await newPage();
  await p.goto(origin);
  const panelNames = await p.evaluate(() => [...document.querySelectorAll('[role="tabpanel"]')].map((panel) => ({
    id: panel.id,
    labelledBy: panel.getAttribute("aria-labelledby"),
  })));
  assert.deepEqual(panelNames, [
    { id: "act-past", labelledBy: "tab-past" },
    { id: "act-present", labelledBy: "tab-present" },
    { id: "act-forecast", labelledBy: "tab-forecast" },
  ]);
  await p.focus("#tab-past");
  await p.keyboard.press("ArrowRight");
  assert.equal(
    await p.evaluate(() => document.activeElement.id),
    "tab-present",
  );
  assert.equal(
    await p.$eval("#tab-present", (n) => n.getAttribute("aria-selected")),
    "true",
  );
  assert.equal(await p.$eval("[data-act-readout]", (n) => n.textContent), "02 / NOW");
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(
    await p.$eval("#tab-present", (n) => n.getAttribute("aria-selected")),
    "true",
  );
  await p.close();
});
test("semantic tabs are the only asymmetric three-act stage", async () => {
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const p = await newPage(width, height);
    await p.goto(origin);
    const initial = await p.evaluate(() => ({
      duplicate: document.querySelectorAll(".act-stage").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tabs: [...document.querySelectorAll('.act-tabs [role="tab"]')].map((tab) => ({
        text: tab.innerText.replace(/\s+/g, " ").trim(),
        width: tab.getBoundingClientRect().width,
        height: tab.getBoundingClientRect().height,
        selected: tab.getAttribute("aria-selected"),
      })),
    }));
    assert.equal(initial.duplicate, 0);
    assert.deepEqual(initial.tabs.map(({ text }) => text.toLowerCase()), [
      "01 past constraint",
      "02 present signal",
      "03 forecast call",
    ]);
    assert.ok(initial.tabs.every(({ height }) => height >= 44));
    assert.ok(initial.tabs.every(({ width }) => width >= 44));
    assert.ok(initial.overflow <= 1, JSON.stringify(initial));
    if (width === 1366) {
      assert.ok(initial.tabs[0].width > initial.tabs[1].width * 1.5, JSON.stringify(initial));
      assert.ok(initial.tabs[0].width > initial.tabs[2].width * 1.5, JSON.stringify(initial));
      await p.click("#tab-forecast");
      const forecast = await p.evaluate(() => ({
        widths: [...document.querySelectorAll('.act-tabs [role="tab"]')].map((tab) => tab.getBoundingClientRect().width),
        selected: [...document.querySelectorAll('.act-tabs [role="tab"]')].map((tab) => tab.getAttribute("aria-selected")),
        readout: document.querySelector("[data-act-readout]").textContent,
        visiblePanels: [...document.querySelectorAll(".act-explanation")].filter((panel) => !panel.hidden).map((panel) => panel.id),
      }));
      assert.ok(forecast.widths[2] > forecast.widths[0] * 1.5, JSON.stringify(forecast));
      assert.ok(forecast.widths[2] > forecast.widths[1] * 1.5, JSON.stringify(forecast));
      assert.deepEqual(forecast.selected, ["false", "false", "true"]);
      assert.equal(forecast.readout, "03 / DECISION");
      assert.deepEqual(forecast.visiblePanels, ["act-forecast"]);
    }
    await p.close();
  }
});
test("hydrated release viewport geometry, content, target, portrait, type, and budget gates pass", async () => {
  const records = [];
  for (const [w, h] of VIEWPORTS) {
    const p = await newPage(w, h);
    await useDeterministicDemo(p);
    await p.goto(origin, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () => document.documentElement.dataset.demoState === "ready",
    );
    const m = await p.evaluate(() => {
      const visible = (n) => {
        const r = n.getBoundingClientRect(),
          s = getComputedStyle(n);
        return (
          s.display !== "none" &&
          s.visibility !== "hidden" &&
          r.width > 0 &&
          r.height > 0
        );
      };
      const small = [...document.querySelectorAll("a:not(.skip),button,summary,label")]
        .filter(visible)
        .map((n) => ({
          t: n.textContent.trim(),
          r: n.getBoundingClientRect().toJSON(),
        }))
        .filter((x) => x.r.width < 43.5 || x.r.height < 43.5);
      const hero = document.querySelector(".hero").getBoundingClientRect();
      const required = [
        ".hero h1",
        ".episode-instrument",
        ".primary-action",
        ".platform-dock",
      ].map((s) => ({
        s,
        r: document.querySelector(s).getBoundingClientRect().toJSON(),
      }));
      return {
        width: innerWidth,
        height: document.documentElement.scrollHeight,
        words: document
          .querySelector("main")
          .innerText.split(/\s+/)
          .filter(Boolean).length,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        portrait: document.querySelectorAll('img[src*="ian-mcpherson"]').length,
        operating: document.querySelector(".operating-system").getClientRects()
          .length,
        small,
        heroBottom: hero.bottom,
        required,
        demoViews: document.querySelectorAll("#demo-views .demo-view").length,
        atlasValues: [...document.querySelectorAll(".atlas-state")].filter(
          (node) => /YES \d+% \/ NO \d+%/.test(node.textContent),
        ).length,
      };
    });
    records.push(m);
    assert.ok(m.overflow <= 1, JSON.stringify(m));
    assert.equal(m.portrait, 1);
    assert.equal(m.operating, 1);
    assert.equal(m.demoViews, 3);
    assert.equal(m.atlasValues, 8);
    assert.deepEqual(m.small, []);
    if (w >= 1366)
      for (const x of m.required)
        assert.ok(
          x.r.top >= 0 && x.r.bottom <= h,
          `${w} ${x.s} ${JSON.stringify(x.r)}`,
        );
    await p.close();
  }
  const mobile = records.find((x) => x.width === 390);
  assert.ok(mobile.height < 5000, JSON.stringify(mobile));
  assert.ok(mobile.words <= 450, JSON.stringify(mobile));
  console.log(`REBUILD_GEOMETRY ${JSON.stringify(records)}`);
});
test("mobile platform dock is a compact three-column pending strip", async () => {
  const p = await newPage(390, 844);
  await p.goto(origin);
  const dock = await p.$eval(".platform-dock", (node) => ({
    height: node.getBoundingClientRect().height,
    columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
    names: [...node.querySelectorAll(".platform-item")].map(
      (item) => `${item.querySelector("strong").textContent} ${item.querySelector("small").textContent}`,
    ),
  }));
  assert.ok(dock.height <= 80, JSON.stringify(dock));
  assert.equal(dock.columns, 3, JSON.stringify(dock));
  assert.deepEqual(dock.names, [
    "Spotify Link pending",
    "Apple Music Link pending",
    "YouTube Link pending",
  ]);
  await p.close();
});
test("Episode 01 destinations are truthful and visible on the landing viewport", async () => {
  for (const [width, height] of [[1366, 768], [1440, 900], [390, 844]]) {
    const p = await newPage(width, height);
    await p.goto(origin);
    const dock = await p.$eval(".platform-dock", (node) => ({
      heading: node.querySelector("p").textContent.trim(),
      rect: node.getBoundingClientRect().toJSON(),
      items: [...node.querySelectorAll(".platform-item")].map((item) => ({
        name: item.querySelector("strong").textContent.trim(),
        stateText: item.querySelector("small").textContent.trim(),
        platform: item.dataset.platform,
        state: item.dataset.state,
        url: item.dataset.url,
        isLink: item.matches("a") || Boolean(item.querySelector("a")),
      })),
    }));
    assert.equal(dock.heading, "Episode 01 destinations · no episode published");
    assert.deepEqual(dock.items.map(({ name }) => name), ["Spotify", "Apple Music", "YouTube"]);
    assert.ok(dock.items.every(({ stateText, state, url, isLink, platform }) =>
      stateText === "Link pending" && state === "pending" && url === "" && !isLink && platform
    ), JSON.stringify(dock));
    assert.ok(dock.rect.top >= 0 && dock.rect.bottom <= height, `${width} ${JSON.stringify(dock.rect)}`);
    await p.close();
  }
});
test("mobile atlas is one horizontal scroll-snap browse rail", async () => {
  const p = await newPage(390, 844);
  await useDeterministicDemo(p);
  await p.goto(origin);
  await p.waitForFunction(
    () => document.documentElement.dataset.demoState === "ready",
  );
  const atlas = await p.$eval(".atlas", (node) => ({
    overflowX: getComputedStyle(node).overflowX,
    snapType: getComputedStyle(node).scrollSnapType,
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    cards: [...node.children].map((card) => ({
      snapAlign: getComputedStyle(card).scrollSnapAlign,
      text: card.textContent.replace(/\s+/g, " ").trim(),
    })),
  }));
  assert.equal(atlas.cards.length, 8);
  assert.ok(atlas.scrollWidth > atlas.clientWidth, JSON.stringify(atlas));
  assert.match(atlas.overflowX, /auto|scroll/);
  assert.match(atlas.snapType, /x/);
  assert.ok(atlas.cards.every(({ snapAlign }) => snapAlign !== "none"));
  assert.ok(
    atlas.cards.every(({ text }) =>
      /Q\d[\s\S]*DEMO[\s\S]*YES \d+% \/ NO \d+%/.test(text),
    ),
  );
  await p.close();
});
test("hydrated atlas is a four-column editorial mosaic with a mobile browse cue", async () => {
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const p = await newPage(width, height);
    await useDeterministicDemo(p);
    await p.goto(origin);
    await p.waitForFunction(() => document.documentElement.dataset.demoState === "ready");
    const result = await p.evaluate(() => {
      const atlas = document.querySelector(".atlas");
      const cue = document.querySelector(".atlas-cue");
      const cards = [...atlas.children].map((card) => {
        const rect = card.getBoundingClientRect();
        const affordance = card.querySelector(".contract-affordance");
        return {
          rect: rect.toJSON(),
          text: card.textContent.replace(/\s+/g, " ").trim(),
          internalOverflow: card.scrollWidth - card.clientWidth,
          affordance: affordance?.textContent.trim(),
          affordanceVisible: affordance ? affordance.getClientRects().length > 0 : false,
        };
      });
      return {
        columns: getComputedStyle(atlas).gridTemplateColumns.split(" ").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cue: cue?.textContent.trim(),
        cueVisible: cue ? cue.getClientRects().length > 0 : false,
        cards,
      };
    });
    assert.equal(result.cards.length, 8);
    assert.ok(result.cards.every(({ text }) => /YES \d+% \/ NO \d+%/.test(text)), JSON.stringify(result));
    assert.ok(result.cards.every(({ affordance, affordanceVisible }) => affordance === "Contract +" && affordanceVisible), JSON.stringify(result));
    assert.ok(result.overflow <= 1, JSON.stringify(result));
    if (width === 1366) {
      assert.equal(result.columns, 4, JSON.stringify(result));
      const [q1, q2, , , , , , q8] = result.cards;
      assert.ok(q1.rect.width > q2.rect.width * 1.8 && q1.rect.height > q2.rect.height * 1.8, JSON.stringify(result));
      assert.ok(q8.rect.width > q2.rect.width * 1.8 && q8.rect.height < q1.rect.height * .75, JSON.stringify(result));
      assert.equal(result.cueVisible, false);
    } else {
      assert.equal(result.cue, "Browse all 8 questions →");
      assert.equal(result.cueVisible, true);
      assert.ok(result.cards.every(({ internalOverflow }) => internalOverflow <= 1), JSON.stringify(result));
    }
    await p.close();
  }
});
test("mobile portrait uses an explicit face-safe crop position", async () => {
  const p = await newPage(390, 844);
  await p.goto(origin);
  const portrait = await p.$eval('.host img[src*="ian-mcpherson"]', (img) => ({
    position: getComputedStyle(img).objectPosition,
    height: img.getBoundingClientRect().height,
  }));
  assert.equal(portrait.position, "50% 34%");
  assert.equal(portrait.height, 210);
  await p.close();
});
test("mobile menu, skip, local call, fragment, storage denial, and failure state work", async () => {
  const p = await newPage(390, 844);
  await p.evaluateOnNewDocument(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("denied");
      },
    }),
  );
  await p.goto(origin);
  await p.keyboard.press("Tab");
  assert.equal(
    await p.evaluate(() => document.activeElement.className),
    "skip",
  );
  await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => document.activeElement.id), "main");
  await p.click(".menu-button");
  await p.keyboard.press("Escape");
  assert.equal(
    await p.$eval(".menu-button", (n) => n.getAttribute("aria-expanded")),
    "false",
  );
  await p.click("label:has(#forecast-yes)");
  assert.equal(await p.$eval("#forecast-yes", (n) => n.checked), true);
  await p.goto(`${origin}/#question-04`);
  assert.equal(await p.$eval("#question-04 details", (n) => n.open), true);
  assert.match(
    await p.$eval("#demo-views", (n) => n.textContent),
    /Demo data unavailable/,
  );
  await p.close();
});
test("malformed successful demo payload fails closed before any aggregate hydration", async () => {
  const p = await newPage(390, 844);
  const malformed = demoPayload();
  malformed.questions[0] = { ...malformed.questions[0], yes: 101, no: -1 };
  await p.setRequestInterception(true);
  p.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/demo-state") {
      request.respond({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify(malformed),
      });
      return;
    }
    request.continue();
  });
  await p.goto(origin, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.documentElement.dataset.demoState !== "loading");
  const state = await p.evaluate(() => ({
    demoState: document.documentElement.dataset.demoState,
    views: document.querySelector("#demo-views").textContent,
    evidence: document.querySelector("#demo-evidence").textContent,
    atlas: [...document.querySelectorAll(".atlas-state")].map((node) => node.textContent.trim()),
  }));
  assert.equal(state.demoState, "unavailable");
  assert.match(state.views, /Demo data unavailable/);
  assert.match(state.evidence, /Demo data unavailable/);
  assert.ok(state.atlas.every((text) => text === "DEMO Demo data unavailable"));
  await p.close();
});

test("no-JS keeps disclosure, acts, and contracts in document order", async () => {
  const p = await newPage(320, 844);
  await p.setJavaScriptEnabled(false);
  await p.goto(origin);
  const s = await p.evaluate(() => ({
    acts: document.querySelectorAll(".act-explanation").length,
    atlasDetails: document.querySelectorAll(".atlas details").length,
    supportingDetails: document.querySelectorAll(".contract, .evidence-details").length,
    notice: document.querySelector("noscript").textContent,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  assert.deepEqual(
    { ...s, notice: /Illustrative/.test(s.notice) },
    { acts: 3, atlasDetails: 8, supportingDetails: 2, notice: true, overflow: 0 },
  );
  await p.close();
});
test("reduced motion and forced colors retain static focus/selection", async () => {
  const p = await newPage(390, 844);
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await p.goto(origin);
  assert.equal(
    await p.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
    "auto",
  );
  await p.focus("#forecast-yes");
  const normalFocus = await p.$eval("#forecast-yes", (input) => {
    const visibleControl = input.nextElementSibling;
    const style = getComputedStyle(visibleControl);
    return {
      inputFocusVisible: input.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
    };
  });
  assert.equal(normalFocus.inputFocusVisible, true, JSON.stringify(normalFocus));
  assert.notEqual(normalFocus.outlineStyle, "none", JSON.stringify(normalFocus));
  assert.ok(normalFocus.outlineWidth >= 2, JSON.stringify(normalFocus));
  await p
    ._client()
    .send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "forced-colors", value: "active" }],
    });
  await p.focus("#forecast-no");
  const forcedFocus = await p.$eval("#forecast-no", (input) => {
    const visibleControl = input.nextElementSibling;
    const style = getComputedStyle(visibleControl);
    return {
      inputFocusVisible: input.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
    };
  });
  assert.equal(forcedFocus.inputFocusVisible, true, JSON.stringify(forcedFocus));
  assert.notEqual(forcedFocus.outlineStyle, "none", JSON.stringify(forcedFocus));
  assert.ok(forcedFocus.outlineWidth >= 2, JSON.stringify(forcedFocus));
  await p.keyboard.press("Space");
  assert.equal(await p.$eval("#forecast-no", (n) => n.checked), true);
  await p.close();
});
test("homepage passes axe A/AA at release viewports", async () => {
  const axe = await readFile(
    new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
    "utf8",
  );
  for (const [w, h] of VIEWPORTS) {
    const p = await newPage(w, h);
    await p.goto(origin);
    await p.evaluate(axe);
    const violations = await p.evaluate(() =>
      axe
        .run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag22a", "wcag22aa"],
          },
        })
        .then((r) => r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))),
    );
    assert.deepEqual(violations, [], `${w}x${h}`);
    await p.close();
  }
});
