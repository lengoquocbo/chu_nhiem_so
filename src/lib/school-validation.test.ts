import {describe,expect,it} from "vitest";
import {appointmentConflicts,appointmentIsActive,semesterWithinYear,validDateRange} from "./school-validation";
describe("quy tắc thời gian",()=>{
 it("năm học cần ngày kết thúc sau ngày bắt đầu",()=>{expect(validDateRange(new Date("2026-08-01"),new Date("2027-05-31"))).toBe(true);expect(validDateRange(new Date("2027-05-31"),new Date("2026-08-01"))).toBe(false)});
 it("học kỳ phải nằm trong năm học",()=>{expect(semesterWithinYear(new Date("2026-08-15"),new Date("2027-01-10"),new Date("2026-08-01"),new Date("2027-05-31"))).toBe(true);expect(semesterWithinYear(new Date("2026-07-01"),new Date("2027-01-10"),new Date("2026-08-01"),new Date("2027-05-31"))).toBe(false)});
 it("nhận biết appointment đang hiệu lực và hết hạn",()=>{const now=new Date("2026-09-01");expect(appointmentIsActive(new Date("2026-08-01"),new Date("2026-10-01"),true,now)).toBe(true);expect(appointmentIsActive(new Date("2026-08-01"),new Date("2026-08-31"),true,now)).toBe(false)});
 it("phát hiện hai tổ trưởng trùng hiệu lực",()=>expect(appointmentConflicts([{role:"TEAM_LEADER",teamId:"t1",startDate:new Date("2026-08-01"),endDate:null,active:true}],{role:"TEAM_LEADER",teamId:"t1",startDate:new Date("2026-09-01"),endDate:null})).toBe(true));
});