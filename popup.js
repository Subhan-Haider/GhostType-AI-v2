const STORAGE_KEYS = ["wpm", "accuracy", "loop", "para1", "enable1", "theme", "delay_between", "openrouter_key", "hf_key", "textsynth_key", "ai_provider", "onboarding_complete"];
const DEFAULT_SETTINGS = {
  wpm: 200,
  accuracy: 95,
  loop: false,
  para1: "",
  enable1: true,
  delay_between: 1000,
  openrouter_key: "",
  hf_key: "",
  textsynth_key: "",
  ai_provider: "openrouter",
  onboarding_complete: false
};

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  const s = await chrome.storage.local.get(STORAGE_KEYS);

  // Load settings into UI
  document.getElementById("wpm").value = s.wpm || DEFAULT_SETTINGS.wpm;
  document.getElementById("accuracy").value = s.accuracy || DEFAULT_SETTINGS.accuracy;
  document.getElementById("loop").checked = s.loop || DEFAULT_SETTINGS.loop;
  document.getElementById("para1").value = s.para1 || DEFAULT_SETTINGS.para1;
  document.getElementById("delay_between").value = s.delay_between || DEFAULT_SETTINGS.delay_between;

  updateCharCount(1);
  updateEngineBadge(s.ai_provider || DEFAULT_SETTINGS.ai_provider);

  // Onboarding Logic
  if (!s.onboarding_complete) {
    document.getElementById("onboarding").style.display = "flex";
  } else {
    document.getElementById("onboarding").style.display = "none";
  }

  // Apply theme
  const isLight = s.theme === 'light';
  if (isLight) {
    document.body.classList.add('light-mode');
  }
  document.getElementById("theme-checkbox").checked = isLight;

  // Check if typing is active (status check)
  checkTypingStatus();
  checkProgress();
});

// Theme Toggle
document.getElementById("theme-checkbox").addEventListener("change", async (e) => {
  const isLight = e.target.checked;
  document.body.classList.toggle("light-mode", isLight);
  await chrome.storage.local.set({ theme: isLight ? "light" : "dark" });
});

// --- New Onboarding & Connection Logic ---
const switchView = (id) => {
  document.querySelectorAll('.onboarding-view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};

document.getElementById("use-builtin").addEventListener("click", async () => {
  await chrome.storage.local.set({ 
    ai_provider: "openrouter",
    onboarding_complete: true 
  });
  document.getElementById("onboarding").style.display = "none";
  showToast("🚀 Using Built-in AI Engine.");
});

document.getElementById("use-custom").addEventListener("click", () => {
  switchView('view-custom');
});

document.querySelectorAll(".provider-option").forEach(opt => {
  opt.addEventListener("click", () => {
    document.querySelectorAll(".provider-option").forEach(o => {
        o.classList.remove('selected');
        o.querySelector('.provider-key-input').style.display = 'none';
    });
    opt.classList.add('selected');
    opt.querySelector('.provider-key-input').style.display = 'block';
    opt.querySelector('.provider-key-input').focus();
  });
});

document.getElementById("save-custom").addEventListener("click", async () => {
  const selected = document.querySelector(".provider-option.selected");
  if (!selected) return showToast("⚠️ Please select a provider.");
  
  const provider = selected.dataset.provider;
  const keyInput = selected.querySelector(".provider-key-input");
  const key = keyInput.value.trim();

  if (!key) return showToast("⚠️ Please enter an API key.");

  const updates = { 
    ai_provider: provider,
    onboarding_complete: true 
  };
  updates[`${provider}_key`] = key;
  
  await chrome.storage.local.set(updates);
  updateEngineBadge(provider);
  
  document.getElementById("onboarding").style.display = "none";
  showToast(`✅ Connected to ${provider.charAt(0).toUpperCase() + provider.slice(1)}!`);
});

document.querySelector(".back-to-initial").addEventListener("click", () => {
  switchView('view-initial');
});

document.getElementById("onboarding-reset").addEventListener("click", async () => {
  if (confirm("Reset all settings and clear API keys?")) {
    await chrome.storage.local.clear();
    location.reload();
  }
});

document.getElementById("close-onboarding").addEventListener("click", () => {
  document.getElementById("onboarding").style.display = "none";
});

document.getElementById("open-onboarding").addEventListener("click", () => {
  switchView('view-initial');
  document.getElementById("onboarding").style.display = "flex";
});

document.getElementById("engine-badge").addEventListener("click", () => {
  switchView('view-initial');
  document.getElementById("onboarding").style.display = "flex";
});

async function isStopRequested() {
    const data = await chrome.storage.local.get("typing_active");
    return data.typing_active === false;
}

// Settings Persistence
const autoSave = debounce(async () => {
  const settings = await getCurrentUISettings();
  await chrome.storage.local.set(settings);
  updateSaveStatus("✅ Auto-saved");
  checkProgress();
}, 1000);

function updateSaveStatus(text) {
  const status = document.getElementById("auto-save-status");
  if (status) {
    status.textContent = text;
    status.style.opacity = "1";
    setTimeout(() => { 
        status.style.opacity = "0.6"; 
        setTimeout(() => { status.textContent = "Settings automatically save"; }, 1000);
    }, 2000);
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Attach Auto-save to all inputs
["wpm", "accuracy", "loop", "delay_between", "para1"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", autoSave);
        el.addEventListener("change", autoSave);
    }
});
// Theme also needs to trigger it (already has its own though)
document.getElementById("theme-checkbox").addEventListener("change", autoSave);

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Reset all settings to default?")) return;
  await chrome.storage.local.clear();
  location.reload();
});

