import { Application, Router } from "https://deno.land/x/oak/mod.ts";

import { Stopwatch, StopwatchGroup } from "./types.ts";

const app = new Application();

const router = new Router();

let state: {
  stopwatchs: { [id: string]: Stopwatch };
  stopwatchGroups: { [id: string]: StopwatchGroup };
} = {
  stopwatchs: {},
  stopwatchGroups: {},
};

try {
  state = JSON.parse(Deno.readTextFileSync(Deno.args[0]));
} catch (e) {
  console.log("failed to read file", e);
}

let recentSave = false;
const save = () => {
  if (!recentSave) {
    Deno.writeTextFile(Deno.args[0], JSON.stringify(state));
    recentSave = true;
    setTimeout(() => recentSave = false, 1000);
  }
};

router.get("/stopwatch/:id", (ctx) => {
  const id = ctx.params.id;
  ctx.response.body = state.stopwatchs[id] || {
    name: "Unnamed",
    pastTime: 0,
    startedAt: undefined,
    running: false,
  };
});

router.put("/stopwatch/:id", async (ctx) => {
  const id = ctx.params.id;
  state.stopwatchs[id] = await ctx.request.body({ type: "json" }).value;
  ctx.response.status = 200;
  listeners[id]?.forEach((v) => v("update", state.stopwatchs[id]));
  save();
});

router.delete("/stopwatch/:id", (ctx) => {
  const id = ctx.params.id;
  listeners[id]?.forEach((v) => v("delete", state.stopwatchs[id]));
  delete state.stopwatchs[id];
  ctx.response.status = 200;
  save();
});

router.get("/stopwatchgroup/:id", (ctx) => {
  const id = ctx.params.id;
  ctx.response.body = state.stopwatchGroups[id] || {
    name: "Unnamed",
    ids: [],
  };
});

router.put("/stopwatchgroup/:id", async (ctx) => {
  const id = ctx.params.id;
  state.stopwatchGroups[id] = await ctx.request.body({ type: "json" }).value;
  save();
  ctx.response.status = 200;
});

router.delete("/stopwatchgroup/:id", (ctx) => {
  const id = ctx.params.id;
  delete state.stopwatchGroups[id];
  ctx.response.status = 200;
  save();
});

const listeners: {
  [id: string]: ((type: string, stopwatch: Stopwatch) => void)[];
} = {};

router.get("/ws", (ctx) => {
  const socket = ctx.upgrade();
  let myListeners: {
    [id: string]: (type: string, stopwatch: Stopwatch) => void;
  } = {};

  socket.addEventListener("close", () => {
    Object.keys(myListeners).forEach((key) => {
      if (myListeners[key]) {
        listeners[key] = listeners[key].filter((v) => v !== myListeners[key]);
        delete myListeners[key];
      }
    });
    myListeners = {};
  });

  socket.addEventListener("message", (e) => {
    let data: any = {};
    try {
      data = JSON.parse(e.data);
    } catch (_) {
      socket.send(JSON.stringify({ error: true, message: "Invalid message" }));
      return;
    }

    if (
      data.type === "listen" && data.id !== undefined &&
      typeof data.id === "string" && data.id.trim() !== ""
    ) {
      if (myListeners[data.id]) {
        return;
      }
      if (!listeners[data.id]) {
        listeners[data.id] = [];
      }
      const func = (type: string, stopwatch: Stopwatch) => {
        socket.send(JSON.stringify({
          ...stopwatch,
          type,
          id: data.id,
        }));
      };
      listeners[data.id].push(func);
    }

    if (
      data.type === "stopListening" && data.id !== undefined &&
      typeof data.id === "string" && data.id.trim() !== ""
    ) {
      if (myListeners[data.id]) {
        listeners[data.id] = listeners[data.id].filter((v) =>
          v !== myListeners[data.id]
        );
        delete myListeners[data.id];
      }
    }

    if (data.type === "clear") {
      Object.keys(myListeners).forEach((key) => {
        if (myListeners[key]) {
          listeners[key] = listeners[key].filter((v) => v !== myListeners[key]);
          delete myListeners[key];
        }
      });
      myListeners = {};
    }
  });
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(async (ctx) => {
  await ctx.send({
    root: "./static",
    index: "index.html",
  });
});

app.listen({ port: +(Deno.args[1] || 8080) });
