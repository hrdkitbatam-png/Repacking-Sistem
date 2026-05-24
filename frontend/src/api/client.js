import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export const API_BASE_URL = baseURL;

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  headers: { Accept: "application/json" },
  timeout: 120_000,
});

// Tolak response yang bukan JSON (mis. HTML error page) agar caller dapat
// pesan error yang jelas alih-alih nilai "string" yang nanti crash di `.map`.
api.interceptors.response.use(
  (res) => {
    const ct = String(res.headers?.["content-type"] || "").toLowerCase();
    if (ct && !ct.includes("application/json") && !ct.includes("text/json")) {
      // eslint-disable-next-line no-console
      console.error(
        "[api] Response non-JSON dari",
        res.config?.url,
        "→ content-type:",
        ct,
        "body:",
        typeof res.data === "string" ? res.data.slice(0, 200) : res.data,
      );
      return Promise.reject(
        new Error(
          `Backend mengembalikan ${ct || "respons non-JSON"} untuk ${
            res.config?.url || "request"
          }. Pastikan Laravel jalan di ${baseURL}.`,
        ),
      );
    }
    return res;
  },
  (err) => {
    // eslint-disable-next-line no-console
    console.error("[api] request error:", err?.message || err);
    return Promise.reject(err);
  },
);

export async function listVideos({ search = "", page = 1, perPage = 25 } = {}) {
  const { data } = await api.get("/packing-videos", {
    params: { search, page, per_page: perPage },
  });
  return data;
}

export async function getVideoByOrder(orderId) {
  const { data } = await api.get(
    `/packing-videos/by-order/${encodeURIComponent(orderId)}`,
  );
  return data;
}

export async function uploadVideo({ orderId, packerCode, blob, recordedAt, labelBlob }) {
  const form = new FormData();
  form.append("order_id", orderId);
  if (packerCode) form.append("packer_code", packerCode);
  if (recordedAt) form.append("recorded_at", recordedAt);

  const filename = `${orderId}-${Date.now()}.${
    blob.type.includes("mp4") ? "mp4" : "webm"
  }`;
  form.append("video", blob, filename);

  // Label photo from second webcam
  if (labelBlob && labelBlob.size > 0) {
    form.append("label_photo", labelBlob, `${orderId}-label.jpg`);
  }

  const { data } = await api.post("/packing-videos", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listPackers() {
  const { data } = await api.get("/packers");
  return data;
}
