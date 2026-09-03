/* script.js */

"use strict";

/*
  Required countdown configuration.
  Dates are UTC timestamps and are not dependent on the user's local timezone.
*/
const EVENTS = {
  preload: Date.UTC(2026, 10, 12, 0, 0, 0),
  launch: Date.UTC(2026, 10, 19, 0, 0, 0)
};

const PRELOAD_PROGRESS_START = Date.UTC(2026, 5, 19, 0, 0, 0);
const LAUNCH_PROGRESS_START = Date.UTC(2022, 1, 4, 0, 0, 0);
const NETFLIX_WINDOW_START = EVENTS.preload;
const NETFLIX_WINDOW_DURATION = 6 * 60 * 60 * 1000;

const STORAGE_KEYS = {
  characters: "gta6hub_characters",
  locations: "gta6hub_locations",
  news: "gta6hub_news",
  theories: "gta6hub_theories",
  summary: "gta6hub_summary",
  trailers: "gta6hub_trailers",
  screenshots: "gta6hub_screenshots"
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const create = (tag, className = "") => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
};

function getStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Your browser could not save data locally.");
  }
}

function generateId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}

function text(value) {
  return String(value || "").trim();
}

function isValidUrl(value) {
  const urlValue = text(value);
  if (!urlValue) return false;

  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function setElementText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function clamp(number, minimum, maximum) {
  return Math.min(Math.max(number, minimum), maximum);
}

function getTimeParts(milliseconds) {
  const safeValue = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeValue / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getEventStatus(now, target, type) {
  if (now < target) {
    return "Upcoming";
  }

  if (type === "preload") {
    return "Live — pre-download window has started.";
  }

  return "Released — launch time has arrived.";
}

function renderCountdown(prefix, target, type = "launch") {
  const now = Date.now();
  const remaining = Math.max(0, target - now);
  const parts = getTimeParts(remaining);

  setElementText(`${prefix}Days`, padNumber(parts.days));
  setElementText(`${prefix}Hours`, padNumber(parts.hours));
  setElementText(`${prefix}Minutes`, padNumber(parts.minutes));
  setElementText(`${prefix}Seconds`, padNumber(parts.seconds));
  setElementText(`${prefix}Status`, getEventStatus(now, target, type));
}

function renderThreePartCountdown(prefix, target, statusText) {
  const remaining = Math.max(0, target - Date.now());
  const parts = getTimeParts(remaining);

  setElementText(`${prefix}Hours`, padNumber(parts.hours));
  setElementText(`${prefix}Minutes`, padNumber(parts.minutes));
  setElementText(`${prefix}Seconds`, padNumber(parts.seconds));
  setElementText(`${prefix}Status`, statusText);
}

function updateProgress(start, end, fillId, textId) {
  const now = Date.now();
  const percentage = clamp(((now - start) / (end - start)) * 100, 0, 100);
  const fill = document.getElementById(fillId);

  if (fill) {
    fill.style.width = `${percentage.toFixed(2)}%`;
  }

  setElementText(textId, `${percentage.toFixed(1)}%`);
}

function updateNetflixWindow() {
  const now = Date.now();
  const end = NETFLIX_WINDOW_START + NETFLIX_WINDOW_DURATION;
  const fill = $("#windowProgressFill");

  if (now < NETFLIX_WINDOW_START) {
    const until = getTimeParts(NETFLIX_WINDOW_START - now);
    setElementText("windowHours", padNumber(until.hours + until.days * 24));
    setElementText("windowMinutes", padNumber(until.minutes));
    setElementText("windowSeconds", padNumber(until.seconds));
    setElementText("windowStatus", "Window begins at the configured pre-download time.");
    setElementText("windowProgressText", "0.0%");
    if (fill) fill.style.width = "0%";
    return;
  }

  if (now >= end) {
    setElementText("windowHours", "00");
    setElementText("windowMinutes", "00");
    setElementText("windowSeconds", "00");
    setElementText("windowStatus", "Completed — the six-hour window has ended.");
    setElementText("windowProgressText", "100.0%");
    if (fill) fill.style.width = "100%";
    return;
  }

  const remaining = getTimeParts(end - now);
  const percentage = clamp(((now - NETFLIX_WINDOW_START) / NETFLIX_WINDOW_DURATION) * 100, 0, 100);

  setElementText("windowHours", padNumber(remaining.hours));
  setElementText("windowMinutes", padNumber(remaining.minutes));
  setElementText("windowSeconds", padNumber(remaining.seconds));
  setElementText("windowStatus", "Window is live — time remaining until YouTube window.");
  setElementText("windowProgressText", `${percentage.toFixed(1)}%`);
  if (fill) fill.style.width = `${percentage.toFixed(2)}%`;
}

function updateAllTimers() {
  renderCountdown("preload", EVENTS.preload, "preload");
  renderCountdown("launch", EVENTS.launch, "launch");
  renderCountdown("heroLaunch", EVENTS.launch, "launch");

  const obsRemaining = Math.max(0, EVENTS.launch - Date.now());
  const obsParts = getTimeParts(obsRemaining);
  setElementText("obsLaunchDays", padNumber(obsParts.days));
  setElementText("obsLaunchHours", padNumber(obsParts.hours));
  setElementText("obsLaunchMinutes", padNumber(obsParts.minutes));
  setElementText("obsLaunchStatus", getEventStatus(Date.now(), EVENTS.launch, "launch"));

  updateProgress(PRELOAD_PROGRESS_START, EVENTS.preload, "preloadProgressFill", "preloadProgressText");
  updateProgress(LAUNCH_PROGRESS_START, EVENTS.launch, "launchProgressFill", "launchProgressText");
  updateNetflixWindow();
}

function initCountdowns() {
  if (!$("#preloadCountdown") && !$("#launchCountdown")) return;

  updateAllTimers();
  window.setInterval(updateAllTimers, 1000);
}

function initializeNavigation() {
  const menuToggle = $("#menuToggle");
  const navLinks = $("#navLinks");

  if (!menuToggle || !navLinks) return;

  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });

  navLinks.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;

    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
  });
}

function initializeObsMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "obs") {
    document.body.classList.add("obs-mode");
  }
}

function getYouTubeEmbedUrl(urlValue) {
  if (!isValidUrl(urlValue)) return "";

  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.replace("www.", "");

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : "";
    }

    if (hostname === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : "";
    }
  } catch {
    return "";
  }

  return "";
}

function addText(parent, tag, content, className = "") {
  const element = create(tag, className);
  element.textContent = content;
  parent.appendChild(element);
  return element;
}

function createTag(label, className) {
  const item = create("span", `tag ${className}`);
  item.textContent = label;
  return item;
}

function createActions(onEdit, onDelete) {
  const actions = create("div", "item-actions");

  const edit = create("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", onEdit);

  const remove = create("button", "delete-button");
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", onDelete);

  actions.append(edit, remove);
  return actions;
}

function emptyState(message) {
  const state = create("div", "empty-state");
  state.textContent = message;
  return state;
}

function filterItems(items, query, category, fields) {
  const normalizedQuery = text(query).toLowerCase();

  return items.filter((item) => {
    const matchesCategory = category === "all" || item.category === category;
    const searchable = fields.map((field) => text(item[field])).join(" ").toLowerCase();
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}

function startEdit(form, values, button, cancelButton, label) {
  if (!form) return;

  Object.entries(values).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value || "";
  });

  if (button) button.textContent = `Update ${label}`;
  if (cancelButton) cancelButton.classList.remove("is-hidden");

  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function leaveEdit(form, button, cancelButton, defaultLabel) {
  if (form) form.reset();
  if (button) button.textContent = defaultLabel;
  if (cancelButton) cancelButton.classList.add("is-hidden");
}

function deleteWithConfirmation(message, callback) {
  if (window.confirm(message)) {
    callback();
  }
}

/* Characters */

function renderCharacters() {
  const grid = $("#characterGrid");
  const search = $("#characterSearch");
  const filter = $("#characterFilter");

  if (!grid || !search || !filter) return;

  grid.querySelectorAll(".custom-character").forEach((item) => item.remove());

  const characters = getStoredArray(STORAGE_KEYS.characters);
  const visibleItems = filterItems(
    characters,
    search.value,
    filter.value,
    ["name", "notes", "category"]
  );

  const oldEmpty = grid.querySelector(".custom-character-empty");
  if (oldEmpty) oldEmpty.remove();

  visibleItems.forEach((item) => {
    const card = create("article", "glass-card character-card custom-character");
    const topLine = create("div", "card-topline");
    topLine.append(createTag("Fan-created", "tag-yellow"), createTag(item.category, "tag-cyan"));

    addText(card, "h3", item.name);
    addText(card, "p", item.notes);

    card.append(
      topLine,
      createActions(
        () => editCharacter(item),
        () => deleteWithConfirmation("Delete this character note?", () => {
          const updated = getStoredArray(STORAGE_KEYS.characters).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.characters, updated);
          renderCharacters();
          showToast("Character note deleted.");
        })
      )
    );

    grid.appendChild(card);
  });

  if (characters.length === 0 || visibleItems.length === 0) {
    const message = characters.length === 0
      ? "No custom character notes saved yet."
      : "No custom character notes match your search or filter.";
    const state = emptyState(message);
    state.classList.add("custom-character-empty");
    grid.appendChild(state);
  }
}

