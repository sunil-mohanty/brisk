"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBox, Pill, toast } from "@/components/ui";
import { api, download } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { PLATFORMS, platform } from "@/lib/social";
import type { Campaign, CampaignPost, SocialProvider, SocialStatus } from "@/lib/types";

const FORMATS = [
  { id: "portrait", label: "Feed 4:5" },
  { id: "square", label: "Square" },
  { id: "story", label: "Story 9:16" },
] as const;

/** Post a campaign to the salon's Facebook Page, Instagram and YouTube channel in one go. */
export function SocialPost({ c }: { c: Campaign }) {
  const [st, setSt] = useState<SocialStatus | null>(null);
  const [posts, setPosts] = useState<CampaignPost[] | null>(null);
  const [pick, setPick] = useState<Set<SocialProvider>>(new Set());
  const [caption, setCaption] = useState(c.post_caption);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]["id"]>("portrait");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPosts = useCallback(async () => {
    const rows = await api.get<CampaignPost[]>(`/campaigns/${c.id}/posts`).catch(() => [] as CampaignPost[]);
    setPosts(rows);
    if (timer.current) clearTimeout(timer.current);
    if (rows.some((p) => p.status === "posting")) timer.current = setTimeout(loadPosts, 2500);
    return rows;
  }, [c.id]);

  useEffect(() => {
    api.get<SocialStatus>("/social").then((s) => {
      setSt(s);
      setPick(new Set(s.accounts.filter((a) => a.selected && !a.error).map((a) => a.provider)));
    }).catch(() => setSt({ meta_ready: false, google_ready: false, accounts: [] }));
    loadPosts();
    if (window.location.hash === "#post") setTimeout(() => document.getElementById("post")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [loadPosts]);
  useEffect(() => { setCaption(c.post_caption); }, [c.post_caption]);

  const account = (p: SocialProvider) => st?.accounts.find((a) => a.provider === p && a.selected);
  const live = c.active && !c.expired;
  const img = `/api/public/c/${c.token}/image/${fmt}.jpg?v=${c.image_version}`;
  const safe = c.title.replace(/[^A-Za-z0-9_-]+/g, "-");

  async function post() {
    if (!pick.size) return setError("Choose at least one place to post.");
    setBusy(true);
    setError(null);
    try {
      await api.post<CampaignPost[]>(`/campaigns/${c.id}/publish`, { providers: [...pick], caption: caption.trim() || null });
      toast(`Posting to ${[...pick].map((p) => platform(p).label).join(", ")}…`);
      const rows = await loadPosts();
      if (!rows.some((p) => p.status === "posting")) announce(rows.slice(0, pick.size));
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  // Tell the owner when the background posts finish.
  const prev = useRef<CampaignPost[] | null>(null);
  useEffect(() => {
    if (prev.current && posts) {
      // Announce once, when the last one of a batch finishes.
      const wasPosting = prev.current.filter((o) => o.status === "posting").map((o) => o.id);
      if (wasPosting.length && !posts.some((p) => p.status === "posting")) announce(posts.filter((p) => wasPosting.includes(p.id)));
    }
    prev.current = posts;
  }, [posts]);

  return (
    <section className="panel" id="post">
      <h2>Post to social media <span className="muted small">your clients tap or scan, accept and book</span></h2>
      <ErrorBox error={error} />
      <div className="sp-grid">
        <div className="sp-pic">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={`Picture for ${c.title}`} className={`fmt-${fmt}`} />
          <div className="seg sp-fmt" role="tablist" aria-label="Picture size">
            {FORMATS.map((f) => <button key={f.id} type="button" aria-pressed={fmt === f.id} onClick={() => setFmt(f.id)}>{f.label}</button>)}
          </div>
          <div className="acts" style={{ justifyContent: "center" }}>
            <button className="btn sm" onClick={() => download(`/public/c/${c.token}/image/${fmt}.jpg`, `${safe}-${fmt}.jpg`)}>Download picture</button>
            <button className="btn sm" onClick={() => { toast("Making the video, a few seconds…"); download(`/public/c/${c.token}/video.mp4`, `${safe}.mp4`).catch((e) => toast(e.message)); }}>Download video</button>
          </div>
        </div>
        <div className="sp-form">
          {!st ? null : (
            <div className="sp-targets">
              {PLATFORMS.map((p) => {
                const a = account(p.id);
                const ready = p.login === "meta" ? st.meta_ready : st.google_ready;
                const on = pick.has(p.id);
                if (!a) {
                  return (
                    <div className="sp-target off" key={p.id}>
                      <i style={{ background: p.color }} />
                      <span><b>{p.label}</b><small>{ready ? "Not connected" : "Not available yet"}</small></span>
                      {ready && <Link className="btn sm" href="/settings#social">Connect</Link>}
                    </div>
                  );
                }
                return (
                  <label className={`sp-target${on ? " on" : ""}${a.error ? " warn" : ""}`} key={p.id}>
                    <input type="checkbox" checked={on} disabled={!live} onChange={() => setPick((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                    <i style={{ background: p.color }} />
                    <span><b>{p.label}</b><small>{a.error ? a.error : `${a.handle ?? a.name} · ${p.what}`}</small></span>
                  </label>
                );
              })}
            </div>
          )}
          <label className="sp-caption">
            Caption
            <textarea rows={8} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} />
            <span className="hint">The offer link is added for Facebook and YouTube. On Instagram, links can&apos;t be tapped, so it asks clients to scan the code in the picture.</span>
          </label>
          <div className="acts" style={{ justifyContent: "flex-start" }}>
            <button className="btn primary" disabled={busy || !live || !pick.size} onClick={post}>
              {busy ? "Posting…" : pick.size ? `Post to ${[...pick].map((p) => platform(p).label).join(" + ")}` : "Choose where to post"}
            </button>
            {caption !== c.post_caption && <button className="btn ghost" onClick={() => setCaption(c.post_caption)}>Reset caption</button>}
          </div>
          {!live && <p className="note" style={{ marginBottom: 0 }}>This campaign is {c.active ? "over" : "paused"}. Resume it to post again.</p>}
        </div>
      </div>
      {posts && posts.length > 0 && (
        <div className="list sp-history">
          {posts.map((p) => (
            <div className="row" key={p.id}>
              <div className="l">
                <b><i className="sp-dot" style={{ background: platform(p.provider).color }} />{platform(p.provider).label} · {p.account_name}</b>
                <div>{p.status === "failed" ? <span className="bad-text">{p.error}</span> : fmtDateTime(p.posted_at ?? p.created_at)}</div>
              </div>
              <div className="acts" style={{ flexWrap: "nowrap" }}>
                {p.status === "posting" ? <Pill status="sent" label={p.provider === "youtube" ? "Uploading…" : "Posting…"} />
                  : p.status === "posted" ? <><Pill status="accepted" label="Posted" />{p.url && <a className="btn sm" href={p.url} target="_blank" rel="noreferrer">View post</a>}</>
                  : <Pill status="rejected" label="Failed" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function announce(done: CampaignPost[]) {
  const ok = done.filter((p) => p.status === "posted").map((p) => platform(p.provider).label);
  const bad = done.filter((p) => p.status === "failed").map((p) => platform(p.provider).label);
  if (ok.length) toast(`Posted on ${ok.join(", ")}${bad.length ? `. ${bad.join(", ")} failed, see below.` : ""}`);
  else if (bad.length) toast(`${bad.join(", ")} couldn't post. See the reason below.`);
}
