import { resolveYouTubeVideo } from "../src/lib/gmax/youtube.server";

type Req = { method?: string; body?: { title?: string; artist?: string } };
type Res = {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => Res;
  json: (v: unknown) => void;
  end: () => void;
};

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const title = String(req.body?.title ?? "").trim();
  const artist = String(req.body?.artist ?? "").trim();
  if (!title) return res.status(200).json({ videoId: null });

  const videoId = await resolveYouTubeVideo(title, artist);
  return res.status(200).json({ videoId });
}
