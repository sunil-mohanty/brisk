"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Stylist } from "@/lib/types";
import { vocab } from "@/lib/vocab";
import { words } from "@/lib/words";

const COLORS = ["#b4532f", "#5e7a5a", "#8a5a83", "#c28a3a", "#3f6f8a", "#a8484f", "#6b6f3a", "#7a5136"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export default function TeamPage() {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [team, setTeam] = useState<Stylist[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<Stylist[]>("/team").then(setTeam).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/team", { name: name.trim(), role: role.trim() || null });
      toast(`${name.trim()} added`);
      setName(""); setRole("");
      load();
    } catch (err) { setError((err as Error).message); }
  }
  async function save(m: Stylist, body: Partial<Stylist>) {
    try { const u = await api.patch<Stylist>(`/team/${m.id}`, body); setTeam((t) => (t ?? []).map((x) => (x.id === u.id ? u : x))); }
    catch (err) { toast((err as Error).message); }
  }
  async function remove(m: Stylist) {
    if (!window.confirm(`Remove ${m.name} from your staff? Their past appointments stay in the history.`)) return;
    await api.del(`/team/${m.id}`);
    toast(`${m.name} removed`);
    load();
  }

  return (
    <>
      <PageHead eyebrow={team ? `${team.length} active` : undefined} title={words(business.business_type).Staff} sub={`Each ${v.staff.toLowerCase()} gets a column in the diary, so nobody is double-booked. Clients can ask for them by name on your link page.`} />
      <ErrorBox error={error} />
      <form className="card" onSubmit={add} style={{ marginBottom: 16 }}>
        <div className="form" style={{ gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}>
          <label>Name<input id="tm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={v.staffPlaceholder} maxLength={120} /></label>
          <label>Role <span className="hint">(optional)</span><input id="tm-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder={`Senior ${v.staff.toLowerCase()}`} maxLength={80} /></label>
          <Tip id="tm.add" order={1} text="Add everyone who takes clients, including yourself."><button className="btn primary" disabled={!name.trim()}>Add staff member</button></Tip>
        </div>
      </form>
      {!team ? <Loading /> : team.length === 0 ? (
        <div className="panel empty">No one added yet. Add yourself first, then your {v.staff.toLowerCase()}s.</div>
      ) : (
        <div className="team">
          {team.map((m) => (
            <div className="member" key={m.id}>
              <div className="member-top">
                <span className="member-av" style={{ "--c": m.color } as React.CSSProperties} aria-hidden="true">{initials(m.name)}</span>
                <div style={{ minWidth: 0 }}><b>{m.name}</b><span>{m.role || v.staff}</span></div>
              </div>
              <input defaultValue={m.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.name && save(m, { name: e.target.value.trim() })} />
              <input defaultValue={m.role ?? ""} aria-label="Role" placeholder="Role" onBlur={(e) => e.target.value.trim() !== (m.role ?? "") && save(m, { role: e.target.value.trim() || null })} />
              <div className="colors" role="group" aria-label={`Diary colour for ${m.name}`}>
                {COLORS.map((c) => <button key={c} type="button" aria-pressed={m.color === c} aria-label={c} style={{ "--c": c } as React.CSSProperties} onClick={() => save(m, { color: c })} />)}
              </div>
              <label className="check"><input type="checkbox" checked={m.on_page} onChange={(e) => save(m, { on_page: e.target.checked })} />Show on my link page</label>
              <button type="button" className="btn sm ghost danger" style={{ alignSelf: "flex-start" }} onClick={() => remove(m)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