// Typing Engine Control
document.getElementById("start").addEventListener("click", () => initiateTyping(0));
document.getElementById("continue").addEventListener("click", async () => {
    const data = await chrome.storage.local.get("last_index");
    initiateTyping(data.last_index || 0);
});

async function initiateTyping(startIndex = 0) {
  const s = await getCurrentUISettings();
  
  if (startIndex === 0) {
      await chrome.storage.local.set({ last_para1: s.para1, last_index: 0 });
  }

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url) return showToast("❌ No active tab found.");

  if (isRestrictedUrl(tab.url)) {
    return showToast("⚠️ Restricted page. Navigate to a normal website.");
  }

  const startBtn = document.getElementById("start");
  const contBtn = document.getElementById("continue");
  const originalStartHtml = startBtn.innerHTML;
  const originalContHtml = contBtn ? contBtn.innerHTML : "";
  
  startBtn.disabled = true;
  if (contBtn) contBtn.disabled = true;

  try {
    const verb = startIndex > 0 ? "Resuming" : "Starting";
    setStatus(true, `⏳ ${verb}... Click inside a text field on page.`);
    await chrome.storage.local.set({ typing_active: true });

    // Target the correct button for the countdown feedback
    const activeBtn = (startIndex > 0 && contBtn) ? contBtn : startBtn;

    // Popup countdown to guide the user/reviewer
    for (let i = 3; i > 0; i--) {
      if (await isStopRequested()) {
          showToast("🛑 Cancelled.");
          return resetTypingUI();
      }
      activeBtn.innerHTML = `⏳ (${i}s)...`;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (await isStopRequested()) {
        showToast("🛑 Cancelled.");
        return resetTypingUI();
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: typingEngine,
      args: [s, startIndex]
    });

    function resetTypingUI() {
      startBtn.innerHTML = originalStartHtml;
      if (contBtn) contBtn.innerHTML = originalContHtml;
      startBtn.disabled = false;
      if (contBtn) contBtn.disabled = false;
      setStatus(false);
      checkProgress();
    }

    setStatus(true, "🚀 Status: Typing Active");
    // Only reset labels, keep buttons disabled while typing
    startBtn.innerHTML = originalStartHtml;
    if (contBtn) contBtn.innerHTML = originalContHtml;
  } catch (err) {
    showToast("❌ Error: " + err.message);
    startBtn.innerHTML = originalStartHtml;
    if (contBtn) contBtn.innerHTML = originalContHtml;
    startBtn.disabled = false;
    if (contBtn) contBtn.disabled = false;
    setStatus(false);
  }
}



document.getElementById("stop").addEventListener("click", async () => {
  await chrome.storage.local.set({ typing_active: false });
  setStatus(false, "Stopping...");
  
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => { window.autoTyperActive = false; }
    });
  } catch (err) { }
  
  setTimeout(() => {
    setStatus(false);
    checkProgress();
  }, 1000);
});



