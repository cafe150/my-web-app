// Step 6: localStorageによる状態保存・復元
const KEY = "relation_map_state";

export const initialState = () => ({
  user: { name: "自分", tags: [] },
  target: { name: "相手", tags: [] },
  updatedAt: null,
});

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(KEY);
}
