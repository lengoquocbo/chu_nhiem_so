import { describe, expect, it } from "vitest";
import { canAccessClass, canAccessStudent, canApproveEvent, canDownloadPrivateReport, canManageAttendanceRecord, canManageClassOfficers, dataScopeForRole, roleMay } from "./authorization";

describe("phân quyền backend", () => {
  it("chặn truy cập chéo lớp", () => expect(canAccessClass("lop-a", "lop-b")).toBe(false));
  it("cán bộ lớp không được duyệt sự kiện", () => expect(canApproveEvent("CLASS_MONITOR", "u1", "u2")).toBe(false));
  it("không tự duyệt sự kiện của mình", () => expect(canApproveEvent("TEACHER", "u1", "u1")).toBe(false));
  it("học sinh không tải báo cáo riêng", () => expect(canDownloadPrivateReport("STUDENT")).toBe(false));
  it("giáo viên tải báo cáo riêng", () => expect(canDownloadPrivateReport("TEACHER")).toBe(true));
  it("ánh xạ đúng phạm vi vai trò", () => { expect(dataScopeForRole("TEACHER")).toBe("CLASS"); expect(dataScopeForRole("TEAM_LEADER")).toBe("TEAM"); expect(dataScopeForRole("STUDENT")).toBe("SELF"); });
  it("tổ trưởng chỉ truy cập học sinh cùng tổ", () => { expect(canAccessStudent({ role:"TEAM_LEADER", userClassId:"c1", userTeamId:"t1", targetClassId:"c1", targetTeamId:"t1" })).toBe(true); expect(canAccessStudent({ role:"TEAM_LEADER", userClassId:"c1", userTeamId:"t1", targetClassId:"c1", targetTeamId:"t2" })).toBe(false); });
  it("tổ trưởng không điểm danh tổ khác", () => expect(canManageAttendanceRecord({ role:"TEAM_LEADER", userClassId:"c1", userTeamId:"t1", targetClassId:"c1", targetTeamId:"t2" })).toBe(false));
  it("cán bộ lớp không được phân quyền", () => expect(canManageClassOfficers("CLASS_MONITOR")).toBe(false));
  it("cán bộ bị từ chối quyền nhạy cảm",()=>{expect(roleMay("event.approve","CLASS_MONITOR")).toBe(false);expect(roleMay("role.assign","TEAM_LEADER")).toBe(false);});
});
