"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session";
import { Avatar, DAYS, StatusChip } from "@/components/StaffBits";
import { copyText, ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CatalogItem, Staff, StaffList, StaffLogin, WeekHours } from "@/lib/types";
import { vocab } from "@/lib/vocab";
import { words } from "@/lib/words";

const COLORS = ["#b4532f", "#5e7a5a", "#8a5a83", "#c28a3a", "#3f6f8a", "#a8484f", "#6b6f3a", "#7a5136"];

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, business } = useSession();
  const router = useRouter();
  const v = vocab(business.business_type);
  const W = words(business.business_type);
  const owner = (user.role ?? "owner") === "owner";
  const [st, setSt] = useState<Staff | null>(null);
  const [meta, setMeta] = useState<StaffList | null>(null);
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Staff>(`/staff/${id}`).then(setSt).catch((e) => setError(e.message));
    api.get<StaffList>("/staff").then(setMeta).catch(() => {});
    api.get<CatalogItem[]>("/catalog").then(setMenu).catch(() => {});
  }, [id]);

  async function save(body: Partial<Staff> | Record<string, unknown>, done = "Saved") {
    try { setSt(await api.patch<Staff>(`/staff/${id}`, body)); toast(done); return true; } catch (e) { toast((e as Error).message); return false; }
  }
  async function remove() {
    if (!st || !window.confirm(`Remove ${st.name} from the team? Their past work stays in your reports, their login stops working and they can't be booked.`)) return;
    await api.del(`/staff/${st.id}`);
    toast(`${st.name} removed`);
    router.push("/team");
  }

  if (error) return <ErrorBox error={error} />;
  if (!st) return <Loading />;
  return (
    <>
      <PageHead eyebrow={<Link href="/team">← {W.Staff}</Link>} title={st.name}
        sub={<span className="prof-sub"><Avatar name={st.name} color={st.color} size={26} />{st.role || v.staff}{st.today ? <StatusChip today={st.today} /> : !st.active ? <span className="st-chip t-muted">Left the team</span> : null}</span>}
        action={st.active ? <button type="button" className="btn ghost danger" onClick={remove}>Remove from team</button> : <button type="button" className="btn" onClick={() => save({ active: true }, "Back on the team")}>Bring back</button>} />
      <div className="profgrid">
        <div className="stack">
          <Details st={st} onSave={save} />
          <Hours st={st} onSave={save} />
          <Skills st={st} menu={menu} onSave={save} />
        </div>
        <div className="stack">
          <CommissionBox st={st} categories={meta?.categories ?? []} owner={owner} onSave={save} />
          <Access st={st} owner={owner} perms={meta?.permissions ?? {}} onChange={setSt} />
        </div>
      </div>
    </>
  );
}

type SaveFn = (body: Record<string, unknown>, done?: string) => Promise<boolean>;

