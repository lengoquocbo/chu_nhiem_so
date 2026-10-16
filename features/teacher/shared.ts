export type ToastApi = { show: (m: string, kind?: "success" | "error" | "info") => void };
export const TODAY = () => new Date().toLocaleDateString("en-CA");
export const ATTENDANCE_OPTIONS = [
  { value: "present", label: "Có mặt" },
  { value: "late", label: "Đi muộn" },
  { value: "unexcused_absent", label: "Vắng không phép" },
  { value: "excused_absent", label: "Vắng có phép" },
  { value: "left_early", label: "Về sớm" },
  { value: "skipped", label: "Bỏ tiết" },
];
