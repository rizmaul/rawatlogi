import type { Evidence, Job, Post, Product, RecordItem } from "../shared/model";
import type { TopicSession } from "../shared/sessions";
export type State = {
  products: RecordItem<Product>[];
  evidence: RecordItem<Evidence>[];
  posts: RecordItem<Post>[];
  jobs: Job[];
  sessions: TopicSession[];
};
export type Page =
  | "overview"
  | "products"
  | "research"
  | "studio"
  | "calendar"
  | "settings"
  | "researchNew"
  | "studioNew"
  | "researchSession"
  | "studioSession"
  | "post"
  | "postNew";
export type Modal =
  | { kind: "product"; record?: RecordItem<Product> }
  | {
      kind: "evidence";
      record?: RecordItem<Evidence>;
      initial?: Partial<Evidence>;
    }