// Text Tools
// Text Tools - Explicit setup for Paragraph 1
const p1Input = document.getElementById("para1");
if (p1Input) {
  p1Input.addEventListener("input", () => updateCharCount(1));

  const clearBtn = document.getElementById("clear1");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      p1Input.value = "";
      updateCharCount(1);
    });
  }

  const aiFixBtn = document.getElementById("ai-fix1");
  if (aiFixBtn) {
    aiFixBtn.addEventListener("click", async () => {
      const text = p1Input.value;
      if (!text) return;
      const originalText = aiFixBtn.innerHTML;
      aiFixBtn.disabled = true;

      try {
        const fixed = await aiCorrectText(text, (status) => {
          aiFixBtn.innerHTML = `⏳ ${status}`;
        });
        
        if (fixed) {
            // Check if it actually did something or if it's identical
            if (fixed.toLowerCase().replace(/\s/g,'') !== text.toLowerCase().replace(/\s/g,'')) {
                p1Input.value = fixed;
                updateCharCount(1);
                p1Input.dispatchEvent(new Event('input', { bubbles: true }));
                showToast("🤖 AI Smart Fix applied!");
            } else {
                showToast("💡 AI says this text is already mostly correct.");
            }
        }
      } catch (e) {
        showToast("❌ AI Fix failed: " + e.message);
      } finally {
        aiFixBtn.innerHTML = originalText;
        aiFixBtn.disabled = false;
      }
    });
  }

  const collectBtn = document.getElementById("collect1");
  if (collectBtn) {
    collectBtn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return showToast("❌ No active tab.");
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: collectParagraph
        });
        if (results && results[0] && results[0].result) {
          p1Input.value = results[0].result;
          updateCharCount(1);
          showToast("📥 Text collected!");
        }
      } catch (err) {
        showToast("❌ Collection failed: " + err.message);
      }
    });
  }
}

function collectParagraph() {
  const ss = ['.word', '.letter', '.txt-word', '.screenBasic-letter', 'span[class*="char"]', '.dash-target > span'];
  let els = document.querySelectorAll(ss.join(', '));
  if (els.length === 0) {
    const cs = document.querySelectorAll('.typing-test, #typing-field, [role="textbox"], .input-zone');
    cs.forEach(c => { const spans = c.querySelectorAll('span'); if (spans.length > 0) els = spans; });
  }
  const arr = Array.from(els);
  const top = arr.filter(el => !arr.some(p => p !== el && p.contains(el)));
  let ws = [];
  let cur = "";
  top.forEach((el, i) => {
    let t = el.innerText.replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
    if (!t && el.textContent === " ") t = " ";
    if (el.classList.contains('word') || t.length > 1) {
      if (cur) { ws.push(cur); cur = ""; }
      ws.push(t);
    } else if (t.length === 1) {
      if (t === " ") {
        if (cur) { ws.push(cur); cur = ""; }
      } else {
        cur += t;
        const next = top[i + 1];
        if (!next || next.parentElement !== el.parentElement) { ws.push(cur); cur = ""; }
      }
    }
  });
  if (cur) ws.push(cur);
  return ws.join(' ').replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
}



