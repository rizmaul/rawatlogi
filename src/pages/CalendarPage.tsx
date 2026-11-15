import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from "lucide-react";
import { jakartaDay } from "../../shared/model";
import { Pagination, usePaged } from "../components/Pager";
import type { Workspace } from "../hooks/useWorkspace";
import { time } from "../lib/data";

export function CalendarPage({ workspace }: { workspace: Workspace }) {
  const {
    state,
    setModal,
    filter,
    month,
    setMonth,
    platform,
    setPlatform,
    newPost,
    postCard,
  } = workspace;
  const unscheduled = state.posts.filter(
    (p) =>
      !p.data.scheduledAt &&
      (platform === "all" || p.data.platform === platform),
  );
  const unscheduledPage = usePaged(unscheduled, 10, platform);
  const monthKey = month.toISOString().slice(0, 7);
  const monthPosts = state.posts
    .filter(
      (p) =>
        p.data.scheduledAt &&
        jakartaDay(p.data.scheduledAt).startsWith(monthKey) &&
        (platform === "all" || p.data.platform === platform),
    )
    .sort((a, b) => a.data.scheduledAt!.localeCompare(b.data.scheduledAt!));
  return (
    <>
      <div className="calendar-toolbar">
        <div className="row">
          <h2>
            {month.toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h2>
          <div className="row">
            <button
              className="icon-btn"
              aria-label="Previous month"
              onClick={() =>
                setMonth(
                  new Date(
                    Date.UTC(
                      month.getUTCFullYear(),
                      month.getUTCMonth() - 1,
                      1,
                    ),
                  ),
                )
              }
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="icon-btn"
              aria-label="Next month"
              onClick={() =>
                setMonth(
                  new Date(
                    Date.UTC(
                      month.getUTCFullYear(),
                      month.getUTCMonth() + 1,
                      1,
                    ),
                  ),
                )
              }
            >
              <ChevronRight size={19} />
            </button>
          </div>
          <button
            className="secondary"
            onClick={() =>
              setMonth(
                new Date(
                  jakartaDay(new Date().toISOString()).slice(0, 7) +
                    "-01T00:00:00Z",
                ),
              )
            }
          >
            Today
          </button>
        </div>
        <div className="row">
          <select
            aria-label="Filter calendar platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="all">All platforms</option>
            <option value="x">X</option>
            <option value="threads">Threads</option>
          </select>
          <button
            className="primary"
            disabled={!state.products.length}
            onClick={() => newPost()}
          >
            <Plus size={16} />
            Add post
          </button>
        </div>
      </div>
      <div className="calendar-legend">
        <span>
          <i className="legend-dot draft" />
          Draft
        </span>
        <span>
          <i className="legend-dot approved" />
          Approved
        </span>
        <span>
          <i className="legend-dot published" />
          Published
        </span>
        <span className="push">
          <Clock size={14} />
          WIB
        </span>
      </div>
      <div className="calendar">
        <div className="weekdays">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: 42 }, (_, i) => {
            const first = new Date(month);
            const offset = (first.getUTCDay() + 6) % 7;
            const d = new Date(
              Date.UTC(
                month.getUTCFullYear(),
                month.getUTCMonth(),
                i - offset + 1,
              ),
            );
            const key = d.toISOString().slice(0, 10);
            const dayPosts = state.posts.filter(
              (p) =>
                p.data.scheduledAt &&
                jakartaDay(p.data.scheduledAt) === key &&
                (platform === "all" || p.data.platform === platform),
            );
            return (
              <div
                key={key}
                className={
                  "calendar-day " +
                  (d.getUTCMonth() !== month.getUTCMonth() ? "outside " : "") +
                  (key === jakartaDay(new Date().toISOString()) ? "today" : "")
                }
              >
                <button
                  className="day-number"
                  aria-label={"Add post on " + key}
                  disabled={!state.products.length}
                  onClick={() => newPost(key)}
                >
                  {d.getUTCDate()}
                </button>
                {dayPosts.map((p) => (
                  <button
                    className={"calendar-event " + p.data.status}
                    key={p.id}
                    onClick={() => workspace.openPost(p.id)}
                  >
                    <span>
                      {p.data.platform === "x" ? "𝕏" : "@"}{" "}
                      <small>{time(p.data.scheduledAt!)}</small>
                    </span>
                    <strong>{p.data.title}</strong>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {/* Phones: the grid shows dots only; this list carries the month's posts. */}
      <div className="calendar-agenda">
        <div className="section-title">
          <h2>
            This month <span className="count">{monthPosts.length}</span>
          </h2>
        </div>
        {monthPosts.length ? (
          <div className="data-list">{monthPosts.map(postCard)}</div>
        ) : (
          <p className="muted">Nothing scheduled this month.</p>
        )}
      </div>
      <div className="section-title">
        <h2>
          Unscheduled <span className="count">{unscheduled.length}</span>
        </h2>
      </div>
      {unscheduled.length ? (
        <div className="data-list">{unscheduledPage.items.map(postCard)}</div>
      ) : (
        <p className="muted">No unscheduled posts.</p>
      )}
      <Pagination {...unscheduledPage} label="Unscheduled post pages" />
    </>
  );
}
