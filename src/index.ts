import { Stopwatch, StopwatchGroup } from "../types.ts";

type LocalStopwatch = Stopwatch & { id: string; element?: HTMLDivElement };

const ensure = <T extends HTMLElement>(q: string): T => {
  const el = document.querySelector(q);
  if (el === null) {
    throw new Error("Can't find " + q);
  }
  return el as T;
};

const formatDuration = (ms: number) => {
  const hours = Math.floor(ms / 1000 / 60 / 60);
  const minutes = Math.floor(ms / 1000 / 60) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const miliseconds = ms % 1000;
  const msRounded = Math.floor(miliseconds / 100);

  return `${hours}:${minutes}:${seconds}.${msRounded}`;
};

const getRandomString = (s: number) => {
  const buf = new Uint8Array(s);
  crypto.getRandomValues(buf);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let ret = "";
  for (let i = 0; i < buf.length; ++i) {
    const ind = Math.floor((buf[i] / 256) * alphabet.length);
    ret += alphabet[ind];
  }
  return ret;
};

const elements = {
  stopwatchTemplate: ensure<HTMLTemplateElement>("#stopwatch"),
  stopwatchContainer: ensure<HTMLDivElement>("#stopwatches"),
  createButton: ensure<HTMLButtonElement>("#add-stopwatch"),
  groupInput: ensure<HTMLInputElement>("#group"),
  createWithId: ensure<HTMLButtonElement>("#add-with-id"),
};

elements.groupInput.addEventListener("blur", () => {
  if (elements.groupInput.value === "") {
    elements.groupInput.value = getRandomString(40);
  }
  const URLCopy = new URL(window.location.toString());

  userId = elements.groupInput.value;

  URLCopy.searchParams.set('id', userId);

  window.history.pushState(null, '', URLCopy);

  getStopwatches();
});

let stopWatches: (LocalStopwatch)[] = [];

const newStopwatch = async (id: string) => {
  const res = await fetch(`/stopwatch/${id}`);
  const stopWatch = await res.json();

  const stopwatchWithElement = createStopwatchElement({ ...stopWatch, id });

  stopWatches.push(stopwatchWithElement);

  socket.send(JSON.stringify({
    type: "listen",
    id,
  }));

  stopWatchGroupData.ids.push(id);

  fetch(`/stopwatchgroup/${localStorage.getItem("userId")}`, {
    method: "PUT",
    body: JSON.stringify(stopWatchGroupData),
  });
};

elements.createButton.addEventListener("click", () => {
  const id = getRandomString(40);

  newStopwatch(id);
});

elements.createWithId.addEventListener("click", () => {
  const id = prompt("Enter the id");

  if (id !== "" && id !== null) {
    newStopwatch(id);
  }
});

let stopWatchGroupData: StopwatchGroup = {
  name: "none",
  ids: [],
};

const getStopwatches = async () => {
  const res = await fetch(`/stopwatchgroup/${localStorage.getItem("userId")}`);
  const data = await res.json();
  stopWatchGroupData = data;

  stopWatches.forEach((sw) => {
    sw.element?.remove();
  });

  stopWatches = [];
  socket.send(JSON.stringify({
    type: "clear",
  }));

  data.ids.forEach(async (id: string) => {
    const res = await fetch(`/stopwatch/${id}`);
    const sw = await res.json();
    const withEl = createStopwatchElement({ ...sw, id });
    socket.send(JSON.stringify({
      type: "listen",
      id,
    }));
    stopWatches.push(withEl);
  });
};

