// Step 2/3: グラフ描画（vis-network）
// 和モダン・工芸テイストの配色と力学モデルの設定

const FONT_FACE = "Shippori Mincho, serif";

// カラーパレット定義（和の伝統色）
export const GRAPH_THEME = {
  user: {
    background: "#2d516d", // 藍色
    border: "#1c364a",
    highlight: { background: "#396587", border: "#1c364a" },
    hover: { background: "#396587", border: "#1c364a" },
    font: { color: "#ffffff", face: FONT_FACE, size: 16 },
  },
  target: {
    background: "#6a4c74", // 藤紫色
    border: "#4b3452",
    highlight: { background: "#7e5b8a", border: "#4b3452" },
    hover: { background: "#7e5b8a", border: "#4b3452" },
    font: { color: "#ffffff", face: FONT_FACE, size: 16 },
  },
  common: {
    background: "#fdf5e2", // 和紙金地
    border: "#b5832c", // 山吹・金茶
    highlight: { background: "#faecc6", border: "#93671e" },
    hover: { background: "#faecc6", border: "#93671e" },
    font: { color: "#2b2b33", face: FONT_FACE, size: 14 },
  },
  uniqueUser: {
    background: "#f0f4f7", // 淡藍
    border: "#b8c9d4",
    highlight: { background: "#e3ecf2", border: "#2d516d" },
    hover: { background: "#e3ecf2", border: "#2d516d" },
    font: { color: "#2b2b33", face: FONT_FACE, size: 12 },
  },
  uniqueTarget: {
    background: "#f6f1f7", // 淡藤
    border: "#d0bfd4",
    highlight: { background: "#ede3ee", border: "#6a4c74" },
    hover: { background: "#ede3ee", border: "#6a4c74" },
    font: { color: "#2b2b33", face: FONT_FACE, size: 12 },
  },
  edges: {
    belonging: { color: { color: "rgba(43, 43, 51, 0.22)", highlight: "#2b2b33" }, width: 1.5 },
    common: { color: { color: "#b5832c", highlight: "#875f1a" }, width: 3.5 },
    synergy: { color: { color: "#2c6e54", highlight: "#1e523e" }, width: 2.5, dashes: [6, 4] },
  },
};

// ノードID（タグ名ベースで安定させ、追加・削除時に既存ノードの位置を保つ）
export const nodeId = {
  common: (tag) => `common:${tag}`,
  user: (tag) => `user:${tag}`,
  target: (tag) => `target:${tag}`,
};

function themeNode(theme) {
  const { font, ...color } = theme;
  return { color, font };
}

/**
 * logic.jsの結果（共通タグ・シナジー）と入力状態から
 * vis-network用 { nodes, edges } を構築する
 */
export function buildGraphData(state, commonTags = [], synergies = []) {
  const nodes = [];
  const edges = [];

  const commonSet = new Set(commonTags);
  const userUnique = [...new Set(state.user.tags)].filter((t) => !commonSet.has(t));
  const targetUnique = [...new Set(state.target.tags)].filter((t) => !commonSet.has(t));

  // 1. メインノード（自分=左 & 相手=右）
  nodes.push({
    id: "user",
    label: state.user.name || "自分",
    shape: "circle",
    margin: 14,
    x: -220,
    y: 0,
    ...themeNode(GRAPH_THEME.user),
    shadow: { enabled: true, color: "rgba(45, 81, 109, 0.25)", size: 8, x: 2, y: 3 },
    mass: 3,
    group: "person",
  });
  nodes.push({
    id: "target",
    label: state.target.name || "相手",
    shape: "circle",
    margin: 14,
    x: 220,
    y: 0,
    ...themeNode(GRAPH_THEME.target),
    shadow: { enabled: true, color: "rgba(106, 76, 116, 0.25)", size: 8, x: 2, y: 3 },
    mass: 3,
    group: "person",
  });

  // 2. 共通タグノード：中央上部に初期配置
  commonTags.forEach((tag, idx) => {
    const id = nodeId.common(tag);
    nodes.push({
      id,
      label: tag,
      shape: "box",
      shapeProperties: { borderRadius: 16 },
      margin: 10,
      borderWidth: 2,
      x: 0,
      y: -80 - idx * 40,
      ...themeNode(GRAPH_THEME.common),
      shadow: { enabled: true, color: "rgba(181, 131, 44, 0.2)", size: 6, x: 1, y: 2 },
      mass: 1.5,
      group: "common",
    });
    for (const owner of ["user", "target"]) {
      edges.push({
        id: `e:${owner}->${id}`,
        from: owner,
        to: id,
        ...GRAPH_THEME.edges.common,
        length: 120,
      });
    }
  });

  // 3. 固有タグノード（自分側は左、相手側は右に初期配置）
  const addUnique = (owner, tags, theme, baseX) => {
    tags.forEach((tag, idx) => {
      const id = nodeId[owner](tag);
      const offsetY = (idx - (tags.length - 1) / 2) * 50;
      nodes.push({
        id,
        label: tag,
        shape: "box",
        shapeProperties: { borderRadius: 12 },
        margin: 8,
        borderWidth: 1,
        x: baseX,
        y: offsetY,
        ...themeNode(theme),
        mass: 1,
        group: "unique",
      });
      edges.push({
        id: `e:${owner}->${id}`,
        from: owner,
        to: id,
        ...GRAPH_THEME.edges.belonging,
        length: 100,
      });
    });
  };
  addUnique("user", userUnique, GRAPH_THEME.uniqueUser, -340);
  addUnique("target", targetUnique, GRAPH_THEME.uniqueTarget, 340);

  // 4. シナジー線（相補関係の固有タグ同士を結ぶ点線）
  const userUniqueSet = new Set(userUnique);
  const targetUniqueSet = new Set(targetUnique);
  synergies.forEach((syn) => {
    if (!userUniqueSet.has(syn.user) || !targetUniqueSet.has(syn.target)) return;
    edges.push({
      id: `syn:${syn.user}|${syn.target}`,
      from: nodeId.user(syn.user),
      to: nodeId.target(syn.target),
      ...GRAPH_THEME.edges.synergy,
      label: "相補",
      font: { color: "#2c6e54", size: 11, face: FONT_FACE, background: "#faf8f5", strokeWidth: 0 },
      length: 150,
      smooth: { enabled: true, type: "curvedCW", roundness: 0.15 },
      synergy: syn,
    });
  });

  return { nodes, edges };
}

