const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MAX_PER_TEAM = 5;

function freshState() {
  return {
    green: Array(MAX_PER_TEAM).fill(null),   // { id, name }
    orange: Array(MAX_PER_TEAM).fill(null),
    winner: null, // { id, name, team }
    locked: false
  };
}

let state = freshState();

function counts() {
  return {
    green: state.green.filter(Boolean).length,
    orange: state.orange.filter(Boolean).length
  };
}

function broadcast() {
  io.emit("state", { state, counts: counts(), maxPerTeam: MAX_PER_TEAM });
}

function findPlayerById(id) {
  for (const team of ["green", "orange"]) {
    const idx = state[team].findIndex(p => p && p.id === id);
    if (idx !== -1) return { team, idx, player: state[team][idx] };
  }
  return null;
}

io.on("connection", (socket) => {
  socket.emit("state", { state, counts: counts(), maxPerTeam: MAX_PER_TEAM });

  socket.on("join", ({ name, team }, cb) => {
    name = String(name || "").trim();
    team = team === "green" ? "green" : team === "orange" ? "orange" : "";

    if (!name || !team) return cb?.({ ok: false, reason: "INVALID" });

    // Optional: prevent duplicate names
    const all = [...state.green, ...state.orange].filter(Boolean);
    if (all.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return cb?.({ ok: false, reason: "DUPLICATE_NAME" });
    }

    // If already joined, remove old slot
    const existing = findPlayerById(socket.id);
    if (existing) state[existing.team][existing.idx] = null;

    const freeIdx = state[team].findIndex(x => x === null);
    if (freeIdx === -1) return cb?.({ ok: false, reason: "TEAM_FULL" });

    state[team][freeIdx] = { id: socket.id, name };
    broadcast();
    cb?.({ ok: true, slot: { team, idx: freeIdx } });
  });

  socket.on("buzz", (cb) => {
    const me = findPlayerById(socket.id);
    if (!me) return cb?.({ ok: false, reason: "NOT_JOINED" });

    if (state.locked) return cb?.({ ok: true, winner: false });

    state.winner = { id: me.player.id, name: me.player.name, team: me.team };
    state.locked = true;
    broadcast();
    cb?.({ ok: true, winner: true });
  });

  socket.on("reset", ({ key }, cb) => {
    const HOST_KEY = process.env.HOST_KEY || "j279j";
    if (String(key || "") !== HOST_KEY) return cb?.({ ok: false, reason: "UNAUTHORIZED" });

    state.winner = null;
    state.locked = false;
    broadcast();
    cb?.({ ok: true });
  });

  socket.on("clear", ({ key }, cb) => {
    const HOST_KEY = process.env.HOST_KEY || "9999";
    if (String(key || "") !== HOST_KEY) return cb?.({ ok: false, reason: "UNAUTHORIZED" });

    state = freshState();
    broadcast();
    cb?.({ ok: true });
  });

  socket.on("leave", () => {
    const me = findPlayerById(socket.id);
    if (me) {
      if (state.winner?.id === socket.id) {
        state.winner = null;
        state.locked = false;
      }
      state[me.team][me.idx] = null;
      broadcast();
    }
  });

  socket.on("disconnect", () => {
    const me = findPlayerById(socket.id);
    if (me) {
      if (state.winner?.id === socket.id) {
        state.winner = null;
        state.locked = false;
      }
      state[me.team][me.idx] = null;
      broadcast();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Running on port", PORT));
