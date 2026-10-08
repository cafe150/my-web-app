// エントリポイント：Step 6 付加機能の実装とブラッシュアップ
import { loadState, saveState, clearState, initialState } from "./storage.js";
import { findCommonTags, findSynergies, calcSyncScore } from "./logic.js";
import { buildGraphData, renderGraph } from "./graph.js";
import { searchTags } from "./suggest.js";
import { getCommonTagHint, getSynergyHint, getPersonHint, getDefaultHint } from "./hints.js";

const PEOPLE = ["user", "target"];
const DEFAULT_NAMES = { user: "自分", target: "相手" };
const MAX_TAG_LENGTH = 30;

// localStorageから前回の作業状態を自動復元
let state = loadState();
let dictionary = [];
const renderedTags = { user: new Set(), target: new Set() }; // 新規チップ判定用

const $ = (id) => document.getElementById(id);

async function loadDictionary() {
  try {
    const res = await fetch("./data/tags.json");
    if (res.ok) {
      dictionary = await res.json();
    }
  } catch (err) {
    console.warn("辞書の読み込みに失敗しました:", err);
  }
}

/* ---------- 状態操作 ---------- */

function addTag(person, raw) {
  const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
  if (!tag) return false;
  if (state[person].tags.includes(tag)) {
    flashDuplicate(person, tag);
    return false;
  }
  state[person].tags.push(tag);
  update();
  return true;
}

function removeTag(person, tag) {
  const tags = state[person].tags;
  const idx = tags.indexOf(tag);
  if (idx === -1) return;
  tags.splice(idx, 1);
  update();
}

function setName(person, raw) {
  state[person].name = raw.trim() || DEFAULT_NAMES[person];
  update();
}

/* ---------- 描画 & UI更新 ---------- */

function renderChips(person, commonSet) {
  const container = $(`${person}-chips`);
  container.replaceChildren();

  const tags = state[person].tags;
  if (tags.length === 0) {
    const empty = document.createElement("span");
    empty.className = "chip-placeholder";
    empty.textContent = "タグがまだありません";
    container.append(empty);
    renderedTags[person] = new Set();
    return;
  }

  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    if (commonSet.has(tag)) chip.classList.add("chip--common");
    if (!renderedTags[person].has(tag)) chip.classList.add("chip--new");
    chip.dataset.tag = tag;

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = tag;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn-remove";
    btn.dataset.tag = tag;
    btn.setAttribute("aria-label", `${tag} を削除`);
    btn.textContent = "×";

    chip.append(label, btn);
    container.append(chip);
  }
  renderedTags[person] = new Set(tags);
}

/** 重複タグ入力時、既存チップを一瞬光らせて知らせる */
function flashDuplicate(person, tag) {
  const chip = [...$(`${person}-chips`).querySelectorAll(".chip")].find((c) => c.dataset.tag === tag);
  if (!chip) return;
  chip.classList.remove("chip--flash");
  void chip.offsetWidth; // アニメーション再始動
  chip.classList.add("chip--flash");
}

