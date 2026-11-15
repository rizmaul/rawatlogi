import { Search } from "lucide-react";
import { Empty } from "../components/ui";
export function NotFoundPage() {
  return (
    <section className="panel">
      <Empty
        title="This page isn’t in your notebook"
        icon={Search}
        action={
          <a className="secondary" href="/">
            Return to workspace
          </a>
        }
      >
        Check the address or use the navigation to find your content.
      </Empty>
    </section>
  );
}