function editCharacter(item) {
  startEdit(
    $("#characterForm"),
    {
      characterId: item.id,
      characterName: item.name,
      characterCategory: item.category,
      characterNotes: item.notes
    },
    $("#characterSubmit"),
    $("#characterCancel"),
    "Character Note"
  );
}

function initCharacters() {
  const form = $("#characterForm");
  if (!form) return;

  $("#characterSearch")?.addEventListener("input", renderCharacters);
  $("#characterFilter")?.addEventListener("change", renderCharacters);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const id = text($("#characterId").value);
    const entry = {
      id: id || generateId("character"),
      name: text($("#characterName").value),
      category: text($("#characterCategory").value),
      notes: text($("#characterNotes").value)
    };

    if (!entry.name || !entry.notes) {
      showToast("Add a name and notes before saving.");
      return;
    }

    const characters = getStoredArray(STORAGE_KEYS.characters);
    const index = characters.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      characters[index] = entry;
      showToast("Character note updated.");
    } else {
      characters.push(entry);
      showToast("Character note saved.");
    }

    setStoredArray(STORAGE_KEYS.characters, characters);
    leaveEdit(form, $("#characterSubmit"), $("#characterCancel"), "Save Character Note");
    renderCharacters();
  });

  $("#characterCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#characterSubmit"), $("#characterCancel"), "Save Character Note");
  });

  renderCharacters();
}

/* Locations */

function renderLocations() {
  const grid = $("#locationGrid");
  const search = $("#locationSearch");
  const filter = $("#locationFilter");

  if (!grid || !search || !filter) return;

  grid.querySelectorAll(".custom-location").forEach((item) => item.remove());

  const locations = getStoredArray(STORAGE_KEYS.locations);
  const visibleItems = filterItems(
    locations,
    search.value,
    filter.value,
    ["name", "notes", "poi", "category"]
  );

  const oldEmpty = grid.querySelector(".custom-location-empty");
  if (oldEmpty) oldEmpty.remove();

  visibleItems.forEach((item) => {
    const card = create("article", "glass-card location-card custom-location");
    const topLine = create("div", "card-topline");
    topLine.append(createTag("Fan-created", "tag-yellow"), createTag(item.category, "tag-orange"));

    addText(card, "h3", item.name);
    addText(card, "p", item.notes);

    if (item.poi) {
      const poi = create("p", "poi");
      const label = create("strong");
      label.textContent = "Points of interest: ";
      poi.append(label, document.createTextNode(item.poi));
      card.appendChild(poi);
    }

    card.prepend(topLine);
    card.append(
      createActions(
        () => editLocation(item),
        () => deleteWithConfirmation("Delete this location note?", () => {
          const updated = getStoredArray(STORAGE_KEYS.locations).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.locations, updated);
          renderLocations();
          showToast("Location note deleted.");
        })
      )
    );

    grid.appendChild(card);
  });

  if (locations.length === 0 || visibleItems.length === 0) {
    const state = emptyState(
      locations.length === 0
        ? "No custom location notes saved yet."
        : "No location notes match your search or filter."
    );
    state.classList.add("custom-location-empty");
    grid.appendChild(state);
  }
}

function editLocation(item) {
  startEdit(
    $("#locationForm"),
    {
      locationId: item.id,
      locationName: item.name,
      locationCategory: item.category,
      locationNotes: item.notes,
      locationPoi: item.poi
    },
    $("#locationSubmit"),
    $("#locationCancel"),
    "Location Note"
  );
}

