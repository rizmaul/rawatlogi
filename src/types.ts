import type { Evidence, Post, Product, RecordItem } from "../shared/model";
export type State = {
  products: RecordItem<Product>[];
  evidence: RecordItem<Evidence>[];
  posts: RecordItem<Post>[];
};
export type Page =
  | "overview"
  | "products"
  | "research"
  | "studio"
  | "calendar"
  | "settings"
  | "post"
  | "postNew";
export type Modal =
  | { kind: "product"; record?: RecordItem<Product> }
  | {
      kind: "evidence";
      record?: RecordItem<Evidence>;
      initial?: Partial<Evidence>;
    }