async function aiCorrectText(text, onProgress, customPrompt) {
  const ghostHeuristic = (str) => {
    // Phase 1: Contextual space collapse (Handles 'C  a  n' -> 'Can')
    let res = str.replace(/([a-zA-Z])\s+(?=[a-zA-Z]\b)/g, '$1');
    // Phase 2: Double-tap spaces
    res = res.replace(/(\w)\s{2,}(\w)/g, '$1 $2');
    return res.trim();
  };

  const HIGH_FIDELITY_PROMPT = `TASK: Restore the following text to perfectly clean, human-readable English.
EXAMPLES OF FIXES:
- "H e l l o w o r l d" -> "Hello world"
- "thequickbrownfox" -> "the quick brown fox"
- "I  am  h e r e" -> "I am here"

RULES:
1. Fix all spacing (join split letters, separate joined words).
2. Fix capitalization if it's clearly broken.
3. Keep ALL original words. Do NOT add your own opinions or fluff.
4. Output ONLY the clean text. No metadata or introduction.

CORRUPTED TEXT:
${text}`;

  const ACTIVE_PROMPT = customPrompt || HIGH_FIDELITY_PROMPT;

  // Load current settings for keys and provider
  const s = await chrome.storage.local.get(STORAGE_KEYS);
  const aiProvider = s.ai_provider || "openrouter";
  const keys = {
    openrouter: s.openrouter_key || "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",
    huggingface: s.hf_key || "",
    textsynth: s.textsynth_key || ""
  };

  const layers = {
    native: async () => {
        if (onProgress) onProgress("Native AI...");
        try {
            if (window.ai && window.ai.assistant) {
                const assistant = await window.ai.assistant.create();
                const res = await assistant.prompt(ACTIVE_PROMPT);
                if (res && res.trim().length > text.length * 0.3) return res.trim();
            }
        } catch (e) { }
        return null;
    },
    textsynth: async () => {
        if (onProgress) onProgress("TextSynth...");
        try {
            const headers = { "Content-Type": "application/json" };
            if (keys.textsynth) headers["Authorization"] = `Bearer ${keys.textsynth}`;
            const r = await fetch("https://api.textsynth.com/v1/engines/llama2_7b/completions", {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ prompt: `Restore: ${text}\nFixed:`, max_tokens: 500, stop: ["Restore:"] })
            });
            if (r.ok) {
                const d = await r.json();
                const s = d.text.trim();
                if (s && s.length > text.length * 0.3) return s;
            }
        } catch (e) { }
        return null;
    },
    huggingface: async () => {
        if (onProgress) onProgress("HuggingFace...");
        try {
            const headers = { "Content-Type": "application/json" };
            if (keys.huggingface) headers["Authorization"] = `Bearer ${keys.huggingface}`;
            const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ inputs: `<s>[INST] Fix text corruption: ${text} [/INST]` })
            });
            if (r.ok) {
                const d = await r.json();
                const sArr = d[0]?.generated_text?.split('[/INST]');
                const s = sArr?.[sArr.length - 1]?.trim();
                if (s && s.length > text.length * 0.3) return s;
            }
        } catch (e) { }
        return null;
    },
    openrouter: async () => {
        const MODELS = [
            "google/gemini-2.0-flash-exp",
            "google/gemini-flash-1.5",
            "meta-llama/llama-3.1-8b-instruct",
            "mistralai/mistral-7b-instruct",
            "deepseek/deepseek-chat"
        ];
        for (const m of MODELS) {
            const variants = [m];
            if (!m.includes(":free")) variants.push(m + ":free");
            
            for (const variant of variants) {
                const modelName = variant.split('/')[1]?.split(':')[0] || 'AI';
                if (onProgress) onProgress(`${modelName}...`);
                try {
                    const reqBody = {
                        model: variant,
                        messages: [
                            { role: "user", content: ACTIVE_PROMPT }
                        ],
                        temperature: 0.1
                    };
                    
                    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: "POST",
                        headers: { 
                            "Authorization": `Bearer ${keys.openrouter}`, 
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://ghosttype.ai",
                            "X-Title": "GhostType"
                        },
                        body: JSON.stringify(reqBody)
                    });
                    
                    if (r.ok) {
                        const d = await r.json();
                        if (!d.choices || !d.choices[0]) continue;
                        const s = d.choices[0].message?.content?.trim();
                        if (s) return s;
                    } else if (r.status === 404) {
                        // Silent fail for 404 to try next variant/model
                        continue;
                    } else {
                        const err = await r.json();
                        const errMsg = JSON.stringify(err);
                        if (r.status === 401) throw new Error("Invalid API Key. Please check your connection.");
                        if (r.status === 402 || r.status === 403) throw new Error("Low Credits. Please top up your AI provider.");
                        console.error(`OpenRouter ${variant} fail:`, errMsg);
                    }
                } catch (e) { 
                    if (e.message.includes("Key") || e.message.includes("Credits")) throw e;
                    console.error(`Fetch error ${variant}:`, e); 
                }
            }
        }
        return null;
    }
  };

  const result = await layers[aiProvider]();
  if (result) return result;

  for (const provider of ["native", "openrouter", "huggingface", "textsynth"]) {
    if (provider === aiProvider) continue;
    const res = await layers[provider]();
    if (res) return res;
  }

  if (onProgress) onProgress("Ghost Engine...");
  return ghostHeuristic(text);
}