function initLocations() {
  const form = $("#locationForm");
  if (!form) return;

  $("#locationSearch")?.addEventListener("input", renderLocations);
  $("#locationFilter")?.addEventListener("change", renderLocations);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const id = text($("#locationId").value);
    const entry = {
      id: id || generateId("location"),
      name: text($("#locationName").value),
      category: text($("#locationCategory").value),
      notes: text($("#locationNotes").value),
      poi: text($("#locationPoi").value)
    };

    if (!entry.name || !entry.notes) {
      showToast("Add a location name and description before saving.");
      return;
    }

    const locations = getStoredArray(STORAGE_KEYS.locations);
    const index = locations.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      locations[index] = entry;
      showToast("Location note updated.");
    } else {
      locations.push(entry);
      showToast("Location note saved.");
    }

    setStoredArray(STORAGE_KEYS.locations, locations);
    leaveEdit(form, $("#locationSubmit"), $("#locationCancel"), "Save Location Note");
    renderLocations();
  });

  $("#locationCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#locationSubmit"), $("#locationCancel"), "Save Location Note");
  });

  renderLocations();
}

/* Trailers */

function renderTrailerPreview(item) {
  const preview = create("div", "trailer-preview");
  const embedUrl = getYouTubeEmbedUrl(item.url);

  if (embedUrl) {
    const iframe = create("iframe");
    iframe.src = embedUrl;
    iframe.title = item.title;
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    preview.appendChild(iframe);
    return preview;
  }

  if (isValidUrl(item.thumbnail)) {
    const image = create("img");
    image.src = item.thumbnail;
    image.alt = `${item.title} thumbnail`;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      preview.appendChild(buildVideoPlaceholder());
    });
    preview.appendChild(image);
    return preview;
  }

  preview.appendChild(buildVideoPlaceholder());
  return preview;
}

function buildVideoPlaceholder() {
  const placeholder = create("div", "video-placeholder");
  addText(placeholder, "strong", "Video Placeholder");
  addText(placeholder, "span", "Add a trusted YouTube URL or thumbnail to preview this card.");
  return placeholder;
}

function renderTrailers() {
  const grid = $("#trailerGrid");
  if (!grid) return;

  grid.replaceChildren();
  const trailers = getStoredArray(STORAGE_KEYS.trailers);

  if (trailers.length === 0) {
    grid.appendChild(emptyState("No trailers saved yet. Add Trailer 1, Trailer 2, Extended Look, or a future video using the form below."));
    return;
  }

  trailers.forEach((item) => {
    const card = create("article", "glass-card trailer-card");
    card.appendChild(renderTrailerPreview(item));

    const topLine = create("div", "card-topline");
    topLine.append(createTag("Trailer", "tag-purple"), createTag(formatDate(item.date), "tag-cyan"));

    addText(card, "h3", item.title);
    addText(card, "p", item.description);

    if (isValidUrl(item.url)) {
      const meta = create("p", "meta-line");
      const link = create("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open trusted video link";
      meta.appendChild(link);
      card.appendChild(meta);
    }

    card.append(
      topLine,
      createActions(
        () => editTrailer(item),
        () => deleteWithConfirmation("Delete this trailer entry?", () => {
          const updated = getStoredArray(STORAGE_KEYS.trailers).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.trailers, updated);
          renderTrailers();
          showToast("Trailer deleted.");
        })
      )
    );

    card.insertBefore(topLine, card.children[1] || null);
    grid.appendChild(card);
  });
}

function editTrailer(item) {
  startEdit(
    $("#trailerForm"),
    {
      trailerId: item.id,
      trailerTitle: item.title,
      trailerDate: item.date,
      trailerDescription: item.description,
      trailerUrl: item.url,
      trailerThumbnail: item.thumbnail
    },
    $("#trailerSubmit"),
    $("#trailerCancel"),
    "Trailer"
  );
}

function initTrailers() {
  const form = $("#trailerForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const url = text($("#trailerUrl").value);
    const thumbnail = text($("#trailerThumbnail").value);

    if (url && !isValidUrl(url)) {
      showToast("Enter a valid trusted video URL.");
      return;
    }

    if (thumbnail && !isValidUrl(thumbnail)) {
      showToast("Enter a valid thumbnail URL.");
      return;
    }

    const id = text($("#trailerId").value);
    const entry = {
      id: id || generateId("trailer"),
      title: text($("#trailerTitle").value),
      date: text($("#trailerDate").value),
      description: text($("#trailerDescription").value),
      url,
      thumbnail
    };

    const trailers = getStoredArray(STORAGE_KEYS.trailers);
    const index = trailers.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      trailers[index] = entry;
      showToast("Trailer updated.");
    } else {
      trailers.push(entry);
      showToast("Trailer saved.");
    }

    setStoredArray(STORAGE_KEYS.trailers, trailers);
    leaveEdit(form, $("#trailerSubmit"), $("#trailerCancel"), "Save Trailer");
    renderTrailers();
  });

  $("#trailerCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#trailerSubmit"), $("#trailerCancel"), "Save Trailer");
  });

  renderTrailers();
}

