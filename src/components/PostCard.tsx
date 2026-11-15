import type { Post, RecordItem } from "../../shared/model";
import { dateTime } from "../lib/data";
import { Tag } from "./ui";
export function PostCard({
  record: p,
  productName,
  onClick,
}: {
  record: RecordItem<Post>;
  productName: string;
  onClick: () => void;
}) {
  return (
    <button className="data-row" onClick={onClick}>
      <span className={"platform small " + p.data.platform}>
        {p.data.platform === "x" ? "𝕏" : "@"}
      </span>
      <span className="grow">
        <span className="title">{p.data.title}</span>
        <span className="sub">{p.data.segments[0]}</span>
      </span>
      <span className="meta hide-sm">{productName}</span>
      <span className="meta">
        {p.data.scheduledAt ? dateTime(p.data.scheduledAt) : "—"}
      </span>
      <Tag
        tone={
          p.data.status === "published"
            ? "green"
            : p.data.status === "approved"
              ? "blue"
              : "neutral"
        }
      >
        {p.data.status}
      </Tag>
    </button>
  );
}
