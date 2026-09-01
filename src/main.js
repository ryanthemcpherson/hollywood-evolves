document.documentElement.classList.add("enhanced");
document.documentElement.dataset.demoState = "loading";

const actTabs = [...document.querySelectorAll('[role="tab"][data-act]')];
const actPanels = [...document.querySelectorAll(".act-explanation")];
function selectAct(tab, focus = false) {
  actTabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document
      .getElementById(item.getAttribute("aria-controls"))
      ?.toggleAttribute("hidden", !selected);
  });
  const readout = document.querySelector("[data-act-readout]");
  const index = actTabs.indexOf(tab);
  if (readout)
    readout.textContent = `${String(index + 1).padStart(2, "0")} / ${["ORIGIN", "NOW", "DECISION"][index]}`;
  if (focus) tab.focus();
}
actTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectAct(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? actTabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + actTabs.length) %
            actTabs.length;
    selectAct(actTabs[target], true);
  });
});
if (actTabs[0]) selectAct(actTabs[0]);

const menuButton = document.querySelector(".menu-button");
const menu = document.querySelector("#menu");

function setMenu(open, returnFocus = false) {
  menuButton?.setAttribute("aria-expanded", String(open));
  menu?.classList.toggle("open", open);
  document.body.classList.toggle("menu-open", open);
  if (!open && returnFocus) menuButton?.focus();
}

menuButton?.addEventListener("click", () =>
  setMenu(menuButton.getAttribute("aria-expanded") !== "true"),
);
menu?.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  setMenu(false);
  const target = document.querySelector(event.target.closest("a").hash);
  if (target)
    requestAnimationFrame(() => {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
});
document.addEventListener("pointerdown", (event) => {
  if (
    menuButton?.getAttribute("aria-expanded") === "true" &&
    !event.target.closest("nav")
  )
    setMenu(false, true);
});

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* The local control still works. */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* No dependent state. */
    }
  },
};

const forecastChoices = [
  ...document.querySelectorAll('input[name="private-forecast"]'),
];
const storedForecast = storage.get("he-private-forecast");
if (storedForecast === "yes" || storedForecast === "no") {
  forecastChoices.find(({ value }) => value === storedForecast).checked = true;
} else if (storedForecast !== null) storage.remove("he-private-forecast");
forecastChoices.forEach((choice) =>
  choice.addEventListener("change", () =>
    storage.set("he-private-forecast", choice.value),
  ),
);
document.querySelector("#reset-forecast")?.addEventListener("click", () => {
  forecastChoices.forEach((choice) => {
    choice.checked = false;
  });
  storage.remove("he-private-forecast");
  forecastChoices[0]?.focus();
});

const disclosures = [...document.querySelectorAll(".atlas details")];
disclosures.forEach((details) => {
  const affordance = details.querySelector(".contract-affordance");
  const updateAffordance = () => {
    if (affordance) affordance.textContent = details.open ? "Contract −" : "Contract +";
  };
  details.addEventListener("toggle", updateAffordance);
  updateAffordance();
});
function fragmentElement() {
  if (!location.hash.startsWith("#") || location.hash.length === 1) return null;
  try {
    const id = decodeURIComponent(location.hash.slice(1));
    return id ? document.getElementById(id) : null;
  } catch {
    return null;
  }
}
function openFragment() {
  const item = fragmentElement();
  const disclosure = item?.matches(".atlas > li[id]")
    ? item.querySelector("details")
    : null;
  if (disclosure) disclosure.open = true;
}
disclosures.forEach((details) => {
  const item = details.closest("li[id]");
  details.querySelector("summary")?.addEventListener("click", () => {
    if (item && location.hash !== `#${item.id}`)
      history.replaceState(history.state, "", `#${item.id}`);
  });
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    disclosures.forEach((other) => {
      if (other !== details) other.open = false;
    });
    document
      .querySelector("#share-forecast")
      ?.setAttribute("data-share-url", canonicalShareUrl());
  });
});
window.addEventListener("hashchange", openFragment);
openFragment();