/* Screenshots and accessible lightbox */

function renderScreenshots() {
  const grid = $("#screenshotGrid");
  const search = $("#screenshotSearch");
  const filter = $("#screenshotFilter");

  if (!grid || !search || !filter) return;

  grid.replaceChildren();
  const screenshots = getStoredArray(STORAGE_KEYS.screenshots);
  const visible = filterItems(screenshots, search.value, filter.value, [
    "title",
    "description",
    "alt",
    "category"
  ]);

  if (screenshots.length === 0 || visible.length === 0) {
    grid.appendChild(emptyState(
      screenshots.length === 0
        ? "No screenshots saved yet."
        : "No screenshots match your search or filter."
    ));
    return;
  }

  visible.forEach((item) => {
    const card = create("article", "glass-card screenshot-card");
    const button = create("button", "screenshot-button");
    button.type = "button";
    button.setAttribute("aria-label", `Open screenshot: ${item.title}`);
    button.addEventListener("click", () => openLightbox(item));

    const frame = create("div", "screenshot-frame");
    const image = create("img");
    image.src = item.url;
    image.alt = item.alt;
    image.loading = "lazy";

    image.addEventListener("error", () => {
      image.remove();
      frame.replaceChildren();
      const fallback = create("div", "image-fallback");
      addText(fallback, "strong", "Image unavailable");
      addText(fallback, "span", "Check the image URL or replace it with another source.");
      frame.appendChild(fallback);
    });

    frame.appendChild(image);

    const info = create("div", "screenshot-info");
    const topLine = create("div", "card-topline");
    topLine.append(createTag(item.category, "tag-cyan"));
    addText(info, "h3", item.title);
    addText(info, "p", item.description);

    button.append(frame, info);
    card.append(button);

    card.append(
      createActions(
        () => editScreenshot(item),
        () => deleteWithConfirmation("Delete this screenshot entry?", () => {
          const updated = getStoredArray(STORAGE_KEYS.screenshots).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.screenshots, updated);
          renderScreenshots();
          showToast("Screenshot deleted.");
        })
      )
    );

    info.prepend(topLine);
    grid.appendChild(card);
  });
}

function openLightbox(item) {
  const lightbox = $("#lightbox");
  const image = $("#lightboxImage");
  const caption = $("#lightboxCaption");

  if (!lightbox || !image || !caption) return;

  image.src = item.url;
  image.alt = item.alt;
  caption.textContent = `${item.title} — ${item.description}`;
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  $("#lightboxClose")?.focus();
}

function closeLightbox() {
  const lightbox = $("#lightbox");
  const image = $("#lightboxImage");

  if (!lightbox || !image) return;

  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  image.src = "";
  image.alt = "";
}

function editScreenshot(item) {
  startEdit(
    $("#screenshotForm"),
    {
      screenshotId: item.id,
      screenshotUrl: item.url,
      screenshotTitle: item.title,
      screenshotDescription: item.description,
      screenshotAlt: item.alt,
      screenshotCategory: item.category
    },
    $("#screenshotSubmit"),
    $("#screenshotCancel"),
    "Screenshot"
  );
}

function initScreenshots() {
  const form = $("#screenshotForm");
  if (!form) return;

  $("#screenshotSearch")?.addEventListener("input", renderScreenshots);
  $("#screenshotFilter")?.addEventListener("change", renderScreenshots);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const url = text($("#screenshotUrl").value);
    const alt = text($("#screenshotAlt").value);

    if (!isValidUrl(url)) {
      showToast("Enter a valid image URL.");
      return;
    }

    if (alt.length < 8) {
      showToast("Please provide useful alt text with at least 8 characters.");
      return;
    }

    const id = text($("#screenshotId").value);
    const entry = {
      id: id || generateId("screenshot"),
      url,
      title: text($("#screenshotTitle").value),
      description: text($("#screenshotDescription").value),
      alt,
      category: text($("#screenshotCategory").value)
    };

    const screenshots = getStoredArray(STORAGE_KEYS.screenshots);
    const index = screenshots.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      screenshots[index] = entry;
      showToast("Screenshot updated.");
    } else {
      screenshots.push(entry);
      showToast("Screenshot saved.");
    }

    setStoredArray(STORAGE_KEYS.screenshots, screenshots);
    leaveEdit(form, $("#screenshotSubmit"), $("#screenshotCancel"), "Save Screenshot");
    renderScreenshots();
  });

  $("#screenshotCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#screenshotSubmit"), $("#screenshotCancel"), "Save Screenshot");
  });

  $("#lightboxClose")?.addEventListener("click", closeLightbox);

  $("#lightbox")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
    }
  });

  renderScreenshots();
}