// UI Helpers
async function getCurrentUISettings() {
  const s = await chrome.storage.local.get(STORAGE_KEYS);
  return {
    wpm: parseInt(document.getElementById("wpm").value),
    accuracy: parseInt(document.getElementById("accuracy").value),
    loop: document.getElementById("loop").checked,
    para1: document.getElementById("para1").value,
    enable1: true,
    delay_between: parseInt(document.getElementById("delay_between").value),
    openrouter_key: s.openrouter_key || "",
    hf_key: s.hf_key || "",
    textsynth_key: s.textsynth_key || "",
    ai_provider: s.ai_provider || "openrouter",
    onboarding_complete: true
  };
}
function updateCharCount(num) {
  const t = document.getElementById(`para${num}`).value;
  document.getElementById(`count${num}`).textContent = `${t.length} chars`;
}
function showToast(m) { alert(m); }
function setStatus(a, text) {
  const b = document.getElementById("status-banner");
  const t = document.getElementById("status-text");
  if (!b || !t) return;
  b.style.display = a ? "flex" : "none";
  if (text) t.textContent = text;
}
function updateEngineBadge(provider) {
  const b = document.getElementById("engine-badge");
  if (!b) return;
  b.textContent = provider || "Built-in";
  b.style.background = provider && provider !== "openrouter" ? "var(--accent)" : "var(--success)";
}
async function checkTypingStatus() {
  let [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!t?.id) return;
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => window.autoTyperActive === true });
    if (r[0].result) setStatus(true);
  } catch (e) { }
}

async function checkProgress() {
    const d = await chrome.storage.local.get(["last_para1", "last_index", "para1"]);
    const banner = document.getElementById("resume-banner");
    if (!banner) return;

    // Normalized comparison: ignore whitespace at start/end
    const match = (d.last_para1 || "").trim() === (d.para1 || "").trim();
    
    if (d.last_index > 0 && match) {
        banner.style.display = "block";
    } else {
        banner.style.display = "none";
    }
}
function isRestrictedUrl(u) { return u.startsWith("chrome://") || u.startsWith("edge://") || u.startsWith("about:"); }

