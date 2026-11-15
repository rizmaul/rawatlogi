import type { AnchorHTMLAttributes } from "react";
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  onNavigate: () => void;
};
/** Preserve browser-native copy-link/new-tab behavior while navigating locally. */
export function AppLink({ onNavigate, onClick, ...props }: Props) {
  return (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return;
        event.preventDefault();
        onNavigate();
      }}
    />
  );
}
