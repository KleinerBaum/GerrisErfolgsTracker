import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    height="20"
    viewBox="0 0 24 24"
    width="20"
    {...props}
  >
    {children}
  </svg>
);

const pathProps = {
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
};

export const TodayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6.5h16v13H4zM8 3.5v5M16 3.5v5M4 10.5h16" {...pathProps} />
    <path d="m8.7 15 2.1 2 4.5-4.5" {...pathProps} />
  </Icon>
);

export const PlanIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" {...pathProps} />
    <path d="M8 8h8M8 12h8M8 16h5" {...pathProps} />
  </Icon>
);

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6.5h16v13H4zM8 3.5v5M16 3.5v5M4 10.5h16" {...pathProps} />
  </Icon>
);

export const HubIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z" {...pathProps} />
  </Icon>
);

export const ReflectionIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 4.5h14v15H5zM8 8h8M8 12h8M8 16h4" {...pathProps} />
    <path d="m15.5 15.7.9.9 2-2" {...pathProps} />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" {...pathProps} />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 12.5 4.2 4L19 7" {...pathProps} />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 6 6 6-6 6" {...pathProps} />
  </Icon>
);

export const SparkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3c.7 4.5 2.5 6.3 7 7-4.5.7-6.3 2.5-7 7-.7-4.5-2.5-6.3-7-7 4.5-.7 6.3-2.5 7-7Z" {...pathProps} />
    <path d="M18.5 16.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z" {...pathProps} />
  </Icon>
);

export const MicIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect height="11" rx="3" width="7" x="8.5" y="3" {...pathProps} />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" {...pathProps} />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10.5" cy="10.5" r="6" {...pathProps} />
    <path d="m15 15 5 5" {...pathProps} />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" {...pathProps} />
    <path
      d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.6l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7l-.7-2h-3l-.7 2a7 7 0 0 0-1.6.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.6l-2 .7v3l2 .7c.2.6.4 1.1.7 1.6l-.9 1.9 2.1 2.1 1.9-.9c.5.3 1 .6 1.6.7l.7 2h3l.7-2c.6-.2 1.1-.4 1.7-.7l1.9.9 2.1-2.1-.9-1.9c.3-.5.6-1 .7-1.6l2-.7Z"
      {...pathProps}
    />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 6 12 12M18 6 6 18" {...pathProps} />
  </Icon>
);
