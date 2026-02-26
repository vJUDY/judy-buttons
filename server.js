const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MAX_PER_TEAM = 5;

function freshState(){
  return {
    green: Array(MAX_PER_TEAM).fill(null),
    orange: Array(MAX_PER_TEAM).fill(null),
    winner: null,
    locked: false
  };
}

let state = freshState();
let host = null; // { id, name }

function counts(){
  return {
    green: state.green.filter(Boolean).length,
    orange: state.orange.filter(Boolean).length
  };
}

function broadcast(){
  io.emit("state", { state, counts: counts(), maxPerTeam: MAX_PER_TEAM, host });
}

function findPlayerById(id){
  for (const team of ["green","orange"]){
    const idx = state[team].findIndex(p => p && p.id === id);
    if (idx !== -1) return { team, idx, player: state[team][idx] };
  }
  return null;
}

function nameExists(name){
  const n = String(name||"").trim().toLowerCase();
  if (!n) return false;
  if (host && host.name.toLowerCase() === n) return true;
  const all = [...state.green, ...state.orange].filter(Boolean);
  return all.some(p => p.name.toLowerCase() === n);
}

io.on("connection", (socket) => {
  socket.emit("state", { state, counts: counts(), maxPerTeam: MAX_PER_TEAM, host });

  // لاعب يدخل فريق
  socket.on("join", ({ name, team }, cb) => {
    name = String(name || "").trim();
    team = team === "green" ? "green" : team === "orange" ? "orange" : "";

    if (!name || !team) return cb?.({ ok:false, reason:"INVALID" });
    if (nameExists(name)) return cb?.({ ok:false, reason:"DUPLICATE_NAME" });

    // إذا كان نفس السوكيت هوست، نطلعه من الهوست (عشان ما يصير هوست + لاعب بنفس الوقت)
    if (host?.id === socket.id) host = null;

    // شيل دخوله السابق
    const existing = findPlayerById(socket.id);
    if (existing) state[existing.team][existing.idx] = null;

    const freeIdx = state[team].findIndex(x => x === null);
    if (freeIdx === -1) return cb?.({ ok:false, reason:"TEAM_FULL" });

    state[team][freeIdx] = { id: socket.id, name };
    broadcast();
    cb?.({ ok:true });
  });

  // هوست واحد فقط (بدون رمز)
  socket.on("host_join", ({ name }, cb) => {
    name = String(name || "").trim();
    if (!name) return cb?.({ ok:false, reason:"INVALID" });
    if (nameExists(name)) return cb?.({ ok:false, reason:"DUPLICATE_NAME" });

    // لو فيه هوست موجود ومش نفس السوكيت → رفض
    if (host && host.id !== socket.id) return cb?.({ ok:false, reason:"HOST_TAKEN" });

    // شيله من الفرق لو كان لاعب
    const existing = findPlayerById(socket.id);
    if (existing) state[existing.team][existing.idx] = null;

    host = { id: socket.id, name };
    broadcast();
    cb?.({ ok:true });
  });

  socket.on("host_leave", () => {
    if (host?.id === socket.id){
      host = null;
      broadcast();
    }
  });

  // BUZZ
  socket.on("buzz", (cb) => {
    const me = findPlayerById(socket.id);
    if (!me) return cb?.({ ok:false, reason:"NOT_JOINED" });

    if (state.locked) return cb?.({ ok:true, winner:false });

    state.winner = { id: me.player.id, name: me.player.name, team: me.team };
    state.locked = true;
    broadcast();
    cb?.({ ok:true, winner:true });
  });

  // Reset (هوست فقط)
  socket.on("reset", (cb) => {
    if (!host || host.id !== socket.id) return cb?.({ ok:false, reason:"NOT_HOST" });
    state.winner = null;
    state.locked = false;
    broadcast();
    cb?.({ ok:true });
  });

  // Clear (هوست فقط) - يمسح اللاعبين فقط ويخلي الهوست موجود
  socket.on("clear", (cb) => {
    if (!host || host.id !== socket.id) return cb?.({ ok:false, reason:"NOT_HOST" });
    state = freshState();
    broadcast();
    cb?.({ ok:true });
  });

  socket.on("leave", () => {
    const me = findPlayerById(socket.id);
    if (me){
      if (state.winner?.id === socket.id){
        state.winner = null;
        state.locked = false;
      }
      state[me.team][me.idx] = null;
    }
    if (host?.id === socket.id) host = null;
    broadcast();
  });

  socket.on("disconnect", () => {
    const me = findPlayerById(socket.id);
    if (me){
      if (state.winner?.id === socket.id){
        state.winner = null;
        state.locked = false;
      }
      state[me.team][me.idx] = null;
    }
    if (host?.id === socket.id) host = null;
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Running on port", PORT));