// --- THE ULTIMATE ENGINE (Universal Version) ---
function typingEngine(settings, startIndex = 0) {
  window.autoTyperActive = true;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const msPerChar = (() => {
    let b = 60 / (settings.wpm * 5);
    return b * 1000;
  })();

  function getDeepActive() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (el === document.body || !el) {
      const q = ['input:not([type="hidden"])', 'textarea', '[contenteditable="true"]', '#wordsInput', '.input-zone'];
      for (let s of q) { let f = document.querySelector(s); if (f && f.offsetParent !== null) return f; }
    }
    return el || document.body;
  }

  function setNativeValue(el, val) {
    try {
      const p = Object.getPrototypeOf(el);
      const s = Object.getOwnPropertyDescriptor(p, 'value')?.set;
      if (s) s.call(el, val); else el.value = val;
      return true;
    } catch (e) { el.value = val; return true; }
  }

  async function simulateTyping(el, char, nitro) {
    if (!el) return;
    el.focus();
    const isS = char === " ";
    const isE = char === "\n";
    const kc = isS ? 32 : (isE ? 13 : char.charCodeAt(0));
    const opts = { key: isS ? " " : (isE ? "Enter" : char), code: isS ? "Space" : (isE ? "Enter" : `Key${char.toUpperCase()}`), keyCode: kc, which: kc, bubbles: true, cancelable: true, composed: true, view: window };

    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', { ...opts, charCode: kc }));

    let inserted = false;
    if (typeof document.execCommand === 'function') {
      inserted = document.execCommand("insertText", false, char);
    }
    if (!inserted && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      const s = el.selectionStart, v = el.value || "";
      const nv = v.slice(0, s) + char + v.slice(el.selectionEnd);
      setNativeValue(el, nv);
      el.selectionStart = el.selectionEnd = s + 1;
    }

    el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true, composed: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));

    if (isS || isE) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (!nitro) await sleep(15);
    }
  }

  async function simulateBackspace(el) {
    if (!el) return;
    el.focus();
    const opts = { key: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true, composed: true, view: window };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    if (!document.execCommand("delete")) {
      const s = el.selectionStart;
      if (s > 0) { const v = el.value || ""; setNativeValue(el, v.slice(0, s - 1) + v.slice(s)); el.selectionStart = el.selectionEnd = s - 1; }
    }
    el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, composed: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  async function typeText(text, accuracy) {
    if (!text) return;
    const nitro = settings.wpm > 300;
    const start = performance.now();
    let typed = startIndex;
    const remainingText = text.slice(startIndex);

    for (let char of remainingText) {
      if (!window.autoTyperActive) break;
      
      let el = getDeepActive();
      // SECURITY: If we're not in a real focusable element, don't overwhelm storage/CPU
      if (!el || (el === document.body && !el.isContentEditable)) {
          await sleep(500); 
          continue; 
      }

      // Storage check - reduced frequency to avoid lag/queue congestion
      if (typed % 50 === 0) {
          const d = await chrome.storage.local.get("typing_active");
          if (d.typing_active === false) { window.autoTyperActive = false; break; }
      }

      if (!nitro && accuracy < 100 && Math.random() * 100 > accuracy && char !== " " && char !== "\n") {
        await simulateTyping(el, "a", false);
        await sleep(msPerChar);
        await simulateBackspace(el);
        await sleep(msPerChar / 2);
        el = getDeepActive();
      }

      await simulateTyping(el, char, nitro);
      typed++;
      // Persistent progress - throttled to 5 chars to avoid storage quota/race issues across frames
      if (typed % 5 === 0 || typed >= text.length) {
          await chrome.storage.local.set({ last_index: typed });
      }

      const target = start + (typed * msPerChar);
      const diff = target - performance.now();
      if (diff > 0) {
        if (nitro) {
          await sleep(diff);
        } else {
          let r = (Math.random() * 0.4) + 0.8;
          if ([".", "!", "?", ","].includes(char)) r *= 2.0;
          await sleep(diff * r);
        }
      }
    }
  }

  (async () => {
    // Note: Delay handles by popup now, but keeping a short safety window
    await sleep(200);
    do {
      if (settings.enable1 && settings.para1) {
        await typeText(settings.para1, settings.accuracy);
        if (window.autoTyperActive) {
          const d = await chrome.storage.local.get("typing_active");
          if (d.typing_active === false) { window.autoTyperActive = false; break; }
          
          const ss = ['.word', '.letter', '.txt-word', '.screenBasic-letter', 'span[class*="char"]', '.dash-target > span'];
          let els = document.querySelectorAll(ss.join(', '));
          if (els.length > 0) {
            const arr = Array.from(els);
            const top = arr.filter(el => !arr.some(p => p !== el && p.contains(el)));
            let ws = []; let cur = "";
            top.forEach((el, i) => {
              let t = el.innerText.replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
              if (!t && el.textContent === " ") t = " ";
              if (el.classList.contains('word') || t.length > 1) {
                if (cur) { ws.push(cur); cur = ""; }
                ws.push(t);
              } else if (t.length === 1) {
                if (t === " ") { if (cur) { ws.push(cur); cur = ""; } }
                else {
                  cur += t;
                  const next = top[i + 1]; if (!next || next.parentElement !== el.parentElement) { ws.push(cur); cur = ""; }
                }
              }
            });
            if (cur) ws.push(cur);
            const newText = ws.join(' ').replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
            if (newText && newText !== settings.para1) { settings.para1 = newText; continue; }
          }
        }
      }
      if (settings.loop && window.autoTyperActive) {
          // Reset index for loop
          await chrome.storage.local.set({ last_index: 0 });
          await sleep(2000);
      } else break;
    } while (window.autoTyperActive);
    
    window.autoTyperActive = false;
    
    // Only reset if we actually finished everything
    const currentPara = settings.para1 || "";
    if (typed >= currentPara.length) {
        await chrome.storage.local.set({ last_index: 0 });
    }
  })();
}


