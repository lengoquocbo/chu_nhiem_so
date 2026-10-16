export const OFFICER_POSITION_LABELS: Record<string, string> = {
  class_monitor: "Lớp trưởng",
  vice_monitor_academic: "Lớp phó học tập",
  vice_monitor_labor: "Lớp phó lao động",
  vice_monitor_activity: "Lớp phó văn thể",
  secretary: "Bí thư",
  group_leader: "Tổ trưởng",
};

export const OFFICER_PERMISSION_GROUPS = [
  { label: "Quyền xem", items: [
    { key: "view_class_overview", label: "Xem tổng quan lớp" },
    { key: "view_competition_ranking", label: "Xem xếp hạng toàn lớp" },
    { key: "view_group_ranking", label: "Xem xếp hạng trong tổ" },
  ] },
  { label: "Quyền ghi nhận", items: [
    { key: "record_violation", label: "Ghi nhận vi phạm" },
    { key: "record_achievement", label: "Ghi nhận tuyên dương" },
    { key: "record_academic", label: "Ghi nhận tiêu chí học tập" },
  ] },
  { label: "Kiểm tra và báo cáo", items: [
    { key: "review_officer_records", label: "Xác nhận ghi nhận của cán sự" },
    { key: "approve_scores", label: "Duyệt điểm thay GVCN (chỉ lớp trưởng)" },
    { key: "create_forum_posts", label: "Đăng thông báo lớp" },
    { key: "publish_forum_without_review", label: "Tự đăng không cần GVCN duyệt" },
    { key: "approve_forum_posts", label: "Duyệt thông báo (chỉ lớp trưởng)" },
    { key: "view_weekly_report", label: "Xem tổng hợp tuần" },
  ] },
];

export const DEFAULT_OFFICER_PERMISSIONS: Record<string, string[]> = {
  class_monitor: ["view_class_overview", "view_competition_ranking", "record_violation", "record_achievement", "review_officer_records", "approve_scores", "create_forum_posts", "view_weekly_report"],
  vice_monitor_academic: ["view_class_overview", "view_competition_ranking", "record_academic", "create_forum_posts", "view_weekly_report"],
  group_leader: ["view_group_ranking", "record_violation", "record_achievement", "record_academic", "view_weekly_report"],
};