/** トースト通知の表示 */
let toastTimeout = null;
function showToast(message, crest = "済") {
  const toast = $("toast");
  const toastText = $("toast-text");
  const toastCrest = toast?.querySelector(".toast-crest");
  if (!toast || !toastText) return;

  toastText.textContent = message;
  if (toastCrest) toastCrest.textContent = crest;
  toast.hidden = false;

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

/** 対話アシスト欄の更新 */
function setAssistHint(hint) {
  const signEl = $("assist-sign");
  const titleEl = $("assist-title");
  const textEl = $("assist-text");

  if (signEl && hint.sign) signEl.textContent = hint.sign;
  if (titleEl && hint.title) titleEl.textContent = hint.title;
  if (textEl && hint.body) {
    textEl.style.opacity = "0.4";
    setTimeout(() => {
      textEl.textContent = hint.body;
      textEl.style.opacity = "1";
    }, 120);
  }
}

/** 状態から共通点・シナジー・シンクロ率を再計算し、チップ・グラフ・localStorageを更新 */
function update() {
  const common = findCommonTags(state.user.tags, state.target.tags);
  const synergies = findSynergies(state.user.tags, state.target.tags, dictionary);
  const commonSet = new Set(common);

  // シンクロ率スコアのリアルタイム計算
  const totalUniqueTags = new Set([...state.user.tags, ...state.target.tags]).size;
  const syncScore = calcSyncScore(common.length, synergies.length, totalUniqueTags);
  const scoreEl = $("sync-score");
  if (scoreEl) {
    scoreEl.textContent = totalUniqueTags > 0 ? syncScore : "--";
  }

  // チップ描画
  PEOPLE.forEach((p) => renderChips(p, commonSet));

  // 自動保存
  saveState(state);

  // デフォルト対話ヒントの更新
  setAssistHint(getDefaultHint(common, synergies, syncScore));

  // グラフ再描画
  renderGraph($("graph"), buildGraphData(state, common, synergies), onGraphSelect);
}

/** グラフ要素クリックイベント（対話ヒントの表示連動） */
function onGraphSelect(params) {
  const selectedNodeId = params.nodes?.[0];
  const selectedEdgeId = params.edges?.[0];

  // 1. ノードがクリックされた場合
  if (selectedNodeId) {
    if (selectedNodeId === "user") {
      setAssistHint(getPersonHint(state.user.name, state.user.tags, true));
      return;
    }
    if (selectedNodeId === "target") {
      setAssistHint(getPersonHint(state.target.name, state.target.tags, false));
      return;
    }
    if (selectedNodeId.startsWith("common:")) {
      const tag = selectedNodeId.replace("common:", "");
      setAssistHint(getCommonTagHint(tag, dictionary));
      return;
    }
    if (selectedNodeId.startsWith("user:")) {
      const tag = selectedNodeId.replace("user:", "");
      setAssistHint({
        sign: "個別",
        title: `${state.user.name}さんのタグ「${tag}」`,
        body: `「${tag}」は${state.user.name}さんならではの個性です。相手にとっては新鮮な発見かもしれません。詳しく聞いてみましょう。`,
      });
      return;
    }
    if (selectedNodeId.startsWith("target:")) {
      const tag = selectedNodeId.replace("target:", "");
      setAssistHint({
        sign: "個別",
        title: `${state.target.name}さんのタグ「${tag}」`,
        body: `「${tag}」は${state.target.name}さんならではの個性です。普段どんな関わり方をしているか興味を持って質問してみましょう。`,
      });
      return;
    }
  }

  // 2. エッジがクリックされた場合
  if (selectedEdgeId) {
    // シナジー点線（syn:タグA|タグB）
    if (selectedEdgeId.startsWith("syn:")) {
      const pair = selectedEdgeId.replace("syn:", "").split("|");
      if (pair.length === 2) {
        setAssistHint(getSynergyHint(pair[0], pair[1]));
        return;
      }
    }
    // 共通点結合線（e:owner->common:タグ）
    if (selectedEdgeId.includes("common:")) {
      const tag = selectedEdgeId.split("common:")[1];
      if (tag) {
        setAssistHint(getCommonTagHint(tag, dictionary));
        return;
      }
    }
  }

  // 3. 背景クリック（選択解除時）
  const common = findCommonTags(state.user.tags, state.target.tags);
  const synergies = findSynergies(state.user.tags, state.target.tags, dictionary);
  const totalUniqueTags = new Set([...state.user.tags, ...state.target.tags]).size;
  const syncScore = calcSyncScore(common.length, synergies.length, totalUniqueTags);
  setAssistHint(getDefaultHint(common, synergies, syncScore));
}

/* ---------- サジェスト & イベント結線 ---------- */

function bindPerson(person) {
  const nameInput = $(`${person}-name`);
  const tagInput = $(`${person}-tag-input`);
  const chips = $(`${person}-chips`);
  const suggestList = $(`${person}-suggest`);

  let candidates = [];
  let selectedIndex = -1;

  nameInput.value = state[person].name;
  nameInput.addEventListener("input", () => setName(person, nameInput.value));

  const closeSuggest = () => {
    candidates = [];
    selectedIndex = -1;
    suggestList.hidden = true;
    suggestList.replaceChildren();
  };

  const renderSuggest = () => {
    if (candidates.length === 0) {
      closeSuggest();
      return;
    }
    suggestList.replaceChildren();

    candidates.forEach((cand, idx) => {
      const li = document.createElement("li");
      li.className = "suggest-item" + (idx === selectedIndex ? " is-selected" : "");
      li.dataset.name = cand.item.name;

      const nameSpan = document.createElement("span");
      nameSpan.className = "item-name";
      nameSpan.textContent = cand.item.name;

      const kwSpan = document.createElement("span");
      kwSpan.className = "item-keywords";
      const hint = cand.matchedKeyword || (cand.item.keywords ? cand.item.keywords.slice(0, 2).join(", ") : "");
      if (hint) {
        kwSpan.textContent = `(${hint})`;
      }

      li.append(nameSpan, kwSpan);
      suggestList.append(li);

      if (idx === selectedIndex) {
        li.scrollIntoView({ block: "nearest" });
      }
    });

    suggestList.hidden = false;
  };

  const handleSearch = () => {
    const raw = tagInput.value;
    if (!raw.trim()) {
      closeSuggest();
      return;
    }
    candidates = searchTags(raw, dictionary, state[person].tags, 8);
    selectedIndex = -1;
    renderSuggest();
  };

  tagInput.addEventListener("input", handleSearch);
  tagInput.addEventListener("focus", handleSearch);

  tagInput.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;

    if (e.key === "ArrowDown") {
      if (candidates.length > 0) {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % candidates.length;
        renderSuggest();
      }
    } else if (e.key === "ArrowUp") {
      if (candidates.length > 0) {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
        renderSuggest();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      let chosenTag = "";
      if (selectedIndex >= 0 && candidates[selectedIndex]) {
        chosenTag = candidates[selectedIndex].item.name;
      } else {
        chosenTag = tagInput.value.trim();
      }

      if (chosenTag && addTag(person, chosenTag)) {
        tagInput.value = "";
        closeSuggest();
      }
    } else if (e.key === "Escape") {
      closeSuggest();
    } else if (e.key === "Backspace" && tagInput.value === "") {
      const tags = state[person].tags;
      if (tags.length) removeTag(person, tags[tags.length - 1]);
    }
  });

  suggestList.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggest-item");
    if (!item) return;
    const tagName = item.dataset.name;
    if (tagName && addTag(person, tagName)) {
      tagInput.value = "";
      closeSuggest();
    }
  });

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip-btn-remove");
    if (btn) removeTag(person, btn.dataset.tag);
  });

  document.addEventListener("click", (e) => {
    if (!tagInput.contains(e.target) && !suggestList.contains(e.target)) {
      closeSuggest();
    }
  });
}

/* ---------- ヘッダー操作（保存・初期化） ---------- */

function bindHeaderActions() {
  const saveBtn = $("btn-save");
  const resetBtn = $("btn-reset");

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveState(state);
      showToast("ふたりの関係図を保存しました", "結");
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const ok = window.confirm("登録したタグとお名前をすべて初期化しますか？");
      if (!ok) return;

      clearState();
      state = initialState();
      PEOPLE.forEach((p) => {
        const nameInput = $(`${p}-name`);
        const tagInput = $(`${p}-tag-input`);
        if (nameInput) nameInput.value = state[p].name;
        if (tagInput) tagInput.value = "";
      });
      update();
      showToast("データを初期化しました", "白");
    });
  }
}

/* ---------- 初期化 ---------- */

(async function init() {
  await loadDictionary();
  PEOPLE.forEach(bindPerson);
  bindHeaderActions();
  update();
  console.log("RelationMap: 全機能の初期化完了");
})();