/* News */

function sortNews(items, sortValue) {
  const copy = [...items];

  if (sortValue === "date-asc") {
    return copy.sort((a, b) => a.date.localeCompare(b.date));
  }

  if (sortValue === "title-asc") {
    return copy.sort((a, b) => a.headline.localeCompare(b.headline));
  }

  return copy.sort((a, b) => b.date.localeCompare(a.date));
}

function renderNews() {
  const grid = $("#newsGrid");
  const search = $("#newsSearch");
  const filter = $("#newsFilter");
  const sort = $("#newsSort");

  if (!grid || !search || !filter || !sort) return;

  grid.replaceChildren();

  const allNews = getStoredArray(STORAGE_KEYS.news);
  const filtered = filterItems(allNews, search.value, filter.value, [
    "headline",
    "description",
    "source",
    "category"
  ]);
  const items = sortNews(filtered, sort.value);

  if (allNews.length === 0 || items.length === 0) {
    grid.appendChild(emptyState(
      allNews.length === 0
        ? "No news items saved yet."
        : "No news entries match your search or filter."
    ));
    return;
  }

  items.forEach((item) => {
    const card = create("article", "glass-card news-card");
    const topLine = create("div", "card-topline");

    const categoryClass = item.category === "rumor"
      ? "status-unconfirmed"
      : item.category === "official"
        ? "status-confirmed"
        : "tag-cyan";

    const categoryText = item.category === "rumor"
      ? "Rumor — Unconfirmed"
      : item.category;

    topLine.append(createTag(categoryText, categoryClass), createTag(formatDate(item.date), "tag-purple"));
    card.appendChild(topLine);

    addText(card, "h3", item.headline);
    addText(card, "p", item.description);

    const source = create("p", "meta-line");
    source.append(document.createTextNode("Source: "));

    if (isValidUrl(item.url)) {
      const link = create("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.source;
      source.appendChild(link);
    } else {
      source.append(document.createTextNode(item.source));
    }

    card.append(
      source,
      createActions(
        () => editNews(item),
        () => deleteWithConfirmation("Delete this news item?", () => {
          const updated = getStoredArray(STORAGE_KEYS.news).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.news, updated);
          renderNews();
          showToast("News item deleted.");
        })
      )
    );

    grid.appendChild(card);
  });
}

function editNews(item) {
  startEdit(
    $("#newsForm"),
    {
      newsId: item.id,
      newsHeadline: item.headline,
      newsDate: item.date,
      newsCategory: item.category,
      newsDescription: item.description,
      newsSource: item.source,
      newsUrl: item.url
    },
    $("#newsSubmit"),
    $("#newsCancel"),
    "News Item"
  );
}

function initNews() {
  const form = $("#newsForm");
  if (!form) return;

  $("#newsSearch")?.addEventListener("input", renderNews);
  $("#newsFilter")?.addEventListener("change", renderNews);
  $("#newsSort")?.addEventListener("change", renderNews);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const url = text($("#newsUrl").value);
    if (url && !isValidUrl(url)) {
      showToast("Enter a valid source URL.");
      return;
    }

    const id = text($("#newsId").value);
    const entry = {
      id: id || generateId("news"),
      headline: text($("#newsHeadline").value),
      date: text($("#newsDate").value),
      category: text($("#newsCategory").value),
      description: text($("#newsDescription").value),
      source: text($("#newsSource").value),
      url
    };

    const news = getStoredArray(STORAGE_KEYS.news);
    const index = news.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      news[index] = entry;
      showToast("News item updated.");
    } else {
      news.push(entry);
      showToast(entry.category === "rumor" ? "Unconfirmed rumor saved." : "News item saved.");
    }

    setStoredArray(STORAGE_KEYS.news, news);
    leaveEdit(form, $("#newsSubmit"), $("#newsCancel"), "Save News Item");
    renderNews();
  });

  $("#newsCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#newsSubmit"), $("#newsCancel"), "Save News Item");
  });

  renderNews();
}

/* Theories */

