"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";
import { OFFICER_POSITION_LABELS } from "./officer-config";

export function ClassManagement({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [schoolId, setSchoolId] = useState("");

  // Form thêm mới
  const [addName, setAddName] = useState("");
  const [addGender, setAddGender] = useState("male");
  const [addDob, setAddDob] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addParentEmail, setAddParentEmail] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addPosition, setAddPosition] = useState("");

  // Form sửa
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editParentEmail, setEditParentEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPosition, setEditPosition] = useState("");

  async function load() {
    const [enrollResult, classResult, officerResult] = await Promise.all([
      supabase
        .from("student_class_enrollments")
        .select("student_id, students(id, student_code, full_name, gender, date_of_birth, parent_phone, parent_email, address)")
        .eq("class_id", classId)
        .is("left_at", null),
      supabase.from("classes").select("school_year_id, school_years(school_id)").eq("id", classId).maybeSingle(),
      supabase
        .from("class_officers")
        .select("id, student_id, position, group_id, groups_(name)")
        .eq("class_id", classId)
        .eq("status", "active"),
    ]);

    const loadError = enrollResult.error || classResult.error || officerResult.error;
    if (loadError) {
      toast.show(`Lỗi khi tải danh sách: ${loadError.message}`, "error");
      return;
    }

    const officersByStudent = new Map<string, any[]>();
    for (const officer of officerResult.data || []) {
      const current = officersByStudent.get(officer.student_id) || [];
      current.push(officer);
      officersByStudent.set(officer.student_id, current);
    }
    const list = (enrollResult.data || []).map((r: any) => ({
      ...r.students,
      officers: officersByStudent.get(r.student_id) || [],
      position: (officersByStudent.get(r.student_id) || []).find((officer) => officer.position !== "group_leader")?.position || null,
    })).filter(Boolean);
    list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    setStudents(list);
    setSchoolYearId(classResult.data?.school_year_id || "");
    setSchoolId((classResult.data?.school_years as any)?.school_id || "");
  }

  useEffect(() => { load(); }, [classId]);

  // --- Thêm học sinh ---
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || !addDob) {
      toast.show("Họ tên và ngày sinh là bắt buộc.", "error");
      return;
    }
    if (!schoolYearId || !schoolId) {
      toast.show("Không xác định được năm học của lớp.", "error");
      return;
    }
    try {
      const { data: studentData, error: studentErr } = await supabase.from("students").insert({
        school_id: schoolId,
        full_name: addName.trim(),
        gender: addGender,
        date_of_birth: addDob,
        parent_phone: addPhone.trim() || null,
        parent_email: addParentEmail.trim().toLowerCase() || null,
        address: addAddress.trim() || null,
      }).select().single();

      if (studentErr) throw studentErr;

      const { error: enrollErr } = await supabase.from("student_class_enrollments").insert({
        student_id: studentData.id,
        class_id: classId,
        school_year_id: schoolYearId,
      });

      if (enrollErr) {
        await supabase.from("students").delete().eq("id", studentData.id);
        throw enrollErr;
      }

      if (addPosition) {
        const { error: officerErr } = await supabase.from("class_officers").insert({
          class_id: classId,
          student_id: studentData.id,
          position: addPosition,
        });
        if (officerErr) {
          await supabase.from("students").delete().eq("id", studentData.id);
          throw officerErr;
        }
      }

      toast.show(`Đã thêm học sinh ${addName.trim()}.`, "success");
      setAddName(""); setAddGender("male"); setAddDob(""); setAddPhone(""); setAddParentEmail(""); setAddAddress(""); setAddPosition("");
      setShowAddForm(false);
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  // --- Sửa học sinh ---
  function startEdit(s: any) {
    setEditingId(s.id);
    setEditName(s.full_name || "");
    setEditGender(s.gender || "male");
    setEditDob(s.date_of_birth || "");
    setEditPhone(s.parent_phone || "");
    setEditParentEmail(s.parent_email || "");
    setEditAddress(s.address || "");
    setEditPosition(s.position || "");
  }

  async function handleSave() {
    if (!editName.trim()) {
      toast.show("Họ tên không được để trống.", "error");
      return;
    }
    if (editParentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editParentEmail.trim())) {
      toast.show("Email phụ huynh không hợp lệ.", "error");
      return;
    }
    const { error } = await supabase.from("students").update({
      full_name: editName.trim(),
      gender: editGender,
      date_of_birth: editDob || null,
      parent_phone: editPhone.trim() || null,
      parent_email: editParentEmail.trim().toLowerCase() || null,
      address: editAddress.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editingId);

    if (error) {
      toast.show(`Lỗi: ${error.message}`, "error");
      return;
    }

    // Chức vụ thuộc class_officers, không thuộc student_class_enrollments.
    const editingStudent = students.find((student) => student.id === editingId);
    const currentOfficer = editingStudent?.officers?.find((officer: any) => officer.position !== "group_leader");
    if (editPosition !== (currentOfficer?.position || "")) {
      let newOfficerId: string | null = null;
      if (editPosition) {
        const { data: newOfficer, error: insertOfficerError } = await supabase.from("class_officers").insert({
          class_id: classId,
          student_id: editingId,
          position: editPosition,
        }).select("id").single();
        if (insertOfficerError) {
          toast.show(`Lỗi cập nhật chức vụ: ${insertOfficerError.message}`, "error");
          return;
        }
        newOfficerId = newOfficer.id;
      }
      if (currentOfficer) {
        const { error: removeOfficerError } = await supabase.from("class_officers").update({
          status: "removed",
          removed_at: new Date().toISOString(),
        }).eq("id", currentOfficer.id);
        if (removeOfficerError) {
          if (newOfficerId) {
            await supabase.from("class_officers").update({
              status: "removed",
              removed_at: new Date().toISOString(),
            }).eq("id", newOfficerId);
          }
          toast.show(`Lỗi cập nhật chức vụ: ${removeOfficerError.message}`, "error");
          return;
        }
      }
    }

    toast.show("Đã cập nhật thông tin học sinh.", "success");
    setEditingId(null);
    load();
  }

  // --- Xóa 1 học sinh khỏi lớp ---
  async function handleDeleteOne(studentId: string) {
    const { error } = await supabase
      .from("student_class_enrollments")
      .update({ left_at: new Date().toISOString(), status: "transferred_out" })
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .is("left_at", null);

    if (error) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } else {
      toast.show("Đã xóa học sinh khỏi lớp.", "success");
    }
    setConfirmDeleteOne(null);
    load();
  }

  // --- Xóa toàn bộ ---
  async function handleDeleteAll() {
    const { error } = await supabase
      .from("student_class_enrollments")
      .update({ left_at: new Date().toISOString(), status: "transferred_out" })
      .eq("class_id", classId)
      .is("left_at", null);

    if (error) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } else {
      toast.show("Đã xóa toàn bộ học sinh khỏi lớp.", "success");
    }
    setConfirmDeleteAll(false);
    load();
  }

  const filtered = students.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.student_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Section title={`Quản lý lớp học (${students.length} học sinh)`} description="Danh sách toàn bộ học sinh đang học trong lớp.">
      {/* Thanh công cụ */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="field-input w-64"
          placeholder="Tìm kiếm theo tên hoặc mã HS..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? "Đóng form" : "+ Thêm học sinh"}
        </button>
        {students.length > 0 && (
          <button className="btn-ghost text-deduct" onClick={() => setConfirmDeleteAll(true)}>
            Xóa toàn bộ danh sách
          </button>
        )}
      </div>

      {/* Form thêm học sinh */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="mb-6 rounded border border-line bg-paper p-4">
          <h4 className="mb-3 font-medium text-ink">Thêm học sinh mới</h4>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="field-label">Họ tên *</label>
              <input className="field-input w-48" value={addName} onChange={(e) => setAddName(e.target.value)} required placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="field-label">Giới tính</label>
              <select className="field-input w-28" value={addGender} onChange={(e) => setAddGender(e.target.value)}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div>
              <label className="field-label">Ngày sinh *</label>
              <input type="date" className="field-input" value={addDob} onChange={(e) => setAddDob(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">SĐT phụ huynh</label>
              <input className="field-input w-36" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="0912345678" />
            </div>
            <div>
              <label className="field-label">Email phụ huynh</label>
              <input type="email" className="field-input w-56" value={addParentEmail} onChange={(e) => setAddParentEmail(e.target.value)} placeholder="phuhuynh@example.com" />
            </div>
            <div>
              <label className="field-label">Địa chỉ</label>
              <input className="field-input w-56" value={addAddress} onChange={(e) => setAddAddress(e.target.value)} placeholder="123 Lê Lợi, Q.1" />
            </div>
            <div>
              <label className="field-label">Chức vụ</label>
              <select className="field-input w-32" value={addPosition} onChange={(e) => setAddPosition(e.target.value)}>
                <option value="">Học sinh</option>
                <option value="class_monitor">Lớp trưởng</option>
                <option value="vice_monitor_academic">Lớp phó học tập</option>
                <option value="vice_monitor_labor">Lớp phó lao động</option>
                <option value="vice_monitor_activity">Lớp phó văn thể</option>
                <option value="secretary">Bí thư</option>
              </select>
            </div>
            <button type="submit" className="btn-primary">Thêm</button>
          </div>
        </form>
      )}

      {students.length === 0 ? (
        <EmptyState message="Lớp chưa có học sinh. Vui lòng thêm hoặc import học sinh." />
      ) : filtered.length === 0 ? (
        <EmptyState message="Không tìm thấy học sinh phù hợp." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-14">STT</th>
              <th>Mã HS</th>
              <th>Họ tên</th>
              <th>Giới tính</th>
              <th>Ngày sinh</th>
              <th>SĐT phụ huynh</th>
              <th>Email phụ huynh</th>
              <th>Địa chỉ</th>
              <th>Chức vụ</th>
              <th className="w-32">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, index) => (
              editingId === s.id ? (
                <tr key={s.id} className="bg-gold-bg/30">
                  <td className="text-ink-muted">{index + 1}</td>
                  <td className="font-mono text-xs">{s.student_code}</td>
                  <td><input className="field-input w-40" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td>
                    <select className="field-input w-24" value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </td>
                  <td><input type="date" className="field-input" value={editDob} onChange={(e) => setEditDob(e.target.value)} /></td>
                  <td><input className="field-input w-32" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></td>
                  <td><input type="email" className="field-input w-52" value={editParentEmail} onChange={(e) => setEditParentEmail(e.target.value)} /></td>
                  <td><input className="field-input w-40" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></td>
                  <td>
                    <select className="field-input w-28" value={editPosition} onChange={(e) => setEditPosition(e.target.value)}>
                      <option value="">Học sinh</option>
                      <option value="class_monitor">Lớp trưởng</option>
                      <option value="vice_monitor_academic">Lớp phó học tập</option>
                      <option value="vice_monitor_labor">Lớp phó lao động</option>
                      <option value="vice_monitor_activity">Lớp phó văn thể</option>
                      <option value="secretary">Bí thư</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-primary text-xs" onClick={handleSave}>Lưu</button>{" "}
                    <button className="btn-ghost text-xs" onClick={() => setEditingId(null)}>Hủy</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td className="text-ink-muted">{index + 1}</td>
                  <td className="font-mono text-xs">{s.student_code}</td>
                  <td className="font-medium">{s.full_name}</td>
                  <td>{s.gender === "male" ? "Nam" : s.gender === "female" ? "Nữ" : s.gender === "other" ? "Khác" : "—"}</td>
                  <td>{s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString("vi-VN") : "—"}</td>
                  <td>{s.parent_phone || "—"}</td>
                  <td>{s.parent_email || "—"}</td>
                  <td className="max-w-48 truncate" title={s.address}>{s.address || "—"}</td>
                  <td>
                    {s.officers?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.officers.map((officer: any) => (
                          <span key={officer.id} className="badge-neutral">
                            {OFFICER_POSITION_LABELS[officer.position] || officer.position}
                            {officer.groups_?.name ? ` · ${officer.groups_.name}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : "Học sinh"}
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-ghost text-xs" onClick={() => startEdit(s)}>Sửa</button>{" "}
                    <button className="btn-ghost text-xs text-deduct" onClick={() => setConfirmDeleteOne(s.id)}>Xóa</button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}

      {/* Modal xác nhận xóa toàn bộ */}
      {confirmDeleteAll && (
        <ConfirmModal
          title="Xóa toàn bộ học sinh khỏi lớp"
          description={`Bạn sắp xóa ${students.length} học sinh khỏi lớp. Học sinh sẽ được đánh dấu đã rời lớp (không xóa vĩnh viễn dữ liệu). Hành động này không thể hoàn tác dễ dàng.`}
          confirmLabel="Xóa toàn bộ"
          danger={true}
          onCancel={() => setConfirmDeleteAll(false)}
          onConfirm={() => handleDeleteAll()}
        />
      )}

      {/* Modal xác nhận xóa 1 học sinh */}
      {confirmDeleteOne && (
        <ConfirmModal
          title="Xóa học sinh khỏi lớp"
          description={`Bạn sắp xóa học sinh "${students.find(s => s.id === confirmDeleteOne)?.full_name || ""}" khỏi lớp. Học sinh sẽ được đánh dấu đã rời lớp.`}
          confirmLabel="Xóa"
          danger={true}
          onCancel={() => setConfirmDeleteOne(null)}
          onConfirm={() => handleDeleteOne(confirmDeleteOne)}
        />
      )}
    </Section>
  );
}

// =========================================================
// TẠO TÀI KHOẢN HỌC SINH / PHỤ HUYNH
// =========================================================
