import type { Evidence, Post, Product } from "../../shared/model";
import type { State } from "../types";
export const emptyState: State = {
  products: [],
  evidence: [],
  posts: [],
};
export const rupiah = (n: number | null) =>
  n === null
    ? "Price not recorded"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(n);
export const dateTime = (v: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
export const time = (v: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
export const blankProduct: Product = {
  name: "",
  affiliateUrl: "",
  category: "Skincare",
  variant: "",
  manufacturerUrl: "",
  ingredients: "",
  advertisedClaims: "",
  notes: "",
  price: null,
  commission: null,
  confirmed: false,
  imageId: null,
};
export const blankEvidence: Evidence = {
  productId: "",
  title: "",
  url: "",
  sourceId: "",
  year: "",
  authors: "",
  abstract: "",
  access: "abstract",
  studyType: "",
  claim: "",
  limitations: "",
  verdict: "unreviewed",
  approved: false,
};
export const blankPost: Post = {
  productId: "",
  title: "",
  platform: "x",
  segments: [""],
  segmentImages: [],
  area: null,
  evidenceLevel: null,
  series: null,
  sourceIds: [],
  status: "draft",
  scheduledAt: null,
  publishedUrl: "",
  publishedAt: null,
  warnings: [],
};