function renderTheories() {
  const grid = $("#theoryGrid");
  const search = $("#theorySearch");
  const filter = $("#theoryFilter");
  const statusFilter = $("#theoryStatusFilter");

  if (!grid || !search || !filter || !statusFilter) return;

  grid.replaceChildren();

  const theories = getStoredArray(STORAGE_KEYS.theories);
  const filteredByTextCategory = filterItems(theories, search.value, filter.value, [
    "title",
    "description",
    "author",
    "category",
    "status"
  ]);

  const visible = filteredByTextCategory.filter((item) => {
    return statusFilter.value === "all" || item.status === statusFilter.value;
  });

  if (theories.length === 0 || visible.length === 0) {
    grid.appendChild(emptyState(
      theories.length === 0
        ? "No fan theories saved yet."
        : "No theories match your search or filters."
    ));
    return;
  }

  visible.forEach((item) => {
    const card = create("article", "glass-card theory-card");
    const topLine = create("div", "card-topline");

    const statusClass = item.status === "confirmed"
      ? "status-confirmed"
      : item.status === "plausible"
        ? "status-plausible"
        : "status-unconfirmed";

    topLine.append(
      createTag(item.category, "tag-purple"),
      createTag(item.status, statusClass)
    );

    card.appendChild(topLine);
    addText(card, "h3", item.title);
    addText(card, "p", item.description);

    const meta = create("p", "meta-line");
    meta.append(document.createTextNode(`Fan theory by ${item.author}. `));

    if (isValidUrl(item.evidence)) {
      const link = create("a");
      link.href = item.evidence;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Evidence link";
      meta.appendChild(link);
    }

    card.append(
      meta,
      createActions(
        () => editTheory(item),
        () => deleteWithConfirmation("Delete this theory?", () => {
          const updated = getStoredArray(STORAGE_KEYS.theories).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.theories, updated);
          renderTheories();
          showToast("Theory deleted.");
        })
      )
    );

    grid.appendChild(card);
  });
}

function editTheory(item) {
  startEdit(
    $("#theoryForm"),
    {
      theoryId: item.id,
      theoryTitle: item.title,
      theoryDescription: item.description,
      theoryCategory: item.category,
      theoryAuthor: item.author,
      theoryEvidence: item.evidence,
      theoryStatus: item.status
    },
    $("#theorySubmit"),
    $("#theoryCancel"),
    "Theory"
  );
}

function initTheories() {
  const form = $("#theoryForm");
  if (!form) return;

  $("#theorySearch")?.addEventListener("input", renderTheories);
  $("#theoryFilter")?.addEventListener("change", renderTheories);
  $("#theoryStatusFilter")?.addEventListener("change", renderTheories);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const evidence = text($("#theoryEvidence").value);
    if (evidence && !isValidUrl(evidence)) {
      showToast("Enter a valid evidence URL.");
      return;
    }

    const id = text($("#theoryId").value);
    const entry = {
      id: id || generateId("theory"),
      title: text($("#theoryTitle").value),
      description: text($("#theoryDescription").value),
      category: text($("#theoryCategory").value),
      author: text($("#theoryAuthor").value),
      evidence,
      status: text($("#theoryStatus").value) || "unconfirmed"
    };

    const theories = getStoredArray(STORAGE_KEYS.theories);
    const index = theories.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      theories[index] = entry;
      showToast("Theory updated.");
    } else {
      theories.push(entry);
      showToast("Theory saved as fan speculation.");
    }

    setStoredArray(STORAGE_KEYS.theories, theories);
    leaveEdit(form, $("#theorySubmit"), $("#theoryCancel"), "Save Theory");
    renderTheories();
  });

  $("#theoryCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#theorySubmit"), $("#theoryCancel"), "Save Theory");
  });

  renderTheories();
}

/* Summary */

function isValidTimestamp(value) {
  return /^(?:[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]|[0-5][0-9]:[0-5][0-9])$/.test(text(value));
}

