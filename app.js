(() => {
const $ = (id) => document.getElementById(id);
const state = {
  active: false, busy: false, messages: [], history: [],
  recognition: null, shouldListen: false, currentUtterance: null
};
const startBtn = $("startBtn"), endBtn = $("endBtn"), sendBtn = $("sendBtn");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function setState(name, headline, subline) {
  $("stateText").textContent = name;
  $("headline").textContent = headline;
  $("subline").textContent = subline;
  $("stateBadge").className = "state-badge" + (["Listening","Thinking","Speaking"].includes(name) ? " live" : "");
  $("orb").classList.toggle("active", ["Listening","Thinking","Speaking"].includes(name));
  $("wave").classList.toggle("active", ["Listening","Speaking"].includes(name));
}
function renderTranscript() {
  const root = $("transcript");
  $("transcriptCount").textContent = `${state.messages.length} message${state.messages.length===1?"":"s"}`;
  if (!state.messages.length) {
    root.className = "transcript empty";
    root.innerHTML = '<div class="empty-icon">◌</div><p>Your conversation will appear here.</p>';
    return;
  }
  root.className = "transcript";
  root.innerHTML = state.messages.map(m => `
    <div class="message ${m.role}">
      <div class="msg-avatar">${m.role === "user" ? "YOU" : "✦"}</div>
      <div class="msg-content">
        <div class="msg-meta">${m.role === "user" ? "Customer" : "Aria"} · ${escapeHtml(m.time)}</div>
        <div class="msg-text">${escapeHtml(m.content)}</div>
      </div>
    </div>`).join("");
  root.scrollTop = root.scrollHeight;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function addMessage(role, content) {
  state.messages.push({role, content, time: new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})});
  renderTranscript();
}
function speak(text) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    state.currentUtterance = utterance;
    const voices = speechSynthesis.getVoices();
    const indian = voices.find(v => /en-IN/i.test(v.lang)) || voices.find(v => /India/i.test(v.name));
    if (indian) utterance.voice = indian;
    utterance.lang = indian?.lang || "en-IN";
    utterance.rate = 1.0; utterance.pitch = 1.02;
    utterance.onstart = () => setState("Speaking", "Aria is speaking", "You can listen to the response.");
    utterance.onend = () => { state.currentUtterance = null; resolve(); };
    utterance.onerror = () => { state.currentUtterance = null; resolve(); };
    speechSynthesis.speak(utterance);
  });
}
async function sendMessage(rawText) {
  const message = rawText.trim();
  if (!message || state.busy) return;
  if (!state.active) startCall(false);
  $("typedInput").value = "";
  state.busy = true;
  addMessage("user", message);
  setState("Thinking", "Aria is thinking", "Checking your question and relevant policies.");
  try {
    const history = state.history.slice(-10);
    const res = await fetch("/api/chat", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message, history})
    });
    if (res.status === 401) {
      window.location.assign("/login?next=%2F");
      return;
    }
    if (!res.ok) throw new Error("The support service returned an error.");
    const data = await res.json();
    addMessage("assistant", data.reply || "I'm sorry, could you please repeat that?");
    state.history.push({role:"user",content:message},{role:"assistant",content:data.reply || ""});
    await speak(data.reply || "I'm sorry, could you please repeat that?");
  } catch (err) {
    const reply = "I'm sorry, I couldn't reach the support service. Please try again.";
    addMessage("assistant", reply);
    await speak(reply);
  } finally {
    state.busy = false;
    if (state.active && state.shouldListen && state.recognition) {
      setState("Listening", "I'm listening", "Go ahead, I'm here to help.");
      try { state.recognition.start(); } catch(e) {}
    } else if (state.active) {
      setState("Call active", "Ready for your next question", "You can speak again or type a message.");
    }
  }
}
function setupRecognition() {
  if (!SpeechRecognition) return false;
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = true;
  let finalText = "";
  recognition.onstart = () => {
    if (state.active && !state.busy) setState("Listening", "I'm listening", "Speak naturally. I'll respond when you finish.");
  };
  recognition.onresult = (event) => {
    let interim = "";
    for (let i=event.resultIndex; i<event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    if (interim) $("subline").textContent = `I heard: “${interim}”`;
    if (finalText.trim()) {
      const text = finalText.trim(); finalText = "";
      state.shouldListen = true;
      sendMessage(text);
    }
  };
  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      state.shouldListen = false;
      setState("Mic blocked", "Microphone permission needed", "Allow microphone access in your browser, or use the text box below.");
    } else if (event.error === "no-speech" && state.active) {
      addMessage("assistant", "I couldn't hear that clearly. Please repeat your question or type it below.");
      $("subline").textContent = "I couldn't hear that clearly. Please repeat or type your question.";
    } else if (state.active && event.error !== "aborted") {
      $("subline").textContent = "I couldn't hear that clearly. Please repeat or type your question.";
    }
  };
  recognition.onend = () => {
    if (state.active && state.shouldListen && !state.busy && !speechSynthesis.speaking) {
      setTimeout(() => { try { recognition.start(); } catch(e) {} }, 250);
    }
  };
  state.recognition = recognition;
  return true;
}
function startCall(withMic = true) {
  if (state.active) return;
  state.active = true;
  state.shouldListen = withMic;
  state.messages = []; state.history = [];
  renderTranscript();
  startBtn.disabled = true; endBtn.disabled = false;
  if (withMic && !state.recognition) setupRecognition();
  if (withMic && !state.recognition) {
    state.shouldListen = false;
    setState("Text mode", "Voice recognition unavailable", "Your browser doesn't support speech recognition. Please type a message below.");
  } else if (withMic) {
    setState("Listening", "I'm listening", "Ask a question about an Aura Skincare order.");
    try { state.recognition.start(); } catch(e) {}
  } else {
    state.shouldListen = false;
    setState("Call active", "Ready for your question", "Use the text box or press Start Call to enable the microphone.");
  }
}
function endCall() {
  if (!state.active) return;
  state.active = false; state.shouldListen = false;
  try { state.recognition?.stop(); } catch(e) {}
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  startBtn.disabled = false; endBtn.disabled = true;
  setState("Call ended", "Thank you for calling Aura", "Your call transcript remains available above.");
}
startBtn.addEventListener("click", () => startCall(true));
endBtn.addEventListener("click", endCall);
sendBtn.addEventListener("click", () => sendMessage($("typedInput").value));
$("typedInput").addEventListener("keydown", e => { if (e.key === "Enter") sendMessage($("typedInput").value); });
document.querySelectorAll(".try-btn").forEach(btn => btn.addEventListener("click", () => {
  if (!state.active) startCall(false);
  $("typedInput").value = btn.dataset.question;
  sendMessage(btn.dataset.question);
}));
setState("Ready", "Ready when you are", "Start a call and ask your question out loud.");
if (!SpeechRecognition) {
  $("subline").textContent = "Voice recognition may not be supported in this browser. Typed testing is also available.";
}
})();