document.addEventListener("keydown", (event) => {
  if (event.key === 'Escape') {
    if (menuButton?.getAttribute("aria-expanded") === "true") {
      setMenu(false, true);
      return;
    }
    const focusedDisclosure = document.activeElement?.closest?.("details");
    const opened = focusedDisclosure?.open
      ? focusedDisclosure
      : disclosures.findLast(({ open }) => open);
    if (opened) {
      opened.open = false;
      opened.querySelector("summary")?.focus();
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${location.search}`,
      );
    }
  }
});

const shareButton = document.querySelector("#share-forecast");
const shareStatus = document.querySelector("#share-status");
const shareFallback = document.querySelector("#share-fallback");
const shareUrl = document.querySelector("#share-url");
function canonicalShareUrl() {
  try {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const url = new URL(canonical || location.href, location.href);
    const fragmentTarget = fragmentElement();
    const currentQuestion = fragmentTarget?.matches(
      "#question-01, .atlas > li[id]",
    )
      ? fragmentTarget.id
      : null;
    const latestOpenQuestion = disclosures
      .findLast(({ open }) => open)
      ?.closest("li[id]")?.id;
    url.hash = currentQuestion || latestOpenQuestion || "question-01";
    return url.href;
  } catch {
    return location.href;
  }
}
shareButton?.setAttribute("data-share-url", canonicalShareUrl());
shareButton?.addEventListener("click", async () => {
  const data = {
    title: "Hollywood Evolves — editorial question",
    text: "Consider this Hollywood Evolves question about entertainment technology.",
    url: canonicalShareUrl(),
  };
  shareFallback.hidden = true;
  shareStatus.textContent = "";
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      shareStatus.textContent = "Sharing request completed.";
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        shareStatus.textContent = "Sharing canceled.";
        return;
      }
    }
  }
  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(data.url);
      shareStatus.textContent = "Question URL copied.";
      return;
    } catch {
      /* Offer the selectable URL below. */
    }
  }
  shareFallback.hidden = false;
  shareUrl.value = data.url;
  shareUrl.focus();
  shareUrl.select();
  shareStatus.textContent = "Select and copy the question URL.";
});

function element(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgElement(name, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  if (className) node.setAttribute("class", className);
  return node;
}
function unavailable() {
  document
    .querySelector("#demo-views")
    ?.replaceChildren(
      element("p", "demo-unavailable", "Demo data unavailable"),
    );
  document
    .querySelector("#demo-evidence")
    ?.replaceChildren(element("li", "", "Demo data unavailable"));
  document.querySelectorAll(".atlas-state").forEach((node) => {
    const label = element("b", "", "DEMO");
    node.replaceChildren(
      label,
      document.createTextNode(" Demo data unavailable"),
    );
  });
}
function validText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validPercentagePair(item) {
  return Number.isInteger(item?.yes) && Number.isInteger(item?.no)
    && item.yes >= 0 && item.yes <= 100 && item.no >= 0 && item.no <= 100
    && item.yes + item.no === 100;
}
function validateDemoState(state) {
  const expectedViews = ["Guest", "Community", "Research System"];
  const expectedEvidence = ["signal-01", "signal-02", "signal-03", "signal-04"];
  const expectedQuestions = [...document.querySelectorAll(".atlas [data-question-id]")]
    .map((node) => node.dataset.questionId);
  const expectedPlatforms = ["Spotify", "Apple Music", "YouTube"];
  const validMetadata = Number.isInteger(state?.metadata?.migrationVersion)
    && Number.isInteger(state?.metadata?.seedVersion)
    && validText(state?.metadata?.asOf)
    && Number.isFinite(Date.parse(state.metadata.asOf));
  const validViews = Array.isArray(state?.headline?.views)
    && state.headline.views.length === expectedViews.length
    && state.headline.views.every((view, index) => view?.demo === true
      && view.label === expectedViews[index] && validText(view.status) && validPercentagePair(view));
  const validEvidence = Array.isArray(state?.headline?.evidence)
    && state.headline.evidence.length === expectedEvidence.length
    && state.headline.evidence.every((item, index) => item?.demo === true
      && item.id === expectedEvidence[index] && validText(item.status) && validText(item.description));
  const validOutcome = state?.headline?.outcome?.demo === true
    && state.headline.outcome.state === "unresolved"
    && validText(state.headline.outcome.threshold) && validText(state.headline.outcome.deadline);
  const validQuestions = Array.isArray(state?.questions)
    && state.questions.length === expectedQuestions.length
    && state.questions.every((question, index) => question?.demo === true
      && question.id === expectedQuestions[index] && validText(question.displayId)
      && validText(question.title) && validText(question.status)
      && validText(question.threshold) && validText(question.deadline)
      && validPercentagePair(question));
  const validPlatforms = Array.isArray(state?.platforms)
    && state.platforms.length === expectedPlatforms.length
    && state.platforms.every((platform, index) => platform?.name === expectedPlatforms[index]
      && platform.state === "pending" && platform.url === null);
  if (state?.demo !== true || state.label !== "DEMO · ILLUSTRATIVE FORECAST DATA · NOT LIVE"
    || !validMetadata || state.headline?.questionId !== expectedQuestions[0]
    || !validViews || !validEvidence || !validOutcome || !validQuestions || !validPlatforms) {
    throw new Error("Invalid demo state");
  }
}
function hydrateDemo(state) {
  validateDemoState(state);
  const views = document.createDocumentFragment();
  state.headline.views.forEach((view) => {
    const row = element("section", "demo-view");
    const heading = element("header");
    heading.append(
      element("h4", "", view.label),
      element("span", "", view.status),
    );
    const bar = svgElement("svg", "split-bar");
    bar.setAttribute("viewBox", "0 0 100 18");
    bar.setAttribute("preserveAspectRatio", "none");
    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      `${view.label} DEMO: ${view.yes}% yes, ${view.no}% no`,
    );
    const yes = svgElement("rect", "split-yes");
    yes.setAttribute("width", String(view.yes));
    yes.setAttribute("height", "18");
    const no = svgElement("rect", "split-no");
    no.setAttribute("x", String(view.yes));
    no.setAttribute("width", String(view.no));
    no.setAttribute("height", "18");
    bar.append(yes, no);
    const values = element("div", "split-values");
    values.append(
      element("span", "", `YES ${view.yes}%`),
      element("span", "", `NO ${view.no}%`),
    );
    row.append(heading, bar, values);
    views.append(row);
  });
  document.querySelector("#demo-views")?.replaceChildren(views);
  const evidence = document.createDocumentFragment();
  state.headline.evidence.forEach((item) =>
    evidence.append(element("li", "", `${item.status}: ${item.description}`)),
  );
  document.querySelector("#demo-evidence")?.replaceChildren(evidence);
  document.querySelector("#evidence-count").textContent =
    `${state.headline.evidence.length} illustrative signals`;
  document.querySelector("#demo-outcome").textContent = "Unresolved (demo)";
  document.querySelector("#demo-as-of").textContent =
    `As of ${state.metadata.asOf.slice(0, 10)}`;
  state.questions.forEach((question) => {
    const item = document.querySelector(
      `[data-question-id="${CSS.escape(question.id)}"]`,
    );
    const status = item?.querySelector(".atlas-state");
    if (!status) return;
    const label = element("b", "", "DEMO");
    status.replaceChildren(
      label,
      document.createTextNode(
        ` ${question.status} · YES ${question.yes}% / NO ${question.no}%`,
      ),
    );
  });
}
fetch("/api/demo-state", {
  headers: { Accept: "application/json" },
  credentials: "same-origin",
})
  .then((response) => {
    if (!response.ok) throw new Error("Demo unavailable");
    return response.json();
  })
  .then(hydrateDemo)
  .then(() => {
    document.documentElement.dataset.demoState = "ready";
  })
  .catch(() => {
    unavailable();
    document.documentElement.dataset.demoState = "unavailable";
  });