const NETWORK_OPTIONS = {
  physics: {
    enabled: true,
    solver: "forceAtlas2Based",
    forceAtlas2Based: {
      gravitationalConstant: -50,
      centralGravity: 0.012,
      springLength: 110,
      springConstant: 0.08,
      damping: 0.45,
      avoidOverlap: 0.8,
    },
    stabilization: { enabled: true, iterations: 150, updateInterval: 25 },
  },
  interaction: { hover: true, dragNodes: true, dragView: true, zoomView: true, selectable: true },
  nodes: { borderWidthSelected: 2 },
  edges: { smooth: { enabled: true, type: "continuous" } },
};

/** ズームアウト距離制限（マインドマップ全体が見える程度でストップし、極端に小さくならない下限倍率） */
export const MIN_ZOOM_SCALE = 0.55;

let network = null;
let nodesDS = null;
let edgesDS = null;

/** DataSetを差分更新（消えた要素だけ削除、残りは追加/更新）して既存ノードの位置を保つ */
function syncNodes(ds, items) {
  const nextIds = new Set(items.map((i) => i.id));
  const removeIds = ds.getIds().filter((id) => !nextIds.has(id));
  if (removeIds.length) ds.remove(removeIds);

  const updates = items.map((item) => {
    const existing = ds.get(item.id);
    if (existing && existing.x !== undefined && existing.y !== undefined) {
      // 既存ノードの位置（ドラッグや物理演算による現在地）を維持
      const { x, y, ...rest } = item;
      return rest;
    }
    return item;
  });
  ds.update(updates);
}

function syncEdges(ds, items) {
  const nextIds = new Set(items.map((i) => i.id));
  const removeIds = ds.getIds().filter((id) => !nextIds.has(id));
  if (removeIds.length) ds.remove(removeIds);
  ds.update(items);
}

/**
 * vis-network を初期化、または差分更新して描画する
 * @param {HTMLElement} container
 * @param {{ nodes: Array, edges: Array }} data
 * @param {Function} [onSelect] ノード/エッジ選択時のコールバック (params, { nodesDS, edgesDS })
 */
export function renderGraph(container, data, onSelect = null) {
  if (!container) return null;
  if (!window.vis?.Network) {
    console.warn("vis-network が読み込まれていません。");
    return null;
  }

  // タグが1つも無いときは案内メッセージを表示
  const placeholder = container.querySelector(".graph-placeholder-msg");
  if (placeholder) placeholder.style.display = data.nodes.length > 2 ? "none" : "flex";

  if (!network) {
    nodesDS = new window.vis.DataSet(data.nodes);
    edgesDS = new window.vis.DataSet(data.edges);
    network = new window.vis.Network(container, { nodes: nodesDS, edges: edgesDS }, NETWORK_OPTIONS);

    // ズームアウト距離制限（縮小のみMIN_ZOOM_SCALEで制限、拡大は無制限）
    let isClampingZoom = false;
    network.on("zoom", (params) => {
      if (isClampingZoom) return;
      if (params.scale < MIN_ZOOM_SCALE) {
        isClampingZoom = true;
        network.moveTo({
          scale: MIN_ZOOM_SCALE,
          animation: false,
        });
        isClampingZoom = false;
      }
    });

    // マウスホイールでのズームアウト制限（下限到達時にスムーズに停止）
    container.addEventListener(
      "wheel",
      (e) => {
        // e.deltaY > 0 はズームアウト（縮小）操作
        if (e.deltaY > 0 && network && network.getScale() <= MIN_ZOOM_SCALE + 0.001) {
          e.preventDefault();
          e.stopPropagation();
          if (network.getScale() < MIN_ZOOM_SCALE) {
            network.moveTo({ scale: MIN_ZOOM_SCALE, animation: false });
          }
        }
      },
      { capture: true, passive: false }
    );

    if (typeof onSelect === "function") {
      network.on("select", (params) => onSelect(params, { nodesDS, edgesDS }));
    }
    return network;
  }

  syncNodes(nodesDS, data.nodes);
  syncEdges(edgesDS, data.edges);
  return network;
}