function timestampToSeconds(value) {
  const parts = text(value).split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function sortSummary(items, sortValue) {
  const copy = [...items];

  if (sortValue === "timestamp-desc") {
    return copy.sort((a, b) => timestampToSeconds(b.timestamp) - timestampToSeconds(a.timestamp));
  }

  if (sortValue === "category-asc") {
    return copy.sort((a, b) => a.category.localeCompare(b.category));
  }

  return copy.sort((a, b) => timestampToSeconds(a.timestamp) - timestampToSeconds(b.timestamp));
}

function renderSummary() {
  const body = $("#summaryBody");
  const search = $("#summarySearch");
  const filter = $("#summaryFilter");
  const sort = $("#summarySort");

  if (!body || !search || !filter || !sort) return;

  body.replaceChildren();

  const allItems = getStoredArray(STORAGE_KEYS.summary);
  const filtered = filterItems(allItems, search.value, filter.value, [
    "timestamp",
    "what",
    "why",
    "category",
    "status"
  ]);
  const items = sortSummary(filtered, sort.value);

  if (allItems.length === 0 || items.length === 0) {
    const row = create("tr");
    const cell = create("td");
    cell.colSpan = 6;
    cell.className = "empty-state";
    cell.textContent = allItems.length === 0
      ? "No summary entries saved. Add placeholders for opening, characters, systems, regions, activities, vehicles, side characters, and release information."
      : "No summary entries match your search or filter.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  items.forEach((item) => {
    const row = create("tr");
    addText(row, "td", item.timestamp);
    addText(row, "td", item.what);
    addText(row, "td", item.why);
    addText(row, "td", item.category);

    const statusCell = create("td");
    const statusClass = item.status === "confirmed" ? "status-confirmed" : "status-unconfirmed";
    statusCell.appendChild(createTag(item.status, statusClass));
    row.appendChild(statusCell);

    const actionsCell = create("td");
    actionsCell.appendChild(
      createActions(
        () => editSummary(item),
        () => deleteWithConfirmation("Delete this summary entry?", () => {
          const updated = getStoredArray(STORAGE_KEYS.summary).filter((entry) => entry.id !== item.id);
          setStoredArray(STORAGE_KEYS.summary, updated);
          renderSummary();
          showToast("Summary entry deleted.");
        })
      )
    );
    row.appendChild(actionsCell);

    body.appendChild(row);
  });
}

function editSummary(item) {
  startEdit(
    $("#summaryForm"),
    {
      summaryId: item.id,
      summaryTimestamp: item.timestamp,
      summaryWhat: item.what,
      summaryWhy: item.why,
      summaryCategory: item.category,
      summaryStatus: item.status
    },
    $("#summarySubmit"),
    $("#summaryCancel"),
    "Summary Entry"
  );
}

function initSummary() {
  const form = $("#summaryForm");
  if (!form) return;

  $("#summarySearch")?.addEventListener("input", renderSummary);
  $("#summaryFilter")?.addEventListener("change", renderSummary);
  $("#summarySort")?.addEventListener("change", renderSummary);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const timestamp = text($("#summaryTimestamp").value);
    if (!isValidTimestamp(timestamp)) {
      showToast("Timestamp must use MM:SS or HH:MM:SS, such as 00:00 or 01:23:45.");
      $("#summaryTimestamp")?.focus();
      return;
    }

    const id = text($("#summaryId").value);
    const entry = {
      id: id || generateId("summary"),
      timestamp,
      what: text($("#summaryWhat").value),
      why: text($("#summaryWhy").value),
      category: text($("#summaryCategory").value),
      status: text($("#summaryStatus").value)
    };

    const summary = getStoredArray(STORAGE_KEYS.summary);
    const index = summary.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      summary[index] = entry;
      showToast("Summary entry updated.");
    } else {
      summary.push(entry);
      showToast("Summary entry saved.");
    }

    setStoredArray(STORAGE_KEYS.summary, summary);
    leaveEdit(form, $("#summarySubmit"), $("#summaryCancel"), "Save Summary Entry");
    renderSummary();
  });

  $("#summaryCancel")?.addEventListener("click", () => {
    leaveEdit(form, $("#summarySubmit"), $("#summaryCancel"), "Save Summary Entry");
  });

  renderSummary();
}

/* Clear only the website's own saved data */

function initClearData() {
  const button = $("#clearSavedData");
  if (!button) return;

  button.addEventListener("click", () => {
    const approved = window.confirm(
      "Clear all GTA VI Launch Hub data saved in this browser? This only removes this website's saved entries and cannot be undone."
    );

    if (!approved) return;

    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Ignore unavailable storage while retaining page functionality. */
      }
    });

    renderCharacters();
    renderLocations();
    renderTrailers();
    renderScreenshots();
    renderNews();
    renderTheories();
    renderSummary();
    showToast("GTA VI Launch Hub saved data cleared.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initializeObsMode();
  initializeNavigation();
  initCountdowns();
  initCharacters();
  initLocations();
  initTrailers();
  initScreenshots();
  initNews();
  initTheories();
  initSummary();
  initClearData();
});