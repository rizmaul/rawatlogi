import type { Evidence, Product, RecordItem } from "../../../shared/model";
import type { State } from "../../types";
export type RecordFormContext = {
  data: any;
  set: (key: string, value: any) => void;
  readOnly: boolean;
  state: State;
  sources: RecordItem<Evidence>[];
  product: RecordItem<Product> | undefined;
  copy: (text: string) => Promise<void>;
  editing: boolean;
  setImageUploading: (busy: boolean) => void;
  trackImage?: (id: string) => void;
  // Saved post only: copy a request for Claude to design this segment's image.
  askClaude?: (segmentIndex?: number) => void;
};
