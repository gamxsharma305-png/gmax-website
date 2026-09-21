import { useState } from "react";
import { safeText, safeUrl } from "@/lib/gmax/text";

export function Artwork({
  src,
  title,
  className = "",
}: {
  src?: string;
  title?: string;
  className?: string;
}) {
  const url = safeUrl(src);
  const label = safeText(title, "G").slice(0, 1).toUpperCase() || "G";
  const [failed, setFailed] = useState(!url);

  if (failed) {
    return (
      <div className={`art-fallback overflow-hidden ${className}`} aria-hidden>
        {label}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`overflow-hidden bg-lift object-cover ${className}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
