const RANK_COLOR: Record<string, string> = {
  "Tốt": "border-add text-add",
  "Khá": "border-navy text-navy",
  "Đạt": "border-gold text-gold",
  "Chưa đạt": "border-deduct text-deduct",
};

export function ScoreStamp({
  score,
  rankLabel,
  totalAdd,
  totalDeduct,
}: {
  score: number;
  rankLabel?: string | null;
  totalAdd?: number;
  totalDeduct?: number;
}) {
  const ringColor = RANK_COLOR[rankLabel || ""] || "border-navy text-navy";

  return (
    <div className="flex items-center gap-6 py-2">
      <div className={`flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-[3px] ${ringColor}`}>
        <span className="font-serif text-4xl leading-none">{score}</span>
        <span className="mt-1 text-[11px] text-ink-muted">/ 100</span>
      </div>
      <div>
        {rankLabel && <div className={`text-lg font-medium ${ringColor.split(" ")[1]}`}>Xếp loại {rankLabel}</div>}
        {(totalAdd !== undefined || totalDeduct !== undefined) && (
          <div className="mt-1 flex gap-3 text-sm">
            {totalAdd !== undefined && <span className="badge-add">+{totalAdd} cộng</span>}
            {totalDeduct !== undefined && <span className="badge-deduct">-{totalDeduct} trừ</span>}
          </div>
        )}
      </div>
    </div>
  );
}
