const socket = io();

let myName = "";
let myTeam = "";
let selectedTeam = "";
let hostKey = "";

function $(id){ return document.getElementById(id); }

function updateEnterBtn(){
  const ok = selectedTeam && $("name-input").value.trim();
  const btnEnter = $("btn-enter");
  btnEnter.style.display = ok ? "block" : "none";
  btnEnter.className = "btn-enter" + (selectedTeam ? " "+selectedTeam : "");
}

function setTeamUI(t){
  selectedTeam = t;
  $("btn-green").className  = "team-btn" + (t==="green" ? " selected-green" : "");
  $("btn-orange").className = "team-btn" + (t==="orange"? " selected-orange": "");
  updateEnterBtn();
}

// Make it callable from HTML onclick
window.selectTeam = setTeamUI;

$("name-input").addEventListener("input", updateEnterBtn);
$("name-input").addEventListener("keydown", e => { if(e.key==="Enter") window.enterGame(); });

window.enterGame = function enterGame(){
  const name = $("name-input").value.trim();
  if (!name || !selectedTeam) return;

  socket.emit("join", { name, team: selectedTeam }, (res) => {
    if(!res?.ok){
      if(res.reason === "TEAM_FULL") return alert("الفريق ممتلئ! اختر فريق ثاني");
      if(res.reason === "DUPLICATE_NAME") return alert("هذا الاسم مستخدم. غيّريه.");
      return alert("ادخال غير صحيح");
    }

    myName = name;
    myTeam = selectedTeam;

    const badge = $("my-badge");
    badge.textContent = (myTeam==="green"?"🟢":"🟠") + " " + myName;
    badge.className = "my-badge " + myTeam;

    $("welcome-page").classList.remove("active");
    $("game-page").classList.add("active");
  });
};

function renderTeam(team, s){
  const container = $(team+"-slots");
  container.innerHTML = "";

  for(let i=0;i<5;i++){
    const p = s[team][i]; // {id,name} أو null
    const isWinner = !!(s.winner && p && s.winner.id === p.id);
    const isMine   = !!(p && p.name === myName && team === myTeam);

    const wrap = document.createElement("div");
    wrap.className = "buzz-wrap";

    const btn = document.createElement("button");
    btn.className = "buzz-btn " + team + (isWinner ? " winner" : "");

    if (!p){
      btn.disabled = true;
      btn.textContent = "";
      btn.style.opacity = "0.1";
    } else {
      btn.textContent = "BUZZ";
      if (isWinner){
        btn.disabled = true;
      } else if (s.locked){
        btn.disabled = true;
      } else if (isMine){
        btn.disabled = false;
        btn.onclick = () => socket.emit("buzz");
      } else {
        btn.disabled = true;
      }
    }

    const nameEl = document.createElement("div");
    if(!p){
      nameEl.className = "slot-name empty";
      nameEl.textContent = "— فارغ —";
    } else {
      nameEl.className = "slot-name " + team;
      nameEl.textContent = p.name;
    }

    wrap.appendChild(btn);
    wrap.appendChild(nameEl);
    container.appendChild(wrap);
  }
}

function renderState(payload){
  const s = payload.state;

  $("green-count").textContent  = payload.counts.green + "/5";
  $("orange-count").textContent = payload.counts.orange + "/5";

  const banner = $("winner-banner");
  if (s.winner){
    banner.className = s.winner.team;
    banner.style.display = "block";
    $("banner-name").textContent = "🏆 " + s.winner.name;
    $("banner-team").textContent = s.winner.team==="green" ? "🟢 الفريق الأخضر" : "🟠 الفريق البرتقالي";
  } else {
    banner.className = "";
    banner.style.display = "none";
  }

  renderTeam("green", s);
  renderTeam("orange", s);
}

socket.on("state", (payload) => {
  renderState(payload);
  updateEnterBtn();
});

// Host controls
window.resetBuzzers = function(){
  if(!hostKey) hostKey = prompt("Host Key؟") || "";
  socket.emit("reset", { key: hostKey }, (res) => {
    if(!res?.ok) alert("مفتاح الهوست غلط");
  });
};

window.clearAll = function(){
  if(!hostKey) hostKey = prompt("Host Key؟") || "";
  if(!confirm("تأكيد: مسح جميع اللاعبين؟")) return;
  socket.emit("clear", { key: hostKey }, (res) => {
    if(!res?.ok) alert("مفتاح الهوست غلط");
  });
};

window.goBack = function(){
  socket.emit("leave");
  myName = ""; myTeam = ""; selectedTeam = "";
  $("name-input").value = "";
  $("btn-enter").style.display = "none";
  $("btn-green").className = "team-btn";
  $("btn-orange").className = "team-btn";

  $("game-page").classList.remove("active");
  $("welcome-page").classList.add("active");
};
