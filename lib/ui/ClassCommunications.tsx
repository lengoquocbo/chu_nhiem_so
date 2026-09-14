"use client";

import { useEffect, useRef, useState } from "react";
import { callApi, callApiGet } from "@/lib/supabaseClient";
import { EmptyState, Section } from "@/lib/ui/Section";

const FEEDBACK_STATUS: Record<string, string> = {
  pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Không duyệt",
};

export function ClassCommunications({ classId: suppliedClassId, view, studentMode = false, onUnreadChange, termStartDate, termEndDate, readOnly = false }: {
  classId?: string;
  view: "forum" | "feedback";
  studentMode?: boolean;
  onUnreadChange?: () => void;
  termStartDate?: string;
  termEndDate?: string;
  readOnly?: boolean;
}) {
  const [classId, setClassId] = useState(suppliedClassId || "");
  const [classes, setClasses] = useState<any[]>([]);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const operationLock = useRef(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => { if (suppliedClassId) setClassId(suppliedClassId); }, [suppliedClassId]);
  useEffect(() => {
    if (suppliedClassId) return;
    callApiGet("/api/communications/context").then((result) => {
      setClasses(result.classes || []);
      setClassId((current) => current || result.classes?.[0]?.id || "");
      if (!result.classes?.length) setLoading(false);
    }).catch((err: any) => { setError(err.message); setLoading(false); });
  }, [suppliedClassId]);

  async function load(targetClassId = classId) {
    if (!targetClassId) return;
    setLoading(true); setError("");
    try {
      const result = await callApiGet(`/api/communications/${view}?class_id=${encodeURIComponent(targetClassId)}`);
      const withinTerm = (item: any) => !termStartDate || !termEndDate || (item.created_at.slice(0, 10) >= termStartDate && item.created_at.slice(0, 10) <= termEndDate);
      const scopedResult = view === "forum" ? { ...result, posts: (result.posts || []).filter(withinTerm) } : { ...result, feedback: (result.feedback || []).filter(withinTerm) };
      setData(scopedResult);
      const items = view === "forum" ? scopedResult.posts || [] : scopedResult.feedback || [];
      if (items.length) {
        await callApi("/api/communications/read", {
          class_id: targetClassId, content_type: view, content_ids: items.map((item: any) => item.id),
        });
        onUnreadChange?.();
      }
    } catch (err: any) { setError(err.message || "Không thể tải nội dung."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (classId) load(); }, [classId, view, termStartDate, termEndDate]);

  async function createPost(event: React.FormEvent) {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true; setSaving(true); setError("");
    try {
      await callApi("/api/communications/forum/create", { class_id: classId, title, content });
      setTitle(""); setContent(""); await load(); onUnreadChange?.();
    } catch (err: any) { setError(err.message); }
    finally { operationLock.current = false; setSaving(false); }
  }

  async function reviewPost(postId: string, approve: boolean) {
    if (operationLock.current) return;
    operationLock.current = true; setSaving(true); setError("");
    try {
      await callApi("/api/communications/forum/review", { class_id: classId, post_id: postId, approve });
      await load(); onUnreadChange?.();
    } catch (err: any) { setError(err.message); }
    finally { operationLock.current = false; setSaving(false); }
  }

  async function submitFeedback(event: React.FormEvent) {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true; setSaving(true); setError("");
    try {
      await callApi("/api/communications/feedback/create", { class_id: classId, content });
      setContent(""); await load(); onUnreadChange?.();
    } catch (err: any) { setError(err.message); }
    finally { operationLock.current = false; setSaving(false); }
  }

  async function reviewFeedback(feedbackId: string, approve: boolean) {
    if (operationLock.current) return;
    operationLock.current = true; setSaving(true); setError("");
    try {
      await callApi("/api/communications/feedback/review", {
        class_id: classId, feedback_id: feedbackId, approve,
      });
      await load(); onUnreadChange?.();
    } catch (err: any) { setError(err.message); }
    finally { operationLock.current = false; setSaving(false); }
  }

  const classPicker = !suppliedClassId && classes.length > 1 ? <div className="mb-5"><label className="field-label">Lớp</label><select className="field-input w-48" value={classId} disabled={loading || saving} onChange={(event) => setClassId(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div> : null;
  if (!classId && !loading) return <EmptyState message="Tài khoản chưa được liên kết với lớp học." />;

  if (view === "forum") {
    const posts = data?.posts || [];
    return <Section title="Diễn đàn thông báo lớp" description="Thông báo mới nhất được hiển thị trước; bài của ban cán sự có thể cần GVCN duyệt.">
      {classPicker}
      {readOnly && <p className="mb-4 rounded border border-line bg-paper px-3 py-2 text-sm text-ink-muted">Học kỳ đã đóng — nội dung chỉ được xem.</p>}
      {data?.can_create && !readOnly && <form onSubmit={createPost} className="mb-6 rounded-lg border border-line bg-paper p-4"><div className="grid gap-3"><div><label className="field-label">Tiêu đề</label><input className="field-input" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} required /></div><div><label className="field-label">Nội dung</label><textarea className="field-input min-h-28" maxLength={5000} value={content} onChange={(event) => setContent(event.target.value)} required /></div></div><div className="mt-3 flex justify-end"><button className="btn-primary" disabled={saving}>{saving ? "Đang gửi..." : data.is_homeroom ? "Đăng thông báo" : "Gửi thông báo"}</button></div></form>}
      {error && <p className="mb-4 rounded border border-deduct/30 bg-deduct-bg px-3 py-2 text-sm text-deduct">Lỗi: {error}</p>}
      {loading ? <p className="text-sm text-ink-muted">Đang tải thông báo...</p> : posts.length === 0 ? <EmptyState message="Học kỳ này chưa có thông báo nào." /> : <div className="space-y-3">{posts.map((post: any) => <article key={post.id} className="rounded-lg border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-ink">{post.title}</h3><p className="mt-1 text-xs text-ink-muted">{post.author?.full_name || "Thành viên lớp"} · {new Date(post.created_at).toLocaleString("vi-VN")}</p></div>{post.status === "pending" ? <span className="badge-gold">Chờ duyệt</span> : post.status === "rejected" ? <span className="badge-deduct">Đã từ chối</span> : <span className="badge-add">Đã đăng</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.content}</p>{post.status === "pending" && data.can_approve && !readOnly && <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" disabled={saving} onClick={() => reviewPost(post.id, false)}>Từ chối</button><button type="button" className="btn-primary" disabled={saving} onClick={() => reviewPost(post.id, true)}>Duyệt đăng</button></div>}</article>)}</div>}
    </Section>;
  }

  const feedback = data?.feedback || [];
  return <Section title="Góp ý – phản hồi" description={studentMode ? "Góp ý luôn ẩn danh, kể cả với GVCN. Góp ý được duyệt mới hiển thị cho cả lớp." : "Mọi góp ý đều ẩn danh. GVCN chỉ duyệt hoặc không duyệt nội dung học sinh gửi."}>
    {classPicker}
    {readOnly && <p className="mb-4 rounded border border-line bg-paper px-3 py-2 text-sm text-ink-muted">Học kỳ đã đóng — nội dung chỉ được xem.</p>}
    {studentMode && <form onSubmit={submitFeedback} className="mb-6 rounded-lg border border-line bg-paper p-4"><label className="field-label">Nội dung góp ý ẩn danh</label><textarea className="field-input min-h-28" maxLength={5000} value={content} onChange={(event) => setContent(event.target.value)} required /><div className="mt-3 flex justify-end"><button className="btn-primary" disabled={saving}>{saving ? "Đang gửi..." : "Gửi góp ý"}</button></div></form>}
    {error && <p className="mb-4 rounded border border-deduct/30 bg-deduct-bg px-3 py-2 text-sm text-deduct">Lỗi: {error}</p>}
    {loading ? <p className="text-sm text-ink-muted">Đang tải góp ý...</p> : feedback.length === 0 ? <EmptyState message="Học kỳ này chưa có góp ý nào." /> : <div className="space-y-3">{feedback.map((item: any) => <article key={item.id} className="rounded-lg border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs text-ink-muted">Ẩn danh · {new Date(item.created_at).toLocaleString("vi-VN")}</p><span className={item.status === "approved" ? "badge-add" : item.status === "rejected" ? "badge-deduct" : "badge-gold"}>{FEEDBACK_STATUS[item.status] || item.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.content}</p>{data.is_homeroom && item.status === "pending" && !readOnly && <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" disabled={saving} onClick={() => reviewFeedback(item.id, false)}>Không duyệt</button><button type="button" className="btn-primary" disabled={saving} onClick={() => reviewFeedback(item.id, true)}>Duyệt</button></div>}</article>)}</div>}
  </Section>;
}
