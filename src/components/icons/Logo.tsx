import * as React from "react";

type LogoProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
};

export default function Logo({ title = "ControlPlane Console", ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-label={title}
      role="img"
      {...props}
    >
      <path
        d="M12 2.5c4.3 0 7.8 3.5 7.8 7.8 0 1.4-.4 2.7-1.1 3.9-.3.5-.4 1-.3 1.5l.3 2.2-2.2-.3c-.5-.1-1 .1-1.5.3-1.2.7-2.5 1.1-3.9 1.1-4.3 0-7.8-3.5-7.8-7.8S7.7 2.5 12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.3 12.2c1.3-1.9 2.9-2.8 4.8-2.8 1.3 0 2.4.4 3.4 1.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M8.7 14.6c1.0 1.2 2.2 1.9 3.8 1.9 1.2 0 2.3-.3 3.3-1.0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