function Details({ st, onSave }: { st: Staff; onSave: SaveFn }) {
  const [f, setF] = useState({ name: st.name, role: st.role ?? "", phone: st.phone ?? "", email: st.email ?? "", joined_on: st.joined_on ?? "", notes: st.notes ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const dirty = f.name !== st.name || f.role !== (st.role ?? "") || f.phone !== (st.phone ?? "") || f.email !== (st.email ?? "") || f.joined_on !== (st.joined_on ?? "") || f.notes !== (st.notes ?? "");
  return (
    <section className="panel">
      <h2>Profile</h2>
      <div className="form">
        <label>Name<input value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} /></label>
        <label>Job title<input value={f.role} maxLength={80} onChange={(e) => set("role", e.target.value)} placeholder="Senior stylist" /></label>
        <label>Mobile<input value={f.phone} maxLength={40} inputMode="tel" onChange={(e) => set("phone", e.target.value)} placeholder="050 123 4567" /></label>
        <label>Email<input type="email" value={f.email} maxLength={200} onChange={(e) => set("email", e.target.value)} /></label>
        <label>Joined<input type="date" value={f.joined_on} onChange={(e) => set("joined_on", e.target.value)} /></label>
        <div>
          <label>Diary colour</label>
          <div className="colors" role="group" aria-label="Diary colour" style={{ marginTop: 6 }}>
            {COLORS.map((c) => <button key={c} type="button" aria-pressed={st.color === c} aria-label={c} style={{ "--c": c } as React.CSSProperties} onClick={() => onSave({ color: c }, "Colour changed")} />)}
          </div>
        </div>
        <label className="full">Notes <span className="hint">(only you see these)</span><textarea value={f.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} placeholder="Visa renewal date, emergency contact, training done…" /></label>
        <label className="check full"><input type="checkbox" checked={st.on_page} onChange={(e) => onSave({ on_page: e.target.checked }, e.target.checked ? "Shown on your link page" : "Hidden from your link page")} />Clients can ask for them by name on your link page</label>
      </div>
      <div className="acts" style={{ justifyContent: "flex-start", marginTop: 12 }}>
        <button type="button" className="btn primary" disabled={!dirty || !f.name.trim()} onClick={() => onSave({
          name: f.name.trim(), role: f.role.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, joined_on: f.joined_on || null, notes: f.notes.trim() || null,
        }, "Profile saved")}>Save profile</button>
      </div>
    </section>
  );
}

function Hours({ st, onSave }: { st: Staff; onSave: SaveFn }) {
  const [custom, setCustom] = useState(st.custom_hours);
  const [wh, setWh] = useState<WeekHours>(st.working_hours);
  useEffect(() => { setWh(st.working_hours); setCustom(st.custom_hours); }, [st]);
  const setDay = (d: number, v: [string, string] | null) => setWh((x) => ({ ...x, [String(d)]: v }));
  const total = Object.values(wh).reduce((a, s) => a + (s ? (toMin(s[1]) - toMin(s[0])) / 60 : 0), 0);
  return (
    <section className="panel">
      <h2>Working hours <span className="muted small">{Math.round(total * 10) / 10}h a week</span></h2>
      <div className="seg" role="group" aria-label="Hours" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={!custom} onClick={() => { setCustom(false); if (st.custom_hours) onSave({ working_hours: {} }, "Following the salon's opening hours"); }}>Salon opening hours</button>
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Their own hours</button>
      </div>
      <div className={`hours${custom ? "" : " is-locked"}`}>
        {DAYS.map((name, d) => {
          const span = wh[String(d)];
          return (
            <div className="hours-row" key={name}>
              <label className="check"><input type="checkbox" disabled={!custom} checked={!!span} onChange={(e) => setDay(d, e.target.checked ? ["10:00", "19:00"] : null)} />{name}</label>
              {span ? <>
                <input type="time" aria-label={`${name} start`} disabled={!custom} value={span[0]} onChange={(e) => setDay(d, [e.target.value, span[1]])} />
                <span className="muted">to</span>
                <input type="time" aria-label={`${name} finish`} disabled={!custom} value={span[1]} onChange={(e) => setDay(d, [span[0], e.target.value])} />
              </> : <span className="muted small">Day off</span>}
            </div>
          );
        })}
      </div>
      {custom && (
        <div className="acts" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={() => onSave({ working_hours: wh }, "Working hours saved")}>Save hours</button>
          <span className="small muted">Online booking and the diary only offer times they work.</span>
        </div>
      )}
    </section>
  );
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

function Skills({ st, menu, onSave }: { st: Staff; menu: CatalogItem[]; onSave: SaveFn }) {
  const [all, setAll] = useState(st.skill_ids.length === 0);
  const [on, setOn] = useState<Set<number>>(new Set(st.skill_ids));
  useEffect(() => { setAll(st.skill_ids.length === 0); setOn(new Set(st.skill_ids)); }, [st]);
  const groups = useMemo(() => {
    const g = new Map<string, CatalogItem[]>();
    menu.forEach((m) => g.set(m.category || "Other", [...(g.get(m.category || "Other") ?? []), m]));
    return [...g.entries()];
  }, [menu]);
  const toggle = (id: number) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (items: CatalogItem[]) => setOn((s) => {
    const n = new Set(s);
    const every = items.every((i) => n.has(i.id));
    items.forEach((i) => (every ? n.delete(i.id) : n.add(i.id)));
    return n;
  });
  return (
    <section className="panel">
      <h2>Services they do <span className="muted small">{all ? "everything on the menu" : `${on.size} of ${menu.length}`}</span></h2>
      {menu.length === 0 ? <div className="empty">Add your services to the menu first.</div> : <>
        <div className="seg" role="group" aria-label="Skills" style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={all} onClick={() => { setAll(true); if (st.skill_ids.length) onSave({ skill_ids: [] }, "Does every service"); }}>Every service</button>
          <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>Only some</button>
        </div>
        {!all && <>
          <div className="skills">
            {groups.map(([cat, items]) => (
              <div className="skills-g" key={cat}>
                <button type="button" className="skills-cat" onClick={() => toggleGroup(items)}>{cat}</button>
                <div className="chips-inline">
                  {items.map((m) => <button type="button" key={m.id} className="chip" aria-pressed={on.has(m.id)} onClick={() => toggle(m.id)}>{m.name}</button>)}
                </div>
              </div>
            ))}
          </div>
          <div className="acts" style={{ justifyContent: "flex-start", marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={!on.size} onClick={() => onSave({ skill_ids: [...on] }, "Skills saved")}>Save skills</button>
            <span className="small muted">Bookings for other services won&apos;t go to them.</span>
          </div>
        </>}
      </>}
    </section>
  );
}

function CommissionBox({ st, categories, owner, onSave }: { st: Staff; categories: string[]; owner: boolean; onSave: SaveFn }) {
  const [rate, setRate] = useState(String(Number(st.commission_rate)));
  const [by, setBy] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(st.commission_by_category).map(([k, v]) => [k, v == null ? "" : String(Number(v))])));
  const cats = [...new Set([...categories, ...Object.keys(st.commission_by_category)])];
  function submit() {
    const body = Object.fromEntries(cats.filter((c) => by[c] !== undefined && by[c] !== "").map((c) => [c, Number(by[c])]));
    onSave({ commission_rate: Number(rate) || 0, commission_by_category: body }, "Commission saved");
  }
  return (
    <section className="panel">
      <h2>Commission</h2>
      <p className="small muted" style={{ margin: "0 0 12px" }}>A % of each finished service&apos;s price before VAT. Set a different % for a menu category, or leave it blank to use the default.</p>
      <div className="comm">
        <div className="comm-row comm-def"><span>Default</span><span className="pct"><input aria-label="Default commission %" type="number" min={0} max={100} step={0.5} value={rate} disabled={!owner} onChange={(e) => setRate(e.target.value)} />%</span></div>
        {cats.map((c) => (
          <div className="comm-row" key={c}><span>{c}</span><span className="pct"><input aria-label={`${c} commission %`} type="number" min={0} max={100} step={0.5} value={by[c] ?? ""} placeholder={`${rate || 0} (default)`} disabled={!owner} onChange={(e) => setBy({ ...by, [c]: e.target.value })} />%</span></div>
        ))}
      </div>
      {owner ? (
        <div className="acts" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={submit}>Save commission</button>
          <Link className="btn ghost" href="/team?tab=commission">See this month</Link>
        </div>
      ) : <p className="small muted" style={{ margin: "10px 0 0" }}>Only the owner can change commission.</p>}
    </section>
  );
}

function Access({ st, owner, perms, onChange }: { st: Staff; owner: boolean; perms: Record<string, string>; onChange: (s: Staff) => void }) {
  const { business } = useSession();
  const [email, setEmail] = useState(st.login_email ?? st.email ?? "");
  const [role, setRole] = useState<"staff" | "manager">(st.login_role ?? "staff");
  const [made, setMade] = useState<StaffLogin | null>(null);
  const [busy, setBusy] = useState(false);
  async function give() {
    setBusy(true);
    try {
      const r = await api.put<StaffLogin>(`/staff/${st.id}/login`, { email: email.trim(), role });
      setMade(r);
      onChange(await api.get<Staff>(`/staff/${st.id}`));
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function removeLogin() {
    if (!window.confirm(`Remove ${st.name}'s login? They'll be signed out and can't open ${business.name} in the app.`)) return;
    await api.del(`/staff/${st.id}/login`);
    setMade(null);
    onChange(await api.get<Staff>(`/staff/${st.id}`));
    toast("Login removed");
  }
  async function togglePerm(p: string) {
    const next = st.permissions.includes(p) ? st.permissions.filter((x) => x !== p) : [...st.permissions, p];
    try { onChange(await api.put<Staff>(`/staff/${st.id}/permissions`, { permissions: next })); } catch (e) { toast((e as Error).message); }
  }
  if (!owner) {
    return (
      <section className="panel">
        <h2>App access</h2>
        <p className="small muted" style={{ margin: 0 }}>{st.login_email ? `Signs in as ${st.login_email} (${st.login_role}).` : "No login."} Only the owner can change logins and permissions.</p>
      </section>
    );
  }
  return (
    <section className="panel">
      <h2>App access</h2>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        With a login, {st.name.split(" ")[0]} sees their own day on their phone, clocks in and out, and asks for leave. Managers can run the diary, clients and staff, but not pay or logins.
      </p>
      {made?.password && (
        <div className="loginmade" role="status">
          <b>Login ready. Share it with {st.name.split(" ")[0]}:</b>
          <dl><dt>Sign in at</dt><dd className="mono">{made.login_url}</dd><dt>Email</dt><dd className="mono">{made.email}</dd><dt>Password</dt><dd className="mono">{made.password}</dd></dl>
          <div className="acts" style={{ justifyContent: "flex-start" }}>
            {made.whatsapp_url && <a className="btn wa sm" href={made.whatsapp_url} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
            <button type="button" className="btn sm" onClick={() => copyText(`${made.login_url}\nEmail: ${made.email}\nPassword: ${made.password}`)}>Copy</button>
          </div>
          <small className="muted">This password is shown once. They can change it after signing in.</small>
        </div>
      )}
      <div className="form" style={{ gridTemplateColumns: "1fr auto" }}>
        <label>Login email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value as "staff" | "manager")}><option value="staff">Staff</option><option value="manager">Manager</option></select></label>
      </div>
      <div className="acts" style={{ justifyContent: "flex-start", marginTop: 10 }}>
        <button type="button" className="btn primary" disabled={busy || !email.includes("@") || !st.active} onClick={give}>
          {busy ? "Saving…" : st.login_email ? (email.toLowerCase() !== st.login_email || role !== st.login_role ? "Update login & new password" : "Reset password") : "Give app login"}
        </button>
        {st.login_email && <button type="button" className="btn ghost danger" onClick={removeLogin}>Remove login</button>}
      </div>
      {st.login_email && st.login_role === "staff" && (
        <div className="perms">
          <h3>What {st.name.split(" ")[0]} can see</h3>
          <p className="small muted" style={{ margin: "0 0 8px" }}>Always: their own appointments, clock in/out, leave requests.</p>
          {Object.entries(perms).map(([p, label]) => (
            <label key={p} className="check"><input type="checkbox" checked={st.permissions.includes(p)} onChange={() => togglePerm(p)} />{label}</label>
          ))}
        </div>
      )}
      {st.login_role === "manager" && <p className="small muted" style={{ margin: "12px 0 0" }}>Managers see everything except pay, commission rates, logins and billing.</p>}
    </section>
  );
}