const createStopwatchElement = (stopwatch: LocalStopwatch) => {
  if (!elements.stopwatchTemplate.content.firstElementChild) {
    throw new Error("Template failed");
  }
  const element = elements.stopwatchTemplate.content.firstElementChild
    .cloneNode(true) as HTMLDivElement;
  element.querySelector(".start-button")?.addEventListener("click", () => {
    if (!stopwatch.running) {
      stopwatch.running = true;
      stopwatch.startedAt = +(new Date());
    } else if (stopwatch.running && stopwatch.startedAt) {
      stopwatch.running = false;
      stopwatch.pastTime += +(new Date()) - stopwatch.startedAt;
      stopwatch.startedAt = undefined;
    }
    updateStopwatch(stopwatch);
  });

  element.querySelector(".reset-button")?.addEventListener("click", () => {
    if (confirm("Reset?")) {
      stopwatch.running = false;
      stopwatch.pastTime = 0;
      stopwatch.startedAt = undefined;
      const timeEl = stopwatch.element?.querySelector(".time");
      if (!timeEl) {
        throw new Error("Element doesn't have .time");
      }
      timeEl.textContent = formatDuration(0);
    }

    updateStopwatch(stopwatch);
  });

  element.querySelector(".delete-button")?.addEventListener("click", () => {
    if (confirm("Delete?")) {
      fetch(`/stopwatch/${stopwatch.id}`, {
        method: "DELETE",
      });

      stopwatch.element?.remove();

      stopWatches = stopWatches.filter((v) => v.id !== stopwatch.id);

      socket.send(JSON.stringify({
        type: "stopListening",
        id: stopwatch.id,
      }));

      stopWatchGroupData.ids = stopWatchGroupData.ids.filter((v) =>
        v !== stopwatch.id
      );

      fetch(`/stopwatchgroup/${localStorage.getItem("userId")}`, {
        method: "PUT",
        body: JSON.stringify(stopWatchGroupData),
      });
    }
  });

  element.querySelector(".show-id-button")?.addEventListener("click", () => {
    alert(stopwatch.id);
  });

  const timeEl = element.querySelector(".time");

  if (!timeEl) throw new Error(".time element does not exist");

  timeEl.textContent = formatDuration(
    stopwatch.pastTime,
  );

  elements.stopwatchContainer.appendChild(element);
  stopwatch.element = element;

  return stopwatch;
};

const params = new URLSearchParams(window.location.search);

const URLCopy = new URL(window.location.toString());

let userId = params.get('id');
if (!userId) {
  userId = getRandomString(40);
  URLCopy.searchParams.set('id', userId)
  window.history.pushState(null, '', URLCopy);
}

// if (
//   localStorage.getItem("userId") === null ||
//   localStorage.getItem("userId")?.trim() === ""
// ) {
//   const uid = getRandomString(40);
//   localStorage.setItem("userId", uid);
// }

elements.groupInput.value = userId;

const updateStopwatch = async (stopwatch: LocalStopwatch) => {
  await fetch(`/stopwatch/${stopwatch.id}`, {
    method: "put",
    body: JSON.stringify({
      running: stopwatch.running,
      startedAt: stopwatch.startedAt,
      pastTime: stopwatch.pastTime,
      name: stopwatch.name,
    }),
  });
};

const update = () => {
  stopWatches.forEach((sw) => {
    const timeEl = sw.element?.querySelector(".time");
    const startBtn = sw.element?.querySelector(".start-button");
    if (!timeEl) throw new Error(".time element not found");
    if (!startBtn) throw new Error(".start-button element not found");

    if (sw.running && sw.startedAt) {
      timeEl.textContent = formatDuration(
        sw.pastTime + (+new Date() - sw.startedAt),
      );
      startBtn.textContent = "Stop";
      startBtn.id = "stop-btn";
    } else {
      timeEl.textContent = formatDuration(sw.pastTime);
      startBtn.textContent = "Start";
      startBtn.id = "start-btn";
    }
  });

  requestAnimationFrame(update);
};

const socket = new WebSocket(
  `${window.location.protocol === "https:" ? "wss" : "ws"
  }://${window.location.host}/ws`,
);

socket.addEventListener("open", () => {
  getStopwatches();
  requestAnimationFrame(update);
});

socket.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "delete") {
    stopWatches.find((v) => v.id === data.id)?.element?.remove();
    stopWatches.filter((v) => v.id !== data.id);
  }

  if (data.type === "update") {
    const sw = stopWatches.find((v) => v.id === data.id);
    if (sw) {
      sw.name = data.name;
      sw.pastTime = data.pastTime;
      sw.running = data.running;
      sw.startedAt = data.startedAt;
    }
  }
});
