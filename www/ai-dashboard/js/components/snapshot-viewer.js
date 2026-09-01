import { friendlyName, escapeHtml } from '../utils.js';

// Clip history viewer: 10s mp4 clips (plus legacy jpg stills) archived by the
// ring_snapshot_archive_* automations, listed by GET /ai-dashboard/api/snapshots.
export const snapshotHistory = { key: null, entityId: null, files: [], idx: 0, loading: false };

function snapshotTsLabel(file) {
  // "2026-08-26_14-32-05.mp4" -> "Aug 26, 2:32:05 PM" (filenames are local time)
  const m = file.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.(jpg|mp4)$/);
  if (!m) return file;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export async function openSnapshotHistory(key, entityId) {
  snapshotHistory.key = key;
  snapshotHistory.entityId = entityId;
  snapshotHistory.idx = 0;
  snapshotHistory.loading = true;
  renderSnapshotHistory();
  try {
    const resp = await fetch(`/ai-dashboard/api/snapshots?camera=${encodeURIComponent(key)}`);
    const data = await resp.json();
    if (snapshotHistory.key !== key) return; // closed or switched meanwhile
    snapshotHistory.files = (data.snapshots || []).map(s => s.file);
  } catch (e) {
    snapshotHistory.files = [];
  }
  snapshotHistory.loading = false;
  renderSnapshotHistory();
}

export function closeSnapshotHistory() {
  snapshotHistory.key = null;
  renderSnapshotHistory();
}

export function stepSnapshotHistory(delta) {
  const n = snapshotHistory.files.length;
  if (!n) return;
  snapshotHistory.idx = (snapshotHistory.idx + delta + n) % n;
  renderSnapshotHistory();
}

export function snapshotHistoryKeydown(ev) {
  if (!snapshotHistory.key) return;
  if (ev.key === "Escape") closeSnapshotHistory();
  else if (ev.key === "ArrowLeft") stepSnapshotHistory(-1);   // older
  else if (ev.key === "ArrowRight") stepSnapshotHistory(1);   // newer
}
document.addEventListener("keydown", snapshotHistoryKeydown);

export function renderSnapshotHistory() {
  let el = document.getElementById("snapshot-history-overlay");
  if (!snapshotHistory.key) {
    if (el) el.remove();
    return;
  }
  const name = friendlyName(snapshotHistory.entityId || "");
  const n = snapshotHistory.files.length;
  const file = n ? snapshotHistory.files[snapshotHistory.idx] : null;
  const mediaUrl = file ? `/ai-dashboard/snapshots/${encodeURIComponent(snapshotHistory.key)}/${encodeURIComponent(file)}` : "";
  // mp4 = 10s clip from the ring-mqtt RTSP feed; jpg = legacy event still
  const media = file && file.endsWith(".mp4")
    ? `<video src="${mediaUrl}" class="snapshot-modal-media" controls autoplay muted loop playsinline></video>`
    : `<img src="${mediaUrl}" class="snapshot-modal-media snapshot-modal-still" alt="">`;
  const body = snapshotHistory.loading
    ? `<div class="snapshot-modal-empty">LOADING…</div>`
    : !n
      ? `<div class="snapshot-modal-empty">NO CLIPS YET — saved on the next motion/ding event</div>`
      : `${media}
         <div class="snapshot-modal-ts">${escapeHtml(snapshotTsLabel(file))} <span class="snapshot-modal-count">· ${snapshotHistory.idx + 1} / ${n}</span></div>`;
  const nav = n > 1
    ? `<div class="snapshot-modal-nav">
         <button class="bottom-btn" onclick="stepSnapshotHistory(-1)">◀ OLDER</button>
         <button class="bottom-btn" onclick="stepSnapshotHistory(1)">NEWER ▶</button>
       </div>`
    : "";
  const html = `<div class="modal-backdrop snapshot-modal-backdrop" onclick="closeSnapshotHistory()">
    <div class="snapshot-modal-panel" onclick="event.stopPropagation()">
      <div class="snapshot-modal-header">
        <span>⌂ ${escapeHtml(name)} — EVENT HISTORY</span>
        <span class="modal-close" onclick="closeSnapshotHistory()">[ CLOSE ✕ ]</span>
      </div>
      ${body}
      ${nav}
    </div>
  </div>`;
  if (!el) {
    el = document.createElement("div");
    el.id = "snapshot-history-overlay";
    document.body.appendChild(el);
  }
  el.innerHTML = html;
}
